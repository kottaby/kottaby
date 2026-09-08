/**
 * DirectorySnackbar — the shared feedback-channel shape for the admin
 * directory hooks (teachers / students / applicant queue).
 *
 * The copy-email quick action reports on the `success` lane (the historical
 * channel); the server-side export-all flow reuses the same snackbar with
 * the `warning` lane when the dump hit the backend's EXPORT_MAX_ROWS cap
 * and the `error` lane when the export query fails. One channel, three
 * severities — no second floating surface.
 */

export type DirectorySnackbarSeverity = "success" | "warning" | "error";

export interface DirectorySnackbar {
  readonly message: string;
  readonly severity: DirectorySnackbarSeverity;
}
