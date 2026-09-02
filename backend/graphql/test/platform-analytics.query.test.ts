/**
 * Wire matrix — the `adminPlatformAnalytics` query over the REAL composed
 * schema (DEV3-022c, task 3.3).
 *
 * In-process execution per the `handshake-code-surface.test.ts` pattern:
 * `graphql({ schema: graphQLSchema, … })` runs the actual authScopes engine,
 * the actual resolver, and the actual service/repo stack against the test
 * Postgres — no schema forks, no mocked scopes (`.SR` discipline).
 *
 * The five probes (plan §5 / tasks 3.3):
 *  1. anonymous → `UNAUTHORIZED` PRE-RESOLVER (the resolver body never runs).
 *  2. student / teacher / parent → `FORBIDDEN` PRE-RESOLVER (the `$all`
 *     conjunction: authenticated AND admin — either branch alone denies).
 *  3. ANY argument → GraphQL validation failure pre-resolver (the closed
 *     input surface pin — REQ-034/073; the API error layer maps this to
 *     `GRAPHQL_VALIDATION_FAILED` per docs/graphql/error-handling-contract.md).
 *  4. admin happy path → the full CLOSED shape: every section present exactly
 *     once, every documented leaf present, NO extra fields, `generatedAt`
 *     parses as a DateTime, trend arrays are arrays, rating averages present
 *     and nullable — plus read purity (zero audit/notification deltas).
 *  5. governed admin (deleted) → SERVICE-tier `FORBIDDEN` with a bounded
 *     payload (canonical localized message + `extensions.code` only —
 *     REQ-037 all-or-nothing: `data` carries no partial aggregates).
 *
 * Fixtures: a REAL committed admin (role row + permission-free path — the
 * scope gate reads the ctx we construct, the service re-gates through the
 * REAL user row) and a governed deleted admin, hard-deleted in `afterAll`.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { inArray, sql } from "drizzle-orm";
import { graphql, parse, validate } from "graphql";
import { db } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { notifications } from "@/backend/db/schema/notifications/notifications";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import { createTestAdmin, createTestUser } from "@/backend/db/test/entity-setup";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";
import { logger } from "@/backend/lib/logger";
import { PlatformAnalyticsService } from "@/backend/services/admin";
import type { DBTransaction } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** The full closed selection set — every documented leaf, nothing else. */
const FULL_QUERY = `
  query AdminPlatformAnalytics {
    adminPlatformAnalytics {
      generatedAt
      users { totalCount activeCount suspendedCount blockedCount deletedCount adminsCount teachersCount studentsCount parentsCount newThisWeekCount recentlyActive24h }
      sessions { total today thisWeek thisMonth scheduled started completed cancelled disputed awaitingConfirmation }
      revenue { gatewayRevenueByCurrency { currency totalAmount last30DaysAmount paidPaymentsCount } offlineActivationsCount }
      subscriptions { total active pending expired cancelled suspended activeInWindowNow }
      teachers { certifiedCount evaluatorCount onlineNowCount }
      ratings { averageSessionRating sessionRatingsCount averageEvaluationScore evaluationScoresCount }
      health { pendingDisputes pendingWithdrawals }
      sessionTrendDaily { bucketStart sessionCount }
      revenueTrendDaily { bucketStart currency amount }
    }
  }
`;

/** Runtime record guard (no unsafe assertions, per lint discipline). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Runtime record-array guard. */
function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isRecord);
}

/** The canonical section/leaf shape of the snapshot (the closed-contract pin). */
const OBJECT_SECTIONS: ReadonlyArray<{ readonly key: string; readonly leaves: readonly string[] }> = [
  {
    key: "users",
    leaves: [
      "totalCount",
      "activeCount",
      "suspendedCount",
      "blockedCount",
      "deletedCount",
      "adminsCount",
      "teachersCount",
      "studentsCount",
      "parentsCount",
      "newThisWeekCount",
      "recentlyActive24h",
    ],
  },
  {
    key: "sessions",
    leaves: [
      "total",
      "today",
      "thisWeek",
      "thisMonth",
      "scheduled",
      "started",
      "completed",
      "cancelled",
      "disputed",
      "awaitingConfirmation",
    ],
  },
  { key: "revenue", leaves: ["gatewayRevenueByCurrency", "offlineActivationsCount"] },
  {
    key: "subscriptions",
    leaves: ["total", "active", "pending", "expired", "cancelled", "suspended", "activeInWindowNow"],
  },
  { key: "teachers", leaves: ["certifiedCount", "evaluatorCount", "onlineNowCount"] },
  {
    key: "ratings",
    leaves: ["averageSessionRating", "sessionRatingsCount", "averageEvaluationScore", "evaluationScoresCount"],
  },
  { key: "health", leaves: ["pendingDisputes", "pendingWithdrawals"] },
];

