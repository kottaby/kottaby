"use client";

import { useQuery } from "@apollo/client/react";
import { MenuBookOutlined, SearchOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildHomeworkQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { HomeworkSummary } from "@/frontend/views/parent/monitoring/HomeworkSummary";
import { HomeworkRow, HomeworkSkeleton } from "@/frontend/views/parent/monitoring/HomeworkTab.parts";
import { SearchFilterBar } from "@/frontend/views/parent/monitoring/SearchFilterBar";
import { filterHomeworkRows, type SearchFilterState } from "@/frontend/views/parent/monitoring/SearchFilterBar.helpers";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

export function HomeworkTab(props: Readonly<HomeworkTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();
  const [searchState, setSearchState] = useState<SearchFilterState>({ query: "", ratingFilter: null });
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
  } else if (filteredRows?.length === 0 && searchState.query !== "") {
    body = (
      <IconCircleEmptyState
        testId="parent-homework-search-empty"
        icon={<SearchOutlined sx={{ fontSize: 36 }} />}
        title={t.searchNoResults}
        body={""}
      />
    );
  } else {
    body = (
      <>
        <HomeworkSummary items={rows} labels={t} />
        <SearchFilterBar
          state={searchState}
          labels={t}
          onChange={setSearchState}
          resultCount={filteredRows?.length ?? 0}
          totalCount={rows.length}
        />
        <Box
          component="output"
          aria-label={t.homeworkSectionTitle}
          data-testid="parent-homework-list"
          sx={{ display: "grid", gap: 2 }}
        >
          {filteredRows !== undefined
            ? filteredRows.map(row => <HomeworkRow key={row.id} row={row} labels={t} locale={locale} />)
            : null}
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

export interface HomeworkTabProps {
  readonly studentId: number;
}
