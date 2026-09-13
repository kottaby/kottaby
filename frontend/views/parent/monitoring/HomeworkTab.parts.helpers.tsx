"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildHomeworkQuery_parentChildHomework_items_jadid } from "@/frontend/graphql/generated/gql/graphql";
import { formatSurahJuzRef } from "@/frontend/views/parent/monitoring/parentMonitoringDisplay";

export function HomeworkTrackBlock({
  track,
  trackLabel,
  noneLabel,
  columnGradeLabel,
  icon,
  accentColor,
}: Readonly<{
  track: ParentChildHomeworkQuery_parentChildHomework_items_jadid | null;
  trackLabel: string;
  noneLabel: string;
  columnGradeLabel: string;
  icon: ReactNode;
  accentColor: string;
}>): ReactNode {
  if (track?.surahJuz == null) {
    return (
      <Stack
        spacing={1}
        sx={theme => ({
          padding: 1.5,
          borderRadius: 1.5,
          bgcolor: theme.palette.action.hover,
          borderLeft: 3,
          borderColor: theme.palette.divider,
        })}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {icon}
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {trackLabel}
          </Typography>
        </Box>
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
          {noneLabel}
        </Typography>
      </Stack>
    );
  }
  const surahJuz = formatSurahJuzRef(track.surahJuz);
  const fromAyah = track.fromAyah ?? "—";
  const toAyah = track.toAyah ?? "—";
  const grade = track.grade === null ? "—" : String(track.grade);
  return (
    <Stack
      spacing={1}
      sx={theme => ({
        padding: 1.5,
        borderRadius: 1.5,
        bgcolor: theme.palette.action.hover,
        borderLeft: 3,
        borderColor: accentColor,
      })}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {trackLabel}
        </Typography>
      </Box>
      <Typography variant="body2" dir="auto">
        {surahJuz} · {fromAyah}–{toAyah}
      </Typography>
      <Typography variant="body2" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
        {columnGradeLabel}: {grade}
      </Typography>
    </Stack>
  );
}