/** The pinned root-section key set (exactly once each — REQ-033 anonymity). */
const ROOT_SECTION_KEYS = [
  "generatedAt",
  "users",
  "sessions",
  "revenue",
  "subscriptions",
  "teachers",
  "ratings",
  "health",
  "sessionTrendDaily",
  "revenueTrendDaily",
] as const;

/** A DateTime-scalar payload: in-process a Date, over the wire an ISO string. */
function parseableInstant(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

let adminId = 0;
let deletedAdminId = 0;
let fixtureUserIds: number[] = [];

/** Minimal wired context: what the scope engine + resolver + service read. */
function wiredContext(userId: number | null, role: UserRole | null): Record<string, unknown> {
  return {
    locale: LOCALE,
    ...(role !== null ? { role } : {}),
    ...(userId !== null ? { user: { id: userId } } : {}),
    t: async <TNamespace extends keyof ReturnType<typeof getServerTranslations>>(namespace: TNamespace) =>
      getServerTranslations(LOCALE)[namespace],
  };
}

beforeAll(async () => {
  const rows = await db.transaction(async (tx: DBTransaction) => {
    const adminUser = await createTestUser(tx, { role: "admin" });
    await createTestAdmin(tx, adminUser.id);
    const deletedUser = await createTestUser(tx, { role: "admin", isDeleted: true });
    await createTestAdmin(tx, deletedUser.id);
    return { adminId: adminUser.id, deletedAdminId: deletedUser.id, ids: [adminUser.id, deletedUser.id] };
  });
  adminId = rows.adminId;
  deletedAdminId = rows.deletedAdminId;
  fixtureUserIds = rows.ids;
});

afterAll(async () => {
  if (fixtureUserIds.length === 0) {
    return;
  }
  // Role-child rows first, then the users rows (no audit/notification rows
  // exist for these fixtures — the purity probe below pins that invariant).
  await db.delete(admin).where(inArray(admin.id, fixtureUserIds));
  await db.delete(users).where(inArray(users.id, fixtureUserIds));
});

// ─── Probe 1+2 — pre-resolver denials through the REAL scope engine ─────────

describe("pre-resolver denials through the real authScopes engine", () => {
  test("anonymous → UNAUTHORIZED; the resolver body NEVER runs", async () => {
    const resolverSpy = spyOn(PlatformAnalyticsService, "getPlatformAnalytics");
    try {
      const outcome = await graphql({
        schema: graphQLSchema,
        source: "{ adminPlatformAnalytics { generatedAt } }",
        contextValue: wiredContext(null, null),
      });
      const errors = outcome.errors;
      if (!errors) {
        throw new Error("anonymous execution must produce exactly one GraphQL error");
      }
      expect(errors).toHaveLength(1);
      expect(errors[0]?.extensions?.code).toBe("UNAUTHORIZED");
      expect(outcome.data?.adminPlatformAnalytics ?? null).toBeNull();
      expect(resolverSpy.mock.calls).toHaveLength(0);
    } finally {
      resolverSpy.mockRestore();
    }
  });

  test.each([[UserRole.Student], [UserRole.Teacher], [UserRole.Parent]])(
    "authenticated %s → FORBIDDEN pre-resolver (the $all conjunction is load-bearing)",
    async role => {
      const resolverSpy = spyOn(PlatformAnalyticsService, "getPlatformAnalytics");
      try {
        const outcome = await graphql({
          schema: graphQLSchema,
          source: "{ adminPlatformAnalytics { generatedAt } }",
          contextValue: wiredContext(1, role),
        });
        const errors = outcome.errors;
        if (!errors) {
          throw new Error("denied execution must produce exactly one GraphQL error");
        }
        expect(errors).toHaveLength(1);
        expect(errors[0]?.extensions?.code).toBe("FORBIDDEN");
        expect(resolverSpy.mock.calls).toHaveLength(0);
      } finally {
        resolverSpy.mockRestore();
      }
    }
  );
});

// ─── Probe 3 — the closed input surface (REQ-034/073) ───────────────────────

describe("closed input surface — ANY argument fails validation pre-resolver", () => {
  test("`adminPlatformAnalytics(filter: { x: 1 })` is a validation failure and never reaches the resolver", () => {
    const smuggled = parse("{ adminPlatformAnalytics(filter: { x: 1 }) { generatedAt } }");
    const errors = validate(graphQLSchema, smuggled);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]?.message).toContain("Unknown argument");
    // The API error layer maps GraphQL validation failures to
    // GRAPHQL_VALIDATION_FAILED (docs/graphql/error-handling-contract.md);
    // in-process validation precedes execution, so there is no extensions
    // payload to pin here — the denial-before-execute is the contract.
  });

  test("the SDL exposes ZERO arguments on adminPlatformAnalytics (static surface pin)", () => {
    const queryType = graphQLSchema.getQueryType();
    if (!queryType) {
      throw new Error("Schema must define a root Query type");
    }
    const field = queryType.getFields().adminPlatformAnalytics;
    if (!field) {
      throw new Error("Schema must register adminPlatformAnalytics");
    }
    expect(field.args).toHaveLength(0);
  });
});

