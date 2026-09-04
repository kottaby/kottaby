"use client";

/**
 * RevenueTrendChart — the daily revenue chart, one stacked series per
 * currency (the plot body of the revenue-trend card, loaded through
 * `next/dynamic` from the container). The wire's per-currency rows pivot
 * into row-per-bucket data via `pivotRevenueTrend`; series colors cycle
 * through `theme.palette.*` tokens ONLY, and the date-axis ticks format
 * through the existing i18n date helper. Currency codes are wire data
 * (technical identifiers), never translatable copy.
 */

import { Box, Stack, Typography } from "@mui/material";
import { type Theme, useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  pivotRevenueTrend,
  TREND_CHART_BODY_HEIGHT,
  TREND_CHART_MIN_WIDTH,
} from "@/frontend/views/admin/analytics/platform-analytics-display";

interface RevenueTrendChartProps {
  readonly data: ReadonlyArray<AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily>;
  readonly locale: string;
  readonly dateAxisLabel: string;
  readonly amountAxisLabel: string;
  /** Accessible summary for the chart region. */
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
  const formatTick = (value: string): string => formatApplicantDate(value, locale);
  // recharts hands the tooltip label through as a ReactNode — the wire
  // bucketStart is the string case; anything else degrades to an empty label.
  const formatTooltipLabel = (label: ReactNode): ReactNode =>
    typeof label === "string" ? formatApplicantDate(label, locale) : "";
  const { currencies, data: pivoted } = pivotRevenueTrend(data);

  return (
    <Box component="section" aria-label={ariaLabel} sx={{ minWidth: TREND_CHART_MIN_WIDTH }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", marginBottom: 1 }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {amountAxisLabel}
        </Typography>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {dateAxisLabel}
        </Typography>
      </Stack>
      <ResponsiveContainer width="100%" height={TREND_CHART_BODY_HEIGHT}>
        <BarChart data={[...pivoted]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.palette.border.light} vertical={false} />
          <XAxis
            dataKey="bucketStart"
            tickFormatter={formatTick}
            stroke={theme.palette.outline}
            tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            stroke={theme.palette.outline}
            tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: theme.palette.action.hover }}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.border.light}`,
              borderRadius: "8px",
              color: theme.palette.text.primary,
            }}
            labelFormatter={formatTooltipLabel}
          />
          <Legend wrapperStyle={{ color: theme.palette.text.secondary }} />
          {currencies.map((currency, index) => (
            <Bar
              key={currency}
              dataKey={currency}
              name={currency}
              stackId="revenue"
              fill={seriesColor(theme, index)}
              radius={index === currencies.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
