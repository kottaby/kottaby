"use client";

/**
 * AdminTeachersToolbar — the teacher directory's filter + refresh surface.
 *
 * White card (radius 12, `border.light` outline, `shadow.card`), 24px
 * padding. Contents laid out as a single flex row (wrapping allowed below
 * `md` so mobile keeps the full filter surface — this directory has no
 * mobile chip alternative):
 *  1. search field (magnifier leading adornment, ~400px max width),
 *  2. approval select (all / approved / pending),
 *  3. presence select (all / online / offline),
 *  4. evaluator select (all / evaluator / non-evaluator),
 *  5. flex spacer, then a "clear filters" text button (rendered only while
 *     at least one filter is set) and a refresh text button re-fetching the
 *     current page.
 *
 * The select chrome is the SHARED `DirectoryFilterSelect` imported from the
 * users directory (identical 44px outlined control); the reported string is
 * narrowed back to the local filter unions by the runtime guards below.
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
import type {
  TeacherApprovalFilter,
  TeacherEvaluatorFilter,
  TeacherOnlineFilter,
} from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import type { useAdminTeachersDirectory } from "@/frontend/views/admin/teachers/hooks";
import { DirectoryFilterSelect } from "@/frontend/views/admin/users/directory";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

type ToolbarLabels = Pick<AdminTeachersLabels, "filters" | "filterOptions" | "statusPills" | "export">;

/** Directory state slice consumed by the toolbar (from `useAdminTeachersDirectory`). */
type ToolbarDirectory = Pick<
  ReturnType<typeof useAdminTeachersDirectory>,
  | "approvalFilter"
  | "setApprovalFilter"
  | "onlineFilter"
  | "setOnlineFilter"
  | "evaluatorFilter"
  | "setEvaluatorFilter"
  | "searchInput"
  | "setSearchInput"
  | "refetch"
>;

interface AdminTeachersToolbarProps {
  readonly labels: ToolbarLabels;
  readonly directory: ToolbarDirectory;
  /** `true` while the query is in flight (the refresh button shows a busy state). */
  readonly loading: boolean;
  /** `true` when at least one filter is set (renders the clear action). */
  readonly hasFilters: boolean;
  /** Downloads the current page as a localized CSV file (no second fetch). */
  readonly onExportCsv: () => void;
  /** `true` while loading or the current page has no rows — nothing to export. */
  readonly exportDisabled: boolean;
}

/** Runtime narrowing of the select's string value back to the approval union. */
function asApprovalFilter(value: string): TeacherApprovalFilter | "" {
  if (value === "Approved" || value === "Pending") {
    return value;
  }
  return "";
}

/** Runtime narrowing of the select's string value back to the presence union. */
function asOnlineFilter(value: string): TeacherOnlineFilter | "" {
  if (value === "Online" || value === "Offline") {
    return value;
  }
  return "";
}

/** Runtime narrowing of the select's string value back to the evaluator union. */
function asEvaluatorFilter(value: string): TeacherEvaluatorFilter | "" {
  if (value === "Evaluator" || value === "NonEvaluator") {
    return value;
  }
  return "";
}

export function AdminTeachersToolbar({
  labels,
  directory,
  loading,
  hasFilters,
  onExportCsv,
  exportDisabled,
}: AdminTeachersToolbarProps): ReactNode {
  // Stable element ids — wire `InputLabel htmlFor` ↔ control `id` so screen
  // readers announce the label when focus lands on the control (axe-core
  // `aria-input-field-name` rule). Prefixed with the component name to avoid
  // collisions with other admin surfaces.
  const APPROVAL_ID = "admin-teachers-toolbar-approval";
  const ONLINE_ID = "admin-teachers-toolbar-online";
  const EVALUATOR_ID = "admin-teachers-toolbar-evaluator";
  const SEARCH_ID = "admin-teachers-toolbar-search";
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
      <Box
        sx={{ display: "flex", width: "100%", flexWrap: { xs: "wrap", md: "nowrap" }, gap: 2, alignItems: "center" }}
      >
        <TeacherSearchField
          id={SEARCH_ID}
          labels={labels}
          value={directory.searchInput}
          onChange={directory.setSearchInput}
        />
        <DirectoryFilterSelect
          id={APPROVAL_ID}
          label={labels.filters.approval}
          value={directory.approvalFilter}
          onChange={value => directory.setApprovalFilter(asApprovalFilter(value))}
          emptyOptionLabel={labels.filterOptions.all}
          options={[
            { value: "Approved", label: labels.statusPills.approved },
            { value: "Pending", label: labels.statusPills.pending },
          ]}
        />
        <DirectoryFilterSelect
          id={ONLINE_ID}
          label={labels.filters.online}
          value={directory.onlineFilter}
          onChange={value => directory.setOnlineFilter(asOnlineFilter(value))}
          emptyOptionLabel={labels.filterOptions.all}
          options={[
            { value: "Online", label: labels.statusPills.online },
            { value: "Offline", label: labels.statusPills.offline },
          ]}
        />
        <DirectoryFilterSelect
          id={EVALUATOR_ID}
          label={labels.filters.evaluator}
          value={directory.evaluatorFilter}
          onChange={value => directory.setEvaluatorFilter(asEvaluatorFilter(value))}
          emptyOptionLabel={labels.filterOptions.all}
          options={[
            { value: "Evaluator", label: labels.statusPills.evaluator },
            { value: "NonEvaluator", label: labels.filterOptions.nonEvaluator },
          ]}
        />
        <Box sx={{ flex: 1 }} />
        {hasFilters && (
          <Button
            variant="text"
            onClick={() => {
              directory.setApprovalFilter("");
              directory.setOnlineFilter("");
              directory.setEvaluatorFilter("");
              directory.setSearchInput("");
            }}
            sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
          >
            {labels.filters.clear}
          </Button>
        )}
        <ExportCsvButton labels={labels} onExportCsv={onExportCsv} exportDisabled={exportDisabled} />
        <Button
          variant="text"
          startIcon={<RefreshIcon />}
          onClick={() => {
            void directory.refetch();
          }}
          disabled={loading}
          aria-label={labels.filters.refresh}
          sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
        >
          {labels.filters.refresh}
        </Button>
      </Box>
    </Card>
  );
}

interface ExportCsvButtonProps {
  readonly labels: ToolbarLabels;
  readonly onExportCsv: () => void;
  readonly exportDisabled: boolean;
}

/**
 * The export action — same text-button recipe as the refresh action next to
 * it (variant/size/44px floor/`text.secondary` ink). The tooltip switches
 * to the honest "nothing to export" copy while disabled; a `<span>` wrapper
 * keeps the tooltip reachable on a disabled button (disabled elements emit
 * no pointer events).
 */
function ExportCsvButton({ labels, onExportCsv, exportDisabled }: ExportCsvButtonProps): ReactNode {
  return (
    <Tooltip title={exportDisabled ? labels.export.exportCsvEmpty : labels.export.exportCsv} placement="top">
      <Box component="span" sx={{ display: "inline-flex" }}>
        <Button
          variant="text"
          startIcon={<DownloadIcon />}
          onClick={onExportCsv}
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

interface TeacherSearchFieldProps {
  readonly id: string;
  readonly labels: ToolbarLabels;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The toolbar's search input: magnifier leading adornment, fixed 44px height. */
function TeacherSearchField({ id, labels, value, onChange }: TeacherSearchFieldProps): ReactNode {
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
        flex: { xs: "1 1 100%", md: "0 1 auto" },
        width: { xs: "100%", md: 400 },
        maxWidth: 400,
        "& .MuiInputBase-root": { height: 44 },
      }}
    />
  );
}
