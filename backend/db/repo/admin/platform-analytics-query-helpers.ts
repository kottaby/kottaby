/**
 * Platform analytics query helpers — shared row shapes, pure calendar math,
 * and the extracted reader implementations for the platform analytics
 * repository (`./platform-analytics.repository.ts`).
 *
 * Contains the eight repo-row interfaces returned by the
 * `PlatformAnalyticsRepository` projections, the trailing-window and
 * offline-activation constants, the UTC-only calendar boundary helpers, the
 * shared trend day-bucket decoder (`decodeTrendDayBucket`), the two shared
 * single-row zero-coalescing mappers, and the executor implementations for
 * the session-stats, session-trend, revenue-stats, revenue-trend, and
 * offline-activation readers. Extracted for file-size budget; behavior is
 * byte-identical to the pre-extraction definitions.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { queryDb } from "@/backend/db";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { session } from "@/backend/db/schema/classes/session";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import type { DBTransaction } from "@/backend/types";

/** One row of the per-currency gateway revenue projection. */
export interface PlatformAnalyticsCurrencyRevenueRow {
  /** 3-character currency code the paid payments were settled in. */
  readonly currency: string;
  /** Exact decimal string — sum of ALL paid payments for the currency. */
  readonly totalAmount: string;
  /** Exact decimal string — paid payments inside the trailing 30-day window. */
  readonly last30DaysAmount: string;
  /** Number of paid payments behind the currency row (all time). */
  readonly paidPaymentsCount: number;
}

/** One sparse (day, currency) bucket of the daily revenue trend. */
export interface PlatformAnalyticsRevenueTrendRow {
  /** Midnight-UTC instant the bucket covers (true `Date`, not a string). */
  readonly bucketStart: Date;
  readonly currency: string;
  /** Exact decimal string sum of that currency's paid payments that day. */
  readonly amount: string;
}

/** Ten-counter session section: three UTC windows + five statuses + lifecycle. */
export interface PlatformAnalyticsSessionStatsRow {
  readonly total: number;
  readonly today: number;
  readonly thisWeek: number;
  readonly thisMonth: number;
  readonly scheduled: number;
  readonly started: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly disputed: number;
  /** Completed sessions the student has not confirmed yet. */
  readonly awaitingConfirmation: number;
}

/** One sparse daily bucket of the session trend. */
export interface PlatformAnalyticsSessionTrendRow {
  /** Midnight-UTC instant the bucket covers (true `Date`, not a string). */
  readonly bucketStart: Date;
  readonly sessionCount: number;
}

/** Seven-counter subscription section: five statuses + the ACTIVE-window counter. */
export interface PlatformAnalyticsSubscriptionStatsRow {
  readonly total: number;
  readonly active: number;
  readonly pending: number;
  readonly expired: number;
  readonly cancelled: number;
  readonly suspended: number;
  /** Status-active AND inside its start/end window at the captured instant. */
  readonly activeInWindowNow: number;
}

/** Teacher-population headline counters (applicants never appear — no row). */
export interface PlatformAnalyticsTeacherPresenceRow {
  readonly certifiedCount: number;
  readonly evaluatorCount: number;
  /** Certified teachers currently flagged online. */
  readonly onlineNowCount: number;
}

/** Two honest rating families with nullable averages. */
export interface PlatformAnalyticsRatingStatsRow {
  /** Mean of the 0–5 session-report ratings; null when none are rated. */
  readonly averageSessionRating: number | null;
  readonly sessionRatingsCount: number;
  /** Mean of the 0–100 evaluation scores of live rows; null when none. */
  readonly averageEvaluationScore: number | null;
  readonly evaluationScoresCount: number;
}

/** Operational backlog indicators. */
export interface PlatformAnalyticsHealthRow {
  readonly pendingDisputes: number;
  readonly pendingWithdrawals: number;
}

/** Trailing window of the daily trends, in milliseconds. */
const TREND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Payment methods that activate a subscription OUTSIDE the payments ledger.
 * Module-scope constant (never mutated) so both executor branches bind the
 * identical member set.
 */
