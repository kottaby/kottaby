/**
 * Platform analytics GraphQL objects — the admin `adminPlatformAnalytics`
 * snapshot projection (DEV3-022c).
 *
 * Every object is backed by a canonical type from `backend/types/admin/
 * platform-analytics.types.ts` — NO local type definitions (REQ-004). The
 * full SDL contract lives in the plan (§3.1) and is pinned by
 * `backend/graphql/test/sdl-static-assertions.test.ts` +
 * `schema-surface.test.ts` after codegen.
 *
 * Embedded-value contract (D10): NO `id` is exposed anywhere in this
 * subtree — the snapshot is an anonymous whole-platform aggregate, and the
 * root object is a value object read through ONE zero-argument query.
 * Apollo cache normalization is handled by the frontend cache registration
 * (keyFields: false), not by an id field here.
 *
 * Money crosses as EXACT decimal strings (`String!` — REQ-014/D3);
 * timestamps ride the registered `DateTime` scalar (REQ-068 — no
 * `.toISOString()` hand-serialization anywhere in this file).
 *
 * Per `backend/graphql/pothos/AGENTS.md`:
 *  - All fields PROJECT the service-composed snapshot — zero resolve-time
 *    data access, no N+1, no second reads (read-model purity).
 *  - Enums: none (D7 — no new enum joins; currency/method surfaces are
 *    plain `String`).
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import type {
  PlatformAnalyticsCurrencyRevenueReturnType,
  PlatformAnalyticsHealthReturnType,
  PlatformAnalyticsRatingsReturnType,
  PlatformAnalyticsReturnType,
  PlatformAnalyticsRevenueReturnType,
  PlatformAnalyticsRevenueTrendPointReturnType,
  PlatformAnalyticsSessionsReturnType,
  PlatformAnalyticsSessionTrendPointReturnType,
  PlatformAnalyticsSubscriptionsReturnType,
  PlatformAnalyticsTeachersReturnType,
  PlatformAnalyticsUsersReturnType,
} from "@/backend/types";

/** `PlatformAnalyticsUsers` — ten reused admin-user counters + the 24h presence counter. */
export const PlatformAnalyticsUsersPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsUsersReturnType>("PlatformAnalyticsUsers")
  .implement({
    fields: t => ({
      totalCount: t.exposeInt("totalCount"),
      activeCount: t.exposeInt("activeCount"),
      suspendedCount: t.exposeInt("suspendedCount"),
      blockedCount: t.exposeInt("blockedCount"),
      deletedCount: t.exposeInt("deletedCount"),
      adminsCount: t.exposeInt("adminsCount"),
      teachersCount: t.exposeInt("teachersCount"),
      studentsCount: t.exposeInt("studentsCount"),
      parentsCount: t.exposeInt("parentsCount"),
      newThisWeekCount: t.exposeInt("newThisWeekCount"),
      recentlyActive24h: t.exposeInt("recentlyActive24h"),
    }),
  });

/** `PlatformAnalyticsSessions` — the sessions lifecycle counters. */
export const PlatformAnalyticsSessionsPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsSessionsReturnType>("PlatformAnalyticsSessions")
  .implement({
    fields: t => ({
      total: t.exposeInt("total"),
      today: t.exposeInt("today"),
      thisWeek: t.exposeInt("thisWeek"),
      thisMonth: t.exposeInt("thisMonth"),
      scheduled: t.exposeInt("scheduled"),
      started: t.exposeInt("started"),
      completed: t.exposeInt("completed"),
      cancelled: t.exposeInt("cancelled"),
      disputed: t.exposeInt("disputed"),
      awaitingConfirmation: t.exposeInt("awaitingConfirmation"),
    }),
  });

/** `PlatformAnalyticsCurrencyRevenue` — one per-currency revenue row (money = exact strings). */
export const PlatformAnalyticsCurrencyRevenuePothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsCurrencyRevenueReturnType>("PlatformAnalyticsCurrencyRevenue")
  .implement({
    fields: t => ({
      currency: t.exposeString("currency"),
      totalAmount: t.exposeString("totalAmount"),
      last30DaysAmount: t.exposeString("last30DaysAmount"),
      paidPaymentsCount: t.exposeInt("paidPaymentsCount"),
    }),
  });

/** `PlatformAnalyticsRevenue` — per-currency gateway rows + the offline-activation counter. */
export const PlatformAnalyticsRevenuePothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsRevenueReturnType>("PlatformAnalyticsRevenue")
  .implement({
    fields: t => ({
      gatewayRevenueByCurrency: t.field({
        type: [PlatformAnalyticsCurrencyRevenuePothosObject],
        resolve: parent => parent.gatewayRevenueByCurrency,
      }),
      offlineActivationsCount: t.exposeInt("offlineActivationsCount"),
    }),
  });

