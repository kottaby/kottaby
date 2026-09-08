/**
 * SubscriptionPurchaseService — the purchase flow for subscription plans
 * through the provider-agnostic payment-gateway port, and the owner-scoped
 * purchase listing.
 *
 * `purchase` composes four stages in a fixed order:
 *
 *   1. the pre-DB boundary: the caller id and plan selector are positive
 *      safe integers, the acting student's governance state is re-asserted
 *      (deleted/blocked/suspended callers are denied), and the idempotency
 *      key must be present and within the claim column's length — the key
 *      is carried verbatim (never trimmed, never coerced, never logged);
 *   2. the gateway checkout, OUTSIDE any database transaction — a provider
 *      call is a network boundary and must never hold a transaction open.
 *      The plan row feeding the checkout input (price + currency, carried
 *      verbatim as decimal strings) is read before the gateway call;
 *   3. ONE transaction that owns the authoritative validation and every
 *      write: the plan is re-validated as active (the pre-checkout read is
 *      only a gateway-input lookup — a plan deactivated mid-checkout fails
 *      the purchase), the fresh plan row's price/currency are re-compared
 *      against the values the checkout was created with (a price or
 *      currency change mid-checkout would otherwise commit a pair whose
 *      settlement is guaranteed to quarantine), the actor's governance
 *      state is re-asserted (a suspension during checkout fails the
 *      purchase), a NULL balance lane fails the purchase closed (a
 *      lane is never guessed from plan copy), the idempotency claim is
 *      inserted savepoint-bracketed (a duplicate key poisons only the
 *      savepoint and keeps the transaction readable for the replay
 *      lookup), and the pending subscription + pending payment +
 *      student-junction rows commit atomically with the claim's
 *      subscription backfill. Any failure rolls the whole purchase back,
 *      which also releases the claim — a failed purchase never burns its
 *      key.
 *
 * On a duplicate claim key the flow REPLAYS BY THROWING
 * (`ConflictError("DUPLICATE_REQUEST")` — never a row): throwing is what
 * keeps the replayed attempt free of charge, its own partial writes roll
 * back with the transaction. A key spent by a DIFFERENT caller is denied
 * with the oracle-safe payment-not-found error — another user's claim is
 * never surfaced. A gateway payment reference that already identifies a
 * subscription is a conflict (the provider minted the same reference
 * twice); it is translated from the reference unique-violation, never
 * leaked as a raw driver error.
 *
 * The purchaser identity comes exclusively from the caller's argument
 * (context-resolved server-side); the amount and currency come
 * exclusively from the plan row. Client-supplied fields beyond the plan
 * selector are ignored — the strict purchase whitelist. The payment
 * amount is carried verbatim from the plan price: never a number, never
 * arithmetic, never client-derived.
 *
 * `listOwn` is the owner-scoped read: a single predicate on the caller's
 * own rows, newest first. There is no id-addressed read on this surface.
 */

