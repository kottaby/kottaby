/**
 * Cross-actor journey — session report + homework write/read surface
 * (submit gates → atomic co-creation → participant reads → null collapse →
 * one-shot grading → forced mid-transaction rollback → wallet purity).
 *
 * TEST-FIRST (RED): this suite is committed BEFORE the service surface exists.
 * The static import of the not-yet-existing service module carries a
 * `@ts-expect-error -- service surface lands with the report/homework
 * write/read implementation` directive, so the project-wide tsgo gate stays at
 * 0 errors during the RED phase while the suite fails at runtime ONLY on the
 * missing-module resolution error. FOR THE IMPLEMENTATION TASKS: as soon as
 * the service module lands, that directive becomes UNUSED (tsgo reports
 * TS2578) and MUST be removed in the same change that adds the module — the
 * unused directive is the designed forcing function, never a leftover.
 *
 * Assertion oracle — the cross-actor side-effect matrix (living spec, copied
 * verbatim from the implementation design's "Cross-Actor Journey Design" §4.4;
 * every row below is asserted by the correspondingly numbered step):
 *
 * | Step | Actor → action | `reports` rows | `home_work` rows | `notifications` rows | Publishes (spied transport) | Denial |
 * |---|---|---|---|---|---|---|
 * | 2 foreign teacher submits σ | — | 0 | 0 | 0 | 0 | `SESSION_NOT_FOUND` |
 * | 3 student submits | — | 0 | 0 | 0 | 0 | `FORBIDDEN` |
 * | 4 owner invalid payload | — | 0 | 0 | 0 | 0 | `VALIDATION` ×N (pre-DB) |
 * | 5 owner valid submit σ (1st session, no grades) | +1 report | +1 assignment (NULL grades) | +1 (student), +1 (parent) | student×1, parent×1 | — |
 * | 6 owner re-submit σ | 0 | 0 | 0 | 0 | 0 | `SESSION_REPORT_ALREADY_EXISTS` |
 * | 7 student reads σ | — (read) | — | — | — | row returned | — |
 * | 8 parent reads σ | — (read) | — | — | — | `null` byte-identical to foreign read | — |
 * | 9 owner submits σ₂ with grades | +1 report | +1 assignment σ₂ (NULL grades); σ's row UPDATED grades | +1 student, +1 parent | student×1, parent×1 | — |
 * | 10 owner re-grades σ | 0 | 0 | 0 | 0 | 0 | `CONFLICT` (already graded) |
 * | 11 forced mid-tx failure (homework insert fails after report) | 0 | 0 | 0 | 0 | 0 | masked/internal at wire; journey asserts unit rollback |
 *
 * Layer contract (`test/workflows/AGENTS.md` + docs/testing/workflow-journey-tests.md):
 * - NO `runInRollback` — fixtures COMMIT in `beforeAll` inside ONE committing
 *   transaction and are hard-deleted in `afterAll` via `TrackedFixtures` with
 *   post-teardown existence checks (zero residue), including every
 *   service-created side-effect row (reports, home_work, notifications,
 *   idempotency claims, sessions);
 * - honest authorization only — the cast is real `users` rows + real
 *   role-child rows; per-actor persisted locales are pinned because the
 *   recipient-locale composition is a journey assertion (the actor-context
 *   factories cannot express per-user locale, so the entity-setup builders
 *   are used directly — the sanctioned deviation precedent of the
 *   session-request journey);
 * - σ reaches `completed` through the REAL session-lifecycle service path
 *   (book → start → complete), never raw status surgery;
 * - external effects are intercepted at the injection seam:
 *   `SpiedFanoutTransport` + a suite-local Map-backed claim cache passed via
 *   the engine call options — no Redis, no WebSocket, ever;
 * - denial assertions use `catchJourneyError` + translated substrings from
 *   `getServerTranslations("en")` — never `expect(...).rejects.toThrow()`;
 * - cross-actor visibility is asserted BOTH directions after every step, with
 *   side-effect counts scoped to fixture ids so shared-DB rows can never
 *   satisfy a delta.
 *
 * Run:
 *   bun run test/scripts/run-test.ts test/workflows/classes/session-report-homework.journey.test.ts
 *   bun run test/scripts/run-test.ts test/workflows
 */
/*
 * TEST-FIRST RED suppression scope: the `@/backend/services/classes/
 * session-report.service` import below resolves NOWHERE while task 2.1 is the
 * only landed surface — it is the DESIGNED runtime failure of this suite.
 * This file-scoped eslint disable covers exactly that one specifier (the
 * rule fires on the import line, which also carries the `@ts-expect-error`
 * directive; a next-line eslint comment cannot share that line with it).
 * REMOVE BOTH this disable AND the `@ts-expect-error` above the import in
 * the SAME change that lands the module (task 2.7 — plus the 2.8 read
 * functions): tsgo reports the directive unused (TS2578) the moment the
 * module exists.
 */
/* eslint-disable import-x/no-unresolved -- TEST-FIRST RED: the session-report service module lands with tasks 2.7/2.8 (removal note above the import). */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/backend/db";
import { homeWork } from "@/backend/db/schema/classes/home-work";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { sessionRequestIdempotency } from "@/backend/db/schema/classes/session-request-idempotency";
import { notifications } from "@/backend/db/schema/notifications/notifications";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestAdmin,
  createTestParent,
  createTestStudent,
  createTestTeacherRow,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { type DomainErrorContext, logger } from "@/backend/lib/logger";
