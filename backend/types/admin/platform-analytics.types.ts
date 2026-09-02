/**
 * Platform Analytics canonical types — the closed, id-less contract for the
 * `adminPlatformAnalytics` read model (DEV3-022c).
 *
 * Discipline (per plan §2.2):
 *  - EVERY member is `readonly` — these are embedded value objects, never
 *    mutable entities.
 *  - NO `id` field anywhere in the subtree (aggregate anonymity by
 *    construction — REQ-033/060; D10 embedded-type policy).
 *  - Money crosses the stack as EXACT DECIMAL STRINGS (`string`) — never JS
 *    `number` (REQ-014; D3 float-drift rule).
 *  - Instants destined for the `DateTime` scalar are `Date` (REQ-024/060).
 *  - Status distributions are fixed named `Int!` counters — NO new enums
 *    (D7). No service-layer `.types.ts` exists; this file is the single
 *    canonical home (REQ-004).
 */
import type { AdminUserStatsReturnType } from "@/backend/types/admin/admin-user.types";

/**
 * Users section — the existing ten `AdminUserStatsReturnType` counters
 * reused VERBATIM (composition over modification — D1/REQ-002) plus the
 * B.15 presence counter `recentlyActive24h` (users whose `lastActiveAt`
 * falls within the trailing 24-hour window ending at the captured `now`;
 * non-governed rows only). The DEV3-016 repo is never edited to add it.
 */
export type PlatformAnalyticsUsersReturnType = AdminUserStatsReturnType & {
  readonly recentlyActive24h: number;
};

/**
 * Sessions section — lifecycle counters over the `session` table at the
 * single captured snapshot instant. Window counters (`today`/`thisWeek`/
 * `thisMonth`) filter on `createdAt` against UTC boundaries derived from
 * the captured `now` (UTC-only temporal contract — REQ-024); the five
 * status counters partition nothing (FILTERED counts per `session_status`
 * value) and `awaitingConfirmation` counts `status='completed'` sessions
 * whose `confirmedByStudentAt` is still NULL.
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
 * One per-currency gateway-revenue bucket over paid `student_payments`
 * rows. Money is EXACT decimal strings — never `number` (REQ-014/D3);
 * `totalAmount` spans all paid history while `last30DaysAmount` spans the
 * trailing 30-day window ending at the captured `now`. Cross-currency
 * sums are structurally impossible: buckets are grouped by `currency` and
 * never merged (REQ-023).
 */
export interface PlatformAnalyticsCurrencyRevenueReturnType {
  readonly currency: string;
  readonly totalAmount: string;
  readonly last30DaysAmount: string;
  readonly paidPaymentsCount: number;
}

/**
 * Revenue section — per-currency gateway revenue (REQ-014) plus the
 * offline-activations honesty counter (REQ-015; B.9/INV-PAY5): offline
 * payment methods bypass `student_payments` entirely, so they are counted
 * separately (`countOfflineActivations`) and NEVER folded into revenue.
 */
export interface PlatformAnalyticsRevenueReturnType {
  readonly gatewayRevenueByCurrency: readonly PlatformAnalyticsCurrencyRevenueReturnType[];
  readonly offlineActivationsCount: number;
}

/**
 * Subscriptions section — status distribution over `subscriptions` plus
 * the ACTIVE-window counter mirrored from the admin-user subquery
 * semantics (`status='active' AND coalesce(startDate) <= now AND
 * (endDate IS NULL OR now < endDate)`) with the captured `now` BOUND as a
 * parameter (D2/REQ-016). An expired-but-still-`active`-status row is
 * therefore excluded from `activeInWindowNow`.
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
 * Teacher presence section over the `teacher` table (B.6/B.7): applicants
 * (rows in `applicants` without a `teacher` row) never appear.
 * `certifiedCount` = `isApproved`; `evaluatorCount` = `isEvaluator`;
 * `onlineNowCount` = certified AND `isOnline` at the snapshot instant.
 */
export interface PlatformAnalyticsTeachersReturnType {
  readonly certifiedCount: number;
  readonly evaluatorCount: number;
  readonly onlineNowCount: number;
}

/**
 * Ratings section — two honest families (REQ-018):
 *  - `averageSessionRating`: mean of `reports.studentRatingByTeacher`
 *    (0–5 CHECK band), rounded to exactly 2 decimals server-side; `null`
 *    when the family has zero non-null rows (honest emptiness — never a
 *    fabricated 0).
 *  - `averageEvaluationScore`: mean of `evaluations.score` (0–100 CHECK
 *    band, soft-deleted rows excluded), same rounding + null posture.
 * The `*Count` members count only the non-null rows each average spans.
 */
export interface PlatformAnalyticsRatingsReturnType {
  readonly averageSessionRating: number | null;
  readonly averageEvaluationScore: number | null;
  readonly sessionRatingsCount: number;
  readonly evaluationScoresCount: number;
}

/**
 * Operational health indicators (REQ-019): open dispute and pending
 * withdrawal queues. `pendingDisputes` counts sessions with
 * `status='disputed'`; `pendingWithdrawals` counts `teacher_transaction`
 * rows with `type='withdrawal' AND status='pending'`.
 */
export interface PlatformAnalyticsHealthReturnType {
  readonly pendingDisputes: number;
  readonly pendingWithdrawals: number;
}

/**
 * One 30-day session-trend bucket. `bucketStart` is a midnight-UTC instant
 * (exposed via the `DateTime` scalar — never hand-serialized to a String —
 * REQ-024/060/068); `sessionCount` counts sessions CREATED in
 * `[bucketStart, bucketStart + 1d)` UTC. The service zero-fills the full
 * 30-bucket skeleton; the repository returns sparse rows only (D6).
 */
export interface PlatformAnalyticsSessionTrendPointReturnType {
  readonly bucketStart: Date;
  readonly sessionCount: number;
}

/**
 * One 30-day revenue-trend bucket for ONE currency. `bucketStart` is a
 * midnight-UTC instant; `amount` is an EXACT decimal string (never
 * `number` — REQ-014). Buckets are per (day, currency) — currencies are
 * never merged into a shared bucket (REQ-023); the service expands the
 * sparse rows over the window's currency set with `amount: "0"` fills.
 */
export interface PlatformAnalyticsRevenueTrendPointReturnType {
  readonly bucketStart: Date;
  readonly currency: string;
  readonly amount: string;
}

/**
 * Root analytics snapshot — the full read model returned by
 * `PlatformAnalyticsService.getPlatformAnalytics`. `generatedAt` is THE
 * single captured `now` instant (REQ-011) reused by every windowed repo
 * predicate and the trend skeleton, so per-request skew is structurally
 * impossible (D2). Seven embedded sections + two readonly trend arrays;
 * zero mutation surface — read purity by construction (REQ-022).
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
