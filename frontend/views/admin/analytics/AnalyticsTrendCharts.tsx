"use client";

/**
 * Trend charts row for the platform-analytics dashboard (DEV3-022c): the
 * two 30-day charts behind `next/dynamic` (ssr:false — chart bundle is
 * client-only), each in a section card with locale-aware labels.
 */

import { Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { AdminPlatformAnalyticsQuery } from "@/frontend/graphql/generated/gql/graphql";

/** The codegen snapshot type (the client-facing shape of the snapshot). */
type Snapshot = AdminPlatformAnalyticsQuery["adminPlatformAnalytics"];

import { useAppTranslation } from "@/shared/locale/client/use-app-translation";
import { Analytics } from "@/shared/locale/namespaces/analytics";

const SessionTrendChart = dynamic(() => import("@/frontend/views/admin/analytics/SessionTrendChart"), {
  ssr: false,
  loading: () => <Skeleton variant="rounded" sx={{ width: "100%", minHeight: 220 }} />,
});
const RevenueTrendChart = dynamic(() => import("@/frontend/views/admin/analytics/RevenueTrendChart"), {
  ssr: false,
  loading: () => <Skeleton variant="rounded" sx={{ width: "100%", minHeight: 220 }} />,
});

export function AnalyticsTrendCharts({ snapshot }: { readonly snapshot: Snapshot }): ReactElement {
  const t = useAppTranslation(Analytics);
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
        gap: 2,
        marginBlockStart: 3,
      }}
    >
      <Card>
        <CardContent sx={{ p: 3, "&:last-child": { paddingBottom: 3 } }}>
          <Typography variant="h6" component="h2" sx={{ marginBlockEnd: 1 }}>
            {t.sessionTrendTitle}
          </Typography>
          <Typography
            variant="caption"
            sx={({ palette }) => ({ color: palette.text.secondary, display: "block", marginBlockEnd: 2 })}
          >
            {t.dailyLabel}
          </Typography>
          <SessionTrendChart
            points={snapshot.sessionTrendDaily.map(point => ({
              bucketStart: point.bucketStart,
              sessionCount: point.sessionCount,
            }))}
            ariaLabel={t.sessionTrendAriaLabel}
            dateAxisLabel={t.dateAxisLabel}
            seriesLabel={t.sessionsSeriesLabel}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent sx={{ p: 3, "&:last-child": { paddingBottom: 3 } }}>
          <Typography variant="h6" component="h2" sx={{ marginBlockEnd: 1 }}>
            {t.revenueTrendTitle}
          </Typography>
          <Typography
            variant="caption"
            sx={({ palette }) => ({ color: palette.text.secondary, display: "block", marginBlockEnd: 2 })}
          >
            {t.dailyLabel}
          </Typography>
          <RevenueTrendChart
            points={snapshot.revenueTrendDaily.map(point => ({
              bucketStart: point.bucketStart,
              currency: point.currency,
              amount: point.amount,
            }))}
            ariaLabel={t.revenueTrendAriaLabel}
            dateAxisLabel={t.dateAxisLabel}
            amountAxisLabel={t.amountAxisLabel}
          />
        </CardContent>
      </Card>
    </Box>
  );
}
