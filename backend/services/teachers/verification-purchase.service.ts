/**
 * VerificationPurchaseService — the teacher-applicant purchase flow for the
 * platform-owned teacher-verification plan (a 5-session catalog plan),
 * routed through the SAME money pipeline as student purchases: plan catalog
 * → gateway checkout → pending subscription + pending payment + idempotency
 * claim, all composed with the applicant-lifecycle contract.
 *
 * `purchase` composes fixed stages:
 *
 *   1. the pre-DB boundary: the caller id is a positive safe integer, the
 *      acting user's governance state is re-asserted (deleted/blocked/
 *      suspended callers are denied), and the idempotency key must be
 *      present and within the claim column's length — the key is carried
 *      verbatim (never trimmed, never coerced, never logged);
 *   2. the plan resolution — SERVER-SIDE from the ACTIVE plan catalog by
 *      the canonical verification-plan title; the caller supplies no plan
 *      id and cannot influence which plan (or which price) is purchased. A
 *      missing active plan fails the purchase BEFORE any gateway call or
 *      database write;
 *   3. the gateway checkout, OUTSIDE any database transaction — a provider
 *      call is a network boundary and must never hold a transaction open.
 *      The plan row feeding the checkout input (price + currency, carried
 *      verbatim as decimal strings) is read before the gateway call — on
 *      the caller's transaction when `outerTx` is supplied, otherwise a
 *      bare pool read;
 *   4. ONE transaction that owns the authoritative validation and every
 *      write: the plan is re-validated as active (the pre-checkout read
 *      only fed the gateway input), the applicant lifecycle guard runs
 *      INSIDE the transaction before any write (cooldown + certification —
 *      a cooldown that activates or a certification that lands during
 *      checkout fails the purchase here), the idempotency claim is
 *      inserted savepoint-bracketed, the pending subscription and the
 *      pending payment commit atomically with the attempt ledger and the
 *      guarded applicant status flip, and the claim's subscription
 *      backfill closes the unit. Any failure rolls the whole purchase
 *      back, which also releases the claim — a failed purchase never
 *      burns its key.
 *
 * The payment row's owner is NULL: the purchaser is an applicant (a user
 * with an `applicants` row and no `students` row), so no student-junction
 * insert is ever attempted and no `students` row is touched. Money
 * (amount + currency) is carried verbatim from the plan row read inside
 * the transaction — never a number, never arithmetic, never client-derived.
 *
 * On a duplicate claim key the flow REPLAYS BY THROWING
 * (`ConflictError("DUPLICATE_REQUEST")` — never a row): throwing is what
 * keeps the replayed attempt free of charge, its own partial writes roll
 * back with the transaction. A key spent by a DIFFERENT caller is denied
 * with the oracle-safe payment-not-found error — another user's claim is
 * never surfaced.
 *
 * The purchaser identity comes exclusively from the caller's argument
 * (context-resolved server-side); there is no client input object at all.
 */

import {
  ApplicantRepository,
  PlanRepository,
  StudentPaymentRepository,
  SubscriptionPurchaseIdempotencyRepository,
  SubscriptionRepository,
} from "@/backend/db/repo";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, isPgUniqueViolation, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { getPaymentGateway } from "@/backend/services/billing/payment-gateway/payment-gateway.factory";
import { isCarryableIdempotencyKey, isPositiveSafeId } from "@/backend/services/billing/purchase-guards.helpers";
import { assertActorGovernanceClean } from "@/backend/services/classes/session-lifecycle.governance";
import { ApplicantLifecycleService } from "@/backend/services/teachers/applicant-lifecycle.service";
import type {
  ApplicantSelectType,
  DBTransaction,
  PaymentCheckoutSession,
  PurchaseSubscriptionReturnType,
  StudentPaymentSelectType,
  SubscriptionPurchaseIdempotencySelectType,
  SubscriptionSelectType,
} from "@/backend/types";
import { VERIFICATION_PLAN_TITLE } from "@/shared/constants/verification-plan.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * The client-safe conflict copy for an internal invariant breach — the
 * purchase service's row-mapping discipline mirrored: the exact breach
 * belongs to the adjacent correlated log line, never to the thrown
 * message, because a purchase denial surfaces through the GraphQL
 * boundary to the calling applicant (the wire copy must stay generic).
 */
const PURCHASE_PROCESSING_CONFLICT_MESSAGE = "Purchase could not be processed.";

