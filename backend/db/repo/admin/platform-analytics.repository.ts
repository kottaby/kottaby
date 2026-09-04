/**
 * PlatformAnalyticsRepository — read-only aggregate projections for the
 * platform analytics dashboard (whole-platform observation surface).
 *
 * Every method is a set-oriented, single-round-trip aggregate (no per-row
 * hydration, no N+1, no joins beyond what a counter needs — most read one
 * table directly). The repository is a dumb reader: it returns raw rows and
 * counts only — no business assembly, no zero-filling, no permission checks,
 * no localized strings. The service layer composes the snapshot.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - Dual-branch executor for the Neon-HTTP-client rule: every method takes
 *    a trailing `tx?: DBTransaction`; when a transaction is supplied the
 *    read runs on it through the Drizzle query builder (so it joins the
 *    caller's unit of work and sees uncommitted state); when absent the
 *    same statement runs via `queryDb(text, params)` — raw numbered-`$n`
 *    parameterized SQL over the pool (the stateless fast path). The two
 *    branches are kept semantically identical on purpose: same predicates,
 *    same parameterization, same ordering. The global `db` handle is never
 *    imported — there is no `db` fallback branch to write.
 *  - No prepared statements: these are dynamic aggregate reads (window
 *    bounds and enum members bind per call), so module-level
 *    `sql.placeholder` candidacy does not apply (see
 *    `docs/drizzle/prepared-statements.md`). No `inArray` binds against a
 *    placeholder — the one `IN` predicate passes a plain member array.
 *  - Every value flows into a bound parameter (`$n` bind or an `eq(...)` /
 *    `sql`-fragment bind) — never string-interpolated into SQL text. No
 *    LIKE/ILIKE predicate exists on this surface, so no wildcard escaping
 *    obligation arises. No inline `--` comments inside any SQL text.
 *  - Time discipline: the caller captures ONE `now` instant and passes it to
 *    every windowed method; all calendar boundaries are computed from that
 *    instant in pure UTC-only helpers (never SQL `now()`) so a snapshot can
 *    never disagree with itself across methods.
 *
 * Honesty contracts (aggregates only):
 *  - Money never crosses a JS `number`: `sum(amount)` is cast `::text` so
 *    decimal strings arrive exactly as PostgreSQL computed them, per
 *    currency. Currencies are never merged — every row carries one code.
 *  - Rating averages are `null` when the family has no rated rows ("no
 *    ratings yet" is not "rated zero"); the paired count exposes the sample
 *    size behind each average.
 *  - Offline-activated subscriptions (offline cash / bank transfer /
 *    scholarship) bypass the payments ledger entirely, so they are counted
 *    separately and never folded into any monetary total.
 *
 * File layout (size-budget split, zero behavior change):
 *  - `./platform-analytics-query-helpers` — the repo-row interfaces, the
 *    trailing-window/offline-activation constants, the UTC-only calendar
 *    helpers, the shared single-row zero-coalescing mappers, and the
 *    extracted executor implementations for the session-stats, both daily
 *    trends, revenue-stats, and offline-activation readers. The public
 *    methods below delegate to those implementations; signatures and
 *    behavior are unchanged.
 */

import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { queryDb } from "@/backend/db";
import {
  countOfflineActivationsImpl,
  getRevenueDailyTrendImpl,
  getRevenueStatsImpl,
  getSessionDailyTrendImpl,
  getSessionStatsImpl,
  mapSubscriptionStatsRow,
  type PlatformAnalyticsCurrencyRevenueRow,
  type PlatformAnalyticsHealthRow,
  type PlatformAnalyticsRatingStatsRow,
  type PlatformAnalyticsRevenueTrendRow,
  type PlatformAnalyticsSessionStatsRow,
  type PlatformAnalyticsSessionTrendRow,
  type PlatformAnalyticsSubscriptionStatsRow,
  type PlatformAnalyticsTeacherPresenceRow,
} from "@/backend/db/repo/admin/platform-analytics-query-helpers";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import type { DBTransaction } from "@/backend/types";

