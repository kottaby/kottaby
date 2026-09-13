"use client";

import { AutoStoriesOutlined, BookmarkBorderOutlined, ReplayOutlined, TrendingUpOutlined } from "@mui/icons-material";
import { Box, Card, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildProgressQuery_parentChildProgress } from "@/frontend/graphql/generated/gql/graphql";
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

function computeProgressStats(progress: ParentChildProgressQuery_parentChildProgress): {
  readonly rowCount: number;
  readonly jadidValue: string;
  readonly madiValue: string;
  readonly activeTrack: string;
} {
  const rowCount = progress.progressRowCount;
  const jadidValue =
    progress.latestJadidPosition !== null ? formatSurahJuzRef(progress.latestJadidPosition.surahJuz) : "—";
  const madiValue =
    progress.latestMadiPosition !== null ? formatSurahJuzRef(progress.latestMadiPosition.surahJuz) : "—";
  let activeTrack = "—";
  if (progress.latestJadidPosition !== null) {
    activeTrack = "Jadid";
  } else if (progress.latestMadiPosition !== null) {
    activeTrack = "Madi";
  }
  return { rowCount, jadidValue, madiValue, activeTrack };
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

export function ProgressSummary({
  progress,
  labels,
}: Readonly<{
  progress: ParentChildProgressQuery_parentChildProgress;
  labels: ParentMonitoringLabels;
}>): ReactNode {
  const stats = computeProgressStats(progress);
  return (
    <Box sx={theme => ({ p: 2, borderRadius: 2, bgcolor: theme.palette.action.hover })}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {labels.progressSummaryHeading}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <StatCard
          icon={<TrendingUpOutlined fontSize="small" />}
          value={String(stats.rowCount)}
          label={labels.statProgressRows}
          color="primary"
        />
        <StatCard
          icon={<AutoStoriesOutlined fontSize="small" />}
          value={stats.jadidValue}
          label={labels.statCoverageAreas}
          color="success"
        />
        <StatCard
          icon={<ReplayOutlined fontSize="small" />}
          value={stats.madiValue}
          label={labels.statActiveTrack}
          color="warning"
        />
        <StatCard
          icon={<BookmarkBorderOutlined fontSize="small" />}
          value={stats.activeTrack}
          label={labels.statLastActivity}
          color="info"
        />
      </Box>
    </Box>
  );
}
