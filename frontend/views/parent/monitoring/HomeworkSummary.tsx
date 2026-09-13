"use client";

import { AssignmentOutlined, AutoStoriesOutlined, GradeOutlined, ReplayOutlined } from "@mui/icons-material";
import { Box, Card, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildHomeworkQuery_parentChildHomework_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatSurahJuzRef } from "@/frontend/views/parent/monitoring/parentMonitoringDisplay";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

type StatColor = "primary" | "success" | "warning" | "info";

function resolvePalette(
  theme: {
    palette: {
      primary: { main: string; contrastText: string };
      success: { main: string; contrastText: string };
      warning: { main: string; contrastText: string };
      info: { main: string; contrastText: string };
    };
  },
  color: StatColor
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

interface HomeworkStats {
  readonly count: number;
  readonly latestJadid: string | null;
  readonly latestMadi: string | null;
  readonly averageGrade: number | null;
}

function computeHomeworkStats(items: readonly ParentChildHomeworkQuery_parentChildHomework_items[]): HomeworkStats {
  const count = items.length;
  let latestJadid: string | null = null;
  let latestMadi: string | null = null;
  const grades: number[] = [];
  for (const item of items) {
    if (latestJadid === null && item.jadid !== null && item.jadid.surahJuz !== null) {
      latestJadid = formatSurahJuzRef(item.jadid.surahJuz);
    }
    if (latestMadi === null && item.madi !== null && item.madi.surahJuz !== null) {
      latestMadi = formatSurahJuzRef(item.madi.surahJuz);
    }
    if (item.jadid !== null && item.jadid.grade !== null) {
      grades.push(item.jadid.grade);
    }
    if (item.madi !== null && item.madi.grade !== null) {
      grades.push(item.madi.grade);
    }
  }
  const averageGrade =
    grades.length === 0 ? null : Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10;
  return { count, latestJadid, latestMadi, averageGrade };
}

interface StatCardProps {
  readonly icon: ReactNode;
  readonly value: string;
  readonly label: string;
  readonly color: StatColor;
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
      <Typography variant="h6" component="span" dir="auto" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: "1rem" }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary, textAlign: "center" })}>
        {label}
      </Typography>
    </Card>
  );
}

export function HomeworkSummary({
  items,
  labels,
}: Readonly<{
  items: readonly ParentChildHomeworkQuery_parentChildHomework_items[];
  labels: ParentMonitoringLabels;
}>): ReactNode {
  const stats = computeHomeworkStats(items);
  return (
    <Box sx={theme => ({ p: 2, borderRadius: 2, bgcolor: theme.palette.action.hover })}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {labels.homeworkSummaryHeading}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <StatCard
          icon={<AssignmentOutlined fontSize="small" />}
          value={String(stats.count)}
          label={labels.statHomeworkCount}
          color="primary"
        />
        <StatCard
          icon={<AutoStoriesOutlined fontSize="small" />}
          value={stats.latestJadid ?? labels.trackNoneAssigned}
          label={labels.statLatestJadid}
          color="success"
        />
        <StatCard
          icon={<ReplayOutlined fontSize="small" />}
          value={stats.latestMadi ?? labels.trackNoneAssigned}
          label={labels.statLatestMadi}
          color="warning"
        />
        <StatCard
          icon={<GradeOutlined fontSize="small" />}
          value={stats.averageGrade === null ? labels.ratingNotRated : String(stats.averageGrade)}
          label={labels.statAverageGrade}
          color="info"
        />
      </Box>
    </Box>
  );
}
