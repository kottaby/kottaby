"use client";

/**
 * AdminTeachersDirectoryContainer — the admin teacher directory client
 * surface (read-only, presentation only).
 *
 * State and query wiring lives in `useAdminTeachersDirectory`; the filter/
 * refresh/export toolbar lives in `AdminTeachersToolbar`; the results
 * section (desktop table + mobile card list + paginations) lives in
 * `AdminTeachersResults`; the copy-email snackbar closes the loop.
 *
 * The surface stays READ-ONLY by design — no create/edit/delete dialogs and
 * no mutations exist here. Two affordances round it out: the per-row
 * detail drawer (opened by clicking a row/card or through the explicit
 * view-details quick action — the container owns the single drawer
 * instance and keeps the selected item mounted through the exit
 * transition) and the current-page CSV export (pure client-side
 * serialization of the rows on screen — no second fetch).
 *
 * All chrome copy comes from the `AdminTeachers` locale namespace, resolved
 * client-side via `useAppTranslation(AdminTeachers)` — the page mounts this
 * container label-free so no labels cross the server→client props boundary.
 * MUI v9 `sx`-only discipline; colors via `theme.palette.*` callbacks;
 * `*Outlined` icons; ≥44px touch targets; responsive (desktop table ≥md,
 * stacked cards below).
 */

import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useState } from "react";
import { AdminTeacherDetailDrawer } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { AdminTeachersResults } from "@/frontend/views/admin/teachers/AdminTeachersResults";
import { AdminTeachersToolbar } from "@/frontend/views/admin/teachers/AdminTeachersToolbar";
import { useAdminTeachersDirectory } from "@/frontend/views/admin/teachers/hooks";
import {
  buildTeachersDirectoryCsv,
  teachersDirectoryCsvFilename,
} from "@/frontend/views/admin/teachers/teachers-directory-csv";
import { useAppLocale } from "@/shared/locale";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminTeachers } from "@/shared/locale/namespaces/adminTeachers";

export function AdminTeachersDirectoryContainer(): ReactNode {
  const labels = useAppTranslation(AdminTeachers);
  const locale = useAppLocale();
  const directory = useAdminTeachersDirectory();
  // Single detail-drawer instance per directory — `selectedTeacher` stays
  // mounted through the drawer's exit transition (only `drawerOpen` flips
  // on close), so the panel never slides out empty.
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherDirectoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openTeacherDetails = (teacher: TeacherDirectoryItem) => {
    setSelectedTeacher(teacher);
    setDrawerOpen(true);
  };
  // The copy-email quick action reports success through the shared success
  // snackbar (identical feedback channel as the users directory).
  const handleCopyEmail = () => {
    directory.setSnackbarMessage(labels.quickActions.emailCopied);
  };
  // Serialize the CURRENT page (the rows on screen) to a BOM-prefixed CSV
  // download — the same Blob/anchor/revoke recipe as the analytics export.
  const handleExportCsv = (): void => {
    const csv = buildTeachersDirectoryCsv(directory.items, labels);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = teachersDirectoryCsvFilename();
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

      <AdminTeachersToolbar
        labels={labels}
        directory={directory}
        loading={directory.loading}
        hasFilters={directory.hasFilters}
        onExportCsv={handleExportCsv}
        exportDisabled={directory.loading || directory.items.length === 0}
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
        open={directory.snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => directory.setSnackbarMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => directory.setSnackbarMessage(null)}>
          {directory.snackbarMessage}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
