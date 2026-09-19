/**
 * SubscriptionAdmin plan-change flow — the upgrade/downgrade lifecycle
 * writer, split into its own module (the sibling-helpers file convention)
 * so the `SubscriptionAdminService` namespace stays focused on
 * orchestration-sized flows.
 *
 * Semantics: the source row must be `active` (a missing row denies with
 * the canonical not-found error, an already-cancelled row surfaces the
 * idempotent replay conflict, any other state the localized active-only
 * deny — the guarded-cancel disambiguation ladder reused verbatim), and
 * the TARGET plan must be active, different from the source plan, and
 * credit the SAME balance lane (cross-lane migration is out of scope).
 * The proration is computed from the student's CURRENT lane balance read
 * inside the transaction — flat lanes, with the stale-read race resolved
 * downstream by the EXACT-value lane settlement (a concurrent booking
 * debit that lands between the read and the write is superseded by the
 * prepared total, never raced by a relative increment).
 *
 * The idempotency claim `planChange:<sourceId>:<targetPlanId>` is
 * inserted (savepoint-bracketed) BEFORE any result write — the flow's
 * atomicity point: a duplicate claim (23505) REPLAYS the first result
 * through the claim's subscription pointer instead of re-crediting, while
 * a committed claim that cannot resolve to a same-owner row surfaces the
 * localized already-plan-changed conflict. On the winning path the old
 * row is guarded-flipped to `cancelled` (fail closed on a zero-row
 * result — no disambiguation: the opening read already certified the
 * row's state under this transaction), the owner's lane is set to the
 * prepared exact total (the target plan's full session count plus the
 * computed carry on the upgrade leg; the downgrade forfeits the
 * remainder), the fresh period + junction row + claim backfill commit
 * together, and exactly ONE audit row (`Override` on the `subscription`
 * entity, details `{ direction, fromSubscriptionId, fromPlanId, toPlanId,
 * carrySessions, forfeitedExcess }` — enum values, ids, and integers
 * only) shares the transaction's fate.
 *
 * Runtime only — no types are declared here; every shape lives in
 * `backend/types/` and is imported through `@/backend/types`.
 */

