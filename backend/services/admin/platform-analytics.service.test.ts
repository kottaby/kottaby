/**
 * PlatformAnalyticsService tests — the platform analytics snapshot service
 * suite (gate → one-transaction composition → trend assembly → purity).
 *
 * The service under test is a pure OBSERVER: it gates the actor through the
 * shared `assertActorAdminActive` helper, captures ONE `now` instant, and
 * composes every repository read through a single `Promise.all` on the same
 * transaction before assembling the 30-day trend skeletons. The suite pins:
 *
 *  - Tier 1 (actor matrix through the REAL gate): anonymous `actorId = 0` →
 *    `UnauthorizedError` pre-DB; absent actor → `ForbiddenError`;
 *    student/teacher/parent → `ForbiddenError`; governed admins surface
 *    deleted → blocked → suspended messages in deterministic order (a
 *    multi-flagged admin reads the deleted message); a live admin resolves
 *    the full snapshot shape — through BOTH transaction paths (caller `tx`
 *    and the production top-level `db.transaction`).
 *  - Tier 2 (single-`now` propagation & composition): repo spies pinned on
 *    the IDENTICAL `now` reference bound into every windowed method, the
 *    identical transaction handle shared by ALL eleven reads, `generatedAt`
 *    reference-equal to the captured instant, and the users section flowing
 *    the ten directory counters verbatim plus `recentlyActive24h`.
 *  - Tier 3 (trend-assembly chaos): sparse-full / sparse-empty /
 *    multi-currency skeletons — sessions zero-fill all 30 UTC-midnight
 *    buckets, revenue expands day-major and currency-ascending over the
 *    window's currency set with exact `"0"` fills, and an all-time-only
 *    currency never fabricates trend points.
 *  - Tier 4 (denial pre-DB proof & silence): aggregate repo spies receive
 *    ZERO calls on every denial path; the happy path logs NOTHING and every
 *    denial logs exactly ONE domain error (the gate owns the log line).
 *
 * Per the sibling admin suites:
 *  - DB cases run inside `runInRollback` with the caller `tx` passed to the
 *    service as `outerTx`; entities ONLY via `entity-setup.ts` helpers.
 *  - All rejection assertions use `expectRepoError` (try/catch).
 *  - Translated-message assertions resolve via `getServerTranslations`
 *    property access — never raw keys, never hardcoded copy.
 *  - Spies are tracked and restored per test (bun reuses ONE mock per
 *    object+method pair until restore).
 */

