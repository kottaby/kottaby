/**
 * SessionReportService — the teacher's post-session write surface: the
 * submission of the session report (notes + optional student rating) with
 * its two optional homework composites (the previous-session grade write
 * and the new assignment row) inside ONE transaction.
 *
 * Pipeline (fixed order, never reordered):
 *   0. Pre-DB boundary validation — the payload vocabulary
 *      (`session-report.guards.ts`) is asserted against the locale's
 *      `errorsTranslations` resolved ONCE at the flow head: the session-id
 *      shape, the required notes (trimmed + length bound), the 0..5
 *      rating window, and — when supplied — the assignment blocks and the
 *      previous-grades window. A garbage payload fails closed BEFORE any
 *      database work and never spends the gate's row lock.
 *   1. Actor governance re-assertion — deleted/blocked/suspended teachers
 *      are denied (`assertActorGovernanceClean`), riding the outer
 *      transaction when the caller supplied one.
 *   2. One `withTransaction` body (extracted verbatim into the sibling
 *      transaction-body functions, the session-lifecycle module layout):
 *      a. the report-gate row lock (`lockForReportGate` — `SELECT … FOR
 *         UPDATE` with the transition probe in the same statement) — an
 *         unknown session and a session owned by another teacher are
 *         indistinguishable (oracle-safe `SESSION_NOT_FOUND`), and a row
 *         not in the `completed` state is a typed
 *         `SESSION_INVALID_TRANSITION` conflict;
 *      b. the report INSERT — the database's `reports_session_id_unique`
 *         arbiter surfaces a duplicate submission as a raw `23505`, mapped
 *         here into the localized `SESSION_REPORT_ALREADY_EXISTS` conflict
 *         (the repo never translates; the service decides);
 *      c. the previous-grades write — the student's NEWEST homework row
 *         (any grade state — the probe carries no grade predicate) is
 *         graded exactly once through the guarded UPDATE; a zero-row
 *         match means that newest row is already graded — the plan's D5
 *         "grade attempt against an already-graded prior row surfaces as
 *         guarded miss" — and is a typed conflict. A `null` probe means
 *         the student has NO homework rows at all — a genuine first
 *         session, nothing to grade: a silent no-op, not an error.
 *      d. the homework assignment INSERT — the Jadid block maps onto the
 *         `current_*` columns and the Madi block onto the `revision_*`
 *         columns (field by field, grades structurally absent: the row is
 *         inserted ungraded and graded later through this same flow);
 *         the `home_work_session_id_unique` violation (a session that
 *         already carries an assignment) maps into the same
 *         `SESSION_REPORT_ALREADY_EXISTS` conflict — one report and one
 *         assignment per session settle together;
 *      e. the report-ready notifications — the emit primitive rides the
 *         SAME transaction and hands back the delivery receipts verbatim;
 *         nothing is published inside the body.
 *   3. Publish-after-commit — the receipts are pushed through
 *      `NotificationEngine.publishReceipts` only after the transaction has
 *      committed, so nothing is ever delivered for a rolled-back emit.
 *
 * Read surface (same module, same bare-export style): `getSessionReport`
 * and `getSessionHomework` return a participant's own session rows or
 * `null` — the same pre-DB id-shape guard, the UNLOCKED transition probe
 * as the participant gate (every non-participant and every unknown id
 * collapse into the identical `null`), then a plain repository read.
 * Reads perform ZERO writes, skip the governance re-check, and log
 * NOTHING (the read path is silent).
 *
 * Export style: module-level bare functions (`import * as
 * SessionReportService` consumers call members directly — the same shape
 * the pure sibling module `session-report.guards.ts` uses; the big
 * lifecycle flows keep their namespaces, this module stays a small set
 * of bare functions: the submit flow plus the two session-row readers).
 *
 * Denial logging: exactly ONE `logger.logDomainError` line per denial path
 * with the `{code, entity, entityId}` context only — never payloads, notes,
 * or the other participant's data; success logs NOTHING. Every denial
 * REPLAY-THROWS the typed error (never swallowed), and the transaction
 * rollback is the only cleanup — no compensating writes exist.
 *
 * Localization: every user-facing message resolves through
 * `getServerTranslations(locale)` — resolved ONCE and threaded unchanged
 * through the guards and the throw sites, so a submission can never mix
 * locales mid-flow.
 */

