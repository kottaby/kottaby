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
import { Bar, ResponsiveContainer } from "recharts";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics_sessionTrendDaily } from "@/frontend/graphql/generated/gql/graphql";
import {
  TREND_CHART_BODY_HEIGHT,
  TREND_CHART_MIN_WIDTH,
} from "@/frontend/views/admin/analytics/platform-analytics-display";
import { TrendBarChartScaffold } from "@/frontend/views/admin/analytics/TrendBarChartScaffold";

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

  return (
    // Plot body pins dir="ltr" — recharts SVG axis geometry is direction-neutral, so captions must sit adjacent to the axes they describe.
    <Box component="section" aria-label={ariaLabel} dir="ltr" sx={{ minWidth: TREND_CHART_MIN_WIDTH }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", marginBottom: 1 }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {countAxisLabel}
        </Typography>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {dateAxisLabel}
        </Typography>
      </Stack>
      <ResponsiveContainer width="100%" height={TREND_CHART_BODY_HEIGHT}>
        <TrendBarChartScaffold data={data} locale={locale} yAxisWidth={48}>
          <Bar
            dataKey="sessionCount"
            name={seriesLabel}
            fill={theme.palette.primary.main}
            radius={[4, 4, 0, 0]}
            // Pointer feedback: the hovered day's bar deepens (theme token,
            // same hue family) so the tooltip target is unmistakable.
            activeBar={{ fill: theme.palette.primary.dark }}
          />
        </TrendBarChartScaffold>
      </ResponsiveContainer>
    </Box>
  );
}
