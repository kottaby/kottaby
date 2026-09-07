/**
 * SessionAdminGovernanceService — governance flow internals (module
 * extraction, behavior-identical): the shared denial classifiers, the
 * append-only audit contract composer, the cancel-reason normalizer, the
 * idempotent-cancel replay machinery, and the three mutation transaction
 * bodies (`rescheduleSessionInTx`, `cancelSessionInTx`,
 * `reassignTeacherInTx`).
 *
 * Fixed order inside every transaction body (identical to the flow it was
 * extracted from): the pre-write read captures audit metadata and
 * classifies an unknown id, the state-eligibility gate stays the guarded
 * single-statement UPDATE (a zero-row miss is classified by ONE cold probe
 * read that never feeds a write), the certification lock on the reassign
 * path is held across check → write in the SAME transaction, exactly ONE
 * audit row is appended through the composition-only writer, the cancel's
 * hold release rides the ONE shared same-lane refund primitive verbatim
 * (a row with no recorded lane refunds nothing; an unreadable lane fails
 * closed and rolls the mutation back), and the idempotency claim — when
 * the caller supplied a key — is inserted savepoint-bracketed BEFORE any
 * session write, with its session pointer backfilled before the body
 * returns.
 *
 * The public surface stays the `SessionAdminGovernanceService` namespace
 * in `session-admin-governance.ts` (the namespace method owns the boundary
 * validation ordering, the BFLA gate, the captured instant, and the
 * `withTransaction` composition; publish-after-commit is the caller's —
 * the bodies only persist the receipts). Nothing in this module is part
 * of the public API.
 */

import { SessionRepository, SessionRequestIdempotencyRepository, TeacherRepository } from "@/backend/db/repo";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { ConflictError, NotFoundError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { AuditService } from "@/backend/services/admin/audit.service";
import {
  isClaimKeyUniqueViolation,
  SESSION_STARTED_STATUS,
} from "@/backend/services/classes/session-lifecycle.guards";
import { refundHeldLaneToProvenance } from "@/backend/services/classes/session-lifecycle.transitions";
import { SessionRequestNotificationService } from "@/backend/services/classes/session-request-notification.service";
import type { NotificationEngineCallOptions } from "@/backend/services/notifications";
import type {
  AdminSessionCancelInput,
  AdminSessionReassignInput,
  AdminSessionRescheduleInput,
  AuditLogWriteContract,
  DBTransaction,
  NotificationDeliveryReceipt,
  SessionRequestIdempotencySelectType,
  SessionReturnType,
} from "@/backend/types";
import type { getServerTranslations } from "@/shared/locale/server-graphql";

/** The errors-namespace slice, typed once for this module's denial classifiers. */
type GovernanceErrorsTranslations = ReturnType<typeof getServerTranslations>["errorsTranslations"];

/** The audit row's entity label for this surface (the short lowercase entity label). */
const SESSION_ENTITY_TYPE = "session";

/**
 * How far into the past a replacement start instant may still sit: a start
 * older than one grace window before the captured instant is rejected
 * before any database work. The constant is a public validation rule — it
 * lives here, never in the error copy.
 */
export const RESCHEDULE_START_PAST_GRACE_MS = 5 * 60 * 1000;

/**
 * The cancelled status widened to a plain string: the probe row's `status`
 * is the raw pg-enum string union, so the replay comparison needs the enum
 * member's string identity without a runtime conversion — the vocabulary
 * still flows from the enum, never from a bare literal. The started
 * widening this module also compares against is the guards module's shared
 * `SESSION_STARTED_STATUS` (one widening vocabulary for the whole flow
 * family, never a second declaration).
 */
const SESSION_CANCELLED_STATUS: string = SessionStatus.Cancelled;

/**
 * Oracle-safe not-found denial: the unknown-id arm of a zero-row guarded
 * mutation (the admin surface is role-gated upstream, never
 * participant-gated, so there is no foreign-caller arm to fold in here).
 */
export function rejectSessionNotFound(denial: string, sessionId: number, t: GovernanceErrorsTranslations): never {
  logger.logDomainError(denial, {
    code: "SESSION_NOT_FOUND",
    entity: "session",
    entityId: sessionId,
  });
  throw new NotFoundError("SESSION", t.sessionNotFound);
}

/** Lifecycle-state conflict denial: the row exists but missed the guarded predicate. */
export function rejectStateConflict(denial: string, sessionId: number, t: GovernanceErrorsTranslations): never {
  logger.logDomainError(denial, {
    code: "SESSION_INVALID_TRANSITION",
    entity: "session",
    entityId: sessionId,
  });
  throw new ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition);
}

