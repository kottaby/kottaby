/**
 * Journey — Platform analytics read model (four journeys, A–D).
 *
 * Cross-actor workflow tests for the admin platform-analytics observation
 * surface. The admin is a pure OBSERVER: students pay, teachers serve,
 * parents exist, and the admin reads the whole-platform aggregate. Every
 * metric assertion is a BASELINE DELTA — the baseline is captured by direct
 * DB counts at each journey's start (whatever the shared database already
 * holds — asserted, never assumed zero) and the read must report exactly
 * `baseline + committed fixtures`.
 *
 *  - Journey A (cold platform honesty): admin-only cast; a platform with no
 *    journey fixtures reports `baseline + 0` everywhere, both trends are
 *    fully populated (30 zero-filled day buckets / skeleton-consistent
 *    revenue), and both rating averages stay honestly `null`.
 *  - Journey B (full cast observation): student + ACTIVE-window paid
 *    subscription + one paid EGP and one paid USD payment (today), an
 *    online certified teacher + an offline one, five sessions (four today —
 *    the cancelled one is backdated 40 days, outside today AND outside the
 *    trailing-30-day trend window), a pending withdrawal, one report, one
 *    evaluation, and a governed student. Every metric moves by its exact
 *    fixture delta; currencies never merge; the governed student is
 *    excluded from the active counters; the non-admin actors are denied.
 *  - Journey C (freshness evolution): two admin reads bracket one committed
 *    EGP payment + one completed session — the second read exposes exactly
 *    `+1 session / +exact amount`, the EGP row ascends in place, and
 *    `generatedAt` strictly advances (a cached answer fails here).
 *  - Journey D (denial & purity matrix): anonymous → `UnauthorizedError`;
 *    absent actor → `ForbiddenError` (the `assertActorAdminActive`
 *    governance helper maps an unresolvable row to FORBIDDEN — the
 *    sanctioned amendment over the plan's original UnauthorizedError);
 *    student/teacher/parent → `ForbiddenError`; governed admins resolve
 *    deleted → blocked → suspended (a multi-flagged admin surfaces the
 *    deleted message first). Every denial leaves every observed table
 *    byte-identical with zero audit and zero notification residue, and the
 *    whole suite ends byte-identical to its post-fixture state.
 *
 * Per `test/workflows/AGENTS.md`:
 *  - Committed fixtures in `beforeAll` inside ONE committing transaction
 *    per journey cast (commit-or-nothing); NO `runInRollback` — the service
 *    under test owns its transaction. Tracked hard-delete in `afterAll`:
 *    the append-only `student_payments`/`teacher_transaction` rows FIRST
 *    under `withImmutabilityTriggersSuspended` (the immutability triggers
 *    block their UPDATE/DELETE and they restrict-delete into
 *    `students`/`wallet`), then reports/evaluations/sessions/subscriptions/
 *    wallets/plans in FK-safe order, then the actor rows via
 *    `deleteUsersByIds` (whose audit sweep rides
 *    `withAuditDeleteTriggersSuspended`), then mandatory zero-residue
 *    probes.
 *  - Permissions resolve via REAL role context — the cast holds real
 *    `users.role` values plus real role-child rows provisioned by the
 *    actor-context factory. NEVER monkey-patched, NEVER scope-stubbed.
 *  - Denial assertions use a try/catch helper + translated substrings from
 *    `getServerTranslations("en").errorsTranslations` — NEVER
 *    `expect(...).rejects.toThrow()` and NEVER raw key echoes.
 *  - Analytics has NO external channel — nothing to spy on; the purity
 *    assertions (whole-table byte-identity via content digests + zero
 *    audit/notification deltas) ARE the seam proof.
 *  - Fixture timestamps are RELATIVE to the captured wall clock (never
 *    absolute dates); money is exact decimal-string math (integer minor
 *    units — never floats).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { plans } from "@/backend/db/schema/billing/plans";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { wallet } from "@/backend/db/schema/billing/wallet";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { notifications } from "@/backend/db/schema/notifications/notifications";
import { students } from "@/backend/db/schema/students/students";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestEvaluation,
  createTestPlan,
  createTestSession,
  createTestSessionReport,
  createTestStudent,
  createTestStudentPayment,
  createTestSubscription,
  createTestTeacherTransaction,
  createTestUser,
  createTestWallet,
} from "@/backend/db/test/entity-setup";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
// TEST-FIRST: the service does not exist yet — the unresolved import below
// is the sanctioned RED state; Task 2.6 ships the implementation that flips
// journeys A–D green.
import { PlatformAnalyticsService } from "@/backend/services/admin/platform-analytics.service";
import type {
  PlatformAnalyticsCurrencyRevenueReturnType,
  PlatformAnalyticsReturnType,
  PlatformAnalyticsSessionsReturnType,
  PlatformAnalyticsSubscriptionsReturnType,
  PlatformAnalyticsTeachersReturnType,
  PlatformAnalyticsUsersReturnType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
// Deep import (mirrors the journey-cleanup helper): the `test/helpers`
// barrel pulls the Apollo test client into backend-only dependency graphs.
import { countUsersByIds, deleteUsersByIds, withImmutabilityTriggersSuspended } from "@/test/helpers/db-cleanup";
import {
  ANONYMOUS_ACTOR_ID,
  type JourneyActor,
  provisionAdminActor,
  provisionCertifiedTeacherActor,
  provisionParentActor,
  provisionStudentActor,
  TrackedFixtures,
} from "@/test/workflows/helpers";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** Per-run prefix — unique free-text fixture markers; parallel runs never collide. */
const PREFIX = `jrn_pan_${randomUUID().slice(0, 8)}`;

/**
 * An actor id that provably resolves to no `users` row (int4-safe, far
 * above any sequence value the shared test database can reach). The denial
 * matrix pre-asserts its absence by direct count before the call.
 */
const ABSENT_ACTOR_ID = 2_000_000_000;

/** One day in milliseconds (UTC bucket arithmetic — no DST in UTC). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Journey B fixture amounts — exact decimal STRINGS (money is never a JS number). */
const B_EGP_PAYMENT_AMOUNT = "150.75";
const B_USD_PAYMENT_AMOUNT = "49.99";

/** Journey C's additional committed EGP payment — the freshness delta. */
const C_EGP_PAYMENT_AMOUNT = "123.45";

/** Journey B's cancelled session is backdated this many days — outside today AND outside the 30-day trend window. */
const CANCELLED_SESSION_DAYS_AGO = 40;

/** Number of daily buckets in each trend series. */
const TREND_BUCKET_COUNT = 30;

/** Parses an exact decimal string into integer minor units (scale 2) — never through a float. */
function toMinorUnits(decimalString: string): bigint {
  const match = /^-?\d+(\.\d+)?$/.exec(decimalString);
  if (!match) {
    throw new Error(`toMinorUnits: "${decimalString}" is not a decimal string`);
  }
  const negative = decimalString.startsWith("-");
  const unsigned = negative ? decimalString.slice(1) : decimalString;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const fractionPadded = `${fractionPart}00`.slice(0, 2);
  const units = BigInt(wholePart) * 100n + BigInt(fractionPadded);
  return negative ? -units : units;
}

