/**
 * PlatformAnalyticsService — the whole-platform analytics snapshot service.
 *
 * Composes the read-only observation surface for admin dashboards: ONE
 * gate-checked, transaction-scoped snapshot whose every counter and trend
 * bucket derives from a single captured instant. The service owns only
 * orchestration and trend assembly — all metrics come from repositories:
 *
 *  - Governance: `assertActorAdminActive` is the FIRST statement of the
 *    pipeline (the shared admin actor gate — anonymous callers receive
 *    `UnauthorizedError` pre-DB; missing, non-admin, or governed actors
 *    receive localized `ForbiddenError`s in the deterministic deleted →
 *    blocked → suspended order). The gate owns its translations and its
 *    single domain log per denial; this service adds no denial logic of
 *    its own and passes `locale` through untouched.
 *  - Snapshot: inside one `withTransaction`, a single `now` is captured
 *    and handed to EVERY windowed read (a snapshot can never disagree
 *    with itself across methods), composed in one `Promise.all` over the
 *    same transaction handle.
 *  - Trend assembly: the repositories return SPARSE daily rows (days
 *    without activity are absent). The pure helpers below expand them
 *    onto a full 30-day UTC-midnight skeleton — sessions zero-fill every
 *    absent day; revenue expands per (day, currency) over the currency
 *    set observed in the trailing window, zero-fills absent pairs with
 *    the exact decimal string `"0"`, and stays honestly EMPTY when no
 *    currency exists in the window (currencies are never merged).
 *  - Silence: a successful read logs nothing, writes nothing, and emits
 *    no audit or notification rows — there is no write call in this file.
 */

import { AdminUserRepository } from "@/backend/db/repo";
import { PlatformAnalyticsRepository } from "@/backend/db/repo/admin/platform-analytics.repository";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { assertActorAdminActive } from "@/backend/services/admin/admin-gate.helpers";
import type {
  DBTransaction,
  PlatformAnalyticsReturnType,
  PlatformAnalyticsRevenueTrendPointReturnType,
  PlatformAnalyticsSessionTrendPointReturnType,
} from "@/backend/types";

/** Number of daily buckets in each trend series. */
const TREND_BUCKET_COUNT = 30;

/** One day in milliseconds (UTC bucket arithmetic — no DST in UTC). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight-UTC instant of the day containing `instant` (UTC-only calendar math). */
function utcDayStartOf(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/**
 * Builds the trend skeleton: the `TREND_BUCKET_COUNT` consecutive
 * midnight-UTC instants ending at `now`'s day, oldest first. Pure — the
 * input instant is read, never mutated, and no module state is touched.
 */
function buildDailySkeleton(now: Date): readonly Date[] {
  const lastDayStart = utcDayStartOf(now);
  return Array.from({ length: TREND_BUCKET_COUNT }, (_, index) => {
    return new Date(lastDayStart.getTime() - (TREND_BUCKET_COUNT - 1 - index) * DAY_MS);
  });
}

/**
 * Merges sparse (day, count) rows onto the full daily skeleton — every
 * bucket the sparse rows do not mention reads zero. Rows dated outside the
 * skeleton (a bucket whose day started before the window's earliest
 * midnight) are ignored, never fabricated into extra points.
 */
function mergeSessionTrend(
  skeleton: readonly Date[],
  sparseRows: readonly PlatformAnalyticsSessionTrendPointReturnType[]
): PlatformAnalyticsSessionTrendPointReturnType[] {
  const countByDay = new Map(sparseRows.map(row => [row.bucketStart.getTime(), row.sessionCount]));
  return skeleton.map(bucketStart => ({
    bucketStart,
    sessionCount: countByDay.get(bucketStart.getTime()) ?? 0,
  }));
}

/**
 * Expands sparse (day, currency, amount) rows over the full (day ×
 * window-currency) skeleton — day-major, currency-ascending within each
 * day. The currency set is exactly the one observed in the trailing
 * window's sparse rows (a currency with only older paid payments never
 * fabricates trend points); an empty set yields an honestly EMPTY series.
 * Amounts pass through as exact decimal strings; absent (day, currency)
 * pairs carry the literal zero `"0"`.
 */
function expandRevenueTrend(
  skeleton: readonly Date[],
  sparseRows: readonly PlatformAnalyticsRevenueTrendPointReturnType[]
): PlatformAnalyticsRevenueTrendPointReturnType[] {
  const currencies = [...new Set(sparseRows.map(row => row.currency))].toSorted((left, right) =>
    left.localeCompare(right)
  );
  if (currencies.length === 0) {
    return [];
  }
  const amountByDayAndCurrency = new Map(
    sparseRows.map(row => [`${row.bucketStart.getTime()}|${row.currency}`, row.amount])
  );
  const points: PlatformAnalyticsRevenueTrendPointReturnType[] = [];
  for (const bucketStart of skeleton) {
    for (const currency of currencies) {
      points.push({
        bucketStart,
        currency,
        amount: amountByDayAndCurrency.get(`${bucketStart.getTime()}|${currency}`) ?? "0",
      });
    }
  }
  return points;
}

export namespace PlatformAnalyticsService {
  /**
   * Resolves the full platform analytics snapshot for an active admin
   * actor. Denials (anonymous, missing, non-admin, or governed actors)
   * happen BEFORE any transaction opens and before any aggregate read;
   * the happy path is completely silent and performs zero writes.
   *
   * @param actorId The calling admin's user id (`0` = anonymous sentinel).
   * @param locale  Locale the shared gate localizes its denial messages in.
   * @param outerTx Optional outer transaction (test path) — the snapshot
   *                reads join it via a savepoint when supplied.
   */
  export async function getPlatformAnalytics(
    actorId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<PlatformAnalyticsReturnType> {
    // Actor gate FIRST — before validation, before any transaction opens.
    await assertActorAdminActive(actorId, locale, outerTx);

    return withTransaction(outerTx, async tx => {
      const now = new Date();

      const [
        userStats,
        recentlyActive24h,
        sessions,
        sessionTrendRows,
        gatewayRevenueByCurrency,
        revenueTrendRows,
        subscriptions,
        offlineActivationsCount,
        teachers,
        ratings,
        health,
      ] = await Promise.all([
        AdminUserRepository.getStats(tx),
        PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx),
        PlatformAnalyticsRepository.getSessionStats(now, tx),
        PlatformAnalyticsRepository.getSessionDailyTrend(now, tx),
        PlatformAnalyticsRepository.getRevenueStats(now, tx),
        PlatformAnalyticsRepository.getRevenueDailyTrend(now, tx),
        PlatformAnalyticsRepository.getSubscriptionStats(now, tx),
        PlatformAnalyticsRepository.countOfflineActivations(tx),
        PlatformAnalyticsRepository.getTeacherPresenceStats(tx),
        PlatformAnalyticsRepository.getRatingStats(tx),
        PlatformAnalyticsRepository.getHealthIndicators(tx),
      ]);

      const skeleton = buildDailySkeleton(now);

      return {
        generatedAt: now,
        users: { ...userStats, recentlyActive24h },
        sessions,
        revenue: { gatewayRevenueByCurrency, offlineActivationsCount },
        subscriptions,
        teachers,
        ratings,
        health,
        sessionTrendDaily: mergeSessionTrend(skeleton, sessionTrendRows),
        revenueTrendDaily: expandRevenueTrend(skeleton, revenueTrendRows),
      };
    });
  }
}
