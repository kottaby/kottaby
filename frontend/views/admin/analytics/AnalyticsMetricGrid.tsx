"use client";

/**
 * Metric grid for the platform-analytics dashboard (DEV3-022c): the seven
 * section cards (users / sessions / revenue / subscriptions / teachers /
 * ratings / health) or their card-shaped skeletons during the initial
 * load. Honest emptiness: `noRevenueYet` for an empty gateway window and
 * `—` for null rating averages (never a fabricated 0); revenue money is
 * the EXACT decimal string from the API — display only, never parsed.
 */

import {
  BarChartOutlined,
  HealthAndSafetyOutlined,
  PaidOutlined,
  PeopleOutlined,
  RateReviewOutlined,
  ScheduleOutlined,
  SubscriptionsOutlined,
} from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import type { ReactElement } from "react";
import type { AdminPlatformAnalyticsQuery } from "@/frontend/graphql/generated/gql/graphql";

/** The codegen snapshot type (the client-facing shape of the snapshot). */
type Snapshot = AdminPlatformAnalyticsQuery["adminPlatformAnalytics"];

import { MetricRow, SectionCard, SectionCardSkeleton } from "@/frontend/views/admin/analytics/SectionPrimitives";
import { useAppTranslation } from "@/shared/locale/client/use-app-translation";
import { Analytics } from "@/shared/locale/namespaces/analytics";

export function AnalyticsMetricGrid({
  snapshot,
  initialLoading,
}: {
  readonly snapshot: Snapshot | null;
  readonly initialLoading: boolean;
}): ReactElement {
  const t = useAppTranslation(Analytics);
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        gap: 2,
      }}
    >
      {initialLoading || !snapshot
        ? ["users", "sessions", "revenue", "subscriptions", "teachers", "ratings", "health"].map(section => (
            <SectionCardSkeleton key={section} />
          ))
        : null}
      {snapshot ? (
        <>
          <SectionCard title={t.usersSection} icon={<PeopleOutlined fontSize="small" />}>
            <MetricRow label={t.totalUsersLabel} value={snapshot.users.totalCount} />
            <MetricRow label={t.activeUsersLabel} value={snapshot.users.activeCount} />
            <MetricRow label={t.studentsCountLabel} value={snapshot.users.studentsCount} />
            <MetricRow label={t.teachersCountLabel} value={snapshot.users.teachersCount} />
            <MetricRow label={t.parentsCountLabel} value={snapshot.users.parentsCount} />
            <MetricRow label={t.adminsCountLabel} value={snapshot.users.adminsCount} />
            <MetricRow label={t.newThisWeekUsersLabel} value={snapshot.users.newThisWeekCount} />
            <MetricRow label={t.recentlyActive24hLabel} value={snapshot.users.recentlyActive24h} />
          </SectionCard>
          <SectionCard title={t.sessionsSection} icon={<ScheduleOutlined fontSize="small" />}>
            <MetricRow label={t.totalSessionsLabel} value={snapshot.sessions.total} />
            <MetricRow label={t.sessionsTodayLabel} value={snapshot.sessions.today} />
            <MetricRow label={t.sessionsThisWeekLabel} value={snapshot.sessions.thisWeek} />
            <MetricRow label={t.sessionsThisMonthLabel} value={snapshot.sessions.thisMonth} />
            <MetricRow label={t.scheduledSessionsLabel} value={snapshot.sessions.scheduled} />
            <MetricRow label={t.completedSessionsLabel} value={snapshot.sessions.completed} />
            <MetricRow label={t.cancelledSessionsLabel} value={snapshot.sessions.cancelled} />
            <MetricRow label={t.disputedSessionsLabel} value={snapshot.sessions.disputed} />
            <MetricRow label={t.awaitingConfirmationLabel} value={snapshot.sessions.awaitingConfirmation} />
          </SectionCard>
          <SectionCard title={t.revenueSection} icon={<PaidOutlined fontSize="small" />}>
            <RevenueRows snapshot={snapshot} />
            <MetricRow label={t.offlineActivationsLabel} value={snapshot.revenue.offlineActivationsCount} />
          </SectionCard>
          <SectionCard title={t.subscriptionsSection} icon={<SubscriptionsOutlined fontSize="small" />}>
            <MetricRow label={t.totalSubscriptionsLabel} value={snapshot.subscriptions.total} />
            <MetricRow label={t.activeSubscriptionsLabel} value={snapshot.subscriptions.active} />
            <MetricRow label={t.pendingSubscriptionsLabel} value={snapshot.subscriptions.pending} />
            <MetricRow label={t.expiredSubscriptionsLabel} value={snapshot.subscriptions.expired} />
            <MetricRow label={t.cancelledSubscriptionsLabel} value={snapshot.subscriptions.cancelled} />
            <MetricRow label={t.suspendedSubscriptionsLabel} value={snapshot.subscriptions.suspended} />
            <MetricRow label={t.activeInWindowNowLabel} value={snapshot.subscriptions.activeInWindowNow} />
          </SectionCard>
          <SectionCard title={t.teachersSection} icon={<BarChartOutlined fontSize="small" />}>
            <MetricRow label={t.certifiedTeachersLabel} value={snapshot.teachers.certifiedCount} />
            <MetricRow label={t.evaluatorTeachersLabel} value={snapshot.teachers.evaluatorCount} />
            <MetricRow label={t.teachersOnlineNowLabel} value={snapshot.teachers.onlineNowCount} />
          </SectionCard>
          <SectionCard title={t.ratingsSection} icon={<RateReviewOutlined fontSize="small" />}>
            <RatingRows snapshot={snapshot} />
          </SectionCard>
          <SectionCard title={t.healthSection} icon={<HealthAndSafetyOutlined fontSize="small" />}>
            <MetricRow label={t.pendingDisputesLabel} value={snapshot.health.pendingDisputes} />
            <MetricRow label={t.pendingWithdrawalsLabel} value={snapshot.health.pendingWithdrawals} />
          </SectionCard>
        </>
      ) : null}
    </Box>
  );
}