/** Renders integer minor units back to an exact 2-dp decimal string. */
function formatMinorUnits(units: bigint): string {
  const negative = units < 0n;
  const magnitude = negative ? -units : units;
  const whole = magnitude / 100n;
  const fraction = (magnitude % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Midnight-UTC instant of the day containing `instant` (the trend bucket anchor). */
function utcDayStart(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/** Monday-00:00-UTC instant of the ISO week containing `instant`. */
function isoWeekStart(instant: Date): Date {
  const dayStart = utcDayStart(instant);
  const daysSinceMonday = (dayStart.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
}

/** First-of-month-00:00-UTC instant of the month containing `instant`. */
function utcMonthStart(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
}

/**
 * Try/catch rejection helper (journey-layer pattern —
 * `expect(...).rejects.toThrow()` is prohibited). Returns the caught error;
 * fails the test when the call resolves successfully.
 */
async function expectJourneyError(fn: () => Promise<unknown>): Promise<Error> {
  let caught: unknown = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  if (caught === null) {
    throw new Error("expectJourneyError: expected the call to throw, but it resolved successfully");
  }
  if (caught instanceof Error) {
    return caught;
  }
  return new Error(`expectJourneyError: caught non-Error throw (${typeof caught})`);
}

/** The single service call under test — one admin analytics read. */
async function readAnalytics(actorId: number, locale: string = LOCALE): Promise<PlatformAnalyticsReturnType> {
  return PlatformAnalyticsService.getPlatformAnalytics(actorId, locale);
}

/** Direct whole-table audit count (row-count oracle — reads must append ZERO audit rows). */
async function countAuditRows(): Promise<number> {
  return db.$count(auditLogs);
}

/** Direct whole-table notification count (zero-fan-out oracle). */
async function countNotificationRows(): Promise<number> {
  return db.$count(notifications);
}

/**
 * Direct-DB mirror of every metric the analytics snapshot composes — the
 * baseline is whatever the shared database holds at capture time
 * (asserted, never assumed zero).
 */
interface Baseline {
  readonly now: Date;
  readonly sessions: PlatformAnalyticsSessionsReturnType;
  /** Sparse UTC-day-ms → session-count map inside the trailing-30-day window. */
  readonly sessionTrendSparse: ReadonlyMap<number, number>;
  readonly revenueRows: readonly PlatformAnalyticsCurrencyRevenueReturnType[];
  /** Sparse `${utcDayMs}|${currency}` → paid-sum string inside the trailing-30-day window. */
  readonly revenueTrendSparse: ReadonlyMap<string, string>;
  /** The currency set discovered in the trend window (drives the revenue skeleton). */
  readonly windowCurrencies: readonly string[];
  readonly offlineActivationsCount: number;
  readonly subscriptions: PlatformAnalyticsSubscriptionsReturnType;
  readonly teachers: PlatformAnalyticsTeachersReturnType;
  readonly sessionRatingsCount: number;
  readonly sessionRatingSum: number;
  readonly evaluationScoresCount: number;
  readonly evaluationScoreSum: number;
  readonly pendingDisputes: number;
  readonly pendingWithdrawals: number;
  readonly users: PlatformAnalyticsUsersReturnType;
}

/** Aggregate row extraction — a single-row aggregate always returns exactly one row. */
function singleRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`baseline capture: no aggregate row for ${label}`);
  }
  return row;
}

/** Captures the baseline by direct DB counts mirroring each metric's predicate. */
async function captureBaseline(): Promise<Baseline> {
  const now = new Date();
  const dayStart = utcDayStart(now);
  const weekStart = isoWeekStart(now);
  const monthStart = utcMonthStart(now);
  const trendWindowStart = new Date(now.getTime() - TREND_BUCKET_COUNT * DAY_MS);
  const recentCutoff = new Date(now.getTime() - DAY_MS);
  const newThisWeekCutoff = new Date(now.getTime() - 7 * DAY_MS);

  const sessionAgg = singleRow(
    (
      await db
        .select({
          total: sql<number>`count(*)::int`,
          today: sql<number>`count(*) filter (where ${session.createdAt} >= ${dayStart})::int`,
          thisWeek: sql<number>`count(*) filter (where ${session.createdAt} >= ${weekStart})::int`,
          thisMonth: sql<number>`count(*) filter (where ${session.createdAt} >= ${monthStart})::int`,
          scheduled: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Scheduled})::int`,
          started: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Started})::int`,
          completed: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Completed})::int`,
          cancelled: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Cancelled})::int`,
          disputed: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Disputed})::int`,
          awaitingConfirmation: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Completed} and ${session.confirmedByStudentAt} is null)::int`,
        })
        .from(session)
    )[0],
    "session aggregate"
  );

  const sessionTrendRows = await db
    .select({
      bucketMs: sql<number>`(extract(epoch from date_trunc('day', ${session.createdAt})) * 1000)::double precision`,
      sessionCount: sql<number>`count(*)::int`,
    })
    .from(session)
    .where(gte(session.createdAt, trendWindowStart))
    .groupBy(sql`date_trunc('day', ${session.createdAt})`);

  const revenueRows = await db
    .select({
      currency: studentPayments.currency,
      totalAmount: sql<string>`coalesce(sum(${studentPayments.amount}), 0)::text`,
      last30DaysAmount: sql<string>`coalesce(sum(${studentPayments.amount}) filter (where ${studentPayments.createdAt} >= ${trendWindowStart}), 0)::text`,
      paidPaymentsCount: sql<number>`count(*)::int`,
    })
    .from(studentPayments)
    .where(eq(studentPayments.status, PaymentStatus.Paid))
    .groupBy(studentPayments.currency)
    .orderBy(studentPayments.currency);

  const revenueTrendRows = await db
    .select({
      bucketMs: sql<number>`(extract(epoch from date_trunc('day', ${studentPayments.createdAt})) * 1000)::double precision`,
      currency: studentPayments.currency,
      amount: sql<string>`sum(${studentPayments.amount})::text`,
    })
    .from(studentPayments)
    .where(and(eq(studentPayments.status, PaymentStatus.Paid), gte(studentPayments.createdAt, trendWindowStart)))
    .groupBy(sql`date_trunc('day', ${studentPayments.createdAt})`, studentPayments.currency);

  const subscriptionAgg = singleRow(
    (
      await db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Active})::int`,
          pending: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Pending})::int`,
          expired: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Expired})::int`,
          cancelled: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Cancelled})::int`,
          suspended: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Suspended})::int`,
          activeInWindowNow: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Active} and coalesce(${subscriptions.startDate}, ${now}) <= ${now} and (${subscriptions.endDate} is null or ${now} < ${subscriptions.endDate}))::int`,
        })
        .from(subscriptions)
    )[0],
    "subscription aggregate"
  );

  const teacherAgg = singleRow(
    (
      await db
        .select({
          certifiedCount: sql<number>`count(*) filter (where ${teacher.isApproved} = true)::int`,
          evaluatorCount: sql<number>`count(*) filter (where ${teacher.isEvaluator} = true)::int`,
          onlineNowCount: sql<number>`count(*) filter (where ${teacher.isApproved} = true and ${teacher.isOnline} = true)::int`,
        })
        .from(teacher)
    )[0],
    "teacher aggregate"
  );

  const reportAgg = singleRow(
    (
      await db
        .select({
          ratedCount: sql<number>`count(*)::int`,
          ratingSum: sql<number>`coalesce(sum(${reports.studentRatingByTeacher}), 0)::double precision`,
        })
        .from(reports)
        .where(sql`${reports.studentRatingByTeacher} is not null`)
    )[0],
    "report rating aggregate"
  );

  const evaluationAgg = singleRow(
    (
      await db
        .select({
          scoredCount: sql<number>`count(*)::int`,
          scoreSum: sql<number>`coalesce(sum(${evaluations.score}), 0)::double precision`,
        })
        .from(evaluations)
        .where(and(sql`coalesce(${evaluations.isDeleted}, false) = false`, sql`${evaluations.score} is not null`))
    )[0],
    "evaluation score aggregate"
  );

  const disputeAgg = singleRow(
    (
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(session)
        .where(eq(session.status, SessionStatus.Disputed))
    )[0],
    "dispute aggregate"
  );

  const withdrawalAgg = singleRow(
    (
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(teacherTransaction)
        .where(
          and(
            eq(teacherTransaction.type, TransactionType.Withdrawal),
            eq(teacherTransaction.status, TransactionStatus.Pending)
          )
        )
    )[0],
    "withdrawal aggregate"
  );

  const offlineAgg = singleRow(
    (
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(
          inArray(subscriptions.paymentMethod, [
            PaymentGateway.OfflineCash,
            PaymentGateway.BankTransfer,
            PaymentGateway.Scholarship,
          ])
        )
    )[0],
    "offline activation aggregate"
  );

  const userAgg = singleRow(
    (
      await db
        .select({
          totalCount: sql<number>`count(*)::int`,
          activeCount: sql<number>`count(*) filter (where coalesce(${users.isDeleted}, false) = false and coalesce(${users.suspended}, false) = false and coalesce(${users.isBlocked}, false) = false)::int`,
          suspendedCount: sql<number>`count(*) filter (where ${users.suspended} = true)::int`,
          blockedCount: sql<number>`count(*) filter (where ${users.isBlocked} = true)::int`,
          deletedCount: sql<number>`count(*) filter (where ${users.isDeleted} = true)::int`,
          adminsCount: sql<number>`count(*) filter (where ${users.role} = ${UserRole.Admin})::int`,
          teachersCount: sql<number>`count(*) filter (where ${users.role} = ${UserRole.Teacher})::int`,
          studentsCount: sql<number>`count(*) filter (where ${users.role} = ${UserRole.Student})::int`,
          parentsCount: sql<number>`count(*) filter (where ${users.role} = ${UserRole.Parent})::int`,
          newThisWeekCount: sql<number>`count(*) filter (where ${users.createdAt} > ${newThisWeekCutoff})::int`,
          recentlyActive24h: sql<number>`count(*) filter (where ${users.lastActiveAt} > ${recentCutoff} and coalesce(${users.isDeleted}, false) = false and coalesce(${users.suspended}, false) = false and coalesce(${users.isBlocked}, false) = false)::int`,
        })
        .from(users)
    )[0],
    "user aggregate"
  );

  return {
    now,
    sessions: sessionAgg,
    sessionTrendSparse: new Map(sessionTrendRows.map(row => [row.bucketMs, row.sessionCount])),
    revenueRows,
    revenueTrendSparse: new Map(revenueTrendRows.map(row => [`${row.bucketMs}|${row.currency}`, row.amount])),
    windowCurrencies: [...new Set(revenueTrendRows.map(row => row.currency))].sort(),
    offlineActivationsCount: offlineAgg.count,
    subscriptions: subscriptionAgg,
    teachers: teacherAgg,
    sessionRatingsCount: reportAgg.ratedCount,
    sessionRatingSum: reportAgg.ratingSum,
    evaluationScoresCount: evaluationAgg.scoredCount,
    evaluationScoreSum: evaluationAgg.scoreSum,
    pendingDisputes: disputeAgg.count,
    pendingWithdrawals: withdrawalAgg.count,
    users: userAgg,
  };
}

