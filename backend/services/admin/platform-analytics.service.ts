/**
 * PlatformAnalyticsService — composition service for the admin
 * `adminPlatformAnalytics` snapshot (DEV3-022c).
 *
 * Pipeline (strict order — REQ-054 denial precedence, plan §4.2):
 *  1. PRE-TX actor re-verification WITH governance (D8): the actorId is
 *     validated (positive safe integer), the row is re-fetched via
 *     `UserRepository.findById` (parity with `assertActorAdmin`,
 *     `backend/services/admin/user-management.service.ts:240-271`), and the
 *     denials resolve in the deterministic order anonymous/malformed →
 *     absent → non-admin → governed (deleted → blocked → suspended). EACH
 *     denial emits exactly ONE `logger.logDomainError` with
 *     `{ code, entity: "users", entityId, locale }` (REQ-036/052 bound — ids
 *     + codes only, never metric payloads) and performs ZERO aggregate reads
 *     and ZERO writes — the gate closes BEFORE the snapshot transaction.
 *     The governance re-check is a deliberate service-tier divergence from
 *     the role-only `assertActorAdmin` gate (REQ-032; rationale recorded in
 *     the canonical doc at Task 7.1): a live-token admin deleted/blocked/
 *     suspended mid-session must not keep reading platform aggregates.
 *  2. Snapshot via `withTransaction(outerTx, …)`: `now` is captured exactly
 *     ONCE (REQ-011) and ONE `Promise.all` composes every read over the
 *     SAME `tx` (REQ-040 — mixed tx/db access prohibited):
 *     `AdminUserRepository.getStats(tx)` (REUSE, REQ-002 — the DEV3-016
 *     repository is never edited) + all ten `PlatformAnalyticsRepository`
 *     methods, every windowed call bound with the captured `now`.
 *  3. Silent success: the happy path emits ZERO `logDomainError`, ZERO
 *     writes, ZERO audit rows, ZERO notifications — there is no write call
 *     in this file by construction (read purity, REQ-022).
 *
 * Trend assembly (D6 — the repo stays dumb-read, the service zero-fills):
 *  - `buildDailySkeleton(now)` — 30 consecutive UTC-midnight buckets ending
 *    at `now`'s day (REQ-020/024).
 *  - Sessions: sparse repo rows merged over the skeleton, zero-filled ALWAYS
 *    (a day with no sessions is an honest 0, never a missing bucket).
 *  - Revenue: sparse (day, currency) rows expanded per (day, currency) over
 *    the currency set discovered IN THE 30-DAY WINDOW, `amount: "0"` per
 *    absent pair, EMPTY array when no currency exists in the window
 *    (REQ-020). Currencies are never merged (REQ-023).
 *
 * Discipline:
 *  - All helpers are pure module-scope functions (no shared mutable module
 *    state — REQ-045; concurrent polls compose independently). The gate and
 *    the composer are module-scope so the exported surface stays exactly
 *    `PlatformAnalyticsService.getPlatformAnalytics`.
 *  - No `try/catch` swallowing DomainErrors — denials propagate as thrown.
 *  - No type declarations here — `backend/types/admin/platform-analytics.types.ts`
 *    is the single canonical home (REQ-004); only value composition.
 *  - Money crosses as exact decimal strings everywhere (REQ-014) — the
 *    service never parses amounts into `number`.
 */

import {
  AdminUserRepository,
  PlatformAnalyticsRepository,
  type RevenueTrendRow,
  type SessionTrendRow,
  UserRepository,
  utcDayStart,
} from "@/backend/db/repo";
import { toUserRole, UserRole } from "@/backend/enum/users/user-role.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type {
  DBTransaction,
  PlatformAnalyticsReturnType,
  PlatformAnalyticsRevenueTrendPointReturnType,
  PlatformAnalyticsSessionTrendPointReturnType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Milliseconds in one day — skeleton step arithmetic. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** The zero-filled daily trend window length (REQ-020). */
const TREND_WINDOW_DAYS = 30;

