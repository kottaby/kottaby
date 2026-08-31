/**
 * SessionLifecycleService — the booking + lifecycle state machine for the
 * `session` entity (scheduled → started → completed | cancelled, with both
 * live states able to pass through `disputed`: scheduled|started → disputed
 * → cancelled|completed under admin arbitration).
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
 * A replayed booking (duplicate claim key) THROWS `ConflictError(
 * "DUPLICATE_REQUEST")` — never a row.
 * Throwing is what keeps the replayed attempt free of charge: its own
 * partial writes roll back with the transaction (zero new rows, no second
 * debit); the success-equivalent experience is the client-side mapping of
 * the 409 per the error-handling contract.
 *
 * Every path guards the caller-supplied target session id as a positive
 * safe integer BEFORE any database work: the three mutations deny
 * a malformed id with the canonical `VALIDATION` error, and the participant
 * read degrades one to the oracle-safe `null` — a garbage id can never reach
 * SQL.
 *
 * Transitions (`startSession` / `completeSession` / `cancelSession`) are
 * single guarded repository UPDATEs; a zero-row match is classified by ONE
 * cold probe read that never influences any write. Cancellation refunds the
 * lane that funded the hold inside the same transaction, and keeps the start
 * stamp while never writing an end stamp; the trimmed reason persists inside
 * the guarded UPDATE itself. Disputes (`openSessionDispute`) are the same
 * participant-guarded shape from either live state; the arbitration
 * (`resolveSessionDispute`) is admin-only (defense-in-depth role re-check
 * on top of the GraphQL scope gate) and resolves a disputed row into exactly
 * one terminal state — CANCEL refunds the recorded lane through the SAME
 * same-lane primitive the participant cancel uses (one transaction, no
 * partial application), COMPLETE requires a written start stamp and consumes
 * the hold without any wallet credit. Reads are participant-scoped and
 * oracle-safe: a foreign id is indistinguishable from a nonexistent one
 * (the admin arbitration surface distinguishes state, never participants).
 *
 * Governance re-checks (deleted/blocked/suspended callers) re-assert the
 * login/SSR fail-closed gate at the service boundary as defense in depth.
 * Cancellation is deliberately exempt so a governed participant can still
 * release an in-flight hold later.
 *
 * Cross-surface dependency policy: the module's ONLY cross-surface
 * dependency is the wallet repository, composed into the dual-confirmation
 * flow to credit the teacher's earnings when the student confirms a
 * completed session; it imports nothing from the notification, audit, or
 * report surfaces. All user-facing messages resolve through
 * `getServerTranslations(locale)`;
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
  WalletRepository,
} from "@/backend/db/repo";
import { DisputeResolution, isDisputeResolution } from "@/backend/enum/scheduling/dispute-resolution.enum";
import { HeldBalanceLane, isHeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/lib/errors";
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

/** A free-text reason/note longer than this is rejected before any DB work. */
const MAX_REASON_LENGTH = 500;

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
 * The disputed status widened to a plain string at module scope — the same
 * probe-row vocabulary treatment (the arbitration's pre-write probe and the
 * admin resolution classification compare against this identity).
 */
const SESSION_DISPUTED_STATUS: string = SessionStatus.Disputed;
/** String-typed member for probe-projection comparisons (the probe's
 *  `status` is the raw varchar union — see the sibling constants). */
const SESSION_COMPLETED_STATUS: string = SessionStatus.Completed;

/**
 * The admin role widened to a plain string at module scope: the user row's
 * `role` is the raw pg-enum string union, so the arbitration caller's
 * defense-in-depth role re-assertion compares against the enum member's
 * string identity — the vocabulary still flows from the enum.
 */
const USER_ADMIN_ROLE: string = UserRole.Admin;

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
 * The target-session-id shape check for the four non-create paths:
 * a session id is valid ONLY as a positive safe integer — a NaN, fractional,
 * out-of-safe-range, non-positive, or non-number runtime value fails closed.
 * `unknown` is the honest parameter type: the GraphQL boundary parses the
 * `ID` argument shape-only (`Number(args.id)`), so the runtime value here is
 * NOT statically guaranteed to be a well-formed number — it may be the NaN,
 * fractional, or overflow shape that parse yields for a malformed string, or
 * a payload that skipped the boundary parse entirely.
 */