/** One expected zero-filled session-trend point as primitive comparables. */
interface ExpectedSessionPoint {
  readonly bucketStartMs: number;
  readonly sessionCount: number;
}

/** One expected revenue-trend point as primitive comparables. */
interface ExpectedRevenuePoint {
  readonly bucketStartMs: number;
  readonly currency: string;
  readonly amount: string;
}

/**
 * Builds the expected 30-bucket zero-filled session trend relative to the
 * read's day: consecutive UTC midnights ending at `readDayStartMs`, the
 * baseline sparse counts zero-filled, plus `todayDelta` on the LAST bucket.
 */
function expectedSessionTrend(
  baseline: Baseline,
  readDayStartMs: number,
  todayDelta: number
): readonly ExpectedSessionPoint[] {
  return Array.from({ length: TREND_BUCKET_COUNT }, (_, index) => {
    const bucketStartMs = readDayStartMs - (TREND_BUCKET_COUNT - 1 - index) * DAY_MS;
    const baselineCount = baseline.sessionTrendSparse.get(bucketStartMs) ?? 0;
    const delta = bucketStartMs === readDayStartMs ? todayDelta : 0;
    return { bucketStartMs, sessionCount: baselineCount + delta };
  });
}

/**
 * Builds the expected revenue trend skeleton relative to the read's day:
 * every (day, window-currency) pair is present; a pair the baseline sparse
 * rows or the committed deltas touch carries the exact decimal-string sum,
 * every other pair is the literal `"0"` fill; when NO currency exists in
 * the window the series is honestly EMPTY.
 */
function expectedRevenueTrend(
  baseline: Baseline,
  readDayStartMs: number,
  dayDeltas: ReadonlyMap<string, string>
): readonly ExpectedRevenuePoint[] {
  const deltaCurrencies = [...dayDeltas.keys()].map(key => key.split("|")[1] ?? "");
  const currencies = [...new Set([...baseline.windowCurrencies, ...deltaCurrencies])].sort();
  const points: ExpectedRevenuePoint[] = [];
  for (let index = 0; index < TREND_BUCKET_COUNT; index += 1) {
    const bucketStartMs = readDayStartMs - (TREND_BUCKET_COUNT - 1 - index) * DAY_MS;
    for (const currency of currencies) {
      const key = `${bucketStartMs}|${currency}`;
      const deltaUnits = dayDeltas.has(key) ? toMinorUnits(dayDeltas.get(key) ?? "0") : 0n;
      const touched = baseline.revenueTrendSparse.has(key) || deltaUnits !== 0n;
      const amount = touched
        ? formatMinorUnits(toMinorUnits(baseline.revenueTrendSparse.get(key) ?? "0") + deltaUnits)
        : "0";
      points.push({ bucketStartMs, currency, amount });
    }
  }
  return points;
}

/** Projects a live session trend onto primitive comparables for exact ordering-sensitive equality. */
function actualSessionTrend(snapshot: PlatformAnalyticsReturnType): readonly ExpectedSessionPoint[] {
  return snapshot.sessionTrendDaily.map(point => ({
    bucketStartMs: point.bucketStart.getTime(),
    sessionCount: point.sessionCount,
  }));
}

