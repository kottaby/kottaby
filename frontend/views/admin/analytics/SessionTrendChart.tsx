"use client";

/**
 * SessionTrendChart — the 30-day daily session-count trend (DEV3-022c).
 *
 * Locale-aware axis ticks (review finding F-2): bucket labels are formatted
 * through the caller's locale via `Intl.DateTimeFormat` — never hardcoded
 * date strings. The chart region carries a localized accessible name
 * (review finding F-1). All colors come from the MUI theme tokens; the
 * tooltip renders the numeric value for display only.
 */

import { Typography, useTheme } from "@mui/material";
import type { ReactElement } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
}

/** Locale-aware tick formatter (module scope — no closure capture). */
function tickFormatter(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function SessionTrendChart({
  points,
  ariaLabel,
  dateAxisLabel,
  seriesLabel,
}: SessionTrendChartProps): ReactElement {
  const theme = useTheme();

  return (
    <figure aria-label={ariaLabel} style={{ margin: 0, width: "100%", minHeight: 220 }}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={[...points]} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis
            dataKey="bucketStart"
            tickFormatter={tickFormatter}
            stroke={theme.palette.text.secondary}
            minTickGap={24}
            aria-label={dateAxisLabel}
          />
          <YAxis allowDecimals={false} stroke={theme.palette.text.secondary} width={40} />
          <Tooltip
            labelFormatter={tickFormatter}
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
