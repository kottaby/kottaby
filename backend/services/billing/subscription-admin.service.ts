/**
 * SubscriptionAdminService — admin-gated lifecycle operations on the
 * `subscriptions` root (the extend surface lives here; the sibling
 * admin flows join the same namespace as they ship).
 *
 * Every mutation mirrors the shipped billing admin surface: the acting
 * admin's id is a required parameter that is re-asserted against the
 * `users` table (defense in depth behind the GraphQL role scope) BEFORE
 * any write, the guarded single-statement transition plus its exactly-one
 * audit row share ONE `withTransaction` block (a rolled-back mutation
 * leaves no window shift and no audit row), and denials emit one bounded
 * `logger.logDomainError` with ids only — never student-identifying
 * data.
 *
 * Extend semantics: the new window end is computed SERVER-SIDE from the
 * row's stored `endDate` (a client can never dictate a target date).
 * Genuinely new extensions stack legitimately — each call re-reads the
 * row and extends from its current window — while an identical replay
 * that lost the guarded race surfaces an idempotent conflict instead of
 * a second shift.
 *
 * Renew semantics: the source row must be `expired` — the expiry sweep
 * owns the active → expired transition, so renewal is the recovery path
 * for a lapsed period (an active row takes extend; a pending row is
 * payment-owned). A fresh plan read supplies the period arithmetic and
 * the credit lane (fail-closed when the lane is not configured), the new
 * row opens at the renewal instant, and the owner's lane is credited the
 * plan's full session count. The idempotency claim `renew:<sourceId>` is
 * inserted before any result write — the flow's atomicity point: a
 * duplicate renew replays the first result through the claim's
 * subscription pointer instead of creating a second period, while a
 * committed claim that cannot resolve to a same-owner row (its result
 * row was deleted — the set-null FK) surfaces the localized
 * already-renewed conflict.
 *
 * Cancel semantics: the source row must be `active`, and the flip is
 * BALANCE-PRESERVING — no lane balance column is read or written anywhere
 * in the flow (deliberately asymmetric with the expiry sweep, which
 * zeroes). The optional free-text reason is the audit trail's only free
 * text: trimmed and bounded server-side before anything else runs. A
 * zero-row guarded flip is disambiguated by a fresh read — an
 * already-cancelled row is the idempotent replay conflict, a vanished row
 * the canonical not-found denial, any other state the localized
 * active-only deny.
 */