/**
 * Classifies a zero-row guarded miss on this surface by ONE cold probe
 * read: an unknown id is the localized not-found denial, every other miss
 * cause (a terminal row, a disputed row owned by the arbitration surface,
 * or a row mid-transition at the guarded statement's instant) is the
 * localized state conflict.
 */
export async function rejectAdminTransitionMiss(
  denial: string,
  sessionId: number,
  tx: DBTransaction,
  t: GovernanceErrorsTranslations
): Promise<never> {
  const probe = await SessionRepository.findTransitionProbe(sessionId, tx);
  if (probe === null) {
    return rejectSessionNotFound(denial, sessionId, t);
  }
  return rejectStateConflict(denial, sessionId, t);
}

/**
 * Composes the append-only audit contract for one governance mutation: the
 * actor is the verified admin id (never an input), the action is the
 * override vocabulary, and `details` carries field NAMES + timing/teacher
 * metadata + the admin-supplied cancel reason (length-capped upstream) —
 * never credentials, never participant contact data. The audit writer
 * defensively truncates the serialized payload to the column ceiling.
 */
function buildGovernanceAuditContract(
  actorId: number,
  entityId: number,
  details: Record<string, unknown>
): AuditLogWriteContract {
  return {
    actorId,
    actionType: AuditActionType.Override,
    entityType: SESSION_ENTITY_TYPE,
    entityId,
    details: JSON.stringify(details),
  };
}

/**
 * Normalizes the optional admin cancel reason: trimmed, a whitespace-only
 * value collapses to no reason at all, and the length ceiling is already
 * enforced at the boundary schema (a longer payload never reaches this
 * module). The trimmed value is the only form persisted into audit
 * metadata.
 */
export function normalizeAdminCancelReason(reason: string | null | undefined): string | null {
  const trimmed = reason === null || reason === undefined ? null : reason.trim();
  return trimmed !== null && trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves the idempotent replay of an admin cancel, or classifies the
 * conflict. A claim spent by a DIFFERENT caller is denied with the
 * oracle-safe session-not-found error — another caller's claim is never
 * surfaced. A claim spent on a DIFFERENT session is the state conflict.
 * The idempotent replay shape: the row is already cancelled AND the
 * caller's claim exists → the CURRENT row is returned untouched (zero new
 * writes — no duplicate audit row, no second refund). A vanished claim is
 * fail-closed (no claim, no replay arm). Anything else is the conflict.
 */
async function replayAdminCancelOrConflict(
  actorId: number,
  sessionId: number,
  idempotencyKey: string,
  tx: DBTransaction,
  t: GovernanceErrorsTranslations
): Promise<SessionReturnType> {
  const claim = await SessionRequestIdempotencyRepository.findByKey(idempotencyKey, tx);
  if (claim !== null && claim.userId !== actorId) {
    return rejectSessionNotFound("Admin session cancel replay denied: key claimed by another caller", sessionId, t);
  }
  if (claim !== null && claim.sessionId !== null && claim.sessionId !== sessionId) {
    return rejectStateConflict("Admin session cancel replay denied: key spent on a different session", sessionId, t);
  }
  return resolveCancelledReplayOrConflict(sessionId, claim !== null, tx, t);
}

/**
 * The cancel's zero-row miss classification: a row that is ALREADY
 * cancelled while the caller's claim exists is the honest idempotent
 * replay (the requested state is already achieved — the current row is
 * returned with zero new writes); an unknown id is the not-found denial;
 * every other miss cause is the state conflict.
 */
async function resolveCancelledReplayOrConflict(
  sessionId: number,
  claimExists: boolean,
  tx: DBTransaction,
  t: GovernanceErrorsTranslations
): Promise<SessionReturnType> {
  const probe = await SessionRepository.findTransitionProbe(sessionId, tx);
  if (probe === null) {
    return rejectSessionNotFound("Admin session cancel denied: session not found", sessionId, t);
  }
  if (probe.status === SESSION_CANCELLED_STATUS && claimExists) {
    const current = await SessionRepository.getAnyByIdForAdmin(sessionId, tx);
    if (current !== null) {
      return current;
    }
  }
  return rejectStateConflict("Admin session cancel denied: session not cancellable in its current state", sessionId, t);
}

/**
 * The reschedule transaction body (extracted verbatim): the pre-write read
 * captures the timing pair the audit row reports as the "from" values and
 * classifies an unknown id, the guarded UPDATE re-asserts the state
 * eligibility atomically, the single audit row is appended, and the
 * reschedule wave persists as unpublished delivery receipts for both
 * participants. The caller owns the gate, the boundary validation, the
 * transaction composition, and the publish.
 */
