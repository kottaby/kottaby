/**
 * SessionAdminGovernanceService — the admin-only governance surface over
 * the `session` entity: the directory read pair (filterable list with the
 * derived attention badge, plus the any-state browse detail) and the four
 * operator mutations (reschedule the timing pair, cancel with the
 * same-lane hold release, reassign the teacher, and join a live session as
 * a read-only observer).
 *
 * Every method opens with the defense-in-depth BFLA gate
 * (`assertActorAdmin`) — the GraphQL scope gate is the first wall, this
 * service-side re-assertion is the second; both denials perform ZERO reads
 * past the gate and ZERO writes. Every user-facing message resolves
 * through `getServerTranslations(locale)`; rejections log via
 * `logger.logDomainError` with `{code, entity, entityId}` only.
 *
 * Mutation discipline (mirrors the session lifecycle's own flows):
 *  - each mutation wraps its writes in ONE `withTransaction(outerTx, …)`
 *    and hands that SAME `tx` to every repository, audit, refund, and
 *    notification call — partial application is impossible;
 *  - state eligibility is enforced by the guarded single-statement
 *    UPDATEs (the eligibility clause IS the atomic gate); a zero-row miss
 *    is classified by ONE cold probe read that never feeds a write
 *    (unknown id → localized not-found; anything else → the localized
 *    state conflict);
 *  - exactly ONE audit row is appended per committed mutation, inside the
 *    same transaction, through the composition-only audit writer; denial
 *    paths append ZERO audit rows;
 *  - the cancel's hold release composes the ONE shared same-lane refund
 *    primitive verbatim (a row with no recorded lane refunds nothing;
 *    an unreadable lane fails closed and rolls the mutation back);
 *  - the cancel is idempotent through the same claim-table mechanism the
 *    booking flow uses: the claim is inserted savepoint-bracketed inside
 *    the mutation transaction, a duplicate key (PG 23505) resolves the
 *    replay, and a replayed cancel returns the already-cancelled row with
 *    zero new writes — no duplicate audit row, no second refund;
 *  - notification waves persist inside the mutation transaction as
 *    unpublished delivery receipts and are published strictly AFTER the
 *    caller's own commit (publish-after-commit — nothing is ever pushed
 *    for a rolled-back emit; on the caller-transaction test path the
 *    publish step is skipped because the caller owns the commit).
 *
 * No module-level mutable state; no swallowed catches; no hardcoded
 * strings.
 */

