/**
 * Analytics namespace labels — the admin platform-analytics dashboard
 * (`/admin/analytics`).
 *
 * Used by:
 *  - `PlatformAnalyticsContainer` + all analytics view components
 *    (`useAppTranslation(Analytics)`; every user-facing string is a
 *    property access on this handle — REQ-066, incl. chart aria-labels
 *    per review finding F-1).
 *  - `app/(dashboard)/admin/analytics/page.tsx` `generateMetadata`
 *    (metaTitle / metaDescription).
 *
 * Slot naming: counter labels are SECTION-QUALIFIED where the same word
 * would otherwise collide across sections (e.g. `totalUsersLabel` vs
 * `totalSessionsLabel`, `cancelledSessionsLabel` vs
 * `cancelledSubscriptionsLabel`, `certifiedTeachersLabel` vs
 * `teachersOnlineNowLabel`) so every key is unambiguous at the call site.
 *
 * All keys MUST have both `en` and `ar` implementations; the sole
 * function-valued leaf is `lastUpdatedLabel` (pre-formatted instant in).
 */
export interface AnalyticsLabels {
  // ── Metadata + page header ────────────────────────────────────────────
  /** Next.js metadata title for `/admin/analytics` */
  readonly metaTitle: string;
  /** Next.js metadata description for `/admin/analytics` */
  readonly metaDescription: string;
  /** Page header title */
  readonly title: string;
  /** Page header subtitle */
  readonly subtitle: string;

  // ── Section titles (one per metrics card) ─────────────────────────────
  /** Users section title */
  readonly usersSection: string;
  /** Sessions section title */
  readonly sessionsSection: string;
  /** Revenue section title */
  readonly revenueSection: string;
  /** Subscriptions section title */
  readonly subscriptionsSection: string;
  /** Teachers section title */
  readonly teachersSection: string;
  /** Ratings section title */
  readonly ratingsSection: string;
  /** Operational-health section title */
  readonly healthSection: string;

  // ── Users counters (section-qualified) ────────────────────────────────
  /** Total user accounts */
  readonly totalUsersLabel: string;
  /** Active (non-governed) user accounts */
  readonly activeUsersLabel: string;
  /** Suspended user accounts */
  readonly suspendedUsersLabel: string;
  /** Blocked user accounts */
  readonly blockedUsersLabel: string;
  /** Soft-deleted user accounts */
  readonly deletedUsersLabel: string;
  /** Admin-role accounts */
  readonly adminsCountLabel: string;
  /** Teacher-role accounts */
  readonly teachersCountLabel: string;
  /** Student-role accounts */
  readonly studentsCountLabel: string;
  /** Parent-role accounts */
  readonly parentsCountLabel: string;
  /** Accounts created within the trailing 7-day window */
  readonly newThisWeekUsersLabel: string;
  /** Accounts whose last activity falls within the trailing 24-hour window */
  readonly recentlyActive24hLabel: string;

  // ── Sessions counters (section-qualified) ─────────────────────────────
  /** Total sessions ever created */
  readonly totalSessionsLabel: string;
  /** Sessions created today (UTC day boundary) */
  readonly sessionsTodayLabel: string;
  /** Sessions created this ISO week (Monday UTC) */
  readonly sessionsThisWeekLabel: string;
  /** Sessions created this month (first-of-month UTC) */
  readonly sessionsThisMonthLabel: string;
  /** Sessions in `scheduled` status */
  readonly scheduledSessionsLabel: string;
  /** Sessions in `started` status */
  readonly startedSessionsLabel: string;
  /** Sessions in `completed` status */
  readonly completedSessionsLabel: string;
  /** Sessions in `cancelled` status */
  readonly cancelledSessionsLabel: string;
  /** Sessions in `disputed` status */
  readonly disputedSessionsLabel: string;
  /** Completed sessions not yet confirmed by the student */
  readonly awaitingConfirmationLabel: string;

  // ── Revenue (per-currency table headers + honesty counter) ────────────
  /** Per-currency table: currency code column header */
  readonly currencyHeader: string;
  /** Per-currency table: all-time gateway amount column header */
  readonly totalAmountHeader: string;
  /** Per-currency table: trailing-30-day gateway amount column header */
  readonly last30DaysAmountHeader: string;
  /** Per-currency table: paid-payment count column header */
  readonly paidPaymentsCountHeader: string;
  /** Offline activations honesty counter (never folded into revenue) */
  readonly offlineActivationsLabel: string;

