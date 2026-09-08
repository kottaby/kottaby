"use client";

/**
 * AdminApplicantsToolbar — the applicant queue's filter + refresh + export
 * surface.
 *
 * White card (radius 12, `border.light` outline, `shadow.card`), 24px
 * padding. Contents laid out as a COLUMN of two rows:
 *  1. the controls row — a wrapping flex row (wraps at ALL breakpoints so
 *     narrow content widths stack instead of overflowing the card):
 *     a. search field (magnifier leading adornment, ~400px max width),
 *     b. status select (all / pending / in-evaluation / failed / passed),
 *     c. flex spacer, then a "clear filters" text button (rendered only
 *        while at least one filter is set), the EXPORT CSV text button
 *        (server-side export-all — the same recipe as the directory tab's
 *        export, sharing its labels), and a refresh text button
 *        re-fetching the current page,
 *  2. the `ApplicantStatusQuickFilters` chip strip — five count-bearing
 *     quick-filter chips composing with the SAME status-filter state the
 *     select drives.
 *
 * The select chrome is the SHARED `DirectoryFilterSelect` imported from the
 * users directory (identical 44px outlined control); the reported string is
 * narrowed back to the status filter union by the runtime guard below.
 * Label slices are passed down narrowed — nothing is hardcoded. All colors
 * resolve through theme-callback sx.
 */

import {
  FileDownloadOutlined as DownloadIcon,
  RefreshOutlined as RefreshIcon,
  SearchOutlined as SearchIcon,
} from "@mui/icons-material";
import { Box, Button, Card, TextField, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { ApplicantStatusQuickFilters } from "@/frontend/views/admin/teachers/ApplicantStatusQuickFilters";
import {
  ADMIN_APPLICANT_STATUSES,
  type ApplicantStatusFilter,
  asApplicantStatusFilter,
} from "@/frontend/views/admin/teachers/adminApplicants.helpers";
import type { useAdminTeacherApplicants } from "@/frontend/views/admin/teachers/hooks";
import { DirectoryFilterSelect } from "@/frontend/views/admin/users/directory";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

type ToolbarLabels = Pick<AdminTeachersLabels, "filters" | "filterOptions" | "headers" | "applicantStatus" | "export">;

/** Queue state slice consumed by the toolbar (from `useAdminTeacherApplicants`). */
type ToolbarApplicants = Pick<
  ReturnType<typeof useAdminTeacherApplicants>,
  "statusFilter" | "setStatusFilter" | "searchInput" | "setSearchInput" | "refetch" | "statusCounts"
>;

interface AdminApplicantsToolbarProps {
  readonly labels: ToolbarLabels;
  readonly applicants: ToolbarApplicants;
  /** `true` while the query is in flight (the refresh button shows a busy state). */
  readonly loading: boolean;
  /** `true` when at least one filter is set (renders the clear action). */
  readonly hasFilters: boolean;
  /** Runs the server-side export-all query and downloads the CSV file. */
  readonly onExportCsv: () => void;
  /** `true` while the export query is in flight (the export button shows a busy state). */
  readonly exportLoading: boolean;
  /** `true` while loading or the filtered total is zero — nothing to export. */
  readonly exportDisabled: boolean;
}

export function AdminApplicantsToolbar({
  labels,
  applicants,
  loading,
  hasFilters,
  onExportCsv,
  exportLoading,
  exportDisabled,
}: AdminApplicantsToolbarProps): ReactNode {
  // Stable element ids — wire `InputLabel htmlFor` ↔ control `id` so screen
  // readers announce the label when focus lands on the control (axe-core
  // `aria-input-field-name` rule). Prefixed with the component name to avoid
  // collisions with other admin surfaces.
  const STATUS_ID = "admin-applicants-toolbar-status";
  const SEARCH_ID = "admin-applicants-toolbar-search";
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 3,
        display: "flex",
      })}
    >
      <Box sx={{ display: "flex", flexDirection: "column", width: "100%", gap: 2 }}>
        <Box sx={{ display: "flex", width: "100%", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
          <ApplicantSearchField
            id={SEARCH_ID}
            labels={labels}
            value={applicants.searchInput}
            onChange={applicants.setSearchInput}
          />
          <DirectoryFilterSelect
            id={STATUS_ID}
            label={labels.headers.status}
            value={applicants.statusFilter}
            onChange={value => applicants.setStatusFilter(asApplicantStatusFilter(value))}
            emptyOptionLabel={labels.filterOptions.all}
            options={ADMIN_APPLICANT_STATUSES.map(status => ({
              value: status,
              label: applicantStatusLabelOf(status, labels),
            }))}
          />
          <Box sx={{ flex: 1 }} />
          {hasFilters && (
            <Button
              variant="text"
              onClick={() => {
                applicants.setStatusFilter("");
                applicants.setSearchInput("");
              }}
              sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
            >
              {labels.filters.clear}
            </Button>
          )}
          <ExportCsvButton
            labels={labels}
            onExportCsv={onExportCsv}
            exportLoading={exportLoading}
            exportDisabled={exportDisabled}
          />
          <Button
            variant="text"
            startIcon={<RefreshIcon />}
            onClick={() => {
              void applicants.refetch();
            }}
            disabled={loading}
            aria-label={labels.filters.refresh}
            sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
          >
            {labels.filters.refresh}
          </Button>
        </Box>
        <ApplicantStatusQuickFilters
          labels={labels}
          statusFilter={applicants.statusFilter}
          setStatusFilter={applicants.setStatusFilter}
          statusCounts={applicants.statusCounts}
        />
      </Box>
    </Card>
  );
}