/** `PlatformAnalyticsSubscriptions` — the status distribution + ACTIVE-window counter. */
export const PlatformAnalyticsSubscriptionsPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsSubscriptionsReturnType>("PlatformAnalyticsSubscriptions")
  .implement({
    fields: t => ({
      total: t.exposeInt("total"),
      active: t.exposeInt("active"),
      pending: t.exposeInt("pending"),
      expired: t.exposeInt("expired"),
      cancelled: t.exposeInt("cancelled"),
      suspended: t.exposeInt("suspended"),
      activeInWindowNow: t.exposeInt("activeInWindowNow"),
    }),
  });

/** `PlatformAnalyticsTeachers` — certified / evaluator / online presence counters. */
export const PlatformAnalyticsTeachersPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsTeachersReturnType>("PlatformAnalyticsTeachers")
  .implement({
    fields: t => ({
      certifiedCount: t.exposeInt("certifiedCount"),
      evaluatorCount: t.exposeInt("evaluatorCount"),
      onlineNowCount: t.exposeInt("onlineNowCount"),
    }),
  });

/** `PlatformAnalyticsRatings` — honest nullable averages (REQ-060) + non-null-only counts. */
export const PlatformAnalyticsRatingsPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsRatingsReturnType>("PlatformAnalyticsRatings")
  .implement({
    fields: t => ({
      averageSessionRating: t.exposeFloat("averageSessionRating", { nullable: true }),
      sessionRatingsCount: t.exposeInt("sessionRatingsCount"),
      averageEvaluationScore: t.exposeFloat("averageEvaluationScore", { nullable: true }),
      evaluationScoresCount: t.exposeInt("evaluationScoresCount"),
    }),
  });

/** `PlatformAnalyticsHealth` — disputed sessions + pending withdrawals. */
export const PlatformAnalyticsHealthPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsHealthReturnType>("PlatformAnalyticsHealth")
  .implement({
    fields: t => ({
      pendingDisputes: t.exposeInt("pendingDisputes"),
      pendingWithdrawals: t.exposeInt("pendingWithdrawals"),
    }),
  });

/** `PlatformAnalyticsSessionTrendPoint` — one zero-filled daily session bucket. */
export const PlatformAnalyticsSessionTrendPointPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsSessionTrendPointReturnType>("PlatformAnalyticsSessionTrendPoint")
  .implement({
    fields: t => ({
      bucketStart: t.expose("bucketStart", { type: "DateTime" }),
      sessionCount: t.exposeInt("sessionCount"),
    }),
  });

/** `PlatformAnalyticsRevenueTrendPoint` — one (day, currency) revenue bucket (money = exact string). */
export const PlatformAnalyticsRevenueTrendPointPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsRevenueTrendPointReturnType>("PlatformAnalyticsRevenueTrendPoint")
  .implement({
    fields: t => ({
      bucketStart: t.expose("bucketStart", { type: "DateTime" }),
      currency: t.exposeString("currency"),
      amount: t.exposeString("amount"),
    }),
  });

/** `PlatformAnalytics` — the whole-platform snapshot root (anonymous aggregate — no id, D10). */
export const PlatformAnalyticsPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsReturnType>("PlatformAnalytics")
  .implement({
    fields: t => ({
      generatedAt: t.expose("generatedAt", { type: "DateTime" }),
      users: t.field({ type: PlatformAnalyticsUsersPothosObject, resolve: parent => parent.users }),
      sessions: t.field({ type: PlatformAnalyticsSessionsPothosObject, resolve: parent => parent.sessions }),
      revenue: t.field({ type: PlatformAnalyticsRevenuePothosObject, resolve: parent => parent.revenue }),
      subscriptions: t.field({
        type: PlatformAnalyticsSubscriptionsPothosObject,
        resolve: parent => parent.subscriptions,
      }),
      teachers: t.field({ type: PlatformAnalyticsTeachersPothosObject, resolve: parent => parent.teachers }),
      ratings: t.field({ type: PlatformAnalyticsRatingsPothosObject, resolve: parent => parent.ratings }),
      health: t.field({ type: PlatformAnalyticsHealthPothosObject, resolve: parent => parent.health }),
      sessionTrendDaily: t.field({
        type: [PlatformAnalyticsSessionTrendPointPothosObject],
        resolve: parent => parent.sessionTrendDaily,
      }),
      revenueTrendDaily: t.field({
        type: [PlatformAnalyticsRevenueTrendPointPothosObject],
        resolve: parent => parent.revenueTrendDaily,
      }),
    }),
  });
