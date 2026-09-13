"use client";

import { ShowChartOutlined } from "@mui/icons-material";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ParentChildReportsQuery_parentChildReports_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

interface RatingPoint {
  readonly session: string;
  readonly rating: number;
}

function buildRatingData(
  items: readonly ParentChildReportsQuery_parentChildReports_items[],
  locale: string
): readonly RatingPoint[] {
  const points: RatingPoint[] = [];
  for (const item of items) {
    if (item.studentRatingByTeacher !== null) {
      const dateIso = item.sessionStartedAt ?? item.createdAt;
      points.push({ session: formatApplicantDate(dateIso, locale), rating: item.studentRatingByTeacher });
    }
  }
  return points.toReversed();
}

export function RatingTrendChart({
  items,
  labels,
  locale,
}: Readonly<{
  items: readonly ParentChildReportsQuery_parentChildReports_items[];
  labels: ParentMonitoringLabels;
  locale: string;
}>): ReactNode {
  const theme = useTheme();
  const data = buildRatingData(items, locale);

  if (data.length === 0) {
    return (
      <Box sx={t => ({ p: 2, borderRadius: 2, bgcolor: t.palette.action.hover, textAlign: "center" })}>
        <Stack spacing={1} sx={{ alignItems: "center" }}>
          <ShowChartOutlined sx={t => ({ fontSize: 32, color: t.palette.text.secondary })} />
          <Typography variant="body2" sx={t => ({ color: t.palette.text.secondary })}>
            {labels.ratingTrendEmpty}
          </Typography>
        </Stack>
      </Box>
    );
  }

  const gridStroke = theme.palette.divider;
  const lineStroke = theme.palette.primary.main;
  const tooltipBorder = theme.palette.divider;
  const tooltipBg = theme.palette.background.paper;

  return (
    <Box sx={t => ({ p: 2, borderRadius: 2, bgcolor: t.palette.action.hover })}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {labels.ratingTrendHeading}
      </Typography>
      <Box sx={{ width: "100%", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...data]} margin={{ top: 5, right: 10, bottom: 16, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="session" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12, verticalAnchor: "middle" }} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid " + tooltipBorder,
                fontSize: 12,
                backgroundColor: tooltipBg,
              }}
              labelStyle={{ fontWeight: 700 }}
            />
            <Line
              type="monotone"
              dataKey="rating"
              stroke={lineStroke}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
