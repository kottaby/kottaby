"use client";

import { useQuery } from "@apollo/client/react";
import { DescriptionOutlined, PrintOutlined } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { parentChildReportsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { type PrintableReportRow, PrintExportDialog } from "@/frontend/views/parent/monitoring/PrintExportDialog";
import { RatingTrendChart } from "@/frontend/views/parent/monitoring/RatingTrendChart";
import { ReportRow, ReportsSkeleton } from "@/frontend/views/parent/monitoring/ReportsTab.parts";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

export function ReportsTab(props: Readonly<ReportsTabProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();
  const [printOpen, setPrintOpen] = useState(false);
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
  const showPrintButton = rows !== undefined && rows.length > 0;
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
      <>
        <RatingTrendChart items={rows} labels={t} locale={locale} />
        <Box
          className="printable-section"
          component="output"
          aria-label={t.reportsSectionTitle}
          data-testid="parent-reports-list"
          sx={{ display: "grid", gap: 2 }}
        >
          {rows.map(row => (
            <ReportRow key={row.id} row={row} labels={t} locale={locale} deepLinkSessionId={props.session} />
          ))}
          <Typography
            className="print-timestamp"
            variant="caption"
            sx={theme => ({ color: theme.palette.text.secondary })}
          >
            {t.printTimestampLabel(formatApplicantDate(new Date().toISOString(), locale))}
          </Typography>
        </Box>
      </>
    );
  }
  const printableRows: readonly PrintableReportRow[] =
    rows?.map(row => ({
      date: formatApplicantDate(row.sessionStartedAt ?? row.createdAt, locale),
      status: row.sessionStatus,
      rating: row.studentRatingByTeacher,
      notes: row.teacherNotes,
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
