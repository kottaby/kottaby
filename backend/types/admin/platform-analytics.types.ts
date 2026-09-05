import type { AdminUserStatsReturnType } from "@/backend/types/admin/admin-user.types";

/**
 * `PlatformAnalyticsUsersReturnType` — users section of the platform
 * analytics snapshot. Composes the existing `AdminUserStatsReturnType`
 * directory counters verbatim (never re-declared) with the 24-hour
 * presence counter: users whose `lastActiveAt` falls inside the trailing
 * 24-hour window ending at the snapshot instant, excluding governed
 * (deleted/blocked/suspended) accounts from the active-presence figure.
 */
export type PlatformAnalyticsUsersReturnType = AdminUserStatsReturnType & {
  readonly recentlyActive24h: number;
};

/**
 * `PlatformAnalyticsSessionsReturnType` — platform-wide session counters.
 * The window counters (`today`, `thisWeek`, `thisMonth`) are UTC-bounded
 * slices of `total` measured from the snapshot instant. The five status
 * counters follow the `session_status` lifecycle (scheduled → started →
 * completed, with cancelled and disputed as exits). `awaitingConfirmation`
 * counts sessions that reached `completed` but are not yet confirmed by
 * the student — a lifecycle-derived state, not an enum member.
 */
export interface PlatformAnalyticsSessionsReturnType {
  readonly total: number;
  readonly today: number;
  readonly thisWeek: number;
  readonly thisMonth: number;
  readonly scheduled: number;
  readonly started: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly disputed: number;
  readonly awaitingConfirmation: number;
}

/**
 * `PlatformAnalyticsCurrencyRevenueReturnType` — paid `student_payments`
 * revenue for ONE currency. Amounts are exact decimal strings (never JS
 * numbers) so engine float rounding can never alter a monetary value.
 * `totalAmount` spans all time; `last30DaysAmount` spans the trailing
 * 30-day window ending at the snapshot instant. Currencies are never
 * merged — each code carries its own row.
 */
export interface PlatformAnalyticsCurrencyRevenueReturnType {
  readonly currency: string;
  readonly totalAmount: string;
  readonly last30DaysAmount: string;
  readonly paidPaymentsCount: number;
}

/**
 * `PlatformAnalyticsRevenueReturnType` — revenue section. Per-currency
 * gateway revenue rows plus the offline-activations honesty counter:
 * subscriptions activated through offline payment methods never produce a
 * `student_payments` row, so they are reported as a separate count and
 * never folded into the monetary totals.
 */
export interface PlatformAnalyticsRevenueReturnType {
  readonly gatewayRevenueByCurrency: readonly PlatformAnalyticsCurrencyRevenueReturnType[];
  readonly offlineActivationsCount: number;
}

/**
 * `PlatformAnalyticsSubscriptionsReturnType` — subscription counters. The
 * five status counters cover the `subscription_status` enum exactly.
 * `activeInWindowNow` counts subscriptions whose ACTIVE-window predicate
 * holds at the captured instant: status `active`, started (or defaulting
 * to now when the start date is absent), and not yet ended (or open-ended).
 */
export interface PlatformAnalyticsSubscriptionsReturnType {
  readonly total: number;
  readonly active: number;
  readonly pending: number;
  readonly expired: number;
  readonly cancelled: number;
  readonly suspended: number;
  readonly activeInWindowNow: number;
}

/**
 * `PlatformAnalyticsTeachersReturnType` — teacher-population headline
 * counters. `certifiedCount` counts approved teacher rows; `evaluatorCount`
 * counts evaluator-flagged rows; `onlineNowCount` counts certified teachers
 * currently flagged online (an uncertified teacher is never "online now").
 */
export interface PlatformAnalyticsTeachersReturnType {
  readonly certifiedCount: number;
  readonly evaluatorCount: number;
  readonly onlineNowCount: number;
}

/**
 * `PlatformAnalyticsRatingsReturnType` — quality-signal averages with
 * honest absence. Averages are `null` when no rows exist in the band (no
 * fabricated zero — "no ratings yet" is distinct from "rated zero").
 * `averageSessionRating` averages the 0–5 session report ratings;
 * `averageEvaluationScore` averages the 0–100 evaluation scores of
 * non-deleted evaluations. The paired counts expose the sample size
 * behind each average.
 */
export interface PlatformAnalyticsRatingsReturnType {
  readonly averageSessionRating: number | null;
  readonly sessionRatingsCount: number;
  readonly averageEvaluationScore: number | null;
  readonly evaluationScoresCount: number;
}

/**
 * `PlatformAnalyticsHealthReturnType` — operational backlog indicators:
 * sessions currently in the `disputed` state awaiting resolution, and
 * withdrawal transactions still `pending` payout.
 */
export interface PlatformAnalyticsHealthReturnType {
  readonly pendingDisputes: number;
  readonly pendingWithdrawals: number;
}

/**
 * `PlatformAnalyticsSessionTrendPointReturnType` — one daily bucket of the
 * 30-day session trend. `bucketStart` is the midnight-UTC instant the
 * bucket covers (exposed through the DateTime scalar); `sessionCount` is
 * the number of sessions created in that UTC day.
 */
export interface PlatformAnalyticsSessionTrendPointReturnType {
  readonly bucketStart: Date;
  readonly sessionCount: number;
}

/**
 * `PlatformAnalyticsRevenueTrendPointReturnType` — one (day, currency)
 * bucket of the 30-day revenue trend. `bucketStart` is the midnight-UTC
 * instant the bucket covers (exposed through the DateTime scalar);
 * `amount` is the exact decimal-string sum of that currency's paid
 * payments in that UTC day — currencies stay in separate points.
 */
export interface PlatformAnalyticsRevenueTrendPointReturnType {
  readonly bucketStart: Date;
  readonly currency: string;
  readonly amount: string;
}

/**
 * `PlatformAnalyticsReturnType` — the full read-only platform analytics
 * snapshot. `generatedAt` is the single captured snapshot instant (the
 * one `now` from which every window boundary and trend skeleton derives,
 * exposed through the DateTime scalar); all sections and trend arrays
 * hang off that same instant so no two counters can disagree on time.
 */
export interface PlatformAnalyticsReturnType {
  readonly generatedAt: Date;
  readonly users: PlatformAnalyticsUsersReturnType;
  readonly sessions: PlatformAnalyticsSessionsReturnType;
  readonly revenue: PlatformAnalyticsRevenueReturnType;
  readonly subscriptions: PlatformAnalyticsSubscriptionsReturnType;
  readonly teachers: PlatformAnalyticsTeachersReturnType;
  readonly ratings: PlatformAnalyticsRatingsReturnType;
  readonly health: PlatformAnalyticsHealthReturnType;
  readonly sessionTrendDaily: readonly PlatformAnalyticsSessionTrendPointReturnType[];
  readonly revenueTrendDaily: readonly PlatformAnalyticsRevenueTrendPointReturnType[];
}
