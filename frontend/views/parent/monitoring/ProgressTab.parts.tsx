"use client";

import { Card, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildProgressQuery_parentChildProgress_latestJadidPosition } from "@/frontend/graphql/generated/gql/graphql";
import { formatSurahJuzRef } from "@/frontend/views/parent/monitoring/parentMonitoringDisplay";

/**
 * Presentational parts of the ProgressTab — the skeleton placeholder,
 * the latest-position block, and the empty-progress inline notice.
 * Extracted from the stateful tab so the hook-bearing component stays
 * inside the file-size budget (frontend/views/* is capped at 150 lines
 * per `oxlint.config.mts`).
 */

/** Stable skeleton keys (avoids `noArrayIndexKey`). */
const PROGRESS_SKELETON_KEYS: readonly string[] = ["progress-skeleton-jadid", "progress-skeleton-madi"];

/** Skeleton placeholder for the initial-load state. */
export function ProgressSkeleton(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="parent-progress-loading" sx={{ gap: 2 }}>
      {PROGRESS_SKELETON_KEYS.map(key => (
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
          <Skeleton variant="text" sx={{ fontSize: "1rem", maxWidth: 160 }} />
          <Skeleton variant="rectangular" sx={{ height: 56, borderRadius: 2 }} />
        </Card>
      ))}
    </Stack>
  );
}

/**
 * One latest-position block (Jadid or Madi). When the position slot is
 * `null` the "no recorded position" inline copy renders under the track
 * label — never a fabricated surah/juz value. Otherwise the block shows
 * the surah/juz reference and the ayah range the child is currently on.
 */
export function ProgressPositionBlock({
  position,
  trackLabel,
  noneLabel,
}: Readonly<{
  position: ParentChildProgressQuery_parentChildProgress_latestJadidPosition | null;
  trackLabel: string;
  noneLabel: string;
}>): ReactNode {
  return (
    <Card
      variant="outlined"
      sx={theme => ({
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        borderColor: theme.palette.border.main,
      })}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {trackLabel}
      </Typography>
      {position === null ? (
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
          {noneLabel}
        </Typography>
      ) : (
        <ProgressPositionRun position={position} />
      )}
    </Card>
  );
}

/** Renders the surah/juz + ayah range for a non-null position slot. */
function ProgressPositionRun({
  position,
}: Readonly<{ position: ParentChildProgressQuery_parentChildProgress_latestJadidPosition }>): ReactNode {
  const surahJuz = formatSurahJuzRef(position.surahJuz);
  const fromAyah = position.fromAyah ?? "—";
  const toAyah = position.toAyah ?? "—";
  return (
    <Typography variant="body2" dir="auto">
      {surahJuz} · {fromAyah}–{toAyah}
    </Typography>
  );
}
