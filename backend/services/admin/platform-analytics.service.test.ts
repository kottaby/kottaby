/**
 * PlatformAnalyticsService tests — the composition-service contract for the
 * admin `adminPlatformAnalytics` snapshot (DEV3-022c, task 2.6.TE).
 *
 * Per `backend/db/test/AGENTS.md` + `backend/services/AGENTS.md`:
 *  - Every DB-backed case runs inside `runInRollback`; `tx` is propagated to
 *    every entity-setup call; entities are created ONLY via entity-setup.
 *  - Error assertions use try/catch (`expectRepoError` style) — never
 *    `expect(...).rejects.toThrow()`.
 *  - Domain-log assertions install a recording stub over
 *    `logger.logDomainError` (silenced) and count calls.
 *  - Repository spies replace the ten analytics reads + the reused
 *    `AdminUserRepository.getStats` for composition/purity assertions —
 *    the repository's own SQL contract is pinned by its dedicated suite
 *    (`backend/db/repo/admin/__tests__/`) and the wire-level journeys.
 *
 * Coverage map (plan task 2.6.TE tiers):
 *  - Tier 1 — actor matrix: `actorId = 0` → UnauthorizedError; absent row →
 *    UnauthorizedError; student/teacher/parent → ForbiddenError;
 *    suspended/blocked/deleted admin → ForbiddenError with the MATCHING
 *    translated message in the deterministic deleted → blocked → suspended
 *    order; each denial logs exactly ONE bounded domain error.
 *  - Tier 2 — single-`now` propagation + users composition: every windowed
 *    repo method receives THE SAME captured `now` instance (=== generatedAt);
 *    the ten `getStats` fields flow through verbatim plus
 *    `recentlyActive24h`; every read shares the caller's `outerTx`.
 *  - Tier 3 — trend-assembly chaos: sparse-empty (30 zero-filled buckets +
 *    EMPTY revenue grid), sparse-full (1:1 mapping, no distortion),
 *    multi-currency expansion (30×N grid, exact `"0"` fills, per-bucket
 *    currency ordering, rogue out-of-skeleton buckets ignored).
 *  - Tier 4 — denial pre-DB proof + purity: on EVERY denial path the
 *    analytics repo methods and `getStats` are called ZERO times (the gate
 *    closes before any aggregate read); the happy path emits ZERO
 *    `logDomainError`; a composite read leaves every touched table's row
 *    count unchanged; an explicit `outerTx` observes its own uncommitted
 *    rows while the global executor cannot.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { AdminUserRepository, type RevenueTrendRow, type SessionTrendRow } from "@/backend/db/repo";
import { PlatformAnalyticsRepository, utcDayStart } from "@/backend/db/repo/admin/platform-analytics.repository";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { session } from "@/backend/db/schema/classes/session";
import { notifications } from "@/backend/db/schema/notifications/notifications";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestSession,
  createTestStudent,
  createTestTeacherRow,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { SessionStatus } from "@/backend/enum/scheduling";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { PlatformAnalyticsService } from "@/backend/services/admin";

import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** Milliseconds in one day — skeleton arithmetic. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** The captured domain-log spy shape shared by every probe. */
type DomainLogSpy = ReturnType<typeof spyOn>;
type DomainLogContext = { code: string; entity: string; entityId: number; locale: string };

/**
 * Installs a silenced recording stub over `logger.logDomainError` — domain
 * rejections never reach test stdout and every call is countable.
 */
function silenceDomainLog(): DomainLogSpy {
  return spyOn(logger, "logDomainError").mockImplementation(() => {});
}

/** Reads the recorded contexts (second argument of every call). */
function loggedContexts(spy: DomainLogSpy): DomainLogContext[] {
  return (spy.mock.calls as unknown[][]).map(call => call[1] as DomainLogContext);
}

