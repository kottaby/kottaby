"use client";

/**
 * PlatformAnalyticsTrends — the two trend charts side-by-side on desktop
 * (stacked below `lg`), each inside a `TrendChartCard`. The recharts plot
 * bodies load behind `next/dynamic` client imports (`ssr: false`), with the
 * same-height skeleton rendering while a chunk resolves — no layout shift.
 * Chart regions carry composed `aria-label` summaries (title + y/x axis
 * labels, all translation-handle strings).
 */

import { BarChartOutlined, TrendingUpOutlined } from "@mui/icons-material";
import { Box } from "@mui/material";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics } from "@/frontend/graphql/generated/gql/graphql";
import { TrendChartBodySkeleton } from "@/frontend/views/admin/analytics/PlatformAnalyticsStates";
import { TRENDS_GRID_SX } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { TrendChartCard } from "@/frontend/views/admin/analytics/TrendChartCard";
import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

const SessionTrendChart = dynamic(
  () => import("@/frontend/views/admin/analytics/SessionTrendChart").then(mod => mod.SessionTrendChart),
  { ssr: false, loading: () => <TrendChartBodySkeleton /> }
);
const RevenueTrendChart = dynamic(
  () => import("@/frontend/views/admin/analytics/RevenueTrendChart").then(mod => mod.RevenueTrendChart),
  { ssr: false, loading: () => <TrendChartBodySkeleton /> }
);

interface PlatformAnalyticsTrendsProps {
  readonly snapshot: AdminPlatformAnalyticsQuery_adminPlatformAnalytics;
  readonly labels: AnalyticsLabels;
  readonly locale: string;
}

export function PlatformAnalyticsTrends({
  snapshot,
  labels,
  locale,
}: Readonly<PlatformAnalyticsTrendsProps>): ReactNode {
  return (
    <Box sx={TRENDS_GRID_SX}>
      <TrendChartCard icon={<BarChartOutlined />} title={labels.sessionTrendTitle} caption={labels.dailyLabel}>
        <SessionTrendChart
          data={snapshot.sessionTrendDaily}
          locale={locale}
          seriesLabel={labels.sessionsSeriesLabel}
          dateAxisLabel={labels.trendDateAxisLabel}
          countAxisLabel={labels.trendCountAxisLabel}
          ariaLabel={`${labels.sessionTrendTitle} — ${labels.trendCountAxisLabel} / ${labels.trendDateAxisLabel}`}
        />
      </TrendChartCard>
      <TrendChartCard icon={<TrendingUpOutlined />} title={labels.revenueTrendTitle} caption={labels.dailyLabel}>
        <RevenueTrendChart
          data={snapshot.revenueTrendDaily}
          locale={locale}
          dateAxisLabel={labels.trendDateAxisLabel}
          amountAxisLabel={labels.trendAmountAxisLabel}
          ariaLabel={`${labels.revenueTrendTitle} — ${labels.trendAmountAxisLabel} / ${labels.trendDateAxisLabel}`}
        />
      </TrendChartCard>
    </Box>
  );
}
