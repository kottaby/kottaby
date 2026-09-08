"use client";

/**
 * AdminApplicantsPanel — the applicant-queue tab panel of the /teachers
 * two-tab surface (toolbar + error alert + results + feedback snackbar).
 *
 * PRESENTATIONAL: the query/filter state lives in `useAdminTeacherApplicants`
 * and is OWNED BY THE PARENT surface (lifted one level so the inactive-tab
 * count badge can read the honest `total`); this panel receives the state
 * slice as a prop and wires the shared chrome around it.
 *
 * The queue stays READ-ONLY by design — no mutations exist here. The only
 * per-row affordance is the full-profile deep link to the admin user-detail
 * page, where certification and governance actions live. The toolbar also
 * carries a SERVER-SIDE EXPORT-ALL CSV action (the dedicated export query
 * runs with the current filter state, the backend caps the dump and reports
 * `truncated`, and this panel serializes the rows with the queue's own pure
 * CSV builder — read-only, admissions-workflow value).
 *
 * All chrome copy comes from the `AdminTeachers` namespace; MUI v9
 * `sx`-only discipline; colors via `theme.palette.*` callbacks; ≥44px touch
 * targets; responsive (desktop table ≥md, stacked cards below).
 */

import { Alert, Button, Snackbar, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { AdminApplicantsResults } from "@/frontend/views/admin/teachers/AdminApplicantsResults";
import { AdminApplicantsToolbar } from "@/frontend/views/admin/teachers/AdminApplicantsToolbar";
import {
  applicantsDirectoryCsvFilename,
  buildApplicantsDirectoryCsv,
} from "@/frontend/views/admin/teachers/applicants-directory-csv";
import type { useAdminTeacherApplicants } from "@/frontend/views/admin/teachers/hooks";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** ICU token of `export.exportedRows` (one per locale, parity-pinned). */
const EXPORTED_ROWS_PLACEHOLDER = "{count}";

type ApplicantsState = ReturnType<typeof useAdminTeacherApplicants>;

interface AdminApplicantsPanelProps {
  readonly labels: AdminTeachersLabels;
  /** Lifted queue state (owned by the surface for the tab-badge read). */
  readonly applicants: ApplicantsState;
}

export function AdminApplicantsPanel({ labels, applicants }: AdminApplicantsPanelProps): ReactNode {
  // The copy-email quick action reports success through the shared
  // snackbar (identical feedback channel as the directory panel).
  const handleCopyEmail = () => {
    applicants.showSnackbar(labels.quickActions.emailCopied);
  };
  // Server-side EXPORT-ALL: the dedicated export query runs with the
  // CURRENT filter state (the hook owns the filter-to-variables mapping),
  // then the returned rows serialize through the queue's pure CSV builder
  // and download via the same Blob/anchor/revoke recipe as the directory
  // exports. Feedback through the shared snackbar: success reports the
  // exported row count; a capped dump reports the truncation warning
  // instead (it implies completion); a failed query reports the error lane
  // without any download.
  const handleExportCsv = async (): Promise<void> => {
    const envelope = await applicants.exportAll();
    if (envelope === null) {
      applicants.showSnackbar(labels.export.exportCsvFailed, "error");
      return;
    }
    if (envelope.truncated) {
      // A capped dump still downloads its EXPORT_MAX_ROWS rows — the
      // warning lane reports the cap instead of the plain success copy.
      applicants.showSnackbar(labels.export.exportTruncated, "warning");
    } else {
      applicants.showSnackbar(
        labels.export.exportedRows.replace(EXPORTED_ROWS_PLACEHOLDER, () => String(envelope.rows.length))
      );
    }
    const csv = buildApplicantsDirectoryCsv(envelope.rows, labels);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = applicantsDirectoryCsvFilename();
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
        onExportCsv={() => {
          void handleExportCsv();
        }}
        exportLoading={applicants.exportLoading}
        exportDisabled={applicants.exportLoading || applicants.loading || applicants.total === 0}
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
        open={applicants.snackbar !== null}
        autoHideDuration={4000}
        onClose={applicants.clearSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={applicants.snackbar?.severity ?? "success"}
          variant="filled"
          onClose={applicants.clearSnackbar}
        >
          {applicants.snackbar?.message ?? ""}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