const OFFLINE_ACTIVATION_GATEWAYS: readonly PaymentGateway[] = [
  PaymentGateway.OfflineCash,
  PaymentGateway.BankTransfer,
  PaymentGateway.Scholarship,
];

/**
 * Bind-position skeleton of the offline-activation IN list — one `$n`
 * marker per `OFFLINE_ACTIVATION_GATEWAYS` member, derived from the
 * constant's indices so the raw branch's placeholder count always matches
 * the bound member array exactly as the transactional branch's `inArray`
 * derives its list from the same array. Position markers only — never a
 * data value (the members themselves ride the parameter array).
 */
const OFFLINE_GATEWAY_PLACEHOLDERS = OFFLINE_ACTIVATION_GATEWAYS.map((_gateway, index) => `$${index + 1}`).join(", ");

/** Midnight-UTC instant of the day containing `now` (UTC-only calendar math). */
function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** 00:00 UTC of the ISO week (Monday) containing `now` (UTC-only calendar math). */
function isoWeekStart(now: Date): Date {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
}

/** 00:00 UTC of the first day of `now`'s month (UTC-only calendar math). */
function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Zero-pads a calendar component to two digits (trend decoder helper). */
const pad2 = (part: number): string => String(part).padStart(2, "0");

/**
 * Naive timestamp text of `value`'s LOCAL wall clock — the digits the pg
 * driver consumed when it parsed the naive `date_trunc` text client-locally,
 * i.e. exactly what the legacy `Date.toString() + "+0000"` lenient parse
 * re-read.
 */
const localWallClockIso = (value: Date): string =>
  `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}T${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;

/**
 * Shared trend day-bucket decoder — normalizes a `date_trunc('day', ...)`
 * result into the exact midnight-UTC instant its stored wall-clock names.
 *
 * Input contract (driver-dependent, NOT always a string): on the wired
 * providers (node-postgres via Drizzle, and the PGlite shim) the pg type
 * parser already converts `date_trunc` output into a `Date` before the
 * mapper sees it — and for a `timestamp without time zone` source column it
 * parses the naive text against the CLIENT-LOCAL timezone. Other drivers may
 * hand the raw timestamp text through unparsed (e.g. `"2026-01-07
 * 00:00:00"`). Both shapes therefore arrive here.
 *
 * Normalization: the wall-clock digits the bucket names are recovered
 * explicitly (a `Date`'s local calendar fields; a string with the date/time
 * space separator made strict) and the instant is rebuilt by STRICT ISO
 * parsing (`...Z`) — outputs are identical to the legacy lenient composite
 * `+ "+0000"` rehydration for every input it accepted, but an unparseable
 * value now throws a domain error instead of silently yielding an Invalid
 * Date whose `NaN` epoch would collapse the trend into all-zero buckets.
 *
 * Exported for the decoder contract tests (pure function — no I/O); the
 * repository's two trend readers delegate their day buckets to it.
 */
export function decodeTrendDayBucket(value: unknown): Date {
  const raw = value instanceof Date ? localWallClockIso(value) : String(value).replace(" ", "T");
  const instant = new Date(`${raw}Z`);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`trend day-bucket decoder: unparseable ${JSON.stringify(String(value))}`);
  }
  return instant;
}

/**
 * Coalesces a possibly-absent single aggregate row into the zeroed
 * session-stats row — the shared single-row mapping both executor branches
 * return (identical shape and defaults on either branch).
 */
function mapSessionStatsRow(row: PlatformAnalyticsSessionStatsRow | undefined): PlatformAnalyticsSessionStatsRow {
  return {
    total: row?.total ?? 0,
    today: row?.today ?? 0,
    thisWeek: row?.thisWeek ?? 0,
    thisMonth: row?.thisMonth ?? 0,
    scheduled: row?.scheduled ?? 0,
    started: row?.started ?? 0,
    completed: row?.completed ?? 0,
    cancelled: row?.cancelled ?? 0,
    disputed: row?.disputed ?? 0,
    awaitingConfirmation: row?.awaitingConfirmation ?? 0,
  };
}

/**
 * Coalesces a possibly-absent single aggregate row into the zeroed
 * subscription-stats row — the shared single-row mapping both executor
 * branches return (identical shape and defaults on either branch).
 */