import {
  PlanRepository,
  StudentPaymentRepository,
  SubscriptionPurchaseIdempotencyRepository,
  SubscriptionRepository,
} from "@/backend/db/repo";
import { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, isPgUniqueViolation, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { getPaymentGateway } from "@/backend/services/billing/payment-gateway/payment-gateway.factory";
import { assertActorGovernanceClean } from "@/backend/services/classes/session-lifecycle.governance";
import type {
  DBQueryExecutor,
  DBTransaction,
  PaymentCheckoutSession,
  PlanSelectType,
  PurchaseSubscriptionReturnType,
  PurchaseSubscriptionSubmitInput,
  StudentPaymentSelectType,
  SubscriptionPurchaseIdempotencySelectType,
  SubscriptionReturnType,
  SubscriptionSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** The idempotency claim column's maximum key length (varchar(128) backstop). */
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * The client-safe conflict copy for an internal row-mapping breach — the
 * activation service's `abortActivation` discipline mirrored: the exact
 * breach belongs to the adjacent correlated log line, never to the thrown
 * message, because a `listOwn` mapping conflict surfaces through
 * `mySubscriptions` to the owning student (the wire copy must stay generic).
 */
const PAYMENT_PROCESSING_CONFLICT_MESSAGE = "Payment could not be processed.";

/** The localized errors bundle shape consumed by every flow in this file. */
type ErrorsTranslations = ReturnType<typeof getServerTranslations>["errorsTranslations"];

/** Positive safe-integer guard for caller-supplied identifiers (no casts). */
function isPositiveSafeId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * The carryable-key check: a claimable idempotency key is present and
 * within the claim column's length. An absent key is a validation reject
 * BEFORE any database work (the claim insert would otherwise fail on a
 * NOT NULL or an over-length value deep inside the transaction). The key
 * is never trimmed — an opaque value is carried verbatim.
 */
function isCarryableIdempotencyKey(key: string | null): key is string {
  return key !== null && key.length > 0 && key.length <= MAX_IDEMPOTENCY_KEY_LENGTH;
}

/**
 * The subscription-status vocabulary, widened to plain strings: the stored
 * row's `status` is the raw pg-enum string union, so the mapping compares
 * against the enum member's string identity — the vocabulary still flows
 * from the enum, never from a bare literal (the session-lifecycle guard
 * idiom).
 */
const STATUS_ACTIVE: string = SubscriptionStatus.Active;
const STATUS_PENDING: string = SubscriptionStatus.Pending;
const STATUS_EXPIRED: string = SubscriptionStatus.Expired;
const STATUS_CANCELLED: string = SubscriptionStatus.Cancelled;
const STATUS_SUSPENDED: string = SubscriptionStatus.Suspended;

/**
 * Maps a stored subscription status onto the strongly-typed enum — the
 * ReturnType's enum contract is explicit, never a cast. FAIL-CLOSED over
 * the closed pg-enum vocabulary: every writable member is mapped explicitly
 * (suspended included), and an unknown stored value is an internal
 * invariant breach that throws the client-safe conflict copy instead of
 * silently degrading to a WRONG state (loud over silent-wrong — the same
 * discipline as `paymentGatewayOf` below; unreachable through the pgEnum).
 */
function subscriptionStatusOf(status: SubscriptionSelectType["status"]): SubscriptionStatus {
  if (status === STATUS_ACTIVE) {
    return SubscriptionStatus.Active;
  }
  if (status === STATUS_PENDING) {
    return SubscriptionStatus.Pending;
  }
  if (status === STATUS_EXPIRED) {
    return SubscriptionStatus.Expired;
  }
  if (status === STATUS_CANCELLED) {
    return SubscriptionStatus.Cancelled;
  }
  if (status === STATUS_SUSPENDED) {
    return SubscriptionStatus.Suspended;
  }
  logger.error(
    "Subscription purchase row mapping aborted: stored subscription status is not a member of the closed status vocabulary",
    {
      storedStatus: status,
    }
  );
  throw new ConflictError(PAYMENT_PROCESSING_CONFLICT_MESSAGE);
}

/**
 * Maps a stored payment-gateway value onto the strongly-typed enum — an
 * identity projection over the closed pg-enum vocabulary, resolved as the
 * documented widening-cast lookup. FAIL-CLOSED: a stored value outside the
 * vocabulary is an internal invariant breach (the DB enum constrains every
 * writable value); it aborts with ONE correlated diagnostic log plus the
 * client-safe conflict copy (the activation service's `abortActivation`
 * discipline — see `PAYMENT_PROCESSING_CONFLICT_MESSAGE`) instead of
 * silently degrading to a different gateway than the ledger recorded.
 */
function paymentGatewayOf(gateway: SubscriptionSelectType["paymentMethod"] & string): PaymentGateway {
  const member = Object.values(PaymentGateway).find(value => (value as string) === gateway);
  if (member === undefined) {
    logger.error(
      "Subscription purchase row mapping aborted: stored payment gateway is not a member of the closed gateway vocabulary",
      {
        storedGateway: gateway,
      }
    );
    throw new ConflictError(PAYMENT_PROCESSING_CONFLICT_MESSAGE);
  }
  return member;
}

/**
 * Projects one stored subscription row onto the strongly-typed ReturnType
 * (the raw row carries pg-enum string unions; the owned mapping makes the
 * enum contract explicit, never a cast).
 */
function toOwnedSubscriptionRow(row: SubscriptionSelectType): SubscriptionReturnType {
  return {
    ...row,
    status: subscriptionStatusOf(row.status),
    paymentMethod: row.paymentMethod === null ? null : paymentGatewayOf(row.paymentMethod),
  };
}

/**
 * Resolves a duplicate-claim purchase into its replay outcome.
 *
 * Every same-caller duplicate — a claim with or without its subscription
 * pointer, and a vanished claim (fail-closed) — surfaces the
 * duplicate-replay conflict. THROWING (never returning a row) is what
 * makes a replay free of charge: this attempt's own partial writes roll
 * back with the transaction, so the replay commits zero new rows. A key
 * spent by a DIFFERENT caller is denied with the oracle-safe
 * payment-not-found error — another user's claim is never surfaced.
 */
async function replayPurchaseOrThrow(
  idempotencyKey: string,
  callerStudentId: number,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<never> {
  const claim = await SubscriptionPurchaseIdempotencyRepository.findByKey(idempotencyKey, tx);
  if (claim !== null && claim.userId !== callerStudentId) {
    // Entity vocabulary: the id attributed here is a USERS id (the caller
    // whose key was probed), so the tag is "users" — never a subscription
    // tag under a user id.
    logger.logDomainError("Subscription purchase replay denied: key claimed by another caller", {
      code: "PAYMENT_NOT_FOUND",
      entity: "users",
      entityId: callerStudentId,
    });
    throw new NotFoundError("PAYMENT", t.notFound);
  }
  // No id is attributable yet (the replayed claim has produced no
  // subscription row for THIS attempt), so the tag carries the surface only.
  logger.logDomainError("Subscription purchase replay blocked: key already claimed", {
    code: "DUPLICATE_REQUEST",
    entity: "subscriptions",
  });
  throw new ConflictError("DUPLICATE_REQUEST", t.duplicateRequest);
}

/**
 * The authoritative re-validation inside the purchase transaction: the
 * pre-checkout plan read only fed the gateway input — THIS read decides
 * the purchase. The lane check fails closed: a plan whose balance lane was
 * never configured is not purchasable, and a lane is never guessed from
 * plan copy.
 *
 * @returns The active, lane-configured plan row the purchase commits
 *     against.
 */
async function assertPurchasablePlan(
  planId: number,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<PlanSelectType> {
  const activePlan = await PlanRepository.findActiveById(planId, tx);
  if (activePlan === null) {
    logger.logDomainError("Subscription purchase rejected: plan is not purchasable", {
      code: "PLAN_NOT_FOUND",
      entity: "plans",
      entityId: planId,
    });
    throw new NotFoundError("PLAN", t.subscriptionPurchase.planNotPurchasable);
  }
  if (activePlan.balanceLane === null) {
    logger.logDomainError("Subscription purchase rejected: plan balance lane is not configured", {
      code: "PLAN_LANE_UNCONFIGURED",
      entity: "plans",
      entityId: activePlan.id,
    });
    throw new ValidationError("PLAN_LANE_UNCONFIGURED", t.subscriptionPurchase.planLaneUnconfigured);
  }
  return activePlan;
}

/**
 * The idempotency claim — savepoint-bracketed so a duplicate key poisons
 * only the savepoint, keeping the transaction readable for the replay
 * lookup. A duplicate key never returns: the flow replays by throwing
 * through `replayPurchaseOrThrow` (a non-duplicate failure surfaces
 * untouched, so the transaction rolls the whole purchase — claim
 * included — back together).
 */
async function insertClaimOrReplay(
  studentUserId: number,
  idempotencyKey: string,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<SubscriptionPurchaseIdempotencySelectType> {
  try {
    return await tx.transaction(claimTx =>
      SubscriptionPurchaseIdempotencyRepository.insertClaim({ idempotencyKey, userId: studentUserId }, claimTx)
    );
  } catch (error) {
    if (!isPgUniqueViolation(error)) {
      throw error;
    }
    return replayPurchaseOrThrow(idempotencyKey, studentUserId, tx, t);
  }
}

/**
 * The pending subscription insert with the reference-collision
 * translation: the gateway checkout descriptor is carried verbatim (the
 * provider member becomes the payment method, the provider-minted
 * reference the payment reference) and the lifecycle state defaults to
 * `pending` at the database. A reference collision (the provider minted
 * the same reference for two purchases) becomes a conflict — the raw
 * driver error never escapes.
 */
async function insertPendingSubscription(
  studentUserId: number,
  planId: number,
  checkout: PaymentCheckoutSession,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<SubscriptionSelectType> {
  try {
    return await SubscriptionRepository.insertSubscription(
      {
        userId: studentUserId,
        planId,
        paymentMethod: checkout.provider,
        paymentReference: checkout.providerReference,
      },
      tx
    );
  } catch (error) {
    if (!isPgUniqueViolation(error)) {
      throw error;
    }
    // Entity vocabulary: the only attributable id here is the PLAN row the
    // checkout was priced from — the colliding subscription row never
    // existed (its insert failed), so a plans id rides the "plans" tag.
    logger.logDomainError("Subscription purchase rejected: payment reference already claimed", {
      code: "CONFLICT",
      entity: "plans",
      entityId: planId,
    });
    throw new ConflictError(t.subscriptionPurchase.paymentReferenceConflict, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Re-compares the FRESH in-transaction plan row against the price/currency
 * the gateway checkout was created with (both carried verbatim from the
 * pre-checkout plan read). An admin price or currency change between the
 * checkout creation and this transaction would otherwise commit a pending
 * pair whose stored amount disagrees with the amount the provider actually
 * charged — a settlement guaranteed to quarantine. The mismatch is the
 * generic localized validation denial (machine code `PLAN_PRICE_CHANGED`,
 * field `planId`) thrown BEFORE any row write, so the transaction rolls
 * back with nothing to release.
 *
 * The abandoned checkout session needs no compensation inside this flow:
 * the built-in mock provider is stateless (a checkout is a pure descriptor
 * mint — no provider-side session exists to void). A stateful provider
 * integration owns its own abandoned-session compensation out-of-band.
 */
function assertPlanUnchangedSinceCheckout(
  freshPlan: PlanSelectType,
  checkoutAmount: string,
  checkoutCurrency: string,
  t: ErrorsTranslations
): void {
  if (freshPlan.price === checkoutAmount && freshPlan.currency === checkoutCurrency) {
    return;
  }
  logger.logDomainError("Subscription purchase rejected: plan price or currency changed during checkout", {
    code: "PLAN_PRICE_CHANGED",
    entity: "plans",
    entityId: freshPlan.id,
  });
  throw new ValidationError(t.validation, [{ field: "planId", code: "PLAN_PRICE_CHANGED", message: t.validation }]);
}

/**
 * The purchase transaction body — the fixed, never reordered write order
 * (active-plan + lane re-validation → checkout-value re-comparison →
 * governance re-assertion → savepoint-bracketed idempotency claim →
 * pending subscription insert → pending payment insert → student junction
 * insert → claim backfill). Any failure rolls the whole purchase back,
 * which also releases the claim (a failed purchase never burns its key).
 */
async function purchaseInTx(
  studentUserId: number,
  planId: number,
  checkoutAmount: string,
  checkoutCurrency: string,
  checkout: PaymentCheckoutSession,
  idempotencyKey: string,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<PurchaseSubscriptionReturnType> {
  const activePlan = await assertPurchasablePlan(planId, tx, t);

  // The checkout was priced from the PRE-transaction plan read; the pair is
  // only committable when the fresh row still agrees with it. Thrown before
  // ANY row write — the rollback discards the checkout session with zero
  // rows written (see the helper's docblock on session compensation).
  assertPlanUnchangedSinceCheckout(activePlan, checkoutAmount, checkoutCurrency, t);

  // Governance re-assertion INSIDE the transaction: the pre-checkout check
  // read the actor before the gateway round-trip, so a caller deleted,
  // blocked, or suspended during checkout fails the whole purchase here —
  // the pair rolls back together with the claim.
  await assertActorGovernanceClean(studentUserId, t, tx);

  const claim = await insertClaimOrReplay(studentUserId, idempotencyKey, tx, t);

  const createdSubscription = await insertPendingSubscription(studentUserId, activePlan.id, checkout, tx, t);

  // The pending payment — amount and currency are the plan row's values
  // carried verbatim (decimal string, ISO code): never client-derived,
  // never arithmetic. The lifecycle state defaults to `pending`.
  const createdPayment: StudentPaymentSelectType = await StudentPaymentRepository.insertPayment(
    {
      studentId: studentUserId,
      subscriptionId: createdSubscription.id,
      amount: activePlan.price,
      currency: activePlan.currency,
      paymentGateway: checkout.provider,
    },
    tx
  );

  // The student↔subscription junction — same student, same transaction.
  await tx.insert(studentSubscriptions).values({ studentId: studentUserId, subscriptionId: createdSubscription.id });

  // Backfill the claim's subscription pointer in the same transaction —
  // the claim and the purchase commit atomically.
  await SubscriptionPurchaseIdempotencyRepository.updateClaimSubscriptionId(claim.id, createdSubscription.id, tx);

  return {
    subscription: {
      ...createdSubscription,
      status: SubscriptionStatus.Pending,
      paymentMethod: checkout.provider,
    },
    payment: {
      ...createdPayment,
      status: PaymentStatus.Pending,
      paymentGateway: checkout.provider,
    },
    checkout,
  };
}

export namespace SubscriptionPurchaseService {
  /**
   * Purchases a subscription plan for the acting student.
   *
   * The pre-DB boundary rejects malformed identifiers, a governed caller,
   * and a missing/over-length idempotency key BEFORE any database work.
   * The gateway checkout runs outside every transaction (a network call
   * never holds a transaction open); the plan row feeding the checkout
   * input is read first so the provider receives the verbatim price and
   * currency. Inside one transaction the plan's active state and balance
   * lane are re-validated (fail-closed), the fresh plan row's price and
   * currency are re-compared against the checkout's captured values (a
   * mid-checkout price or currency change fails the purchase before any
   * row write), the actor's governance state is re-asserted (a suspension
   * during checkout rolls the pair back), the idempotency claim is
   * inserted savepoint-bracketed, and the pending subscription + pending
   * payment + junction rows commit atomically with the claim's
   * subscription backfill.
   *
   * On a duplicate claim key the flow REPLAYS BY THROWING: every
   * same-caller duplicate — a claim with or without its subscription
   * pointer, and a vanished claim (fail-closed) — surfaces the
   * `ConflictError("DUPLICATE_REQUEST")` conflict; this attempt's own
   * partial writes roll back with the transaction, so the replay commits
   * zero new rows. A key spent by a DIFFERENT caller is denied with the
   * oracle-safe payment-not-found error — another user's claim is never
   * surfaced.
   *
   * @param studentUserId  The acting student's id (context-resolved
   *     server-side by the caller; shared PK with the users table).
   * @param input  The client-controlled purchase whitelist (the plan
   *     selector only — every other purchase attribute is server-owned).
   * @param idempotencyKey  The captured request idempotency key, carried
   *     verbatim (never trimmed, never coerced, never logged), or null
   *     when the transport supplied none.
   * @param locale  Active request locale (for the localized error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it; production callers omit it
   *     and the service opens its own transaction.
   * @returns The pending subscription/payment pair plus the checkout
   *     descriptor for a FIRST purchase; a replay never returns — it
   *     throws `ConflictError("DUPLICATE_REQUEST")`.
   */
  export async function purchase(
    studentUserId: number,
    input: PurchaseSubscriptionSubmitInput,
    idempotencyKey: string | null,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<PurchaseSubscriptionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Pre-DB boundary validation — fail before any database work.
    if (!isPositiveSafeId(studentUserId) || !isPositiveSafeId(input.planId)) {
      throw new ValidationError(t.validation);
    }

    // Governance re-check — the acting student must be governance-clean.
    await assertActorGovernanceClean(studentUserId, t, outerTx);

    if (!isCarryableIdempotencyKey(idempotencyKey)) {
      // Entity vocabulary: the attributed id is the caller's USERS id — a
      // user id rides the "users" tag, never a subscription tag.
      logger.logDomainError("Subscription purchase rejected: idempotency key required", {
        code: "VALIDATION",
        entity: "users",
        entityId: studentUserId,
      });
      throw new ValidationError(t.subscriptionPurchase.idempotencyKeyRequired);
    }

    // The plan read feeding the checkout input — active-only, outside the
    // transaction (a missing or deactivated plan never reaches the
    // gateway). The authoritative re-validation runs inside the purchase
    // transaction below.
    const plan = await PlanRepository.findActiveById(input.planId);
    if (plan === null) {
      logger.logDomainError("Subscription purchase rejected: plan is not purchasable", {
        code: "PLAN_NOT_FOUND",
        entity: "plans",
        entityId: input.planId,
      });
      throw new NotFoundError("PLAN", t.subscriptionPurchase.planNotPurchasable);
    }

    // Gateway checkout BEFORE the transaction — the provider call is a
    // network boundary. The amount/currency pair is the plan row's own,
    // carried verbatim; the client cannot influence either. Both values are
    // captured here so the in-transaction body can re-compare them against
    // the fresh plan row before committing anything.
    const gateway = getPaymentGateway(locale);
    const checkout = await gateway.createCheckout({
      studentId: studentUserId,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency,
    });

    return withTransaction(outerTx, tx =>
      purchaseInTx(studentUserId, input.planId, plan.price, plan.currency, checkout, idempotencyKey, tx, t)
    );
  }

  /**
   * Lists the caller's own subscriptions, newest first
   * (`created_at DESC`). The owner predicate IS the read scope — there is
   * no id-addressed read on this surface, and another caller's rows are
   * unreachable by construction. Rows are mapped onto the strongly-typed
   * ReturnType before they cross the boundary.
   *
   * @param studentUserId  The acting student's id (shared PK with the
   *     users table).
   * @param locale  Optional request locale (tolerated for symmetry with
   *     the mutation surface; the read itself has no localized error
   *     paths beyond the identifier guard).
   * @param tx  Optional transaction or query executor — propagated to the
   *     repository read so a caller-owned atomic flow stays atomic.
   */
  export async function listOwn(
    studentUserId: number,
    locale?: string,
    tx?: DBQueryExecutor
  ): Promise<SubscriptionReturnType[]> {
    const t = getServerTranslations(locale ?? "en").errorsTranslations;

    // Pre-DB identifier guard — a malformed caller id is the canonical
    // VALIDATION denial, never a SQL round-trip.
    if (!isPositiveSafeId(studentUserId)) {
      throw new ValidationError(t.validation);
    }

    const rows = await SubscriptionRepository.listByUserId(studentUserId, tx);
    return rows.map(toOwnedSubscriptionRow);
  }
}
