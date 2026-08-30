/**
 * SessionLifecycleService — the booking + lifecycle state machine for the
 * `session` entity (scheduled → started → completed | cancelled).
 *
 * Booking (`createSession`) composes FOUR writes inside ONE transaction, in a
 * fixed order that is never reordered:
 *   1. the teacher certification lock (a `SELECT … FOR UPDATE` read whose
 *      certification value is the one the booking commits against);
 *   2. the guarded trial-first balance debit ladder (the trial lane is
 *      attempted first, then the intent's own lane; an all-miss booking
 *      throws and the transaction rolls back — the rollback is the only
 *      cleanup, no compensating writes exist);
 *   3. the idempotency claim insert (savepoint-bracketed so a duplicate key
 *      rolls back only the claim statement and keeps the surrounding
 *      transaction readable for the replay lookup);
 *   4. the session insert with server-side defaults (lifecycle state, type,
 *      intent, platform fee, hold marker + provenance lane, confirmation
 *      deadline) followed by the claim's session-id backfill.
 * A replayed booking (duplicate claim key) resolves to the already-created
 * session — a success-equivalent outcome for the retried caller.
 *
 * Transitions (`startSession` / `completeSession` / `cancelSession`) are
 * single guarded repository UPDATEs; a zero-row match is classified by ONE
 * cold probe read that never influences any write. Cancellation refunds the
 * lane that funded the hold inside the same transaction, and keeps the start
 * stamp while never writing an end stamp. Reads are participant-scoped and
 * oracle-safe: a foreign id is indistinguishable from a nonexistent one.
 *
 * Governance re-checks (deleted/blocked/suspended callers) re-assert the
 * login/SSR fail-closed gate at the service boundary as defense in depth.
 * Cancellation is deliberately exempt so a governed participant can still
 * release an in-flight hold later.
 *
 * Side-effect-free by contract: this module imports nothing from the
 * notification, audit, wallet, transaction-ledger, or report surfaces. All
 * user-facing messages resolve through `getServerTranslations(locale)`;
 * rejections log via `logger.logDomainError` with `{code, entity, entityId}`
 * only — never idempotency keys, payloads, or the other participant's data.
 * No module-level mutable state; no swallowed catches; every mutation flow
 * is one transaction with `tx` propagated to every repository call.
 */

