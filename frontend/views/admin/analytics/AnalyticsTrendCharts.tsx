"use client";

/**
 * Trend charts row for the platform-analytics dashboard (DEV3-022c): the
 * two 30-day charts behind `next/dynamic` (ssr:false — chart bundle is
 * client-only), each in a section card with locale-aware labels and a
 * matching header icon. An ALL-ZERO session window (or a currency-less
 * revenue window) renders the honest TrendEmptyPanel instead of a bare
 * chart — never fabricated data, never an empty axis.
 */

import { AccountBalanceWalletOutlined, ShowChartOutlined } from "@mui/icons-material";
import { Box, Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { AdminPlatformAnalyticsQuery } from "@/frontend/graphql/generated/gql/graphql";

/** The codegen snapshot type (the client-facing shape of the snapshot). */
type Snapshot = AdminPlatformAnalyticsQuery["adminPlatformAnalytics"];

import { TrendEmptyPanel } from "@/frontend/views/admin/analytics/SectionPrimitives";
import { useAppTranslation } from "@/shared/locale/client/use-app-translation";
import { useAppLocale } from "@/shared/locale/localeContext";
import { Analytics } from "@/shared/locale/namespaces/analytics";

const SessionTrendChart = dynamic(() => import("@/frontend/views/admin/analytics/SessionTrendChart"), {
  ssr: false,
  loading: () => <Skeleton variant="rounded" sx={{ width: "100%", minHeight: 220 }} />,
});
const RevenueTrendChart = dynamic(() => import("@/frontend/views/admin/analytics/RevenueTrendChart"), {
  ssr: false,
  loading: () => <Skeleton variant="rounded" sx={{ width: "100%", minHeight: 220 }} />,
});

/** One trend card header: icon + title + granularity caption (the metric-card visual system). */
function TrendCardHeader({ title, icon }: { readonly title: string; readonly icon: ReactElement }): ReactElement {
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 1, marginBlockEnd: 1 }}>
      <Box sx={theme => ({ display: "inline-flex", color: theme.palette.primary.main })} aria-hidden="true">
        {icon}
      </Box>
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
    </Stack>
  );
}

export function AnalyticsTrendCharts({ snapshot }: { readonly snapshot: Snapshot }): ReactElement {
  const t = useAppTranslation(Analytics);
  const locale = useAppLocale();

  const sessionsAllZero = snapshot.sessionTrendDaily.every(point => point.sessionCount === 0);
  const revenueCurrencies = [...new Set(snapshot.revenueTrendDaily.map(point => point.currency))];

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
          <TrendCardHeader title={t.sessionTrendTitle} icon={<ShowChartOutlined />} />
          <Typography
            variant="caption"
            sx={({ palette }) => ({ color: palette.text.secondary, display: "block", marginBlockEnd: 2 })}
          >
            {t.dailyLabel}
          </Typography>
          {sessionsAllZero ? (
            <TrendEmptyPanel message={t.trendEmptyLabel} />
          ) : (
            <SessionTrendChart
              points={snapshot.sessionTrendDaily.map(point => ({
                bucketStart: point.bucketStart,
                sessionCount: point.sessionCount,
              }))}
              ariaLabel={t.sessionTrendAriaLabel}
              dateAxisLabel={t.dateAxisLabel}
              seriesLabel={t.sessionsSeriesLabel}
              locale={locale}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent sx={{ p: 3, "&:last-child": { paddingBottom: 3 } }}>
          <TrendCardHeader title={t.revenueTrendTitle} icon={<AccountBalanceWalletOutlined />} />
          <Typography
            variant="caption"
            sx={({ palette }) => ({ color: palette.text.secondary, display: "block", marginBlockEnd: 2 })}
          >
            {t.dailyLabel}
          </Typography>
          {revenueCurrencies.length === 0 ? (
            <TrendEmptyPanel message={t.trendEmptyLabel} />
          ) : (
            <RevenueTrendChart
              points={snapshot.revenueTrendDaily.map(point => ({
                bucketStart: point.bucketStart,
                currency: point.currency,
                amount: point.amount,
              }))}
              ariaLabel={t.revenueTrendAriaLabel}
              dateAxisLabel={t.dateAxisLabel}
              amountAxisLabel={t.amountAxisLabel}
              locale={locale}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
