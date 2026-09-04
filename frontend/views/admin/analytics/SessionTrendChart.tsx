"use client";

/**
 * SessionTrendChart — the daily session-count bar chart (the plot body of
 * the session-trend card, loaded through `next/dynamic` from the container).
 * ALL colors resolve from `theme.palette.*` via `useTheme()` (zero hex/rgb);
 * the date-axis ticks format through the existing i18n date helper
 * (`formatApplicantDate`) — never a hand-rolled `toISOString` mask. The
 * region carries an `aria-label` chart summary; the visible axis-label
 * captions keep the y/x meaning readable in both locales.
 */

import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics_sessionTrendDaily } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  TREND_CHART_BODY_HEIGHT,
  TREND_CHART_MIN_WIDTH,
} from "@/frontend/views/admin/analytics/platform-analytics-display";

interface SessionTrendChartProps {
  readonly data: ReadonlyArray<AdminPlatformAnalyticsQuery_adminPlatformAnalytics_sessionTrendDaily>;
  readonly locale: string;
  /** Legend/tooltip name of the single series. */
  readonly seriesLabel: string;
  readonly dateAxisLabel: string;
  readonly countAxisLabel: string;
  /** Accessible summary for the chart region. */
  readonly ariaLabel: string;
}

export function SessionTrendChart({
  data,
  locale,
  seriesLabel,
  dateAxisLabel,
  countAxisLabel,
  ariaLabel,
}: Readonly<SessionTrendChartProps>): ReactNode {
  const theme = useTheme();
  const formatTick = (value: string): string => formatApplicantDate(value, locale);
  // recharts hands the tooltip label through as a ReactNode — the wire
  // bucketStart is the string case; anything else degrades to an empty label.
  const formatTooltipLabel = (label: ReactNode): ReactNode =>
    typeof label === "string" ? formatApplicantDate(label, locale) : "";

  return (
    <Box component="section" aria-label={ariaLabel} sx={{ minWidth: TREND_CHART_MIN_WIDTH }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", marginBottom: 1 }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {countAxisLabel}
        </Typography>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {dateAxisLabel}
        </Typography>
      </Stack>
      <ResponsiveContainer width="100%" height={TREND_CHART_BODY_HEIGHT}>
        <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
            width={48}
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
          <Bar dataKey="sessionCount" name={seriesLabel} fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