export async function rescheduleSessionInTx(
  actorId: number,
  input: AdminSessionRescheduleInput,
  locale: string,
  tx: DBTransaction,
  t: GovernanceErrorsTranslations,
  options?: NotificationEngineCallOptions
): Promise<{ session: SessionReturnType; receipts: NotificationDeliveryReceipt[] }> {
  // The pre-write read is classification + audit-metadata only — it
  // never gates the write (the guarded UPDATE's eligibility clause is
  // the atomic gate). It captures the timing pair the audit row
  // reports as the "from" values.
  const current = await SessionRepository.getAnyByIdForAdmin(input.sessionId, tx);
  if (current === null) {
    return rejectSessionNotFound("Admin reschedule denied: session not found", input.sessionId, t);
  }

  const updated = await SessionRepository.guardReschedule(input.sessionId, input.startedAt, input.endedAt, tx);
  if (updated === null) {
    return rejectAdminTransitionMiss(
      "Admin reschedule denied: session not reschedulable in its current state",
      input.sessionId,
      tx,
      t
    );
  }

  await AuditService.createAuditLog(
    buildGovernanceAuditContract(actorId, input.sessionId, {
      action: "reschedule",
      from: { startedAt: current.startedAt, endedAt: current.endedAt },
      to: { startedAt: input.startedAt, endedAt: input.endedAt },
    }),
    tx
  );

  const receipts = await SessionRequestNotificationService.notifySessionGovernanceRescheduled(
    input.sessionId,
    locale,
    tx,
    options
  );
  return { session: updated, receipts };
}

/**
 * The cancel transaction body (extracted verbatim): the claim — when the
 * caller supplied a key — is inserted savepoint-bracketed BEFORE any
 * session write (a duplicate key resolves the replay branch; any other
 * error surfaces untouched and rolls the whole mutation back, so a failed
 * cancel never burns its key), the guarded cancel UPDATE re-asserts the
 * eligibility atomically, the released hold is refunded through the ONE
 * shared same-lane primitive, exactly ONE audit row is appended, the
 * claim's session pointer is backfilled, and the cancellation wave
 * persists as unpublished delivery receipts for both participants. The
 * caller owns the gate, the key-length guard, the boundary validation, the
 * transaction composition, and the publish.
 */
export async function cancelSessionInTx(
  actorId: number,
  input: AdminSessionCancelInput,
  cancelReason: string | null,
  idempotencyKey: string | null,
  locale: string,
  tx: DBTransaction,
  t: GovernanceErrorsTranslations,
  options?: NotificationEngineCallOptions
): Promise<{ session: SessionReturnType; receipts: NotificationDeliveryReceipt[] }> {
  let claim: SessionRequestIdempotencySelectType | null = null;
  if (idempotencyKey !== null) {
    // The idempotency claim — savepoint-bracketed so a duplicate key
    // poisons only the savepoint, keeping the transaction readable
    // for the replay lookup below.
    try {
      claim = await tx.transaction(claimTx =>
        SessionRequestIdempotencyRepository.insertClaim({ idempotencyKey, userId: actorId }, claimTx)
      );
    } catch (error) {
      if (!isClaimKeyUniqueViolation(error)) {
        // Not a duplicate key — surface untouched; the transaction
        // rolls the whole cancel (and the claim) back together.
        throw error;
      }
      // Duplicate key → the idempotent replay branch.
      return {
        session: await replayAdminCancelOrConflict(actorId, input.sessionId, idempotencyKey, tx, t),
        receipts: [],
      };
    }
  }

  const cancelled = await SessionRepository.guardCancelPreTerminal(input.sessionId, tx);
  if (cancelled === null) {
    return {
      session: await resolveCancelledReplayOrConflict(input.sessionId, claim !== null, tx, t),
      receipts: [],
    };
  }

  // Release the hold to the lane that funded it — same transaction,
  // same lane, through the ONE shared same-lane refund primitive (a
  // row with no recorded lane refunds nothing; an unreadable lane
  // fails closed and rolls the mutation back).
  await refundHeldLaneToProvenance(cancelled, "adminCancelSession", tx);

  await AuditService.createAuditLog(
    buildGovernanceAuditContract(actorId, input.sessionId, {
      action: "cancel",
      reason: cancelReason,
    }),
    tx
  );

  // Backfill the claim's session pointer in the same transaction —
  // the claim and the cancel commit atomically.
  if (claim !== null) {
    await SessionRequestIdempotencyRepository.updateClaimSessionId(claim.id, input.sessionId, tx);
  }

  const receipts = await SessionRequestNotificationService.notifySessionGovernanceCancelled(
    input.sessionId,
    locale,
    tx,
    options
  );
  return { session: cancelled, receipts };
}

