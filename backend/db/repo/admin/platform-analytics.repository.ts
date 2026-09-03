/**
 * PlatformAnalyticsRepository — read-only aggregate layer for the
 * `adminPlatformAnalytics` snapshot (DEV3-022c).
 *
 * Conventions per `backend/db/repo/AGENTS.md` + plan §4.1:
 *  - All methods take `tx?: DBTransaction` as the OPTIONAL-LAST parameter;
 *    windowed methods take an explicit `now: Date` BEFORE it. Reads branch
 *    on the supplied executor (`tx ?? db`). The service owns clock capture
 *    (ONE `now` per request) and binds it into every window predicate —
 *    the repos stay pure (D2/REQ-026; never SQL `now()`).
 *  - Dynamic aggregate reads ONLY: NO prepared statements, NO
 *    `inArray`-placeholder (the offline-activation probe binds a plain
 *    enum-member array), NO inline `--` comments inside any `sql`
 *    template, NO string interpolation of values into SQL text, and NO
 *    LIKE/ILIKE surface (REQ-035 — no `escapeLikeWildcards` obligation).
 *  - Set-oriented single-row aggregates: `count(*)::int` counts, money via
 *    `coalesce(sum(amount),0)::text` (EXACT decimal strings — never JS
 *    number, REQ-014), rating averages via
 *    `round(avg(...)::numeric, 2)::float8` (nullable — honest emptiness,
 *    REQ-018).
 *  - Enum predicates bind enum MEMBER VALUES (`SessionStatus.*`,
 *    `SubscriptionStatus.*`, `PaymentStatus.Paid`,
 *    `PaymentGateway.{OfflineCash,BankTransfer,Scholarship}`,
 *    `TransactionType.Withdrawal`, `TransactionStatus.Pending`).
 *  - Governance + soft-delete exclusions are NULL-safe under three-valued
 *    SQL logic (a legacy NULL-state row reads as "not set" → counted /
 *    not-deleted), mirroring the `coalesce(col, false) = false` chain of
 *    `AdminUserRepository.getStats`.
 *  - Row shapes live in the canonical types module
 *    (`@/backend/types/admin/platform-analytics.types.ts`, type-only
 *    imports here) and the UTC boundary oracles in
 *    `./platform-analytics-boundaries` — this file holds queries only.
 *  - No business logic, no permission checks, no localized strings — the
 *    service layer composes the rows into the canonical
 *    `PlatformAnalyticsReturnType` (trend zero-fill lives in the service,
 *    D6).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import {
  isoWeekStart,
  ONE_DAY_MS,
  trendSkeletonCutoff,
  utcDayStart,
  utcMonthStart,
} from "@/backend/db/repo/admin/platform-analytics-boundaries";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  PaymentGateway,
  PaymentStatus,
  SubscriptionStatus,
  TransactionStatus,
  TransactionType,
} from "@/backend/enum/billing";
import { SessionStatus } from "@/backend/enum/scheduling";
import type {
  DBTransaction,
  HealthIndicatorsRow,
  RatingStatsRow,
  RevenueStatsRow,
  RevenueTrendRow,
  SessionTrendRow,
  TeacherPresenceRow,
} from "@/backend/types";

/** The trailing offline-activation `payment_method` members (B.9/INV-PAY5). */
const OFFLINE_PAYMENT_METHODS = [
  PaymentGateway.OfflineCash,
  PaymentGateway.BankTransfer,
  PaymentGateway.Scholarship,
] as const;

/**
 * Decodes a PostgreSQL `timestamp without time zone` driver payload into
 * the UTC-midnight epoch of its wall-clock day — attached to every
 * `date_trunc('day', …)` projection below.
 *
 * WHY THIS EXISTS: the pg driver delivers naive timestamps as RAW TEXT
 * ("2026-08-01 00:00:00"), never a JS `Date`, so an undecoded projection
 * would leak strings into the service's skeleton-merge arithmetic. And
 * `new Date(text)`'s bare-datetime branch parses as LOCAL wall-clock, which
 * shifts buckets wherever the server clock drifts from UTC. The decoder
 * instead extracts the components explicitly and reassembles them through
 * `Date.UTC` — the exact inverse of the `date_trunc('day', …)` truncation
 * that produced the text (REQ-024 UTC-only calendar math).
 *
 * BOTH driver behaviors normalize at this SINGLE point (Fix-C finding 2):
 * a driver that already hands back a `Date` (parsed as LOCAL wall-clock
 * components) is re-projected through its LOCAL calendar fields onto the
 * same UTC-midnight epoch, instead of passing through untouched. The
 * projection is therefore total — every output is a UTC-midnight epoch of
 * the stored day regardless of driver behavior or server clock — and the
 * service's skeleton join is a pure epoch identity with no fragile
 * driver-symmetry assumption.
 */
