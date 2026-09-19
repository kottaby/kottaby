/**
 * SubscriptionAdmin helpers — audit-contract composition, strict id
 * coercion, write-error translation, and the canonical row mapping for
 * the subscription-admin service (mirroring the plan-catalog helpers
 * split: the service namespace stays focused on orchestration).
 *
 * Runtime only — no types are declared here; every shape lives in
 * `backend/types/billing/subscription-admin.types.ts` and is imported
 * through `@/backend/types`.
 *
 * Disciplines enforced here:
 *  - Audit contract: `details` carries ids, integers, and ISO date
 *    strings only — never contact-PII, never credentials, never free
 *    text. The composed row is persisted by `AuditService.createAuditLog`
 *    inside the caller's transaction so it can never outlive a
 *    rolled-back mutation.
 *  - Id coercion: STRICT numeric parsing (never `Number.parseInt`), so a
 *    malformed id can never silently address an unrelated row.
 *  - Row mapping: the raw `$inferSelect` projection carries pg-enum
 *    string unions; the ReturnType's enum contract is applied through a
 *    total, fail-closed lookup over each closed vocabulary — never a
 *    cast, never a silent degrade.
 *  - Cancel denials: the zero-row guarded flip is disambiguated into the
 *    not-found miss, the idempotent already-cancelled replay conflict, or
 *    the localized active-only deny; the optional free-text reason is
 *    trimmed and bounded BEFORE any write and never enters a log.
 */

import { PlanRepository } from "@/backend/db/repo/billing/plan.repository";
import { SubscriptionRepository } from "@/backend/db/repo/billing/subscription.repository";
import { SubscriptionPurchaseIdempotencyRepository } from "@/backend/db/repo/billing/subscription-purchase-idempotency.repository";
import { StudentRepository } from "@/backend/db/repo/students/student.repository";
import { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";
import type { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { ConflictError, isPgUniqueViolation, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { MAX_INTERVAL_DAYS } from "@/backend/services/billing/plan-catalog.helpers";
import type {
  AuditLogWriteContract,
  DBTransaction,
  PlanSelectType,
  SubscriptionReturnType,
  SubscriptionSelectType,
} from "@/backend/types";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

/**
 * The `entity_type` label minted into every subscription-admin audit row.
 */
export const SUBSCRIPTION_AUDIT_ENTITY_TYPE = "subscription";

/**
 * The RESERVED server-owned namespace every admin subscription claim key
 * lives under. The shared `subscription_purchase_idempotency` store also
 * carries RAW client-supplied purchase `x-idempotency-key` headers, so an
 * unreserved, predictably-shaped admin key (`renew:<id>`) could be
 * pre-claimed by a student and permanently block the admin renew /
 * plan-change flows for that row. Both ends keep the space server-owned:
 * the admin flows mint every claim key under this prefix (the builders
 * below), and the purchase boundary rejects client-supplied keys that
 * start with it (see `purchase-guards.helpers.ts`).
 */
export const SUBSCRIPTION_ADMIN_CLAIM_KEY_PREFIX = "subscription-admin";

/**
 * Server-constructed idempotency-claim key prefixes for the admin
 * subscription flows, composed under the reserved server prefix. The
 * caller never supplies claim material on this surface — the claim
 * identity is derived from the targeted row's id, so the shared claim
 * store's key space stays server-owned (the purchase surface's
 * client-header keys are a different, client-supplied space).
 */
export const SUBSCRIPTION_ADMIN_CLAIM_PREFIXES = {
  /** `subscription-admin:renew:<sourceSubscriptionId>` — one fresh period per expired source row. */
  renew: `${SUBSCRIPTION_ADMIN_CLAIM_KEY_PREFIX}:renew`,
  /** `subscription-admin:planChange:<sourceSubscriptionId>:<targetPlanId>` — one plan change per (source row, target plan) pair; a different target on the same source row is a genuinely new change, not a replay. */
  planChange: `${SUBSCRIPTION_ADMIN_CLAIM_KEY_PREFIX}:planChange`,
} as const;

/** Milliseconds per day — the subscription window arithmetic unit shared by the extend, renew, and plan-change flows. */
export const MS_PER_DAY = 86_400_000;

/**
 * Resolves a duplicate renew claim to its REPLAYED first result: the
 * claim's subscription pointer is loaded and returned as the row the
 * original renewal created. A pointer that resolves to nothing (the
 * set-null FK after the result row's deletion — the aborted-original
 * shape) or to a foreign owner cannot be replayed: the localized
 * already-renewed conflict denies instead of re-creating anything.
 */
export async function resolveRenewalReplayRow(
  source: SubscriptionSelectType,
  scopedTx: DBTransaction,
  tErrors: ErrorsLabels
): Promise<SubscriptionSelectType> {
  const claimKey = `${SUBSCRIPTION_ADMIN_CLAIM_PREFIXES.renew}:${source.id}`;
  const priorClaim = await SubscriptionPurchaseIdempotencyRepository.findByKey(claimKey, scopedTx);
  const replayedId = priorClaim?.subscriptionId ?? null;
  if (replayedId === null) {
    // The set-null FK after the result row's deletion (or an aborted
    // original): the claim is spent but points at nothing.
    logger.logDomainError("Subscription renew denied: claim exists without a subscription pointer", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: source.id,
    });
    throw new ConflictError(tErrors.subscriptionAdmin.alreadyRenewed);
  }
  const replayed = await SubscriptionRepository.findById(replayedId, scopedTx);
  if (replayed === null) {
    logger.logDomainError("Subscription renew denied: claim pointer resolves to no subscription row", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: source.id,
    });
    throw new ConflictError(tErrors.subscriptionAdmin.alreadyRenewed);
  }
  if (replayed.userId !== source.userId) {
    // The key space is server-constructed here, but the shared claim
    // store also carries client-supplied purchase keys — a foreign-owner
    // pointer is never replayed to this caller.
    logger.logDomainError("Subscription renew denied: claim's first result belongs to another owner", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: source.id,
    });
    throw new ConflictError(tErrors.subscriptionAdmin.alreadyRenewed);
  }
  return replayed;
}

