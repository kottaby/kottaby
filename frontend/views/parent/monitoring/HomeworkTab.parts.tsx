"use client";

import { Card, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type {
  ParentChildHomeworkQuery_parentChildHomework_items,
  ParentChildHomeworkQuery_parentChildHomework_items_jadid,
} from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { formatSurahJuzRef } from "@/frontend/views/parent/monitoring/parentMonitoringDisplay";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

/**
 * Presentational parts of the HomeworkTab — the skeleton placeholder,
 * the per-row card, and the per-track block. Extracted from the stateful
 * tab so the hook-bearing component stays inside the file-size budget
 * (frontend/views/* is capped at 150 lines per `oxlint.config.mts`).
 */

/** Stable skeleton keys (avoids `noArrayIndexKey`). */
const HOMEWORK_SKELETON_KEYS: readonly string[] = ["homework-skeleton-1", "homework-skeleton-2", "homework-skeleton-3"];

/** Skeleton placeholder for the initial-load state. */
export function HomeworkSkeleton(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="parent-homework-loading" sx={{ gap: 2 }}>
      {HOMEWORK_SKELETON_KEYS.map(key => (
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
          <Skeleton variant="rectangular" sx={{ height: 56, borderRadius: 2 }} />
          <Skeleton variant="rectangular" sx={{ height: 56, borderRadius: 2 }} />
        </Card>
      ))}
    </Stack>
  );
}

/** One homework row — date + Jadid block + Madi block. */
export function HomeworkRow({
  row,
  labels,
  locale,
}: Readonly<{
  row: ParentChildHomeworkQuery_parentChildHomework_items;
  labels: ParentMonitoringLabels;
  locale: string;
}>): ReactNode {
  return (
    <Card
      variant="outlined"
      data-testid="parent-homework-row"
      sx={theme => ({
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        padding: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        borderColor: theme.palette.border.main,
      })}
    >
      <Typography variant="body2" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
        {formatApplicantDate(row.createdAt, locale)}
      </Typography>
      <HomeworkTrackBlock
        track={row.jadid}
        trackLabel={labels.trackJadid}
        noneLabel={labels.trackNoneAssigned}
        columnGradeLabel={labels.homeworkColumnGrade}
      />
      <HomeworkTrackBlock
        track={row.madi}
        trackLabel={labels.trackMadi}
        noneLabel={labels.trackNoneAssigned}
        columnGradeLabel={labels.homeworkColumnGrade}
      />
    </Card>
  );
}

/** Renders one track block (Jadid or Madi) — surah/juz + ayah range + grade. */
function HomeworkTrackBlock({
  track,
  trackLabel,
  noneLabel,
  columnGradeLabel,
}: Readonly<{
  track: ParentChildHomeworkQuery_parentChildHomework_items_jadid | null;
  trackLabel: string;
  noneLabel: string;
  columnGradeLabel: string;
}>): ReactNode {
  // A wholly-null block means "none assigned" on this track. The service
  // emits `null` for the whole block when every inner field is null; a
  // partial-null block (non-null block with a null `surahJuz`) is a
  // service-side edge case the defensive `surahJuz === null` branch
  // absorbs by rendering the same "none assigned" copy — never a
  // fabricated surah/juz value.
  if (track?.surahJuz == null) {
    return (
      <Stack
        spacing={1}
        sx={theme => ({
          padding: 1.5,
          borderRadius: 1.5,
          bgcolor: theme.palette.surfaceContainerLow,
        })}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {trackLabel}
        </Typography>
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
          {noneLabel}
        </Typography>
      </Stack>
    );
  }

  const surahJuz = formatSurahJuzRef(track.surahJuz);
  const fromAyah = track.fromAyah ?? "—";
  const toAyah = track.toAyah ?? "—";
  const grade = track.grade === null ? "—" : `${track.grade}`;

  return (
    <Stack
      spacing={1}
      sx={theme => ({
        padding: 1.5,
        borderRadius: 1.5,
        bgcolor: theme.palette.surfaceContainerLow,
      })}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {trackLabel}
      </Typography>
      <Typography variant="body2" dir="auto">
        {surahJuz} · {fromAyah}–{toAyah}
      </Typography>
      <Typography variant="body2" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
        {columnGradeLabel}: {grade}
      </Typography>
    </Stack>
  );
}