/** Projects a live revenue trend onto primitive comparables for exact ordering-sensitive equality. */
function actualRevenueTrend(snapshot: PlatformAnalyticsReturnType): readonly ExpectedRevenuePoint[] {
  return snapshot.revenueTrendDaily.map(point => ({
    bucketStartMs: point.bucketStart.getTime(),
    currency: point.currency,
    amount: point.amount,
  }));
}

/** Asserts the trend-array invariants both journeys pin: fullness + bucket alignment to the read day. */
function expectTrendSkeleton(snapshot: PlatformAnalyticsReturnType, readDayStartMs: number): void {
  expect(snapshot.sessionTrendDaily).toHaveLength(TREND_BUCKET_COUNT);
  const lastBucket = snapshot.sessionTrendDaily[TREND_BUCKET_COUNT - 1];
  expect(lastBucket?.bucketStart.getTime()).toBe(readDayStartMs);
}

/** Byte-identity digest of one observed table (row count + full-row content hash, PK-ordered). */
interface TableDigest {
  readonly rowCount: number;
  readonly digest: string;
}

/** The eight tables the analytics surface reads — all must stay byte-identical across every read window. */
const OBSERVED_TABLES = [
  "users",
  "session",
  "student_payments",
  "subscriptions",
  "teacher",
  "evaluations",
  "reports",
  "teacher_transaction",
] as const;
type ObservedTable = (typeof OBSERVED_TABLES)[number];
type TableDigests = Record<ObservedTable, TableDigest>;

/** Content-digests one observed table (to_jsonb row text, md5 over a PK-ordered aggregate). */
async function tableDigest(tableName: ObservedTable): Promise<TableDigest> {
  const result = await db.execute<{ row_count: number; digest: string }>(sql`
    select coalesce(count(*), 0)::int as row_count,
           coalesce(md5(string_agg(row_text, '|' order by id)), '')::text as digest
    from (select id, to_jsonb(observed)::text as row_text from ${sql.identifier(tableName)} observed) as digest_source
  `);
  const row = result.rows[0];
  if (!row) {
    throw new Error(`tableDigest: no aggregate row for "${tableName}"`);
  }
  return { rowCount: row.row_count, digest: row.digest };
}

/** Snapshots content digests of every observed table. */
async function snapshotObservedTables(): Promise<TableDigests> {
  const entries = await Promise.all(OBSERVED_TABLES.map(async table => [table, await tableDigest(table)] as const));
  return Object.fromEntries(entries) as TableDigests;
}

/** Byte-identity assertion — every observed table's digest is unchanged. */
function expectTablesByteIdentical(before: TableDigests, after: TableDigests): void {
  for (const tableName of OBSERVED_TABLES) {
    expect(after[tableName]).toEqual(before[tableName]);
  }
}

/** Zero if `ids` is empty, else the count of surviving rows (a guard against empty `inArray` probes). */
function countIfAny(ids: readonly number[], count: () => Promise<number>): Promise<number> {
  return ids.length > 0 ? count() : Promise.resolve(0);
}

/** Registry of every committed row the suite creates — deleted + re-probed in `afterAll`. */
const tracked = new TrackedFixtures();

/** Actor cast — Journey A binds the admin; B the pay/serve cast; D the governed admins. */
let admin: JourneyActor;
let studentActor: JourneyActor;
let onlineTeacher: JourneyActor;
let offlineTeacher: JourneyActor;
let parentActor: JourneyActor;
let deletedAdmin: JourneyActor;
let blockedAdmin: JourneyActor;
let suspendedAdmin: JourneyActor;
let multiFlaggedAdmin: JourneyActor;

/** Tracked fixture worklists — the afterAll hard-delete lists (ids from the factory returns). */
const castUserIds: number[] = [];
const planIds: number[] = [];
const subscriptionIds: number[] = [];
const paymentIds: number[] = [];
const walletIds: number[] = [];
const transactionIds: number[] = [];
const sessionIds: number[] = [];
const reportIds: number[] = [];
const evaluationIds: number[] = [];

/** Whole-suite audit/notification baselines (captured before ANY provisioning). */
let auditBaseline = 0;
let notificationBaseline = 0;

/** Per-journey baselines and reads. */
let baselineA: Baseline;
let baselineB: Baseline;
let readA: PlatformAnalyticsReturnType;
let readB: PlatformAnalyticsReturnType;
let readT1: PlatformAnalyticsReturnType;
let readT2: PlatformAnalyticsReturnType;

/** Byte-identity snapshots per read window. */
let digestsAfterARead: TableDigests;
let digestsAfterBRead: TableDigests;
let digestsAfterCFixtures: TableDigests;
let digestsPostFixture: TableDigests;