import { SessionLifecycleService } from "@/backend/services/classes/session-lifecycle.service";
// TEST-FIRST RED seam: the service module is DELIBERATELY absent while task
// 2.1 is the only landed surface — the static import below is the designed
// runtime failure of this suite (missing-module resolution, nothing else).
// The file-scoped eslint disable near the top of this file covers that one
// unresolvable specifier, and the `@ts-expect-error` line directly below
// keeps tsgo at 0. BOTH suppression directives MUST be removed in the SAME
// change that lands the module (task 2.7 — plus the 2.8 read-function
// names): until then tsgo reports the directive as unused the moment the
// module exists (TS2578).
// @ts-expect-error -- service surface lands with the report/homework write/read implementation
import * as SessionReportService from "@/backend/services/classes/session-report.service";
import type { NotificationEngineCallOptions } from "@/backend/services/notifications";
import {
  buildEmitClaimKey,
  type NotificationIdempotencyClaimCache,
} from "@/backend/services/notifications/emit-idempotency";
import type {
  DBTransaction,
  HomeWorkBlockInput,
  HomeWorkReturnType,
  NotificationReturnType,
  ReportReturnType,
  SessionReportSubmitInput,
  SessionReturnType,
  UserSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import {
  catchJourneyError,
  countAuditLogsForActor,
  countNotificationsForUser,
  countTeacherTransactionsForTeacher,
  countWalletsForTeacher,
  journeyPrefix,
  SpiedFanoutTransport,
  setGovernanceFixture,
  TrackedFixtures,
} from "@/test/workflows/helpers";

/** Per-run unique prefix embedded in every fixture identity field (rule 3). */
const RUN_PREFIX = journeyPrefix("classes");

/** The journey runs on the default test locale throughout. */
const LOCALE = "en";

/** Polymorphic entity pointer every report-wave row must carry. */
const RELATED_ENTITY_TYPE = "session";

/** Session id far beyond any identity sequence — guaranteed absent. */
const ABSENT_SESSION_ID = 2_000_000_000;

/** Actor id far beyond any identity sequence — the anonymous-equivalent caller. */
const ABSENT_USER_ID = 2_000_000_001;

/** Valid free-text notes reused by every accepted submission attempt. */
const VALID_NOTES = "Steady progress this session; next lesson continues the revision plan.";

/** The two cohesive homework blocks of the σ submission (Jadid + Madi). */
const JADID_BLOCK: HomeWorkBlockInput = { fromAyah: 1, toAyah: 7, surahJuz: SurahJuzRef.SurahAlFatihah };
const MADI_BLOCK: HomeWorkBlockInput = { fromAyah: 1, toAyah: 5, surahJuz: SurahJuzRef.Juz1 };

/** The σ′ (unlinked variant) Madi-only block and the σ₂ assignment blocks. */
const PRIME_MADI: HomeWorkBlockInput = { fromAyah: 2, toAyah: 6, surahJuz: SurahJuzRef.Juz3 };
const SIGMA2_JADID: HomeWorkBlockInput = { fromAyah: 8, toAyah: 12, surahJuz: SurahJuzRef.Juz2 };
const SIGMA2_MADI: HomeWorkBlockInput = { fromAyah: 3, toAyah: 9, surahJuz: SurahJuzRef.Juz4 };

/** Raw failure thrown by the step-11 fault probe in place of the homework INSERT. */
const FORCED_HOMEWORK_FAILURE = "journey fault probe: forced home_work insert failure after the report insert";

/** English translated denial copy — every assertion pins translated substrings. */
const ERRORS_EN = getServerTranslations("en").errorsTranslations;
/** English notification copy — the student wave composes in the student's locale. */
const NOTIFS_EN = getServerTranslations("en").notificationsTranslations;
/** Arabic notification copy — the parent wave composes in the parent's locale. */
const NOTIFS_AR = getServerTranslations("ar").notificationsTranslations;

/** One recorded domain-log call (code only — copy is never asserted from logs). */
interface DomainLogRecord {
  readonly code: string;
}

/**
 * Installs a recording stub over `logger.logDomainError` so domain rejections
 * stay silent in test output AND become assertable (exactly one bounded log
 * per denial; none on success). Callers MUST `stop()` (use try/finally).
 */
function recordDomainLogs(): { records: DomainLogRecord[]; stop: () => void } {
  const records: DomainLogRecord[] = [];
  const spy = spyOn(logger, "logDomainError").mockImplementation((_message: string, ctx?: DomainErrorContext) => {
    records.push({ code: ctx?.code ?? "<missing>" });
  });
  return { records, stop: () => spy.mockRestore() };
}

/**
 * Map-backed claim-cache double with SET-NX-EX semantics in memory, plus the
 * raw list of every attempted claim key so the journey can pin the engine's
 * key determinism (per-recipient digest over the same logical wave key).
 */
function createMemoryClaimCache(): NotificationIdempotencyClaimCache & { claimedKeys: readonly string[] } {
  const stored = new Map<string, string>();
  const attempted: string[] = [];
  return {
    claimedKeys: attempted,
    async claim(key: string, _ttlSeconds: number): Promise<boolean> {
      attempted.push(key);
      const fresh = !stored.has(key);
      if (fresh) {
        stored.set(key, "");
      }
      return fresh;
    },
    async get(key: string): Promise<string | null> {
      return stored.get(key) ?? null;
    },
    async store(key: string, value: string, _ttlSeconds: number): Promise<void> {
      stored.set(key, value);
    },
  };
}

/**
 * BOPLA-tamper base input: a fully typed submission whose fields callers
 * override per step (invalid sweeps mutate at runtime — no casts anywhere).
 */
function baseSubmitInput(overrides: Partial<SessionReportSubmitInput> = {}): SessionReportSubmitInput {
  return { teacherNotes: VALID_NOTES, studentRatingByTeacher: 4, ...overrides };
}

/** Scoped `reports` row count — only rows belonging to the journey's sessions. */
async function countReportRows(sessionIds: readonly number[]): Promise<number> {
  return db.$count(reports, inArray(reports.sessionId, [...sessionIds]));
}

/** Scoped `home_work` row count — only rows belonging to the journey's sessions. */
async function countHomeWorkRows(sessionIds: readonly number[]): Promise<number> {
  return db.$count(homeWork, inArray(homeWork.sessionId, [...sessionIds]));
}

/** Direct read of one session's report row (independent read-back oracle). */
async function reportRowBySessionId(sessionId: number): Promise<ReportReturnType | null> {
  const rows = await db.select().from(reports).where(eq(reports.sessionId, sessionId));
  return rows.at(0) ?? null;
}

/** Direct read of one session's homework row (independent read-back oracle). */
async function homeworkRowBySessionId(sessionId: number): Promise<HomeWorkReturnType | null> {
  const rows = await db.select().from(homeWork).where(eq(homeWork.sessionId, sessionId));
  return rows.at(0) ?? null;
}

/** All report-wave notification rows one user holds for one session. */
async function completionRowsFor(userId: number, sessionId: number): Promise<NotificationReturnType[]> {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, NotificationType.SessionCompletion),
        eq(notifications.relatedEntityId, sessionId)
      )
    );
}

/** Reads the booking-relevant escrow lanes of one student straight from the row. */
async function readBookingLanes(studentId: number): Promise<{ trial: number; hifz: number }> {
  const rows = await db
    .select({ hifz: students.balanceHifz, trial: students.balanceTrial })
    .from(students)
    .where(eq(students.id, studentId));
  const row = rows.at(0);
  if (row === undefined) {
    throw new Error(`journey: students row ${String(studentId)} vanished (fixture integrity failure)`);
  }
  // `balance_hifz` is a nullable column — a NULL lane is a fixture integrity
  // failure, never a legitimate state for this journey's cast.
  if (row.hifz === null) {
    throw new Error(`journey: students row ${String(studentId)} holds a NULL hifz lane (fixture integrity failure)`);
  }
  return { hifz: row.hifz, trial: row.trial };
}

/** Asserts the caught denial carries EXACTLY `code` and the translated message. */
function assertDenialCodeAndCopy(caught: Error, code: string, translated: string): void {
  expect(caught).toBeInstanceOf(DomainError);
  if (!(caught instanceof DomainError)) {
    throw new Error(`expected a DomainError (got ${caught.name})`);
  }
  expect(caught.code).toBe(code);
  expect(caught.message).toContain(translated);
}

/** Registers the idempotency claim a committed booking spent, for teardown. */
async function registerClaimRow(key: string, label: string, tracked: TrackedFixtures): Promise<void> {
  const rows = await db
    .select({ id: sessionRequestIdempotency.id })
    .from(sessionRequestIdempotency)
    .where(eq(sessionRequestIdempotency.idempotencyKey, key));
  const claim = rows.at(0);
  if (!claim) {
    throw new Error(`journey: idempotency claim for ${label} not found (fixture tracking failure)`);
  }
  tracked.register(sessionRequestIdempotency, claim.id);
}