/** Trailing presence window of the recently-active user counter, in milliseconds. */
const RECENT_ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Row-type re-exports keep the deep import path
 * `@/backend/db/repo/admin/platform-analytics.repository` stable for
 * existing consumers after the row shapes moved to
 * `./platform-analytics-query-helpers`. Type-only forwarding — no runtime
 * surface.
 */
export type {
  PlatformAnalyticsCurrencyRevenueRow,
  PlatformAnalyticsHealthRow,
  PlatformAnalyticsRatingStatsRow,
  PlatformAnalyticsRevenueTrendRow,
  PlatformAnalyticsSessionStatsRow,
  PlatformAnalyticsSessionTrendRow,
  PlatformAnalyticsSubscriptionStatsRow,
  PlatformAnalyticsTeacherPresenceRow,
} from "@/backend/db/repo/admin/platform-analytics-query-helpers";

export namespace PlatformAnalyticsRepository {
  /**
   * Counts users seen active inside the trailing 24 hours ending at `now`
   * (strictly after `now − 24h`), excluding governed accounts. The
   * governance exclusion is NULL-safe in both directions — a legacy NULL
   * state column reads as "not set", so only an explicit `true` excludes:
   * deleted, suspended, and blocked users never count as recently active.
   *
   * @param now The snapshot instant the 24-hour window closes at.
   * @param tx  Optional transaction executor (dual-branch — see file header).
   */
  export async function countRecentlyActiveUsers(now: Date, tx?: DBTransaction): Promise<number> {
    const windowStart = new Date(now.getTime() - RECENT_ACTIVITY_WINDOW_MS);
    if (tx) {
      const rows = await tx
        .select({ activeCount: sql<number>`count(*)::int`.as("active_count") })
        .from(users)
        .where(
          and(
            gt(users.lastActiveAt, windowStart),
            or(eq(users.isDeleted, false), isNull(users.isDeleted)),
            or(eq(users.suspended, false), isNull(users.suspended)),
            or(eq(users.isBlocked, false), isNull(users.isBlocked))
          )
        );
      return rows[0]?.activeCount ?? 0;
    }
    const result = await queryDb<{ activeCount: number }>(
      `SELECT count(*)::int AS "activeCount"
         FROM users
        WHERE last_active_at > $1
          AND coalesce(is_deleted, false) = false
          AND coalesce(suspended, false) = false
          AND coalesce(is_blocked, false) = false`,
      [windowStart]
    );
    return result.rows[0]?.activeCount ?? 0;
  }

  /**
   * Resolves the ten-counter session section in ONE bare aggregate over
   * `session` (always exactly one row — zeros on an empty table).
   *
   * Window counters are closed ranges `[boundary, now]` cut from the
   * captured instant: `today` from midnight UTC of `now`'s day, `thisWeek`
   * from Monday 00:00 UTC of `now`'s ISO week, `thisMonth` from 00:00 UTC
   * of the first of `now`'s month. A row stamped after the snapshot instant
   * counts in none of them (statement-level visibility of the captured
   * `now`); a row stamped exactly at a boundary counts (inclusive `>=`).
   * The five status counters partition `total` exactly (one status per
   * row). `awaitingConfirmation` is lifecycle-derived: `completed` AND the
   * student confirmation instant still NULL — confirming the student flips
   * a session out of the counter without changing its status.
   *
   * @param now The snapshot instant all three windows close at.
   * @param tx  Optional transaction executor (dual-branch — see file header).
   */
  export async function getSessionStats(now: Date, tx?: DBTransaction): Promise<PlatformAnalyticsSessionStatsRow> {
    return getSessionStatsImpl(now, tx);
  }