export function mapSubscriptionStatsRow(
  row: PlatformAnalyticsSubscriptionStatsRow | undefined
): PlatformAnalyticsSubscriptionStatsRow {
  return {
    total: row?.total ?? 0,
    active: row?.active ?? 0,
    pending: row?.pending ?? 0,
    expired: row?.expired ?? 0,
    cancelled: row?.cancelled ?? 0,
    suspended: row?.suspended ?? 0,
    activeInWindowNow: row?.activeInWindowNow ?? 0,
  };
}

/**
 * Implementation of `PlatformAnalyticsRepository.getSessionStats`: the
 * ten-counter bare aggregate over `session` (always exactly one row —
 * zeros on an empty table). Window counters are closed ranges `[boundary,
 * now]` cut from the captured instant via the UTC-only calendar helpers
 * above; a row stamped after the snapshot instant counts in none of them
 * (statement-level visibility of the captured `now`); a row stamped
 * exactly at a boundary counts (inclusive `>=`). The five status counters
 * partition `total` exactly (one status per row); `awaitingConfirmation`
 * is lifecycle-derived (`completed` AND the student confirmation instant
 * still NULL). Both executor branches coalesce through
 * `mapSessionStatsRow` (identical shape and defaults on either branch).
 */
export async function getSessionStatsImpl(now: Date, tx?: DBTransaction): Promise<PlatformAnalyticsSessionStatsRow> {
  const todayStart = utcDayStart(now);
  const weekStart = isoWeekStart(now);
  const monthStart = utcMonthStart(now);
  if (tx) {
    const rows = await tx
      .select({
        total: sql<number>`count(*)::int`.as("total"),
        today:
          sql<number>`count(*) filter (where ${session.createdAt} >= ${todayStart} and ${session.createdAt} <= ${now})::int`.as(
            "today"
          ),
        thisWeek:
          sql<number>`count(*) filter (where ${session.createdAt} >= ${weekStart} and ${session.createdAt} <= ${now})::int`.as(
            "this_week"
          ),
        thisMonth:
          sql<number>`count(*) filter (where ${session.createdAt} >= ${monthStart} and ${session.createdAt} <= ${now})::int`.as(
            "this_month"
          ),
        scheduled: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Scheduled})::int`.as(
          "scheduled"
        ),
        started: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Started})::int`.as("started"),
        completed: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Completed})::int`.as(
          "completed"
        ),
        cancelled: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Cancelled})::int`.as(
          "cancelled"
        ),
        disputed: sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Disputed})::int`.as(
          "disputed"
        ),
        awaitingConfirmation:
          sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Completed} and ${session.confirmedByStudentAt} is null)::int`.as(
            "awaiting_confirmation"
          ),
      })
      .from(session);
    return mapSessionStatsRow(rows[0]);
  }
  const result = await queryDb<PlatformAnalyticsSessionStatsRow>(
    `SELECT count(*)::int AS "total",
            count(*) filter (where created_at >= $1 and created_at <= $4)::int AS "today",
            count(*) filter (where created_at >= $2 and created_at <= $4)::int AS "thisWeek",
            count(*) filter (where created_at >= $3 and created_at <= $4)::int AS "thisMonth",
            count(*) filter (where status = $5)::int AS "scheduled",
            count(*) filter (where status = $6)::int AS "started",
            count(*) filter (where status = $7)::int AS "completed",
            count(*) filter (where status = $8)::int AS "cancelled",
            count(*) filter (where status = $9)::int AS "disputed",
            count(*) filter (where status = $7 and confirmed_by_student_at is null)::int AS "awaitingConfirmation"
       FROM session`,
    [
      todayStart,
      weekStart,
      monthStart,
      now,
      SessionStatus.Scheduled,
      SessionStatus.Started,
      SessionStatus.Completed,
      SessionStatus.Cancelled,
      SessionStatus.Disputed,
    ]
  );
  return mapSessionStatsRow(result.rows[0]);
}

