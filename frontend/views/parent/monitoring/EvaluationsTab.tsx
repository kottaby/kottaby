"use client";

import { useQuery } from "@apollo/client/react";
import { GradingOutlined, SearchOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildReportsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { EvaluationsSummary } from "@/frontend/views/parent/monitoring/EvaluationsSummary";
import { EvaluationRow, EvaluationsSkeleton } from "@/frontend/views/parent/monitoring/EvaluationsTab.parts";
import { SearchFilterBar } from "@/frontend/views/parent/monitoring/SearchFilterBar";
import {
  DEFAULT_SORT,
  filterReportRows,
  type SearchFilterState,
} from "@/frontend/views/parent/monitoring/SearchFilterBar.helpers";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

export function EvaluationsTab(props: Readonly<EvaluationsTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();
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
  } else if (filteredRows?.length === 0 && (searchState.query !== "" || searchState.ratingFilter !== null)) {
    body = (
      <IconCircleEmptyState
        testId="parent-evaluations-search-empty"
        icon={<SearchOutlined sx={{ fontSize: 36 }} />}
        title={t.searchNoResults}
        body={""}
      />
    );
  } else {
    body = (
      <>
        <EvaluationsSummary items={rows} labels={t} />
        <SearchFilterBar
          state={searchState}
          labels={t}
          onChange={setSearchState}
          resultCount={filteredRows?.length ?? 0}
          totalCount={rows.length}
        />
        <Box
          component="output"
          aria-label={t.evaluationsSectionTitle}
          data-testid="parent-evaluations-list"
          sx={{ display: "grid", gap: 2 }}
        >
          {filteredRows !== undefined
            ? filteredRows.map(row => <EvaluationRow key={row.id} row={row} labels={t} locale={locale} />)
            : null}
        </Box>
      </>
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

export interface EvaluationsTabProps {
  readonly studentId: number;
}