  /**
   * Resolves the SPARSE daily session trend: one `{ bucketStart, count }`
   * row per UTC day that has at least one session inside the closed
   * 30-day window `[now − 30d, now]`, ordered by day ascending. Days
   * without sessions are absent (the service layer zero-fills the full
   * skeleton — this reader never fabricates empty buckets). `bucketStart`
   * is a true midnight-UTC `Date` (`date_trunc('day', …)`), not a string.
   *
   * @param now The snapshot instant the window closes at.
   * @param tx  Optional transaction executor (dual-branch — see file header).
   */
  export async function getSessionDailyTrend(
    now: Date,
    tx?: DBTransaction
  ): Promise<PlatformAnalyticsSessionTrendRow[]> {
    return getSessionDailyTrendImpl(now, tx);
  }

  /**
   * Resolves per-currency gateway revenue from SETTLED (`paid`) payments
   * only — one row per currency that has at least one paid payment, ordered
   * by currency ascending. A payment history with no paid rows yields an
   * EMPTY array (never a phantom zero-currency row). Amounts are exact
   * decimal strings (`::text`); `totalAmount` spans all time while
   * `last30DaysAmount` spans the closed 30-day window `[now − 30d, now]`;
   * `paidPaymentsCount` is the all-time settled count behind the row.
   * Offline-activated subscriptions never produce a payment row, so they
   * are structurally absent here (counted separately by
   * `countOfflineActivations`) — the two figures must never be merged.
   *
   * @param now The snapshot instant the 30-day window closes at.
   * @param tx  Optional transaction executor (dual-branch — see file header).
   */
  export async function getRevenueStats(now: Date, tx?: DBTransaction): Promise<PlatformAnalyticsCurrencyRevenueRow[]> {
    return getRevenueStatsImpl(now, tx);
  }

  /**
   * Resolves the SPARSE daily revenue trend: one
   * `{ bucketStart, currency, amount }` row per (UTC day, currency) pair
   * with at least one settled payment inside the closed 30-day window
   * `[now − 30d, now]`, ordered by day then currency. Currencies stay in
   * separate points — no day ever sums across codes. `amount` is an exact
   * decimal string; `bucketStart` is a true midnight-UTC `Date`.
   *
   * @param now The snapshot instant the window closes at.
   * @param tx  Optional transaction executor (dual-branch — see file header).
   */
  export async function getRevenueDailyTrend(
    now: Date,
    tx?: DBTransaction
  ): Promise<PlatformAnalyticsRevenueTrendRow[]> {
    return getRevenueDailyTrendImpl(now, tx);
  }