import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { AdminUserRepository, UserRepository } from "@/backend/db/repo";
import { PlatformAnalyticsRepository } from "@/backend/db/repo/admin/platform-analytics.repository";
import { users } from "@/backend/db/schema/users/users";
import { createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { PlatformAnalyticsService } from "@/backend/services/admin/platform-analytics.service";
import type {
  AdminUserStatsReturnType,
  DBTransaction,
  PlatformAnalyticsHealthReturnType,
  PlatformAnalyticsRatingsReturnType,
  PlatformAnalyticsRevenueTrendPointReturnType,
  PlatformAnalyticsSessionsReturnType,
  PlatformAnalyticsSubscriptionsReturnType,
  PlatformAnalyticsTeachersReturnType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { deleteUsersByIds } from "@/test/helpers/db-cleanup";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** Sentinel `actorId` value expressing an anonymous caller. */
const ANONYMOUS_ACTOR_ID = 0;

/** Number of daily buckets in each trend series. */
const TREND_BUCKET_COUNT = 30;

/** One day in milliseconds (UTC bucket arithmetic — no DST in UTC). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight-UTC instant of the day containing `instant` (the bucket anchor). */
function utcDayStart(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/** Returns an integer id guaranteed absent from `users` in this tx. */
async function absentUserId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${users.id}), 0)::int` }).from(users);
  return (row?.maxId ?? 0) + 1_000_000;
}

/** Asserts a `users` id resolves to no row inside this tx (pre-denial proof). */
async function expectUserAbsent(tx: DBTransaction, id: number): Promise<void> {
  const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.id, id));
  expect(row?.count ?? 0).toBe(0);
}

/** Domain log spy family share this stubbed signature. */
type DomainLogSpy = ReturnType<typeof spyOn>;

/**
 * Registry of every spy created during the currently running test. bun's
 * `spyOn` reuses ONE mock per object+method pair until it is restored, so
 * every spy is registered here and restored by the file-level `afterEach`.
 */
const trackedSpies: DomainLogSpy[] = [];

/** Registers a spy for automatic restoration after the current test. */
function trackSpy<T extends DomainLogSpy>(spy: T): T {
  trackedSpies.push(spy);
  return spy;
}

/** Restores every spy the finished test created (fresh mocks per test). */
afterEach(() => {
  while (trackedSpies.length > 0) {
    trackedSpies.pop()?.mockRestore();
  }
});

/** Silences `logger.logDomainError` so test stdout stays compact. */
function silenceDomainLog(): DomainLogSpy {
  return trackSpy(
    spyOn(logger, "logDomainError")
      .mockClear()
      .mockImplementation(() => {})
  );
}

/** Call-through spy on the gate's actor-read seam (pre-DB proofs). */
function spyActorRead(): DomainLogSpy {
  return trackSpy(spyOn(UserRepository, "findById"));
}

/**
 * The eleven aggregate reads the snapshot composes — spied call-through so
 * denial paths can prove ZERO aggregate reads without stubbing behavior.
 */
function spyAggregateReads(): DomainLogSpy[] {
  return [
    spyOn(AdminUserRepository, "getStats"),
    spyOn(PlatformAnalyticsRepository, "countRecentlyActiveUsers"),
    spyOn(PlatformAnalyticsRepository, "getSessionStats"),
    spyOn(PlatformAnalyticsRepository, "getSessionDailyTrend"),
    spyOn(PlatformAnalyticsRepository, "getRevenueStats"),
    spyOn(PlatformAnalyticsRepository, "getRevenueDailyTrend"),
    spyOn(PlatformAnalyticsRepository, "getSubscriptionStats"),
    spyOn(PlatformAnalyticsRepository, "countOfflineActivations"),
    spyOn(PlatformAnalyticsRepository, "getTeacherPresenceStats"),
    spyOn(PlatformAnalyticsRepository, "getRatingStats"),
    spyOn(PlatformAnalyticsRepository, "getHealthIndicators"),
  ].map(trackSpy);
}

/** Fixed ten-counter directory row the Tier-2 getStats stub returns. */
const USER_STATS_ROW: AdminUserStatsReturnType = {
  totalCount: 11,
  activeCount: 9,
  suspendedCount: 1,
  blockedCount: 2,
  deletedCount: 3,
  adminsCount: 4,
  teachersCount: 5,
  studentsCount: 6,
  parentsCount: 7,
  newThisWeekCount: 8,
};

/** Fixed ten-counter session row for the composition pins. */
const SESSIONS_ROW: PlatformAnalyticsSessionsReturnType = {
  total: 21,
  today: 3,
  thisWeek: 5,
  thisMonth: 7,
  scheduled: 1,
  started: 2,
  completed: 3,
  cancelled: 4,
  disputed: 5,
  awaitingConfirmation: 6,
};

/** Fixed seven-counter subscription row for the composition pins. */
const SUBSCRIPTIONS_ROW: PlatformAnalyticsSubscriptionsReturnType = {
  total: 31,
  active: 12,
  pending: 6,
  expired: 5,
  cancelled: 4,
  suspended: 3,
  activeInWindowNow: 11,
};

/** Fixed teacher-presence row for the composition pins. */
const TEACHERS_ROW: PlatformAnalyticsTeachersReturnType = {
  certifiedCount: 8,
  evaluatorCount: 3,
  onlineNowCount: 2,
};

/** Fixed ratings row — honest-null averages for the composition pins. */
const RATINGS_ROW: PlatformAnalyticsRatingsReturnType = {
  averageSessionRating: null,
  sessionRatingsCount: 0,
  averageEvaluationScore: 88.88,
  evaluationScoresCount: 4,
};

/** Fixed health row for the composition pins. */
const HEALTH_ROW: PlatformAnalyticsHealthReturnType = {
  pendingDisputes: 2,
  pendingWithdrawals: 5,
};

/**
 * Stubs ALL eleven aggregate reads with fixed rows, capturing the `now` and
 * `tx` arguments every mock receives — the single-snapshot proof harness.
 * Returns the spies so tests can assert call counts and argument identity.
 */
function stubAggregateReads(nowCaptures: Date[], txCaptures: unknown[]) {
  const pushTx = (tx: unknown): void => {
    txCaptures.push(tx);
  };
  return {
    getStats: trackSpy(
      spyOn(AdminUserRepository, "getStats").mockImplementation(async tx => {
        pushTx(tx);
        return USER_STATS_ROW;
      })
    ),
    recentlyActive: trackSpy(
      spyOn(PlatformAnalyticsRepository, "countRecentlyActiveUsers").mockImplementation(async (now, tx) => {
        nowCaptures.push(now);
        pushTx(tx);
        return 7;
      })
    ),
    sessionStats: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getSessionStats").mockImplementation(async (now, tx) => {
        nowCaptures.push(now);
        pushTx(tx);
        return SESSIONS_ROW;
      })
    ),
    sessionTrend: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getSessionDailyTrend").mockImplementation(async (now, tx) => {
        nowCaptures.push(now);
        pushTx(tx);
        return [];
      })
    ),
    revenueStats: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getRevenueStats").mockImplementation(async (now, tx) => {
        nowCaptures.push(now);
        pushTx(tx);
        return [];
      })
    ),
    revenueTrend: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getRevenueDailyTrend").mockImplementation(async (now, tx) => {
        nowCaptures.push(now);
        pushTx(tx);
        return [];
      })
    ),
    subscriptionStats: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getSubscriptionStats").mockImplementation(async (now, tx) => {
        nowCaptures.push(now);
        pushTx(tx);
        return SUBSCRIPTIONS_ROW;
      })
    ),
    offlineActivations: trackSpy(
      spyOn(PlatformAnalyticsRepository, "countOfflineActivations").mockImplementation(async tx => {
        pushTx(tx);
        return 3;
      })
    ),
    teacherPresence: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getTeacherPresenceStats").mockImplementation(async tx => {
        pushTx(tx);
        return TEACHERS_ROW;
      })
    ),
    ratingStats: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getRatingStats").mockImplementation(async tx => {
        pushTx(tx);
        return RATINGS_ROW;
      })
    ),
    healthIndicators: trackSpy(
      spyOn(PlatformAnalyticsRepository, "getHealthIndicators").mockImplementation(async tx => {
        pushTx(tx);
        return HEALTH_ROW;
      })
    ),
  };
}

/** The committed admin used by the production-path (no caller tx) case. */
let committedAdminId = 0;

afterAll(async () => {
  if (committedAdminId > 0) {
    await deleteUsersByIds([committedAdminId]);
    committedAdminId = 0;
  }
});

describe("PlatformAnalyticsService.getPlatformAnalytics", () => {
  describe("Tier 1 — actor matrix through the real governance gate", () => {
    test("anonymous actor (id=0) → UnauthorizedError BEFORE any repository read; one gate log", async () => {
      await runInRollback(async tx => {
        await createTestUser(tx, { role: "admin" });
        const logSpy = silenceDomainLog();
        const readSpy = spyActorRead();

        const error = await expectRepoError(() =>
          PlatformAnalyticsService.getPlatformAnalytics(ANONYMOUS_ACTOR_ID, LOCALE, tx)
        );

        expect(error).toBeInstanceOf(UnauthorizedError);
        expect(error.message).toContain(tErrors.unauthorized);
        expect(readSpy).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledTimes(1);
      });
    });

    test("absent actor → ForbiddenError after the gate's own reads; one gate log", async () => {
      await runInRollback(async tx => {
        const absentId = await absentUserId(tx);
        await expectUserAbsent(tx, absentId);
        const logSpy = silenceDomainLog();

        const error = await expectRepoError(() => PlatformAnalyticsService.getPlatformAnalytics(absentId, LOCALE, tx));

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toContain(tErrors.forbidden);
        expect(logSpy).toHaveBeenCalledTimes(1);
      });
    });

    test("student, teacher, and parent actors → ForbiddenError every time; one gate log each", async () => {
      await runInRollback(async tx => {
        const student = await createTestUser(tx, { role: "student" });
        const teacher = await createTestUser(tx, { role: "teacher" });
        const parent = await createTestUser(tx, { role: "parent" });
        const logSpy = silenceDomainLog();

        const nonAdminErrors = await Promise.all(
          [student, teacher, parent].map(actor =>
            expectRepoError(() => PlatformAnalyticsService.getPlatformAnalytics(actor.id, LOCALE, tx))
          )
        );
        for (const error of nonAdminErrors) {
          expect(error).toBeInstanceOf(ForbiddenError);
          expect(error.message).toContain(tErrors.forbidden);
        }
        expect(logSpy).toHaveBeenCalledTimes(3);
      });
    });

    test("deleted admin → accountDeleted; blocked admin → accountBlocked; suspended admin → accountSuspended", async () => {
      await runInRollback(async tx => {
        const deleted = await createTestUser(tx, { role: "admin", isDeleted: true });
        const blocked = await createTestUser(tx, { role: "admin", isBlocked: true });
        const suspended = await createTestUser(tx, { role: "admin", suspended: true });
        const logSpy = silenceDomainLog();

        const deletedError = await expectRepoError(() =>
          PlatformAnalyticsService.getPlatformAnalytics(deleted.id, LOCALE, tx)
        );
        expect(deletedError).toBeInstanceOf(ForbiddenError);
        expect(deletedError.message).toContain(tErrors.accountDeleted);

        const blockedError = await expectRepoError(() =>
          PlatformAnalyticsService.getPlatformAnalytics(blocked.id, LOCALE, tx)
        );
        expect(blockedError).toBeInstanceOf(ForbiddenError);
        expect(blockedError.message).toContain(tErrors.accountBlocked);

        const suspendedError = await expectRepoError(() =>
          PlatformAnalyticsService.getPlatformAnalytics(suspended.id, LOCALE, tx)
        );
        expect(suspendedError).toBeInstanceOf(ForbiddenError);
        expect(suspendedError.message).toContain(tErrors.accountSuspended);

        expect(logSpy).toHaveBeenCalledTimes(3);
      });
    });

    test("multi-flagged admin (deleted+blocked+suspended) surfaces the deleted message first — deterministic ladder", async () => {
      await runInRollback(async tx => {
        const multiFlagged = await createTestUser(tx, {
          role: "admin",
          isDeleted: true,
          isBlocked: true,
          suspended: true,
        });
        const logSpy = silenceDomainLog();

        const error = await expectRepoError(() =>
          PlatformAnalyticsService.getPlatformAnalytics(multiFlagged.id, LOCALE, tx)
        );

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toContain(tErrors.accountDeleted);
        expect(logSpy).toHaveBeenCalledTimes(1);
      });
    });

    test("live admin resolves the full snapshot shape through the caller tx — silently, zero writes", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const logSpy = silenceDomainLog();

        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        expect(snapshot.generatedAt).toBeInstanceOf(Date);
        expect(snapshot.users.totalCount).toBeGreaterThanOrEqual(1);
        expect(snapshot.users.recentlyActive24h).toBeGreaterThanOrEqual(0);
        expect(snapshot.sessions).toEqual(
          expect.objectContaining({ total: expect.any(Number), awaitingConfirmation: expect.any(Number) })
        );
        expect(snapshot.revenue.offlineActivationsCount).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(snapshot.revenue.gatewayRevenueByCurrency)).toBe(true);
        expect(snapshot.subscriptions).toEqual(expect.objectContaining({ total: expect.any(Number) }));
        expect(snapshot.teachers).toEqual(
          expect.objectContaining({ certifiedCount: expect.any(Number), onlineNowCount: expect.any(Number) })
        );
        expect(snapshot.ratings.sessionRatingsCount).toBeGreaterThanOrEqual(0);
        expect(snapshot.health).toEqual(
          expect.objectContaining({ pendingDisputes: expect.any(Number), pendingWithdrawals: expect.any(Number) })
        );
        expect(snapshot.sessionTrendDaily).toHaveLength(TREND_BUCKET_COUNT);
        expect(snapshot.revenueTrendDaily.length % TREND_BUCKET_COUNT).toBe(0);
        expect(logSpy).not.toHaveBeenCalled();
      });
    });

    test("production path (no caller tx) resolves through the top-level transaction", async () => {
      const admin = await db.transaction(async tx => createTestUser(tx, { role: "admin" }));
      committedAdminId = admin.id;

      const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(committedAdminId, LOCALE);

      expect(snapshot.generatedAt).toBeInstanceOf(Date);
      expect(snapshot.sessionTrendDaily).toHaveLength(TREND_BUCKET_COUNT);
      expect(snapshot.users.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Tier 2 — single-`now` propagation and composition pins", () => {
    test("every windowed read receives the IDENTICAL now; all eleven reads share ONE tx; generatedAt is that instant", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const nowCaptures: Date[] = [];
        const txCaptures: unknown[] = [];
        stubAggregateReads(nowCaptures, txCaptures);

        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        // Six windowed methods, each called exactly once, each bound to the
        // SAME `now` reference the service captured and returned as generatedAt.
        expect(nowCaptures).toHaveLength(6);
        const capturedNow = nowCaptures[0];
        if (!capturedNow) {
          throw new Error("expected the windowed reads to capture the snapshot instant");
        }
        for (const captured of nowCaptures) {
          expect(captured).toBe(capturedNow);
        }
        expect(snapshot.generatedAt).toBe(capturedNow);

        // Eleven reads (getStats + ten analytics methods) share ONE handle.
        expect(txCaptures).toHaveLength(11);
        const sharedTx = txCaptures[0];
        if (!sharedTx) {
          throw new Error("expected the aggregate reads to share one transaction handle");
        }
        for (const captured of txCaptures) {
          expect(captured).toBe(sharedTx);
        }
      });
    });

    test("users composition: the ten directory counters flow verbatim plus recentlyActive24h", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const nowCaptures: Date[] = [];
        const txCaptures: unknown[] = [];
        const spies = stubAggregateReads(nowCaptures, txCaptures);

        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        expect(spies.getStats).toHaveBeenCalledTimes(1);
        expect(snapshot.users).toEqual({ ...USER_STATS_ROW, recentlyActive24h: 7 });
        expect(snapshot.users.totalCount).toBe(USER_STATS_ROW.totalCount);
        expect(snapshot.users.activeCount).toBe(USER_STATS_ROW.activeCount);
        expect(snapshot.users.suspendedCount).toBe(USER_STATS_ROW.suspendedCount);
        expect(snapshot.users.blockedCount).toBe(USER_STATS_ROW.blockedCount);
        expect(snapshot.users.deletedCount).toBe(USER_STATS_ROW.deletedCount);
        expect(snapshot.users.adminsCount).toBe(USER_STATS_ROW.adminsCount);
        expect(snapshot.users.teachersCount).toBe(USER_STATS_ROW.teachersCount);
        expect(snapshot.users.studentsCount).toBe(USER_STATS_ROW.studentsCount);
        expect(snapshot.users.parentsCount).toBe(USER_STATS_ROW.parentsCount);
        expect(snapshot.users.newThisWeekCount).toBe(USER_STATS_ROW.newThisWeekCount);
        expect(snapshot.users.recentlyActive24h).toBe(7);
        expect(snapshot.sessions).toEqual(SESSIONS_ROW);
        expect(snapshot.subscriptions).toEqual(SUBSCRIPTIONS_ROW);
        expect(snapshot.teachers).toEqual(TEACHERS_ROW);
        expect(snapshot.ratings).toEqual(RATINGS_ROW);
        expect(snapshot.health).toEqual(HEALTH_ROW);
        expect(snapshot.revenue).toEqual({ gatewayRevenueByCurrency: [], offlineActivationsCount: 3 });
      });
    });
  });

  describe("Tier 3 — trend-assembly chaos", () => {
    test("sparse session trend zero-fills the full 30-bucket UTC-midnight skeleton ending at the read day", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const nowCaptures: Date[] = [];
        const txCaptures: unknown[] = [];
        const spies = stubAggregateReads(nowCaptures, txCaptures);
        spies.sessionTrend.mockImplementation(async now => {
          nowCaptures.push(now);
          const dayStart = utcDayStart(now);
          return [
            { bucketStart: dayStart, sessionCount: 4 },
            { bucketStart: new Date(dayStart.getTime() - 3 * DAY_MS), sessionCount: 2 },
          ];
        });

        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        const capturedNow = nowCaptures[0];
        if (!capturedNow) {
          throw new Error("expected the trend read to capture the snapshot instant");
        }
        const lastDayMs = utcDayStart(capturedNow).getTime();
        const sparseByDay = new Map([
          [lastDayMs, 4],
          [lastDayMs - 3 * DAY_MS, 2],
        ]);

        expect(snapshot.sessionTrendDaily).toHaveLength(TREND_BUCKET_COUNT);
        snapshot.sessionTrendDaily.forEach((point, index) => {
          const bucketMs = lastDayMs - (TREND_BUCKET_COUNT - 1 - index) * DAY_MS;
          expect(point.bucketStart.getTime()).toBe(bucketMs);
          expect(point.sessionCount).toBe(sparseByDay.get(bucketMs) ?? 0);
        });
        expect(snapshot.sessionTrendDaily[TREND_BUCKET_COUNT - 1]?.sessionCount).toBe(4);
      });
    });

    test("sparse-empty trend inputs → 30 zero-filled session buckets and an honestly EMPTY revenue series", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const nowCaptures: Date[] = [];
        const txCaptures: unknown[] = [];
        stubAggregateReads(nowCaptures, txCaptures);

        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        const capturedNow = nowCaptures[0];
        if (!capturedNow) {
          throw new Error("expected the trend reads to capture the snapshot instant");
        }
        const lastDayMs = utcDayStart(capturedNow).getTime();

        expect(snapshot.sessionTrendDaily).toHaveLength(TREND_BUCKET_COUNT);
        snapshot.sessionTrendDaily.forEach((point, index) => {
          expect(point.bucketStart.getTime()).toBe(lastDayMs - (TREND_BUCKET_COUNT - 1 - index) * DAY_MS);
          expect(point.sessionCount).toBe(0);
        });
        expect(snapshot.revenueTrendDaily).toEqual([]);
      });
    });

    test("multi-currency revenue expands day-major and currency-ascending with exact zero fills; all-time-only currency excluded", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const nowCaptures: Date[] = [];
        const txCaptures: unknown[] = [];
        const spies = stubAggregateReads(nowCaptures, txCaptures);
        const revenueRows = [
          { currency: "EGP", totalAmount: "100.00", last30DaysAmount: "13.50", paidPaymentsCount: 2 },
          { currency: "GBP", totalAmount: "70.00", last30DaysAmount: "0", paidPaymentsCount: 1 },
        ];
        spies.revenueStats.mockImplementation(async () => revenueRows);
        spies.revenueTrend.mockImplementation(async now => {
          const dayStart = utcDayStart(now);
          const points: PlatformAnalyticsRevenueTrendPointReturnType[] = [
            { bucketStart: dayStart, currency: "USD", amount: "5.25" },
            { bucketStart: new Date(dayStart.getTime() - 2 * DAY_MS), currency: "EGP", amount: "10.50" },
            { bucketStart: dayStart, currency: "EGP", amount: "3.00" },
          ];
          return points;
        });

        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        const capturedNow = nowCaptures[0];
        if (!capturedNow) {
          throw new Error("expected the trend reads to capture the snapshot instant");
        }
        const lastDayMs = utcDayStart(capturedNow).getTime();
        const amountByDayAndCurrency = new Map([
          [`${lastDayMs}|EGP`, "3.00"],
          [`${lastDayMs}|USD`, "5.25"],
          [`${lastDayMs - 2 * DAY_MS}|EGP`, "10.50"],
        ]);

        // 30 days × the window's TWO currencies — day-major, currency-ascending.
        expect(snapshot.revenueTrendDaily).toHaveLength(TREND_BUCKET_COUNT * 2);
        expect(new Set(snapshot.revenueTrendDaily.map(point => point.currency))).toEqual(new Set(["EGP", "USD"]));
        snapshot.revenueTrendDaily.forEach((point, index) => {
          const bucketMs = lastDayMs - (TREND_BUCKET_COUNT - 1 - Math.floor(index / 2)) * DAY_MS;
          const currency = index % 2 === 0 ? "EGP" : "USD";
          expect(point.bucketStart.getTime()).toBe(bucketMs);
          expect(point.currency).toBe(currency);
          expect(point.amount).toBe(amountByDayAndCurrency.get(`${bucketMs}|${currency}`) ?? "0");
        });
        expect(snapshot.revenueTrendDaily[TREND_BUCKET_COUNT * 2 - 1]).toEqual({
          bucketStart: new Date(lastDayMs),
          currency: "USD",
          amount: "5.25",
        });

        // The gateway rows pass through verbatim — GBP exists all-time but
        // never fabricates a trend point.
        expect(snapshot.revenue.gatewayRevenueByCurrency).toEqual(revenueRows);
      });
    });
  });

  describe("Tier 3 — snapshot purity", () => {
    test("the composite read leaves every observed table byte-identical (content digests)", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const observedTables = [
          "users",
          "session",
          "student_payments",
          "subscriptions",
          "teacher",
          "evaluations",
          "reports",
          "teacher_transaction",
        ] as const;
        const digestTable = async (table: string): Promise<string> => {
          const result = await tx.execute<{ digest: string }>(
            sql`select coalesce(md5(string_agg(row_text, '|' order by id)), '')::text as digest
                  from (select id, to_jsonb(observed)::text as row_text from ${sql.identifier(table)} observed) as digest_source`
          );
          return result.rows[0]?.digest ?? "";
        };

        const before = new Map(await Promise.all(observedTables.map(async t => [t, await digestTable(t)] as const)));
        await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);
        const after = new Map(await Promise.all(observedTables.map(async t => [t, await digestTable(t)] as const)));

        for (const table of observedTables) {
          expect(after.get(table)).toBe(before.get(table));
        }
      });
    });
  });

  describe("Tier 4 — denial pre-DB proof and silence", () => {
    test("aggregate repo spies receive ZERO calls on every denial path; exactly one gate log per denial", async () => {
      await runInRollback(async tx => {
        const student = await createTestUser(tx, { role: "student" });
        const suspendedAdmin = await createTestUser(tx, { role: "admin", suspended: true });
        const absentId = await absentUserId(tx);
        const denialActorIds = [ANONYMOUS_ACTOR_ID, absentId, student.id, suspendedAdmin.id];

        const aggregateSpies = spyAggregateReads();
        const logSpy = silenceDomainLog();

        const denialErrors = await Promise.all(
          denialActorIds.map(actorId =>
            expectRepoError(() => PlatformAnalyticsService.getPlatformAnalytics(actorId, LOCALE, tx))
          )
        );
        expect(denialErrors).toHaveLength(denialActorIds.length);
        for (const spy of aggregateSpies) {
          expect(spy).not.toHaveBeenCalled();
        }
        expect(logSpy).toHaveBeenCalledTimes(denialActorIds.length);
      });
    });

    test("anonymous denial is pre-DB — the gate's actor lookup never fires", async () => {
      await runInRollback(async tx => {
        await createTestUser(tx, { role: "admin" });
        const readSpy = spyActorRead();
        const aggregateSpies = spyAggregateReads();

        await expectRepoError(() => PlatformAnalyticsService.getPlatformAnalytics(ANONYMOUS_ACTOR_ID, LOCALE, tx));

        expect(readSpy).not.toHaveBeenCalled();
        for (const spy of aggregateSpies) {
          expect(spy).not.toHaveBeenCalled();
        }
      });
    });

    test("happy path is silent — zero domain logs on a successful composite read", async () => {
      await runInRollback(async tx => {
        const admin = await createTestUser(tx, { role: "admin" });
        const logSpy = silenceDomainLog();
        const aggregateSpies = spyAggregateReads();

        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        expect(snapshot.generatedAt).toBeInstanceOf(Date);
        for (const spy of aggregateSpies) {
          expect(spy).toHaveBeenCalledTimes(1);
        }
        expect(logSpy).not.toHaveBeenCalled();
      });
    });
  });
});