/**
 * Normalizes a repository trend bucket into a pure epoch identity — the
 * bucket is ALREADY the exact UTC-midnight epoch of its stored day.
 *
 * (Fix-C finding 2) The repository's `UTC_TIMESTAMP_DECODER` normalizes
 * BOTH driver behaviors at the single decoder point — a raw-text payload
 * is reassembled through `Date.UTC`, and a driver `Date` payload is
 * re-projected through its LOCAL wall-clock day onto the same
 * UTC-midnight epoch. The join key is therefore the bucket's own epoch,
 * with no dependence on driver/server-clock symmetry.
 */
function trendBucketKey(bucketStart: Date): number {
  return bucketStart.getTime();
}

/**
 * Builds the 30-bucket daily skeleton: consecutive UTC-midnight instants
 * ending at `now`'s day (the LAST bucket is `now`'s own midnight).
 */
function buildDailySkeleton(now: Date): Date[] {
  const lastBucket = utcDayStart(now);
  const firstBucketMs = lastBucket.getTime() - (TREND_WINDOW_DAYS - 1) * ONE_DAY_MS;
  const buckets: Date[] = [];
  for (let index = 0; index < TREND_WINDOW_DAYS; index += 1) {
    buckets.push(new Date(firstBucketMs + index * ONE_DAY_MS));
  }
  return buckets;
}

/**
 * Merges sparse session-trend rows over the skeleton, zero-filling EVERY
 * missing day (REQ-020). Unknown/out-of-skeleton buckets are ignored (the
 * repository window is a superset of the skeleton range; the extra keys
 * simply never match).
 */
function mergeSessionTrend(
  skeleton: readonly Date[],
  sparseRows: readonly SessionTrendRow[]
): PlatformAnalyticsSessionTrendPointReturnType[] {
  const countByBucket = new Map<number, number>();
  for (const row of sparseRows) {
    const key = trendBucketKey(row.bucketStart);
    countByBucket.set(key, (countByBucket.get(key) ?? 0) + row.sessionCount);
  }
  return skeleton.map(bucketStart => ({
    bucketStart,
    sessionCount: countByBucket.get(trendBucketKey(bucketStart)) ?? 0,
  }));
}

/**
 * Expands sparse (day, currency) revenue rows into the full skeleton grid:
 * one point per (bucket, currency) pair, `amount: "0"` where the window had
 * no paid volume for that pair (REQ-020). The currency set is discovered
 * from the WINDOW rows only — a currency whose paid history lies entirely
 * outside the 30-day window appears in `gatewayRevenueByCurrency` but never
 * in the trend (window honesty). EMPTY array when no currency exists in the
 * window (REQ-020). Currencies are NEVER merged (REQ-023) and are emitted
 * in ascending byte order per bucket (deterministic output).
 */
function expandRevenueTrend(
  skeleton: readonly Date[],
  sparseRows: readonly RevenueTrendRow[]
): PlatformAnalyticsRevenueTrendPointReturnType[] {
  if (sparseRows.length === 0) {
    return [];
  }
  const amountByPair = new Map<string, string>();
  const currencies = new Set<string>();
  for (const row of sparseRows) {
    currencies.add(row.currency);
    amountByPair.set(`${trendBucketKey(row.bucketStart)}\u0000${row.currency}`, row.amount);
  }
  // The set holds UNIQUE currency codes, so `a < b ? -1 : 1` is a valid
  // strict total order over its members (the tie branch is unreachable).
  const orderedCurrencies = [...currencies].toSorted((a, b) => (a < b ? -1 : 1));
  const points: PlatformAnalyticsRevenueTrendPointReturnType[] = [];
  for (const bucketStart of skeleton) {
    const bucketKey = trendBucketKey(bucketStart);
    for (const currency of orderedCurrencies) {
      points.push({
        bucketStart,
        currency,
        amount: amountByPair.get(`${bucketKey}\u0000${currency}`) ?? "0",
      });
    }
  }
  return points;
}

