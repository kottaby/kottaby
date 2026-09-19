"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Stack, Typography } from "@mui/material";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { toPrintableRows, type HomeworkStatusFilter } from "@/frontend/views/student/homework/homework.helpers";
import { HomeworkBody } from "@/frontend/views/student/homework/HomeworkContainer.body";
import { useAllMyHomeworkPages } from "@/frontend/views/student/homework/useAllMyHomeworkPages";
import { Common, Errors, Homework, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * HomeworkContainer — the client orchestrator behind `/homework`, the
 * student's own homework history: an always-on chrome (title) over a
 * branch-matrix body (summary strip + assignment list).
 *
 * Data — the shared fetch-all-pages chain over `myHomework` (the student
 * id is server-derived; zero caller-supplied identity). Search + filter —
 * TWO composable lenses over the same rows: the summary cards toggle the
 * status bucket (the same predicate the strip computes) and the SHARED
 * `SearchFilterBar` free-text lens (search-only here — the rating/sort
 * selects stay parent-owned) with the same matching predicate, so the two
 * homework surfaces can never disagree on what "matches". The track
 * blocks are the SHARED `HomeworkTrackBlock` presentation fed
 * namespace-local copy — one Jadid/Madi vocabulary across both surfaces.
 *
 * Render branches (chrome mounts in EVERY branch; only the body swaps):
 * in flight → skeleton; error → retryable alert; zero rows → shared empty
 * state; rows present → summary strip + assignment cards. The body matrix
 * lives in `HomeworkContainer.body`, presentation in
 * `HomeworkContainer.chrome` (strip + list section) and
 * `HomeworkContainer.parts` (rows + list body).
 */
export function HomeworkContainer(): ReactNode {
  const t = useAppTranslation(Homework);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, loading, error, refetch } = useAllMyHomeworkPages();
  const rows = data?.myHomework?.items;
  const [printOpen, setPrintOpen] = useState(false);
  const printableRows = useMemo(
    () => (rows !== undefined ? toPrintableRows(rows, iso => formatApplicantDate(iso, locale)) : []),
    [rows, locale]
  );
  // The student read is zero-identity, so a 403 can only mean a stale
  // role claim — the generic retryable alert covers it (no foreign-id
  // permission-fallback surface exists to disambiguate).
  const isError = error !== undefined && extractErrorCode(error) !== null;
  const [statusFilter, setStatusFilter] = useState<HomeworkStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const onSearchChange = (next: { query: string }) => {
    setSearchQuery(next.query);
  };

  return (
    <Stack data-testid="student-homework-view" sx={{ gap: 3 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {t.pageTitle}
      </Typography>
      <HomeworkBody
        loading={loading}
        isError={isError}
        refetch={refetch}
        errorTitle={te.internalServerError}
        errorBody={t.errorBody}
        retryLabel={commonT.retry}
        loadingLabel={t.loadingLabel}
        emptyTitle={t.emptyTitle}
        emptyBody={t.emptyBody}
        rows={rows}
        labels={t}
        locale={locale}
        printOpen={printOpen}
        onPrintOpenChange={setPrintOpen}
        printableRows={printableRows}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />
    </Stack>
  );
}
