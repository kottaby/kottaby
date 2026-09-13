"use client";

import { useQuery } from "@apollo/client/react";
import { PrintOutlined } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildHomeworkQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { renderHomeworkBody } from "@/frontend/views/parent/monitoring/HomeworkTab.body";
import { PrintExportDialog } from "@/frontend/views/parent/monitoring/PrintExportDialog";
import {
  DEFAULT_SORT,
  filterHomeworkRows,
  type SearchFilterState,
} from "@/frontend/views/parent/monitoring/SearchFilterBar.helpers";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

export function HomeworkTab(props: Readonly<HomeworkTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();
  const [searchState, setSearchState] = useState<SearchFilterState>({
    query: "",
    ratingFilter: null,
    sort: DEFAULT_SORT,
  });
  const [printOpen, setPrintOpen] = useState(false);
  const { data, loading, error, refetch } = useQuery(parentChildHomeworkQueryDocument, {
    variables: { studentId: props.studentId, page: undefined, pageSize: undefined },
  });
  const errorCode = error ? extractErrorCode(error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";
  const rows = data?.parentChildHomework?.items;
  const filteredRows = useMemo(
    () =>
      rows !== undefined
        ? filterHomeworkRows(rows, searchState, (row, q) =>
            formatApplicantDate(row.createdAt, locale).toLowerCase().includes(q)
          )
        : undefined,
    [rows, searchState, locale]
  );
  if (denied) {
    return <PermissionDeniedFallback />;
  }
  const body = renderHomeworkBody(
    rows,
    filteredRows,
    error,
    loading,
    te,
    commonT,
    t,
    locale,
    searchState,
    setSearchState,
    refetch
  );
  const showPrintButton = rows !== undefined && rows.length > 0;
  const printableRows =
    filteredRows !== undefined
      ? filteredRows.map(item => ({
          date: formatApplicantDate(item.createdAt, locale),
          col2: item.jadid?.surahJuz ?? "",
          col3: item.madi?.surahJuz ?? "",
          col4: [item.jadid?.grade, item.madi?.grade]
            .filter(g => g !== null && g !== undefined)
            .map(g => String(g))
            .join("/"),
        }))
      : [];
  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {rows === undefined ? t.homeworkSectionTitle : t.homeworkCount(rows.length)}
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
          childName={String(props.studentId)}
          title={t.homeworkPrintDialogTitle}
          colHeaders={[t.attendanceColumnDate, t.csvJadidColumn, t.csvMadiColumn, t.csvGradeColumn]}
          countLabel={t.homeworkCount}
          filePrefix="parent-portal-homework"
        />
      ) : null}
    </Stack>
  );
}

export interface HomeworkTabProps {
  readonly studentId: number;
}