/**
 * The teacher-reassignment transaction body (extracted verbatim): the
 * pre-write read captures the outgoing teacher id for the audit metadata
 * (and classifies an unknown session id), the candidate certification lock
 * is held across check → write in the SAME transaction (the `SELECT … FOR
 * UPDATE` read whose certification value the reassignment commits against),
 * the guarded UPDATE re-asserts the scheduled-only eligibility atomically,
 * the single audit row records the outgoing/incoming teacher ids, and the
 * reassignment wave persists as unpublished delivery receipts for the
 * student, the outgoing teacher, and the incoming teacher. The caller owns
 * the gate, the boundary validation, the transaction composition, and the
 * publish.
 */
export async function reassignTeacherInTx(
  actorId: number,
  input: AdminSessionReassignInput,
  locale: string,
  tx: DBTransaction,
  t: GovernanceErrorsTranslations,
  options?: NotificationEngineCallOptions
): Promise<{ session: SessionReturnType; receipts: NotificationDeliveryReceipt[] }> {
  // The pre-write read captures the outgoing teacher id for the audit
  // metadata; the guarded UPDATE below remains the atomic state gate.
  const current = await SessionRepository.getAnyByIdForAdmin(input.sessionId, tx);
  if (current === null) {
    return rejectSessionNotFound("Admin teacher reassignment denied: session not found", input.sessionId, t);
  }

  // The candidate certification lock — the certification value this
  // reassignment commits against (a teacherless id never mints
  // certification).
  const lockedTeacher = await TeacherRepository.lockForCertificationCheck(input.newTeacherUserId, tx);
  if (lockedTeacher === null) {
    logger.logDomainError("Admin teacher reassignment rejected: teacher target not found", {
      code: "TEACHER_NOT_FOUND",
      entity: "session",
      entityId: input.newTeacherUserId,
    });
    throw new NotFoundError("TEACHER", t.teacherNotFound);
  }
  if (lockedTeacher.isApproved !== true) {
    logger.logDomainError("Admin teacher reassignment rejected: teacher not certified", {
      code: "TEACHER_NOT_CERTIFIED",
      entity: "session",
      entityId: input.newTeacherUserId,
    });
    throw new ConflictError("TEACHER_NOT_CERTIFIED", t.teacherNotCertified);
  }

  const updated = await SessionRepository.guardReassignTeacher(input.sessionId, input.newTeacherUserId, tx);
  if (updated === null) {
    return rejectAdminTransitionMiss(
      "Admin teacher reassignment denied: session not reassignable in its current state",
      input.sessionId,
      tx,
      t
    );
  }

  await AuditService.createAuditLog(
    buildGovernanceAuditContract(actorId, input.sessionId, {
      action: "reassign",
      from: { teacherId: current.teacherId },
      to: { teacherId: input.newTeacherUserId },
    }),
    tx
  );

  const receipts = await SessionRequestNotificationService.notifySessionGovernanceTeacherReassigned(
    input.sessionId,
    current.teacherId,
    locale,
    tx,
    options
  );
  return { session: updated, receipts };
}

/**
 * The join transaction body (extracted verbatim): the eligibility
 * re-assertion inside the transaction — the audit write is guarded by this
 * re-check (assertion strictly first, same transaction, so a denied join
 * writes zero audit rows) — followed by the EXACTLY-ONE audit row that
 * makes the observation auditable. The caller owns the pre-write
 * validation read; this body changes NO session column.
 */
export async function joinObservationInTx(
  actorId: number,
  sessionId: number,
  tx: DBTransaction,
  t: GovernanceErrorsTranslations
): Promise<SessionReturnType> {
  // The eligibility re-assertion inside the transaction — the audit
  // write is guarded by this re-check (assertion strictly first, same
  // transaction, so a denied join writes zero audit rows).
  const row = await SessionRepository.getAnyByIdForAdmin(sessionId, tx);
  if (row === null) {
    return rejectSessionNotFound("Admin session join denied: session not found", sessionId, t);
  }
  if (row.status !== SESSION_STARTED_STATUS) {
    return rejectStateConflict("Admin session join denied: session not joinable in its current state", sessionId, t);
  }

  await AuditService.createAuditLog(
    buildGovernanceAuditContract(actorId, sessionId, {
      action: "join_observe",
    }),
    tx
  );
  return row;
}