/** Books, starts, and completes one session through the REAL lifecycle path. */
async function provisionCompletedSession(
  studentUserId: number,
  teacherUserId: number,
  key: string
): Promise<SessionReturnType> {
  const booked = await SessionLifecycleService.createSession(
    studentUserId,
    { teacherId: teacherUserId, intent: SessionIntent.Hifz },
    key,
    LOCALE
  );
  await SessionLifecycleService.startSession(teacherUserId, booked.id, LOCALE);
  return SessionLifecycleService.completeSession(teacherUserId, booked.id, LOCALE);
}

/**
 * Row-count snapshot of every table the report surface could touch, scoped to
 * fixture ids: per-actor inbox sizes, scoped reports/home_work rows, wallet
 * lanes, the student's escrow lanes, and the spied-transport publish count.
 */
async function sideEffectSnapshot(
  sessionIds: readonly number[],
  cast: {
    readonly studentS: UserSelectType;
    readonly studentSPrime: UserSelectType;
    readonly parentP: UserSelectType;
    readonly teacherT: UserSelectType;
    readonly teacherFt: UserSelectType;
    readonly adminA: UserSelectType;
  },
  lanesStudentId: number,
  publishes: number
): Promise<Record<string, number>> {
  const actorIds = [
    cast.studentS.id,
    cast.studentSPrime.id,
    cast.parentP.id,
    cast.teacherT.id,
    cast.teacherFt.id,
    cast.adminA.id,
  ];
  const inboxCounts = await Promise.all(actorIds.map(id => countNotificationsForUser(id)));
  const lanes = await readBookingLanes(lanesStudentId);
  return {
    notificationsS: inboxCounts[0] ?? -1,
    notificationsSPrime: inboxCounts[1] ?? -1,
    notificationsP: inboxCounts[2] ?? -1,
    notificationsT: inboxCounts[3] ?? -1,
    notificationsFt: inboxCounts[4] ?? -1,
    notificationsA: inboxCounts[5] ?? -1,
    reportRows: await countReportRows(sessionIds),
    homeworkRows: await countHomeWorkRows(sessionIds),
    walletRowsT: await countWalletsForTeacher(cast.teacherT.id),
    walletRowsFt: await countWalletsForTeacher(cast.teacherFt.id),
    teacherTransactionRowsT: await countTeacherTransactionsForTeacher(cast.teacherT.id),
    auditRowsT: await countAuditLogsForActor(cast.teacherT.id),
    lanesTrial: lanes.trial,
    lanesHifz: lanes.hifz,
    publishes,
  };
}

/** Asserts a step produced ZERO deltas on every snapshot field. */
function expectNoDeltas(before: Record<string, number>, after: Record<string, number>): void {
  expect(after).toEqual(before);
}

/**
 * Raw-tx fault probe (step 11 mechanism): a recording Proxy wrapped around a
 * REAL transaction handle. Every member forwards verbatim to the wrapped
 * handle, except (a) `transaction` re-wraps its savepoint handle so the probe
 * stays in the path for the service's whole transactional window, and (b) the
 * `home_work` INSERT is replaced by a thrown raw failure — AFTER the
 * `reports` INSERT has already executed — emulating a constraint/IO failure
 * mid-unit. The probe counts both inserts so the journey can prove the report
 * row was written before the forced failure. No production flag, no service
 * seam, no validation bypass: the injection lives entirely in this wrapper.
 */
