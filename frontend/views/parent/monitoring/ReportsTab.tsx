"use client";

import { useQuery } from "@apollo/client/react";
import { DescriptionOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildReportsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { ReportRow, ReportsSkeleton } from "@/frontend/views/parent/monitoring/ReportsTab.parts";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * ReportsTab — the child's session report window (teacher notes + ratings).
 *
 * A stateful `useQuery(parentChildReportsQueryDocument)` re-keyed on the
 * `studentId` prop so Apollo re-fetches whenever the active child changes.
 * Rows arrive newest-first; each row carries the joined session's
 * `sessionStatus` + `sessionStartedAt` (so the date renders without a
 * second query), the teacher-authored `teacherNotes` (nullable — rendered
 * as the rating-not-rated-style fallback copy, never coerced to ""), and
 * the `studentRatingByTeacher` (nullable — `null` renders "not rated yet",
 * NEVER `0`). `totalCount` / `page` / `pageSize` form the honest envelope.
 *
 * Deep-link target: when the `session` prop is set (a `?session=<id>` URL
 * param forwarded by the detail container) and a row with that
 * `sessionId` is present, the row is scrolled into view on mount.
 *
 * Render state matrix (one rendering path per branch — no dead arms):
 *  - loading → skeleton region (`component="output" aria-busy`)
 *  - FORBIDDEN → `PermissionDeniedFallback` (constant-shape denial)
 *  - other errors → `ErrorRetryAlert` (retry refetches)
 *  - zero rows → `IconCircleEmptyState` with localized copy
 *  - ≥1 row → per-row `Card`s with the date + rating + notes
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, `dir="auto"` on dates + notes (bidi
 * isolation). Every user-facing string resolves through the
 * `ParentMonitoring` / `Errors` / `Common` namespace handles.
 */
export function ReportsTab(props: Readonly<ReportsTabProps>): ReactNode {
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
        <ReportsSkeleton />
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
        testId="parent-reports-empty"
        icon={<DescriptionOutlined sx={{ fontSize: 36 }} />}
        title={t.reportsEmptyTitle}
        body={t.reportsEmptyBody}
      />
    );
  } else {
    body = (
      <Box
        component="output"
        aria-label={t.reportsSectionTitle}
        data-testid="parent-reports-list"
        sx={{ display: "grid", gap: 2 }}
      >
        {rows.map(row => (
          <ReportRow key={row.id} row={row} labels={t} locale={locale} deepLinkSessionId={props.session} />
        ))}
      </Box>
    );
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {rows === undefined ? t.reportsSectionTitle : t.reportsCount(rows.length)}
      </Typography>
      {body}
    </Stack>
  );
}

/** Props contract for the ReportsTab. */
export interface ReportsTabProps {
  /** The active child id (re-keys the Apollo query — rows never leak across children). */
  readonly studentId: number;
  /**
   * Optional deep-link target session id (from `?session=<id>`). When set
   * and a row with that `sessionId` is present, the row is scrolled into
   * view on mount.
   */
  readonly session: number | null;
}