  // ── Subscriptions counters (section-qualified) ────────────────────────
  /** Total subscriptions */
  readonly totalSubscriptionsLabel: string;
  /** Subscriptions in `active` status */
  readonly activeSubscriptionsLabel: string;
  /** Subscriptions in `pending` status */
  readonly pendingSubscriptionsLabel: string;
  /** Subscriptions in `expired` status */
  readonly expiredSubscriptionsLabel: string;
  /** Subscriptions in `cancelled` status */
  readonly cancelledSubscriptionsLabel: string;
  /** Subscriptions in `suspended` status */
  readonly suspendedSubscriptionsLabel: string;
  /** Subscriptions inside the ACTIVE window at the snapshot instant */
  readonly activeInWindowNowLabel: string;

  // ── Teacher presence ──────────────────────────────────────────────────
  /** Certified (approved) teacher rows */
  readonly certifiedTeachersLabel: string;
  /** Certified teachers flagged as evaluators */
  readonly evaluatorTeachersLabel: string;
  /** Certified teachers currently online */
  readonly teachersOnlineNowLabel: string;

  // ── Ratings (two honest families) ─────────────────────────────────────
  /** Average post-session student rating (0–5; null when empty) */
  readonly averageSessionRatingLabel: string;
  /** Count of session ratings the average spans */
  readonly sessionRatingsCountLabel: string;
  /** Average evaluation score (0–100; null when empty) */
  readonly averageEvaluationScoreLabel: string;
  /** Count of evaluation scores the average spans */
  readonly evaluationScoresCountLabel: string;

  // ── Operational health ────────────────────────────────────────────────
  /** Sessions in `disputed` status awaiting resolution */
  readonly pendingDisputesLabel: string;
  /** Withdrawal transactions awaiting payout */
  readonly pendingWithdrawalsLabel: string;

  // ── Trend charts ──────────────────────────────────────────────────────
  /** Sessions trend chart title (30 daily buckets) */
  readonly sessionTrendTitle: string;
  /** Revenue trend chart title (30 daily buckets per currency) */
  readonly revenueTrendTitle: string;
  /** Trend granularity caption (daily) */
  readonly dailyLabel: string;
  /** Trend chart date-axis label */
  readonly dateAxisLabel: string;
  /** Revenue trend chart amount-axis label */
  readonly amountAxisLabel: string;
  /** Sessions trend chart series label */
  readonly sessionsSeriesLabel: string;
  /** Sessions trend chart accessible name (F-1: a11y via namespace) */
  readonly sessionTrendAriaLabel: string;
  /** Revenue trend chart accessible name (F-1: a11y via namespace) */
  readonly revenueTrendAriaLabel: string;

  // ── Honest empty states ───────────────────────────────────────────────
  /** Empty gateway-revenue placeholder (never a fabricated zero row) */
  readonly noRevenueYet: string;
  /** Empty-ratings placeholder (averages render honest nulls) */
  readonly noRatingsYet: string;
  /** All-zero 30-day trend window placeholder (honest emptiness, never fabricated data) */
  readonly trendEmptyLabel: string;

  // ── Refresh / status actions ──────────────────────────────────────────
  /** Manual refresh button label */
  /** Snapshot CSV export button label (client-side serialization of the ALREADY-fetched snapshot) */
  readonly exportAction: string;
  readonly refreshAction: string;
  /** In-flight refresh caption (stale data stays on screen) */
  readonly refreshingLabel: string;
  /** Last-updated stamp — composes over a PRE-FORMATTED instant string */
  readonly lastUpdatedLabel: (at: string) => string;
  /** Load-error retry CTA */
  readonly retryAction: string;

  // ── Load-error + denied states ────────────────────────────────────────
  /** Load-error alert title */
  readonly loadErrorTitle: string;
  /** Load-error alert body (raw server text is never rendered) */
  readonly loadErrorBody: string;
  /** Denied (governed reader) notice title */
  readonly deniedTitle: string;
  /** Denied (governed reader) notice body */
  readonly deniedBody: string;
}