import { PlanRepository } from "@/backend/db/repo/billing/plan.repository";
import { SubscriptionRepository } from "@/backend/db/repo/billing/subscription.repository";
import { SubscriptionPurchaseIdempotencyRepository } from "@/backend/db/repo/billing/subscription-purchase-idempotency.repository";
import { StudentRepository } from "@/backend/db/repo/students/student.repository";
import { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { ProrationDirection } from "@/backend/enum/billing/proration-direction.enum";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, isPgUniqueViolation, NotFoundError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertActorAdmin } from "@/backend/services/admin/admin-gate.helpers";
import { AuditService } from "@/backend/services/admin/audit.service";
import {
  buildSubscriptionAuditContract,
  MS_PER_DAY,
  resolveCancelDenial,
  SUBSCRIPTION_ADMIN_CLAIM_PREFIXES,
  subscriptionCreditLaneMemberOf,
  toSubscriptionAdminDomainError,
  toSubscriptionAdminReturnType,
} from "@/backend/services/billing/subscription-admin.helpers";
import {
  computeProration,
  prorationDirectionMemberOf,
  prorationDirectionOf,
} from "@/backend/services/billing/subscription-proration.helpers";
import type {
  ChangeSubscriptionPlanResult,
  ChangeSubscriptionPlanSubmitInput,
  DBTransaction,
  PlanSelectType,
  StudentSelectType,
  SubscriptionPurchaseIdempotencySelectType,
  SubscriptionSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

/**
 * Frozen credit-lane → `students` row lane-column reader. Keys are the
 * `SubscriptionCreditLane` enum members themselves — never caller
 * strings — so the proration's remaining-sessions read can only ever
 * select one of the real balance columns (`Object.freeze` blocks runtime
 * mutation; the `Record<SubscriptionCreditLane, ...>` annotation makes a
 * missing enum member a compile error).
 */
const STUDENT_LANE_BALANCE_READERS: Readonly<
  Record<SubscriptionCreditLane, (student: StudentSelectType) => number | null>
> = Object.freeze({
  [SubscriptionCreditLane.Hifz]: student => student.balanceHifz,
  [SubscriptionCreditLane.Tajweed]: student => student.balanceTajweed,
  [SubscriptionCreditLane.Reviews]: student => student.balanceReviews,
});

/**
 * The student's current balance on ONE lane — the proration's
 * `remainingSessions`. A legacy NULL lane reads as zero (the crediting
 * statements seed NULL lanes from zero through the same convention).
 */
function studentLaneBalanceOf(student: StudentSelectType, lane: SubscriptionCreditLane): number {
  return STUDENT_LANE_BALANCE_READERS[lane](student) ?? 0;
}

/**
 * Certifies the SOURCE plan's credit lane: an unconfigured lane cannot
 * anchor the settlement (the flow cannot know which column to supersede),
 * so it fails closed; the stored lane resolves to its canonical
 * credit-lane member through the helpers' total vocabulary lookup.
 */
function certifySourceLane(sourcePlan: PlanSelectType, tErrors: ErrorsLabels): SubscriptionCreditLane {
  if (sourcePlan.balanceLane === null) {
    logger.logDomainError("Subscription plan change denied: source plan balance lane is not configured", {
      code: "CONFLICT",
      entity: "plans",
      entityId: sourcePlan.id,
    });
    throw new ConflictError(tErrors.conflict);
  }
  return subscriptionCreditLaneMemberOf(sourcePlan.balanceLane, tErrors);
}

/**
 * The TARGET plan read with its guard ladder: a missing row denies with
 * the canonical plan not-found error, an inactive plan with the localized
 * inactive-plan deny, the source plan itself with the same-plan deny, and
 * a lane-less or DIFFERENT-lane plan with the localized incompatible-lane
 * deny (cross-lane migration is out of scope) — every denial zero-write.
 */
async function readPlanChangeTarget(
  newPlanId: number,
  sourcePlan: PlanSelectType,
  scopedTx: DBTransaction,
  tErrors: ErrorsLabels
): Promise<PlanSelectType> {
  const target = await PlanRepository.findById(newPlanId, scopedTx);
  if (target === null) {
    logger.logDomainError("Subscription plan change denied: target plan row missing", {
      code: "NOT_FOUND",
      entity: "plans",
      entityId: newPlanId,
    });
    throw new NotFoundError("PLAN", tErrors.planCatalog.planNotFound);
  }
  if (!target.isActive) {
    logger.logDomainError("Subscription plan change denied: target plan is inactive", {
      code: "CONFLICT",
      entity: "plans",
      entityId: target.id,
    });
    throw new ConflictError(tErrors.subscriptionAdmin.inactivePlan);
  }
  if (target.id === sourcePlan.id) {
    logger.logDomainError("Subscription plan change denied: target plan is the source plan", {
      code: "CONFLICT",
      entity: "plans",
      entityId: target.id,
    });
    throw new ConflictError(tErrors.subscriptionAdmin.samePlan);
  }
  if (target.balanceLane === null || target.balanceLane !== sourcePlan.balanceLane) {
    logger.logDomainError("Subscription plan change denied: target plan credits a different balance lane", {
      code: "CONFLICT",
      entity: "plans",
      entityId: target.id,
    });
    throw new ConflictError(tErrors.subscriptionAdmin.incompatibleLane);
  }
  return target;
}

/**
 * Inserts the plan-change claim (savepoint-bracketed so a duplicate key
 * poisons only the savepoint, keeping this transaction readable for the
 * replay lookup — the purchase flow's claim idiom). The key is
 * SERVER-CONSTRUCTED from the certified source row and target plan — the
 * caller never supplies claim material on this surface.
 *
 * @returns The fresh claim row, or `null` when the key was already
 *     claimed (the caller resolves the REPLAY through the committed claim
 *     instead of writing anything).
 */
async function insertPlanChangeClaim(
  sourceSubscriptionId: number,
  userId: number,
  targetPlanId: number,
  scopedTx: DBTransaction
): Promise<SubscriptionPurchaseIdempotencySelectType | null> {
  const claimKey = `${SUBSCRIPTION_ADMIN_CLAIM_PREFIXES.planChange}:${sourceSubscriptionId}:${targetPlanId}`;
  try {
    return await scopedTx.transaction(claimTx =>
      SubscriptionPurchaseIdempotencyRepository.insertClaim({ idempotencyKey: claimKey, userId }, claimTx)
    );
  } catch (error: unknown) {
    if (!isPgUniqueViolation(error)) {
      throw error;
    }
    return null;
  }
}

/**
 * One bounded `already-plan-changed` denial (the localized default-code
 * conflict) for a committed claim that cannot resolve to a same-owner
 * result row — `detail` names the unresolvable shape, ids only in the log.
 */
function replayConflict(sourceSubscriptionId: number, detail: string, tErrors: ErrorsLabels): never {
  logger.logDomainError(`Subscription plan change denied: ${detail}`, {
    code: "CONFLICT",
    entity: "subscriptions",
    entityId: sourceSubscriptionId,
  });
  throw new ConflictError(tErrors.subscriptionAdmin.alreadyPlanChanged);
}

/**
 * Resolves a duplicate plan-change claim to its REPLAYED first result:
 * the claim's subscription pointer is loaded and returned with the
 * plan-pair-derived direction — THIS call moved nothing, so the carry and
 * forfeit report zero (the original arithmetic lives in the committed
 * audit row). A pointer that resolves to nothing (the set-null FK after
 * the result row's deletion) or to a foreign owner cannot be replayed:
 * the localized already-plan-changed conflict denies instead.
 */
async function resolvePlanChangeReplayRow(
  source: { subscription: SubscriptionSelectType; plan: PlanSelectType },
  target: PlanSelectType,
  scopedTx: DBTransaction,
  tErrors: ErrorsLabels
): Promise<ChangeSubscriptionPlanResult> {
  const claimKey = `${SUBSCRIPTION_ADMIN_CLAIM_PREFIXES.planChange}:${source.subscription.id}:${target.id}`;
  const priorClaim = await SubscriptionPurchaseIdempotencyRepository.findByKey(claimKey, scopedTx);
  const replayedId = priorClaim?.subscriptionId ?? null;
  if (replayedId === null) {
    replayConflict(source.subscription.id, "claim exists without a subscription pointer", tErrors);
  }
  const replayed = await SubscriptionRepository.findById(replayedId, scopedTx);
  if (replayed === null) {
    replayConflict(source.subscription.id, "claim pointer resolves to no subscription row", tErrors);
  }
  if (replayed.userId !== source.subscription.userId) {
    // The key space is server-constructed here, but the shared claim
    // store also carries client-supplied purchase keys — a foreign-owner
    // pointer is never replayed to this caller.
    replayConflict(source.subscription.id, "claim's first result belongs to another owner", tErrors);
  }
  return {
    subscription: toSubscriptionAdminReturnType(replayed, tErrors),
    direction: prorationDirectionOf(source.plan, target, tErrors),
    carrySessions: 0,
    forfeitedSessions: 0,
  };
}

/**
 * Inserts the plan change's fresh subscription row: one captured instant
 * governs the window (start = the change moment, end = start + the TARGET
 * plan's interval), the lifecycle state opens `active`, and the admin
 * change carries no gateway payload — the payment columns stay explicitly
 * null.
 */
async function insertChangedSubscription(
  source: SubscriptionSelectType,
  plan: PlanSelectType,
  scopedTx: DBTransaction
): Promise<SubscriptionSelectType> {
  const changeInstant = new Date();
  return SubscriptionRepository.insertSubscription(
    {
      userId: source.userId,
      planId: plan.id,
      status: SubscriptionStatus.Active,
      startDate: changeInstant,
      endDate: new Date(changeInstant.getTime() + plan.intervalDays * MS_PER_DAY),
      paymentMethod: null,
      paymentReference: null,
      paymentVerifiedAt: null,
    },
    scopedTx
  );
}

/**
 * Settles the plan change's balance side effects in order: the owner's
 * lane is set to the prepared EXACT total (a concurrent booking debit is
 * superseded, never raced — zero rows means the owner's student row
 * vanished, unreachable through the FK restrict, and fails closed rather
 * than committing a period without its settlement), the
 * student↔subscription junction row is inserted, and the claim's
 * subscription pointer is backfilled — the claim and the change commit
 * atomically.
 */
async function settlePlanChangeSideEffects(
  studentId: number,
  lane: SubscriptionCreditLane,
  creditedSessions: number,
  created: SubscriptionSelectType,
  claimId: number,
  tErrors: ErrorsLabels,
  scopedTx: DBTransaction
): Promise<void> {
  const settled = await StudentRepository.setLaneBalanceValue(studentId, lane, creditedSessions, scopedTx);
  if (settled === null) {
    logger.logDomainError("Subscription plan change denied: owner student row vanished before the lane settlement", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: created.id,
    });
    throw new ConflictError(tErrors.conflict);
  }
  await scopedTx.insert(studentSubscriptions).values({
    studentId,
    subscriptionId: created.id,
  });
  await SubscriptionPurchaseIdempotencyRepository.updateClaimSubscriptionId(claimId, created.id, scopedTx);
}