function faultProbeTx(
  tx: DBTransaction,
  counters: { reportInserts: number; homeworkInsertAttempts: number }
): DBTransaction {
  return new Proxy(tx, {
    get(target, property): unknown {
      if (property === "insert") {
        return (table: PgTable): unknown => {
          if (table === reports) {
            counters.reportInserts += 1;
          }
          if (table === homeWork) {
            counters.homeworkInsertAttempts += 1;
            throw new Error(FORCED_HOMEWORK_FAILURE);
          }
          return target.insert(table);
        };
      }
      if (property === "transaction") {
        return (scoped: (inner: DBTransaction) => Promise<unknown>): Promise<unknown> =>
          target.transaction(inner => scoped(faultProbeTx(inner, counters)));
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("cross-actor journey: session report + homework (gates → co-creation → reads → grade-once → rollback)", () => {
  const tracked = new TrackedFixtures();
  const transportSpy = new SpiedFanoutTransport();
  const claimCache = createMemoryClaimCache();
  const engineOptions: NotificationEngineCallOptions = { transport: transportSpy, cache: claimCache };

  // Per-run idempotency keys — one per booked session (rule 3 prefixes).
  const KEY_SIGMA = `${RUN_PREFIX}-k-sigma`;
  const KEY_SIGMA_PRIME = `${RUN_PREFIX}-k-sigma-prime`;
  const KEY_SIGMA2 = `${RUN_PREFIX}-k-sigma-2`;
  const KEY_SIGMA3 = `${RUN_PREFIX}-k-sigma-3`;

  let studentS: UserSelectType;
  let studentSPrime: UserSelectType;
  let parentP: UserSelectType;
  let teacherT: UserSelectType;
  let teacherFt: UserSelectType;
  let adminA: UserSelectType;

  let sigma: SessionReturnType;
  let sigmaPrime: SessionReturnType;
  let sigma2: SessionReturnType;
  let sigma3: SessionReturnType;

  beforeAll(async () => {
    // ONE committing transaction: commit-or-nothing fixture provisioning.
    await db.transaction(async tx => {
      // Session student S — English locale, funded for exactly three bookings
      // (trial lane first, then the two Hifz units the later sessions burn).
      studentS = await createTestUser(tx, { role: "student", locale: "en", fullName: `${RUN_PREFIX} student S` });
      const studentSRow = await createTestStudent(tx, studentS.id, { balanceTrial: 1, balanceHifz: 2 });
      tracked.register(users, studentS.id);
      tracked.register(students, studentSRow.id);

      // S′ — the unlinked-parent variant (INV-P1 negative branch), one trial unit.
      studentSPrime = await createTestUser(tx, {
        role: "student",
        locale: "en",
        fullName: `${RUN_PREFIX} student S-prime`,
      });
      const studentSPrimeRow = await createTestStudent(tx, studentSPrime.id, { balanceTrial: 1 });
      tracked.register(users, studentSPrime.id);
      tracked.register(students, studentSPrimeRow.id);

      // Linked parent P — Arabic locale (recipient-locale composition proof).
      parentP = await createTestUser(tx, { role: "parent", locale: "ar", fullName: `${RUN_PREFIX} parent P` });
      const parentRow = await createTestParent(tx, parentP.id);
      tracked.register(users, parentP.id);
      tracked.register(parents, parentRow.id);

      // Certified owning teacher T + foreign certified teacher Ft.
      teacherT = await createTestUser(tx, { role: "teacher", locale: "en", fullName: `${RUN_PREFIX} teacher T` });
      const teacherTRow = await createTestTeacherRow(tx, teacherT.id, { isApproved: true });
      tracked.register(users, teacherT.id);
      tracked.register(teacher, teacherTRow.id);
      teacherFt = await createTestUser(tx, { role: "teacher", locale: "en", fullName: `${RUN_PREFIX} teacher Ft` });
      const teacherFtRow = await createTestTeacherRow(tx, teacherFt.id, { isApproved: true });
      tracked.register(users, teacherFt.id);
      tracked.register(teacher, teacherFtRow.id);

      // Admin A (honest role-child row; participant reads must still collapse).
      adminA = await createTestUser(tx, { role: "admin", locale: "en", fullName: `${RUN_PREFIX} admin A` });
      const adminRow = await createTestAdmin(tx, adminA.id);
      tracked.register(users, adminA.id);
      tracked.register(admin, adminRow.id);

      // Parent link S → P (emulates the link-request mutation; INV-P1 positive).
      await tx.update(students).set({ parentId: parentP.id }).where(eq(students.id, studentSRow.id));

      // σ — completed through the REAL lifecycle path (book → start → complete),
      // composed inside this provisioning transaction via the outerTx seam.
      sigma = await SessionLifecycleService.createSession(
        studentS.id,
        { teacherId: teacherT.id, intent: SessionIntent.Hifz },
        KEY_SIGMA,
        LOCALE,
        tx
      );
      await SessionLifecycleService.startSession(teacherT.id, sigma.id, LOCALE, tx);
      sigma = await SessionLifecycleService.completeSession(teacherT.id, sigma.id, LOCALE, tx);
      tracked.register(session, sigma.id);
      const claimRows = await tx
        .select({ id: sessionRequestIdempotency.id })
        .from(sessionRequestIdempotency)
        .where(eq(sessionRequestIdempotency.idempotencyKey, KEY_SIGMA));
      const claim = claimRows.at(0);
      if (!claim) {
        throw new Error("journey: σ booking claim not found (fixture tracking failure)");
      }
      tracked.register(sessionRequestIdempotency, claim.id);
    });
  });

  afterAll(async () => {
    // Reverse-registration-order hard delete + zero-residue re-probes for
    // EVERY tracked row (a leaking teardown fails the suite loudly).
    await tracked.cleanup();
  });

  test("step 1 — System: cast committed, σ completed via the real lifecycle path, baseline recorded", async () => {
    expect(sigma.status).toBe(SessionStatus.Completed);
    expect(sigma.feeHeld).toBe(true);
    expect(sigma.teacherId).toBe(teacherT.id);
    expect(sigma.studentId).toBe(studentS.id);

    // The booking consumed the trial lane first: trial 0, both Hifz units left.
    expect(await readBookingLanes(studentS.id)).toEqual({ hifz: 2, trial: 0 });

    // Baseline: zero report/homework/notification/wallet side effects anywhere.
    const baseline = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    expect(baseline.reportRows).toBe(0);
    expect(baseline.homeworkRows).toBe(0);
    expect(baseline.notificationsS).toBe(0);
    expect(baseline.notificationsP).toBe(0);
    expect(baseline.notificationsT).toBe(0);
    expect(baseline.notificationsFt).toBe(0);
    expect(baseline.notificationsA).toBe(0);
    expect(baseline.walletRowsT).toBe(0);
    expect(baseline.teacherTransactionRowsT).toBe(0);
    expect(baseline.publishes).toBe(0);
    // 6 users + 2 students + 1 parent + 2 teachers + 1 admin + σ + its claim.
    expect(tracked.size).toBe(14);
  });

  test("step 2 — foreign teacher Ft submits on σ: SESSION_NOT_FOUND oracle; zero side effects", async () => {
    const logs = recordDomainLogs();
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    try {
      const foreignError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          teacherFt.id,
          sigma.id,
          baseSubmitInput(),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      if (!(foreignError instanceof NotFoundError)) {
        throw new Error(`expected NotFoundError (got ${foreignError.name}: ${foreignError.message})`);
      }
      assertDenialCodeAndCopy(foreignError, "SESSION_NOT_FOUND", ERRORS_EN.sessionNotFound);

      // Oracle identity (foreign ≡ nonexistent on the write path): the SAME
      // denial shape for the owner aiming at an absent session id.
      const absentError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          teacherT.id,
          ABSENT_SESSION_ID,
          baseSubmitInput(),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      assertDenialCodeAndCopy(absentError, "SESSION_NOT_FOUND", ERRORS_EN.sessionNotFound);
      expect(absentError.message).toBe(foreignError.message);
      expect(logs.records.map(record => record.code)).toEqual(["SESSION_NOT_FOUND", "SESSION_NOT_FOUND"]);
    } finally {
      logs.stop();
    }
    expectNoDeltas(
      before,
      await sideEffectSnapshot(
        [sigma.id],
        {
          studentS,
          studentSPrime,
          parentP,
          teacherT,
          teacherFt,
          adminA,
        },
        studentS.id,
        transportSpy.publishCount
      )
    );
  });

  test("step 3 — student S submits: FORBIDDEN role denial; zero side effects", async () => {
    const logs = recordDomainLogs();
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    try {
      const studentError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          studentS.id,
          sigma.id,
          baseSubmitInput(),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      if (!(studentError instanceof ForbiddenError)) {
        throw new Error(`expected ForbiddenError (got ${studentError.name}: ${studentError.message})`);
      }
      assertDenialCodeAndCopy(studentError, "FORBIDDEN", ERRORS_EN.forbidden);
      expect(logs.records.map(record => record.code)).toEqual(["FORBIDDEN"]);
    } finally {
      logs.stop();
    }
    expectNoDeltas(
      before,
      await sideEffectSnapshot(
        [sigma.id],
        {
          studentS,
          studentSPrime,
          parentP,
          teacherT,
          teacherFt,
          adminA,
        },
        studentS.id,
        transportSpy.publishCount
      )
    );
  });

  test("step 4 — owner T invalid-payload sweep: VALIDATION ×8 pre-DB; zero rows anywhere after the sweep", async () => {
    const logs = recordDomainLogs();
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    try {
      // The eight mandated hostile payloads. The unknown-SurahJuzRef payload is
      // built with the runtime tamper pattern (no casts): the block is typed
      // with a real member, then the surahJuz field is overwritten with a
      // non-member string exactly as the wire would deliver it.
      const hostileBlock: HomeWorkBlockInput = { fromAyah: 1, toAyah: 5, surahJuz: SurahJuzRef.SurahAlFatihah };
      Object.assign(hostileBlock, { surahJuz: "surah_an_nuh" });
      const hostileInputs: SessionReportSubmitInput[] = [
        baseSubmitInput({ studentRatingByTeacher: 7 }),
        baseSubmitInput({ teacherNotes: "" }),
        baseSubmitInput({ teacherNotes: "a".repeat(2001) }),
        baseSubmitInput({ previousGrades: { currentGrade: 101, revisionGrade: 50 } }),
        baseSubmitInput({ previousGrades: { currentGrade: -1, revisionGrade: 50 } }),
        baseSubmitInput({ homework: { jadid: { fromAyah: 7, toAyah: 3, surahJuz: SurahJuzRef.SurahAlFatihah } } }),
        baseSubmitInput({ homework: { jadid: hostileBlock } }),
        baseSubmitInput({ homework: { madi: { fromAyah: 1.5, toAyah: 5, surahJuz: SurahJuzRef.Juz1 } } }),
      ];
      // Sequential sweep via recursion (the await-in-loop rule forbids a
      // plain for/await — depth bounded by the fixed payload list).
      const sweepNext = async (remaining: readonly SessionReportSubmitInput[]): Promise<void> => {
        const hostileInput = remaining[0];
        if (!hostileInput) {
          return;
        }
        const validationError = await catchJourneyError(() =>
          SessionReportService.submitSessionReport(
            teacherT.id,
            sigma.id,
            hostileInput,
            LOCALE,
            undefined,
            engineOptions
          )
        );
        if (!(validationError instanceof ValidationError)) {
          throw new Error(`expected ValidationError (got ${validationError.name}: ${validationError.message})`);
        }
        assertDenialCodeAndCopy(validationError, "VALIDATION", ERRORS_EN.validation);
        await sweepNext(remaining.slice(1));
      };
      await sweepNext(hostileInputs);
      // Pre-DB validation denials log nothing (the established emitter precedent).
      expect(logs.records).toEqual([]);
    } finally {
      logs.stop();
    }
    const after = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    expect(after.reportRows).toBe(0);
    expect(after.homeworkRows).toBe(0);
    expectNoDeltas(before, after);
  });

  test("step 5 — owner T valid submit on σ: report + Jadid/Madi assignment + exactly 2 localized waves", async () => {
    const logs = recordDomainLogs();
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    const submits = await SessionReportService.submitSessionReport(
      teacherT.id,
      sigma.id,
      baseSubmitInput({ homework: { jadid: JADID_BLOCK, madi: MADI_BLOCK } }),
      LOCALE,
      undefined,
      engineOptions
    );
    expect(logs.records).toEqual([]);

    // The reports row: exact 6-column shape (C.4 — no teacher identity
    // column exists on the row), server-mapped session linkage, verbatim notes.
    const reportRow = await reportRowBySessionId(sigma.id);
    if (!reportRow) {
      throw new Error("journey: expected the σ report row to exist after the valid submit");
    }
    expect(Object.keys(reportRow).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "createdAt",
      "id",
      "sessionId",
      "studentRatingByTeacher",
      "teacherNotes",
      "updatedAt",
    ]);
    expect(reportRow.sessionId).toBe(sigma.id);
    expect(reportRow.teacherNotes).toBe(VALID_NOTES);
    expect(reportRow.studentRatingByTeacher).toBe(4);
    expect(reportRow).toEqual(submits);
    tracked.register(reports, reportRow.id);

    // The home_work row: assignment blocks mapped, grades structurally NULL.
    const homeworkRow = await homeworkRowBySessionId(sigma.id);
    if (!homeworkRow) {
      throw new Error("journey: expected the σ home_work row to exist after the valid submit");
    }
    expect(homeworkRow.currentFromAyah).toBe(JADID_BLOCK.fromAyah);
    expect(homeworkRow.currentToAyah).toBe(JADID_BLOCK.toAyah);
    expect(homeworkRow.currentSurahJuz).toBe(SurahJuzRef.SurahAlFatihah);
    expect(homeworkRow.revisionFromAyah).toBe(MADI_BLOCK.fromAyah);
    expect(homeworkRow.revisionToAyah).toBe(MADI_BLOCK.toAyah);
    expect(homeworkRow.revisionSurahJuz).toBe(SurahJuzRef.Juz1);
    expect(homeworkRow.currentGrade).toBeNull();
    expect(homeworkRow.revisionGrade).toBeNull();
    tracked.register(homeWork, homeworkRow.id);

    // Exactly ONE report-wave row per recipient, composed in the RECIPIENT's
    // persisted locale, bodies carrying counterparty names only.
    const studentWaves = await completionRowsFor(studentS.id, sigma.id);
    const parentWaves = await completionRowsFor(parentP.id, sigma.id);
    expect(studentWaves).toHaveLength(1);
    expect(parentWaves).toHaveLength(1);
    const studentWave = studentWaves[0];
    const parentWave = parentWaves[0];
    if (!studentWave || !parentWave) {
      throw new Error("journey: expected one student wave and one parent wave for σ");
    }
    expect(studentWave.type).toBe(NotificationType.SessionCompletion);
    expect(studentWave.relatedEntityType).toBe(RELATED_ENTITY_TYPE);
    expect(studentWave.relatedEntityId).toBe(sigma.id);
    expect(studentWave.title).toBe(NOTIFS_EN.eventSessionReportReadyTitle);
    expect(studentWave.body).toBe(NOTIFS_EN.eventSessionReportReadyBody(teacherT.fullName));
    expect(parentWave.title).toBe(NOTIFS_AR.eventSessionReportReadyTitle);
    expect(parentWave.body).toBe(NOTIFS_AR.eventSessionReportReadyParentBody(studentS.fullName, teacherT.fullName));
    for (const wave of [studentWave, parentWave]) {
      if (wave.body === null) {
        throw new Error("journey: expected the report-wave body to be non-null");
      }
      expect(wave.body).not.toContain(VALID_NOTES);
    }
    tracked.register(notifications, studentWave.id);
    tracked.register(notifications, parentWave.id);

    // EXACTLY 2 publishes: one envelope per recipient, nobody else addressed.
    // Envelopes are compared as stringified id arrays so publish ORDER is
    // irrelevant while duplicates/wrong addressees still fail the multiset.
    expect(transportSpy.publishCount).toBe(before.publishes + 2);
    const newPublishes = transportSpy.calls.slice(before.publishes);
    expect(newPublishes.map(publish => JSON.stringify(publish.userIds)).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [parentP.id, studentS.id].map(id => JSON.stringify([id])).toSorted((a, b) => a.localeCompare(b))
    );

    // The engine claim keys are the deterministic per-recipient report keys.
    const expectedKeys = new Set([
      buildEmitClaimKey([studentS.id], NotificationType.SessionCompletion, `session:${String(sigma.id)}:report`),
      buildEmitClaimKey([parentP.id], NotificationType.SessionCompletion, `session:${String(sigma.id)}:report`),
    ]);
    expect(new Set(claimCache.claimedKeys)).toEqual(expectedKeys);

    // Isolation: non-participants hold nothing.
    expect(await countNotificationsForUser(studentSPrime.id)).toBe(0);
    expect(await countNotificationsForUser(teacherFt.id)).toBe(0);
    expect(await countNotificationsForUser(adminA.id)).toBe(0);
    expectNoDeltas(
      before,
      await sideEffectSnapshot(
        [sigma.id],
        {
          studentS,
          studentSPrime,
          parentP,
          teacherT,
          teacherFt,
          adminA,
        },
        studentS.id,
        transportSpy.publishCount
      )
    );
  });

  test("step 5b — S′ (unlinked parent) leg: INV-P1 gate — student wave ONLY, parent inbox untouched", async () => {
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );

    // S′ books, T starts + completes, T submits a Madi-only assignment.
    sigmaPrime = await provisionCompletedSession(studentSPrime.id, teacherT.id, KEY_SIGMA_PRIME);
    tracked.register(session, sigmaPrime.id);
    await registerClaimRow(KEY_SIGMA_PRIME, "σ′ booking", tracked);
    expect(await readBookingLanes(studentSPrime.id)).toEqual({ hifz: 0, trial: 0 });

    const submits = await SessionReportService.submitSessionReport(
      teacherT.id,
      sigmaPrime.id,
      baseSubmitInput({ homework: { madi: PRIME_MADI } }),
      LOCALE,
      undefined,
      engineOptions
    );
    const primeReportRow = await reportRowBySessionId(sigmaPrime.id);
    if (!primeReportRow) {
      throw new Error("journey: expected the σ′ report row to exist after the valid submit");
    }
    expect(primeReportRow).toEqual(submits);
    tracked.register(reports, primeReportRow.id);
    const primeHomeworkRow = await homeworkRowBySessionId(sigmaPrime.id);
    if (!primeHomeworkRow) {
      throw new Error("journey: expected the σ′ home_work row to exist after the valid submit");
    }
    expect(primeHomeworkRow.currentFromAyah).toBeNull();
    expect(primeHomeworkRow.currentGrade).toBeNull();
    expect(primeHomeworkRow.revisionFromAyah).toBe(SIGMA2_MADI.fromAyah);
    expect(primeHomeworkRow.revisionSurahJuz).toBe(SurahJuzRef.Juz3);
    tracked.register(homeWork, primeHomeworkRow.id);

    // INV-P1: the unlinked student's session produces the STUDENT wave only —
    // exactly one publish, one notification row, and the linked parent's
    // inbox for OTHER students stays untouched.
    const primeWaves = await completionRowsFor(studentSPrime.id, sigmaPrime.id);
    expect(primeWaves).toHaveLength(1);
    const primeWave = primeWaves[0];
    if (!primeWave) {
      throw new Error("journey: expected one student wave for σ′");
    }
    expect(primeWave.body).toBe(NOTIFS_EN.eventSessionReportReadyBody(teacherT.fullName));
    tracked.register(notifications, primeWave.id);
    expect(transportSpy.publishCount).toBe(before.publishes + 1);
    expect(transportSpy.calls.at(-1)?.userIds).toEqual([studentSPrime.id]);
    expect(await countNotificationsForUser(parentP.id)).toBe(before.notificationsP);

    // σ-side counts unchanged; the σ′ rows are outside the σ snapshot scope.
    expectNoDeltas(
      before,
      await sideEffectSnapshot(
        [sigma.id],
        {
          studentS,
          studentSPrime,
          parentP,
          teacherT,
          teacherFt,
          adminA,
        },
        studentS.id,
        transportSpy.publishCount
      )
    );
  });

  test("step 6 — owner T re-submits σ: SESSION_REPORT_ALREADY_EXISTS; counts unchanged; no new publishes", async () => {
    const logs = recordDomainLogs();
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    const keysBefore = new Set(claimCache.claimedKeys);
    try {
      const conflictError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          teacherT.id,
          sigma.id,
          baseSubmitInput(),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      if (!(conflictError instanceof ConflictError)) {
        throw new Error(`expected ConflictError (got ${conflictError.name}: ${conflictError.message})`);
      }
      assertDenialCodeAndCopy(conflictError, "SESSION_REPORT_ALREADY_EXISTS", ERRORS_EN.sessionReportAlreadyExists);
      expect(logs.records.map(record => record.code)).toEqual(["SESSION_REPORT_ALREADY_EXISTS"]);
    } finally {
      logs.stop();
    }
    const after = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    expect(after.reportRows).toBe(1);
    expect(after.homeworkRows).toBe(1);
    expect(after.notificationsS).toBe(1);
    expect(after.notificationsP).toBe(1);
    expect(new Set(claimCache.claimedKeys)).toEqual(keysBefore);
    expectNoDeltas(before, after);
  });

  test("step 7 — student S and owner T read report + homework of σ: full rows", async () => {
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    const reportRow = await reportRowBySessionId(sigma.id);
    const homeworkRow = await homeworkRowBySessionId(sigma.id);
    if (!reportRow || !homeworkRow) {
      throw new Error("journey: expected the σ report and homework rows to exist before the read steps");
    }

    const studentReport = await SessionReportService.getSessionReport(studentS.id, sigma.id, LOCALE);
    const studentHomework = await SessionReportService.getSessionHomework(studentS.id, sigma.id, LOCALE);
    expect(studentReport).toEqual(reportRow);
    expect(studentHomework).toEqual(homeworkRow);

    // The owning teacher is a participant too.
    expect(await SessionReportService.getSessionReport(teacherT.id, sigma.id, LOCALE)).toEqual(reportRow);
    expect(await SessionReportService.getSessionHomework(teacherT.id, sigma.id, LOCALE)).toEqual(homeworkRow);

    // Reads are pure: zero side-effect deltas.
    expectNoDeltas(
      before,
      await sideEffectSnapshot(
        [sigma.id],
        {
          studentS,
          studentSPrime,
          parentP,
          teacherT,
          teacherFt,
          adminA,
        },
        studentS.id,
        transportSpy.publishCount
      )
    );
  });

  test("step 8 — parent P, foreign teacher Ft, admin A read σ: null collapse, identical to the absent-session read", async () => {
    const before = await sideEffectSnapshot(
      [sigma.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );

    const parentReport = await SessionReportService.getSessionReport(parentP.id, sigma.id, LOCALE);
    const parentHomework = await SessionReportService.getSessionHomework(parentP.id, sigma.id, LOCALE);
    const foreignReport = await SessionReportService.getSessionReport(teacherFt.id, sigma.id, LOCALE);
    const foreignHomework = await SessionReportService.getSessionHomework(teacherFt.id, sigma.id, LOCALE);
    const adminReport = await SessionReportService.getSessionReport(adminA.id, sigma.id, LOCALE);
    const adminHomework = await SessionReportService.getSessionHomework(adminA.id, sigma.id, LOCALE);
    const absentReport = await SessionReportService.getSessionReport(studentS.id, ABSENT_SESSION_ID, LOCALE);
    const absentHomework = await SessionReportService.getSessionHomework(studentS.id, ABSENT_SESSION_ID, LOCALE);

    expect(parentReport).toBeNull();
    expect(parentHomework).toBeNull();
    expect(foreignReport).toBeNull();
    expect(foreignHomework).toBeNull();
    expect(adminReport).toBeNull();
    expect(adminHomework).toBeNull();
    expect(absentReport).toBeNull();
    expect(absentHomework).toBeNull();

    // Byte/semantic identity: foreign ≡ nonexistent ≡ parent ≡ admin.
    const normalized = [parentReport, foreignReport, adminReport, absentReport].map(value => JSON.stringify(value));
    expect(new Set(normalized).size).toBe(1);

    expectNoDeltas(
      before,
      await sideEffectSnapshot(
        [sigma.id],
        {
          studentS,
          studentSPrime,
          parentP,
          teacherT,
          teacherFt,
          adminA,
        },
        studentS.id,
        transportSpy.publishCount
      )
    );
  });

  test("step 9 — σ₂ completed at journey time; T submits with assignment + previousGrades: σ graded once, σ₂ assigned ungraded", async () => {
    const lanesBeforeBooking = await readBookingLanes(studentS.id);
    sigma2 = await provisionCompletedSession(studentS.id, teacherT.id, KEY_SIGMA2);
    tracked.register(session, sigma2.id);
    await registerClaimRow(KEY_SIGMA2, "σ₂ booking", tracked);
    // The booking consumed exactly one Hifz unit; the report surface must not move lanes.
    expect(await readBookingLanes(studentS.id)).toEqual({ hifz: lanesBeforeBooking.hifz - 1, trial: 0 });

    const sigmaHomeworkBefore = await homeworkRowBySessionId(sigma.id);
    if (!sigmaHomeworkBefore) {
      throw new Error("journey: expected the σ home_work row to exist before the graded submission");
    }
    const before = await sideEffectSnapshot(
      [sigma.id, sigma2.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );

    const submits = await SessionReportService.submitSessionReport(
      teacherT.id,
      sigma2.id,
      baseSubmitInput({
        homework: { jadid: SIGMA2_JADID, madi: SIGMA2_MADI },
        previousGrades: { currentGrade: 88, revisionGrade: 74 },
      }),
      LOCALE,
      undefined,
      engineOptions
    );
    const sigma2ReportRow = await reportRowBySessionId(sigma2.id);
    if (!sigma2ReportRow) {
      throw new Error("journey: expected the σ₂ report row to exist after the valid submit");
    }
    expect(sigma2ReportRow).toEqual(submits);
    tracked.register(reports, sigma2ReportRow.id);

    // σ's homework row: graded EXACTLY once with the submitted values, and
    // its updatedAt advanced past the assignment instant.
    const sigmaHomeworkAfter = await homeworkRowBySessionId(sigma.id);
    if (!sigmaHomeworkAfter) {
      throw new Error("journey: expected the σ home_work row to survive the graded submission");
    }
    expect(sigmaHomeworkAfter.id).toBe(sigmaHomeworkBefore.id);
    expect(sigmaHomeworkAfter.currentGrade).toBe(88);
    expect(sigmaHomeworkAfter.revisionGrade).toBe(74);
    expect(sigmaHomeworkAfter.updatedAt.getTime()).toBeGreaterThan(sigmaHomeworkBefore.updatedAt.getTime());
    tracked.register(homeWork, sigmaHomeworkAfter.id);

    // σ₂'s own assignment row: blocks mapped, grades structurally NULL.
    const sigma2HomeworkRow = await homeworkRowBySessionId(sigma2.id);
    if (!sigma2HomeworkRow) {
      throw new Error("journey: expected the σ₂ home_work row to exist after the valid submit");
    }
    expect(sigma2HomeworkRow.currentFromAyah).toBe(SIGMA2_JADID.fromAyah);
    expect(sigma2HomeworkRow.currentToAyah).toBe(SIGMA2_JADID.toAyah);
    expect(sigma2HomeworkRow.revisionFromAyah).toBe(SIGMA2_MADI.fromAyah);
    expect(sigma2HomeworkRow.currentGrade).toBeNull();
    expect(sigma2HomeworkRow.revisionGrade).toBeNull();
    tracked.register(homeWork, sigma2HomeworkRow.id);

    // Cumulative waves: student + parent each +1 for σ₂ (2 each in total).
    expect(await countNotificationsForUser(studentS.id)).toBe(2);
    expect(await countNotificationsForUser(parentP.id)).toBe(2);
    const sigma2StudentWaves = await completionRowsFor(studentS.id, sigma2.id);
    const sigma2ParentWaves = await completionRowsFor(parentP.id, sigma2.id);
    expect(sigma2StudentWaves).toHaveLength(1);
    expect(sigma2ParentWaves).toHaveLength(1);
    const sigma2StudentWave = sigma2StudentWaves[0];
    const sigma2ParentWave = sigma2ParentWaves[0];
    if (!sigma2StudentWave || !sigma2ParentWave) {
      throw new Error("journey: expected one student wave and one parent wave for σ₂");
    }
    expect(sigma2StudentWave.body).toBe(NOTIFS_EN.eventSessionReportReadyBody(teacherT.fullName));
    expect(sigma2ParentWave.body).toBe(
      NOTIFS_AR.eventSessionReportReadyParentBody(studentS.fullName, teacherT.fullName)
    );
    tracked.register(notifications, sigma2StudentWave.id);
    tracked.register(notifications, sigma2ParentWave.id);

    expect(transportSpy.publishCount).toBe(before.publishes + 2);
    const newPublishes = transportSpy.calls.slice(before.publishes);
    expect(newPublishes.map(publish => JSON.stringify(publish.userIds)).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [parentP.id, studentS.id].map(id => JSON.stringify([id])).toSorted((a, b) => a.localeCompare(b))
    );

    const after = await sideEffectSnapshot(
      [sigma.id, sigma2.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    expect(after.reportRows).toBe(2);
    expect(after.homeworkRows).toBe(2);
    // The submission itself moved no lane: booking and submission deltas attributed.
    expect(after.lanesHifz).toBe(before.lanesHifz);
    expect(after.lanesTrial).toBe(before.lanesTrial);
  });

  test("step 10 — T re-grade attempt via σ₃: typed CONFLICT (homeworkAlreadyGraded); σ grades unchanged", async () => {
    sigma3 = await provisionCompletedSession(studentS.id, teacherT.id, KEY_SIGMA3);
    tracked.register(session, sigma3.id);
    await registerClaimRow(KEY_SIGMA3, "σ₃ booking", tracked);
    const before = await sideEffectSnapshot(
      [sigma.id, sigma2.id, sigma3.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );

    const logs = recordDomainLogs();
    try {
      // The write-once grade guard: submitting further grades for the same
      // student after the σ assignment was graded is a typed conflict — the
      // one-shot UPDATE can never run twice (grade is write-once).
      const conflictError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          teacherT.id,
          sigma3.id,
          baseSubmitInput({ previousGrades: { currentGrade: 91, revisionGrade: 80 } }),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      if (!(conflictError instanceof ConflictError)) {
        throw new Error(`expected ConflictError (got ${conflictError.name}: ${conflictError.message})`);
      }
      assertDenialCodeAndCopy(conflictError, "CONFLICT", ERRORS_EN.homeworkAlreadyGraded);
      expect(logs.records.map(record => record.code)).toEqual(["CONFLICT"]);
    } finally {
      logs.stop();
    }

    const after = await sideEffectSnapshot(
      [sigma.id, sigma2.id, sigma3.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    // Zero rows anywhere for the denied attempt (the conflict rolled back its
    // own unit — σ₃ stays report-less) and σ's graded values are untouched.
    expect(after.reportRows).toBe(2);
    expect(after.homeworkRows).toBe(2);
    const sigmaHomework = await homeworkRowBySessionId(sigma.id);
    if (!sigmaHomework) {
      throw new Error("journey: expected the σ home_work row to survive the re-grade denial");
    }
    expect(sigmaHomework.currentGrade).toBe(88);
    expect(sigmaHomework.revisionGrade).toBe(74);
    expectNoDeltas(before, after);
  });

  test("step 11 — forced mid-transaction rollback: homework insert fails AFTER the report insert; full unit rollback", async () => {
    const before = await sideEffectSnapshot(
      [sigma.id, sigma2.id, sigma3.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    const counters = { reportInserts: 0, homeworkInsertAttempts: 0 };

    // The fault probe replaces the home_work INSERT with a raw failure inside
    // the service's own transactional window (σ₃ is completed and still
    // report-less, so the report insert legitimately executes first).
    const fault = await catchJourneyError(() =>
      db.transaction(async tx =>
        SessionReportService.submitSessionReport(
          teacherT.id,
          sigma3.id,
          baseSubmitInput({ homework: { jadid: JADID_BLOCK, madi: MADI_BLOCK } }),
          LOCALE,
          faultProbeTx(tx, counters),
          engineOptions
        )
      )
    );
    if (!(fault instanceof Error)) {
      throw new Error("journey: expected the forced homework failure to surface as an Error");
    }
    expect(fault).not.toBeInstanceOf(DomainError);
    expect(counters.reportInserts).toBe(1);
    expect(counters.homeworkInsertAttempts).toBe(1);

    // Total unit rollback: zero reports, zero home_work, zero notifications,
    // zero publishes for this attempt — and σ₃ stays report-less.
    const after = await sideEffectSnapshot(
      [sigma.id, sigma2.id, sigma3.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    expect(after.reportRows).toBe(2);
    expect(after.homeworkRows).toBe(2);
    expect(after.notificationsS).toBe(2);
    expect(after.notificationsP).toBe(2);
    expect(after.publishes).toBe(before.publishes);
    expect(await reportRowBySessionId(sigma3.id)).toBeNull();
    expectNoDeltas(before, after);
  });

  test("denial coverage — anonymous-equivalent caller + governed teacher; governance restore proven by the duplicate conflict", async () => {
    const before = await sideEffectSnapshot(
      [sigma.id, sigma2.id, sigma3.id],
      {
        studentS,
        studentSPrime,
        parentP,
        teacherT,
        teacherFt,
        adminA,
      },
      studentS.id,
      transportSpy.publishCount
    );
    const logs = recordDomainLogs();
    try {
      // Anonymous-equivalent: a caller id with no user row fails closed.
      const absentActorError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          ABSENT_USER_ID,
          sigma.id,
          baseSubmitInput(),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      if (!(absentActorError instanceof ForbiddenError)) {
        throw new Error(`expected ForbiddenError (got ${absentActorError.name}: ${absentActorError.message})`);
      }
      assertDenialCodeAndCopy(absentActorError, "FORBIDDEN", ERRORS_EN.forbidden);

      // Governed teacher: flip T's governance state, attempt, restore.
      const governedState = await setGovernanceFixture(teacherT.id, { suspended: true });
      expect(governedState.suspended).toBe(true);
      const governedError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          teacherT.id,
          sigma.id,
          baseSubmitInput(),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      if (!(governedError instanceof ForbiddenError)) {
        throw new Error(`expected ForbiddenError (got ${governedError.name}: ${governedError.message})`);
      }
      assertDenialCodeAndCopy(governedError, "FORBIDDEN", ERRORS_EN.forbidden);

      const restoredState = await setGovernanceFixture(teacherT.id, { suspended: false });
      expect(restoredState.suspended).toBe(false);
      // The restore is proven by T reaching the LATER gate again: the
      // duplicate-report conflict on σ (governance no longer denies first).
      const restoredError = await catchJourneyError(() =>
        SessionReportService.submitSessionReport(
          teacherT.id,
          sigma.id,
          baseSubmitInput(),
          LOCALE,
          undefined,
          engineOptions
        )
      );
      if (!(restoredError instanceof ConflictError)) {
        throw new Error(`expected ConflictError after governance restore (got ${restoredError.name})`);
      }
      assertDenialCodeAndCopy(restoredError, "SESSION_REPORT_ALREADY_EXISTS", ERRORS_EN.sessionReportAlreadyExists);
      expect(logs.records.map(record => record.code)).toEqual([
        "FORBIDDEN",
        "FORBIDDEN",
        "SESSION_REPORT_ALREADY_EXISTS",
      ]);
    } finally {
      logs.stop();
    }
    expectNoDeltas(
      before,
      await sideEffectSnapshot(
        [sigma.id, sigma2.id, sigma3.id],
        {
          studentS,
          studentSPrime,
          parentP,
          teacherT,
          teacherFt,
          adminA,
        },
        studentS.id,
        transportSpy.publishCount
      )
    );
  });

  test("final purity oracle — wallet/escrow/hold lanes byte-identical to baseline after ALL steps", async () => {
    expect(await countWalletsForTeacher(teacherT.id)).toBe(0);
    expect(await countWalletsForTeacher(teacherFt.id)).toBe(0);
    expect(await countTeacherTransactionsForTeacher(teacherT.id)).toBe(0);
    expect(await countAuditLogsForActor(teacherT.id)).toBe(0);
    expect(await countAuditLogsForActor(studentS.id)).toBe(0);

    // The holds the bookings placed are untouched by the report surface.
    const holdRows = await db
      .select({ feeHeld: session.feeHeld, id: session.id })
      .from(session)
      .where(inArray(session.id, [sigma.id, sigma2.id, sigma3.id, sigmaPrime.id]));
    expect(holdRows).toHaveLength(4);
    for (const holdRow of holdRows) {
      expect(holdRow.feeHeld).toBe(true);
    }

    // All three S bookings consumed their lanes; the report steps moved nothing.
    expect(await readBookingLanes(studentS.id)).toEqual({ hifz: 0, trial: 0 });

    // Final ledger: 2 σ-arc reports + homework rows; 5 waves; 5 publishes.
    expect(await countReportRows([sigma.id, sigma2.id, sigma3.id, sigmaPrime.id])).toBe(3);
    expect(await countHomeWorkRows([sigma.id, sigma2.id, sigma3.id, sigmaPrime.id])).toBe(3);
    expect(await countNotificationsForUser(studentS.id)).toBe(2);
    expect(await countNotificationsForUser(parentP.id)).toBe(2);
    expect(await countNotificationsForUser(studentSPrime.id)).toBe(1);
    expect(await countNotificationsForUser(teacherT.id)).toBe(0);
    expect(await countNotificationsForUser(teacherFt.id)).toBe(0);
    expect(await countNotificationsForUser(adminA.id)).toBe(0);
    expect(transportSpy.publishCount).toBe(5);
    // Every envelope ever published was addressed to a wave recipient only.
    const addressees = new Set(transportSpy.publishedUserIds);
    expect(addressees.has(teacherT.id)).toBe(false);
    expect(addressees.has(teacherFt.id)).toBe(false);
    expect(addressees.has(adminA.id)).toBe(false);
  });
});
