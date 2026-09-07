"use client";

/**
 * AdminTeachersDirectoryContainer — the admin teacher directory client
 * surface (read-only, presentation only).
 *
 * State and query wiring lives in `useAdminTeachersDirectory`; the filter/
 * refresh toolbar lives in `AdminTeachersToolbar`; the results section
 * (desktop table + mobile card list + paginations) lives in
 * `AdminTeachersResults`; the copy-email snackbar closes the loop.
 *
 * This surface is READ-ONLY by design — no create/edit/delete dialogs and
 * no mutations exist here; the only row-level affordance is the copy-email
 * quick action.
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
import { AdminTeachersResults } from "@/frontend/views/admin/teachers/AdminTeachersResults";
import { AdminTeachersToolbar } from "@/frontend/views/admin/teachers/AdminTeachersToolbar";
import { useAdminTeachersDirectory } from "@/frontend/views/admin/teachers/hooks";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminTeachers } from "@/shared/locale/namespaces/adminTeachers";

export function AdminTeachersDirectoryContainer(): ReactNode {
  const labels = useAppTranslation(AdminTeachers);
  const directory = useAdminTeachersDirectory();
  // The copy-email quick action reports success through the shared success
  // snackbar (identical feedback channel as the users directory).
  const handleCopyEmail = () => {
    directory.setSnackbarMessage(labels.quickActions.emailCopied);
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

      <AdminTeachersResults labels={labels} directory={directory} onCopyEmail={handleCopyEmail} />

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
