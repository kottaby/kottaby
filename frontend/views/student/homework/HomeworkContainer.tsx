"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Stack, Typography } from "@mui/material";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import type { MyHomeworkQuery_myHomework_items } from "@/frontend/graphql/generated/gql/graphql";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { type PrintableRow, PrintExportDialog } from "@/frontend/views/shared/print-export/PrintExportDialog";
import {
  computeHomeworkSummary,
  filterHomeworkByQuery,
  filterHomeworkByStatus,
  type HomeworkStatusFilter,
  toPrintableRows,
} from "@/frontend/views/student/homework/homework.helpers";
import {
  HomeworkListSection,
  HomeworkSkeleton,
  SummaryStrip,
} from "@/frontend/views/student/homework/HomeworkContainer.chrome";
import { useAllMyHomeworkPages } from "@/frontend/views/student/homework/useAllMyHomeworkPages";
import type { HomeworkLabels } from "@/shared/locale/types/homework";
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
 * state; rows present → summary strip + assignment cards. Presentation
 * lives in `HomeworkContainer.chrome` (strip + skeleton + list section)
 * and `HomeworkContainer.parts` (rows + list body).
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

/**
 * The branch-matrix body — the chrome stays mounted above it. Hooks may
 * not sit behind conditional returns, so the two composable lenses are
 * computed before the matrix and every branch renders exactly one arm.
 */
function HomeworkBody(
  props: Readonly<{
    loading: boolean;
    isError: boolean;
    refetch: () => Promise<unknown>;
    errorTitle: string;
    errorBody: string;
    retryLabel: string;
    loadingLabel: string;
    emptyTitle: string;
    emptyBody: string;
    rows: readonly MyHomeworkQuery_myHomework_items[] | undefined;
    labels: HomeworkLabels;
    locale: string;
    printOpen: boolean;
    onPrintOpenChange: (open: boolean) => void;
    printableRows: readonly PrintableRow[];
    statusFilter: HomeworkStatusFilter;
    onStatusFilter: (filter: HomeworkStatusFilter) => void;
    searchQuery: string;
    onSearchChange: (next: { query: string }) => void;
  }>
): ReactNode {
  const { rows, labels: t, locale, searchQuery } = props;
  // The composed view: status bucket FIRST (the summary strip's own
  // predicate), then the free-text lens. Computed before the branch
  // matrix — hooks may not sit behind conditional returns.
  const visibleRows = useMemo(() => {
    if (rows === undefined) {
      return undefined;
    }
    const statusFiltered = filterHomeworkByStatus(rows, props.statusFilter);
    return filterHomeworkByQuery(statusFiltered, searchQuery, (row, q) =>
      formatApplicantDate(row.createdAt, locale).toLowerCase().includes(q)
    );
  }, [rows, props.statusFilter, searchQuery, locale]);
  if (rows === undefined) {
    if (props.isError) {
      return (
        <ErrorRetryAlert
          title={props.errorTitle}
          retryLabel={props.retryLabel}
          retryPending={props.loading}
          onRetry={() => {
            void props.refetch();
          }}
        >
          <Typography variant="body2">{props.errorBody}</Typography>
        </ErrorRetryAlert>
      );
    }
    return <HomeworkSkeleton loadingLabel={props.loadingLabel} />;
  }
  const summary = computeHomeworkSummary(rows);
  const settledVisibleRows = visibleRows ?? rows;
  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <SummaryStrip summary={summary} labels={t} active={props.statusFilter} onToggle={props.onStatusFilter} />
      <HomeworkListSection
        labels={t}
        locale={locale}
        rows={rows}
        settledVisibleRows={settledVisibleRows}
        searchQuery={searchQuery}
        onSearchChange={props.onSearchChange}
        onPrintOpenChange={props.onPrintOpenChange}
        emptyTitle={props.emptyTitle}
        emptyBody={props.emptyBody}
      />
      {props.printOpen ? (
        <PrintExportDialog
          open={props.printOpen}
          onClose={() => {
            props.onPrintOpenChange(false);
          }}
          rows={props.printableRows}
          metaSubject={t.pageTitle}
          title={t.printDialogTitle}
          colHeaders={[t.csvColumnDate, t.csvColumnJadid, t.csvColumnMadi, t.csvColumnGrade]}
          countLabel={t.countLine}
          filePrefix="student-homework"
          labels={{ printOption: t.printOption, exportCsvOption: t.exportCsvOption }}
        />
      ) : null}
    </Stack>
  );
}
