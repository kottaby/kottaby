"use client";

import { useQuery } from "@apollo/client/react";
import { GradingOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildReportsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { EvaluationRow, EvaluationsSkeleton } from "@/frontend/views/parent/monitoring/EvaluationsTab.parts";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * EvaluationsTab — the child's per-session evaluation window, served
 * through the evaluations lens on the same `parentChildReports` rows:
 * reports and evaluations share one query with two client-side
 * projections. Each row's `studentRatingByTeacher` is the teacher's
 * evaluation score for that session; `null` renders the localized
 * "not rated yet" copy (NEVER coerced to `0`).
 *
 * A stateful `useQuery(parentChildReportsQueryDocument)` re-keyed on the
 * `studentId` prop so Apollo re-fetches whenever the active child
 * changes (cache isolation: the `?student=` URL param IS the read
 * scope). Rows arrive newest-first; each row carries the joined
 * session's `sessionStatus` + `sessionStartedAt` (the date renders
 * without a second query), the teacher-authored `teacherNotes`
 * (nullable — rendered verbatim, never as ""), and the
 * `studentRatingByTeacher` (nullable — `null` renders "not rated yet").
 *
 * Render state matrix (one rendering path per branch — no dead arms):
 *  - loading → skeleton region (`component="output" aria-busy`)
 *  - FORBIDDEN → `PermissionDeniedFallback` (constant-shape denial —
 *    the server's `message` is NEVER rendered)
 *  - other errors → `ErrorRetryAlert` (retry refetches)
 *  - zero rows → `IconCircleEmptyState` with localized copy
 *  - ≥1 row → per-row `Card`s with the date + score + notes
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, `dir="auto"` on dates + notes (bidi
 * isolation). Every user-facing string resolves through the
 * `ParentMonitoring` / `Errors` / `Common` namespace handles.
 */
export function EvaluationsTab(props: Readonly<EvaluationsTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, loading, error, refetch } = useQuery(parentChildReportsQueryDocument, {
    variables: { studentId: props.studentId, page: undefined, pageSize: undefined },
  });

  const errorCode = error ? extractErrorCode(error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";
  if (denied) {
    return <PermissionDeniedFallback />;
  }

  const rows = data?.parentChildReports?.items;

  let body: ReactNode;
  if (rows === undefined) {
    body =
      error === undefined ? (
        <EvaluationsSkeleton />
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
        testId="parent-evaluations-empty"
        icon={<GradingOutlined sx={{ fontSize: 36 }} />}
        title={t.evaluationsEmptyTitle}
        body={t.evaluationsEmptyBody}
      />
    );
  } else {
    body = (
      <Box
        component="output"
        aria-label={t.evaluationsSectionTitle}
        data-testid="parent-evaluations-list"
        sx={{ display: "grid", gap: 2 }}
      >
        {rows.map(row => (
          <EvaluationRow key={row.id} row={row} labels={t} locale={locale} />
        ))}
      </Box>
    );
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {rows === undefined ? t.evaluationsSectionTitle : t.evaluationsCount(rows.length)}
      </Typography>
      {body}
    </Stack>
  );
}

/** Props contract for the EvaluationsTab (carries the active child id). */
export interface EvaluationsTabProps {
  /** The active child id (re-keys the Apollo query — rows never leak across children). */
  readonly studentId: number;
}