import { HomeWorkRepository, ReportRepository, SessionRepository } from "@/backend/db/repo";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, NotFoundError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertTeacherGovernanceClean } from "@/backend/services/classes/session-lifecycle.governance";
import { SESSION_COMPLETED_STATUS } from "@/backend/services/classes/session-lifecycle.guards";
import {
  assertPositiveSessionId,
  assertRating0To5,
  assertTeacherNotes,
  validateAssignment,
  validatePreviousGrades,
} from "@/backend/services/classes/session-report.guards";
import { SessionReportNotificationService } from "@/backend/services/classes/session-report-notification.service";
import { NotificationEngine, type NotificationEngineCallOptions } from "@/backend/services/notifications";
import { isUniqueViolation } from "@/backend/services/shared/user-provisioning.helpers";
import type {
  DBQueryExecutor,
  DBTransaction,
  HomeWorkAssignInput,
  HomeWorkBlockInput,
  HomeWorkInsertType,
  HomeWorkReturnType,
  NotificationDeliveryReceipt,
  ReportReturnType,
  ReportSelectType,
  SessionReportSubmitInput,
  SessionTransitionProbeRowType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * The localized `errors` namespace slice — the exact handle shape the
 * sibling flows thread through every guard and throw site.
 */
type ErrorsTranslations = ReturnType<typeof getServerTranslations>["errorsTranslations"];

/**
 * The `home_work` table's per-session uniqueness arbiter: a duplicate
 * assignment INSERT fails with this constraint name in the PG error, and
 * the mapping into the typed conflict keys off it (never off the raw code
 * alone, so a different unique violation on the same statement can never
 * be misclassified).
 */
const HOME_WORK_SESSION_ID_UNIQUE = "home_work_session_id_unique";

/**
 * Wire honesty for an optional homework block — mirrors the guards'
 * fail-closed "supplied" predicate: only a real object counts as present,
 * so a transport `null` leg (possible even though the canonical input type
 * says `undefined`) can never reach the field-by-field insert mapping.
 */
function isSuppliedBlock(value: unknown): value is HomeWorkBlockInput {
  return typeof value === "object" && value !== null;
}

/**
 * Field-by-field assignment mapping (BOPLA): the Jadid block lands on the
 * `current_*` track and the Madi block on the `revision_*` track — ayah
 * span endpoints and the surah/juz classifier, nothing else. Both grade
 * columns are structurally absent: a row is INSERTED ungraded and graded
 * later through the one-shot guarded update, never at assignment time.
 */
function homeWorkInsertOf(sessionId: number, assignment: HomeWorkAssignInput): HomeWorkInsertType {
  const insert: HomeWorkInsertType = { sessionId };
  if (isSuppliedBlock(assignment.jadid)) {
    insert.currentFromAyah = assignment.jadid.fromAyah;
    insert.currentToAyah = assignment.jadid.toAyah;
    insert.currentSurahJuz = assignment.jadid.surahJuz;
  }
  if (isSuppliedBlock(assignment.madi)) {
    insert.revisionFromAyah = assignment.madi.fromAyah;
    insert.revisionToAyah = assignment.madi.toAyah;
    insert.revisionSurahJuz = assignment.madi.surahJuz;
  }
  return insert;
}

/**
 * Walks the error + cause chain looking for a PG `23505` whose constraint
 * name carries `needle` (Drizzle wraps PG errors in `DrizzleQueryError`
 * with the original error in `.cause`). The paired `isUniqueViolation`
 * check at the call site keys the mapping on BOTH the code and the
 * constraint name.
 */
function uniqueViolationOnConstraint(error: unknown, needle: string): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current &&
      typeof current.constraint === "string" &&
      current.constraint.includes(needle)
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The homework composite of one submission, on the caller's transaction:
 * the previous-session grade write (the student's NEWEST homework row,
 * graded exactly once through the guarded UPDATE) followed by the new
 * assignment insert (grades structurally absent — the row is graded later
 * through this same flow). Order is fixed: the grade write targets the
 * PREVIOUS session's row, so it must run before this session's own row
 * exists — otherwise the newest row could be the one this very submission
 * just inserted.
 */
async function settleHomeWorkComposite(
  studentId: number,
  sessionId: number,
  input: SessionReportSubmitInput,
  t: ErrorsTranslations,
  tx: DBTransaction
): Promise<void> {
  // Previous-grades write — the probe is the student's NEWEST homework row
  // whatever its grade state (no grade predicate here): gradeability is
  // decided by the guarded UPDATE below, never by this read. A `null` probe
  // is a genuine first session — the student has NO prior homework rows at
  // all, so there is nothing to grade and the grades are silently absorbed
  // (D5's no-op arm); a newest row that is ALREADY graded misses the
  // guarded UPDATE's zero-row predicate and surfaces as the typed
  // write-once conflict (D5's conflict arm — the plan's "guarded miss"
  // resolution). There is no third shape to classify.
  if (input.previousGrades) {
    const target = await HomeWorkRepository.findLatestByStudentId(studentId, tx);
    if (target !== null) {
      const graded = await HomeWorkRepository.gradeHomeWorkOnce(
        target.id,
        {
          currentGrade: input.previousGrades.currentGrade,
          revisionGrade: input.previousGrades.revisionGrade,
        },
        tx
      );
      if (graded === null) {
        // The guarded UPDATE's predicate lost: the newest prior row is
        // already graded (write-once violated) — a concurrent grader won
        // the row, or the grades were submitted once before.
        logger.logDomainError("Session report denied: homework already graded", {
          code: "CONFLICT",
          entity: "home_work",
          entityId: target.id,
        });
        throw new ConflictError(t.homeworkAlreadyGraded);
      }
    }
  }

  // Assignment insert — the per-session uniqueness arbiter maps into the
  // same settle-together conflict as the report duplicate.
  if (input.homework) {
    try {
      await HomeWorkRepository.insertHomeWork(homeWorkInsertOf(sessionId, input.homework), tx);
    } catch (err) {
      if (isUniqueViolation(err) && uniqueViolationOnConstraint(err, HOME_WORK_SESSION_ID_UNIQUE)) {
        logger.logDomainError("Session report denied: assignment already exists for session", {
          code: "SESSION_REPORT_ALREADY_EXISTS",
          entity: "home_work",
          entityId: sessionId,
        });
        throw new ConflictError("SESSION_REPORT_ALREADY_EXISTS", t.sessionReportAlreadyExists);
      }
      throw err;
    }
  }
}

/**
 * The submission transaction body: the report-gate lock + classification,
 * the report insert with its duplicate mapping, the homework composite,
 * and the report-ready emissions — every write on the SAME `tx`, so any
 * failure rolls the whole submission back (zero new rows, receipts
 * unpublished). The receipts travel out verbatim for the caller's
 * publish-after-commit step.
 */
async function submitReportAndHomeworkInTx(
  teacherUserId: number,
  sessionId: number,
  teacherNotes: string,
  input: SessionReportSubmitInput,
  locale: string,
  t: ErrorsTranslations,
  options: NotificationEngineCallOptions | undefined,
  tx: DBTransaction
): Promise<{ report: ReportSelectType; receipts: NotificationDeliveryReceipt[] }> {
  // Report-gate row lock + gate classification.
  const probe = await SessionRepository.lockForReportGate(sessionId, tx);
  if (probe?.teacherId !== teacherUserId) {
    // Oracle-safe: a foreign session is indistinguishable from a
    // nonexistent one — the identical denial for both shapes.
    logger.logDomainError("Session report denied: session not found for caller", {
      code: "SESSION_NOT_FOUND",
      entity: "session",
      entityId: sessionId,
    });
    throw new NotFoundError("SESSION", t.sessionNotFound);
  }
  if (probe.status !== SESSION_COMPLETED_STATUS) {
    logger.logDomainError("Session report denied: session not reportable in its current state", {
      code: "SESSION_INVALID_TRANSITION",
      entity: "session",
      entityId: sessionId,
    });
    throw new ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition);
  }

  // Report insert — the database's one-report-per-session arbiter
  // surfaces the duplicate; the service maps it into the typed conflict
  // (the repo never translates).
  let report: ReportSelectType;
  try {
    report = await ReportRepository.insertReport(
      { sessionId, teacherNotes, studentRatingByTeacher: input.studentRatingByTeacher },
      tx
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.logDomainError("Session report denied: report already exists for session", {
        code: "SESSION_REPORT_ALREADY_EXISTS",
        entity: "reports",
        entityId: sessionId,
      });
      throw new ConflictError("SESSION_REPORT_ALREADY_EXISTS", t.sessionReportAlreadyExists);
    }
    throw err;
  }

  await settleHomeWorkComposite(probe.studentId, sessionId, input, t, tx);

  // Report-ready notifications — emit on the caller's transaction,
  // receipts returned verbatim, NEVER published inside the body.
  const receipts = await SessionReportNotificationService.notifySessionReportReady(sessionId, locale, tx, options);
  return { report, receipts };
}