function isPositiveSafeSessionId(id: unknown): boolean {
  return typeof id === "number" && isPositiveSafeInteger(id);
}

/**
 * Pre-DB `VALIDATION` denial for a malformed target session id on the three
 * mutation paths — the exact guard idiom `createSession` applies to its
 * participant ids, shared by all three transitions so the entry points can
 * never drift apart. The throw happens BEFORE any database work (before the
 * governance probe and the guarded UPDATE), so a garbage id can never reach
 * SQL (pg 22P02 → masked 500) and never spends a probe read.
 */
function assertPositiveSafeSessionId(
  id: unknown,
  t: ReturnType<typeof getServerTranslations>["errorsTranslations"]
): void {
  if (!isPositiveSafeSessionId(id)) {
    throw new ValidationError(t.validation);
  }
}

/**
 * Normalizes a REQUIRED free-text dispute reason: trims, then rejects
 * whitespace-only and over-limit content with the pre-DB `VALIDATION`
 * denial. The trimmed value is what the guarded UPDATE persists.
 */
function normalizeRequiredReasonText(
  value: string,
  t: ReturnType<typeof getServerTranslations>["errorsTranslations"]
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REASON_LENGTH) {
    throw new ValidationError(t.validation);
  }
  return trimmed;
}

/**
 * Normalizes an OPTIONAL free-text reason/note (the cancel reason and the
 * arbitration note): trims, rejects over-limit content with the pre-DB
 * `VALIDATION` denial, and maps a whitespace-only value to `null` (nothing
 * is persisted for an empty contribution). The trimmed value is what the
 * guarded UPDATE persists.
 */
