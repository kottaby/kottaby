"use client";

/**
 * AdminStudentsToolbar — the student directory's filter + refresh surface.
 *
 * White card (radius 12, `border.light` outline, `shadow.card`), 24px
 * padding. Contents laid out as a wrapping flex row (wraps at ALL
 * breakpoints so narrow content widths stack instead of overflowing the
 * card — this directory has no mobile chip alternative):
 *  1. search field (magnifier leading adornment, ~400px max width),
 *  2. parent-link select (all / with parent / independent),
 *  3. language field (exact-match filter — the draft commits on Enter or
 *     through the Apply icon button so intermediate keystrokes never fire
 *     wasted queries),
 *  4. flex spacer, then a "clear filters" text button (rendered only while
 *     at least one filter is set) and a refresh text button re-fetching the
 *     current page.
 *
 * The select chrome is the SHARED `DirectoryFilterSelect` imported from the
 * users directory (identical 44px outlined control); the reported string is
 * narrowed back to the local filter union by the runtime guard below.
 * Label slices are passed down narrowed — nothing is hardcoded. All colors
 * resolve through theme-callback sx.
 */

import {
  CheckOutlined as ApplyIcon,
  FileDownloadOutlined as DownloadIcon,
  RefreshOutlined as RefreshIcon,
  SearchOutlined as SearchIcon,
} from "@mui/icons-material";
import { Box, Button, Card, IconButton, InputAdornment, TextField, Tooltip } from "@mui/material";
import type { KeyboardEvent, ReactNode } from "react";
import type { StudentHasParentFilter } from "@/frontend/views/admin/students/adminStudentsDirectory.helpers";
import type { useAdminStudentsDirectory } from "@/frontend/views/admin/students/hooks";
import { DirectoryFilterSelect } from "@/frontend/views/admin/users/directory";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

type ToolbarLabels = Pick<AdminStudentsLabels, "filters" | "filterOptions" | "parentLabels" | "export">;

/** Directory state slice consumed by the toolbar (from `useAdminStudentsDirectory`). */
type ToolbarDirectory = Pick<
  ReturnType<typeof useAdminStudentsDirectory>,
  | "hasParentFilter"
  | "setHasParentFilter"
  | "searchInput"
  | "setSearchInput"
  | "languageDraft"
  | "setLanguageDraft"
  | "applyLanguageFilter"
  | "clearLanguageFilter"
  | "languageDirty"
  | "refetch"
>;

interface AdminStudentsToolbarProps {
  readonly labels: ToolbarLabels;
  readonly directory: ToolbarDirectory;
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

/** Runtime narrowing of the select's string value back to the parent-link union. */
function asHasParentFilter(value: string): StudentHasParentFilter | "" {
  if (value === "WithParent" || value === "Independent") {
    return value;
  }
  return "";
}

export function AdminStudentsToolbar({
  labels,
  directory,
  loading,
  hasFilters,
  onExportCsv,
  exportLoading,
  exportDisabled,
}: AdminStudentsToolbarProps): ReactNode {
  // Stable element ids — wire `InputLabel htmlFor` ↔ control `id` so screen
  // readers announce the label when focus lands on the control (axe-core
  // `aria-input-field-name` rule). Prefixed with the component name to avoid
  // collisions with other admin surfaces.
  const HAS_PARENT_ID = "admin-students-toolbar-has-parent";
  const SEARCH_ID = "admin-students-toolbar-search";
  const LANGUAGE_ID = "admin-students-toolbar-language";
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
      <Box sx={{ display: "flex", width: "100%", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
        <StudentSearchField
          id={SEARCH_ID}
          labels={labels}
          value={directory.searchInput}
          onChange={directory.setSearchInput}
        />
        <DirectoryFilterSelect
          id={HAS_PARENT_ID}
          label={labels.filters.hasParent}
          value={directory.hasParentFilter}
          onChange={value => directory.setHasParentFilter(asHasParentFilter(value))}
          emptyOptionLabel={labels.filterOptions.all}
          options={[
            { value: "WithParent", label: labels.parentLabels.withParent },
            { value: "Independent", label: labels.parentLabels.noParent },
          ]}
        />
        <StudentLanguageField
          id={LANGUAGE_ID}
          labels={labels}
          value={directory.languageDraft}
          dirty={directory.languageDirty}
          onChange={directory.setLanguageDraft}
          onApply={directory.applyLanguageFilter}
        />
        <Box sx={{ flex: 1 }} />
        {hasFilters && (
          <Button
            variant="text"
            onClick={() => {
              directory.setHasParentFilter("");
              directory.setSearchInput("");
              directory.clearLanguageFilter();
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
  readonly exportLoading: boolean;
  readonly exportDisabled: boolean;
}

/**
 * The export action — same text-button recipe as the refresh action next to
 * it (variant/size/44px floor/`text.secondary` ink). While the export-all
 * query is in flight the button shows MUI's leading spinner busy state.
 * The tooltip switches to the honest "nothing to export" copy while
 * disabled; a `<span>` wrapper keeps the tooltip reachable on a disabled
 * button (disabled elements emit no pointer events).
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

interface StudentSearchFieldProps {
  readonly id: string;
  readonly labels: ToolbarLabels;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The toolbar's search input: magnifier leading adornment, fixed 44px height. */
function StudentSearchField({ id, labels, value, onChange }: StudentSearchFieldProps): ReactNode {
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

interface StudentLanguageFieldProps {
  readonly id: string;
  readonly labels: ToolbarLabels;
  readonly value: string;
  readonly dirty: boolean;
  readonly onChange: (value: string) => void;
  readonly onApply: () => void;
}

/**
 * The language filter input — an exact-match predicate, so the draft
 * commits on Enter or through the Apply icon button (rendered only while
 * the draft differs from the applied value). The label stays pinned to the
 * notch so the field never renders without a visible label.
 */
function StudentLanguageField({ id, labels, value, dirty, onChange, onApply }: StudentLanguageFieldProps): ReactNode {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onApply();
    }
  };
  return (
    <TextField
      id={id}
      label={labels.filters.language}
      value={value}
      onChange={event => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { "aria-label": labels.filters.language },
        input: {
          ...(dirty && {
            endAdornment: (
              <InputAdornment position="end" sx={{ marginInlineStart: 0 }}>
                <Tooltip title={labels.filters.apply} placement="top">
                  <IconButton
                    size="small"
                    aria-label={labels.filters.apply}
                    onClick={onApply}
                    sx={theme => ({ color: theme.palette.text.secondary })}
                  >
                    <ApplyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
          }),
        },
      }}
      sx={{ minWidth: 150, flex: { xs: "1 1 100%", sm: "0 1 auto" }, "& .MuiInputBase-root": { height: 44 } }}
    />
  );
}