/**
 * Submits the teacher's report for one completed session — the report
 * row, the optional previous-grades write, and the optional new
 * assignment commit atomically; the report-ready notifications emit on
 * the same transaction and publish only after the commit.
 *
 * Domain behavior (in order):
 *  - Pre-DB boundary validation denies a malformed session id, an empty
 *    or overlong notes body, a rating outside 0..5, an incoherent
 *    assignment block, or a grade outside 0..100 with the canonical
 *    `VALIDATION` error BEFORE any database work.
 *  - The acting teacher's authorization is re-asserted (a
 *    deleted/blocked/suspended account OR a caller without the teacher
 *    role is denied with `FORBIDDEN`).
 *  - The gate locks the session row (`FOR UPDATE`) and classifies: an
 *    unknown id and a session owned by another teacher are BOTH the
 *    oracle-safe `SESSION_NOT_FOUND`; a row not in the `completed`
 *    state is the typed `SESSION_INVALID_TRANSITION` conflict.
 *  - A session that already carries a report — or, equivalently, an
 *    assignment (the two settle together) — replays as the
 *    `SESSION_REPORT_ALREADY_EXISTS` conflict; the replayed attempt
 *    rolls back with the transaction (zero new rows).
 *  - The previous-grades write grades the student's newest homework row
 *    exactly once through the guarded UPDATE; the newest row being
 *    already graded is a `CONFLICT` (grade is write-once) and the
 *    submission never grades two rows or overwrites a grade. A student
 *    with no homework rows at all is a genuine first session — nothing
 *    to grade, not an error.
 *
 * @param teacherUserId The acting teacher's id (context-resolved
 *     server-side by the caller; shared PK with the users table).
 * @param sessionId The target session's id (validated before any
 *     database work).
 * @param input The client-controlled submission whitelist (notes,
 *     rating, optional homework assignment, optional previous grades).
 * @param locale Active request locale (for the localized error
 *     messages; recipient notification copy is composed per recipient
 *     inside the emit seam).
 * @param outerTx Optional outer transaction. When provided (test path),
 *     the flow runs inside a SAVEPOINT on it; production callers omit
 *     it and the service opens its own transaction.
 * @param options Engine call options (injected transport / idempotency
 *     claim cache), passed through to the notification engine
 *     untouched.
 * @returns The inserted report row with all server-generated columns
 *     populated.
 */
