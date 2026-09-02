"use client";

/**
 * RevenueTrendChart — the 30-day (day, currency) revenue trend (DEV3-022c).
 *
 * Currencies are NEVER merged (REQ-023): the grid arrives pre-expanded by
 * the service (one point per (bucket, currency) pair with exact "0" fills),
 * and this chart pivots it into one Bar series per currency. Series colors
 * cycle through FIXED theme tokens (primary → secondary → success → warning)
 * so the assignment is deterministic per currency byte order.
 *
 * Locale-aware axis ticks (review finding F-2); localized accessible name
 * (F-1). Money tooltip: the raw decimal-string amount is parsed ONLY at the
 * presentation boundary to render a readable number — the string itself is
 * the system of record and is never used for math (review finding F-4:
 * honest docstring).
 */

import { Typography, useTheme } from "@mui/material";
import { type ReactElement, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartTick } from "@/frontend/lib/i18n/format-date";

/** One (bucket, currency) trend point as delivered by the snapshot. */
export interface RevenueTrendPoint {
  readonly bucketStart: string | Date;
  readonly currency: string;
  readonly amount: string;
}

export interface RevenueTrendChartProps {
  readonly points: readonly RevenueTrendPoint[];
  readonly ariaLabel: string;
  readonly dateAxisLabel: string;
  readonly amountAxisLabel: string;
  /** The app locale for tick formatting (REQ-067) — from `useAppLocale()`. */
  readonly locale: string;
}

/** The fixed theme-token palette cycle for per-currency series (O-2 posture). */
const SERIES_TOKEN_COUNT = 4;

/** Resolves the series color for a currency index from FIXED theme tokens. */
function seriesColor(index: number, tokens: readonly string[]): string {
  return tokens[index % SERIES_TOKEN_COUNT] ?? tokens[0] ?? "";
}

/** Locale-aware tick formatting lives in the shared helper (`formatChartTick`). */

export default function RevenueTrendChart({
  points,
  ariaLabel,
  dateAxisLabel,
  amountAxisLabel,
  locale,
}: RevenueTrendChartProps): ReactElement {
  const theme = useTheme();
  // Fixed token cycle resolved ONCE per render (no hooks below).
  const seriesTokens = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
  ];

  const { rows, currencies } = useMemo(() => {
    const currencySet = [...new Set(points.map(point => point.currency))].toSorted((a, b) => (a < b ? -1 : 1));
    const byBucket = new Map<string, Record<string, number | string>>();
    for (const point of points) {
      const bucketKey = point.bucketStart instanceof Date ? point.bucketStart.toISOString() : point.bucketStart;
      const row = byBucket.get(bucketKey) ?? { bucketStart: bucketKey };
      // Presentation-boundary parse for the chart only — the exact decimal
      // string remains the system of record (D3/REQ-014).
      row[point.currency] = Number(point.amount);
      byBucket.set(bucketKey, row);
    }
    return { rows: [...byBucket.values()], currencies: currencySet };
  }, [points]);

  return (
    <figure aria-label={ariaLabel} style={{ margin: 0, width: "100%", minHeight: 220 }}>
      {currencies.length === 0 ? null : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              tickFormatter={value => formatChartTick(locale, value)}
              stroke={theme.palette.text.secondary}
              minTickGap={24}
              aria-label={dateAxisLabel}
            />
            <YAxis stroke={theme.palette.text.secondary} width={56} aria-label={amountAxisLabel} />
            <Tooltip
              labelFormatter={value => formatChartTick(locale, value)}
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                color: theme.palette.text.primary,
              }}
            />
            <Legend />
            {currencies.map((currency, index) => (
              <Bar
                key={currency}
                dataKey={currency}
                name={currency}
                fill={seriesColor(index, seriesTokens)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      <Typography variant="caption" sx={({ palette }) => ({ color: palette.text.secondary, display: "block" })}>
        {amountAxisLabel}
      </Typography>
    </figure>
  );
}