/**
 * Emits the ONE bounded domain log for a denial (REQ-052) and throws the
 * pre-built localized DomainError. The log context carries ids + codes +
 * locale only (REQ-036) — never metric payloads, never SQL text.
 */
function denyReader(
  message: string,
  code: "UNAUTHORIZED" | "FORBIDDEN",
  makeError: () => UnauthorizedError | ForbiddenError,
  actorId: number,
  locale: string
): never {
  logger.logDomainError(message, { code, entity: "users", entityId: actorId, locale });
  throw makeError();
}

/**
 * PRE-TX denial chain (REQ-031/032/054): anonymous/malformed → absent →
 * non-admin → governed (deleted → blocked → suspended). Zero aggregate
 * reads, zero writes — only the actor-row fetch behind `UserRepository.findById`.
 */
async function assertPlatformAnalyticsReader(actorId: number, locale: string, outerTx?: DBTransaction): Promise<void> {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  if (!Number.isInteger(actorId) || actorId <= 0) {
    denyReader(
      "Platform analytics denied: anonymous or malformed actor id",
      "UNAUTHORIZED",
      () => new UnauthorizedError(tErrors.unauthorized),
      actorId,
      locale
    );
  }

  const actor = await UserRepository.findById(actorId, outerTx);
  if (!actor) {
    denyReader(
      "Platform analytics denied: actor row missing",
      "UNAUTHORIZED",
      () => new UnauthorizedError(tErrors.unauthorized),
      actorId,
      locale
    );
  }

  if (toUserRole(actor.role) !== UserRole.Admin) {
    denyReader(
      "Platform analytics denied: actor is not admin",
      "FORBIDDEN",
      () => new ForbiddenError(tErrors.forbidden),
      actorId,
      locale
    );
  }

  if (actor.isDeleted) {
    denyReader(
      "Platform analytics denied: admin account deleted",
      "FORBIDDEN",
      () => new ForbiddenError(tErrors.accountDeleted),
      actorId,
      locale
    );
  }

  if (actor.isBlocked) {
    denyReader(
      "Platform analytics denied: admin account blocked",
      "FORBIDDEN",
      () => new ForbiddenError(tErrors.accountBlocked),
      actorId,
      locale
    );
  }

  if (actor.suspended) {
    denyReader(
      "Platform analytics denied: admin account suspended",
      "FORBIDDEN",
      () => new ForbiddenError(tErrors.accountSuspended),
      actorId,
      locale
    );
  }
}

/**
 * Composes the snapshot body inside the request's ONE transaction: `now`
 * captured exactly ONCE, ONE `Promise.all` over the SAME `tx` (REQ-011/040),
 * trend skeletons zero-filled/expanded by the pure helpers above.
 */
async function composePlatformAnalyticsSnapshot(tx: DBTransaction): Promise<PlatformAnalyticsReturnType> {
  const now = new Date();

  const [
    getStatsResult,
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
    users: {
      ...getStatsResult,
      recentlyActive24h,
    },
    sessions,
    revenue: {
      gatewayRevenueByCurrency,
      offlineActivationsCount,
    },
    subscriptions,
    teachers,
    ratings,
    health,
    sessionTrendDaily: mergeSessionTrend(skeleton, sessionTrendRows),
    revenueTrendDaily: expandRevenueTrend(skeleton, revenueTrendRows),
  };
}

export namespace PlatformAnalyticsService {
  /**
   * Composes the full platform-analytics snapshot for an admin actor.
   *
   * Denial chain (deterministic — REQ-054), each tier pre-DB for the
   * aggregate reads and logging exactly once (see
   * `assertPlatformAnalyticsReader`). On success every read shares ONE `tx`
   * and ONE captured `now` (`generatedAt` — REQ-011/040). Pure read: zero
   * writes / zero audit / zero logs on the happy path (REQ-022).
   */
  export async function getPlatformAnalytics(
    actorId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<PlatformAnalyticsReturnType> {
    await assertPlatformAnalyticsReader(actorId, locale, outerTx);
    return withTransaction(outerTx, tx => composePlatformAnalyticsSnapshot(tx));
  }
}