export async function submitSessionReport(
  teacherUserId: number,
  sessionId: number,
  input: SessionReportSubmitInput,
  locale: string,
  outerTx?: DBTransaction,
  options?: NotificationEngineCallOptions
): Promise<ReportReturnType> {
  // 0. Pre-DB boundary validation — one locale resolution threads the
  // SAME translations handle through every guard and throw site below.
  const t = getServerTranslations(locale).errorsTranslations;
  assertPositiveSessionId(sessionId, t);
  const teacherNotes = assertTeacherNotes(input.teacherNotes, t);
  assertRating0To5(input.studentRatingByTeacher, t);
  if (input.homework) {
    validateAssignment(input.homework, t);
  }
  if (input.previousGrades) {
    validatePreviousGrades(input.previousGrades, t);
  }

  // 1. Actor authorization re-assertion — governance-clean AND the
  // teacher role (a student/parent/admin caller is denied with the typed
  // FORBIDDEN before any session work; the DB row is the authority).
  await assertTeacherGovernanceClean(teacherUserId, t, outerTx);

  // 2. One transaction body — every write composes on the same `tx`.
  const { report, receipts } = await withTransaction(outerTx, tx =>
    submitReportAndHomeworkInTx(teacherUserId, sessionId, teacherNotes, input, locale, t, options, tx)
  );

  // 3. Publish-after-commit — nothing is ever pushed for a rolled-back
  // emit.
  await NotificationEngine.publishReceipts(receipts, locale, options);

  // 4. The report row is the surface result.
  return report;
}

/**
 * Read-surface tx narrowing: the transition probe runs on a Drizzle
 * transaction, while the read surface accepts the wider `DBQueryExecutor`
 * (transaction OR pool OR pool client). A non-transaction executor drops
 * to `undefined` — the probe then runs on its own cold-path raw-SQL
 * fallback — so a pool handed in for the plain SELECT can never reach the
 * transaction-only parameter. Mirrors the per-repo `isDBTransaction`
 * guard shape (those are file-private to each repository).
 */
