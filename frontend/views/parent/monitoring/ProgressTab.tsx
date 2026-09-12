"use client";

import { useQuery } from "@apollo/client/react";
import { TrendingUpOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildProgressQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { ProgressPositionBlock, ProgressSkeleton } from "@/frontend/views/parent/monitoring/ProgressTab.parts";
import { Common, Errors, ParentMonitoring, useAppTranslation } from "@/shared/locale";

/**
 * ProgressTab — the child's curriculum-progress summary: the
 * `progress` table row count plus the latest Jadid / Madi positions
 * from the most recent `home_work` row. The read is honest — no
 * fabricated percentages over the skeleton curriculum tables; the
 * count and the two latest positions are surfaced verbatim.
 *
 * A stateful `useQuery(parentChildProgressQueryDocument)` re-keyed on
 * the `studentId` prop so Apollo re-fetches whenever the active child
 * changes (cache isolation: the `?student=` URL param IS the read
 * scope). The payload is one composite object: the child echo
 * (already-loaded on the detail header), `progressRowCount` (non-null
 * integer), and two nullable position slots `latestJadidPosition` /
 * `latestMadiPosition` (each exposing `surahJuz` + the nullable ayah
 * range). A `null` slot renders the localized "no recorded position"
 * copy — never a fabricated surah/juz value.
 *
 * Render state matrix (one rendering path per branch — no dead arms):
 *  - loading → skeleton region (`component="output" aria-busy`)
 *  - FORBIDDEN → `PermissionDeniedFallback` (constant-shape denial —
 *    the server's `message` is NEVER rendered)
 *  - other errors → `ErrorRetryAlert` (retry refetches)
 *  - zero progress rows AND both positions null → `IconCircleEmptyState`
 *    with localized copy
 *  - otherwise → row count heading + Jadid position block + Madi
 *    position block (each block falls back to the "no recorded
 *    position" inline copy when its slot is null)
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, `dir="auto"` on the surah/juz run
 * (bidi isolation — digits stay Latin under both locales). Every
 * user-facing string resolves through the `ParentMonitoring` /
 * `Errors` / `Common` namespace handles.
 */
export function ProgressTab(props: Readonly<ProgressTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);

  const { data, loading, error, refetch } = useQuery(parentChildProgressQueryDocument, {
    variables: { studentId: props.studentId },
  });

  const errorCode = error === undefined ? null : extractErrorCode(error);
  if (errorCode === "FORBIDDEN" || errorCode === "UNAUTHORIZED") {
    return <PermissionDeniedFallback />;
  }

  const progress = data?.parentChildProgress;
  const isEmpty =
    progress?.progressRowCount === 0 && progress?.latestJadidPosition === null && progress?.latestMadiPosition === null;

  let body: ReactNode;
  if (progress === undefined) {
    body =
      error === undefined ? (
        <ProgressSkeleton />
      ) : (
        <ErrorRetryAlert
          title={te.internalServerError}
          retryLabel={commonT.retry}
          retryPending={loading}
          onRetry={() => {
            void refetch();
          }}
        >
          <Typography variant="body2">{t.loadErrorBody}</Typography>
        </ErrorRetryAlert>
      );
  } else if (isEmpty) {
    body = (
      <IconCircleEmptyState
        testId="parent-progress-empty"
        icon={<TrendingUpOutlined sx={{ fontSize: 36 }} />}
        title={t.progressEmptyTitle}
        body={t.progressEmptyBody}
      />
    );
  } else {
    body = (
      <Box
        component="output"
        aria-label={t.progressSectionTitle}
        data-testid="parent-progress-list"
        sx={{ display: "grid", gap: 2 }}
      >
        {progress.progressRowCount === 0 ? (
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.progressNoRecorded}
          </Typography>
        ) : null}
        <ProgressPositionBlock
          position={progress.latestJadidPosition}
          trackLabel={t.progressLatestJadidLabel}
          noneLabel={t.progressPositionNone}
        />
        <ProgressPositionBlock
          position={progress.latestMadiPosition}
          trackLabel={t.progressLatestMadiLabel}
          noneLabel={t.progressPositionNone}
        />
      </Box>
    );
  }

  const heading =
    progress === undefined || isEmpty ? t.progressSectionTitle : t.progressRowCount(progress.progressRowCount);

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {heading}
      </Typography>
      {body}
    </Stack>
  );
}

/** Props contract for the ProgressTab (carries the active child id). */
export interface ProgressTabProps {
  /** The active child id (re-keys the Apollo query — rows never leak across children). */
  readonly studentId: number;
}
