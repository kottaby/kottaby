"use client";

/**
 * AdminApplicantsPanel — the applicant-queue tab panel of the /teachers
 * two-tab surface (toolbar + error alert + results + copy snackbar).
 *
 * PRESENTATIONAL: the query/filter state lives in `useAdminTeacherApplicants`
 * and is OWNED BY THE PARENT surface (lifted one level so the inactive-tab
 * count badge can read the honest `total`); this panel receives the state
 * slice as a prop and wires the shared chrome around it.
 *
 * The queue stays READ-ONLY by design — no mutations exist here. The only
 * per-row affordance is the full-profile deep link to the admin user-detail
 * page, where certification and governance actions live. There is no CSV
 * export on this tab (the export contract belongs to the directory).
 *
 * All chrome copy comes from the `AdminTeachers` namespace; MUI v9
 * `sx`-only discipline; colors via `theme.palette.*` callbacks; ≥44px touch
 * targets; responsive (desktop table ≥md, stacked cards below).
 */

import { Alert, Button, Snackbar, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { AdminApplicantsResults } from "@/frontend/views/admin/teachers/AdminApplicantsResults";
import { AdminApplicantsToolbar } from "@/frontend/views/admin/teachers/AdminApplicantsToolbar";
import type { useAdminTeacherApplicants } from "@/frontend/views/admin/teachers/hooks";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

type ApplicantsState = ReturnType<typeof useAdminTeacherApplicants>;

interface AdminApplicantsPanelProps {
  readonly labels: AdminTeachersLabels;
  /** Lifted queue state (owned by the surface for the tab-badge read). */
  readonly applicants: ApplicantsState;
}

export function AdminApplicantsPanel({ labels, applicants }: AdminApplicantsPanelProps): ReactNode {
  // The copy-email quick action reports success through the shared success
  // snackbar (identical feedback channel as the directory panel).
  const handleCopyEmail = () => {
    applicants.setSnackbarMessage(labels.quickActions.emailCopied);
  };
  // Re-fetch the current page after a load failure (transport failure or
  // GraphQL error). The promise is handed to Apollo; rejections re-surface
  // through the same `hasError` state.
  const retryApplicants = () => {
    void applicants.refetch();
  };
  return (
    <Stack spacing={3}>
      <AdminApplicantsToolbar
        labels={labels}
        applicants={applicants}
        loading={applicants.loading}
        hasFilters={applicants.hasFilters}
      />

      {applicants.hasError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retryApplicants}>
              {labels.errorState.retry}
            </Button>
          }
        >
          {labels.errorState.title}: {labels.errorState.message}
          {applicants.firstErrorCode === null ? "" : ` (${applicants.firstErrorCode})`}
        </Alert>
      )}

      <AdminApplicantsResults labels={labels} applicants={applicants} onCopyEmail={handleCopyEmail} />

      <Snackbar
        open={applicants.snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => applicants.setSnackbarMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => applicants.setSnackbarMessage(null)}>
          {applicants.snackbarMessage}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