import { PlanRepository } from "@/backend/db/repo/billing/plan.repository";
import { SubscriptionRepository } from "@/backend/db/repo/billing/subscription.repository";
import { SubscriptionPurchaseIdempotencyRepository } from "@/backend/db/repo/billing/subscription-purchase-idempotency.repository";
import { StudentRepository } from "@/backend/db/repo/students/student.repository";
import { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import type { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, isPgUniqueViolation, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertActorAdmin } from "@/backend/services/admin/admin-gate.helpers";
import { AuditService } from "@/backend/services/admin/audit.service";
import { MAX_INTERVAL_DAYS } from "@/backend/services/billing/plan-catalog.helpers";
import {
  buildSubscriptionAuditContract,
  normalizeCancelReason,
  resolveCancelDenial,
  SUBSCRIPTION_ADMIN_CLAIM_PREFIXES,
  subscriptionCreditLaneMemberOf,
  toSubscriptionAdminDomainError,
  toSubscriptionAdminReturnType,
} from "@/backend/services/billing/subscription-admin.helpers";
import type {
  CancelSubscriptionSubmitInput,
  DBTransaction,
  ExtendSubscriptionSubmitInput,
  PlanSelectType,
  RenewSubscriptionSubmitInput,
  SubscriptionPurchaseIdempotencySelectType,
  SubscriptionReturnType,
  SubscriptionSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

/** Milliseconds per day — the extension window arithmetic. */
const MS_PER_DAY = 86_400_000;

/**
 * The active-status member, widened to a plain string: the read row's
 * `status` column is the raw pg-enum string union, so the guard compares
 * against the enum member's string identity — the vocabulary flows from
 * the enum, never from a bare literal (the session-lifecycle guard
 * idiom).
 */
const STATUS_ACTIVE: string = SubscriptionStatus.Active;

/**
 * The expired-status member, widened to a plain string: the same
 * read-row guard idiom as the active-status twin — renew is the
 * sweep-owned `expired` state's only writer recovery path.
 */
const STATUS_EXPIRED: string = SubscriptionStatus.Expired;

/**
 * Resolves a duplicate renew claim to its REPLAYED first result: the
 * claim's subscription pointer is loaded and returned as the row the
 * original renewal created. A pointer that resolves to nothing (the
 * set-null FK after the result row's deletion — the aborted-original
 * shape) or to a foreign owner cannot be replayed: the localized
 * already-renewed conflict denies instead of re-creating anything.
 */
async function resolveRenewalReplayRow(
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
 * an unconfigured lane aborts the renewal — the caller's transaction
 * rolls the just-inserted claim back with it. The stored lane resolves
 * to its canonical credit-lane member here, so the caller receives a
 * certified lane instead of a nullable column.
 */
async function readRenewalPlan(
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
async function insertRenewedSubscription(
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
async function settleRenewalSideEffects(
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

export namespace SubscriptionAdminService {
  /**
   * Extends an `active` subscription's validity window by a whole number
   * of days.
   *
   * Fail-closed sequence: the day count is validated pre-DB, the admin
   * gate re-asserts the actor's role with zero writes on denial, and one
   * transaction owns the read, the guarded `extendActiveOnce` transition,
   * and the exactly-one audit row (`Update` on the `subscription` entity,
   * details `{ previousEndDate, newEndDate, addedDays }` — ISO strings
   * and an integer only). A row that is missing, not `active`, or
   * windowless denies with the localized active-only conflict; an
   * extension that would push the resulting validity window past the
   * catalog's interval ceiling denies with the localized validation
   * reject; a replay that lost the guarded race (the window moved
   * between this transaction's read and its write) surfaces the
   * idempotent conflict and mints nothing.
   *
   * @param input  The validated submit payload (subscription id + day
   *     count); the id arrives pre-coerced through the strict numeric
   *     parse, the day count is re-validated here.
   * @param actorId  The acting admin's user id (never client input).
   * @param locale  Locale for the localized denial messages.
   * @param tx  Optional caller transaction to join (test path:
   *     SAVEPOINT) — the whole flow participates in the caller's unit.
   * @returns The extended row in its canonical read shape.
   */
  export async function extendSubscription(
    input: ExtendSubscriptionSubmitInput,
    actorId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<SubscriptionReturnType> {
    const tErrors = getServerTranslations(locale).errorsTranslations;

    // Pre-DB input validation — a fractional or non-positive day count is
    // a caller bug, never a database matter. Whole days only: the window
    // arithmetic multiplies this value into Date milliseconds.
    if (!Number.isInteger(input.days) || input.days < 1) {
      logger.logDomainError("Subscription extend denied: day count is not a positive whole number", {
        code: "VALIDATION",
        entity: "subscriptions",
        entityId: input.subscriptionId,
      });
      throw new ValidationError(tErrors.badRequest);
    }

    // Defense-in-depth BFLA gate — zero writes, zero audit rows on denial.
    await assertActorAdmin(actorId, locale, tx);

    try {
      return await withTransaction(tx, async scopedTx => {
        const subscription = await SubscriptionRepository.findById(input.subscriptionId, scopedTx);
        if (subscription?.status !== STATUS_ACTIVE || subscription.endDate === null) {
          logger.logDomainError("Subscription extend denied: row missing, not active, or windowless", {
            code: "CONFLICT",
            entity: "subscriptions",
            entityId: input.subscriptionId,
          });
          throw new ConflictError(tErrors.subscriptionAdmin.notActive);
        }

        const previousEndDate = subscription.endDate;
        const newEndDate = new Date(previousEndDate.getTime() + input.days * MS_PER_DAY);

        // The resulting validity window stays inside the catalog's interval
        // ceiling, measured from the period's start (a legacy row without a
        // start stamp is measured from its current window end so the guard
        // can never silently pass an unbounded extension).
        const windowAnchor = subscription.startDate ?? previousEndDate;
        if (newEndDate.getTime() - windowAnchor.getTime() > MAX_INTERVAL_DAYS * MS_PER_DAY) {
          logger.logDomainError("Subscription extend denied: resulting window exceeds the interval ceiling", {
            code: "VALIDATION",
            entity: "subscriptions",
            entityId: input.subscriptionId,
          });
          throw new ValidationError(tErrors.subscriptionAdmin.prorationOverflow);
        }

        // The guarded single UPDATE is the write decision: its WHERE
        // predicate re-asserts `active` AND the read window end, so a
        // concurrent writer (expiry sweep, cancellation) or an identical
        // double-submit loses the race here (zero rows) instead of
        // shifting the window twice.
        const extended = await SubscriptionRepository.extendActiveOnce(
          subscription.id,
          { previousEndDate, newEndDate },
          scopedTx
        );
        if (extended === null) {
          logger.logDomainError("Subscription extend denied: window moved concurrently (replay)", {
            code: "CONFLICT",
            entity: "subscriptions",
            entityId: subscription.id,
          });
          throw new ConflictError(tErrors.conflict);
        }

        await AuditService.createAuditLog(
          buildSubscriptionAuditContract(actorId, AuditActionType.Update, subscription.id, {
            previousEndDate: previousEndDate.toISOString(),
            newEndDate: newEndDate.toISOString(),
            addedDays: input.days,
          }),
          scopedTx
        );

        return toSubscriptionAdminReturnType(extended, tErrors);
      });
    } catch (error: unknown) {
      throw toSubscriptionAdminDomainError(error, tErrors);
    }
  }

  /**
   * Renews an `expired` subscription into a fresh active period.
   *
   * Fail-closed sequence: the admin gate re-asserts the actor's role
   * with zero writes on denial, the source row must exist and be
   * `expired` (the expiry sweep owns the active → expired transition —
   * active rows take extend, pending rows are payment-owned), and the
   * idempotency claim `renew:<sourceId>` is inserted inside the flow's
   * transaction BEFORE any result write, making the claim insert the
   * atomicity point for the whole renewal. A duplicate claim (23505)
   * resolves to a REPLAY: the claim's subscription pointer is loaded and
   * returned as the first result — no second period, no second credit,
   * no audit row. A committed claim that cannot resolve to a same-owner
   * row surfaces the localized already-renewed conflict instead. On the
   * winning path the fresh plan read supplies the period arithmetic and
   * the credit lane (fail-closed when the lane is not configured — the
   * transaction rolls the claim back with it), the fresh period + lane
   * credit + junction row + claim backfill commit together, and exactly
   * ONE audit row (`Create` on the `subscription` entity, details
   * `{ renewedFromSubscriptionId, planId, creditedSessions,
   * intervalDays }` — ids and integers only) shares the transaction's
   * fate.
   *
   * @param input  The validated submit payload (subscription id); the id
   *     arrives pre-coerced through the strict numeric parse.
   * @param actorId  The acting admin's user id (never client input).
   * @param locale  Locale for the localized denial messages.
   * @param tx  Optional caller transaction to join (test path:
   *     SAVEPOINT) — the whole flow participates in the caller's unit.
   * @returns The renewed row (or, on a replay, the first renewal's row)
   *     in its canonical read shape.
   */
  export async function renewSubscription(
    input: RenewSubscriptionSubmitInput,
    actorId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<SubscriptionReturnType> {
    const tErrors = getServerTranslations(locale).errorsTranslations;

    // Defense-in-depth BFLA gate — zero writes, zero audit rows on denial.
    await assertActorAdmin(actorId, locale, tx);

    try {
      return await withTransaction(tx, async scopedTx => {
        // The source row is the renewal's premise: it must exist and be
        // `expired`. The status comparison rides the enum member's string
        // identity — never a bare literal.
        const source = await SubscriptionRepository.findById(input.subscriptionId, scopedTx);
        if (source?.status !== STATUS_EXPIRED) {
          logger.logDomainError("Subscription renew denied: source row missing or not expired", {
            code: "CONFLICT",
            entity: "subscriptions",
            entityId: input.subscriptionId,
          });
          throw new ConflictError(tErrors.subscriptionAdmin.notExpired);
        }

        // The idempotency claim — savepoint-bracketed so a duplicate key
        // poisons only the savepoint, keeping this transaction readable
        // for the replay lookup (the purchase flow's claim idiom). The
        // key is SERVER-CONSTRUCTED from the source row's id — the caller
        // never supplies claim material on this surface.
        const claimKey = `${SUBSCRIPTION_ADMIN_CLAIM_PREFIXES.renew}:${source.id}`;
        let claim: SubscriptionPurchaseIdempotencySelectType;
        try {
          claim = await scopedTx.transaction(claimTx =>
            SubscriptionPurchaseIdempotencyRepository.insertClaim(
              { idempotencyKey: claimKey, userId: source.userId },
              claimTx
            )
          );
        } catch (error: unknown) {
          if (!isPgUniqueViolation(error)) {
            throw error;
          }
          return toSubscriptionAdminReturnType(await resolveRenewalReplayRow(source, scopedTx, tErrors), tErrors);
        }

        const { plan, lane } = await readRenewalPlan(source, scopedTx, tErrors);

        const created = await insertRenewedSubscription(source, plan, scopedTx);
        await settleRenewalSideEffects(source, lane, plan.sessionCount, created, claim.id, tErrors, scopedTx);

        await AuditService.createAuditLog(
          buildSubscriptionAuditContract(actorId, AuditActionType.Create, created.id, {
            renewedFromSubscriptionId: source.id,
            planId: source.planId,
            creditedSessions: plan.sessionCount,
            intervalDays: plan.intervalDays,
          }),
          scopedTx
        );

        return toSubscriptionAdminReturnType(created, tErrors);
      });
    } catch (error: unknown) {
      throw toSubscriptionAdminDomainError(error, tErrors);
    }
  }

  /**
   * Cancels an `active` subscription WITHOUT touching any lane balance —
   * the balance-preserving deny path (deliberately asymmetric with the
   * expiry sweep, which zeroes).
   *
   * Fail-closed sequence: the optional free-text reason is trimmed and
   * length-bounded pre-DB (it reaches the audit trail only inside the
   * bound, and never enters a diagnostic log), the admin gate re-asserts
   * the actor's role with zero writes on denial, and one transaction owns
   * the guarded `cancelActiveOnce` transition plus the exactly-one audit
   * row (`Suspend` on the `subscription` entity, details
   * `{ fromStatus, toStatus, reason? }` — the reason is omitted entirely
   * when not supplied). A zero-row guarded write is disambiguated by a
   * fresh read on the same executor: a missing row denies with the
   * canonical not-found error, an already-cancelled row surfaces the
   * idempotent replay conflict (no second write, no second audit row),
   * and any other state denies with the localized active-only conflict —
   * all with zero writes. The guard lives entirely inside the UPDATE's
   * WHERE (no read-then-write premise): the disambiguation read runs only
   * after the write has already failed.
   *
   * @param input  The validated submit payload (subscription id + the
   *     optional reason); the id arrives pre-coerced through the strict
   *     numeric parse.
   * @param actorId  The acting admin's user id (never client input).
   * @param locale  Locale for the localized denial messages.
   * @param tx  Optional caller transaction to join (test path:
   *     SAVEPOINT) — the whole flow participates in the caller's unit.
   * @returns The cancelled row in its canonical read shape.
   */
  export async function cancelSubscription(
    input: CancelSubscriptionSubmitInput,
    actorId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<SubscriptionReturnType> {
    const tErrors = getServerTranslations(locale).errorsTranslations;

    // Pre-DB input validation — the optional reason is normalized before
    // the gate or any write, so an overlong submit costs zero reads.
    const reason = normalizeCancelReason(input.reason, input.subscriptionId, tErrors);

    // Defense-in-depth BFLA gate — zero writes, zero audit rows on denial.
    await assertActorAdmin(actorId, locale, tx);

    try {
      return await withTransaction(tx, async scopedTx => {
        // The guarded single UPDATE is the write decision: its WHERE
        // predicate re-asserts `active` under the row lock, so a
        // concurrent writer (extend, plan change, sweep) or an identical
        // double-submit matches zero rows instead of flipping twice. The
        // statement patches ONLY status + updated_at — no lane balance
        // column exists anywhere in this flow.
        const cancelled = await SubscriptionRepository.cancelActiveOnce(input.subscriptionId, scopedTx);
        if (cancelled === null) {
          // Zero rows = replay, wrong state, or a missing row — the fresh
          // read disambiguates and the chosen denial mints nothing.
          const current = await SubscriptionRepository.findById(input.subscriptionId, scopedTx);
          resolveCancelDenial(input.subscriptionId, current, tErrors);
        }

        // Exactly ONE audit row shares the transaction's fate. The
        // from/to statuses flow from the enum members (the guard pins the
        // from side); the reason is the trail's only free text.
        const auditDetails: Record<string, unknown> = {
          fromStatus: SubscriptionStatus.Active,
          toStatus: SubscriptionStatus.Cancelled,
        };
        if (reason !== undefined) {
          auditDetails.reason = reason;
        }
        await AuditService.createAuditLog(
          buildSubscriptionAuditContract(actorId, AuditActionType.Suspend, cancelled.id, auditDetails),
          scopedTx
        );

        return toSubscriptionAdminReturnType(cancelled, tErrors);
      });
    } catch (error: unknown) {
      throw toSubscriptionAdminDomainError(error, tErrors);
    }
  }
}
