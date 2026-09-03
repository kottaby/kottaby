import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

/** English leaf map for the `analytics` namespace (73 slots). */
export const analyticsEn: AnalyticsLabels = {
  metaTitle: "Platform Analytics",
  metaDescription:
    "Whole-platform analytics snapshot — users, sessions, revenue by currency, subscriptions, teacher presence, ratings, and operational health.",
  title: "Platform Analytics",
  subtitle: "A live, read-only snapshot of the whole platform.",

  usersSection: "Users",
  sessionsSection: "Sessions",
  revenueSection: "Revenue",
  subscriptionsSection: "Subscriptions",
  teachersSection: "Teachers",
  ratingsSection: "Ratings",
  healthSection: "Operational Health",

  totalUsersLabel: "Total users",
  activeUsersLabel: "Active users",
  suspendedUsersLabel: "Suspended users",
  blockedUsersLabel: "Blocked users",
  deletedUsersLabel: "Deleted users",
  adminsCountLabel: "Admins",
  teachersCountLabel: "Teachers",
  studentsCountLabel: "Students",
  parentsCountLabel: "Parents",
  newThisWeekUsersLabel: "New this week",
  recentlyActive24hLabel: "Active (last 24h)",

  totalSessionsLabel: "Total sessions",
  sessionsTodayLabel: "Sessions today",
  sessionsThisWeekLabel: "Sessions this week",
  sessionsThisMonthLabel: "Sessions this month",
  scheduledSessionsLabel: "Scheduled",
  startedSessionsLabel: "Started",
  completedSessionsLabel: "Completed",
  cancelledSessionsLabel: "Cancelled",
  disputedSessionsLabel: "Disputed",
  awaitingConfirmationLabel: "Awaiting student confirmation",

  currencyHeader: "Currency",
  totalAmountHeader: "Total amount",
  last30DaysAmountHeader: "Last 30 days",
  paidPaymentsCountHeader: "Paid payments",
  offlineActivationsLabel: "Offline activations",

  totalSubscriptionsLabel: "Total subscriptions",
  activeSubscriptionsLabel: "Active subscriptions",
  pendingSubscriptionsLabel: "Pending subscriptions",
  expiredSubscriptionsLabel: "Expired subscriptions",
  cancelledSubscriptionsLabel: "Cancelled subscriptions",
  suspendedSubscriptionsLabel: "Suspended subscriptions",
  activeInWindowNowLabel: "Active in window now",

  certifiedTeachersLabel: "Certified teachers",
  evaluatorTeachersLabel: "Evaluators",
  teachersOnlineNowLabel: "Teachers online now",

  averageSessionRatingLabel: "Average session rating",
  sessionRatingsCountLabel: "Session ratings counted",
  averageEvaluationScoreLabel: "Average evaluation score",
  evaluationScoresCountLabel: "Evaluation scores counted",

  pendingDisputesLabel: "Pending disputes",
  pendingWithdrawalsLabel: "Pending withdrawals",

  sessionTrendTitle: "Sessions — last 30 days",
  revenueTrendTitle: "Revenue — last 30 days",
  dailyLabel: "Daily",
  dateAxisLabel: "Date",
  amountAxisLabel: "Amount",
  sessionsSeriesLabel: "Sessions",
  sessionTrendAriaLabel: "Daily sessions trend chart for the last 30 days",
  revenueTrendAriaLabel: "Daily revenue trend chart for the last 30 days",

  noRevenueYet: "No gateway revenue recorded yet.",
  noRatingsYet: "No ratings recorded yet.",
  trendEmptyLabel: "Nothing recorded in the last 30 days.",

  exportAction: "Export CSV",
  refreshAction: "Refresh",
  refreshingLabel: "Refreshing…",
  lastUpdatedLabel: (at: string) => `Last updated at ${at}`,
  retryAction: "Retry",

  loadErrorTitle: "Could not load analytics",
  loadErrorBody: "Something went wrong while loading the platform analytics snapshot. Please try again.",
  deniedTitle: "Access denied",
  deniedBody: "You do not have permission to view platform analytics.",
};
