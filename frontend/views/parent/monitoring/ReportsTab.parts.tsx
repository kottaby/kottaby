"use client";

import { Card, Chip, Skeleton, Stack, Typography } from "@mui/material";
import { type ReactNode, useEffect, useRef } from "react";
import type { ParentChildReportsQuery_parentChildReports_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

/**
 * Presentational parts of the ReportsTab — the skeleton placeholder and
 * the per-row card. Extracted from the stateful tab so the hook-bearing
 * component stays inside the file-size budget (frontend/views/* is capped
 * at 150 lines per `oxlint.config.mts`).
 */

/** Stable skeleton keys (avoids `noArrayIndexKey`). */
const REPORTS_SKELETON_KEYS: readonly string[] = ["reports-skeleton-1", "reports-skeleton-2", "reports-skeleton-3"];

/** Skeleton placeholder for the initial-load state. */
export function ReportsSkeleton(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="parent-reports-loading" sx={{ gap: 2 }}>
      {REPORTS_SKELETON_KEYS.map(key => (
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
          <Skeleton variant="rounded" sx={{ height: 24, width: 90, borderRadius: 999 }} />
          <Skeleton variant="rectangular" sx={{ height: 40, borderRadius: 2 }} />
        </Card>
      ))}
    </Stack>
  );
}

/** One report row — date + rating chip + teacher notes. */
export function ReportRow({
  row,
  labels,
  locale,
  deepLinkSessionId,
}: Readonly<{
  row: ParentChildReportsQuery_parentChildReports_items;
  labels: ParentMonitoringLabels;
  locale: string;
  deepLinkSessionId: number | null;
}>): ReactNode {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const isDeepLinkTarget = deepLinkSessionId !== null && deepLinkSessionId === row.sessionId;

  useEffect(() => {
    if (isDeepLinkTarget && rowRef.current !== null) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isDeepLinkTarget]);

  const dateIso = row.sessionStartedAt ?? row.createdAt;
  const rating = row.studentRatingByTeacher;
  const ratingLabel = rating === null ? labels.ratingNotRated : `${rating}`;
  const notes = row.teacherNotes ?? "";

  return (
    <Card
      ref={rowRef}
      variant="outlined"
      data-testid="parent-reports-row"
      aria-current={isDeepLinkTarget ? "true" : undefined}
      sx={theme => ({
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        borderColor: isDeepLinkTarget ? theme.palette.primary.main : theme.palette.border.main,
        borderWidth: isDeepLinkTarget ? 2 : 1,
      })}
    >
      <Typography variant="body2" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
        {formatApplicantDate(dateIso, locale)}
      </Typography>
      <Chip
        size="small"
        label={`${labels.ratingColumnLabel}: ${ratingLabel}`}
        sx={theme => ({
          alignSelf: "flex-start",
          bgcolor: theme.palette.secondaryContainer,
          color: theme.palette.onSecondaryContainer,
        })}
      />
      {notes === "" ? null : (
        <Typography variant="body2" dir="auto">
          {notes}
        </Typography>
      )}
    </Card>
  );
}
