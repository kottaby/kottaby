/**
 * Analytics namespace labels — the admin platform-analytics dashboard
 * surface (metric cards, per-currency revenue table, trend charts, refresh
 * affordances, and error/denied/empty states).
 *
 * Used by:
 *  - The admin analytics page shell (`getTranslations(locale)` →
 *    `analyticsTranslations` for the Next.js metadata title/description).
 *  - `PlatformAnalyticsContainer` (`useAppTranslation(Analytics)` for the
 *    page title/subtitle, the seven section titles, every metric label, the
 *    per-currency table headers, the trend chart titles/series/axis labels,
 *    refresh + last-updated captions, the CSV export affordance + CSV column
 *    headers, and the error/denied/empty copy).
 *
 * Metric-label keys map 1:1 onto the platform-analytics read-model counters
 * (users, sessions, revenue, subscriptions, teachers, ratings, health) —
 * the labels render counts only; no metric value is ever embedded in copy.
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves + `analytics-namespace.parity.test.ts`
 * runtime belt). Property access only — never call-by-key.
 */
export interface AnalyticsLabels {
  /** Next.js metadata title for `/admin/analytics`. */
  readonly metaTitle: string;
  /** Next.js metadata description for `/admin/analytics`. */
  readonly metaDescription: string;
  /** Page title. */
  readonly title: string;
  /** Page subtitle — what the snapshot covers. */
  readonly subtitle: string;
  // ─── Section titles (one per metric card) ──────────────────────────────────
  /** Users metric card title. */
  readonly usersSection: string;
  /** Sessions metric card title. */
  readonly sessionsSection: string;
  /** Revenue metric card title. */
  readonly revenueSection: string;
  /** Subscriptions metric card title. */
  readonly subscriptionsSection: string;
  /** Teachers metric card title. */
  readonly teachersSection: string;
  /** Ratings metric card title. */
  readonly ratingsSection: string;
  /** Operational-health metric card title. */
  readonly healthSection: string;
  // ─── Users metric labels ───────────────────────────────────────────────────
  /** Users counter — total accounts. */
  readonly usersTotalLabel: string;
  /** Users counter — active accounts. */
  readonly usersActiveLabel: string;
  /** Users counter — suspended accounts. */
  readonly usersSuspendedLabel: string;
  /** Users counter — blocked accounts. */
  readonly usersBlockedLabel: string;
  /** Users counter — deleted accounts. */
  readonly usersDeletedLabel: string;
  /** Users counter — admin accounts. */
  readonly usersAdminsLabel: string;
  /** Users counter — teacher accounts. */
  readonly usersTeachersLabel: string;
  /** Users counter — student accounts. */
  readonly usersStudentsLabel: string;
  /** Users counter — parent accounts. */
  readonly usersParentsLabel: string;
  /** Users counter — accounts created in the trailing week. */
  readonly usersNewThisWeekLabel: string;
  /** Users counter — accounts active in the trailing 24 hours. */
  readonly recentlyActive24hLabel: string;
  // ─── Sessions metric labels ────────────────────────────────────────────────
  /** Sessions counter — all sessions. */
  readonly sessionsTotalLabel: string;
  /** Sessions counter — sessions on the snapshot day. */
  readonly sessionsTodayLabel: string;
  /** Sessions counter — sessions in the snapshot ISO week. */
  readonly sessionsThisWeekLabel: string;
  /** Sessions counter — sessions in the snapshot month. */
  readonly sessionsThisMonthLabel: string;
  /** Sessions counter — scheduled sessions. */
  readonly sessionsScheduledLabel: string;
  /** Sessions counter — started sessions. */
  readonly sessionsStartedLabel: string;
  /** Sessions counter — completed sessions. */
  readonly sessionsCompletedLabel: string;
  /** Sessions counter — cancelled sessions. */
  readonly sessionsCancelledLabel: string;
  /** Sessions counter — disputed sessions. */
  readonly sessionsDisputedLabel: string;
  /** Sessions counter — completed sessions awaiting confirmation. */
  readonly awaitingConfirmationLabel: string;
  // ─── Revenue labels ────────────────────────────────────────────────────────
  /** Revenue counter — offline (non-gateway) subscription activations. */
  readonly offlineActivationsLabel: string;
  /** Per-currency revenue table header — the currency code column. */
  readonly currencyHeader: string;
  /** Per-currency revenue table header — the lifetime total column. */
  readonly totalAmountHeader: string;
  /** Per-currency revenue table header — the trailing-30-days column. */
  readonly last30DaysAmountHeader: string;
  /** Per-currency revenue table header — the paid-payments count column. */
  readonly paidPaymentsCountHeader: string;
  /** Revenue empty state — no paid revenue exists for any currency. */
  readonly noRevenueYet: string;
  // ─── Subscriptions metric labels ───────────────────────────────────────────
  /** Subscriptions counter — all subscriptions. */
  readonly subscriptionsTotalLabel: string;
  /** Subscriptions counter — active subscriptions. */
  readonly subscriptionsActiveLabel: string;
  /** Subscriptions counter — pending subscriptions. */
  readonly subscriptionsPendingLabel: string;
  /** Subscriptions counter — expired subscriptions. */
  readonly subscriptionsExpiredLabel: string;
  /** Subscriptions counter — cancelled subscriptions. */
  readonly subscriptionsCancelledLabel: string;
  /** Subscriptions counter — suspended subscriptions. */
  readonly subscriptionsSuspendedLabel: string;
  /** Subscriptions counter — inside the ACTIVE window at snapshot time. */
  readonly activeInWindowNowLabel: string;
  // ─── Teachers metric labels ────────────────────────────────────────────────
  /** Teachers counter — certified teachers. */
  readonly teachersCertifiedLabel: string;
  /** Teachers counter — teachers holding evaluator role. */
  readonly teachersEvaluatorsLabel: string;
  /** Teachers counter — teachers online at snapshot time. */
  readonly teachersOnlineNowLabel: string;
  // ─── Ratings labels ────────────────────────────────────────────────────────
  /** Ratings metric — average session rating (honest null when unrated). */
  readonly averageSessionRatingLabel: string;
  /** Ratings counter — session ratings recorded. */
  readonly sessionRatingsCountLabel: string;
  /** Ratings metric — average evaluation score (honest null when unrated). */
  readonly averageEvaluationScoreLabel: string;
  /** Ratings counter — evaluation scores recorded. */
  readonly evaluationScoresCountLabel: string;
  /** Ratings empty state — no ratings exist for either family. */
  readonly noRatingsYet: string;
  // ─── Health metric labels ──────────────────────────────────────────────────
  /** Health counter — disputes awaiting resolution. */
  readonly pendingDisputesLabel: string;
  /** Health counter — withdrawal requests awaiting payout. */
  readonly pendingWithdrawalsLabel: string;
  // ─── Trend charts ──────────────────────────────────────────────────────────
  /** Session-trend chart title (30 daily UTC buckets). */
  readonly sessionTrendTitle: string;
  /** Revenue-trend chart title (daily per-currency buckets). */
  readonly revenueTrendTitle: string;
  /** Session-trend series legend label. */
  readonly sessionsSeriesLabel: string;
  /** Revenue-trend series legend label. */
  readonly revenueSeriesLabel: string;
  /** Trend granularity caption — buckets are daily. */
  readonly dailyLabel: string;
  /** Trend date (x) axis label. */
  readonly trendDateAxisLabel: string;
  /** Trend count (y) axis label for the session trend. */
  readonly trendCountAxisLabel: string;
  /** Trend amount (y) axis label for the revenue trend. */
  readonly trendAmountAxisLabel: string;
  // ─── Refresh + staleness ───────────────────────────────────────────────────
  /** Manual refresh action label. */
  readonly refreshAction: string;
  /** Toolbar export action label — downloads the snapshot as a CSV file. */
  readonly exportCsvAction: string;
  /** CSV metadata header — the snapshot's coherence-stamp column label. */
  readonly csvGeneratedAtHeader: string;
  /** CSV metrics-table column header — the section title column. */
  readonly csvSectionHeader: string;
  /** CSV metrics-table column header — the metric label column. */
  readonly csvMetricHeader: string;
  /** CSV metrics-table column header — the raw value column. */
  readonly csvValueHeader: string;
  /** In-flight refresh indicator label (stale data stays on screen). */
  readonly refreshingLabel: string;
  /**
   * Snapshot staleness caption — receives the pre-formatted snapshot
   * timestamp and composes the "last updated" line over it.
   */
  readonly lastUpdatedLabel: (at: string) => string;
  // ─── Error / denied / retry states ─────────────────────────────────────────
  /** Snapshot load-failure state title. */
  readonly loadErrorTitle: string;
  /** Snapshot load-failure state body (paired with the retry CTA). */
  readonly loadErrorBody: string;
  /** Query-context FORBIDDEN denied-notice title (in-container). */
  readonly deniedTitle: string;
  /** Query-context FORBIDDEN denied-notice body. */
  readonly deniedBody: string;
  /** Load-failure retry action label. */
  readonly retryAction: string;
}
