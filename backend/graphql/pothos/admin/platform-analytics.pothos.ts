/**
 * Platform analytics GraphQL objects — the whole-platform snapshot read
 * model for the admin analytics dashboard.
 *
 * Every object is an EMBEDDED value object backed by a canonical type from
 * `backend/types/admin/`:
 *  - `PlatformAnalytics` ← `PlatformAnalyticsReturnType` (root snapshot)
 *  - `PlatformAnalyticsUsers` ← `PlatformAnalyticsUsersReturnType`
 *  - `PlatformAnalyticsSessions` ← `PlatformAnalyticsSessionsReturnType`
 *  - `PlatformAnalyticsRevenue` ← `PlatformAnalyticsRevenueReturnType`
 *  - `PlatformAnalyticsCurrencyRevenue` ← `PlatformAnalyticsCurrencyRevenueReturnType`
 *  - `PlatformAnalyticsSubscriptions` ← `PlatformAnalyticsSubscriptionsReturnType`
 *  - `PlatformAnalyticsTeachers` ← `PlatformAnalyticsTeachersReturnType`
 *  - `PlatformAnalyticsRatings` ← `PlatformAnalyticsRatingsReturnType`
 *  - `PlatformAnalyticsHealth` ← `PlatformAnalyticsHealthReturnType`
 *  - `PlatformAnalyticsSessionTrendPoint` ← `PlatformAnalyticsSessionTrendPointReturnType`
 *  - `PlatformAnalyticsRevenueTrendPoint` ← `PlatformAnalyticsRevenueTrendPointReturnType`
 *
 * Aggregate anonymity: the shapes carry NO `id` field anywhere — every
 * object is a scalar-only (or scalar-only children) envelope the Apollo
 * cache never normalizes as an entity, so no per-row identity can leak
 * through the aggregate surface. Each field is a pure projection of the
 * service-composed snapshot (no resolve-time data access, no second reads,
 * no N+1).
 *
 * Instant fields (`generatedAt`, both `bucketStart`s) ride the registered
 * `DateTime` scalar by name — never hand-serialized `String` projections —
 * and monetary amounts cross as the exact decimal `string`s the service
 * emits (no numeric coercion on the wire).
 *
 * Per `backend/graphql/pothos/AGENTS.md`:
 *  - NO local type definitions — all shapes come from `backend/types/**`.
 *  - List fields are plain `t.field({ type: [Ref] })` projections over the
 *    snapshot arrays (no `t.loadable` — the parent is a single resolved
 *    snapshot, not a per-row entity).
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

/**
 * `PlatformAnalyticsUsers` — user-population counters: the directory
 * aggregate plus the 24-hour presence headline. Pure counters, no identity.
 */
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

/**
 * `PlatformAnalyticsSessions` — platform-wide session counters. The window
 * counters are UTC-bounded slices of `total` measured from the snapshot
 * instant; `awaitingConfirmation` is the lifecycle-derived completed-but-
 * unconfirmed state.
 */
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

/**
 * `PlatformAnalyticsCurrencyRevenue` — paid gateway revenue for ONE
 * currency. Amounts are exact decimal strings (never JS numbers) and
 * currencies are never merged — each code carries its own row.
 */
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

/**
 * `PlatformAnalyticsRevenue` — revenue section: per-currency gateway rows
 * plus the offline-activations honesty counter (offline activations never
 * fold into the monetary totals).
 */
export const PlatformAnalyticsRevenuePothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsRevenueReturnType>("PlatformAnalyticsRevenue")
  .implement({
    fields: t => ({
      gatewayRevenueByCurrency: t.field({
        type: [PlatformAnalyticsCurrencyRevenuePothosObject],
        resolve: parent => [...parent.gatewayRevenueByCurrency],
      }),
      offlineActivationsCount: t.exposeInt("offlineActivationsCount"),
    }),
  });

/**
 * `PlatformAnalyticsSubscriptions` — subscription counters. The five status
 * counters cover the subscription status vocabulary exactly;
 * `activeInWindowNow` applies the ACTIVE-window predicate at the captured
 * instant.
 */
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

/**
 * `PlatformAnalyticsTeachers` — teacher-population headline counters.
 * `onlineNowCount` is a subset of `certifiedCount` (an uncertified teacher
 * is never "online now").
 */
export const PlatformAnalyticsTeachersPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsTeachersReturnType>("PlatformAnalyticsTeachers")
  .implement({
    fields: t => ({
      certifiedCount: t.exposeInt("certifiedCount"),
      evaluatorCount: t.exposeInt("evaluatorCount"),
      onlineNowCount: t.exposeInt("onlineNowCount"),
    }),
  });

/**
 * `PlatformAnalyticsRatings` — quality-signal averages with honest absence:
 * the averages are `null` when the band has no rows ("no ratings yet" is
 * distinct from "rated zero"), and the paired counts expose the sample size
 * behind each average. These are the ONLY nullable fields on the surface.
 */
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

/**
 * `PlatformAnalyticsHealth` — operational backlog indicators: sessions in
 * the disputed state awaiting resolution and withdrawal transactions still
 * pending payout.
 */
export const PlatformAnalyticsHealthPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsHealthReturnType>("PlatformAnalyticsHealth")
  .implement({
    fields: t => ({
      pendingDisputes: t.exposeInt("pendingDisputes"),
      pendingWithdrawals: t.exposeInt("pendingWithdrawals"),
    }),
  });

/**
 * `PlatformAnalyticsSessionTrendPoint` — one daily bucket of the 30-day
 * session trend. `bucketStart` is the midnight-UTC instant the bucket
 * covers, exposed through the `DateTime` scalar; absent days were
 * zero-filled by the service, never fabricated here.
 */
export const PlatformAnalyticsSessionTrendPointPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsSessionTrendPointReturnType>("PlatformAnalyticsSessionTrendPoint")
  .implement({
    fields: t => ({
      bucketStart: t.expose("bucketStart", { type: "DateTime" }),
      sessionCount: t.exposeInt("sessionCount"),
    }),
  });

/**
 * `PlatformAnalyticsRevenueTrendPoint` — one (day, currency) bucket of the
 * 30-day revenue trend. `amount` is the exact decimal-string sum for that
 * currency in that UTC day; currencies stay in separate points, and the
 * series is honestly empty when the window observed no currency.
 */
export const PlatformAnalyticsRevenueTrendPointPothosObject = gqlSchemaBuilder
  .objectRef<PlatformAnalyticsRevenueTrendPointReturnType>("PlatformAnalyticsRevenueTrendPoint")
  .implement({
    fields: t => ({
      bucketStart: t.expose("bucketStart", { type: "DateTime" }),
      currency: t.exposeString("currency"),
      amount: t.exposeString("amount"),
    }),
  });

/**
 * `PlatformAnalytics` — the root snapshot. Every section and both trend
 * arrays hang off the single captured `generatedAt` instant, so no two
 * counters on this surface can disagree on time. Sections are pure
 * projections of the service-composed snapshot — zero resolve-time data
 * access, zero N+1 (one service call resolves the whole tree).
 */
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
        resolve: parent => [...parent.sessionTrendDaily],
      }),
      revenueTrendDaily: t.field({
        type: [PlatformAnalyticsRevenueTrendPointPothosObject],
        resolve: parent => [...parent.revenueTrendDaily],
      }),
    }),
  });
