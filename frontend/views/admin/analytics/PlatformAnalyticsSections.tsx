"use client";

/**
 * PlatformAnalyticsMetricGrid — the seven metric sections (users, sessions,
 * revenue, subscriptions, teachers, ratings, health) laid out on the shared
 * responsive grid (4 → 2 → 1 columns). Every value renders straight from
 * the snapshot prop (the generated `AdminPlatformAnalyticsQuery_…` extracted
 * type — no mapping layer); every label is a translation-handle property
 * read. Ratings render an honest `—` for the nullable averages (never a
 * fabricated `0`) and the `noRatingsYet` copy when both rating families are
 * empty; the revenue section (per-currency table + offline activations)
 * lives in `RevenueSectionCard`.
 *
 * MUI v9 discipline: `sx`-only styling, `theme.palette.*` tokens only.
 */

import {
  CardMembershipOutlined,
  EventOutlined,
  MonitorHeartOutlined,
  PeopleOutlined,
  SchoolOutlined,
  StarOutlineOutlined,
} from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics } from "@/frontend/graphql/generated/gql/graphql";
import { MetricCard, MetricRow } from "@/frontend/views/admin/analytics/MetricCard";
import {
  formatRatingAverage,
  METRIC_GRID_SX,
  NULL_METRIC_PLACEHOLDER,
} from "@/frontend/views/admin/analytics/platform-analytics-display";
import { RevenueSectionCard } from "@/frontend/views/admin/analytics/RevenueSectionCard";
import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

interface PlatformAnalyticsMetricGridProps {
  readonly snapshot: AdminPlatformAnalyticsQuery_adminPlatformAnalytics;
  readonly labels: AnalyticsLabels;
  readonly locale: string;
}

/** The ratings card: honest-null averages + the both-families-empty copy. */
function RatingsMetricCard({
  ratings,
  labels,
  locale,
}: Readonly<{
  readonly ratings: AdminPlatformAnalyticsQuery_adminPlatformAnalytics["ratings"];
  readonly labels: AnalyticsLabels;
  readonly locale: string;
}>): ReactNode {
  const ratingsEmpty = ratings.sessionRatingsCount === 0 && ratings.evaluationScoresCount === 0;

  return (
    <MetricCard icon={<StarOutlineOutlined />} title={labels.ratingsSection}>
      <MetricRow
        label={labels.averageSessionRatingLabel}
        value={
          ratings.averageSessionRating === null
            ? NULL_METRIC_PLACEHOLDER
            : formatRatingAverage(ratings.averageSessionRating, locale)
        }
        locale={locale}
      />
      <MetricRow label={labels.sessionRatingsCountLabel} value={ratings.sessionRatingsCount} locale={locale} />
      <MetricRow
        label={labels.averageEvaluationScoreLabel}
        value={
          ratings.averageEvaluationScore === null
            ? NULL_METRIC_PLACEHOLDER
            : formatRatingAverage(ratings.averageEvaluationScore, locale)
        }
        locale={locale}
      />
      <MetricRow label={labels.evaluationScoresCountLabel} value={ratings.evaluationScoresCount} locale={locale} />
      {ratingsEmpty ? (
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {labels.noRatingsYet}
        </Typography>
      ) : null}
    </MetricCard>
  );
}