/**
 * The renewal's fresh plan read with its fail-closed guards: the
 * snapshot is the plan row's CURRENT content (activity is a
 * purchase-time property; the credit lane is not), and a missing row or
 * an unconfigured lane or an interval past the catalog's ceiling aborts
 * the renewal — the caller's transaction rolls the just-inserted claim
 * back with it. The stored lane resolves to its canonical credit-lane
 * member here, so the caller receives a certified lane instead of a
 * nullable column.
 */
export async function readRenewalPlan(
  source: SubscriptionSelectType,
  scopedTx: DBTransaction,
  tErrors: ErrorsLabels
): Promise<{ plan: PlanSelectType; lane: SubscriptionCreditLane }> {
  const plan = await PlanRepository.findById(source.planId, scopedTx);
  if (plan === null) {
    logger.logDomainError("Subscription renew denied: plan row missing", {
      code: "CONFLICT",
      entity: "plans",
      entityId: source.planId,
    });
    throw new ConflictError(tErrors.conflict);
  }
  // The renewal opens a fresh one-interval window — a plan row past the
  // catalog's interval ceiling (purchasable copy until this read) can
  // never anchor one, so it fails closed before any arithmetic.
  if (plan.intervalDays > MAX_INTERVAL_DAYS) {
    logger.logDomainError("Subscription renew denied: plan interval days exceeds the catalog ceiling", {
      code: "VALIDATION",
      entity: "plans",
      entityId: plan.id,
    });
    throw new ValidationError(tErrors.subscriptionAdmin.prorationOverflow);
  }
  if (plan.balanceLane === null) {
    logger.logDomainError("Subscription renew denied: plan balance lane is not configured", {
      code: "CONFLICT",
      entity: "plans",
      entityId: source.planId,
    });
    throw new ConflictError(tErrors.conflict);
  }
  return { plan, lane: subscriptionCreditLaneMemberOf(plan.balanceLane, tErrors) };
}

/**
 * Inserts the renewal's fresh subscription row: one captured instant
 * governs the window (start = the renewal moment, end = start + the
 * plan's interval), the lifecycle state opens `active`, and the admin
 * renewal carries no gateway payload — the payment columns stay
 * explicitly null.
 */
export async function insertRenewedSubscription(
  source: SubscriptionSelectType,
  plan: PlanSelectType,
  scopedTx: DBTransaction
): Promise<SubscriptionSelectType> {
  const renewalInstant = new Date();
  return SubscriptionRepository.insertSubscription(
    {
      userId: source.userId,
      planId: source.planId,
      status: SubscriptionStatus.Active,
      startDate: renewalInstant,
      endDate: new Date(renewalInstant.getTime() + plan.intervalDays * MS_PER_DAY),
      paymentMethod: null,
      paymentReference: null,
      paymentVerifiedAt: null,
    },
    scopedTx
  );
}

/**
 * Settles the renewal's balance side effects in order: the owner's lane
 * is credited the plan's full session count (the lane arrives
 * pre-resolved through the helpers' fail-closed member lookup — zero
 * rows means the owner's student row vanished, unreachable through the
 * FK restrict, and fails closed rather than committing a period without
 * its credit), the student↔subscription junction row is inserted, and
 * the claim's subscription pointer is backfilled — the claim and the
 * renewal commit atomically.
 */