/** The localized errors bundle shape consumed by every flow in this file. */
type ErrorsTranslations = ReturnType<typeof getServerTranslations>["errorsTranslations"];

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
  callerUserId: number,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<never> {
  const claim = await SubscriptionPurchaseIdempotencyRepository.findByKey(idempotencyKey, tx);
  if (claim !== null && claim.userId !== callerUserId) {
    // Entity vocabulary: the id attributed here is a USERS id (the caller
    // whose key was probed), so the tag is "users" — never a subscription
    // tag under a user id.
    logger.logDomainError("Verification purchase replay denied: key claimed by another caller", {
      code: "PAYMENT_NOT_FOUND",
      entity: "users",
      entityId: callerUserId,
    });
    throw new NotFoundError("PAYMENT", t.notFound);
  }
  // No id is attributable yet (the replayed claim has produced no
  // subscription row for THIS attempt), so the tag carries the surface only.
  logger.logDomainError("Verification purchase replay blocked: key already claimed", {
    code: "DUPLICATE_REQUEST",
    entity: "subscriptions",
  });
  throw new ConflictError("DUPLICATE_REQUEST", t.duplicateRequest);
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
  applicantUserId: number,
  idempotencyKey: string,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<SubscriptionPurchaseIdempotencySelectType> {
  try {
    return await tx.transaction(claimTx =>
      SubscriptionPurchaseIdempotencyRepository.insertClaim({ idempotencyKey, userId: applicantUserId }, claimTx)
    );
  } catch (error) {
    if (!isPgUniqueViolation(error)) {
      throw error;
    }
    return replayPurchaseOrThrow(idempotencyKey, applicantUserId, tx, t);
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
  applicantUserId: number,
  planId: number,
  checkout: PaymentCheckoutSession,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<SubscriptionSelectType> {
  try {
    return await SubscriptionRepository.insertSubscription(
      {
        userId: applicantUserId,
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
    logger.logDomainError("Verification purchase rejected: payment reference already claimed", {
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
 * The purchase transaction body — the fixed, never reordered write order
 * (active-plan re-validation → applicant lifecycle guard → savepoint-
 * bracketed idempotency claim → applicant-row read for the transition
 * decision → pending subscription insert → pending payment insert with a
 * NULL owner → re-application attempt increment for a `failed` re-applier
 * → guarded `pending|failed → in_evaluation` flip → claim backfill). Any
 * failure rolls the whole purchase back, which also releases the claim
 * (a failed purchase never burns its key).
 */
async function purchaseInTx(
  applicantUserId: number,
  planId: number,
  checkout: PaymentCheckoutSession,
  idempotencyKey: string,
  locale: string,
  tx: DBTransaction,
  t: ErrorsTranslations
): Promise<PurchaseSubscriptionReturnType> {
  // The authoritative plan re-read — the pre-checkout catalog scan only fed
  // the gateway input; THIS read decides the purchase. A plan deactivated
  // mid-checkout fails the purchase closed before any row write.
  const activePlan = await PlanRepository.findActiveById(planId, tx);
  if (activePlan === null) {
    logger.logDomainError("Verification purchase rejected: plan is not purchasable", {
      code: "PLAN_NOT_FOUND",
      entity: "plans",
      entityId: planId,
    });
    throw new NotFoundError("PLAN", t.subscriptionPurchase.planNotPurchasable);
  }

  // The applicant lifecycle guard INSIDE the transaction, BEFORE any write:
  // a missing applicants row, an active cooldown, and a certified applicant
  // are all rejected here — the pre-checkout gateway call cannot smuggle a
  // purchase past the cooldown or the certification terminal state.
  await ApplicantLifecycleService.assertCanPurchaseVerification(applicantUserId, locale, tx);

  const claim = await insertClaimOrReplay(applicantUserId, idempotencyKey, tx, t);

  // The applicant row read for the transition decision — the guard just
  // proved the row exists inside THIS transaction, so the read is non-null
  // by construction; a null here is an internal invariant breach, failed
  // closed with the client-safe conflict copy (never a degraded write).
  const applicant: ApplicantSelectType | null = await ApplicantRepository.findByUserId(applicantUserId, tx);
  if (applicant === null) {
    logger.error("Verification purchase aborted: applicant row vanished inside the purchase transaction", {
      entity: "applicants",
      entityId: applicantUserId,
    });
    throw new ConflictError(PURCHASE_PROCESSING_CONFLICT_MESSAGE);
  }

  const createdSubscription = await insertPendingSubscription(applicantUserId, activePlan.id, checkout, tx, t);

  // The pending payment — amount and currency are the plan row's values
  // carried verbatim (decimal string, ISO code): never client-derived,
  // never arithmetic. The lifecycle state defaults to `pending`. The owner
  // is deliberately NULL — an applicant owns no `students` row, so the
  // paired student-junction insert is NOT attempted either.
  const createdPayment: StudentPaymentSelectType = await StudentPaymentRepository.insertPayment(
    {
      studentId: null,
      subscriptionId: createdSubscription.id,
      amount: activePlan.price,
      currency: activePlan.currency,
      paymentGateway: checkout.provider,
    },
    tx
  );

  // Attempt accounting is a RE-APPLICATION contract: only a purchase from
  // `failed` counts as a re-application (a first purchase from `pending`
  // never increments).
  if (applicant.status === ApplicantStatus.Failed) {
    await ApplicantLifecycleService.recordReapplication(applicantUserId, locale, tx);
  }

  // The guarded status flip — a single guarded UPDATE with the enterable
  // prior states folded into its WHERE predicate. A zero-row miss means
  // the applicant is already `in_evaluation` (a concurrent/repeat caller):
  // a silent no-op, never an error (`passed` never reaches here — the
  // guard rejected it above).
  await ApplicantRepository.transitionToInEvaluation(applicantUserId, tx);

  // Backfill the claim's subscription pointer in the same transaction —
  // the claim and the purchase commit atomically.
  await SubscriptionPurchaseIdempotencyRepository.updateClaimSubscriptionId(claim.id, createdSubscription.id, tx);

  return {
    subscription: {
      id: createdSubscription.id,
      userId: createdSubscription.userId,
      planId: createdSubscription.planId,
      status: SubscriptionStatus.Pending,
      startDate: createdSubscription.startDate,
      endDate: createdSubscription.endDate,
      paymentMethod: checkout.provider,
      paymentReference: createdSubscription.paymentReference,
      paymentVerifiedAt: createdSubscription.paymentVerifiedAt,
      createdAt: createdSubscription.createdAt,
      updatedAt: createdSubscription.updatedAt,
    },
    payment: {
      id: createdPayment.id,
      studentId: createdPayment.studentId,
      subscriptionId: createdPayment.subscriptionId,
      amount: createdPayment.amount,
      currency: createdPayment.currency,
      paymentGateway: checkout.provider,
      status: PaymentStatus.Pending,
      createdAt: createdPayment.createdAt,
      updatedAt: createdPayment.updatedAt,
    },
    checkout,
  };
}

export namespace VerificationPurchaseService {
  /**
   * Purchases the verification plan for the acting teacher applicant.
   *
   * The pre-DB boundary rejects a malformed identifier, a governed caller,
   * and a missing/over-length idempotency key BEFORE any database work.
   * The plan is resolved server-side from the ACTIVE catalog by its
   * canonical title (the wire carries no plan id, no amount, no user id).
   * The gateway checkout runs outside every transaction (a network call
   * never holds a transaction open). Inside one transaction the plan is
   * re-validated as active (fail-closed), the applicant lifecycle guard
   * runs before any write (cooldown + certification), the idempotency
   * claim is inserted savepoint-bracketed, and the pending subscription +
   * pending payment (NULL owner — the purchaser is an applicant, not a
   * student) commit atomically with the re-application attempt increment,
   * the guarded `pending|failed → in_evaluation` flip, and the claim's
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
   * @param applicantUserId  The acting applicant's id (context-resolved
   *     server-side by the caller; shared PK with the users table).
   * @param idempotencyKey  The captured request idempotency key, carried
   *     verbatim (never trimmed, never coerced, never logged), or null
   *     when the transport supplied none.
   * @param locale  Active request locale (for the localized error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it and the pre-checkout plan
   *     read rides the same transaction — the whole flow participates in
   *     the caller's unit instead of escaping to the pool; production
   *     callers omit it and the service opens its own transaction (the
   *     plan read is then a bare pool read).
   * @returns The pending subscription/payment pair plus the checkout
   *     descriptor for a FIRST purchase; a replay never returns — it
   *     throws `ConflictError("DUPLICATE_REQUEST")`.
   */
  export async function purchase(
    applicantUserId: number,
    idempotencyKey: string | null,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<PurchaseSubscriptionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Pre-DB boundary validation — fail before any database work.
    if (!isPositiveSafeId(applicantUserId)) {
      throw new ValidationError(t.validation);
    }

    // Governance re-check — the acting applicant must be governance-clean.
    await assertActorGovernanceClean(applicantUserId, t, outerTx);

    if (!isCarryableIdempotencyKey(idempotencyKey)) {
      // Entity vocabulary: the attributed id is the caller's USERS id — a
      // user id rides the "users" tag, never a subscription tag. The key
      // value itself is never logged.
      logger.logDomainError("Verification purchase rejected: idempotency key required", {
        code: "VALIDATION",
        entity: "users",
        entityId: applicantUserId,
      });
      throw new ValidationError(t.subscriptionPurchase.idempotencyKeyRequired);
    }

    // Server-side plan resolution from the ACTIVE catalog by the canonical
    // title — never from client input. A missing active plan (absent, or
    // deactivated) fails the purchase BEFORE the gateway call, so no
    // checkout session is ever opened for a non-purchasable plan. The read
    // rides the caller's transaction when `outerTx` is supplied;
    // production callers omit it and this is a bare pool read. The
    // authoritative re-validation runs inside the purchase transaction
    // below.
    const activeCatalog = await PlanRepository.listActive(outerTx);
    const plan = activeCatalog.find(candidate => candidate.title === VERIFICATION_PLAN_TITLE);
    if (plan === undefined) {
      logger.logDomainError("Verification purchase rejected: plan is not purchasable", {
        code: "PLAN_NOT_FOUND",
        entity: "plans",
        locale,
      });
      throw new NotFoundError("PLAN", t.subscriptionPurchase.planNotPurchasable);
    }

    // Gateway checkout BEFORE the transaction — the provider call is a
    // network boundary. The amount/currency pair is the plan row's own,
    // carried verbatim; the client cannot influence either.
    const gateway = getPaymentGateway(locale);
    const checkout = await gateway.createCheckout({
      studentId: applicantUserId,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency,
    });

    return withTransaction(outerTx, tx =>
      purchaseInTx(applicantUserId, plan.id, checkout, idempotencyKey, locale, tx, t)
    );
  }
}