/**
 * Reads the change's owner `students` row — the proration's
 * remaining-sessions source — fail-closed: a vanished owner (unreachable
 * through the FK restrict while the subscription exists) denies with the
 * localized conflict instead of committing a change without its settlement.
 */
async function readPlanChangeOwner(
  source: { subscription: SubscriptionSelectType },
  tErrors: ErrorsLabels,
  scopedTx: DBTransaction
): Promise<StudentSelectType> {
  const student = await StudentRepository.findById(source.subscription.userId, scopedTx);
  if (student === null) {
    logger.logDomainError("Subscription plan change denied: owner student row missing", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: source.subscription.id,
    });
    throw new ConflictError(tErrors.conflict);
  }
  return student;
}

/**
 * Terminates the source period on the winning path: the guarded
 * active→cancelled flip (the cancel flow's exact single-statement
 * transition) runs AFTER the claim is won and BEFORE the fresh period is
 * inserted, so the lane settlement's exact total supersedes the old
 * contribution while the lane never carries two covering periods. A
 * zero-row result means a concurrent writer won between the opening read
 * and this flip — fail closed, the transaction rolls back with nothing
 * committed.
 */
async function cancelPlanChangeSource(
  source: SubscriptionSelectType,
  tErrors: ErrorsLabels,
  scopedTx: DBTransaction
): Promise<void> {
  const cancelled = await SubscriptionRepository.cancelActiveOnce(source.id, scopedTx);
  if (cancelled === null) {
    logger.logDomainError("Subscription plan change aborted: the source row's guarded cancel matched zero rows", {
      code: "CONFLICT",
      entity: "subscriptions",
      entityId: source.id,
    });
    throw new ConflictError(tErrors.conflict);
  }
}