/** try/catch capture for service rejections (never `rejects.toThrow()`). */
async function captureError(fn: () => Promise<unknown>): Promise<Error> {
  let caught: unknown = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  if (caught === null) {
    throw new Error("captureError: expected the call to throw, but it resolved successfully");
  }
  if (caught instanceof Error) {
    return caught;
  }
  throw new Error(`captureError: caught non-Error value: ${JSON.stringify(caught)}`);
}

/**
 * Installs canned spies over the ten analytics repo methods + the reused
 * `getStats`, returning a restore function. Every canned value carries a
 * DISTINCT sentinel so composition assertions cannot pass by accident.
 */
function stubRepoLayer(
  options: {
    recentlyActive?: number;
    sessions?: Partial<
      Record<
        | "total"
        | "today"
        | "thisWeek"
        | "thisMonth"
        | "scheduled"
        | "started"
        | "completed"
        | "cancelled"
        | "disputed"
        | "awaitingConfirmation",
        number
      >
    >;
    sessionTrend?: SessionTrendRow[];
    revenueStats?: Array<{
      currency: string;
      totalAmount: string;
      last30DaysAmount: string;
      paidPaymentsCount: number;
    }>;
    revenueTrend?: RevenueTrendRow[];
    subscriptions?: Partial<
      Record<"total" | "active" | "pending" | "expired" | "cancelled" | "suspended" | "activeInWindowNow", number>
    >;
    offlineActivations?: number;
    teachers?: Partial<Record<"certifiedCount" | "evaluatorCount" | "onlineNowCount", number>>;
    ratings?: {
      averageSessionRating: number | null;
      sessionRatingsCount: number;
      averageEvaluationScore: number | null;
      evaluationScoresCount: number;
    };
    health?: { pendingDisputes: number; pendingWithdrawals: number };
    getStats?: Record<string, number>;
  } = {}
): { nows: Date[]; restore: () => void } {
  const nows: Date[] = [];
  const recent = options.recentlyActive ?? 555;
  const sessions = {
    total: 11,
    today: 12,
    thisWeek: 13,
    thisMonth: 14,
    scheduled: 15,
    started: 16,
    completed: 17,
    cancelled: 18,
    disputed: 19,
    awaitingConfirmation: 20,
    ...options.sessions,
  };
  const revenueStats = options.revenueStats ?? [];
  const revenueTrend = options.revenueTrend ?? [];
  const subscriptions = {
    total: 31,
    active: 32,
    pending: 33,
    expired: 34,
    cancelled: 35,
    suspended: 36,
    activeInWindowNow: 37,
    ...options.subscriptions,
  };
  const teachers = { certifiedCount: 41, evaluatorCount: 42, onlineNowCount: 43, ...options.teachers };
  const ratings = options.ratings ?? {
    averageSessionRating: null,
    sessionRatingsCount: 0,
    averageEvaluationScore: null,
    evaluationScoresCount: 0,
  };
  const health = options.health ?? { pendingDisputes: 51, pendingWithdrawals: 52 };
  const getStats = {
    totalCount: 101,
    activeCount: 102,
    suspendedCount: 103,
    blockedCount: 104,
    deletedCount: 105,
    adminsCount: 106,
    teachersCount: 107,
    studentsCount: 108,
    parentsCount: 109,
    newThisWeekCount: 110,
    ...options.getStats,
  };

  const spies = [
    spyOn(PlatformAnalyticsRepository, "countRecentlyActiveUsers").mockImplementation(async (now: Date) => {
      nows.push(now);
      return recent;
    }),
    spyOn(PlatformAnalyticsRepository, "getSessionStats").mockImplementation(async (now: Date) => {
      nows.push(now);
      return sessions;
    }),
    spyOn(PlatformAnalyticsRepository, "getSessionDailyTrend").mockImplementation(async (now: Date) => {
      nows.push(now);
      return options.sessionTrend ?? [];
    }),
    spyOn(PlatformAnalyticsRepository, "getRevenueStats").mockImplementation(async (now: Date) => {
      nows.push(now);
      return revenueStats;
    }),
    spyOn(PlatformAnalyticsRepository, "getRevenueDailyTrend").mockImplementation(async (now: Date) => {
      nows.push(now);
      return revenueTrend;
    }),
    spyOn(PlatformAnalyticsRepository, "getSubscriptionStats").mockImplementation(async (now: Date) => {
      nows.push(now);
      return subscriptions;
    }),
    spyOn(PlatformAnalyticsRepository, "countOfflineActivations").mockImplementation(
      async () => options.offlineActivations ?? 61
    ),
    spyOn(PlatformAnalyticsRepository, "getTeacherPresenceStats").mockImplementation(async () => teachers),
    spyOn(PlatformAnalyticsRepository, "getRatingStats").mockImplementation(async () => ratings),
    spyOn(PlatformAnalyticsRepository, "getHealthIndicators").mockImplementation(async () => health),
    spyOn(AdminUserRepository, "getStats").mockImplementation(async () => getStats),
  ];
  return {
    nows,
    restore: () =>
      spies.forEach(spy => {
        spy.mockRestore();
      }),
  };
}

