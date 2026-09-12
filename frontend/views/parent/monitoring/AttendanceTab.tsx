"use client";

import { useQuery } from "@apollo/client/react";
import { CalendarMonthOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildSessionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { AttendanceRow, AttendanceSkeleton } from "@/frontend/views/parent/monitoring/AttendanceTab.parts";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * AttendanceTab — the child's session-status-derived attendance history.
 *
 * A stateful `useQuery(parentChildSessionsQueryDocument)` re-keyed on the
 * `studentId` prop so Apollo re-fetches whenever the active child changes
 * (cache isolation: the `?student=` URL param IS the read scope). Rows
 * arrive newest-first; each row carries the lifecycle `status` enum
 * (mapped one-to-one onto the five `attendanceStatus*` label slots) plus
 * the nullable `startedAt` / `endedAt` timestamps. A `scheduled` row has
 * neither; a `started` row has only `startedAt`; a `completed` row has
 * both. `createdAt` is the row's audit stamp (used as the fallback date
 * when `startedAt` is null).
 *
 * Render state matrix (one rendering path per branch — no dead arms):
 *  - loading → skeleton region (`component="output" aria-busy`)
 *  - FORBIDDEN → `PermissionDeniedFallback` (constant-shape denial — the
 *    server's `message` is NEVER rendered)
 *  - other errors → `ErrorRetryAlert` (retry refetches)
 *  - zero rows → `IconCircleEmptyState` with localized copy
 *  - ≥1 row → per-row `Card`s with the date + status chip
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, `dir="auto"` on dates (bidi isolation).
 * Every user-facing string resolves through the `ParentMonitoring` /
 * `Errors` / `Common` namespace handles (property access only).
 */
export function AttendanceTab(props: Readonly<AttendanceTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, loading, error, refetch } = useQuery(parentChildSessionsQueryDocument, {
    variables: { studentId: props.studentId, page: undefined, pageSize: undefined },
  });

  const errorCode = error === undefined ? null : extractErrorCode(error);
  if (errorCode === "FORBIDDEN" || errorCode === "UNAUTHORIZED") {
    return <PermissionDeniedFallback />;
  }

  const rows = data?.parentChildSessions?.items;

  let body: ReactNode;
  if (rows === undefined) {
    body =
      error === undefined ? (
        <AttendanceSkeleton />
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
        testId="parent-attendance-empty"
        icon={<CalendarMonthOutlined sx={{ fontSize: 36 }} />}
        title={t.attendanceEmptyTitle}
        body={t.attendanceEmptyBody}
      />
    );
  } else {
    body = (
      <Box
        component="output"
        aria-label={t.attendanceSectionTitle}
        data-testid="parent-attendance-list"
        sx={{ display: "grid", gap: 2 }}
      >
        {rows.map(row => (
          <AttendanceRow key={row.id} row={row} labels={t} locale={locale} />
        ))}
      </Box>
    );
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {rows === undefined ? t.attendanceSectionTitle : t.attendanceCount(rows.length)}
      </Typography>
      {body}
    </Stack>
  );
}

/** Props contract for the AttendanceTab (carries the active child id). */
export interface AttendanceTabProps {
  /** The active child id (re-keys the Apollo query — rows never leak across children). */
  readonly studentId: number;
}
