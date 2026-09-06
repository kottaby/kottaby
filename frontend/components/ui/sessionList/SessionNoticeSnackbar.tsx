"use client";

import { Alert, Snackbar } from "@mui/material";
import type { ReactNode } from "react";

/**
 * SessionNoticeSnackbar — the session-list containers' single transient
 * notice slot (success / info / error) auto-hiding at the sessions-parity
 * duration, anchored bottom-center (MUI Snackbar anchoring is
 * direction-agnostic — RTL-safe by construction). The shape is structural
 * so every container-specific `ContainerNotice` interface feeds it without
 * a mapping layer.
 */

/** Snackbar autohide — parity with the app-scope `GraphQLErrorSurfaceHost` toasts. */
const SNACKBAR_AUTOHIDE_MS = 6000;

interface SessionNoticeSnackbarProps {
  /** The active transient notice, or `null` while the slot is empty. */
  readonly notice: {
    readonly message: string;
    readonly severity: "success" | "info" | "error";
  } | null;
  /** Dismiss intent (autohide, click-away, close icon). */
  readonly onDismiss: () => void;
}

/** The single transient snackbar feeding off a container-owned notice slot. */
export function SessionNoticeSnackbar({ notice, onDismiss }: Readonly<SessionNoticeSnackbarProps>): ReactNode {
  return (
    <Snackbar
      open={notice !== null}
      autoHideDuration={SNACKBAR_AUTOHIDE_MS}
      onClose={onDismiss}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      {notice === null ? undefined : (
        <Alert onClose={onDismiss} severity={notice.severity} variant="filled">
          {notice.message}
        </Alert>
      )}
    </Snackbar>
  );
}
