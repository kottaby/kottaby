"use client";

import { CalendarMonthOutlined, CheckCircleOutlined, ScheduleOutlined, TrendingUpOutlined } from "@mui/icons-material";
import { Box, Card, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildSessionsQuery_parentChildSessions_items } from "@/frontend/graphql/generated/gql/graphql";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

interface SummaryStats {
  readonly total: number;
  readonly completed: number;
  readonly scheduled: number;
  readonly completionRate: number;
}

function computeStats(sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[]): SummaryStats {
  let completed = 0;
  let scheduled = 0;
  for (const s of sessions) {
    const key = s.status.toLowerCase();
    if (key === "completed") {
      completed++;
    } else if (key === "scheduled") {
      scheduled++;
    }
  }
  const total = sessions.length;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, scheduled, completionRate };
}

function resolvePalette(
  theme: {
    palette: {
      primary: { main: string; contrastText: string };
      success: { main: string; contrastText: string };
      warning: { main: string; contrastText: string };
      info: { main: string; contrastText: string };
    };
  },
  color: "primary" | "success" | "warning" | "info"
): { bgcolor: string; fg: string } {
  if (color === "primary") {
    return { bgcolor: theme.palette.primary.main, fg: theme.palette.primary.contrastText };
  }
  if (color === "success") {
    return { bgcolor: theme.palette.success.main, fg: theme.palette.success.contrastText };
  }
  if (color === "warning") {
    return { bgcolor: theme.palette.warning.main, fg: theme.palette.warning.contrastText };
  }
  return { bgcolor: theme.palette.info.main, fg: theme.palette.info.contrastText };
}

interface StatCardProps {
  readonly icon: ReactNode;
  readonly value: string;
  readonly label: string;
  readonly color: "primary" | "success" | "warning" | "info";
}

function StatCard({ icon, value, label, color }: Readonly<StatCardProps>): ReactNode {
  return (
    <Card
      variant="outlined"
      sx={theme => ({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        padding: 1.5,
        borderRadius: 2,
        borderColor: theme.palette.divider,
        flex: 1,
        minWidth: 0,
      })}
    >
      <Box
        sx={theme => {
          const { bgcolor, fg } = resolvePalette(theme, color);
          return {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "50%",
            bgcolor,
            color: fg,
          };
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" component="span" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary, textAlign: "center" })}>
        {label}
      </Typography>
    </Card>
  );
}

export function AttendanceSummary({
  sessions,
  labels,
}: Readonly<{
  sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[];
  labels: ParentMonitoringLabels;
}>): ReactNode {
  const stats = computeStats(sessions);
  return (
    <Box sx={theme => ({ p: 2, borderRadius: 2, bgcolor: theme.palette.action.hover })}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {labels.summaryHeading}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1.5 }}>
        <StatCard
          icon={<CalendarMonthOutlined fontSize="small" />}
          value={String(stats.total)}
          label={labels.statTotalSessions}
          color="primary"
        />
        <StatCard
          icon={<CheckCircleOutlined fontSize="small" />}
          value={String(stats.completed)}
          label={labels.statCompletedSessions}
          color="success"
        />
        <StatCard
          icon={<ScheduleOutlined fontSize="small" />}
          value={String(stats.scheduled)}
          label={labels.statUpcomingSessions}
          color="warning"
        />
        <StatCard
          icon={<TrendingUpOutlined fontSize="small" />}
          value={stats.completionRate + "%"}
          label={labels.statCompletionRate}
          color="info"
        />
      </Stack>
    </Box>
  );
}
