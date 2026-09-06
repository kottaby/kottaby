"use client";

/**
 * RevenueTrendChart — the daily revenue chart, one GROUPED series per
 * currency (currencies are never stacked: summing distinct currencies into
 * one bar is meaningless — each currency keeps its own bar per day, side by
 * side, exactly as the wire keeps currency rows separate). The plot body of
 * the revenue-trend card is loaded through
 * `next/dynamic` from the container. The wire's per-currency rows pivot
 * into row-per-bucket data via `pivotRevenueTrend`; series colors cycle
 * through `theme.palette.*` tokens ONLY, and the date-axis ticks format
 * through the existing i18n date helper. Currency codes are wire data
 * (technical identifiers), never translatable copy. The region's accessible
 * summary extends the composed `aria-label` with one
 * `${revenueSeriesLabel}: <currency>` entry per series, resolved through the
 * `Analytics` translation handle — mirroring the Trends-level aria-label
 * composition (handle copy + wire currency codes only).
 */

import { Box, Stack, Typography } from "@mui/material";
import { type Theme, useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { Bar, Legend, ResponsiveContainer } from "recharts";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily } from "@/frontend/graphql/generated/gql/graphql";
import {
  pivotRevenueTrend,
  TREND_CHART_BODY_HEIGHT,
  TREND_CHART_MIN_WIDTH,
} from "@/frontend/views/admin/analytics/platform-analytics-display";
import { TrendBarChartScaffold } from "@/frontend/views/admin/analytics/TrendBarChartScaffold";
import { useAppTranslation } from "@/shared/locale";
import { Analytics } from "@/shared/locale/namespaces/analytics";

interface RevenueTrendChartProps {
  readonly data: ReadonlyArray<AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily>;
  readonly locale: string;
  readonly dateAxisLabel: string;
  readonly amountAxisLabel: string;
  /** Accessible summary for the chart region (gains per-series entries below). */
  readonly ariaLabel: string;
}

/** Theme-token cycle for per-currency series (no hex/rgb anywhere). */
function seriesColor(theme: Theme, index: number): string {
  const paletteCycle = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.tertiary,
    theme.palette.primary.light,
    theme.palette.secondary.light,
    theme.palette.primary.dark,
  ];
  return paletteCycle[index % paletteCycle.length];
}

export function RevenueTrendChart({
  data,
  locale,
  dateAxisLabel,
  amountAxisLabel,
  ariaLabel,
}: Readonly<RevenueTrendChartProps>): ReactNode {
  const theme = useTheme();
  const labels = useAppTranslation(Analytics);
  const { currencies, data: pivoted } = pivotRevenueTrend(data);
  // Empty-window honest state: with zero revenue buckets the bare BarChart
  // renders NO axes at all (recharts has no domain to scale) — a blank box
  // that reads as a broken image next to the fully-axed sessions chart.
  // The centered caption keeps the card's height and visual weight instead.
  if (pivoted.length === 0) {
    return (
      <Box
        component="section"
        aria-label={ariaLabel}
        dir="ltr"
        sx={{
          minWidth: TREND_CHART_MIN_WIDTH,
          height: TREND_CHART_BODY_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography
          variant="body2"
          component="p"
          sx={{ color: theme.palette.text.secondary, textAlign: "center", padding: 3 }}
        >
          {labels.noRevenueYet}
        </Typography>
      </Box>
    );
  }
  // Per-series accessible summary — one `${revenueSeriesLabel}: <currency>`
  // entry per currency series (handle copy + wire currency codes), appended
  // to the composed region label. Empty data adds nothing.
  const seriesSummary = currencies.map(currency => `${labels.revenueSeriesLabel}: ${currency}`).join(", ");
  const accessibleSummary = seriesSummary ? `${ariaLabel} — ${seriesSummary}` : ariaLabel;

  return (
    // Plot body pins dir="ltr" — recharts SVG axis geometry is direction-neutral, so captions must sit adjacent to the axes they describe.
    <Box component="section" aria-label={accessibleSummary} dir="ltr" sx={{ minWidth: TREND_CHART_MIN_WIDTH }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", marginBottom: 1 }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {amountAxisLabel}
        </Typography>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {dateAxisLabel}
        </Typography>
      </Stack>
      <ResponsiveContainer width="100%" height={TREND_CHART_BODY_HEIGHT}>
        <TrendBarChartScaffold data={pivoted} locale={locale} yAxisWidth={56}>
          <Legend wrapperStyle={{ color: theme.palette.text.secondary }} />
          {currencies.map((currency, index) => (
            <Bar
              key={currency}
              dataKey={currency}
              name={currency}
              // No stackId: currencies are incomparable units, so bars render
              // GROUPED (side by side per bucket) — never summed into one
              // stacked column. Every grouped bar is its own column top, so
              // all series carry the rounded top corners.
              fill={seriesColor(theme, index)}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </TrendBarChartScaffold>
      </ResponsiveContainer>
    </Box>
  );
}