function isDBTransaction(tx: DBQueryExecutor): tx is DBTransaction {
  return typeof tx === "object" && "select" in tx;
}

/**
 * The shared participant gate for the read surface (both readers call
 * this ONE predicate — no duplicated participant logic): re-reads the
 * cold-path transition probe with NO lock (`findTransitionProbe` is a
 * plain SELECT — reads never take `FOR UPDATE`) and collapses every
 * non-participant into `null`:
 *   - unknown session id → `null`;
 *   - caller is neither the session's teacher nor its student → `null`
 *     (parents / admins / foreign users all get the identical `null` — a
 *     foreign id and a nonexistent id are indistinguishable).
 *
 * NO governance re-check runs here: the gate is participant-limited to
 * the caller's OWN session, and historical rows survive later governance
 * flips — a blocked or deleted account's past sessions stay readable to
 * the other participant.
 */
async function resolveVisibleSessionForCaller(
  callerUserId: number,
  sessionId: number,
  tx: DBQueryExecutor | undefined
): Promise<SessionTransitionProbeRowType | null> {
  const probe = await SessionRepository.findTransitionProbe(sessionId, tx && isDBTransaction(tx) ? tx : undefined);
  if (probe === null) {
    return null;
  }
  if (probe.teacherId !== callerUserId && probe.studentId !== callerUserId) {
    return null;
  }
  return probe;
}

/**
 * Reads one session's report for a participant of that session — the
 * teacher or the student. Every other caller shape (unknown id,
 * non-participant teacher/student, parent, admin, foreign user) receives
 * the same `null` with no indication of which shape matched.
 *
 * Render purity: ZERO writes, no governance re-check (the participant
 * gate is the only authority — see `resolveVisibleSessionForCaller`),
 * and NOTHING is logged (the read path is silent).
 *
 * @param callerUserId The caller's id (context-resolved server-side by
 *     the caller; shared PK with the users table).
 * @param sessionId The target session's id (validated before any
 *     database work).
 * @param locale Active request locale (for the id-shape guard's
 *     localized message).
 * @param tx Optional executor (transaction for the test/composed path;
 *     production callers omit it and the repo uses its raw-SQL path).
 * @returns The report row, or `null` when the session is not visible to
 *     the caller or carries no report.
 */
export async function getSessionReport(
  callerUserId: number,
  sessionId: number,
  locale: string,
  tx?: DBQueryExecutor
): Promise<ReportReturnType | null> {
  // Pre-DB boundary validation — the SAME id-shape guard the write
  // surface uses, with the locale's translations resolved once here.
  const t = getServerTranslations(locale).errorsTranslations;
  assertPositiveSessionId(sessionId, t);

  // Participant gate — every non-participant shape (unknown id included)
  // is the identical `null`; nothing is logged either way.
  const probe = await resolveVisibleSessionForCaller(callerUserId, sessionId, tx);
  if (probe === null) {
    return null;
  }

  return ReportRepository.findBySessionId(sessionId, tx);
}

/**
 * Reads one session's homework assignment for a participant of that
 * session — the same gate and the same `null` collapse as the report
 * reader, over the homework row instead.
 *
 * Render purity: ZERO writes, no governance re-check, NOTHING logged.
 *
 * @param callerUserId The caller's id (context-resolved server-side by
 *     the caller; shared PK with the users table).
 * @param sessionId The target session's id (validated before any
 *     database work).
 * @param locale Active request locale (for the id-shape guard's
 *     localized message).
 * @param tx Optional executor (transaction for the test/composed path;
 *     production callers omit it and the repo uses its raw-SQL path).
 * @returns The homework row, or `null` when the session is not visible
 *     to the caller or carries no assignment.
 */
export async function getSessionHomework(
  callerUserId: number,
  sessionId: number,
  locale: string,
  tx?: DBQueryExecutor
): Promise<HomeWorkReturnType | null> {
  // Pre-DB boundary validation — the SAME id-shape guard the write
  // surface uses, with the locale's translations resolved once here.
  const t = getServerTranslations(locale).errorsTranslations;
  assertPositiveSessionId(sessionId, t);

  // Participant gate — every non-participant shape (unknown id included)
  // is the identical `null`; nothing is logged either way.
  const probe = await resolveVisibleSessionForCaller(callerUserId, sessionId, tx);
  if (probe === null) {
    return null;
  }

  return HomeWorkRepository.findBySessionId(sessionId, tx);
}