  /**
   * Resolves the seven-counter subscription section in ONE bare aggregate
   * over `subscriptions` (always exactly one row — zeros on an empty
   * table). The five status counters partition `total` exactly.
   * `activeInWindowNow` applies the ACTIVE-window predicate at the
   * captured instant (mirroring the directory's active-subscription shape,
   * with `now` bound as a parameter instead of SQL `now()`): status
   * `active`, started at or before `now` (a NULL start date reads as
   * starting now), and not yet ended — an open-ended end date qualifies, a
   * NULL end date qualifies, and an end date exactly at `now` does NOT
   * (strict `<`).
   *
   * @param now The snapshot instant the window is evaluated at.
   * @param tx  Optional transaction executor (dual-branch — see file header).
   */
  export async function getSubscriptionStats(
    now: Date,
    tx?: DBTransaction
  ): Promise<PlatformAnalyticsSubscriptionStatsRow> {
    if (tx) {
      const rows = await tx
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
          activeInWindowNow: sql<number>`count(*) filter (
              where ${subscriptions.status} = ${SubscriptionStatus.Active}
                and coalesce(${subscriptions.startDate}, ${now}) <= ${now}
                and (${subscriptions.endDate} is null or ${now} < ${subscriptions.endDate})
            )::int`.as("active_in_window_now"),
        })
        .from(subscriptions);
      return mapSubscriptionStatsRow(rows[0]);
    }
    const result = await queryDb<PlatformAnalyticsSubscriptionStatsRow>(
      `SELECT count(*)::int AS "total",
              count(*) filter (where status = $1)::int AS "active",
              count(*) filter (where status = $2)::int AS "pending",
              count(*) filter (where status = $3)::int AS "expired",
              count(*) filter (where status = $4)::int AS "cancelled",
              count(*) filter (where status = $5)::int AS "suspended",
              count(*) filter (
                where status = $1
                  and coalesce(start_date, $6) <= $6
                  and (end_date is null or $6 < end_date)
              )::int AS "activeInWindowNow"
         FROM subscriptions`,
      [
        SubscriptionStatus.Active,
        SubscriptionStatus.Pending,
        SubscriptionStatus.Expired,
        SubscriptionStatus.Cancelled,
        SubscriptionStatus.Suspended,
        now,
      ]
    );
    return mapSubscriptionStatsRow(result.rows[0]);
  }

  /**
   * Counts subscriptions activated through the offline payment methods
   * (offline cash, bank transfer, scholarship) — the honesty counter for
   * activations that bypass the payments ledger entirely. Deliberately
   * separate from `getRevenueStats`: mixing offline activations into
   * monetary totals is prohibited by the surface contract.
   *
   * @param tx Optional transaction executor (dual-branch — see file header).
   */
  export async function countOfflineActivations(tx?: DBTransaction): Promise<number> {
    return countOfflineActivationsImpl(tx);
  }

  /**
   * Resolves the teacher-population headline counters in ONE bare
   * aggregate over the `teacher` table (always exactly one row — zeros on
   * an empty table). `certifiedCount` counts approved rows,
   * `evaluatorCount` evaluator-flagged rows, and `onlineNowCount` counts
   * teachers that are BOTH approved and flagged online (an uncertified
   * row is never "online now"). Applicants never appear — they have no
   * `teacher` row by construction.
   *
   * @param tx Optional transaction executor (dual-branch — see file header).
   */
  export async function getTeacherPresenceStats(tx?: DBTransaction): Promise<PlatformAnalyticsTeacherPresenceRow> {
    if (tx) {
      const rows = await tx
        .select({
          certifiedCount: sql<number>`count(*) filter (where ${teacher.isApproved} = true)::int`.as("certified_count"),
          evaluatorCount: sql<number>`count(*) filter (where ${teacher.isEvaluator} = true)::int`.as("evaluator_count"),
          onlineNowCount:
            sql<number>`count(*) filter (where ${teacher.isApproved} = true and ${teacher.isOnline} = true)::int`.as(
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
    const result = await queryDb<PlatformAnalyticsTeacherPresenceRow>(
      `SELECT count(*) filter (where is_approved = true)::int AS "certifiedCount",
              count(*) filter (where is_evaluator = true)::int AS "evaluatorCount",
              count(*) filter (where is_approved = true and is_online = true)::int AS "onlineNowCount"
         FROM teacher`
    );
    const row = result.rows[0];
    return {
      certifiedCount: row?.certifiedCount ?? 0,
      evaluatorCount: row?.evaluatorCount ?? 0,
      onlineNowCount: row?.onlineNowCount ?? 0,
    };
  }

  /**
   * Resolves the two rating families in two single-row reads (always
   * exactly one row each — null averages and zero counts on empty
   * families). `averageSessionRating` averages the 0–5 session-report
   * ratings over NON-NULL values only (an unrated report is absent from
   * both the average and the count); `averageEvaluationScore` averages the
   * 0–100 scores of live evaluations, excluding soft-deleted rows
   * NULL-safely (only an explicit deleted flag excludes). Both averages
   * round to exactly 2 decimal places server-side and arrive as floats;
   * an empty family yields `null` — never a fabricated zero.
   *
   * @param tx Optional transaction executor (dual-branch — see file header).
   */
  export async function getRatingStats(tx?: DBTransaction): Promise<PlatformAnalyticsRatingStatsRow> {
    if (tx) {
      const reportRows = await tx
        .select({
          averageSessionRating: sql<
            number | null
          >`round(avg(${reports.studentRatingByTeacher})::numeric, 2)::float8`.as("average_session_rating"),
          sessionRatingsCount: sql<number>`count(${reports.studentRatingByTeacher})::int`.as("session_ratings_count"),
        })
        .from(reports);
      const evaluationRows = await tx
        .select({
          averageEvaluationScore: sql<number | null>`round(avg(${evaluations.score})::numeric, 2)::float8`.as(
            "average_evaluation_score"
          ),
          evaluationScoresCount: sql<number>`count(${evaluations.score})::int`.as("evaluation_scores_count"),
        })
        .from(evaluations)
        .where(or(eq(evaluations.isDeleted, false), isNull(evaluations.isDeleted)));
      const reportRow = reportRows[0];
      const evaluationRow = evaluationRows[0];
      return {
        averageSessionRating: reportRow?.averageSessionRating ?? null,
        sessionRatingsCount: reportRow?.sessionRatingsCount ?? 0,
        averageEvaluationScore: evaluationRow?.averageEvaluationScore ?? null,
        evaluationScoresCount: evaluationRow?.evaluationScoresCount ?? 0,
      };
    }
    const reportResult = await queryDb<{ averageSessionRating: number | null; sessionRatingsCount: number }>(
      `SELECT round(avg(student_rating_by_teacher)::numeric, 2)::float8 AS "averageSessionRating",
              count(student_rating_by_teacher)::int AS "sessionRatingsCount"
         FROM reports`
    );
    const evaluationResult = await queryDb<{ averageEvaluationScore: number | null; evaluationScoresCount: number }>(
      `SELECT round(avg(score)::numeric, 2)::float8 AS "averageEvaluationScore",
              count(score)::int AS "evaluationScoresCount"
         FROM evaluations
        WHERE coalesce(is_deleted, false) = $1`,
      [false]
    );
    const reportRow = reportResult.rows[0];
    const evaluationRow = evaluationResult.rows[0];
    return {
      averageSessionRating: reportRow?.averageSessionRating ?? null,
      sessionRatingsCount: reportRow?.sessionRatingsCount ?? 0,
      averageEvaluationScore: evaluationRow?.averageEvaluationScore ?? null,
      evaluationScoresCount: evaluationRow?.evaluationScoresCount ?? 0,
    };
  }

  /**
   * Resolves the operational backlog indicators in two single-round-trip
   * counts: sessions currently in the `disputed` arbitration state, and
   * withdrawal ledger entries still `pending` payout. No other indicator
   * is reported — the two-counter shape is the whole contract.
   *
   * @param tx Optional transaction executor (dual-branch — see file header).
   */
  export async function getHealthIndicators(tx?: DBTransaction): Promise<PlatformAnalyticsHealthRow> {
    if (tx) {
      const disputeRows = await tx
        .select({ pendingDisputes: sql<number>`count(*)::int`.as("pending_disputes") })
        .from(session)
        .where(eq(session.status, SessionStatus.Disputed));
      const withdrawalRows = await tx
        .select({ pendingWithdrawals: sql<number>`count(*)::int`.as("pending_withdrawals") })
        .from(teacherTransaction)
        .where(
          and(
            eq(teacherTransaction.type, TransactionType.Withdrawal),
            eq(teacherTransaction.status, TransactionStatus.Pending)
          )
        );
      return {
        pendingDisputes: disputeRows[0]?.pendingDisputes ?? 0,
        pendingWithdrawals: withdrawalRows[0]?.pendingWithdrawals ?? 0,
      };
    }
    const disputeResult = await queryDb<{ pendingDisputes: number }>(
      `SELECT count(*)::int AS "pendingDisputes"
         FROM session
        WHERE status = $1`,
      [SessionStatus.Disputed]
    );
    const withdrawalResult = await queryDb<{ pendingWithdrawals: number }>(
      `SELECT count(*)::int AS "pendingWithdrawals"
         FROM teacher_transaction
        WHERE type = $1 AND status = $2`,
      [TransactionType.Withdrawal, TransactionStatus.Pending]
    );
    return {
      pendingDisputes: disputeResult.rows[0]?.pendingDisputes ?? 0,
      pendingWithdrawals: withdrawalResult.rows[0]?.pendingWithdrawals ?? 0,
    };
  }
}