import {
  SessionRepository,
  SessionRequestIdempotencyRepository,
  StudentRepository,
  TeacherRepository,
  UserRepository,
} from "@/backend/db/repo";
import { HeldBalanceLane, isHeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { ConflictError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { withTransaction } from "@/backend/services/shared/withTransaction";
import type {
  DBTransaction,
  SessionListFilterInput,
  SessionPageReturnType,
  SessionRequestIdempotencySelectType,
  SessionReturnType,
  SessionStudentIntentType,
  SessionSubmitInput,
} from "@/backend/types";
import {
  SESSION_CONFIRMATION_WINDOW_MS,
  SESSION_FEE_HIFZ,
  SESSION_FEE_TAJWEED,
} from "@/shared/constants/session-fees.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** The idempotency claim column's maximum key length (varchar(128) backstop). */
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/** A cancellation reason longer than this is rejected before any DB work. */
const MAX_CANCEL_REASON_LENGTH = 500;

/** Default page size for the participant session lists. */
const DEFAULT_PAGE_SIZE = 25;

/** Inclusive upper page-size bound for the participant session lists. */
const MAX_PAGE_SIZE = 50;

/**
 * The in-progress status widened to a plain string at module scope: the
 * probe row's status is the raw pg-enum string union, so the comparison
 * needs the enum member's string identity without a runtime conversion —
 * the vocabulary still flows from the enum, never from a bare literal.
 */
const SESSION_STARTED_STATUS: string = SessionStatus.Started;

/**
 * Resolves the platform fee constant for a bookable intent. The fee is a
 * decimal string carried verbatim into the insert — never a number, never
 * arithmetic.
 */
function sessionFeeForIntent(intent: SessionStudentIntentType): string {
  return intent === SessionIntent.Hifz ? SESSION_FEE_HIFZ : SESSION_FEE_TAJWEED;
}

/**
 * Resolves the balance lane that funds a bookable intent's hold — the lane
 * the debit ladder falls back to when the trial lane is empty, and the
 * provenance recorded on the session row.
 */
function intentLaneFor(intent: SessionStudentIntentType): HeldBalanceLane {
  return intent === SessionIntent.Hifz ? HeldBalanceLane.Hifz : HeldBalanceLane.Tajweed;
}

/** Positive safe-integer guard for caller-supplied identifiers (no casts). */
function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Detects the PostgreSQL unique-violation (`23505`) behind a thrown error by
 * traversing the cause chain (Drizzle wraps driver errors — the code lives
 * on a cause, never on the top-level wrapper). A cycle-safe `seen` set
 * guards against self-referential chains. The error MESSAGE is never
 * consulted.
 */
function isClaimKeyUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export namespace SessionLifecycleService {
  /**
   * Books one session for the acting student against a certified teacher.
   *
   * Pre-DB boundary validation rejects an empty/overlong idempotency key,
   * non-positive-unsafe participant identifiers, and a non-bookable intent
   * before any database work. The acting student's governance state is
   * re-asserted (deleted/blocked/suspended callers are denied). One instant
   * is captured for the whole flow; the confirmation deadline derives from
   * it. Inside one transaction the certification lock, the trial-first
   * debit ladder, the idempotency claim, and the session insert + claim
   * backfill run in a fixed order; any failure rolls the whole booking back,
   * which also releases the claim (a failed booking never burns its key).
   *
   * On a duplicate claim key the flow replays: a claim owned by the same
   * caller resolves to the already-created session (success-equivalent); a
   * stale claim without a session pointer surfaces the duplicate-replay
   * conflict; a key spent by a different caller is denied with the
   * oracle-safe session-not-found error.
   *
   * @param studentId  The acting student's id (context-resolved server-side
   *     by the caller; shared PK with the users table).
   * @param input  The client-controlled booking whitelist (target teacher +
   *     intent only — every other column is server-owned).
   * @param idempotencyKey  The captured request idempotency key, carried
   *     verbatim (never trimmed, never coerced, never logged).
   * @param locale  Active request locale (for the localized error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it; production callers omit it
   *     and the service opens its own transaction.
   * @returns The booked session row — or, on a replay, the exact row the
   *     original request created.
   */
  export async function createSession(
    studentId: number,
    input: SessionSubmitInput,
    idempotencyKey: string,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Pre-DB boundary validation — fail before any database work.
    if (!isPositiveSafeInteger(studentId)) {
      throw new ValidationError(t.validation);
    }
    if (!isPositiveSafeInteger(input.teacherId)) {
      throw new ValidationError(t.validation);
    }
    if (idempotencyKey.length === 0 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new ValidationError(t.idempotencyKeyRequired);
    }
    if (input.intent !== SessionIntent.Hifz && input.intent !== SessionIntent.Tajweed) {
      throw new ValidationError(t.invalidSessionIntent);
    }

    // Governance re-check — the acting student must be governance-clean.
    await assertActorGovernanceClean(studentId, t, outerTx);

    // One captured instant governs every derivation in this flow.
    const now = new Date();

    return withTransaction(outerTx, async tx => {
      // The teacher certification lock — the certification value this
      // booking commits against (a teacherless id never mints certification).
      const lockedTeacher = await TeacherRepository.lockForCertificationCheck(input.teacherId, tx);
      if (lockedTeacher === null) {
        logger.logDomainError("Session booking rejected: teacher target not found", {
          code: "TEACHER_NOT_FOUND",
          entity: "session",
          entityId: input.teacherId,
        });
        throw new NotFoundError("TEACHER", t.teacherNotFound);
      }
      if (lockedTeacher.isApproved !== true) {
        logger.logDomainError("Session booking rejected: teacher not certified", {
          code: "TEACHER_NOT_CERTIFIED",
          entity: "session",
          entityId: input.teacherId,
        });
        throw new ConflictError("TEACHER_NOT_CERTIFIED", t.teacherNotCertified);
      }

      // Trial-first debit ladder: the trial lane is always attempted first,
      // then the intent's own lane. An all-miss booking throws — the
      // transaction rollback is the only cleanup.
      let heldLane: HeldBalanceLane;
      const trialDebited = await StudentRepository.decrementLaneIfAvailable(studentId, HeldBalanceLane.Trial, tx);
      if (trialDebited) {
        heldLane = HeldBalanceLane.Trial;
      } else {
        const intentLane = intentLaneFor(input.intent);
        const intentDebited = await StudentRepository.decrementLaneIfAvailable(studentId, intentLane, tx);
        if (!intentDebited) {
          logger.logDomainError("Session booking rejected: insufficient balance", {
            code: "INSUFFICIENT_BALANCE",
            entity: "session",
            entityId: studentId,
          });
          throw new ValidationError("INSUFFICIENT_BALANCE", t.insufficientBalance);
        }
        heldLane = intentLane;
      }

      // The idempotency claim — savepoint-bracketed so a duplicate key
      // poisons only the savepoint, keeping the transaction readable for the
      // replay lookup below.
      let claim: SessionRequestIdempotencySelectType;
      try {
        claim = await tx.transaction(claimTx =>
          SessionRequestIdempotencyRepository.insertClaim({ idempotencyKey, userId: studentId }, claimTx)
        );
      } catch (error) {
        if (!isClaimKeyUniqueViolation(error)) {
          // Not a duplicate key — surface untouched; the transaction rolls
          // the whole booking (and the claim) back together.
          throw error;
        }
        // Duplicate key → the idempotent replay branch.
        return replayBooking(idempotencyKey, studentId, tx, t);
      }

      // The session insert — every server-controlled column is set here,
      // field by field (BOPLA: never a spread of caller input). The fee is
      // the platform constant for the intent, carried verbatim as a decimal
      // string; the confirmation deadline is the captured instant plus the
      // platform confirmation window.
      const createdSession = await SessionRepository.insertSession(
        {
          teacherId: input.teacherId,
          studentId,
          status: SessionStatus.Scheduled,
          sessionType: SessionType.StudentSession,
          intent: input.intent,
          fee: sessionFeeForIntent(input.intent),
          feeHeld: true,
          heldBalanceLane: heldLane,
          confirmationDeadline: new Date(now.getTime() + SESSION_CONFIRMATION_WINDOW_MS),
        },
        tx
      );

      // Backfill the claim's session pointer in the same transaction — the
      // claim and the session commit atomically.
      await SessionRequestIdempotencyRepository.updateClaimSessionId(claim.id, createdSession.id, tx);

      return createdSession;
    });
  }

  /**
   * Starts a scheduled session exactly once, as its owning teacher.
   *
   * The teacher's governance state is re-asserted first. The guarded
   * transition writes the start and audit stamps from one captured instant
   * and never touches the confirmation deadline. A zero-row match is
   * classified by one cold probe read: an unknown id and a non-owning
   * caller both surface the oracle-safe session-not-found error, and any
   * other miss cause is a lifecycle-state conflict.
   *
   * @param teacherUserId  The acting teacher's id (shared PK — the value
   *     stored in the session row's teacher column).
   * @param sessionId  The target session id.
   * @param locale  Active request locale (for the localized error messages).
   * @param tx  Optional transaction — propagated to every read and write so
   *     a caller-owned atomic flow stays atomic.
   */
  export async function startSession(
    teacherUserId: number,
    sessionId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Governance re-check — the acting teacher must be governance-clean.
    await assertActorGovernanceClean(teacherUserId, t, tx);

    const started = await SessionRepository.startSessionOnce(sessionId, teacherUserId, tx);
    if (started === null) {
      throw await rejectTransitionMiss("teacherStart", sessionId, teacherUserId, tx, t);
    }
    return started;
  }

  /**
   * Completes a started session exactly once, as its owning teacher.
   *
   * The teacher's governance state is re-asserted first. The guarded
   * transition fuses the certification re-assertion into its own predicate —
   * a teacher decertified between booking and completion matches zero rows —
   * and writes the end, confirmation, and audit stamps from one captured
   * instant. Report or homework side effects are deliberately absent: this
   * transition touches only the session row. A zero-row match is classified
   * by one cold probe read (unknown/foreign → not-found; wrong state →
   * transition conflict; owned + in-progress → certification conflict).
   *
   * @param teacherUserId  The acting teacher's id (shared PK — the value
   *     stored in the session row's teacher column).
   * @param sessionId  The target session id.
   * @param locale  Active request locale (for the localized error messages).
   * @param tx  Optional transaction — propagated to every read and write so
   *     a caller-owned atomic flow stays atomic.
   */
  export async function completeSession(
    teacherUserId: number,
    sessionId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Governance re-check — the acting teacher must be governance-clean.
    await assertActorGovernanceClean(teacherUserId, t, tx);

    const completed = await SessionRepository.completeSessionOnce(sessionId, teacherUserId, tx);
    if (completed === null) {
      throw await rejectTransitionMiss("teacherComplete", sessionId, teacherUserId, tx, t);
    }
    return completed;
  }

  /**
   * Cancels a cancellable session (pre-start or in-progress) as either
   * participant, releasing the held fee back to the lane that funded it.
   *
   * Deliberately NO governance re-check: releasing an in-flight hold stays
   * available to a governed participant (governance flips never rewrite
   * history). The optional reason is length-guarded and then DISCARDED —
   * this flow persists no reason; the session status-history surface owns
   * that persistence. The guarded transition keeps the start stamp and never
   * writes an end stamp. On success, a row whose provenance lane is set is
   * refunded by one unit on that same lane inside the same transaction
   * (unguarded increment — the lane that paid is refunded exactly once);
   * a terminal or foreign target is classified by one cold probe read
   * (unknown/non-participant → not-found; anything else → transition
   * conflict), so a double cancel can never double-refund.
   *
   * @param callerUserId  The acting participant's id (the session's student
   *     or its teacher).
   * @param sessionId  The target session id.
   * @param reason  Optional free-text reason — validated (≤500 chars) and
   *     deliberately not persisted by this flow.
   * @param locale  Active request locale (for the localized error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it; production callers omit it
   *     and the service opens its own transaction.
   */
  export async function cancelSession(
    callerUserId: number,
    sessionId: number,
    reason: string | null,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // The reason is guarded, then discarded — never persisted by this flow.
    if (reason !== null && reason.trim().length > MAX_CANCEL_REASON_LENGTH) {
      throw new ValidationError(t.validation);
    }

    return withTransaction(outerTx, async tx => {
      const cancelled = await SessionRepository.cancelSessionOnce(sessionId, callerUserId, tx);
      if (cancelled === null) {
        throw await rejectTransitionMiss("participantCancel", sessionId, callerUserId, tx, t);
      }

      // Refund the lane that funded the hold — same transaction, same lane.
      // The provenance column is a varchar read back from the row: an
      // unreadable value fails closed (the refusal rolls the cancellation
      // back, leaving the hold and the row consistent).
      if (cancelled.heldBalanceLane !== null) {
        if (!isHeldBalanceLane(cancelled.heldBalanceLane)) {
          logger.error("Session cancellation blocked: unreadable held-balance lane", {
            sessionId: cancelled.id,
          });
          throw new Error("SessionLifecycleService.cancelSession: unreadable held-balance lane");
        }
        await StudentRepository.incrementLane(cancelled.studentId, cancelled.heldBalanceLane, tx);
      }

      return cancelled;
    });
  }

  /**
   * Reads one session for a participant: the row is returned only when the
   * caller is the session's student or its teacher. A nonexistent id and a
   * non-participant caller resolve to the identical `null` (oracle-safe —
   * the two cases are indistinguishable). Unknown/garbage ids degrade to
   * `null` through the parameterized lookup; no error is raised.
   *
   * @param callerUserId  The calling participant's id.
   * @param sessionId  The target session id.
   * @param tx  Optional transaction — propagated so a caller-owned atomic
   *     flow stays atomic.
   */
  export async function getSessionById(
    callerUserId: number,
    sessionId: number,
    tx?: DBTransaction
  ): Promise<SessionReturnType | null> {
    const row = await SessionRepository.findById(sessionId, tx);
    if (row === null) {
      return null;
    }
    if (row.studentId !== callerUserId && row.teacherId !== callerUserId) {
      return null;
    }
    return row;
  }

  /**
   * Lists the acting student's own sessions, newest first, paged.
   *
   * Page bounds are normalized before any database work: a page below 1
   * falls back to the first page and a page size outside 1..50 falls back to
   * the default (25) — the read surface never fabricates a window, and the
   * returned `page`/`pageSize` echo the effective values honestly. The
   * lifecycle filter is guarded against the closed status vocabulary (an
   * out-of-vocabulary value drops out — filters never error); the total
   * count is computed under the SAME filtered predicate as the list, so
   * `totalCount` can never diverge from the items.
   *
   * @param studentId  The acting student's id (owner-side scoping).
   * @param filter  Optional lifecycle filter (absent/null members drop out).
   * @param page  Requested page (≥ 1; invalid values normalize to 1).
   * @param pageSize  Requested page size (1..50; invalid values normalize
   *     to the default).
   * @param tx  Optional transaction — propagated to both reads.
   */
  export async function listMyStudentSessions(
    studentId: number,
    filter: SessionListFilterInput,
    page: number,
    pageSize: number,
    tx?: DBTransaction
  ): Promise<SessionPageReturnType> {
    const bounds = normalizePageBounds(page, pageSize);
    const guardedFilter = guardStatusFilter(filter);

    const items = await SessionRepository.listForStudent(
      studentId,
      guardedFilter,
      bounds.pageSize,
      (bounds.page - 1) * bounds.pageSize,
      tx
    );
    const totalCount = await SessionRepository.countForStudent(studentId, guardedFilter, tx);

    return { items, totalCount, page: bounds.page, pageSize: bounds.pageSize };
  }

  /**
   * Lists the acting teacher's own sessions — the teacher-side twin of
   * `listMyStudentSessions`, with identical paging, guarding, filtering,
   * and honest-echo semantics over the owning-teacher predicate.
   *
   * @param teacherId  The acting teacher's id (owner-side scoping).
   * @param filter  Optional lifecycle filter (absent/null members drop out).
   * @param page  Requested page (≥ 1; invalid values normalize to 1).
   * @param pageSize  Requested page size (1..50; invalid values normalize
   *     to the default).
   * @param tx  Optional transaction — propagated to both reads.
   */
  export async function listMyTeacherSessions(
    teacherId: number,
    filter: SessionListFilterInput,
    page: number,
    pageSize: number,
    tx?: DBTransaction
  ): Promise<SessionPageReturnType> {
    const bounds = normalizePageBounds(page, pageSize);
    const guardedFilter = guardStatusFilter(filter);

    const items = await SessionRepository.listForTeacher(
      teacherId,
      guardedFilter,
      bounds.pageSize,
      (bounds.page - 1) * bounds.pageSize,
      tx
    );
    const totalCount = await SessionRepository.countForTeacher(teacherId, guardedFilter, tx);

    return { items, totalCount, page: bounds.page, pageSize: bounds.pageSize };
  }

  // ─── Internals ────────────────────────────────────────────────────────

  /**
   * Re-asserts the platform governance gate for a caller at the service
   * boundary (deleted/blocked/suspended accounts are denied; a vanished
   * caller fails closed). The login/SSR boundary enforces the same gate —
   * this is the defense-in-depth layer for callers holding still-valid
   * tokens.
   */
  async function assertActorGovernanceClean(
    actorUserId: number,
    t: ReturnType<typeof getServerTranslations>["errorsTranslations"],
    tx?: DBTransaction
  ): Promise<void> {
    const actor = await UserRepository.findById(actorUserId, tx);
    if (!actor || actor.isDeleted || actor.isBlocked || actor.suspended) {
      logger.logDomainError("Session action denied: caller account is governed", {
        code: "FORBIDDEN",
        entity: "session",
        entityId: actorUserId,
      });
      throw new ConflictError("FORBIDDEN", t.forbidden);
    }
  }

  /**
   * Resolves a duplicate-claim booking into its replay outcome.
   *
   * A claim owned by the acting caller with a resolvable session pointer
   * replays success-equivalently: the already-created session row is
   * returned exactly as the original request returned it. A spent key
   * without a resolvable session (a stale orphan claim) surfaces the
   * duplicate-replay conflict identically. A key spent by a DIFFERENT caller
   * is denied with the oracle-safe session-not-found error — another user's
   * claim is never surfaced.
   */
  async function replayBooking(
    key: string,
    actorStudentId: number,
    tx: DBTransaction,
    t: ReturnType<typeof getServerTranslations>["errorsTranslations"]
  ): Promise<SessionReturnType> {
    const claim = await SessionRequestIdempotencyRepository.findByKey(key, tx);
    if (claim !== null && claim.userId !== actorStudentId) {
      logger.logDomainError("Session booking replay denied: key claimed by another caller", {
        code: "SESSION_NOT_FOUND",
        entity: "session",
        entityId: actorStudentId,
      });
      throw new NotFoundError("SESSION", t.sessionNotFound);
    }
    // Optional-chain + nullish-coalesce resolves the claim and its session
    // pointer in one expression: a null claim (fail-closed) and a claim
    // without a session pointer both funnel into the same conflict below.
    const claimedSessionId = claim?.sessionId ?? null;
    if (claimedSessionId === null) {
      logger.logDomainError("Session booking replay blocked: spent key without a resolvable session", {
        code: "DUPLICATE_REQUEST",
        entity: "session",
      });
      throw new ConflictError("DUPLICATE_REQUEST", t.duplicateRequest);
    }
    const replayed = await SessionRepository.findById(claimedSessionId, tx);
    if (replayed === null) {
      logger.logDomainError("Session booking replay blocked: claim's session pointer unresolved", {
        code: "DUPLICATE_REQUEST",
        entity: "session",
        entityId: claimedSessionId,
      });
      throw new ConflictError("DUPLICATE_REQUEST", t.duplicateRequest);
    }
    logger.logDomainError("Session booking replayed to the already-created session", {
      code: "DUPLICATE_REQUEST",
      entity: "session",
      entityId: replayed.id,
    });
    return replayed;
  }

  /**
   * Classifies a zero-row guarded transition by ONE cold probe read, then
   * throws the typed denial. The probe is classification-only — it never
   * gates or influences any write.
   *
   * Classification (after the probe):
   *  - unknown id → session-not-found;
   *  - a caller the row does not belong to → session-not-found (oracle-safe:
   *    a foreign target is indistinguishable from a nonexistent one);
   *  - everything else is a lifecycle-state conflict — EXCEPT the completion
   *    of an owned in-progress row, where the fused certification predicate
   *    inside the guarded statement is the only remaining miss cause and the
   *    typed certification conflict is surfaced instead.
   */
  async function rejectTransitionMiss(
    kind: "teacherStart" | "teacherComplete" | "participantCancel",
    sessionId: number,
    actorUserId: number,
    tx: DBTransaction | undefined,
    t: ReturnType<typeof getServerTranslations>["errorsTranslations"]
  ): Promise<never> {
    const probe = await SessionRepository.findTransitionProbe(sessionId, tx);
    if (probe === null) {
      logger.logDomainError("Session transition denied: session not found", {
        code: "SESSION_NOT_FOUND",
        entity: "session",
        entityId: sessionId,
      });
      throw new NotFoundError("SESSION", t.sessionNotFound);
    }

    if (kind === "participantCancel") {
      if (probe.studentId !== actorUserId && probe.teacherId !== actorUserId) {
        logger.logDomainError("Session transition denied: caller is not a participant", {
          code: "SESSION_NOT_FOUND",
          entity: "session",
          entityId: sessionId,
        });
        throw new NotFoundError("SESSION", t.sessionNotFound);
      }
      // The row exists and the caller participates: every remaining miss
      // cause (a terminal state, or a row mid-transition at the guarded
      // statement's instant) is lifecycle-state-class.
      logger.logDomainError("Session transition denied: session not cancellable in its current state", {
        code: "SESSION_INVALID_TRANSITION",
        entity: "session",
        entityId: sessionId,
      });
      throw new ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition);
    }

    if (probe.teacherId !== actorUserId) {
      // Start/complete are teacher-side actions: a student participant (or
      // any other caller) is foreign — oracle-safe not-found.
      logger.logDomainError("Session transition denied: caller is not the owning teacher", {
        code: "SESSION_NOT_FOUND",
        entity: "session",
        entityId: sessionId,
      });
      throw new NotFoundError("SESSION", t.sessionNotFound);
    }

    if (kind === "teacherStart") {
      // The row exists and the caller owns it: every remaining miss cause
      // (the row no longer pre-start, or mid-transition at the guarded
      // statement's instant) is lifecycle-state-class.
      logger.logDomainError("Session transition denied: session not startable in its current state", {
        code: "SESSION_INVALID_TRANSITION",
        entity: "session",
        entityId: sessionId,
      });
      throw new ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition);
    }

    // Completion miss for the owning teacher: a row not in-progress is a
    // state conflict; an owned in-progress row means the fused certification
    // predicate inside the guarded statement rejected the caller. The probe
    // row's status is the raw pg-enum string union, so it is compared
    // against the enum-derived module-scope constant above — the vocabulary
    // still flows from the enum, never from a bare literal.
    if (probe.status !== SESSION_STARTED_STATUS) {
      logger.logDomainError("Session transition denied: session not completable in its current state", {
        code: "SESSION_INVALID_TRANSITION",
        entity: "session",
        entityId: sessionId,
      });
      throw new ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition);
    }
    logger.logDomainError("Session completion denied: teacher certification no longer active", {
      code: "TEACHER_NOT_CERTIFIED",
      entity: "session",
      entityId: sessionId,
    });
    throw new ConflictError("TEACHER_NOT_CERTIFIED", t.teacherNotCertified);
  }

  /**
   * Normalizes list pagination before any database work: a page below 1
   * (or a non-integer) falls back to the first page; a page size outside
   * 1..50 falls back to the default. The normalized values are what the
   * callers see echoed back — honest windows only.
   */
  function normalizePageBounds(page: number, pageSize: number): { page: number; pageSize: number } {
    const safePage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
    const safePageSize =
      Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= MAX_PAGE_SIZE ? pageSize : DEFAULT_PAGE_SIZE;
    return { page: safePage, pageSize: safePageSize };
  }

  /**
   * Guards the lifecycle filter against the closed status vocabulary before
   * any database work: absent/null members drop out, a lifecycle member
   * passes through as the bound filter value, and anything else drops out
   * too (filters never error — the owner predicate still scopes the read).
   */
  function guardStatusFilter(filter: SessionListFilterInput): SessionListFilterInput {
    const status = filter.status;
    if (status === undefined || status === null) {
      return { status: null };
    }
    if (!Object.values(SessionStatus).includes(status)) {
      return { status: null };
    }
    return { status };
  }
}
