import { resolveDemoUserId } from "@/backend/db/seeds/parents/seed-parent-linkage";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import { ConflictError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { SessionLifecycleService } from "@/backend/services";
import * as SessionReportService from "@/backend/services/classes/session-report.service";
import type { SessionReturnType } from "@/backend/types/classes/session.types";

/**
 * Result summary for the demo-session-flow seed step.
 *
 * `inFlightDrained` counts scheduled/started demo sessions advanced to
 * `completed` this run (rows stranded by an earlier partial run).
 * `reportsSubmitted` counts completed sessions that gained their report
 * (with the demo homework assignment) this run. `bookedSessionId` is the
 * fresh booking's id when the step had to create one, `null` otherwise.
 * `skippedReason` explains a soft skip of the booking arm — `no-funding`
 * when every balance lane the production debit ladder probes is empty.
 */
export interface DemoSessionFlowState {
  inFlightDrained: number;
  reportsSubmitted: number;
  bookedSessionId: number | null;
  reportedTotal: number;
  skippedReason: "no-funding" | null;
}

/** Deterministic idempotency key for the step's fresh booking — one booking per demo student, ever. */
function demoBookingKey(studentUserId: number): string {
  return `demo-session-flow-${studentUserId}`;
}

/** The demo homework assignment the step attaches to every report it submits: a fresh Jadid span plus a revision span. */
const DEMO_HOMEWORK = {
  jadid: { fromAyah: 1, toAyah: 10, surahJuz: SurahJuzRef.SurahAlMaidah },
  madi: { fromAyah: 1, toAyah: 10, surahJuz: SurahJuzRef.Juz30 },
} as const;

const DEMO_TEACHER_NOTES =
  "Demo recitation session — confident memorization of the assigned passage; the revision span needs one more pass with attention to madd rules.";

/**
 * Session statuses as widened strings — the seeder compares the drizzle
 * row's status union against these, mirroring the services' guard-constant
 * doctrine (no raw enum-to-union comparison).
 */
const SCHEDULED_STATUS: string = SessionStatus.Scheduled;
const STARTED_STATUS: string = SessionStatus.Started;
const COMPLETED_STATUS: string = SessionStatus.Completed;

/**
 * Sequential walker — the sanctioned no-await-in-loop escape. Demo
 * reconciliation must be strictly ordered (each booking, transition, and
 * report depends on the previous step's committed state), so a recursive
 * walker processes the queue one item at a time instead of a loop body.
 */
async function walkSequentially<T>(items: readonly T[], visit: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const step = async (): Promise<void> => {
    const item = queue.shift();
    if (item === undefined) {
      return;
    }
    await visit(item);
    await step();
  };
  await step();
}

/** Recursively collects the demo student's sessions across every page (the participant read pages 50 at a time). */
async function collectSessionPages(
  studentUserId: number,
  page: number,
  collected: SessionReturnType[]
): Promise<SessionReturnType[]> {
  const result = await SessionLifecycleService.listMyStudentSessions(studentUserId, { status: null }, page, 50);
  collected.push(...result.items);
  if (collected.length >= result.totalCount || result.items.length === 0) {
    return collected;
  }
  return collectSessionPages(studentUserId, page + 1, collected);
}

/** Lists every session of the demo student (newest first) through the production participant read. */
export function listAllDemoSessions(studentUserId: number): Promise<readonly SessionReturnType[]> {
  return collectSessionPages(studentUserId, 1, []);
}

/** Advances one scheduled session to `completed` (the teacher starts it, then completes it). */
async function drainScheduledSession(teacherUserId: number, sessionId: number, locale: string): Promise<void> {
  await SessionLifecycleService.startSession(teacherUserId, sessionId, locale);
  await SessionLifecycleService.completeSession(teacherUserId, sessionId, locale);
}

/**
 * Advances every in-flight demo session to `completed`. Cancelled and
 * disputed rows are left untouched — those states are owned by their own
 * flows, not by demo reconciliation. Exported for the sibling
 * demo-paid-flow step, whose concurrent-replay arm reuses the exact
 * production-path drain.
 */
export async function drainInFlightSessions(
  studentUserId: number,
  teacherUserId: number,
  locale: string
): Promise<number> {
  const sessions = await listAllDemoSessions(studentUserId);
  let drained = 0;
  await walkSequentially(
    sessions.filter(row => row.status === SCHEDULED_STATUS),
    async row => {
      await drainScheduledSession(teacherUserId, row.id, locale);
      drained += 1;
    }
  );
  await walkSequentially(
    sessions.filter(row => row.status === STARTED_STATUS),
    async row => {
      await SessionLifecycleService.completeSession(teacherUserId, row.id, locale);
      drained += 1;
    }
  );
  return drained;
}

/**
 * Submits the demo report for one completed session. `withPreviousGrades`
 * adds the previous-grades block (it grades the student's newest ungraded
 * homework row through the production write-once path); a concurrent or
 * prior grader surfaces as a conflict, which the retry-without-grades arm
 * absorbs — the report itself must still land. Exported for the sibling
 * demo-paid-flow step, which reuses the exact production-path report
 * submission (and its conflict-absorbing retry arm) for the
 * subscription-funded session.
 */
export async function submitDemoReport(
  teacherUserId: number,
  sessionId: number,
  locale: string,
  withPreviousGrades: boolean
): Promise<void> {
  try {
    await SessionReportService.submitSessionReport(
      teacherUserId,
      sessionId,
      {
        teacherNotes: DEMO_TEACHER_NOTES,
        studentRatingByTeacher: 5,
        homework: { ...DEMO_HOMEWORK },
        previousGrades: withPreviousGrades ? { currentGrade: 92, revisionGrade: 88 } : undefined,
      },
      locale
    );
  } catch (error) {
    if (!(error instanceof ConflictError) || !withPreviousGrades) {
      throw error;
    }
    logger.info("Demo report grades conflicted with an already-graded homework row, retrying without grades");
    await SessionReportService.submitSessionReport(
      teacherUserId,
      sessionId,
      { teacherNotes: DEMO_TEACHER_NOTES, studentRatingByTeacher: 5, homework: { ...DEMO_HOMEWORK } },
      locale
    );
  }
}

/**
 * Gives every completed demo session its report, oldest first. A report and
 * its homework assignment settle together, so each submission also attaches
 * the demo homework. The second and later submissions carry previous grades
 * so a freshly seeded sandbox shows both an ungraded and a graded homework
 * row in the parent portal. Exported for the sibling demo-paid-flow step,
 * whose concurrent-replay arm reuses the exact production-path reporting.
 */
export async function reportCompletedSessions(
  studentUserId: number,
  teacherUserId: number,
  locale: string
): Promise<number> {
  const sessions = await listAllDemoSessions(studentUserId);
  const oldestFirst = sessions.filter(row => row.status === COMPLETED_STATUS).toReversed();
  let submitted = 0;
  await walkSequentially(oldestFirst, async target => {
    const existing = await SessionReportService.getSessionReport(studentUserId, target.id, locale);
    if (existing !== null) {
      return;
    }
    await submitDemoReport(teacherUserId, target.id, locale, submitted > 0);
    submitted += 1;
  });
  return submitted;
}

/** Counts the demo student's completed sessions that already carry a report. */
export async function countReportedSessions(studentUserId: number, locale: string): Promise<number> {
  const sessions = await listAllDemoSessions(studentUserId);
  const completed = sessions.filter(row => row.status === COMPLETED_STATUS);
  let reported = 0;
  await walkSequentially(completed, async target => {
    if ((await SessionReportService.getSessionReport(studentUserId, target.id, locale)) !== null) {
      reported += 1;
    }
  });
  return reported;
}

/**
 * Books one fresh demo session through the production booking path (the
 * trial lane is always attempted first), then walks the full teacher-side
 * lifecycle: start → complete → report with the demo homework assignment.
 */
async function bookStartCompleteAndReport(
  studentUserId: number,
  teacherUserId: number,
  locale: string
): Promise<number> {
  const booked = await SessionLifecycleService.createSession(
    studentUserId,
    { teacherId: teacherUserId, intent: SessionIntent.Hifz },
    demoBookingKey(studentUserId),
    locale
  );
  await SessionLifecycleService.startSession(teacherUserId, booked.id, locale);
  await SessionLifecycleService.completeSession(teacherUserId, booked.id, locale);
  await submitDemoReport(teacherUserId, booked.id, locale, false);
  return booked.id;
}

/**
 * Demo-session-flow seeder — reconciles ONE completed, reported session for
 * the demo teacher ↔ demo student pair so a freshly seeded sandbox shows the
 * parent portal's report and homework surfaces (and the session-completion
 * notification deep link) populated out of the box.
 *
 * Reconciliation, in order:
 *  1. Drain in-flight sessions (scheduled/started → completed) so a partial
 *     earlier run never strands a booking without its report.
 *  2. Give every completed session without a report its report (the demo
 *     homework assignment settles with it).
 *  3. When the pair still has NO completed+reported session, book one fresh
 *     through the production path with a deterministic idempotency key — a
 *     concurrent run replaying the same key surfaces as `DUPLICATE_REQUEST`
 *     and is absorbed (the other run completes the lifecycle). An empty
 *     balance ladder (trial already consumed, no subscription) is a soft
 *     skip, not a seed failure.
 *
 * Depends on the demo-linkage step: the booking path denies an
 * uncertified demo teacher with `TEACHER_NOT_CERTIFIED`, so this step
 * always runs AFTER it in the master controller.
 */
export async function seedOrGet(locale = "en"): Promise<DemoSessionFlowState> {
  const studentUserId = await resolveDemoUserId("student");
  const teacherUserId = await resolveDemoUserId("teacher");

  const inFlightDrained = await drainInFlightSessions(studentUserId, teacherUserId, locale);
  const reportsSubmitted = await reportCompletedSessions(studentUserId, teacherUserId, locale);

  let bookedSessionId: number | null = null;
  let skippedReason: DemoSessionFlowState["skippedReason"] = null;
  let reportedTotal = await countReportedSessions(studentUserId, locale);

  if (reportedTotal === 0) {
    try {
      bookedSessionId = await bookStartCompleteAndReport(studentUserId, teacherUserId, locale);
      reportedTotal = 1;
    } catch (error) {
      if (error instanceof ValidationError && error.code === "INSUFFICIENT_BALANCE") {
        skippedReason = "no-funding";
        logger.info("Demo session booking skipped: the demo student's balance lanes are exhausted");
      } else if (error instanceof ConflictError && error.code === "DUPLICATE_REQUEST") {
        logger.info("Demo session booking replayed concurrently; reconciling the winner's session instead");
        await drainInFlightSessions(studentUserId, teacherUserId, locale);
        await reportCompletedSessions(studentUserId, teacherUserId, locale);
        reportedTotal = await countReportedSessions(studentUserId, locale);
      } else {
        throw error;
      }
    }
  }

  const bookedLabel = bookedSessionId === null ? "none" : String(bookedSessionId);
  const skipLabel = skippedReason === null ? "" : ` skipped=${skippedReason}`;
  logger.info(
    `Demo session flow: drained=${inFlightDrained} reported=${reportsSubmitted} booked=${bookedLabel} reportedTotal=${reportedTotal}${skipLabel}`
  );
  return { inFlightDrained, reportsSubmitted, bookedSessionId, reportedTotal, skippedReason };
}