/** The seven section cards on the shared responsive metric grid. */
export function PlatformAnalyticsMetricGrid({
  snapshot,
  labels,
  locale,
}: Readonly<PlatformAnalyticsMetricGridProps>): ReactNode {
  const usersRows: ReadonlyArray<readonly [string, number]> = [
    [labels.usersTotalLabel, snapshot.users.totalCount],
    [labels.usersActiveLabel, snapshot.users.activeCount],
    [labels.usersSuspendedLabel, snapshot.users.suspendedCount],
    [labels.usersBlockedLabel, snapshot.users.blockedCount],
    [labels.usersDeletedLabel, snapshot.users.deletedCount],
    [labels.usersAdminsLabel, snapshot.users.adminsCount],
    [labels.usersTeachersLabel, snapshot.users.teachersCount],
    [labels.usersStudentsLabel, snapshot.users.studentsCount],
    [labels.usersParentsLabel, snapshot.users.parentsCount],
    [labels.usersNewThisWeekLabel, snapshot.users.newThisWeekCount],
    [labels.recentlyActive24hLabel, snapshot.users.recentlyActive24h],
  ];

  const sessionsRows: ReadonlyArray<readonly [string, number]> = [
    [labels.sessionsTotalLabel, snapshot.sessions.total],
    [labels.sessionsTodayLabel, snapshot.sessions.today],
    [labels.sessionsThisWeekLabel, snapshot.sessions.thisWeek],
    [labels.sessionsThisMonthLabel, snapshot.sessions.thisMonth],
    [labels.sessionsScheduledLabel, snapshot.sessions.scheduled],
    [labels.sessionsStartedLabel, snapshot.sessions.started],
    [labels.sessionsCompletedLabel, snapshot.sessions.completed],
    [labels.sessionsCancelledLabel, snapshot.sessions.cancelled],
    [labels.sessionsDisputedLabel, snapshot.sessions.disputed],
    [labels.awaitingConfirmationLabel, snapshot.sessions.awaitingConfirmation],
  ];

  const subscriptionsRows: ReadonlyArray<readonly [string, number]> = [
    [labels.subscriptionsTotalLabel, snapshot.subscriptions.total],
    [labels.subscriptionsActiveLabel, snapshot.subscriptions.active],
    [labels.subscriptionsPendingLabel, snapshot.subscriptions.pending],
    [labels.subscriptionsExpiredLabel, snapshot.subscriptions.expired],
    [labels.subscriptionsCancelledLabel, snapshot.subscriptions.cancelled],
    [labels.subscriptionsSuspendedLabel, snapshot.subscriptions.suspended],
    [labels.activeInWindowNowLabel, snapshot.subscriptions.activeInWindowNow],
  ];

  const teachersRows: ReadonlyArray<readonly [string, number]> = [
    [labels.teachersCertifiedLabel, snapshot.teachers.certifiedCount],
    [labels.teachersEvaluatorsLabel, snapshot.teachers.evaluatorCount],
    [labels.teachersOnlineNowLabel, snapshot.teachers.onlineNowCount],
  ];

  const healthRows: ReadonlyArray<readonly [string, number]> = [
    [labels.pendingDisputesLabel, snapshot.health.pendingDisputes],
    [labels.pendingWithdrawalsLabel, snapshot.health.pendingWithdrawals],
  ];

  return (
    <Box sx={METRIC_GRID_SX}>
      <MetricCard icon={<PeopleOutlined />} title={labels.usersSection}>
        {usersRows.map(([label, value]) => (
          <MetricRow key={label} label={label} value={value} locale={locale} />
        ))}
      </MetricCard>

      <MetricCard icon={<EventOutlined />} title={labels.sessionsSection}>
        {sessionsRows.map(([label, value]) => (
          <MetricRow key={label} label={label} value={value} locale={locale} />
        ))}
      </MetricCard>

      <RevenueSectionCard snapshot={snapshot.revenue} labels={labels} locale={locale} />

      <MetricCard icon={<CardMembershipOutlined />} title={labels.subscriptionsSection}>
        {subscriptionsRows.map(([label, value]) => (
          <MetricRow key={label} label={label} value={value} locale={locale} />
        ))}
      </MetricCard>

      <MetricCard icon={<SchoolOutlined />} title={labels.teachersSection}>
        {teachersRows.map(([label, value]) => (
          <MetricRow key={label} label={label} value={value} locale={locale} />
        ))}
      </MetricCard>

      <RatingsMetricCard ratings={snapshot.ratings} labels={labels} locale={locale} />

      <MetricCard
        icon={<MonitorHeartOutlined />}
        title={labels.healthSection}
        // The 7th of 7 cards on the 4-column grid would strand an empty cell
        // at the row end — spanning the last card across the two remaining
        // lanes fills the final row at BOTH `sm` (2-col) and `lg` (4-col).
        sx={{ gridColumn: { sm: "span 2", lg: "span 2" } }}
      >
        {healthRows.map(([label, value]) => (
          <MetricRow key={label} label={label} value={value} locale={locale} />
        ))}
      </MetricCard>
    </Box>
  );
}