const UTC_TIMESTAMP_DECODER = {
  mapFromDriverValue(value: unknown): Date {
    if (value instanceof Date) {
      return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }
    const text = typeof value === "string" ? value : String(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(text);
    if (!match) {
      const fallback = new Date(text);
      return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
    }
    const [, year, month, day, hour, minute, second, fraction = ""] = match;
    const millis = Number(`${fraction}000`.slice(0, 3));
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), millis)
    );
  },
};

export namespace PlatformAnalyticsRepository {
  /**
   * Counts users whose `lastActiveAt` falls within the trailing 24-hour
   * open interval `(now − 24h, now)` — BOTH bounds strict (B.15 presence
   * counter; the strict `< now` upper bound excludes future-dated rows,
   * Fix-C finding 5). The governance exclusion is NULL-safe
   * (`coalesce(col, false) = false` chain — a legacy NULL-state row reads
   * as active), mirroring the `AdminUserRepository.getStats` active-count
   * predicate exactly.
   */
  export async function countRecentlyActiveUsers(now: Date, tx?: DBTransaction): Promise<number> {
    const cutoff = new Date(now.getTime() - ONE_DAY_MS);
    const rows = await (tx ?? db)
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(users)
      .where(
        and(
          sql`${users.lastActiveAt} > ${cutoff}`,
          sql`${users.lastActiveAt} < ${now}`,
          sql`coalesce(${users.isDeleted}, false) = false`,
          sql`coalesce(${users.suspended}, false) = false`,
          sql`coalesce(${users.isBlocked}, false) = false`
        )
      );
    return rows[0]?.count ?? 0;
  }

