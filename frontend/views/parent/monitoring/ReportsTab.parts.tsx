"use client";

import { CalendarMonthOutlined, DescriptionOutlined, StarOutlined } from "@mui/icons-material";
import { Box, Card, Chip, Skeleton, Stack, Typography } from "@mui/material";
import { type ReactNode, useEffect, useRef } from "react";
import type { ParentChildReportsQuery_parentChildReports_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

const REPORTS_SKELETON_KEYS: readonly string[] = ["reports-skeleton-1", "reports-skeleton-2", "reports-skeleton-3"];

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
            borderLeft: 4,
            borderLeftColor: theme.palette.divider,
          })}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Skeleton variant="circular" sx={{ width: 20, height: 20 }} />
            <Skeleton variant="text" sx={{ fontSize: "1rem", maxWidth: 180, flex: 1 }} />
          </Box>
          <Skeleton variant="rounded" sx={{ height: 24, width: 90, borderRadius: 999 }} />
          <Skeleton variant="rectangular" sx={{ height: 40, borderRadius: 2 }} />
        </Card>
      ))}
    </Stack>
  );
}

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
        gap: 1.5,
        padding: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        borderColor: isDeepLinkTarget ? theme.palette.primary.main : theme.palette.border.main,
        borderWidth: isDeepLinkTarget ? 2 : 1,
        borderLeft: 4,
        borderLeftColor: isDeepLinkTarget ? theme.palette.primary.main : theme.palette.divider,
        transition: theme.transitions.create(["box-shadow", "border-color"], {
          duration: theme.transitions.duration.shorter,
        }),
        "&:hover": { boxShadow: theme.shadows[3] },
      })}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CalendarMonthOutlined sx={theme => ({ fontSize: 18, color: theme.palette.text.secondary })} />
        <Typography variant="body2" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
          {formatApplicantDate(dateIso, locale)}
        </Typography>
      </Box>
      <Chip
        size="small"
        icon={<StarOutlined />}
        label={`${labels.ratingColumnLabel}: ${ratingLabel}`}
        sx={theme => ({
          alignSelf: "flex-start",
          bgcolor: rating !== null ? theme.palette.primary.main : theme.palette.action.hover,
          color: rating !== null ? theme.palette.primary.contrastText : theme.palette.text.secondary,
          "& .MuiChip-icon": {
            color: rating !== null ? theme.palette.primary.contrastText : theme.palette.text.secondary,
          },
        })}
      />
      {notes === "" ? null : (
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <DescriptionOutlined
            sx={theme => ({ fontSize: 18, color: theme.palette.text.secondary, mt: 0.25, flexShrink: 0 })}
          />
          <Typography variant="body2" dir="auto">
            {notes}
          </Typography>
        </Box>
      )}
    </Card>
  );
}