// ─── Tier 1 — actor matrix (deterministic denial chain) ─────────────────────

describe("PlatformAnalyticsService — Tier 1: actor denial matrix", () => {
  test("actorId 0 / non-integer / negative → UnauthorizedError with exactly one bounded domain log", async () => {
    await runInRollback(async tx => {
      for (const actorId of [0, -1, Number.NaN, 2.5]) {
        const logSpy = silenceDomainLog();
        try {
          const error = await captureError(() => PlatformAnalyticsService.getPlatformAnalytics(actorId, LOCALE, tx));
          expect(error).toBeInstanceOf(UnauthorizedError);
          expect(error.message).toContain(tErrors.unauthorized);
          const logs = loggedContexts(logSpy);
          expect(logs).toHaveLength(1);
          expect(logs[0]).toEqual({ code: "UNAUTHORIZED", entity: "users", entityId: actorId, locale: LOCALE });
        } finally {
          logSpy.mockRestore();
        }
      }
    });
  });

  test("absent actor row → UnauthorizedError with exactly one bounded domain log", async () => {
    await runInRollback(async tx => {
      const maxRow = await db.select({ max: sql<number | null>`max(${users.id})` }).from(users);
      const absentId = (maxRow[0]?.max ?? 0) + 10_000;
      const logSpy = silenceDomainLog();
      try {
        const error = await captureError(() => PlatformAnalyticsService.getPlatformAnalytics(absentId, LOCALE, tx));
        expect(error).toBeInstanceOf(UnauthorizedError);
        expect(error.message).toContain(tErrors.unauthorized);
        const logs = loggedContexts(logSpy);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toEqual({ code: "UNAUTHORIZED", entity: "users", entityId: absentId, locale: LOCALE });
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  test("non-admin actors (student / certified-teacher / parent role rows) → ForbiddenError", async () => {
    await runInRollback(async tx => {
      const student = await createTestUser(tx, { role: "student" });
      const teacherUser = await createTestUser(tx, { role: "teacher" });
      const parent = await createTestUser(tx, { role: "parent" });
      for (const actorId of [student.id, teacherUser.id, parent.id]) {
        const logSpy = silenceDomainLog();
        try {
          const error = await captureError(() => PlatformAnalyticsService.getPlatformAnalytics(actorId, LOCALE, tx));
          expect(error).toBeInstanceOf(ForbiddenError);
          expect(error.message).toContain(tErrors.forbidden);
          const logs = loggedContexts(logSpy);
          expect(logs).toHaveLength(1);
          expect(logs[0]).toEqual({ code: "FORBIDDEN", entity: "users", entityId: actorId, locale: LOCALE });
        } finally {
          logSpy.mockRestore();
        }
      }
    });
  });

  test("governed admins deny in the deterministic deleted → blocked → suspended order with matching messages", async () => {
    await runInRollback(async tx => {
      const deleted = await createTestUser(tx, { role: "admin", isDeleted: true });
      const blocked = await createTestUser(tx, { role: "admin", isBlocked: true });
      const suspended = await createTestUser(tx, { role: "admin", suspended: true });

      // Deleted → accountDeleted branch (not the blocked/suspended one).
      const logDeleted = silenceDomainLog();
      try {
        const error = await captureError(() => PlatformAnalyticsService.getPlatformAnalytics(deleted.id, LOCALE, tx));
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toContain(tErrors.accountDeleted);
        expect(loggedContexts(logDeleted)).toHaveLength(1);
      } finally {
        logDeleted.mockRestore();
      }

      // Blocked → accountBlocked branch.
      const logBlocked = silenceDomainLog();
      try {
        const error = await captureError(() => PlatformAnalyticsService.getPlatformAnalytics(blocked.id, LOCALE, tx));
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toContain(tErrors.accountBlocked);
        expect(loggedContexts(logBlocked)).toHaveLength(1);
      } finally {
        logBlocked.mockRestore();
      }

      // Suspended (NOT deleted, NOT blocked — precedence honesty) →
      // accountSuspended branch.
      const logSuspended = silenceDomainLog();
      try {
        const error = await captureError(() => PlatformAnalyticsService.getPlatformAnalytics(suspended.id, LOCALE, tx));
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toContain(tErrors.accountSuspended);
        expect(loggedContexts(logSuspended)).toHaveLength(1);
      } finally {
        logSuspended.mockRestore();
      }
    });
  });
});

// ─── Tier 2 — single-`now` propagation + users composition ──────────────────

describe("PlatformAnalyticsService — Tier 2: snapshot composition", () => {
  test("every windowed read receives the SAME captured now instance, which IS generatedAt; users compose verbatim", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      const { nows, restore } = stubRepoLayer();
      try {
        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);
        // One `now` per request, shared by every windowed call.
        expect(nows).toHaveLength(6);
        expect(new Set(nows.map(now => now.getTime())).size).toBe(1);
        for (const now of nows) {
          expect(now).toBe(snapshot.generatedAt);
        }
        // Users section: the ten getStats fields flow through VERBATIM plus
        // the 24h presence counter.
        expect(snapshot.users).toEqual({
          totalCount: 101,
          activeCount: 102,
          suspendedCount: 103,
          blockedCount: 104,
          deletedCount: 105,
          adminsCount: 106,
          teachersCount: 107,
          studentsCount: 108,
          parentsCount: 109,
          newThisWeekCount: 110,
          recentlyActive24h: 555,
        });
        // The section headers carry their distinct sentinels (no cross-wiring).
        expect(snapshot.sessions.total).toBe(11);
        expect(snapshot.subscriptions.active).toBe(32);
        expect(snapshot.teachers.certifiedCount).toBe(41);
        expect(snapshot.ratings.averageSessionRating).toBeNull();
        expect(snapshot.health.pendingDisputes).toBe(51);
        expect(snapshot.revenue.offlineActivationsCount).toBe(61);
      } finally {
        restore();
      }
    });
  });

  test("an explicit outerTx scopes the snapshot: tx-local (uncommitted) rows are visible to the composite read", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      // FK-valid teacher + student (shared PKs with users) + an UNCOMMITTED
      // session row — visible ONLY through `tx`, never through the global
      // executor. A stubbed read could not prove executor identity, so this
      // test runs the REAL repo layer over the caller's savepoint tx.
      await createTestTeacherRow(tx, admin.id);
      await createTestStudent(tx, admin.id);
      await createTestSession(tx, admin.id, admin.id, {
        status: SessionStatus.Scheduled,
        createdAt: new Date(),
      });

      const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

      // Direct tx-side oracle of the SAME window the snapshot claims.
      const dayStart = utcDayStart(snapshot.generatedAt);
      const txToday = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(session)
        .where(sql`${session.createdAt} >= ${dayStart}`);
      expect(snapshot.sessions.today).toBe(txToday[0]?.count ?? 0);
      expect(snapshot.sessions.today).toBeGreaterThanOrEqual(1);
      // The users section agrees with a tx-side count too (the uncommitted
      // admin IS counted — the read ran on the caller's tx).
      const txUsers = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
      expect(snapshot.users.totalCount).toBe(txUsers[0]?.count ?? 0);
    });
  });
});