  /**
   * Resolves the sessions lifecycle counters in ONE single-row aggregate
   * over `session`. Window counters bound UTC boundaries derived from the
   * captured `now` (`utcDayStart` / `isoWeekStart` / `utcMonthStart` —
   * REQ-024); status counters bind `SessionStatus` member values;
   * `awaitingConfirmation` counts completed sessions whose
   * `confirmedByStudentAt` is still NULL (the REQ-071 flip oracle).
   */
  export async function getSessionStats(
    now: Date,
    tx?: DBTransaction
  ): Promise<{
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    scheduled: number;
    started: number;
    completed: number;
    cancelled: number;
    disputed: number;
    awaitingConfirmation: number;
  }> {
    const todayStart = utcDayStart(now);
    const weekStart = isoWeekStart(now);
    const monthStart = utcMonthStart(now);
    const rows = await (tx ?? db)
      .select({
        total: sql<number>`count(*)::int`.as("total"),
        today: sql<number>`count(*) filter (where ${session.createdAt} >= ${todayStart})::int`.as("today"),
        thisWeek: sql<number>`count(*) filter (where ${session.createdAt} >= ${weekStart})::int`.as("this_week"),
        thisMonth: sql<number>`count(*) filter (where ${session.createdAt} >= ${monthStart})::int`.as("this_month"),
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
          sql<number>`count(*) filter (where ${session.status} = ${SessionStatus.Completed} AND ${session.confirmedByStudentAt} IS NULL)::int`.as(
            "awaiting_confirmation"
          ),
      })
      .from(session);
    const row = rows[0];
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
   * Resolves SPARSE daily session counts over the 30-bucket trend window
   * (`createdAt >= trendSkeletonCutoff(now)` — midnight UTC of `now`'s day
   * minus 29 days, the OLDEST skeleton bucket; bound parameter): one row
   * per day that has at least one session, bucketed at midnight UTC via
   * `date_trunc('day', created_at)`, ordered by day ascending. The cutoff
   * alignment (Fix-C finding 6) guarantees every selected row maps 1:1
   * into a service skeleton bucket — the merge can never drop a row. The
   * service layer zero-fills the full 30-bucket skeleton (D6).
   */
  export async function getSessionDailyTrend(now: Date, tx?: DBTransaction): Promise<SessionTrendRow[]> {
    const cutoff = trendSkeletonCutoff(now);
    const rows = await (tx ?? db)
      .select({
        bucketStart: sql<Date>`date_trunc('day', ${session.createdAt})`
          .mapWith(UTC_TIMESTAMP_DECODER)
          .as("bucket_start"),
        sessionCount: sql<number>`count(*)::int`.as("session_count"),
      })
      .from(session)
      .where(sql`${session.createdAt} >= ${cutoff}`)
      .groupBy(sql`date_trunc('day', ${session.createdAt})`)
      .orderBy(sql`date_trunc('day', ${session.createdAt}) ASC`);
    return rows;
  }

  /**
   * Resolves per-currency gateway revenue over PAID `student_payments`
   * rows (`PaymentStatus.Paid` bound member value), grouped by `currency`
   * and ordered by currency ascending. Amounts are EXACT decimal strings
   * (`coalesce(sum(amount),0)::text` — never JS number, REQ-014);
   * `last30DaysAmount` is the trailing-30-day FILTER sum with the bound
   * cutoff. Cross-currency sums are structurally impossible (one row per
   * currency — REQ-023).
   */
  export async function getRevenueStats(now: Date, tx?: DBTransaction): Promise<RevenueStatsRow[]> {
    const cutoff = new Date(now.getTime() - 30 * ONE_DAY_MS);
    const rows = await (tx ?? db)
      .select({
        currency: studentPayments.currency,
        totalAmount: sql<string>`coalesce(sum(${studentPayments.amount}), 0)::text`.as("total_amount"),
        last30DaysAmount:
          sql<string>`coalesce(sum(${studentPayments.amount}) filter (where ${studentPayments.createdAt} >= ${cutoff}), 0)::text`.as(
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

  /**
   * Resolves SPARSE (day, currency) revenue rows over the 30-bucket trend
   * window (`createdAt >= trendSkeletonCutoff(now)` — the oldest skeleton
   * bucket, Fix-C finding 6): paid payments only, grouped by midnight-UTC
   * day + currency, ordered by day then currency. Money is
   * `sum(amount)::text` — an exact decimal string per bucket (currencies
   * never merge, REQ-023). The service expands these over the window's
   * currency set with "0" fills.
   */
  export async function getRevenueDailyTrend(now: Date, tx?: DBTransaction): Promise<RevenueTrendRow[]> {
    const cutoff = trendSkeletonCutoff(now);
    const rows = await (tx ?? db)
      .select({
        bucketStart: sql<Date>`date_trunc('day', ${studentPayments.createdAt})`
          .mapWith(UTC_TIMESTAMP_DECODER)
          .as("bucket_start"),
        currency: studentPayments.currency,
        amount: sql<string>`sum(${studentPayments.amount})::text`.as("amount"),
      })
      .from(studentPayments)
      .where(and(eq(studentPayments.status, PaymentStatus.Paid), sql`${studentPayments.createdAt} >= ${cutoff}`))
      .groupBy(sql`date_trunc('day', ${studentPayments.createdAt})`, studentPayments.currency)
      .orderBy(sql`date_trunc('day', ${studentPayments.createdAt}) ASC`, asc(studentPayments.currency));
    return rows;
  }

  /**
   * Resolves the subscriptions status distribution plus the
   * ACTIVE-window counter in ONE single-row aggregate. The window filter
   * mirrors the admin-user subquery semantics with the captured `now`
   * BOUND as a parameter (D2): `status='active' AND
   * coalesce(start_date, now) <= now AND (end_date IS NULL OR now <
   * end_date)` — a still-`active`-status row whose `end_date` already
   * passed is EXCLUDED (REQ-071 expiry oracle).
   */
  export async function getSubscriptionStats(
    now: Date,
    tx?: DBTransaction
  ): Promise<{
    total: number;
    active: number;
    pending: number;
    expired: number;
    cancelled: number;
    suspended: number;
    activeInWindowNow: number;
  }> {
    const rows = await (tx ?? db)
      .select({
        total: sql<number>`count(*)::int`.as("total"),
        active: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Active})::int`.as(
          "active"
        ),
        pending: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Pending})::int`.as(
          "pending"
        ),
        expired: sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Expired})::int`.as(
          "expired"
        ),
        cancelled:
          sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Cancelled})::int`.as(
            "cancelled"
          ),
        suspended:
          sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Suspended})::int`.as(
            "suspended"
          ),
        activeInWindowNow:
          sql<number>`count(*) filter (where ${subscriptions.status} = ${SubscriptionStatus.Active} AND coalesce(${subscriptions.startDate}, ${now}) <= ${now} AND (${subscriptions.endDate} IS NULL OR ${now} < ${subscriptions.endDate}))::int`.as(
            "active_in_window_now"
          ),
      })
      .from(subscriptions);
    const row = rows[0];
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
   * Counts offline payment activations: `subscriptions` rows whose
   * `payment_method` is one of the offline members
   * (`offline_cash`/`bank_transfer`/`scholarship` — plain enum-member
   * array, dynamic query, NO prepared-statement placeholder). These
   * bypass `student_payments` entirely and are NEVER folded into revenue
   * (REQ-015; B.9/INV-PAY5).
   */
  export async function countOfflineActivations(tx?: DBTransaction): Promise<number> {
    const rows = await (tx ?? db)
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(subscriptions)
      .where(inArray(subscriptions.paymentMethod, [...OFFLINE_PAYMENT_METHODS]));
    return rows[0]?.count ?? 0;
  }

  /**
   * Resolves teacher presence counters in ONE single-row aggregate over
   * the `teacher` role-child table (B.6/B.7 — applicants never appear
   * because they have no `teacher` row): `certifiedCount`
   * (`isApproved`), `evaluatorCount` (`isEvaluator`),
   * `onlineNowCount` (certified AND `isOnline`). Nullable boolean columns
   * read NULL-safe (`= true` never matches NULL).
   */
  export async function getTeacherPresenceStats(tx?: DBTransaction): Promise<TeacherPresenceRow> {
    const rows = await (tx ?? db)
      .select({
        certifiedCount: sql<number>`count(*) filter (where ${teacher.isApproved} = true)::int`.as("certified_count"),
        evaluatorCount: sql<number>`count(*) filter (where ${teacher.isEvaluator} = true)::int`.as("evaluator_count"),
        onlineNowCount:
          sql<number>`count(*) filter (where ${teacher.isApproved} = true AND ${teacher.isOnline} = true)::int`.as(
            "online_now_count"
          ),
      })
      .from(teacher);
    const row = rows[0];
    return {
      certifiedCount: row?.certifiedCount ?? 0,
      evaluatorCount: row?.evaluatorCount ?? 0,
      onlineNowCount: row?.onlineNowCount ?? 0,
    };
  }

  /**
   * Resolves the two honest rating families (REQ-018):
   *  - `reports.studentRatingByTeacher` (0–5 CHECK band) →
   *    `averageSessionRating` = `round(avg(...)::numeric, 2)::float8`,
   *    `null` when the family has zero non-null rows; the count spans
   *    non-null values only.
   *  - `evaluations.score` (0–100 CHECK band) → `averageEvaluationScore`,
   *    with the NULL-safe soft-delete exclusion
   *    (`coalesce(is_deleted, false) = false` — a legacy NULL row reads as
   *    not-deleted).
   */
  export async function getRatingStats(tx?: DBTransaction): Promise<RatingStatsRow> {
    const [reportRow] = await (tx ?? db)
      .select({
        averageSessionRating: sql<number | null>`round(avg(${reports.studentRatingByTeacher})::numeric, 2)::float8`.as(
          "average_session_rating"
        ),
        sessionRatingsCount: sql<number>`count(${reports.studentRatingByTeacher})::int`.as("session_ratings_count"),
      })
      .from(reports);
    const [evaluationRow] = await (tx ?? db)
      .select({
        averageEvaluationScore: sql<number | null>`round(avg(${evaluations.score})::numeric, 2)::float8`.as(
          "average_evaluation_score"
        ),
        evaluationScoresCount: sql<number>`count(${evaluations.score})::int`.as("evaluation_scores_count"),
      })
      .from(evaluations)
      .where(sql`coalesce(${evaluations.isDeleted}, false) = false`);
    return {
      averageSessionRating: reportRow?.averageSessionRating ?? null,
      sessionRatingsCount: reportRow?.sessionRatingsCount ?? 0,
      averageEvaluationScore: evaluationRow?.averageEvaluationScore ?? null,
      evaluationScoresCount: evaluationRow?.evaluationScoresCount ?? 0,
    };
  }

  /**
   * Resolves the operational health indicators (REQ-019):
   * `pendingDisputes` = `session` rows in `disputed` status;
   * `pendingWithdrawals` = `teacher_transaction` rows with
   * `type='withdrawal' AND status='pending'` (enum-member values bound).
   */
  export async function getHealthIndicators(tx?: DBTransaction): Promise<HealthIndicatorsRow> {
    const [disputeRow] = await (tx ?? db)
      .select({ pendingDisputes: sql<number>`count(*)::int`.as("pending_disputes") })
      .from(session)
      .where(eq(session.status, SessionStatus.Disputed));
    const [withdrawalRow] = await (tx ?? db)
      .select({ pendingWithdrawals: sql<number>`count(*)::int`.as("pending_withdrawals") })
      .from(teacherTransaction)
      .where(
        and(
          eq(teacherTransaction.type, TransactionType.Withdrawal),
          eq(teacherTransaction.status, TransactionStatus.Pending)
        )
      );
    return {
      pendingDisputes: disputeRow?.pendingDisputes ?? 0,
      pendingWithdrawals: withdrawalRow?.pendingWithdrawals ?? 0,
    };
  }
}