// ─── Probe 4 — admin happy path: the full CLOSED shape + read purity ────────

describe("admin happy path — full closed shape over the live service stack", () => {
  test("every documented leaf resolves; no extra sections; trends are arrays; purity holds", async () => {
    const auditBefore = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
    const notificationsBefore = await db.select({ count: sql<number>`count(*)::int` }).from(notifications);
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    try {
      const outcome = await graphql({
        schema: graphQLSchema,
        source: FULL_QUERY,
        contextValue: wiredContext(adminId, UserRole.Admin),
      });
      expect(outcome.errors ?? []).toHaveLength(0);

      const snapshot = outcome.data?.adminPlatformAnalytics;
      if (!isRecord(snapshot)) {
        throw new Error("admin execution must return the snapshot object");
      }
      const record: Record<string, unknown> = snapshot;

      // Root sections: EXACTLY the documented set (no extra, no missing).
      expect(Object.keys(record).toSorted((a, b) => a.localeCompare(b))).toEqual(
        [...ROOT_SECTION_KEYS].toSorted((a, b) => a.localeCompare(b))
      );

      // generatedAt rides the DateTime scalar — in-process it is a Date
      // instance (the HTTP layer serializes to an ISO string); accept either
      // shape but demand a parseable instant.
      const generatedAt: unknown = record.generatedAt;
      if (typeof generatedAt === "string") {
        expect(Number.isNaN(Date.parse(generatedAt))).toBe(false);
      } else if (generatedAt instanceof Date) {
        expect(Number.isNaN(generatedAt.getTime())).toBe(false);
      } else {
        throw new Error("generatedAt must be a DateTime payload");
      }

      // Every OBJECT section carries EXACTLY its documented leaves (the two
      // trend sections are arrays and are pinned separately below).
      for (const { key, leaves } of OBJECT_SECTIONS) {
        const value = record[key];
        if (!isRecord(value)) {
          throw new Error(`section ${key} must be an object`);
        }
        expect(Object.keys(value).toSorted((a, b) => a.localeCompare(b))).toEqual(
          [...leaves].toSorted((a, b) => a.localeCompare(b))
        );
      }

      // Trends are arrays; the session skeleton is 30 buckets; every trend
      // point is a closed 2/3-leaf object.
      const sessionTrend = record.sessionTrendDaily;
      if (!isRecordArray(sessionTrend)) {
        throw new Error("sessionTrendDaily must be an array of points");
      }
      expect(sessionTrend).toHaveLength(30);
      for (const point of sessionTrend) {
        expect(Object.keys(point).toSorted((a, b) => a.localeCompare(b))).toEqual(["bucketStart", "sessionCount"]);
        expect(parseableInstant(point.bucketStart)).toBe(true);
      }
      const revenueTrend = record.revenueTrendDaily;
      if (!isRecordArray(revenueTrend)) {
        throw new Error("revenueTrendDaily must be an array of points");
      }
      for (const point of revenueTrend) {
        expect(Object.keys(point).toSorted((a, b) => a.localeCompare(b))).toEqual([
          "amount",
          "bucketStart",
          "currency",
        ]);
      }
      // gatewayRevenueByCurrency rows carry exactly their four leaves.
      const revenue = record.revenue;
      if (!isRecord(revenue) || !isRecordArray(revenue.gatewayRevenueByCurrency)) {
        throw new Error("revenue.gatewayRevenueByCurrency must be an array of rows");
      }
      for (const row of revenue.gatewayRevenueByCurrency) {
        expect(Object.keys(row).toSorted((a, b) => a.localeCompare(b))).toEqual([
          "currency",
          "last30DaysAmount",
          "paidPaymentsCount",
          "totalAmount",
        ]);
      }

      // Rating averages are PRESENT and nullable (may be null on a cold
      // platform — honest emptiness, never fabricated 0).
      const ratings = record.ratings;
      if (!isRecord(ratings)) {
        throw new Error("ratings must be an object");
      }
      expect(Object.hasOwn(ratings, "averageSessionRating")).toBe(true);
      expect(Object.hasOwn(ratings, "averageEvaluationScore")).toBe(true);

      // Read purity: zero audit rows, zero notification rows, zero logs.
      const auditAfter = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
      const notificationsAfter = await db.select({ count: sql<number>`count(*)::int` }).from(notifications);
      expect((auditAfter[0]?.count ?? 0) - (auditBefore[0]?.count ?? 0)).toBe(0);
      expect((notificationsAfter[0]?.count ?? 0) - (notificationsBefore[0]?.count ?? 0)).toBe(0);
      expect(logSpy.mock.calls).toHaveLength(0);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("an oversized/deep alias-free selection still resolves through ONE service call (composition pin)", async () => {
    const serviceSpy = spyOn(PlatformAnalyticsService, "getPlatformAnalytics");
    try {
      const outcome = await graphql({
        schema: graphQLSchema,
        source: FULL_QUERY,
        contextValue: wiredContext(adminId, UserRole.Admin),
      });
      expect(outcome.errors ?? []).toHaveLength(0);
      expect(serviceSpy.mock.calls).toHaveLength(1);
      const call = serviceSpy.mock.calls[0] ?? [];
      const [actorId, locale] = call;
      expect(actorId).toBe(adminId);
      expect(locale).toBe(LOCALE);
    } finally {
      serviceSpy.mockRestore();
    }
  });
});

// ─── Probe 5 — governed admin: service-tier denial with a bounded payload ───

describe("governed admin — service-tier FORBIDDEN with bounded error payload", () => {
  test("deleted admin → FORBIDDEN, canonical localized message only, zero partial data", async () => {
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    try {
      const outcome = await graphql({
        schema: graphQLSchema,
        source: FULL_QUERY,
        contextValue: wiredContext(deletedAdminId, UserRole.Admin),
      });
      const errors = outcome.errors;
      if (!errors) {
        throw new Error("governed-admin execution must produce exactly one GraphQL error");
      }
      expect(errors).toHaveLength(1);
      expect(errors[0]?.extensions?.code).toBe("FORBIDDEN");
      expect(errors[0]?.message).toBe(tErrors.accountDeleted);
      // The bounded payload: only the canonical message + extensions.code —
      // and `data` carries NO partial aggregates (all-or-nothing, REQ-037).
      expect(outcome.data?.adminPlatformAnalytics ?? null).toBeNull();
      // Exactly ONE bounded domain log (ids + codes only).
      expect(logSpy.mock.calls).toHaveLength(1);
      expect(logSpy.mock.calls[0]?.[1]).toEqual({
        code: "FORBIDDEN",
        entity: "users",
        entityId: deletedAdminId,
        locale: LOCALE,
      });
    } finally {
      logSpy.mockRestore();
    }
  });

  test("a governed admin PASSES the scope engine and is denied at the SERVICE tier (D8 backstop pin)", async () => {
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    try {
      const outcome = await graphql({
        schema: graphQLSchema,
        source: "{ adminPlatformAnalytics { generatedAt } }",
        contextValue: wiredContext(deletedAdminId, UserRole.Admin),
      });
      // The scope layer's generic denial message differs from the service's
      // TRANSLATED accountDeleted message — the message identity proves the
      // request traversed resolver → service (the governed-reader backstop).
      const errors = outcome.errors;
      if (!errors) {
        throw new Error("governed-admin execution must produce exactly one GraphQL error");
      }
      expect(errors).toHaveLength(1);
      expect(errors[0]?.extensions?.code).toBe("FORBIDDEN");
      expect(errors[0]?.message).toBe(tErrors.accountDeleted);
      expect(logSpy.mock.calls).toHaveLength(1);
    } finally {
      logSpy.mockRestore();
    }
  });
});
