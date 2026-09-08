"use client";

/**
 * AdminTeachersDirectoryPanel — the certified-teacher directory tab panel
 * of the /teachers two-tab surface (read-only, presentation only).
 *
 * State and query wiring lives in `useAdminTeachersDirectory`; the filter/
 * refresh/export toolbar lives in `AdminTeachersToolbar`; the results
 * section (desktop table + mobile card list + paginations) lives in
 * `AdminTeachersResults`; the feedback snackbar closes the loop. The page
 * header and the tab strip live one level up in `AdminTeachersSurface`
 * (shared chrome across both tabs).
 *
 * The surface stays READ-ONLY by design — no create/edit/delete dialogs and
 * no mutations exist here. Two affordances round it out: the per-row
 * detail drawer (opened by clicking a row/card or through the explicit
 * view-details quick action — the panel owns the single drawer instance
 * and keeps the selected item mounted through the exit transition) and the
 * SERVER-SIDE EXPORT-ALL CSV download (the dedicated export query runs
 * with the current filter state, the backend caps the dump and reports
 * `truncated`, and the panel serializes the rows with the existing pure
 * CSV builder). The export action belongs to THIS tab's toolbar — the
 * applicant queue tab runs its own export through the same recipe.
 *
 * The container performs no role logic (the `adminTeachers` admin identity
 * is server-bound per BOPLA hygiene, and the backend query fails any
 * non-admin into the canonical FORBIDDEN).
 *
 * All copy comes from the `AdminTeachers` locale namespace, resolved
 * client-side via `useAppTranslation(AdminTeachers)`. MUI v9 `sx`-only
 * discipline; colors via `theme.palette.*` callbacks; `*Outlined` icons;
 * ≥44px touch targets; responsive (desktop table ≥md, stacked cards below).
 *
 * The surface above threads two applicant-queue signals down to the empty
 * state (`hasApplicants` — the eagerly-fetched queue total, the same source
 * the inactive-tab badge reads — and `onReviewApplicants`, which flips the
 * surface's tab state in place). The panel is otherwise self-contained.
 */

import { Alert, Button, Snackbar, Stack } from "@mui/material";
import { type ReactNode, useState } from "react";
import { AdminTeacherDetailDrawer } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { AdminTeachersResults } from "@/frontend/views/admin/teachers/AdminTeachersResults";
import { AdminTeachersToolbar } from "@/frontend/views/admin/teachers/AdminTeachersToolbar";
import { downloadCsvFile } from "@/frontend/views/admin/teachers/csv-download";
import type { useAdminTeachersDirectory } from "@/frontend/views/admin/teachers/hooks";
import {
  buildTeachersDirectoryCsv,
  teachersDirectoryCsvFilename,
} from "@/frontend/views/admin/teachers/teachers-directory-csv";
import { useAppLocale } from "@/shared/locale";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminTeachers } from "@/shared/locale/namespaces/adminTeachers";

/** ICU token of `export.exportedRows` (one per locale, parity-pinned). */
const EXPORTED_ROWS_PLACEHOLDER = "{count}";

/** Directory state slice — wired in the SURFACE (lifted like the applicants
 * queue) so the shareable-URL write effect can compose the active tab's
 * view from one place. */
type DirectoryState = ReturnType<typeof useAdminTeachersDirectory>;

interface AdminTeachersDirectoryPanelProps {
  /** The lifted directory state (query/filters/snackbar/export wiring). */
  readonly directory: DirectoryState;
  /** Whether the applicant queue holds ≥1 row (gates the join-requests CTA). */
  readonly hasApplicants: boolean;
  /** Flips the /teachers surface to the applicants tab (surface-owned state). */
  readonly onReviewApplicants: () => void;
}

export function AdminTeachersDirectoryPanel({
  directory,
  hasApplicants,
  onReviewApplicants,
}: AdminTeachersDirectoryPanelProps): ReactNode {
  const labels = useAppTranslation(AdminTeachers);
  const locale = useAppLocale();
  // Single detail-drawer instance per directory — `selectedTeacher` stays
  // mounted through the drawer's exit transition (only `drawerOpen` flips
  // on close), so the panel never slides out empty.
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherDirectoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openTeacherDetails = (teacher: TeacherDirectoryItem) => {
    setSelectedTeacher(teacher);
    setDrawerOpen(true);
  };
  // The copy-email quick action reports success through the shared
  // snackbar (identical feedback channel as the applicants panel).
  const handleCopyEmail = () => {
    directory.showSnackbar(labels.quickActions.emailCopied);
  };
  // Server-side EXPORT-ALL: the dedicated export query runs with the
  // CURRENT filter state (the hook owns the filter-to-variables mapping),
  // then the returned rows serialize through the EXISTING pure CSV builder
  // (same item shape as the listing) and download through the shared
  // `downloadCsvFile` Blob/anchor/revoke recipe. Feedback through the
  // shared snackbar:
  // success reports the exported row count; a capped dump reports the
  // truncation warning instead (it implies completion); a failed query
  // reports the error lane without any download.
  const handleExportCsv = async (): Promise<void> => {
    const envelope = await directory.exportAll();
    if (envelope === null) {
      directory.showSnackbar(labels.export.exportCsvFailed, "error");
      return;
    }
    if (envelope.truncated) {
      // A capped dump still downloads its EXPORT_MAX_ROWS rows — the
      // warning lane reports the cap instead of the plain success copy.
      directory.showSnackbar(labels.export.exportTruncated, "warning");
    } else {
      directory.showSnackbar(
        labels.export.exportedRows.replace(EXPORTED_ROWS_PLACEHOLDER, () => String(envelope.rows.length))
      );
    }
    const csv = buildTeachersDirectoryCsv(envelope.rows, labels);
    downloadCsvFile(csv, teachersDirectoryCsvFilename());
  };
  // Re-fetch the current page after a load failure (transport failure or
  // GraphQL error). The promise is handed to Apollo; rejections re-surface
  // through the same `hasError` state.
  const retryDirectory = () => {
    void directory.refetch();
  };
  return (
    <Stack spacing={3}>
      <AdminTeachersToolbar
        labels={labels}
        directory={directory}
        loading={directory.loading}
        hasFilters={directory.hasFilters}
        onCopyLink={() => {
          directory.showSnackbar(labels.quickActions.linkCopied);
        }}
        onExportCsv={() => {
          void handleExportCsv();
        }}
        exportLoading={directory.exportLoading}
        exportDisabled={directory.exportLoading || directory.loading || directory.total === 0}
      />

      {directory.hasError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retryDirectory}>
              {labels.errorState.retry}
            </Button>
          }
        >
          {labels.errorState.title}: {labels.errorState.message}
          {directory.firstErrorCode === null ? "" : ` (${directory.firstErrorCode})`}
        </Alert>
      )}

      <AdminTeachersResults
        labels={labels}
        directory={directory}
        onCopyEmail={handleCopyEmail}
        onViewDetails={openTeacherDetails}
        hasApplicants={hasApplicants}
        onReviewApplicants={onReviewApplicants}
      />

      <AdminTeacherDetailDrawer
        open={drawerOpen}
        teacher={selectedTeacher}
        labels={labels}
        locale={locale}
        onClose={() => {
          setDrawerOpen(false);
        }}
        onCopyEmail={handleCopyEmail}
      />

      <Snackbar
        open={directory.snackbar !== null}
        autoHideDuration={4000}
        onClose={directory.clearSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={directory.snackbar?.severity ?? "success"} variant="filled" onClose={directory.clearSnackbar}>
          {directory.snackbar?.message ?? ""}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
