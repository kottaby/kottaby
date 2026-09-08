"use client";

/**
 * TrendBarChartScaffold — the shared recharts scaffolding for the daily
 * trend bar charts (revenue-trend, session-trend): the BarChart frame,
 * CartesianGrid, themed X/Y axes, and the themed Tooltip. Series (Bar /
 * Legend) arrive as `children` so each chart keeps its own series shape;
 * the y-axis width is parameterized per chart.
 */

import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { formatApplicantDate, formatDayMonth } from "@/frontend/lib/i18n/format-date";

interface TrendBarChartScaffoldProps {
  readonly data: ReadonlyArray<object>;
  readonly locale: string;
  /** Y-axis pixel width (per chart: wider for currency amount labels). */
  readonly yAxisWidth: number;
  readonly children: ReactNode;
}

export function TrendBarChartScaffold({
  data,
  locale,
  yAxisWidth,
  children,
}: Readonly<TrendBarChartScaffoldProps>): ReactNode {
  const theme = useTheme();
  // Axis ticks use the SHORT day/month mask — a full timestamp overcrowds
  // the 30-bucket axis and bidi-reorders into mashed glyphs under RTL (QA).
  const formatTick = (value: string): string => formatDayMonth(value, locale);
  // recharts hands the tooltip label through as a ReactNode — the wire
  // bucketStart is the string case; anything else degrades to an empty label.
  const formatTooltipLabel = (label: ReactNode): ReactNode =>
    typeof label === "string" ? formatApplicantDate(label, locale) : "";

  return (
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
        width={yAxisWidth}
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
      {children}
    </BarChart>
  );
}
