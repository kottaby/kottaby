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
 * The two text inputs and the copy/export action buttons live beside this
 * file (`AdminStudentsToolbarFields.tsx` / `AdminStudentsToolbarActions.tsx`).
 * Label slices are passed down narrowed — nothing is hardcoded. All colors
 * resolve through theme-callback sx.
 */

import { RefreshOutlined as RefreshIcon } from "@mui/icons-material";
import { Box, Button, Card } from "@mui/material";
import type { ReactNode } from "react";
import { CopyLinkButton, ExportCsvButton } from "@/frontend/views/admin/students/AdminStudentsToolbarActions";
import { StudentLanguageField, StudentSearchField } from "@/frontend/views/admin/students/AdminStudentsToolbarFields";
import type { StudentHasParentFilter } from "@/frontend/views/admin/students/adminStudentsDirectory.helpers";
import type { useAdminStudentsDirectory } from "@/frontend/views/admin/students/hooks";
import { DirectoryFilterSelect } from "@/frontend/views/admin/users/directory";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

type ToolbarLabels = Pick<
  AdminStudentsLabels,
  "filters" | "filterOptions" | "parentLabels" | "export" | "quickActions"
>;

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
  /** Invoked after the view URL copies successfully (drives the snackbar). */
  readonly onCopyLink?: () => void;
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
  onCopyLink,
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
        <CopyLinkButton labels={labels} onCopyLink={onCopyLink} />
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
