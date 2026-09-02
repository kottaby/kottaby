"use client";

/**
 * SessionTrendChart — the 30-day daily session-count trend (DEV3-022c).
 *
 * Locale-aware axis ticks (review finding F-2, RESOLVED via the shared
 * helper): bucket labels are formatted through `formatChartTick` with the
 * caller's APP locale (REQ-067) — never the ambient browser locale and no
 * chart-local `Intl` fork. The chart region carries a localized accessible
 * name (review finding F-1). All colors come from the MUI theme tokens; the
 * tooltip renders the numeric value for display only.
 */

import { Typography, useTheme } from "@mui/material";
import type { ReactElement } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartTick } from "@/frontend/lib/i18n/format-date";

/** One trend point as delivered by the snapshot (bucketStart is an ISO string client-side). */
export interface SessionTrendPoint {
  readonly bucketStart: string | Date;
  readonly sessionCount: number;
}

export interface SessionTrendChartProps {
  readonly points: readonly SessionTrendPoint[];
  readonly ariaLabel: string;
  readonly dateAxisLabel: string;
  readonly seriesLabel: string;
  /** The app locale for tick formatting (REQ-067) — from `useAppLocale()`. */
  readonly locale: string;
}

/** Locale-aware tick formatting lives in the shared helper (`formatChartTick`). */

export default function SessionTrendChart({
  points,
  ariaLabel,
  dateAxisLabel,
  seriesLabel,
  locale,
}: SessionTrendChartProps): ReactElement {
  const theme = useTheme();

  return (
    <figure aria-label={ariaLabel} style={{ margin: 0, width: "100%", minHeight: 220 }}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={[...points]} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis
            dataKey="bucketStart"
            tickFormatter={value => formatChartTick(locale, value)}
            stroke={theme.palette.text.secondary}
            minTickGap={24}
            aria-label={dateAxisLabel}
          />
          <YAxis allowDecimals={false} stroke={theme.palette.text.secondary} width={40} />
          <Tooltip
            labelFormatter={value => formatChartTick(locale, value)}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              color: theme.palette.text.primary,
            }}
          />
          <Line
            type="monotone"
            dataKey="sessionCount"
            name={seriesLabel}
            stroke={theme.palette.primary.main}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <Typography variant="caption" sx={({ palette }) => ({ color: palette.text.secondary, display: "block" })}>
        {dateAxisLabel}
      </Typography>
    </figure>
  );
}
