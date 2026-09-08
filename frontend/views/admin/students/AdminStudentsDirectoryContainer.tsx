"use client";

/**
 * AdminStudentsDirectoryContainer — the admin student directory client
 * surface (read-only, presentation only).
 *
 * State and query wiring lives in `useAdminStudentsDirectory`; the filter/
 * refresh/export toolbar lives in `AdminStudentsToolbar`; the results
 * section (desktop table + mobile card list + paginations) lives in
 * `AdminStudentsResults`; the feedback snackbar closes the loop.
 *
 * The surface stays READ-ONLY by design — no create/edit/delete dialogs and
 * no mutations exist here. Two affordances round it out: the per-row
 * detail drawer (opened by clicking a row/card or through the explicit
 * view-details quick action — the container owns the single drawer
 * instance and keeps the selected item mounted through the exit
 * transition) and the SERVER-SIDE EXPORT-ALL CSV download (the dedicated
 * export query runs with the current filter state, the backend caps the
 * dump and reports `truncated`, and the container serializes the rows with
 * the existing pure CSV builder).
 *
 * All chrome copy comes from the `AdminStudents` locale namespace, resolved
 * client-side via `useAppTranslation(AdminStudents)` — the page mounts this
 * container label-free so no labels cross the server→client props boundary.
 * MUI v9 `sx`-only discipline; colors via `theme.palette.*` callbacks;
 * `*Outlined` icons; ≥44px touch targets; responsive (desktop table ≥md,
 * stacked cards below).
 */

import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useState } from "react";
import { AdminStudentDetailDrawer } from "@/frontend/views/admin/students/AdminStudentDetailDrawer";
import type { StudentDirectoryItem } from "@/frontend/views/admin/students/AdminStudentRowCells";
import { AdminStudentsResults } from "@/frontend/views/admin/students/AdminStudentsResults";
import { AdminStudentsToolbar } from "@/frontend/views/admin/students/AdminStudentsToolbar";
import { useAdminStudentsDirectory } from "@/frontend/views/admin/students/hooks";
import {
  buildStudentsDirectoryCsv,
  studentsDirectoryCsvFilename,
} from "@/frontend/views/admin/students/students-directory-csv";
import { useAppLocale } from "@/shared/locale";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminStudents } from "@/shared/locale/namespaces/adminStudents";

/** ICU token of `export.exportedRows` (one per locale, parity-pinned). */
const EXPORTED_ROWS_PLACEHOLDER = "{count}";

export function AdminStudentsDirectoryContainer(): ReactNode {
  const labels = useAppTranslation(AdminStudents);
  const locale = useAppLocale();
  const directory = useAdminStudentsDirectory();
  // Single detail-drawer instance per directory — `selectedStudent` stays
  // mounted through the drawer's exit transition (only `drawerOpen` flips
  // on close), so the panel never slides out empty.
  const [selectedStudent, setSelectedStudent] = useState<StudentDirectoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openStudentDetails = (student: StudentDirectoryItem) => {
    setSelectedStudent(student);
    setDrawerOpen(true);
  };
  // The copy-email quick action reports success through the shared
  // snackbar (identical feedback channel as the users directory).
  const handleCopyEmail = () => {
    directory.showSnackbar(labels.quickActions.emailCopied);
  };
  // Server-side EXPORT-ALL: the dedicated export query runs with the
  // CURRENT filter state (the hook owns the filter-to-variables mapping),
  // then the returned rows serialize through the EXISTING pure CSV builder
  // (same item shape as the listing) and download via the same
  // Blob/anchor/revoke recipe. Feedback through the shared snackbar:
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
    const csv = buildStudentsDirectoryCsv(envelope.rows, labels);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = studentsDirectoryCsvFilename();
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };
  // Re-fetch the current page after a load failure (transport failure or
  // GraphQL error). The promise is handed to Apollo; rejections re-surface
  // through the same `hasError` state.
  const retryDirectory = () => {
    void directory.refetch();
  };
  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
      <Box>
        <Typography variant="h4" component="h1">
          {labels.title}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {labels.subtitle}
        </Typography>
      </Box>

      <AdminStudentsToolbar
        labels={labels}
        directory={directory}
        loading={directory.loading}
        hasFilters={directory.hasFilters}
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

      <AdminStudentsResults
        labels={labels}
        directory={directory}
        onCopyEmail={handleCopyEmail}
        onViewDetails={openStudentDetails}
      />

      <AdminStudentDetailDrawer
        open={drawerOpen}
        student={selectedStudent}
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