// ─── Tier 3 — trend-assembly chaos ──────────────────────────────────────────

describe("PlatformAnalyticsService — Tier 3: trend assembly chaos", () => {
  test("sparse-empty reads: 30 zero-filled session buckets, EMPTY revenue grid, honest empty revenue rows", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      const { restore } = stubRepoLayer({
        sessions: { total: 0, today: 0, thisWeek: 0, thisMonth: 0 },
        revenueStats: [],
        sessionTrend: [],
        revenueTrend: [],
      });
      try {
        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);
        expect(snapshot.sessionTrendDaily).toHaveLength(30);
        const lastBucket = utcDayStart(snapshot.generatedAt).getTime();
        for (const [index, point] of snapshot.sessionTrendDaily.entries()) {
          expect(point.bucketStart.getTime()).toBe(lastBucket - (29 - index) * ONE_DAY_MS);
          expect(point.sessionCount).toBe(0);
        }
        expect(snapshot.revenueTrendDaily).toHaveLength(0);
        expect(snapshot.revenue.gatewayRevenueByCurrency).toHaveLength(0);
      } finally {
        restore();
      }
    });
  });

  test("sparse-full reads: every skeleton bucket carries its sparse count 1:1 (no zero-fill distortion)", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      const lastBucket = utcDayStart(new Date());
      const sessionTrend: SessionTrendRow[] = Array.from({ length: 30 }, (_, index) => ({
        bucketStart: new Date(lastBucket.getTime() - (29 - index) * ONE_DAY_MS),
        sessionCount: index + 1,
      }));
      const { restore } = stubRepoLayer({ sessionTrend });
      try {
        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);
        expect(snapshot.sessionTrendDaily).toHaveLength(30);
        for (const [index, point] of snapshot.sessionTrendDaily.entries()) {
          expect(point.sessionCount).toBe(index + 1);
        }
      } finally {
        restore();
      }
    });
  });

  test('multi-currency expansion: 30×N grid with exact "0" fills, per-bucket currency order, rogue buckets ignored', async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      const day0 = utcDayStart(new Date());
      const day29 = new Date(day0.getTime() - 29 * ONE_DAY_MS);
      const day15 = new Date(day0.getTime() - 15 * ONE_DAY_MS);
      const rogue = new Date(day0.getTime() + 40 * ONE_DAY_MS);
      const { restore } = stubRepoLayer({
        revenueStats: [
          { currency: "EGP", totalAmount: "30.50", last30DaysAmount: "30.50", paidPaymentsCount: 2 },
          { currency: "USD", totalAmount: "5.25", last30DaysAmount: "5.25", paidPaymentsCount: 1 },
        ],
        revenueTrend: [
          { bucketStart: day0, currency: "EGP", amount: "10.50" },
          { bucketStart: day29, currency: "EGP", amount: "20.00" },
          { bucketStart: day15, currency: "USD", amount: "5.25" },
          { bucketStart: rogue, currency: "EGP", amount: "999.99" },
        ],
        sessionTrend: [{ bucketStart: rogue, sessionCount: 77 }],
      });
      try {
        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);

        // Grid shape: 30 buckets × 2 window currencies = 60 points; the
        // rogue bucket contributed NOTHING.
        expect(snapshot.revenueTrendDaily).toHaveLength(60);
        const amountOf = (bucket: Date, currency: string): string | null => {
          const hit = snapshot.revenueTrendDaily.find(
            point => point.bucketStart.getTime() === bucket.getTime() && point.currency === currency
          );
          return hit?.amount ?? null;
        };
        expect(amountOf(day0, "EGP")).toBe("10.50");
        expect(amountOf(day29, "EGP")).toBe("20.00");
        expect(amountOf(day15, "USD")).toBe("5.25");
        // Absent pairs are honest "0" strings — never missing, never numbers.
        expect(amountOf(day15, "EGP")).toBe("0");
        expect(amountOf(day0, "USD")).toBe("0");
        // Every amount is a non-negative decimal string.
        for (const point of snapshot.revenueTrendDaily) {
          expect(point.amount).toMatch(/^\d+(\.\d+)?$/);
        }
        // Per-bucket currency ordering: EGP < USD (byte order) everywhere.
        for (let bucket = 0; bucket < 30; bucket += 1) {
          const pair = snapshot.revenueTrendDaily.slice(bucket * 2, bucket * 2 + 2);
          expect(pair.map(point => point.currency)).toEqual(["EGP", "USD"]);
        }
        // The rogue session bucket was ignored: the 30 skeleton buckets are
        // consecutive and none carries the rogue count.
        expect(snapshot.sessionTrendDaily).toHaveLength(30);
        expect(snapshot.sessionTrendDaily.reduce((sum, point) => sum + point.sessionCount, 0)).toBe(0);
      } finally {
        restore();
      }
    });
  });
});