/**
 * The plan-change flow's transaction body — every write of one committed
 * change (guarded old-row flip, exact lane settlement, fresh period,
 * junction, claim backfill) plus its exactly-one audit row, in ONE
 * transaction.
 */
async function changeSubscriptionPlanTx(
  input: ChangeSubscriptionPlanSubmitInput,
  actorId: number,
  tErrors: ErrorsLabels,
  scopedTx: DBTransaction
): Promise<ChangeSubscriptionPlanResult> {
  const source = await SubscriptionRepository.findActiveWithPlan(input.subscriptionId, scopedTx);
  if (source === null) {
    // Missing, cancelled, or moved-on source: the fresh read
    // disambiguates — the not-found / replay-conflict / active-only deny
    // ladder, all zero-write.
    const current = await SubscriptionRepository.findById(input.subscriptionId, scopedTx);
    resolveCancelDenial(input.subscriptionId, current, tErrors);
  }
  const lane = certifySourceLane(source.plan, tErrors);
  const target = await readPlanChangeTarget(input.newPlanId, source.plan, scopedTx, tErrors);

  // The proration's remaining-sessions input is the student's CURRENT lane
  // balance for the OLD lane, read inside this transaction (flat lanes).
  const student = await readPlanChangeOwner(source, tErrors, scopedTx);
  const proration = computeProration(
    { remainingSessions: studentLaneBalanceOf(student, lane), oldPlan: source.plan, newPlan: target },
    tErrors
  );

  const claim = await insertPlanChangeClaim(source.subscription.id, source.subscription.userId, target.id, scopedTx);
  if (claim === null) {
    return resolvePlanChangeReplayRow(source, target, scopedTx, tErrors);
  }

  // The credit: the target plan's full session count, plus the computed
  // carry on the upgrade leg — the downgrade forfeits the remainder
  // (carrySessions arrives zero from the proration).
  const direction = prorationDirectionMemberOf(proration.direction, tErrors);
  const creditedSessions =
    direction === ProrationDirection.Upgrade ? target.sessionCount + proration.carrySessions : target.sessionCount;

  await cancelPlanChangeSource(source.subscription, tErrors, scopedTx);

  const created = await insertChangedSubscription(source.subscription, target, scopedTx);
  await settlePlanChangeSideEffects(
    source.subscription.userId,
    lane,
    creditedSessions,
    created,
    claim.id,
    tErrors,
    scopedTx
  );

  await AuditService.createAuditLog(
    buildSubscriptionAuditContract(actorId, AuditActionType.Override, created.id, {
      direction,
      fromSubscriptionId: source.subscription.id,
      fromPlanId: source.plan.id,
      toPlanId: target.id,
      carrySessions: proration.carrySessions,
      forfeitedExcess: proration.forfeitedSessions,
    }),
    scopedTx
  );

  return {
    subscription: toSubscriptionAdminReturnType(created, tErrors),
    direction,
    carrySessions: proration.carrySessions,
    forfeitedSessions: proration.forfeitedSessions,
  };
}

/**
 * Runs the plan-change flow: the admin gate re-asserts the actor's role
 * with zero writes on denial, then ONE transaction owns the reads, the
 * claim, every write, and the audit row. Domain errors map through the
 * shared translation (uniqueness and balance-CHECK violations become the
 * localized conflict) so the caller rethrows canonical domain errors.
 */
export async function changeSubscriptionPlanFlow(
  input: ChangeSubscriptionPlanSubmitInput,
  actorId: number,
  locale: string,
  tx?: DBTransaction
): Promise<ChangeSubscriptionPlanResult> {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  // Defense-in-depth BFLA gate — zero writes, zero audit rows on denial.
  await assertActorAdmin(actorId, locale, tx);

  try {
    return await withTransaction(tx, scopedTx => changeSubscriptionPlanTx(input, actorId, tErrors, scopedTx));
  } catch (error: unknown) {
    throw toSubscriptionAdminDomainError(error, tErrors);
  }
}