/** Localized label of one canonical status value (total map — no fallback path). */
function applicantStatusLabelOf(status: ApplicantStatusFilter, labels: ToolbarLabels): string {
  switch (status) {
    case "pending":
      return labels.applicantStatus.pending;
    case "in_evaluation":
      return labels.applicantStatus.inEvaluation;
    case "failed":
      return labels.applicantStatus.failed;
    case "passed":
      return labels.applicantStatus.passed;
  }
}

interface ExportCsvButtonProps {
  readonly labels: ToolbarLabels;
  readonly onExportCsv: () => void;
  readonly exportLoading: boolean;
  readonly exportDisabled: boolean;
}

/**
 * The queue's export action — the same text-button recipe as the directory
 * tabs' export (Tooltip + span wrapper with `flexShrink: 0`, 44px floor,
 * `text.secondary` ink; MUI's leading spinner while the export-all query
 * is in flight). The tooltip switches to the honest "nothing to export"
 * copy while disabled.
 */
function ExportCsvButton({ labels, onExportCsv, exportLoading, exportDisabled }: ExportCsvButtonProps): ReactNode {
  return (
    <Tooltip title={exportDisabled ? labels.export.exportCsvEmpty : labels.export.exportCsv} placement="top">
      <Box component="span" sx={{ display: "inline-flex", flexShrink: 0 }}>
        <Button
          variant="text"
          startIcon={<DownloadIcon />}
          onClick={onExportCsv}
          loading={exportLoading}
          disabled={exportDisabled}
          aria-label={labels.export.exportCsv}
          sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
        >
          {labels.export.exportCsv}
        </Button>
      </Box>
    </Tooltip>
  );
}

interface ApplicantSearchFieldProps {
  readonly id: string;
  readonly labels: ToolbarLabels;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The toolbar's search input: magnifier leading adornment, fixed 44px height. */
function ApplicantSearchField({ id, labels, value, onChange }: ApplicantSearchFieldProps): ReactNode {
  return (
    <TextField
      id={id}
      hiddenLabel
      placeholder={labels.filters.searchPlaceholder}
      value={value}
      onChange={event => onChange(event.target.value)}
      slotProps={{
        htmlInput: { "aria-label": labels.filters.search },
        input: {
          startAdornment: (
            <SearchIcon fontSize="small" sx={theme => ({ marginInlineEnd: 1, color: theme.palette.text.secondary })} />
          ),
        },
      }}
      sx={{
        flex: { xs: "1 1 100%", sm: "1 1 300px" },
        maxWidth: 400,
        "& .MuiInputBase-root": { height: 44 },
      }}
    />
  );
}