/**
 * Implementation of `PlatformAnalyticsRepository.getSessionDailyTrend`:
 * the SPARSE daily session trend — one `{ bucketStart, count }` row per
 * UTC day with at least one session inside the closed 30-day window
 * `[now - 30d, now]`, ordered by day ascending. Days without sessions are
 * absent (the service layer zero-fills the full skeleton). Both branches
 * yield a true midnight-UTC `Date` for `bucketStart`: the drizzle branch
 * decodes the driver-delivered value through `decodeTrendDayBucket` (an
 * already-parsed `Date` on the wired pg providers — naive text parsed
 * client-locally — or raw text on pass-through drivers), while the raw
 * branch truncates and normalizes server-side (`AT TIME ZONE 'UTC'`),
 * handing back a `timestamp with time zone` whose instant the pg driver
 * parses identically under any client TZ — keeping the two branches
 * byte-identical in value.
 */
export async function getSessionDailyTrendImpl(
  now: Date,
  tx?: DBTransaction
): Promise<PlatformAnalyticsSessionTrendRow[]> {
  const windowStart = new Date(now.getTime() - TREND_WINDOW_MS);
  if (tx) {
    // The wired pg driver already parses `date_trunc` output into a `Date`
    // (naive text read client-locally); pass-through drivers may deliver raw
    // text. `decodeTrendDayBucket` normalizes either shape into the true
    // midnight-UTC `Date` — the same instant the raw branch's
    // `AT TIME ZONE 'UTC'` timestamptz column parses to, keeping the two
    // branches byte-for-byte identical in value.
    const dayBucket = sql<string | Date>`date_trunc('day', ${session.createdAt})`.mapWith(decodeTrendDayBucket);
    const rows = await tx
      .select({
        bucketStart: dayBucket.as("bucket_start"),
        sessionCount: sql<number>`count(*)::int`.as("session_count"),
      })
      .from(session)
      .where(and(gte(session.createdAt, windowStart), lte(session.createdAt, now)))
      .groupBy(dayBucket)
      .orderBy(dayBucket);
    return rows;
  }
  const result = await queryDb<PlatformAnalyticsSessionTrendRow>(
    `SELECT date_trunc('day', created_at) AT TIME ZONE 'UTC' AS "bucketStart",
            count(*)::int AS "sessionCount"
       FROM session
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY date_trunc('day', created_at) AT TIME ZONE 'UTC'
      ORDER BY date_trunc('day', created_at) AT TIME ZONE 'UTC' ASC`,
    [windowStart, now]
  );
  return result.rows;
}

/**
 * Implementation of `PlatformAnalyticsRepository.getRevenueStats`:
 * per-currency gateway revenue from SETTLED (`paid`) payments only — one
 * row per currency with at least one paid payment, ordered by currency
 * ascending; a payment history with no paid rows yields an EMPTY array
 * (never a phantom zero-currency row). Amounts are exact decimal strings
 * (`::text`): `totalAmount` spans all time, `last30DaysAmount` the closed
 * 30-day window. Offline-activated subscriptions never produce a payment
 * row and are structurally absent here (counted separately by
 * `countOfflineActivationsImpl`) — the two figures must never be merged.
 */
export async function getRevenueStatsImpl(
  now: Date,
  tx?: DBTransaction
): Promise<PlatformAnalyticsCurrencyRevenueRow[]> {
  const windowStart = new Date(now.getTime() - TREND_WINDOW_MS);
  if (tx) {
    const rows = await tx
      .select({
        currency: studentPayments.currency,
        totalAmount: sql<string>`coalesce(sum(${studentPayments.amount}), 0)::text`.as("total_amount"),
        last30DaysAmount:
          sql<string>`coalesce(sum(${studentPayments.amount}) filter (where ${studentPayments.createdAt} >= ${windowStart} and ${studentPayments.createdAt} <= ${now}), 0)::text`.as(
            "last_30_days_amount"
          ),
        paidPaymentsCount: sql<number>`count(*)::int`.as("paid_payments_count"),
      })
      .from(studentPayments)
      .where(eq(studentPayments.status, PaymentStatus.Paid))
      .groupBy(studentPayments.currency)
      .orderBy(asc(studentPayments.currency));
    return rows;
  }
  const result = await queryDb<PlatformAnalyticsCurrencyRevenueRow>(
    `SELECT currency AS "currency",
            coalesce(sum(amount), 0)::text AS "totalAmount",
            coalesce(sum(amount) filter (where created_at >= $1 and created_at <= $2), 0)::text AS "last30DaysAmount",
            count(*)::int AS "paidPaymentsCount"
       FROM student_payments
      WHERE status = $3
      GROUP BY currency
      ORDER BY currency ASC`,
    [windowStart, now, PaymentStatus.Paid]
  );
  return result.rows;
}