export async function settleRenewalSideEffects(
  source: SubscriptionSelectType,
  lane: SubscriptionCreditLane,
  creditedSessions: number,
  created: SubscriptionSelectType,
  claimId: number,
  tErrors: ErrorsLabels,
  scopedTx: DBTransaction
): Promise<void> {
  const credited = await StudentRepository.creditLaneBalance(source.userId, lane, creditedSessions, scopedTx);
  if (credited === null) {
    logger.logDomainError("Subscription renew denied: owner student row vanished before the lane credit", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: source.id,
    });
    throw new ConflictError(tErrors.conflict);
  }
  await scopedTx.insert(studentSubscriptions).values({
    studentId: source.userId,
    subscriptionId: created.id,
  });
  await SubscriptionPurchaseIdempotencyRepository.updateClaimSubscriptionId(claimId, created.id, scopedTx);
}

/**
 * The cancelled-status member, widened to a plain string: the same
 * read-row guard idiom as the service's active/expired twins — the
 * already-cancelled state is the guarded cancel's replay signature.
 */
const STATUS_CANCELLED: string = SubscriptionStatus.Cancelled;

/**
 * Hard bound for the optional cancel reason after trimming — the audit
 * trail's ONLY free-text field on this surface, so it is the one detail
 * that carries an explicit ceiling (ids, integers, and ISO date strings
 * dominate everywhere else).
 */
export const CANCEL_REASON_MAX_LENGTH = 200;

/**
 * Validates and normalizes the optional cancel reason: trimmed, bounded
 * (a longer submit is a caller bug → the localized validation reject), and
 * collapsed to `undefined` when nothing survives trimming — blank noise is
 * never minted into the trail. The reason NEVER enters a diagnostic log:
 * denials carry ids only.
 */
export function normalizeCancelReason(
  rawReason: string | undefined,
  subscriptionId: number,
  tErrors: ErrorsLabels
): string | undefined {
  const trimmed = rawReason?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > CANCEL_REASON_MAX_LENGTH) {
    logger.logDomainError("Subscription cancel denied: reason exceeds the bounded length", {
      code: "VALIDATION",
      entity: "subscriptions",
      entityId: subscriptionId,
    });
    throw new ValidationError(tErrors.badRequest);
  }
  return trimmed;
}

/**
 * Resolves a zero-row guarded cancel to its precise denial. The fresh read
 * (the caller's executor observes whichever writer won the race) splits
 * the three zero-row meanings: a vanished row is the canonical not-found
 * denial, an already-cancelled row is the idempotent replay conflict (the
 * denied call wrote nothing — the first cancel did), and any other status
 * is the localized active-only deny. One bounded log each, ids only.
 */
export function resolveCancelDenial(
  subscriptionId: number,
  current: SubscriptionSelectType | null,
  tErrors: ErrorsLabels
): never {
  if (current === null) {
    logger.logDomainError("Subscription cancel denied: row does not exist", {
      code: "NOT_FOUND",
      entity: "subscriptions",
      entityId: subscriptionId,
    });
    throw new NotFoundError("SUBSCRIPTION", tErrors.notFound);
  }
  if (current.status === STATUS_CANCELLED) {
    logger.logDomainError("Subscription cancel denied: already cancelled (replay)", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: subscriptionId,
    });
    throw new ConflictError(tErrors.conflict);
  }
  logger.logDomainError("Subscription cancel denied: row is not active", {
    code: "CONFLICT",
    entity: "subscriptions",
    entityId: subscriptionId,
  });
  throw new ConflictError(tErrors.subscriptionAdmin.notActive);
}

/**
 * Composes the audit-log write contract for a subscription lifecycle
 * mutation. The `details` payload carries ids, integers, and ISO date
 * strings only (window bounds, day counts) — never contact-PII or
 * credentials.
 */
export function buildSubscriptionAuditContract(
  actorId: number,
  actionType: AuditActionType,
  entityId: number,
  details: Record<string, unknown>
): AuditLogWriteContract {
  return {
    actorId,
    actionType,
    entityType: SUBSCRIPTION_AUDIT_ENTITY_TYPE,
    entityId,
    details: JSON.stringify(details),
  };
}

/**
 * Coerces a wire `ID` into a subscription id using STRICT numeric
 * parsing (mirrors the plan-catalog id coercion). Unlike
 * `Number.parseInt`, `Number()` rejects trailing garbage (`"12abc"` →
 * NaN) so a malformed id can never silently address an unrelated row;
 * any non-integer / non-positive result maps onto the canonical
 * `SUBSCRIPTION_NOT_FOUND` domain error.
 */
export function coerceSubscriptionId(rawId: string | number, tErrors: ErrorsLabels): number {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    logger.logDomainError("Subscription id failed strict numeric coercion", {
      code: "SUBSCRIPTION_NOT_FOUND",
      entity: "subscriptions",
    });
    throw new NotFoundError("SUBSCRIPTION", tErrors.notFound);
  }
  return id;
}