function normalizeOptionalReasonText(
  value: string | null,
  t: ReturnType<typeof getServerTranslations>["errorsTranslations"]
): string | null {
  const trimmed = value === null ? null : value.trim();
  if (trimmed !== null && trimmed.length > MAX_REASON_LENGTH) {
    throw new ValidationError(t.validation);
  }
  return trimmed !== null && trimmed.length > 0 ? trimmed : null;
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
   * On a duplicate claim key the flow REPLAYS BY THROWING: every same-caller
   * duplicate — a claim with or without its session pointer, and a vanished
   * claim (fail-closed) — surfaces the `ConflictError("DUPLICATE_REQUEST")`
   * conflict; this attempt's own partial writes (its debit-ladder step) roll
   * back with the transaction, so the replay commits zero new rows and burns
   * no second allowance unit. The success-equivalent experience is
   * the client-side mapping of the 409. A key spent by a DIFFERENT
   * caller is denied with the oracle-safe session-not-found error — another
   * user's claim is never surfaced.
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
   * @returns The booked session row for a FIRST booking; a replay never
   *     returns — it throws `ConflictError("DUPLICATE_REQUEST")`.
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
   * The target session id is guarded as a positive safe integer BEFORE any
   * database work (the boundary parses `ID` shape-only, so a
   * malformed id is the canonical `VALIDATION` denial, never a SQL
   * round-trip). The teacher's governance state is re-asserted next. The
   * guarded transition writes the start and audit stamps from one captured
   * instant and never touches the confirmation deadline. A zero-row match
   * is classified by one cold probe read: an unknown id and a non-owning
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

    // Pre-DB id-shape guard — BEFORE the governance probe: a
    // malformed target id is the canonical VALIDATION denial, never a
    // SQL round-trip.
    assertPositiveSafeSessionId(sessionId, t);

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
   * The target session id is guarded as a positive safe integer BEFORE any
   * database work (the boundary parses `ID` shape-only, so a
   * malformed id is the canonical `VALIDATION` denial, never a SQL
   * round-trip). The teacher's governance state is re-asserted next. The
   * guarded transition fuses the certification re-assertion into its own
   * predicate — a teacher decertified between booking and completion matches
   * zero rows —
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

    // Pre-DB id-shape guard — BEFORE the governance probe: a
    // malformed target id is the canonical VALIDATION denial, never a
    // SQL round-trip.
    assertPositiveSafeSessionId(sessionId, t);

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
   * The target session id is guarded as a positive safe integer BEFORE any
   * database work (the boundary parses `ID` shape-only, so a
   * malformed id is the canonical `VALIDATION` denial, never a SQL
   * round-trip). Deliberately NO governance re-check: releasing an in-flight
   * hold stays available to a governed participant (governance flips never
   * rewrite history). The optional reason is length-guarded and persisted
   * TRIMMED inside the guarded UPDATE itself (`cancel_reason`; a
   * whitespace-only reason persists as NULL) — the predicate and stamps are
   * otherwise unchanged. The guarded transition keeps the start stamp and
   * never writes an end stamp. On success, a row whose provenance lane is
   * set is refunded by one unit on that same lane inside the same
   * transaction through the shared same-lane refund primitive (unguarded
   * increment — the lane that paid is refunded exactly once); a terminal or
   * foreign target is classified by one cold probe read (unknown/
   * non-participant → not-found; anything else → transition conflict), so a
   * double cancel can never double-refund.
   *
   * @param callerUserId  The acting participant's id (the session's student
   *     or its teacher).
   * @param sessionId  The target session id.
   * @param reason  Optional free-text reason — validated (≤500 chars) and
   *     persisted trimmed into `cancel_reason` by this flow.
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

    // Pre-DB id-shape guard — the FIRST check of the flow, before
    // the reason guard: a malformed target id is the canonical VALIDATION
    // denial, never a SQL round-trip.
    assertPositiveSafeSessionId(sessionId, t);

    // The reason is guarded, trimmed, and persisted inside the guarded
    // UPDATE (NULL when absent or whitespace-only).
    const cancelReason = normalizeOptionalReasonText(reason, t);

    return withTransaction(outerTx, async tx => {
      const cancelled = await SessionRepository.cancelSessionOnce(sessionId, callerUserId, cancelReason, tx);
      if (cancelled === null) {
        throw await rejectTransitionMiss("participantCancel", sessionId, callerUserId, tx, t);
      }

      // Refund the lane that funded the hold — same transaction, same lane,
      // through the ONE shared same-lane refund primitive.
      await refundHeldLaneToProvenance(cancelled, "cancelSession", tx);

      return cancelled;
    });
  }

  /**
   * Opens a dispute on a live session (pre-start or in-progress) as either
   * participant, moving the row into the arbitration state exactly once.
   *
   * The target session id is guarded as a positive safe integer BEFORE any
   * database work. The reason is REQUIRED: trimmed non-empty and
   * ≤500 chars, validated pre-DB. Deliberately NO governance re-check
   * (mirroring the cancel exemption: a dispute is a participant's
   * self-protection action over their own row; the participant predicate is
   * the whole authorization surface). The escrow hold is deliberately
   * untouched — the money stays frozen until the admin resolution. A
   * zero-row match is classified by one cold probe read (unknown/
   * non-participant → not-found, oracle-safe; anything else → transition
   * conflict), so a double dispute can never rewrite a recorded reason.
   *
   * @param callerUserId  The acting participant's id (the session's student
   *     or its teacher).
   * @param sessionId  The target session id.
   * @param reason  REQUIRED free-text reason — trimmed non-empty, ≤500
   *     chars, persisted into `dispute_reason`.
   * @param locale  Active request locale (for the localized error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it; production callers omit it
   *     and the service opens its own transaction.
   */
  export async function openSessionDispute(
    callerUserId: number,
    sessionId: number,
    reason: string,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Pre-DB id-shape guard — the FIRST check of the flow, before
    // the reason guard.
    assertPositiveSafeSessionId(sessionId, t);

    // The reason is REQUIRED: trimmed non-empty, ≤500 — validated pre-DB.
    const disputeReason = normalizeRequiredReasonText(reason, t);

    return withTransaction(outerTx, async tx => {
      const disputed = await SessionRepository.openDisputeOnce(sessionId, callerUserId, disputeReason, tx);
      if (disputed === null) {
        throw await rejectTransitionMiss("participantDispute", sessionId, callerUserId, tx, t);
      }
      return disputed;
    });
  }

  /**
   * Resolves a disputed session into exactly one terminal state, as an
   * ADMIN (the arbitration surface).
   *
   * The target session id is guarded as a positive safe integer BEFORE any
   * database work. The resolution vocabulary is re-guarded at
   * runtime (a payload that skipped the GraphQL enum boundary fails closed
   * pre-DB) and the optional note is trimmed, ≤500-checked, and persisted
   * (`resolution_note`; whitespace-only persists as NULL). The caller's
   * governance AND admin role are re-asserted from the user row — defense
   * in depth on top of the GraphQL scope gate (a still-valid token held by
   * a demoted or governed account fails closed here with the canonical
   * FORBIDDEN).
   *
   * Inside ONE transaction:
   *  - `Cancel`  → the guarded UPDATE flips the row to `cancelled`, clears
   *    the hold marker, and writes the note + stamp; the same-lane refund
   *    (the EXACT primitive the participant cancel composes) runs on the
   *    same transaction, so the refund and the status flip commit
   *    atomically — partial application is impossible.
   *  - `Complete` → one cold probe read FIRST classifies a disputed row
   *    that never started as pre-DB `VALIDATION` (cannot complete what
   *    never happened); the guarded UPDATE then flips the row to
   *    `completed`, consumes the hold (`fee_held = false` — no wallet
   *    credit), and writes the end/note/stamps. Unknown ids and wrong-state
   *    rows fall through to the guarded UPDATE and classify through the
   *    standard probe chain (unknown → not-found; any existing row that
   *    missed → transition conflict — the admin surface distinguishes
   *    state, never participants).
   *
   * @param adminId  The acting admin's id (context-resolved server-side by
   *     the caller; shared PK with the users table).
   * @param sessionId  The target session id.
   * @param resolution  The arbitration outcome (Cancel | Complete).
   * @param note  Optional free-text note — trimmed ≤500, persisted into
   *     `resolution_note`.
   * @param locale  Active request locale (for the localized error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it; production callers omit it
   *     and the service opens its own transaction.
   */
  export async function resolveSessionDispute(
    adminId: number,
    sessionId: number,
    resolution: DisputeResolution,
    note: string | null,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Pre-DB id-shape guard — the FIRST check of the flow.
    assertPositiveSafeSessionId(sessionId, t);

    // The resolution vocabulary is a closed runtime guard (BOPLA — a
    // payload that skipped the boundary's enum parse fails closed here,
    // pre-DB).
    if (!isDisputeResolution(resolution)) {
      throw new ValidationError(t.validation);
    }

    // The optional note: trimmed, ≤500 — validated pre-DB; whitespace-only
    // persists as NULL.
    const resolutionNote = normalizeOptionalReasonText(note, t);

    // Governance + role re-check — the acting caller must be a
    // governance-clean ADMIN (defense in depth over the scope gate).
    await assertAdminGovernanceClean(adminId, t, outerTx);

    return withTransaction(outerTx, async tx => {
      if (resolution === DisputeResolution.Complete) {
        // Pre-write classification (one cold probe read): a disputed row
        // that never started cannot complete — VALIDATION before the
        // guarded UPDATE. Unknown ids and wrong-state rows fall through to
        // the guarded UPDATE and classify through the standard probe chain.
        const probe = await SessionRepository.findTransitionProbe(sessionId, tx);
        if (probe !== null && probe.status === SESSION_DISPUTED_STATUS && probe.startedAt === null) {
          logger.logDomainError("Session arbitration denied: disputed session never started", {
            code: "VALIDATION",
            entity: "session",
            entityId: sessionId,
          });
          throw new ValidationError(t.validation);
        }
      }

      const resolved =
        resolution === DisputeResolution.Cancel
          ? await SessionRepository.resolveDisputeCancelOnce(sessionId, resolutionNote, tx)
          : await SessionRepository.resolveDisputeCompleteOnce(sessionId, resolutionNote, tx);
      if (resolved === null) {
        throw await rejectTransitionMiss("adminResolve", sessionId, adminId, tx, t);
      }

      // CANCEL outcome: refund the lane that funded the hold — same
      // transaction, same primitive as the participant cancel, so the
      // refund and the status flip commit atomically.
      if (resolution === DisputeResolution.Cancel) {
        await refundHeldLaneToProvenance(resolved, "resolveSessionDispute", tx);
      }

      return resolved;
    });
  }

  /**
   * The student's completion confirmation — the second half of the
   * dual-confirmation contract.
   *
   * The target session id is guarded as a positive safe integer BEFORE any
   * database work. Deliberately NO governance re-check (mirroring
   * the cancel/dispute exemption: confirming one's own completed lesson is
   * a participant self-service act; the participant predicate is the whole
   * authorization surface). The flow is IDEMPOTENT and its financial slice
   * fires EXACTLY once per session:
   *
   *  - STUDENT caller on a completed row with the hold still marked and
   *    both stamps completable: ONE guarded UPDATE writes the student
   *    stamp and flips `fee_held = false` (the exactly-once guard lives in
   *    the statement's predicate), then — same transaction — the credit
   *    slice composes through the wallet repository: the teacher's wallet
   *    row is ensured (idempotent ON CONFLICT insert; no approval-time
   *    wallet writer exists yet), ONE `earning` ledger row is inserted
   *    with the session's `fee` taken verbatim, and the wallet's
   *    `balance`/`total_earning` increase by exactly that fee (no DB
   *    trigger exists — the increment is explicit, atomic with the ledger
   *    row).
   *  - Already-confirmed student, an already-released hold (admin
   *    arbitration consumed it first), or the TEACHER caller (whose stamp
   *    `completeSessionOnce` already wrote): the current row is returned
   *    untouched — ZERO financial writes, the honest idempotent answer.
   *  - A zero-row guarded miss on a live-state row is classified by one
   *    cold probe read (unknown/non-participant → not-found, oracle-safe;
   *    anything else → transition conflict), so a foreign caller can never
   *    distinguish a missing row from one they do not own.
   *
   * @param callerUserId  The acting participant's id (the session's student
   *     or its teacher).
   * @param sessionId  The target session id.
   * @param locale  Active request locale (for the localized error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it; production callers omit it
   *     and the service opens its own transaction.
   */
  export async function confirmSessionCompletion(
    callerUserId: number,
    sessionId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<SessionReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Pre-DB id-shape guard — the FIRST check of the flow.
    assertPositiveSafeSessionId(sessionId, t);

    return withTransaction(outerTx, async tx => {
      // The exactly-once slice: student stamp + hold release in ONE guarded
      // statement. Zero rows ⇒ classify (idempotent arms vs denials below).
      const confirmed = await SessionRepository.confirmStudentCompletionOnce(sessionId, callerUserId, tx);
      if (confirmed !== null) {
        // A hold-marked row always carries its platform fee (the booking
        // invariant) — a null here is a data impossibility that
        // fails closed instead of crediting an unpriced lesson.
        if (confirmed.fee === null) {
          logger.error("Dual-confirmation blocked: completed hold-marked session without a fee", {
            sessionId: confirmed.id,
          });
          throw new Error("SessionLifecycleService.confirmSessionCompletion: missing session fee");
        }
        // Teacher-earning credit slice — same transaction, composed through the
        // wallet repository: ensure the wallet, insert the `earning`
        // ledger row with the fee VERBATIM, increment the wallet.
        const teacherWallet = await WalletRepository.ensureWalletOnce(confirmed.teacherId, tx);
        await WalletRepository.creditEarningOnce(
          {
            walletId: teacherWallet.id,
            sessionId: confirmed.id,
            amount: confirmed.fee,
            description: `Session #${confirmed.id} earning (dual confirmation)`,
          },
          tx
        );
        return confirmed;
      }

      // Zero-row miss — classify. The probe read is classification-only.
      const probe = await SessionRepository.findTransitionProbe(sessionId, tx);
      if (probe === null || (probe.studentId !== callerUserId && probe.teacherId !== callerUserId)) {
        logger.logDomainError("Session confirmation denied: session not found for caller", {
          code: "SESSION_NOT_FOUND",
          entity: "session",
          entityId: sessionId,
        });
        throw new NotFoundError("SESSION", t.sessionNotFound);
      }

      // Participant idempotence arms — the row exists and the caller owns
      // it. Any already-settled shape returns the CURRENT row untouched:
      // the student re-confirming, the teacher confirming (their stamp was
      // written by `completeSessionOnce`), or a hold the admin arbitration
      // already consumed. A `completed` row is the only idempotent shape.
      if (probe.status === SESSION_COMPLETED_STATUS) {
        const current = await SessionRepository.findById(sessionId, tx);
        if (current !== null) {
          return current;
        }
      }

      logger.logDomainError("Session confirmation denied: session not confirmable in its current state", {
        code: "SESSION_INVALID_TRANSITION",
        entity: "session",
        entityId: sessionId,
      });
      throw new ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition);
    });
  }

  /**
   * The confirmation-deadline sweeper: cancels every still-`scheduled`
   * session whose confirmation deadline has passed and refunds each held
   * row's fee to its recorded provenance lane.
   *
   * ONE captured `now` drives both the deadline comparison and the stamps.
   * The batch UPDATE (guarded on the scheduled state and the expired
   * deadline) returns the cancelled rows; each returned row with a
   * recorded lane is refunded through the ONE shared same-lane primitive
   * on the same transaction — a NULL lane (rows with no hold)
   * means nothing to refund. Idempotent: a second sweep matches zero
   * rows. Zero notification/audit writes (out of contract).
   *
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the flow runs inside a SAVEPOINT on it; production callers omit it
   *     and the service opens its own transaction.
   * @returns Honest counts: `cancelled` rows and how many of them carried
   *     a refunded hold.
   */
  export async function sweepExpiredSessions(outerTx?: DBTransaction): Promise<{
    readonly cancelled: number;
    readonly refunded: number;
  }> {
    return withTransaction(outerTx, async tx => {
      const now = new Date();
      const expired = await SessionRepository.sweepExpiredScheduledOnce(now, tx);
      let refunded = 0;
      for (const row of expired) {
        if (row.heldBalanceLane === null) {
          continue;
        }
        // Sequential BY DESIGN: every refund composes on the ONE sweep
        // transaction — interleaving them (Promise.all) would obscure the
        // fail-closed ordering (an unreadable-lane refusal rolls the whole
        // sweep back) for zero speedup on a single connection.
        // oxlint-disable-next-line no-await-in-loop
        await refundHeldLaneToProvenance(row, "sweepExpiredSessions", tx);
        refunded += 1;
      }
      return { cancelled: expired.length, refunded };
    });
  }

  /**
   * Reads one session for a participant: the row is returned only when the
   * caller is the session's student or its teacher. A nonexistent id and a
   * non-participant caller resolve to the identical `null` (oracle-safe —
   * the two cases are indistinguishable). A malformed id — anything but a
   * positive safe integer, including the NaN/1.5/overflow shapes the
   * boundary's shape-only `Number` parse yields for garbage `ID` strings —
   * short-circuits to the SAME `null` before any database read (the pre-DB
   * shape guard); well-formed-but-unknown ids degrade to `null`
   * through the parameterized lookup. No error is ever raised: this read
   * surface has no locale and its only answer shape is `null`.
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
    // Oracle-safe malformed-id channel: anything that is not a
    // positive safe integer — the NaN/1.5/overflow shapes the boundary's
    // shape-only `Number` parse yields for garbage `ID` strings — resolves
    // to the SAME `null` as a nonexistent id, BEFORE any database read. No
    // error is raised (this read surface has no locale and never throws).
    if (!isPositiveSafeSessionId(sessionId)) {
      return null;
    }

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

  /**
   * Lists the disputed sessions for the admin arbitration surface, newest
   * first, paged.
   *
   * The limit clamp mirrors the participant lists exactly (1..50, default
   * 25) and the offset floors at zero — both normalize pre-DB, never
   * error. The lifecycle filter is guarded against the closed status
   * vocabulary like every other read; the field's `disputed` scope is
   * PINNED, so an explicitly contradictory filter (any status other than
   * disputed) honestly resolves to an empty page without touching the
   * database, while an absent/whitespace-drop filter returns the full
   * arbitration queue. The total count is computed under the SAME pinned
   * predicate as the list, so `totalCount` can never diverge from the
   * items. The `limit`/`offset` window maps onto the page echo honestly:
   * `pageSize` is the clamped limit and `page` is the 1-based window index
   * that contains the requested offset.
   *
   * The admin role gate lives at the GraphQL scope (`$all { authenticated,
   * role: [Admin] }`); this read takes no caller identity and never raises
   * localized errors (the read-surface contract).
   *
   * @param filter  Optional lifecycle filter (absent/null members drop
   *     out; a non-disputed member contradicts the pinned scope).
   * @param limit  Requested page size (1..50; invalid values normalize to
   *     the default).
   * @param offset  Requested row offset (≥ 0; invalid values normalize to
   *     0).
   * @param tx  Optional transaction — propagated to both reads.
   */
  export async function listAdminDisputedSessions(
    filter: SessionListFilterInput,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<SessionPageReturnType> {
    const safeLimit = Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_SIZE ? limit : DEFAULT_PAGE_SIZE;
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const page = Math.floor(safeOffset / safeLimit) + 1;

    // A filter explicitly contradicting the pinned disputed scope (any
    // in-vocabulary status other than disputed) matches zero rows by
    // definition — the honest empty page, no database round-trip.
    const guardedStatus = guardStatusFilter(filter).status;
    if (guardedStatus !== null && guardedStatus !== SessionStatus.Disputed) {
      return { items: [], totalCount: 0, page, pageSize: safeLimit };
    }

    const items = await SessionRepository.listAdminDisputed(safeLimit, safeOffset, tx);
    const totalCount = await SessionRepository.countAdminDisputed(tx);

    return { items, totalCount, page, pageSize: safeLimit };
  }

  // ─── Internals ────────────────────────────────────────────────────────

  /**
   * Re-asserts the platform governance gate for a caller at the service
   * boundary (deleted/blocked/suspended accounts are denied; a vanished
   * caller fails closed). The login/SSR boundary enforces the same gate —
   * this is the defense-in-depth layer for callers holding still-valid
   * tokens. The denial is a typed `ForbiddenError` (`extensions.code` =
   * `FORBIDDEN`, 403 per the error-code taxonomy) — the authorization
   * class for an authorization denial, never the Conflict class.
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
      throw new ForbiddenError(t.forbidden);
    }
  }

  /**
   * Re-asserts the FULL arbitration authorization for a caller at the
   * service boundary: the account must be governance-clean AND hold the
   * admin role. The GraphQL scope gate enforces the same role leg — this
   * is the defense-in-depth layer for still-valid tokens held by an
   * account that was demoted or governed after login (the DB row is the
   * authority, never the token). The denial is the typed `ForbiddenError`
   * (`extensions.code` = `FORBIDDEN`, 403 per the error-code taxonomy).
   */
  async function assertAdminGovernanceClean(
    actorUserId: number,
    t: ReturnType<typeof getServerTranslations>["errorsTranslations"],
    tx?: DBTransaction
  ): Promise<void> {
    const actor = await UserRepository.findById(actorUserId, tx);
    if (!actor || actor.isDeleted || actor.isBlocked || actor.suspended) {
      logger.logDomainError("Session arbitration denied: caller account is governed", {
        code: "FORBIDDEN",
        entity: "session",
        entityId: actorUserId,
      });
      throw new ForbiddenError(t.forbidden);
    }
    if (actor.role !== USER_ADMIN_ROLE) {
      logger.logDomainError("Session arbitration denied: caller is not an admin", {
        code: "FORBIDDEN",
        entity: "session",
        entityId: actorUserId,
      });
      throw new ForbiddenError(t.forbidden);
    }
  }

  /**
   * Refunds a cancelled/resolved row's held fee to its recorded provenance
   * lane — the ONE same-lane primitive shared by the participant cancel
   * and the arbitration CANCEL outcome, always on the caller's transaction
   * (the refund and its status flip commit atomically or not at all). A
   * row with no recorded lane has nothing to refund. The provenance column
   * is a varchar read back from the row: an unreadable value fails closed
   * (the refusal rolls the cancellation/resolution back, leaving the hold
   * and the row consistent).
   */
  async function refundHeldLaneToProvenance(
    resolved: SessionReturnType,
    context: "cancelSession" | "resolveSessionDispute" | "sweepExpiredSessions",
    tx: DBTransaction
  ): Promise<void> {
    if (resolved.heldBalanceLane === null) {
      return;
    }
    if (!isHeldBalanceLane(resolved.heldBalanceLane)) {
      logger.error("Session lifecycle blocked: unreadable held-balance lane", {
        sessionId: resolved.id,
      });
      throw new Error(`SessionLifecycleService.${context}: unreadable held-balance lane`);
    }
    await StudentRepository.incrementLane(resolved.studentId, resolved.heldBalanceLane, tx);
  }

  /**
   * Resolves a duplicate-claim booking into its replay outcome.
   *
   * Every same-caller duplicate — a claim with or without its session
   * pointer, and a vanished claim (fail-closed) — surfaces the
   * duplicate-replay conflict. THROWING (never returning a row) is what
   * makes a replay free of charge: this attempt's own partial writes (its
   * debit-ladder step) roll back with the transaction, so the replay
   * commits zero new rows and burns no second allowance unit;
   * the success-equivalent experience is the client-side mapping of this
   * 409 per the error-handling contract (`duplicateSuccessEquivalent`).
   * A key spent by a DIFFERENT caller is denied with the oracle-safe
   * session-not-found error — another user's claim is never surfaced.
   */
  async function replayBooking(
    key: string,
    actorStudentId: number,
    tx: DBTransaction,
    t: ReturnType<typeof getServerTranslations>["errorsTranslations"]
  ): Promise<never> {
    const claim = await SessionRequestIdempotencyRepository.findByKey(key, tx);
    if (claim !== null && claim.userId !== actorStudentId) {
      logger.logDomainError("Session booking replay denied: key claimed by another caller", {
        code: "SESSION_NOT_FOUND",
        entity: "session",
        entityId: actorStudentId,
      });
      throw new NotFoundError("SESSION", t.sessionNotFound);
    }
    logger.logDomainError("Session booking replay blocked: key already claimed", {
      code: "DUPLICATE_REQUEST",
      entity: "session",
    });
    throw new ConflictError("DUPLICATE_REQUEST", t.duplicateRequest);
  }

  /**
   * Classifies a zero-row guarded transition by ONE cold probe read, then
   * throws the typed denial. The probe is classification-only — it never
   * gates or influences any write.
   *
   * Classification (after the probe):
   *  - unknown id → session-not-found;
   *  - a caller the row does not belong to → session-not-found (oracle-safe:
   *    a foreign target is indistinguishable from a nonexistent one) — for
   *    the participant kinds; the admin arbitration kind is role-gated
   *    upstream and NOT participant-gated, so any existing row that missed
   *    is a lifecycle-state conflict;
   *  - everything else is a lifecycle-state conflict — EXCEPT the completion
   *    of an owned in-progress row, where the fused certification predicate
   *    inside the guarded statement is the only remaining miss cause and the
   *    typed certification conflict is surfaced instead.
   */
  async function rejectTransitionMiss(
    kind: "teacherStart" | "teacherComplete" | "participantCancel" | "participantDispute" | "adminResolve",
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

    if (kind === "participantDispute") {
      if (probe.studentId !== actorUserId && probe.teacherId !== actorUserId) {
        logger.logDomainError("Session dispute denied: caller is not a participant", {
          code: "SESSION_NOT_FOUND",
          entity: "session",
          entityId: sessionId,
        });
        throw new NotFoundError("SESSION", t.sessionNotFound);
      }
      // The row exists and the caller participates: every remaining miss
      // cause (a terminal or already-disputed row, or a row mid-transition
      // at the guarded statement's instant) is lifecycle-state-class.
      logger.logDomainError("Session dispute denied: session not disputable in its current state", {
        code: "SESSION_INVALID_TRANSITION",
        entity: "session",
        entityId: sessionId,
      });
      throw new ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition);
    }

    if (kind === "adminResolve") {
      // The arbitration surface is role-gated upstream and NOT
      // participant-gated: any existing row that failed the guarded
      // predicate is a lifecycle-state conflict (the admin is trusted to
      // see state, never participant membership).
      logger.logDomainError("Session arbitration denied: session not resolvable in its current state", {
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