/**
 * Implementation of `PlatformAnalyticsRepository.getRevenueDailyTrend`:
 * the SPARSE daily revenue trend — one `{ bucketStart, currency, amount }`
 * row per (UTC day, currency) pair with at least one settled payment
 * inside the closed 30-day window, ordered by day then currency.
 * Currencies stay in separate points — no day ever sums across codes;
 * `amount` is an exact decimal string and `bucketStart` a true
 * midnight-UTC `Date` (same dual-branch UTC normalization, via the shared
 * `decodeTrendDayBucket`, as the session trend's day bucket).
 */
export async function getRevenueDailyTrendImpl(
  now: Date,
  tx?: DBTransaction
): Promise<PlatformAnalyticsRevenueTrendRow[]> {
  const windowStart = new Date(now.getTime() - TREND_WINDOW_MS);
  if (tx) {
    // Same driver-shape normalization as the session trend's day bucket —
    // the raw branch normalizes server-side with `AT TIME ZONE 'UTC'`, so
    // both branches yield the identical midnight-UTC instant.
    const dayBucket = sql<string | Date>`date_trunc('day', ${studentPayments.createdAt})`.mapWith(decodeTrendDayBucket);
    const rows = await tx
      .select({
        bucketStart: dayBucket.as("bucket_start"),
        currency: studentPayments.currency,
        amount: sql<string>`sum(${studentPayments.amount})::text`.as("amount"),
      })
      .from(studentPayments)
      .where(
        and(
          eq(studentPayments.status, PaymentStatus.Paid),
          gte(studentPayments.createdAt, windowStart),
          lte(studentPayments.createdAt, now)
        )
      )
      .groupBy(dayBucket, studentPayments.currency)
      .orderBy(dayBucket, asc(studentPayments.currency));
    return rows;
  }
  const result = await queryDb<PlatformAnalyticsRevenueTrendRow>(
    `SELECT date_trunc('day', created_at) AT TIME ZONE 'UTC' AS "bucketStart",
            currency AS "currency",
            sum(amount)::text AS "amount"
       FROM student_payments
      WHERE status = $3 AND created_at >= $1 AND created_at <= $2
      GROUP BY date_trunc('day', created_at) AT TIME ZONE 'UTC', currency
      ORDER BY date_trunc('day', created_at) AT TIME ZONE 'UTC' ASC, currency ASC`,
    [windowStart, now, PaymentStatus.Paid]
  );
  return result.rows;
}

/**
 * Implementation of `PlatformAnalyticsRepository.countOfflineActivations`:
 * the honesty counter for subscriptions activated OUTSIDE the payments
 * ledger (offline cash, bank transfer, scholarship) — deliberately
 * separate from the revenue readers; mixing offline activations into
 * monetary totals is prohibited by the surface contract. The raw branch's
 * IN list is the `OFFLINE_GATEWAY_PLACEHOLDERS` skeleton derived from the
 * shared gateway constant, so its `$n` bind positions always match the
 * bound member array (identical to the `inArray` transactional branch).
 */
export async function countOfflineActivationsImpl(tx?: DBTransaction): Promise<number> {
  if (tx) {
    const rows = await tx
      .select({ offlineCount: sql<number>`count(*)::int`.as("offline_count") })
      .from(subscriptions)
      .where(inArray(subscriptions.paymentMethod, [...OFFLINE_ACTIVATION_GATEWAYS]));
    return rows[0]?.offlineCount ?? 0;
  }
  const result = await queryDb<{ offlineCount: number }>(
    `SELECT count(*)::int AS "offlineCount"
       FROM subscriptions
      WHERE payment_method IN (${OFFLINE_GATEWAY_PLACEHOLDERS})`,
    OFFLINE_ACTIVATION_GATEWAYS
  );
  return result.rows[0]?.offlineCount ?? 0;
}