describe("Platform analytics — admin read-model journeys (A–D)", () => {
  afterAll(async () => {
    // 1. Append-only ledger rows FIRST, under the immutability-trigger
    //    suspension — their UPDATE/DELETE triggers would otherwise raise,
    //    and the subscription/session parents' ON DELETE SET NULL actions
    //    would fire the UPDATE guard if the parents were deleted first.
    if (paymentIds.length > 0 || transactionIds.length > 0) {
      await withImmutabilityTriggersSuspended(["student_payments", "teacher_transaction"], async () => {
        if (paymentIds.length > 0) {
          await db.delete(studentPayments).where(inArray(studentPayments.id, paymentIds));
        }
        if (transactionIds.length > 0) {
          await db.delete(teacherTransaction).where(inArray(teacherTransaction.id, transactionIds));
        }
      });
    }

    // 2. FK-safe deletes: reports (cascade child of session) → evaluations
    //    (session set-null + evaluator RESTRICT into users) → session
    //    (RESTRICT into teacher/students) → subscriptions (RESTRICT into
    //    users/plans) → wallets (RESTRICT from teacher_transaction — already
    //    gone) → plans (RESTRICT from subscriptions — already gone).
    if (reportIds.length > 0) {
      await db.delete(reports).where(inArray(reports.id, reportIds));
    }
    if (evaluationIds.length > 0) {
      await db.delete(evaluations).where(inArray(evaluations.id, evaluationIds));
    }
    if (sessionIds.length > 0) {
      await db.delete(session).where(inArray(session.id, sessionIds));
    }
    if (subscriptionIds.length > 0) {
      await db.delete(subscriptions).where(inArray(subscriptions.id, subscriptionIds));
    }
    if (walletIds.length > 0) {
      await db.delete(wallet).where(inArray(wallet.id, walletIds));
    }
    if (planIds.length > 0) {
      await db.delete(plans).where(inArray(plans.id, planIds));
    }

    // 3. Actor rows (role children cascade) via the sanctioned deleteUsersByIds —
    //    its audit-log sweep rides withAuditDeleteTriggersSuspended internally.
    if (castUserIds.length > 0) {
      await deleteUsersByIds(castUserIds);
    }
    // Belt-and-braces: the registry's own reverse-order sweep + zero-residue
    // existence probes for every registered actor row.
    await tracked.cleanup();

    // 4. Mandatory zero-residue probes (harness rule 2 / REQ-042): every
    //    tracked id gone, audit and notification tables back at their
    //    suite baselines.
    expect(await countUsersByIds(castUserIds)).toBe(0);
    const residueCounts = await Promise.all([
      countIfAny(paymentIds, () => db.$count(studentPayments, inArray(studentPayments.id, paymentIds))),
      countIfAny(transactionIds, () => db.$count(teacherTransaction, inArray(teacherTransaction.id, transactionIds))),
      countIfAny(sessionIds, () => db.$count(session, inArray(session.id, sessionIds))),
      countIfAny(reportIds, () => db.$count(reports, inArray(reports.id, reportIds))),
      countIfAny(evaluationIds, () => db.$count(evaluations, inArray(evaluations.id, evaluationIds))),
      countIfAny(subscriptionIds, () => db.$count(subscriptions, inArray(subscriptions.id, subscriptionIds))),
      countIfAny(walletIds, () => db.$count(wallet, inArray(wallet.id, walletIds))),
      countIfAny(planIds, () => db.$count(plans, inArray(plans.id, planIds))),
    ]);
    for (const residueCount of residueCounts) {
      expect(residueCount).toBe(0);
    }
    expect(await countAuditRows()).toBe(auditBaseline);
    expect(await countNotificationRows()).toBe(notificationBaseline);
  });

  describe("Journey A — cold platform honesty", () => {
    beforeAll(async () => {
      auditBaseline = await countAuditRows();
      notificationBaseline = await countNotificationRows();

      // ONE committing transaction: admin-only cast, commit-or-nothing.
      await db.transaction(async tx => {
        admin = await provisionAdminActor(tx, { tracked });
        castUserIds.push(admin.userId);
      });

      // Baseline AFTER the cast commit, BEFORE any read: whatever the
      // shared database holds at read time — asserted, never assumed zero.
      baselineA = await captureBaseline();
    });

    test("system: admin-only cast committed in one transaction; baseline captured", () => {
      expect(admin.role).toBe(UserRole.Admin);
      expect(tracked.size).toBe(2);
      expect(baselineA.now.getTime()).toBeGreaterThan(0);
    });

    test("admin read on a cold platform reports baseline + 0 everywhere, full trends, honest-null ratings", async () => {
      const preRead = await snapshotObservedTables();
      readA = await readAnalytics(admin.userId, admin.locale);
      digestsAfterARead = await snapshotObservedTables();

      const readDayStartMs = utcDayStart(readA.generatedAt).getTime();
      expect(utcDayStart(baselineA.now).getTime()).toBe(readDayStartMs);

      // Every journey-owned metric == baseline + 0 (the read mints nothing).
      expect(readA.sessions).toEqual(baselineA.sessions);
      expect(readA.subscriptions).toEqual(baselineA.subscriptions);
      expect(readA.teachers).toEqual(baselineA.teachers);
      expect(readA.users).toEqual(baselineA.users);
      expect(readA.health.pendingDisputes).toBe(baselineA.pendingDisputes);
      expect(readA.health.pendingWithdrawals).toBe(baselineA.pendingWithdrawals);
      expect(readA.revenue.offlineActivationsCount).toBe(baselineA.offlineActivationsCount);
      expect(readA.revenue.gatewayRevenueByCurrency).toEqual(baselineA.revenueRows);

      // Trend fullness: 30 zero-filled buckets relative to the read's day.
      expectTrendSkeleton(readA, readDayStartMs);
      expect(actualSessionTrend(readA)).toEqual(expectedSessionTrend(baselineA, readDayStartMs, 0));

      // Revenue trend skeleton-consistency: honestly EMPTY when no currency
      // exists in the window, else exactly the 30 × currencies skeleton.
      expect(actualRevenueTrend(readA)).toEqual(expectedRevenueTrend(baselineA, readDayStartMs, new Map()));
      expect(readA.revenueTrendDaily.length === 0).toBe(baselineA.windowCurrencies.length === 0);
      if (baselineA.windowCurrencies.length > 0) {
        expect(readA.revenueTrendDaily).toHaveLength(TREND_BUCKET_COUNT * baselineA.windowCurrencies.length);
      }

      // Honest-null ratings: an average is null EXACTLY when its family has
      // zero rows — never a fabricated 0; when rows exist the average is
      // the 2-dp-rounded family mean.
      expect(readA.ratings.sessionRatingsCount).toBe(baselineA.sessionRatingsCount);
      expect(readA.ratings.evaluationScoresCount).toBe(baselineA.evaluationScoresCount);
      expect(readA.ratings.averageSessionRating === null).toBe(baselineA.sessionRatingsCount === 0);
      expect(readA.ratings.averageEvaluationScore === null).toBe(baselineA.evaluationScoresCount === 0);
      if (baselineA.sessionRatingsCount > 0) {
        const expectedSessionMean =
          Math.round((baselineA.sessionRatingSum / baselineA.sessionRatingsCount) * 100) / 100;
        expect(readA.ratings.averageSessionRating).toBeCloseTo(expectedSessionMean, 2);
      }
      if (baselineA.evaluationScoresCount > 0) {
        const expectedEvaluationMean =
          Math.round((baselineA.evaluationScoreSum / baselineA.evaluationScoresCount) * 100) / 100;
        expect(readA.ratings.averageEvaluationScore).toBeCloseTo(expectedEvaluationMean, 2);
      }

      // Read purity: byte-identical tables, zero audit, zero notifications.
      expectTablesByteIdentical(preRead, digestsAfterARead);
      expect(await countAuditRows()).toBe(auditBaseline);
      expect(await countNotificationRows()).toBe(notificationBaseline);
    });
  });

  describe("Journey B — full cast observation", () => {
    beforeAll(async () => {
      // Baseline BEFORE the fixture transaction: every delta below is the
      // exact footprint of the ONE committing transaction that follows.
      baselineB = await captureBaseline();

      const fixtureInstant = new Date();
      const backdatedCreatedAt = new Date(fixtureInstant.getTime() - CANCELLED_SESSION_DAYS_AGO * DAY_MS);

      // ONE committing transaction: the full cast + every fixture row.
      await db.transaction(async tx => {
        studentActor = await provisionStudentActor(tx, { tracked });
        onlineTeacher = await provisionCertifiedTeacherActor(tx, { tracked });
        offlineTeacher = await provisionCertifiedTeacherActor(tx, { tracked });
        parentActor = await provisionParentActor(tx, { tracked });
        await tx.update(teacher).set({ isOnline: true }).where(eq(teacher.id, onlineTeacher.userId));

        // The governed student: real role rows, deleted flag set at
        // provisioning — excluded from every active counter.
        const governedUser = await createTestUser(tx, { role: "student", isDeleted: true, deletedAt: new Date() });
        await createTestStudent(tx, governedUser.id);
        tracked.register(users, governedUser.id);
        tracked.register(students, governedUser.id);
        castUserIds.push(
          studentActor.userId,
          onlineTeacher.userId,
          offlineTeacher.userId,
          parentActor.userId,
          governedUser.id
        );

        // Paid subscription inside the ACTIVE window (default: active,
        // started at call time, open-ended).
        const plan = await createTestPlan(tx);
        planIds.push(plan.id);
        const subscription = await createTestSubscription(tx, studentActor.userId, plan.id);
        subscriptionIds.push(subscription.id);

        // One paid EGP + one paid USD payment, both TODAY (created now).
        const egpPayment = await createTestStudentPayment(tx, studentActor.userId, subscription.id, {
          amount: B_EGP_PAYMENT_AMOUNT,
          currency: "EGP",
        });
        const usdPayment = await createTestStudentPayment(tx, studentActor.userId, subscription.id, {
          amount: B_USD_PAYMENT_AMOUNT,
          currency: "USD",
        });
        paymentIds.push(egpPayment.id, usdPayment.id);

        // Pending withdrawal against the online teacher's wallet.
        const teacherWallet = await createTestWallet(tx, onlineTeacher.userId);
        walletIds.push(teacherWallet.id);
        const withdrawal = await createTestTeacherTransaction(tx, teacherWallet.id, null, {
          type: TransactionType.Withdrawal,
          status: TransactionStatus.Pending,
        });
        transactionIds.push(withdrawal.id);

        // Five sessions, four today; the cancelled one backdated outside
        // today AND outside the trailing-30-day trend window.
        const completedConfirmed = await createTestSession(tx, onlineTeacher.userId, studentActor.userId, {
          status: SessionStatus.Completed,
          startedAt: fixtureInstant,
          endedAt: fixtureInstant,
          confirmedByStudentAt: fixtureInstant,
          confirmedByTeacherAt: fixtureInstant,
        });
        const completedUnconfirmed = await createTestSession(tx, onlineTeacher.userId, studentActor.userId, {
          status: SessionStatus.Completed,
          startedAt: fixtureInstant,
          endedAt: fixtureInstant,
          confirmedByTeacherAt: fixtureInstant,
        });
        const disputed = await createTestSession(tx, onlineTeacher.userId, studentActor.userId, {
          status: SessionStatus.Disputed,
          disputeReason: `${PREFIX} dispute`,
          disputedAt: fixtureInstant,
        });
        const scheduled = await createTestSession(tx, onlineTeacher.userId, studentActor.userId, {});
        const cancelled = await createTestSession(tx, offlineTeacher.userId, studentActor.userId, {
          status: SessionStatus.Cancelled,
          cancelReason: `${PREFIX} cancel`,
          createdAt: backdatedCreatedAt,
        });
        sessionIds.push(completedConfirmed.id, completedUnconfirmed.id, disputed.id, scheduled.id, cancelled.id);

        // One report (rated 5) + one evaluation (score 85).
        const report = await createTestSessionReport(tx, completedConfirmed.id);
        reportIds.push(report.id);
        const evaluation = await createTestEvaluation(tx, offlineTeacher.userId, onlineTeacher.userId, null);
        evaluationIds.push(evaluation.id);
      });
    });

    test("system: full cast + fixtures committed in one transaction", () => {
      expect(studentActor.role).toBe(UserRole.Student);
      expect(onlineTeacher.role).toBe(UserRole.Teacher);
      expect(parentActor.role).toBe(UserRole.Parent);
      expect(paymentIds).toHaveLength(2);
      expect(sessionIds).toHaveLength(5);
    });

    test("admin read reports every metric at baseline + its exact fixture delta", async () => {
      const preRead = await snapshotObservedTables();
      readB = await readAnalytics(admin.userId, admin.locale);
      digestsAfterBRead = await snapshotObservedTables();

      const readDayStartMs = utcDayStart(readB.generatedAt).getTime();
      expect(utcDayStart(baselineB.now).getTime()).toBe(readDayStartMs);

      // Sessions: +5 total, four today, two completed (one awaiting), one
      // of each of disputed/scheduled/cancelled; the backdated cancel is
      // outside every window counter.
      expect(readB.sessions.total).toBe(baselineB.sessions.total + 5);
      expect(readB.sessions.today).toBe(baselineB.sessions.today + 4);
      expect(readB.sessions.thisWeek).toBe(baselineB.sessions.thisWeek + 4);
      expect(readB.sessions.thisMonth).toBe(baselineB.sessions.thisMonth + 4);
      expect(readB.sessions.scheduled).toBe(baselineB.sessions.scheduled + 1);
      expect(readB.sessions.started).toBe(baselineB.sessions.started);
      expect(readB.sessions.completed).toBe(baselineB.sessions.completed + 2);
      expect(readB.sessions.cancelled).toBe(baselineB.sessions.cancelled + 1);
      expect(readB.sessions.disputed).toBe(baselineB.sessions.disputed + 1);
      expect(readB.sessions.awaitingConfirmation).toBe(baselineB.sessions.awaitingConfirmation + 1);

      // Health: the disputed session + the pending withdrawal.
      expect(readB.health.pendingDisputes).toBe(baselineB.pendingDisputes + 1);
      expect(readB.health.pendingWithdrawals).toBe(baselineB.pendingWithdrawals + 1);

      // Teachers: two more certified, one online (online ⊆ certified).
      expect(readB.teachers.certifiedCount).toBe(baselineB.teachers.certifiedCount + 2);
      expect(readB.teachers.evaluatorCount).toBe(baselineB.teachers.evaluatorCount);
      expect(readB.teachers.onlineNowCount).toBe(baselineB.teachers.onlineNowCount + 1);

      // Subscriptions: one ACTIVE-window subscription.
      expect(readB.subscriptions.total).toBe(baselineB.subscriptions.total + 1);
      expect(readB.subscriptions.active).toBe(baselineB.subscriptions.active + 1);
      expect(readB.subscriptions.pending).toBe(baselineB.subscriptions.pending);
      expect(readB.subscriptions.expired).toBe(baselineB.subscriptions.expired);
      expect(readB.subscriptions.cancelled).toBe(baselineB.subscriptions.cancelled);
      expect(readB.subscriptions.suspended).toBe(baselineB.subscriptions.suspended);
      expect(readB.subscriptions.activeInWindowNow).toBe(baselineB.subscriptions.activeInWindowNow + 1);

      // Ratings: the two journey rows join their families; averages are the
      // 2-dp family means (never fabricated, never dropped).
      const expectedSessionMean =
        Math.round(((baselineB.sessionRatingSum + 5) / (baselineB.sessionRatingsCount + 1)) * 100) / 100;
      const expectedEvaluationMean =
        Math.round(((baselineB.evaluationScoreSum + 85) / (baselineB.evaluationScoresCount + 1)) * 100) / 100;
      expect(readB.ratings.sessionRatingsCount).toBe(baselineB.sessionRatingsCount + 1);
      expect(readB.ratings.averageSessionRating).toBeCloseTo(expectedSessionMean, 2);
      expect(readB.ratings.evaluationScoresCount).toBe(baselineB.evaluationScoresCount + 1);
      expect(readB.ratings.averageEvaluationScore).toBeCloseTo(expectedEvaluationMean, 2);

      // Revenue: TWO separate currency rows, exact paid sums, never merged.
      const dayKey = (currency: string): string => `${readDayStartMs}|${currency}`;
      const dayDeltas = new Map([
        [dayKey("EGP"), B_EGP_PAYMENT_AMOUNT],
        [dayKey("USD"), B_USD_PAYMENT_AMOUNT],
      ]);
      const deltaByCurrency = new Map([
        ["EGP", toMinorUnits(B_EGP_PAYMENT_AMOUNT)],
        ["USD", toMinorUnits(B_USD_PAYMENT_AMOUNT)],
      ]);
      const expectedRows = [...baselineB.revenueRows];
      for (const currency of ["EGP", "USD"]) {
        const existing = expectedRows.find(row => row.currency === currency);
        const delta = deltaByCurrency.get(currency) ?? 0n;
        if (existing) {
          expectedRows[expectedRows.indexOf(existing)] = {
            currency,
            totalAmount: formatMinorUnits(toMinorUnits(existing.totalAmount) + delta),
            last30DaysAmount: formatMinorUnits(toMinorUnits(existing.last30DaysAmount) + delta),
            paidPaymentsCount: existing.paidPaymentsCount + 1,
          };
        } else {
          expectedRows.push({
            currency,
            totalAmount: formatMinorUnits(delta),
            last30DaysAmount: formatMinorUnits(delta),
            paidPaymentsCount: 1,
          });
        }
      }
      expectedRows.sort((left, right) => left.currency.localeCompare(right.currency));
      expect(readB.revenue.gatewayRevenueByCurrency).toEqual(expectedRows);
      expect(readB.revenue.gatewayRevenueByCurrency.filter(row => row.currency === "EGP")).toHaveLength(1);
      expect(readB.revenue.gatewayRevenueByCurrency.filter(row => row.currency === "USD")).toHaveLength(1);

      // Trends: last bucket +4 (today's four sessions); the revenue
      // skeleton expands to EGP + USD with the exact sums.
      expectTrendSkeleton(readB, readDayStartMs);
      expect(actualSessionTrend(readB)).toEqual(expectedSessionTrend(baselineB, readDayStartMs, 4));
      expect(actualRevenueTrend(readB)).toEqual(expectedRevenueTrend(baselineB, readDayStartMs, dayDeltas));

      // Governed student excluded from the active counters: four of the five
      // cast users lift the active/24h figures, the deleted one lifts none;
      // the deleted counter absorbs it exactly once.
      expect(readB.users.totalCount).toBe(baselineB.users.totalCount + 5);
      expect(readB.users.activeCount).toBe(baselineB.users.activeCount + 4);
      expect(readB.users.recentlyActive24h).toBe(baselineB.users.recentlyActive24h + 4);
      expect(readB.users.suspendedCount).toBe(baselineB.users.suspendedCount);
      expect(readB.users.blockedCount).toBe(baselineB.users.blockedCount);
      expect(readB.users.deletedCount).toBe(baselineB.users.deletedCount + 1);
      expect(readB.users.adminsCount).toBe(baselineB.users.adminsCount);
      expect(readB.users.teachersCount).toBe(baselineB.users.teachersCount + 2);
      expect(readB.users.studentsCount).toBe(baselineB.users.studentsCount + 2);
      expect(readB.users.parentsCount).toBe(baselineB.users.parentsCount + 1);
      expect(readB.users.newThisWeekCount).toBe(baselineB.users.newThisWeekCount + 5);

      // Read purity across the whole observation window.
      expectTablesByteIdentical(preRead, digestsAfterBRead);
      expect(await countAuditRows()).toBe(auditBaseline);
      expect(await countNotificationRows()).toBe(notificationBaseline);
    });

    test("denial probes: student, teacher, and parent are ForbiddenError every time with zero side effects", async () => {
      const preDenials = await snapshotObservedTables();
      const auditBefore = await countAuditRows();
      const notificationsBefore = await countNotificationRows();

      const nonAdminErrors = await Promise.all(
        [studentActor, onlineTeacher, parentActor].map(actor =>
          expectJourneyError(() => readAnalytics(actor.userId, actor.locale))
        )
      );
      for (const error of nonAdminErrors) {
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toContain(tErrors.forbidden);
      }

      // The denials bought the non-admins nothing: byte-identical tables,
      // zero audit, zero notifications.
      expectTablesByteIdentical(preDenials, await snapshotObservedTables());
      expect(await countAuditRows()).toBe(auditBefore);
      expect(await countNotificationRows()).toBe(notificationsBefore);
    });
  });

  describe("Journey C — freshness evolution (anti-cache proof)", () => {
    test("two admin reads bracketing a committed payment + session expose exactly the delta", async () => {
      const preT1 = await snapshotObservedTables();
      readT1 = await readAnalytics(admin.userId, admin.locale);
      const postT1 = await snapshotObservedTables();
      expectTablesByteIdentical(preT1, postT1);

      // System commits ONE additional paid EGP payment (today) + ONE
      // additional completed session (today) in ONE committed transaction.
      await db.transaction(async tx => {
        const extraPayment = await createTestStudentPayment(tx, studentActor.userId, subscriptionIds[0] ?? null, {
          amount: C_EGP_PAYMENT_AMOUNT,
          currency: "EGP",
        });
        paymentIds.push(extraPayment.id);
        const extraSession = await createTestSession(tx, onlineTeacher.userId, studentActor.userId, {
          status: SessionStatus.Completed,
          startedAt: new Date(),
          endedAt: new Date(),
          confirmedByTeacherAt: new Date(),
        });
        sessionIds.push(extraSession.id);
      });

      digestsAfterCFixtures = await snapshotObservedTables();
      readT2 = await readAnalytics(admin.userId, admin.locale);
      const postT2 = await snapshotObservedTables();
      expectTablesByteIdentical(digestsAfterCFixtures, postT2);

      const t1DayStartMs = utcDayStart(readT1.generatedAt).getTime();
      const t2DayStartMs = utcDayStart(readT2.generatedAt).getTime();
      expect(t1DayStartMs).toBe(t2DayStartMs);

      // Freshness: the second read strictly post-dates the first — a cached
      // answer fails this test at the generatedAt gate AND at every delta.
      expect(readT2.generatedAt.getTime()).toBeGreaterThan(readT1.generatedAt.getTime());
      expect(readT2).not.toEqual(readT1);

      // Exactly +1 session, completed, today, awaiting student confirmation.
      expect(readT2.sessions.total).toBe(readT1.sessions.total + 1);
      expect(readT2.sessions.today).toBe(readT1.sessions.today + 1);
      expect(readT2.sessions.thisWeek).toBe(readT1.sessions.thisWeek + 1);
      expect(readT2.sessions.thisMonth).toBe(readT1.sessions.thisMonth + 1);
      expect(readT2.sessions.completed).toBe(readT1.sessions.completed + 1);
      expect(readT2.sessions.awaitingConfirmation).toBe(readT1.sessions.awaitingConfirmation + 1);
      expect(readT2.sessions.scheduled).toBe(readT1.sessions.scheduled);
      expect(readT2.sessions.started).toBe(readT1.sessions.started);
      expect(readT2.sessions.cancelled).toBe(readT1.sessions.cancelled);
      expect(readT2.sessions.disputed).toBe(readT1.sessions.disputed);

      // The EGP row ascends IN PLACE — same currency row, exact amount.
      const t1EgpRows = readT1.revenue.gatewayRevenueByCurrency.filter(row => row.currency === "EGP");
      const t2EgpRows = readT2.revenue.gatewayRevenueByCurrency.filter(row => row.currency === "EGP");
      const t1UsdRows = readT1.revenue.gatewayRevenueByCurrency.filter(row => row.currency === "USD");
      const t2UsdRows = readT2.revenue.gatewayRevenueByCurrency.filter(row => row.currency === "USD");
      expect(t1EgpRows).toHaveLength(1);
      expect(t2EgpRows).toHaveLength(1);
      const t1Egp = t1EgpRows[0];
      const t2Egp = t2EgpRows[0];
      if (!t1Egp || !t2Egp) {
        throw new Error("journey C: expected exactly one EGP revenue row on both reads");
      }
      const deltaUnits = toMinorUnits(C_EGP_PAYMENT_AMOUNT);
      expect(t2Egp.totalAmount).toBe(formatMinorUnits(toMinorUnits(t1Egp.totalAmount) + deltaUnits));
      expect(t2Egp.last30DaysAmount).toBe(formatMinorUnits(toMinorUnits(t1Egp.last30DaysAmount) + deltaUnits));
      expect(t2Egp.paidPaymentsCount).toBe(t1Egp.paidPaymentsCount + 1);
      expect(t2UsdRows).toEqual(t1UsdRows);

      // Trend buckets: the session trend's last bucket +1; the revenue
      // trend's EGP today point +exact amount; everything else untouched.
      expectTrendSkeleton(readT2, t2DayStartMs);
      expect(actualSessionTrend(readT2)).toEqual(
        readT1.sessionTrendDaily.map((point, index) =>
          index === TREND_BUCKET_COUNT - 1
            ? { bucketStartMs: point.bucketStart.getTime(), sessionCount: point.sessionCount + 1 }
            : { bucketStartMs: point.bucketStart.getTime(), sessionCount: point.sessionCount }
        )
      );
      expect(actualRevenueTrend(readT2)).toEqual(
        readT1.revenueTrendDaily.map(point => ({
          bucketStartMs: point.bucketStart.getTime(),
          currency: point.currency,
          amount:
            point.currency === "EGP" && point.bucketStart.getTime() === t1DayStartMs
              ? formatMinorUnits(toMinorUnits(point.amount) + deltaUnits)
              : point.amount,
        }))
      );

      // Purity oracles across both reads.
      expect(await countAuditRows()).toBe(auditBaseline);
      expect(await countNotificationRows()).toBe(notificationBaseline);
    });
  });

  describe("Journey D — denial & purity matrix", () => {
    beforeAll(async () => {
      // ONE committing transaction: four governed admins, real role rows,
      // governance flags flipped in the same transaction (stale-authority
      // simulation at the service tier — the actors hold real admin rows).
      await db.transaction(async tx => {
        deletedAdmin = await provisionAdminActor(tx, { tracked });
        blockedAdmin = await provisionAdminActor(tx, { tracked });
        suspendedAdmin = await provisionAdminActor(tx, { tracked });
        multiFlaggedAdmin = await provisionAdminActor(tx, { tracked });
        await tx.update(users).set({ isDeleted: true, deletedAt: new Date() }).where(eq(users.id, deletedAdmin.userId));
        await tx.update(users).set({ isBlocked: true, blockedAt: new Date() }).where(eq(users.id, blockedAdmin.userId));
        await tx
          .update(users)
          .set({ suspended: true, suspendedAt: new Date() })
          .where(eq(users.id, suspendedAdmin.userId));
        await tx
          .update(users)
          .set({
            isDeleted: true,
            deletedAt: new Date(),
            isBlocked: true,
            blockedAt: new Date(),
            suspended: true,
            suspendedAt: new Date(),
          })
          .where(eq(users.id, multiFlaggedAdmin.userId));
        castUserIds.push(deletedAdmin.userId, blockedAdmin.userId, suspendedAdmin.userId, multiFlaggedAdmin.userId);
      });

      // The post-fixture state anchor: every admin read from here to the
      // end of the suite must leave these digests byte-identical.
      digestsPostFixture = await snapshotObservedTables();
    });

    test("denial matrix — anonymous, absent, non-admin, and governed admins are denied with zero side effects", async () => {
      const preMatrix = await snapshotObservedTables();
      const auditBefore = await countAuditRows();
      const notificationsBefore = await countNotificationRows();
      expect(auditBefore).toBe(auditBaseline);
      expect(notificationsBefore).toBe(notificationBaseline);

      // (1) Anonymous sentinel → UnauthorizedError.
      const anonymousError = await expectJourneyError(() => readAnalytics(ANONYMOUS_ACTOR_ID));
      expect(anonymousError).toBeInstanceOf(UnauthorizedError);
      expect(anonymousError.message).toContain(tErrors.unauthorized);

      // (2) Absent actor → ForbiddenError (the governance helper maps an
      //     unresolvable row to FORBIDDEN — the RULING-2 amendment over the
      //     plan's original UnauthorizedError). The id is PROVABLY absent
      //     by direct count before the call.
      expect(await db.$count(users, eq(users.id, ABSENT_ACTOR_ID))).toBe(0);
      const absentError = await expectJourneyError(() => readAnalytics(ABSENT_ACTOR_ID));
      expect(absentError).toBeInstanceOf(ForbiddenError);
      expect(absentError.message).toContain(tErrors.forbidden);

      // (3) Non-admin actors → ForbiddenError through REAL role resolution.
      const nonAdminErrors = await Promise.all(
        [studentActor, onlineTeacher, parentActor].map(actor =>
          expectJourneyError(() => readAnalytics(actor.userId, actor.locale))
        )
      );
      for (const error of nonAdminErrors) {
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toContain(tErrors.forbidden);
      }

      // (4) Governed admins — deterministic ladder deleted → blocked →
      //     suspended, asserted in that order; an admin carrying ALL three
      //     flags surfaces the deleted message (deleted evaluated first).
      const deletedError = await expectJourneyError(() => readAnalytics(deletedAdmin.userId));
      expect(deletedError).toBeInstanceOf(ForbiddenError);
      expect(deletedError.message).toContain(tErrors.accountDeleted);

      const blockedError = await expectJourneyError(() => readAnalytics(blockedAdmin.userId));
      expect(blockedError).toBeInstanceOf(ForbiddenError);
      expect(blockedError.message).toContain(tErrors.accountBlocked);

      const suspendedError = await expectJourneyError(() => readAnalytics(suspendedAdmin.userId));
      expect(suspendedError).toBeInstanceOf(ForbiddenError);
      expect(suspendedError.message).toContain(tErrors.accountSuspended);

      const multiFlaggedError = await expectJourneyError(() => readAnalytics(multiFlaggedAdmin.userId));
      expect(multiFlaggedError).toBeInstanceOf(ForbiddenError);
      expect(multiFlaggedError.message).toContain(tErrors.accountDeleted);

      // (5) Purity: byte-identical tables, zero audit, zero notifications —
      //     every denial above.
      expectTablesByteIdentical(preMatrix, await snapshotObservedTables());
      expect(await countAuditRows()).toBe(auditBefore);
      expect(await countNotificationRows()).toBe(notificationsBefore);
    });

    test("whole-suite purity — tables byte-identical to post-fixture state; zero audit and notification residue", async () => {
      // Every read across journeys A–D was bracketed by a byte-identity
      // window (A read, B read, B denials, C t1, C t2, D matrix); this final
      // anchor compares the CURRENT state to the post-fixture snapshot and
      // proves the whole-suite audit/notification delta is zero.
      expectTablesByteIdentical(digestsPostFixture, await snapshotObservedTables());
      expect(await countAuditRows()).toBe(auditBaseline);
      expect(await countNotificationRows()).toBe(notificationBaseline);
    });
  });
});
