"use client";

import { Card, Chip, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildSessionsQuery_parentChildSessions_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { attendanceStatusLabel } from "@/frontend/views/parent/monitoring/parentMonitoringDisplay";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

/**
 * Presentational parts of the AttendanceTab — the skeleton placeholder
 * and the per-row card. Extracted from the stateful tab so the
 * hook-bearing component stays inside the file-size budget
 * (frontend/views/* is capped at 150 lines per `oxlint.config.mts`).
 */

/** Stable skeleton keys (avoids `noArrayIndexKey`). */
const ATTENDANCE_SKELETON_KEYS: readonly string[] = [
  "attendance-skeleton-1",
  "attendance-skeleton-2",
  "attendance-skeleton-3",
];

/** Skeleton placeholder for the initial-load state. */
export function AttendanceSkeleton(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="parent-attendance-loading" sx={{ gap: 2 }}>
      {ATTENDANCE_SKELETON_KEYS.map(key => (
        <Card
          key={key}
          variant="outlined"
          sx={theme => ({
            display: "flex",
            flexDirection: "column",
            gap: 1,
            padding: 2,
            borderRadius: 2,
            borderColor: theme.palette.border.main,
          })}
        >
          <Skeleton variant="text" sx={{ fontSize: "1rem", maxWidth: 180 }} />
          <Skeleton variant="rounded" sx={{ height: 24, width: 120, borderRadius: 999 }} />
        </Card>
      ))}
    </Stack>
  );
}

/** One attendance row — date + status chip. */
export function AttendanceRow({
  row,
  labels,
  locale,
}: Readonly<{
  row: ParentChildSessionsQuery_parentChildSessions_items;
  labels: ParentMonitoringLabels;
  locale: string;
}>): ReactNode {
  const dateIso = row.startedAt ?? row.createdAt;
  return (
    <Card
      variant="outlined"
      data-testid="parent-attendance-row"
      sx={theme => ({
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        borderColor: theme.palette.border.main,
      })}
    >
      <Typography variant="body2" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
        {formatApplicantDate(dateIso, locale)}
      </Typography>
      <Chip
        size="small"
        label={attendanceStatusLabel(row.status, labels)}
        sx={theme => ({
          alignSelf: "flex-start",
          bgcolor: theme.palette.secondaryContainer,
          color: theme.palette.onSecondaryContainer,
        })}
      />
    </Card>
  );
}
