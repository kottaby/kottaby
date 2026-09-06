"use client";

/**
 * NoticeSnackbar — the single transient container-level notice slot (plain
 * MUI `Snackbar` + filled `Alert`, no notistack) shared by the role
 * containers (sessions, wallet, …). The caller owns the notice state, the
 * autohide duration, and the dismiss callback.
 */

import { Alert, Snackbar } from "@mui/material";
import type { ReactNode } from "react";

interface NoticeSnackbarProps {
  /** The transient notice, or `null` while idle (the snackbar closes). */
  readonly notice: { readonly message: string; readonly severity: "success" | "info" | "error" } | null;
  /** Snackbar autohide in ms — the caller's chrome-parity constant. */
  readonly autoHideDuration: number;
  readonly onClose: () => void;
}

/** The bottom-center snackbar chrome for one transient container notice. */
export function NoticeSnackbar({ notice, autoHideDuration, onClose }: Readonly<NoticeSnackbarProps>): ReactNode {
  return (
    <Snackbar
      open={notice !== null}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      {notice === null ? undefined : (
        <Alert onClose={onClose} severity={notice.severity} variant="filled">
          {notice.message}
        </Alert>
      )}
    </Snackbar>
  );
}