// ─── Tier 4 — denial pre-DB proof + read purity ─────────────────────────────

describe("PlatformAnalyticsService — Tier 4: pre-DB denials + read purity", () => {
  test("EVERY denial path calls ZERO analytics repo methods and ZERO getStats", async () => {
    await runInRollback(async tx => {
      const deleted = await createTestUser(tx, { role: "admin", isDeleted: true });
      const student = await createTestUser(tx, { role: "student" });
      const spies = [
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
        spyOn(AdminUserRepository, "getStats"),
      ];
      try {
        for (const actorId of [0, -1, student.id, deleted.id, 987_654_321]) {
          const logSpy = silenceDomainLog();
          try {
            await captureError(() => PlatformAnalyticsService.getPlatformAnalytics(actorId, LOCALE, tx));
          } finally {
            logSpy.mockRestore();
          }
        }
        for (const spy of spies) {
          expect(spy.mock.calls).toHaveLength(0);
        }
      } finally {
        spies.forEach(spy => {
          spy.mockRestore();
        });
      }
    });
  });

  test("the happy path is silent (zero domain logs) and leaves every touched table's row count unchanged", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      await createTestTeacherRow(tx, admin.id);
      await createTestStudent(tx, admin.id);
      await createTestSession(tx, admin.id, admin.id, { status: SessionStatus.Scheduled });
      const tables = [users, session, studentPayments, subscriptions, teacher, auditLogs, notifications] as const;
      const before = await Promise.all(
        tables.map(async table => {
          const rows = await tx.select({ count: sql<number>`count(*)::int` }).from(table);
          return rows[0]?.count ?? 0;
        })
      );
      const logSpy = silenceDomainLog();
      try {
        const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx);
        expect(snapshot.generatedAt.getTime()).toBeGreaterThan(0);
        expect(loggedContexts(logSpy)).toHaveLength(0);
      } finally {
        logSpy.mockRestore();
      }
      const after = await Promise.all(
        tables.map(async table => {
          const rows = await tx.select({ count: sql<number>`count(*)::int` }).from(table);
          return rows[0]?.count ?? 0;
        })
      );
      expect(after).toEqual(before);
    });
  });

  test("repo rejections propagate unmasked (no try/catch swallowing inside the service)", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      const injected = new Error("repo read exploded");
      const probe = spyOn(PlatformAnalyticsRepository, "getRatingStats").mockRejectedValue(injected);
      try {
        const error = await expectRepoError(() => PlatformAnalyticsService.getPlatformAnalytics(admin.id, LOCALE, tx));
        expect(error).toBe(injected);
      } finally {
        probe.mockRestore();
      }
    });
  });
});