/**
 * The check-constraint (23514) leg of the write-error translation — walks
 * the thrown value's `Error.cause` chain (Drizzle wraps the driver error,
 * so the code lives on a cause) with a cycle-safe visited set. Reachable
 * as the fail-closed backstop of guarded balance writes whose values are
 * computed server-side: the lanes' `balance_* >= 0` CHECK constraints
 * trip only if a prepared value were negative, which the flows'
 * arithmetic never produces.
 */
function isPgCheckViolation(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "23514") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Maps PostgreSQL violations from subscription-admin writes onto their
 * canonical domain errors: uniqueness conflicts (the shared, cycle-safe
 * `23505` walker) and balance CHECK violations (the cycle-safe `23514`
 * walker) become the localized `ConflictError`. Any other failure is
 * returned untouched so the caller rethrows it verbatim.
 */
export function toSubscriptionAdminDomainError(error: unknown, tErrors: ErrorsLabels): unknown {
  if (isPgUniqueViolation(error)) {
    return new ConflictError(tErrors.conflict, { cause: error });
  }
  if (isPgCheckViolation(error)) {
    return new ConflictError(tErrors.conflict, { cause: error });
  }
  return error;
}

/**
 * The closed vocabularies as enum-member arrays: the stored row's
 * status/payment columns are raw pg-enum string unions, so the mappers
 * resolve the member by the enum objects' own values — the vocabulary
 * flows from the enums, never from bare literals (the documented
 * widening-cast lookup idiom).
 */
const SUBSCRIPTION_STATUS_MEMBERS = Object.values(SubscriptionStatus);
const PAYMENT_GATEWAY_MEMBERS = Object.values(PaymentGateway);
const SUBSCRIPTION_CREDIT_LANE_MEMBERS = Object.values(SubscriptionCreditLane);

/**
 * Fail-closed abort for a stored value outside a closed vocabulary — an
 * internal invariant breach (the DB pgEnum constrains every writable
 * value), never a caller-input matter. ONE correlated diagnostic log,
 * then the localized conflict copy; the caller's transaction rolls back.
 */
function abortRowMapping(detail: string, context: Record<string, unknown>, tErrors: ErrorsLabels): never {
  logger.error(`Subscription admin row mapping aborted: ${detail}`, context);
  throw new ConflictError(tErrors.conflict);
}

function subscriptionStatusMemberOf(
  status: SubscriptionSelectType["status"],
  tErrors: ErrorsLabels
): SubscriptionStatus {
  const member = SUBSCRIPTION_STATUS_MEMBERS.find(value => (value as string) === status);
  if (member === undefined) {
    abortRowMapping(
      "stored subscription status is not a member of the closed status vocabulary",
      { storedStatus: status },
      tErrors
    );
  }
  return member;
}

/**
 * Resolves a stored plan `balance_lane` onto its canonical
 * `SubscriptionCreditLane` member — the same total, fail-closed lookup
 * as the status/gateway mappers (the renewal lane credit keys on it). An
 * unresolvable stored lane is an internal invariant breach (the pgEnum
 * constrains every writable value); ONE correlated diagnostic, then the
 * localized conflict copy — never a cast, never a guessed lane.
 */
export function subscriptionCreditLaneMemberOf(
  lane: PlanSelectType["balanceLane"] & string,
  tErrors: ErrorsLabels
): SubscriptionCreditLane {
  const member = SUBSCRIPTION_CREDIT_LANE_MEMBERS.find(value => (value as string) === lane);
  if (member === undefined) {
    abortRowMapping(
      "stored plan balance lane is not a member of the closed credit-lane vocabulary",
      { storedLane: lane },
      tErrors
    );
  }
  return member;
}

function paymentGatewayMemberOf(
  gateway: SubscriptionSelectType["paymentMethod"] & string,
  tErrors: ErrorsLabels
): PaymentGateway {
  const member = PAYMENT_GATEWAY_MEMBERS.find(value => (value as string) === gateway);
  if (member === undefined) {
    abortRowMapping(
      "stored payment gateway is not a member of the closed gateway vocabulary",
      { storedGateway: gateway },
      tErrors
    );
  }
  return member;
}

/**
 * Projects one stored subscription row onto the strongly-typed
 * ReturnType (`SubscriptionReturnType` re-types the status/payment
 * columns to their canonical TS enums — the mapping makes that enum
 * contract explicit, never a cast).
 */
export function toSubscriptionAdminReturnType(
  row: SubscriptionSelectType,
  tErrors: ErrorsLabels
): SubscriptionReturnType {
  return {
    ...row,
    status: subscriptionStatusMemberOf(row.status, tErrors),
    paymentMethod: row.paymentMethod === null ? null : paymentGatewayMemberOf(row.paymentMethod, tErrors),
  };
}