import {
  SessionRepository,
  SessionRequestIdempotencyRepository,
  TeacherRepository,
} from "@/backend/db/repo";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertActorAdmin } from "@/backend/services/admin/admin-gate.helpers";
import { AuditService } from "@/backend/services/admin/audit.service";
import { SessionRequestNotificationService } from "@/backend/services/classes/session-request-notification.service";
import {
  isClaimKeyUniqueViolation,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  normalizePageBounds,
} from "@/backend/services/classes/session-lifecycle.guards";
import { refundHeldLaneToProvenance } from "@/backend/services/classes/session-lifecycle.transitions";
import { NotificationEngine, type NotificationEngineCallOptions } from "@/backend/services/notifications";
import type {
  AdminSessionCancelInput,
  AdminSessionDetail,
  AdminSessionJoinInput,
  AdminSessionListFilterInput,
  AdminSessionReassignInput,
  AdminSessionRescheduleInput,
  AdminSessionRowReturnType,
  AuditLogWriteContract,
  DBTransaction,
  SessionRequestIdempotencySelectType,
  SessionReturnType,
} from "@/backend/types";
import {
  AdminSessionCancelInputSchema,
  AdminSessionJoinInputSchema,
  AdminSessionListFilterInputSchema,
  AdminSessionReassignInputSchema,
  AdminSessionRescheduleInputSchema,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** The errors-namespace slice, typed once for this module's denial classifiers. */
type ErrorsTranslations = ReturnType<typeof getServerTranslations>["errorsTranslations"];

/** The audit row's entity label for this surface (the short lowercase entity label). */
const SESSION_ENTITY_TYPE = "session";

/**
 * How far into the past a replacement start instant may still sit: a start
 * older than one grace window before the captured instant is rejected
 * before any database work. The constant is a public validation rule — it
 * lives here, never in the error copy.
 */
const RESCHEDULE_START_PAST_GRACE_MS = 5 * 60 * 1000;

/**
 * The lifecycle statuses, widened to plain strings: the probe row's and the
 * browse read's `status` is the raw pg-enum string union, so the replay and
 * eligibility comparisons need the enum members' string identity without a
 * runtime conversion — the vocabulary still flows from the enum, never from
 * a bare literal (mirrors the lifecycle guards' widenings).
 */
const SESSION_STARTED_STATUS: string = SessionStatus.Started;
const SESSION_CANCELLED_STATUS: string = SessionStatus.Cancelled;

/**
 * Oracle-safe not-found denial: the unknown-id arm of a zero-row guarded
 * mutation (the admin surface is role-gated upstream, never
 * participant-gated, so there is no foreign-caller arm to fold in here).
 */
function rejectSessionNotFound(denial: string, sessionId: number, t: ErrorsTranslations): never {
  logger.logDomainError(denial, {
    code: "SESSION_NOT_FOUND",
    entity: "session",
    entityId: sessionId,
  });
  throw new NotFoundError("SESSION", t.sessionNotFound);
}

/** Lifecycle-state conflict denial: the row exists but missed the guarded predicate. */
function rejectStateConflict(denial: string, sessionId: number, t: ErrorsTranslations): never {
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
async function rejectAdminTransitionMiss(
  denial: string,
  sessionId: number,
  tx: DBTransaction,
  t: ErrorsTranslations
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
function normalizeAdminCancelReason(reason: string | null | undefined): string | null {
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
  t: ErrorsTranslations
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
  t: ErrorsTranslations
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

export namespace SessionAdminGovernanceService {
  /**
   * Lists every session for the admin governance directory: ALL rows
   * regardless of state or ownership, newest first, paged, under the
   * caller's optional filter set. The filter is shape-validated against
   * its boundary schema BEFORE any read (a violation is the localized
   * validation denial, never a database round-trip); the page window
   * normalizes before any database work exactly like the participant
   * lists (a page below 1 falls back to the first page, a page size
   * outside 1..50 falls back to the default) and the effective values are
   * what the result echoes. The total is computed by the SAME filtered
   * predicate as the rows, so it can never diverge from the items. The
   * read is strictly side-effect free: no session, audit, or notification
   * write exists on this path.
   *
   * @param actorId  The acting admin's id (context-resolved server-side
   *     by the caller; shared PK with the users table).
   * @param filter  The optional directory filter (absent members drop
   *     out; the creation window is half-open over `createdAt`).
   * @param page  Requested page (≥ 1; invalid values normalize to 1).
   * @param pageSize  Requested page size (1..50; invalid values normalize
   *     to the default).
   * @param locale  Active request locale (for the localized error
   *     messages).
   * @param tx  Optional transaction — propagated to the admin gate and
   *     both reads so a caller-owned atomic flow stays atomic.
   */
  export async function listAll(
    actorId: number,
    filter: AdminSessionListFilterInput,
    page: number,
    pageSize: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<{
    readonly items: readonly AdminSessionRowReturnType[];
    readonly totalCount: number;
    readonly page: number;
    readonly pageSize: number;
  }> {
    const t = getServerTranslations(locale).errorsTranslations;

    // The service-side BFLA gate — the FIRST statement of every method.
    await assertActorAdmin(actorId, locale, tx);

    // Shape-validate the filter BEFORE any read; a violation (including an
    // inverted creation window) is the localized validation denial.
    const parsedFilter = AdminSessionListFilterInputSchema.safeParse(filter);
    if (!parsedFilter.success) {
      throw new ValidationError(t.validation);
    }

    const bounds = normalizePageBounds(page, pageSize);
    const directoryPage = await SessionRepository.listForAdmin(parsedFilter.data, bounds.page, bounds.pageSize, tx);
    return { items: directoryPage.rows, totalCount: directoryPage.total, page: bounds.page, pageSize: bounds.pageSize };
  }

  /**
   * Reads one session for the admin browse/detail view: the row for ANY id
   * regardless of lifecycle state (the view is read-only and role-gated
   * upstream). A nonexistent id — and equally a malformed one, which is
   * caught by the pre-read shape guard — resolves to `null`, never to a
   * thrown not-found error: the browse plane answers "no such row" with
   * data. The read is strictly side-effect free.
   *
   * @param actorId  The acting admin's id.
   * @param sessionId  The target session id.
   * @param locale  Active request locale (for the localized error
   *     messages).
   * @param tx  Optional transaction — propagated to the admin gate and
   *     the read.
   */
  export async function getDetail(
    actorId: number,
    sessionId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<AdminSessionDetail> {
    await assertActorAdmin(actorId, locale, tx);

    // Oracle-safe malformed-id channel: anything that is not a positive
    // safe integer resolves to the SAME `null` as a nonexistent id, before
    // any database read (this browse surface never throws for shape).
    if (!(Number.isSafeInteger(sessionId) && sessionId > 0)) {
      return null;
    }
    return SessionRepository.getAnyByIdForAdmin(sessionId, tx);
  }

  /**
   * Reschedules a session's timing pair (the two states with mutable
   * timing are the pre-start and in-progress ones) as an ADMIN.
   *
   * Validation runs BEFORE any read: the boundary schema shape-guards the
   * payload (an inverted or zero-width timing pair is the localized
   * window-invalid denial — the schema's only refinement is exactly that
   * rule — while every other shape violation is the generic validation
   * denial), and the replacement start may not sit further than one grace
   * window into the past relative to the captured instant.
   *
   * Inside ONE transaction: the pre-write row read captures the timing
   * the audit metadata reports as the "from" values (and classifies an
   * unknown id), the guarded UPDATE re-asserts the state eligibility
   * atomically (a zero-row miss is classified by the cold probe), the
   * single audit row is appended on the same transaction, and the
   * reschedule wave persists as unpublished delivery receipts for both
   * participants — published strictly after this call's own commit.
   *
   * @param actorId  The acting admin's id.
   * @param input  The target session id and the replacement timing pair.
   * @param locale  Active request locale.
   * @param outerTx  Optional outer transaction. When provided (test
   *     path), the flow runs inside a SAVEPOINT on it; production callers
   *     omit it and the service opens its own transaction.
   * @param options  Optional notification-engine call options (the
   *     transport/claim-cache injection seam).
   */
  export async function reschedule(
    actorId: number,
    input: AdminSessionRescheduleInput,
    locale: string,
    outerTx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    await assertActorAdmin(actorId, locale, outerTx);

    // Boundary validation BEFORE any read. The schema carries exactly one
    // refinement — the ordered timing pair — so a refinement rejection is
    // the window-invalid denial and every other issue is a shape issue.
    const parsed = AdminSessionRescheduleInputSchema.safeParse(input);
    if (!parsed.success) {
      const orderingViolated = parsed.error.issues.some(issue => issue.code === "custom");
      if (orderingViolated) {
        logger.logDomainError("Admin reschedule denied: replacement timing pair is not ordered", {
          code: "SESSION_RESCHEDULE_WINDOW_INVALID",
          entity: "session",
          entityId: input.sessionId,
        });
        throw new ValidationError("SESSION_RESCHEDULE_WINDOW_INVALID", t.sessionRescheduleWindowInvalid);
      }
      throw new ValidationError(t.validation);
    }

    // One captured instant governs the grace comparison.
    const now = new Date();
    if (parsed.data.startedAt.getTime() < now.getTime() - RESCHEDULE_START_PAST_GRACE_MS) {
      logger.logDomainError("Admin reschedule denied: replacement start is further than the grace window in the past", {
        code: "SESSION_RESCHEDULE_START_IN_PAST",
        entity: "session",
        entityId: parsed.data.sessionId,
      });
      throw new ValidationError("SESSION_RESCHEDULE_START_IN_PAST", t.sessionRescheduleStartInPast);
    }

    const outcome = await withTransaction(outerTx, async tx => {
      // The pre-write read is classification + audit-metadata only — it
      // never gates the write (the guarded UPDATE's eligibility clause is
      // the atomic gate). It captures the timing pair the audit row
      // reports as the "from" values.
      const current = await SessionRepository.getAnyByIdForAdmin(parsed.data.sessionId, tx);
      if (current === null) {
        return rejectSessionNotFound("Admin reschedule denied: session not found", parsed.data.sessionId, t);
      }

      const updated = await SessionRepository.guardReschedule(
        parsed.data.sessionId,
        parsed.data.startedAt,
        parsed.data.endedAt,
        tx
      );
      if (updated === null) {
        return rejectAdminTransitionMiss(
          "Admin reschedule denied: session not reschedulable in its current state",
          parsed.data.sessionId,
          tx,
          t
        );
      }

      await AuditService.createAuditLog(
        buildGovernanceAuditContract(actorId, parsed.data.sessionId, {
          action: "reschedule",
          from: { startedAt: current.startedAt, endedAt: current.endedAt },
          to: { startedAt: parsed.data.startedAt, endedAt: parsed.data.endedAt },
        }),
        tx
      );

      const receipts = await SessionRequestNotificationService.notifySessionGovernanceRescheduled(
        parsed.data.sessionId,
        locale,
        tx,
        options
      );
      return { session: updated, receipts };
    });

    // Publish AFTER commit — and only when THIS call owns the commit (on
    // the caller-transaction path the caller publishes).
    if (outerTx === undefined) {
      await NotificationEngine.publishReceipts(outcome.receipts, locale, options);
    }
    return outcome.session;
  }

  /**
   * Cancels a pre-terminal session as an ADMIN, releasing the held fee
   * back to the lane that funded it.
   *
   * The optional idempotency key reuses the booking flow's claim-table
   * mechanism verbatim: when present, the claim is inserted
   * savepoint-bracketed inside the mutation transaction (a duplicate key
   * resolves the replay branch; any other error surfaces untouched and
   * rolls the whole mutation back, so a failed cancel never burns its
   * key). The replayed cancel returns the already-cancelled row untouched
   * — zero new writes, no duplicate audit row, no second refund. A key
   * spent by a DIFFERENT caller is denied with the oracle-safe
   * session-not-found error; a key spent on a DIFFERENT session is the
   * state conflict.
   *
   * Inside ONE transaction: the guarded cancel UPDATE re-asserts the
   * eligibility atomically (a row taken out of the eligible set —
   * including a disputed row, which belongs to the arbitration surface —
   * yields the zero-row miss whose classification may resolve the
   * idempotent replay when the row is already cancelled and the caller's
   * claim exists), the released hold is refunded through the ONE shared
   * same-lane primitive on the returned row (a row with no recorded lane
   * refunds nothing), exactly ONE audit row is appended (the admin reason
   * trimmed inside its metadata), the claim's session pointer is
   * backfilled, and the cancellation wave persists as unpublished
   * delivery receipts for both participants — published strictly after
   * this call's own commit.
   *
   * @param actorId  The acting admin's id.
   * @param input  The target session id plus the optional free-text
   *     reason (length-capped at the boundary; trimmed here).
   * @param locale  Active request locale.
   * @param idempotencyKey  Optional idempotency key — carried verbatim
   *     (never trimmed, never coerced, never logged); absent disables the
   *     claim mechanism for this call.
   * @param outerTx  Optional outer transaction (test path — SAVEPOINT).
   * @param options  Optional notification-engine call options.
   */
  export async function cancel(
    actorId: number,
    input: AdminSessionCancelInput,
    locale: string,
    idempotencyKey?: string | null,
    outerTx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    await assertActorAdmin(actorId, locale, outerTx);

    const parsed = AdminSessionCancelInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t.validation);
    }
    const cancelReason = normalizeAdminCancelReason(parsed.data.reason);

    // A present key must fit the claim column (carried verbatim — the
    // same guard the booking flow applies; an absent key disables the
    // claim mechanism for this call).
    if (idempotencyKey !== null && idempotencyKey !== undefined) {
      if (idempotencyKey.length === 0 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
        throw new ValidationError(t.idempotencyKeyRequired);
      }
    }

    const outcome = await withTransaction(outerTx, async tx => {
      let claim: SessionRequestIdempotencySelectType | null = null;
      if (idempotencyKey !== null && idempotencyKey !== undefined) {
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
          return { session: await replayAdminCancelOrConflict(actorId, parsed.data.sessionId, idempotencyKey, tx, t), receipts: [] };
        }
      }

      const cancelled = await SessionRepository.guardCancelPreTerminal(parsed.data.sessionId, tx);
      if (cancelled === null) {
        return {
          session: await resolveCancelledReplayOrConflict(parsed.data.sessionId, claim !== null, tx, t),
          receipts: [],
        };
      }

      // Release the hold to the lane that funded it — same transaction,
      // same lane, through the ONE shared same-lane refund primitive (a
      // row with no recorded lane refunds nothing; an unreadable lane
      // fails closed and rolls the mutation back).
      await refundHeldLaneToProvenance(cancelled, "adminCancelSession", tx);

      await AuditService.createAuditLog(
        buildGovernanceAuditContract(actorId, parsed.data.sessionId, {
          action: "cancel",
          reason: cancelReason,
        }),
        tx
      );

      // Backfill the claim's session pointer in the same transaction —
      // the claim and the cancel commit atomically.
      if (claim !== null) {
        await SessionRequestIdempotencyRepository.updateClaimSessionId(claim.id, parsed.data.sessionId, tx);
      }

      const receipts = await SessionRequestNotificationService.notifySessionGovernanceCancelled(
        parsed.data.sessionId,
        locale,
        tx,
        options
      );
      return { session: cancelled, receipts };
    });

    if (outerTx === undefined) {
      await NotificationEngine.publishReceipts(outcome.receipts, locale, options);
    }
    return outcome.session;
  }

  /**
   * Reassigns a scheduled session to a different teacher as an ADMIN.
   *
   * The candidate teacher's certification is asserted inside the mutation
   * transaction BEFORE the guarded write, through the same locking read
   * the booking flow uses: the `SELECT … FOR UPDATE` row lock is held
   * until this transaction resolves, so the certification value the check
   * sees is the value the reassignment commits against — no flip window.
   * A candidate that is not a teacher at all is the localized not-found
   * denial; a teacher row without an active approval flag is the
   * localized certification conflict. Inside ONE transaction the
   * pre-write row read captures the outgoing teacher id for the audit
   * metadata (and classifies an unknown session id), the certification
   * lock runs, the guarded UPDATE re-asserts the scheduled-only
   * eligibility atomically (a disputed row is structurally unreachable —
   * an open dispute belongs to the arbitration surface), the single audit
   * row records the outgoing/incoming teacher ids, and the reassignment
   * wave persists as unpublished delivery receipts for the student, the
   * outgoing teacher, and the incoming teacher — published strictly
   * after this call's own commit.
   *
   * @param actorId  The acting admin's id.
   * @param input  The target session id and the candidate teacher's user
   *     id.
   * @param locale  Active request locale.
   * @param outerTx  Optional outer transaction (test path — SAVEPOINT).
   * @param options  Optional notification-engine call options.
   */
  export async function reassignTeacher(
    actorId: number,
    input: AdminSessionReassignInput,
    locale: string,
    outerTx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    await assertActorAdmin(actorId, locale, outerTx);

    const parsed = AdminSessionReassignInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t.validation);
    }

    const outcome = await withTransaction(outerTx, async tx => {
      // The pre-write read captures the outgoing teacher id for the audit
      // metadata; the guarded UPDATE below remains the atomic state gate.
      const current = await SessionRepository.getAnyByIdForAdmin(parsed.data.sessionId, tx);
      if (current === null) {
        return rejectSessionNotFound("Admin teacher reassignment denied: session not found", parsed.data.sessionId, t);
      }

      // The candidate certification lock — the certification value this
      // reassignment commits against (a teacherless id never mints
      // certification).
      const lockedTeacher = await TeacherRepository.lockForCertificationCheck(parsed.data.newTeacherUserId, tx);
      if (lockedTeacher === null) {
        logger.logDomainError("Admin teacher reassignment rejected: teacher target not found", {
          code: "TEACHER_NOT_FOUND",
          entity: "session",
          entityId: parsed.data.newTeacherUserId,
        });
        throw new NotFoundError("TEACHER", t.teacherNotFound);
      }
      if (lockedTeacher.isApproved !== true) {
        logger.logDomainError("Admin teacher reassignment rejected: teacher not certified", {
          code: "TEACHER_NOT_CERTIFIED",
          entity: "session",
          entityId: parsed.data.newTeacherUserId,
        });
        throw new ConflictError("TEACHER_NOT_CERTIFIED", t.teacherNotCertified);
      }

      const updated = await SessionRepository.guardReassignTeacher(
        parsed.data.sessionId,
        parsed.data.newTeacherUserId,
        tx
      );
      if (updated === null) {
        return rejectAdminTransitionMiss(
          "Admin teacher reassignment denied: session not reassignable in its current state",
          parsed.data.sessionId,
          tx,
          t
        );
      }

      await AuditService.createAuditLog(
        buildGovernanceAuditContract(actorId, parsed.data.sessionId, {
          action: "reassign",
          from: { teacherId: current.teacherId },
          to: { teacherId: parsed.data.newTeacherUserId },
        }),
        tx
      );

      const receipts = await SessionRequestNotificationService.notifySessionGovernanceTeacherReassigned(
        parsed.data.sessionId,
        current.teacherId,
        locale,
        tx,
        options
      );
      return { session: updated, receipts };
    });

    if (outerTx === undefined) {
      await NotificationEngine.publishReceipts(outcome.receipts, locale, options);
    }
    return outcome.session;
  }

  /**
   * Joins a live (in-progress) session as a read-only ADMIN observer.
   *
   * The operation is audit-only: it changes NO session column and writes
   * EXACTLY ONE audit row. Eligibility is validated BEFORE any write
   * (a pre-transaction read answers the not-started and unknown-id
   * denials with zero audit rows), then re-asserted atomically inside the
   * transaction and the audit write is guarded by that re-check — the
   * assertion and the audit append share one transaction with the
   * assertion strictly first, so a denied join can never leave an audit
   * row behind. The returned row is the same canonical shape the
   * participant read paths return (data reuse — the admin UI renders the
   * read-only live view from it).
   *
   * @param actorId  The acting admin's id.
   * @param input  The target session id.
   * @param locale  Active request locale.
   * @param outerTx  Optional outer transaction (test path — SAVEPOINT).
   */
  export async function join(
    actorId: number,
    input: AdminSessionJoinInput,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    await assertActorAdmin(actorId, locale, outerTx);

    const parsed = AdminSessionJoinInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t.validation);
    }

    // Pre-transaction eligibility read — validate BEFORE any write. Both
    // denial arms below append zero audit rows and flip zero columns.
    const preRead = await SessionRepository.getAnyByIdForAdmin(parsed.data.sessionId, outerTx);
    if (preRead === null) {
      return rejectSessionNotFound("Admin session join denied: session not found", parsed.data.sessionId, t);
    }
    if (preRead.status !== SESSION_STARTED_STATUS) {
      return rejectStateConflict(
        "Admin session join denied: session not joinable in its current state",
        parsed.data.sessionId,
        t
      );
    }

    return withTransaction(outerTx, async tx => {
      // The eligibility re-assertion inside the transaction — the audit
      // write is guarded by this re-check (assertion strictly first, same
      // transaction, so a denied join writes zero audit rows).
      const row = await SessionRepository.getAnyByIdForAdmin(parsed.data.sessionId, tx);
      if (row === null) {
        return rejectSessionNotFound("Admin session join denied: session not found", parsed.data.sessionId, t);
      }
      if (row.status !== SESSION_STARTED_STATUS) {
        return rejectStateConflict(
          "Admin session join denied: session not joinable in its current state",
          parsed.data.sessionId,
          t
        );
      }

      await AuditService.createAuditLog(
        buildGovernanceAuditContract(actorId, parsed.data.sessionId, {
          action: "join_observe",
        }),
        tx
      );
      return row;
    });
  }
}