/** Per-currency revenue table (exact money strings — display only). */
function RevenueRows({ snapshot }: { readonly snapshot: Snapshot }): ReactElement {
  const t = useAppTranslation(Analytics);
  const rows = snapshot.revenue.gatewayRevenueByCurrency;
  if (rows.length === 0) {
    return (
      <Typography variant="body2" sx={({ palette }) => ({ color: palette.text.secondary, paddingBlock: 1 })}>
        {t.noRevenueYet}
      </Typography>
    );
  }
  return (
    <Box sx={{ marginBlockEnd: 1 }}>
      {rows.map(row => (
        <MetricRow
          key={row.currency}
          label={`${row.currency} · ${t.totalAmountHeader}`}
          value={`${row.totalAmount} (${row.last30DaysAmount})`}
        />
      ))}
      <MetricRow label={t.paidPaymentsCountHeader} value={rows.reduce((sum, row) => sum + row.paidPaymentsCount, 0)} />
    </Box>
  );
}

/** Ratings rows with honest nulls + the empty-families placeholder. */
function RatingRows({ snapshot }: { readonly snapshot: Snapshot }): ReactElement {
  const t = useAppTranslation(Analytics);
  const ratings = snapshot.ratings;
  const bothEmpty = ratings.sessionRatingsCount === 0 && ratings.evaluationScoresCount === 0;
  return (
    <Box>
      <MetricRow label={t.averageSessionRatingLabel} value={ratings.averageSessionRating ?? "—"} />
      <MetricRow label={t.sessionRatingsCountLabel} value={ratings.sessionRatingsCount} />
      <MetricRow label={t.averageEvaluationScoreLabel} value={ratings.averageEvaluationScore ?? "—"} />
      <MetricRow label={t.evaluationScoresCountLabel} value={ratings.evaluationScoresCount} />
      {bothEmpty ? (
        <Typography variant="body2" sx={({ palette }) => ({ color: palette.text.secondary, marginBlockStart: 1 })}>
          {t.noRatingsYet}
        </Typography>
      ) : null}
    </Box>
  );
}
