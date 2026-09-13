"use client";

import { useQuery } from "@apollo/client/react";
import { PrintOutlined } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildReportsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { type PrintableRow, PrintExportDialog } from "@/frontend/views/parent/monitoring/PrintExportDialog";
import { renderReportsBody } from "@/frontend/views/parent/monitoring/ReportsTab.body";
import {
  DEFAULT_SORT,
  filterReportRows,
  type SearchFilterState,
} from "@/frontend/views/parent/monitoring/SearchFilterBar.helpers";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

export function ReportsTab(props: Readonly<ReportsTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();
  const [printOpen, setPrintOpen] = useState(false);
  const [searchState, setSearchState] = useState<SearchFilterState>({
    query: "",
    ratingFilter: null,
    sort: DEFAULT_SORT,
  });
  const { data, loading, error, refetch } = useQuery(parentChildReportsQueryDocument, {
    variables: { studentId: props.studentId, page: undefined, pageSize: undefined },
  });
  const errorCode = error ? extractErrorCode(error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";
  const rows = data?.parentChildReports?.items;
  const filteredRows = useMemo(
    () =>
      rows !== undefined
        ? filterReportRows(rows, searchState, (row, q) =>
            formatApplicantDate(row.sessionStartedAt ?? row.createdAt, locale)
              .toLowerCase()
              .includes(q)
          )
        : undefined,
    [rows, searchState, locale]
  );
  if (denied) {
    return <PermissionDeniedFallback />;
  }
  const showPrintButton = rows !== undefined && rows.length > 0;
  const body = renderReportsBody(
    rows,
    filteredRows,
    error,
    loading,
    te,
    commonT,
    t,
    locale,
    props.session,
    searchState,
    setSearchState,
    refetch
  );
  const printableRows: readonly PrintableRow[] =
    filteredRows?.map(row => ({
      date: formatApplicantDate(row.sessionStartedAt ?? row.createdAt, locale),
      col2: row.sessionStatus,
      col3: row.studentRatingByTeacher === null ? t.ratingNotRated : String(row.studentRatingByTeacher),
      col4: row.teacherNotes ?? "",
    })) ?? [];
  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {rows === undefined ? t.reportsSectionTitle : t.reportsCount(rows.length)}
        </Typography>
        {showPrintButton ? (
          <IconButton
            className="portal-print-button"
            aria-label={t.printLabel}
            onClick={() => {
              setPrintOpen(true);
            }}
            size="small"
            sx={theme => ({ color: theme.palette.primary.main })}
          >
            <PrintOutlined />
          </IconButton>
        ) : null}
      </Box>
      {body}
      {printOpen ? (
        <PrintExportDialog
          open={printOpen}
          onClose={() => {
            setPrintOpen(false);
          }}
          rows={printableRows}
          childName={props.childName}
          title={t.printDialogTitle}
          colHeaders={[t.attendanceColumnDate, t.csvStatusColumn, t.reportsColumnRating, t.reportsColumnNotes]}
          countLabel={t.reportsCount}
          filePrefix="parent-portal-reports"
        />
      ) : null}
    </Stack>
  );
}

export interface ReportsTabProps {
  readonly studentId: number;
  readonly session: number | null;
  readonly childName: string;
}
