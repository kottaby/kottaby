"use client";

import { useQuery } from "@apollo/client/react";
import { MenuBookOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildHomeworkQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { HomeworkSummary } from "@/frontend/views/parent/monitoring/HomeworkSummary";
import { HomeworkRow, HomeworkSkeleton } from "@/frontend/views/parent/monitoring/HomeworkTab.parts";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * HomeworkTab — the child's homework window (Jadid & Madi tracks).
 *
 * A stateful `useQuery(parentChildHomeworkQueryDocument)` re-keyed on the
 * `studentId` prop so Apollo re-fetches whenever the active child changes.
 * Rows arrive newest-first; each row carries the joined session's
 * `sessionId`, the two nullable track blocks `jadid` / `madi` (each
 * exposing `surahJuz` / `fromAyah` / `toAyah` / `grade` — all nullable, a
 * fully-null block means "none assigned" on that track), and the homework
 * `createdAt`. `totalCount` / `page` / `pageSize` form the honest envelope.
 *
 * Render state matrix (one rendering path per branch — no dead arms):
 *  - loading → skeleton region (`component="output" aria-busy`)
 *  - FORBIDDEN → `PermissionDeniedFallback` (constant-shape denial)
 *  - other errors → `ErrorRetryAlert` (retry refetches)
 *  - zero rows → `IconCircleEmptyState` with localized copy
 *  - ≥1 row → per-row `Card`s with the date + Jadid block + Madi block
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, `dir="auto"` on the surah/juz run (bidi
 * isolation — digits stay Latin under both locales). Every user-facing
 * string resolves through the `ParentMonitoring` / `Errors` / `Common`
 * namespace handles.
 */
export function HomeworkTab(props: Readonly<HomeworkTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, loading, error, refetch } = useQuery(parentChildHomeworkQueryDocument, {
    variables: { studentId: props.studentId, page: undefined, pageSize: undefined },
  });

  const errorCode = error ? extractErrorCode(error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";
  if (denied) {
    return <PermissionDeniedFallback />;
  }

  const rows = data?.parentChildHomework?.items;

  let body: ReactNode;
  if (rows === undefined) {
    body =
      error === undefined ? (
        <HomeworkSkeleton />
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
  } else if (rows.length === 0) {
    body = (
      <IconCircleEmptyState
        testId="parent-homework-empty"
        icon={<MenuBookOutlined sx={{ fontSize: 36 }} />}
        title={t.homeworkEmptyTitle}
        body={t.homeworkEmptyBody}
      />
    );
  } else {
    body = (
      <>
        <HomeworkSummary items={rows} labels={t} />
        <Box
          component="output"
          aria-label={t.homeworkSectionTitle}
          data-testid="parent-homework-list"
          sx={{ display: "grid", gap: 2 }}
        >
          {rows.map(row => (
            <HomeworkRow key={row.id} row={row} labels={t} locale={locale} />
          ))}
        </Box>
      </>
    );
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {rows === undefined ? t.homeworkSectionTitle : t.homeworkCount(rows.length)}
      </Typography>
      {body}
    </Stack>
  );
}

/** Props contract for the HomeworkTab (carries the active child id). */
export interface HomeworkTabProps {
  /** The active child id (re-keys the Apollo query — rows never leak across children). */
  readonly studentId: number;
}
