"use client";

import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import type { ReactNode } from "react";
import { SessionDialogActionButtons } from "@/frontend/views/student/sessions/SessionDialogActionButtons";
import { SessionDialogReasonField } from "@/frontend/views/student/sessions/SessionDialogReasonField";
import { SessionDialogWarningCallout } from "@/frontend/views/student/sessions/SessionDialogWarningCallout";
import {
  MAX_DISPUTE_REASON_LENGTH,
  useSessionDisputeForm,
} from "@/frontend/views/student/sessions/useSessionDisputeForm";
import { Sessions, useAppTranslation } from "@/shared/locale";

/**
 * SessionDisputeConfirmDialog — the confirm-and-reason seam for opening a
 * dispute on a `Scheduled`/`Started` session (student or teacher side,
 * DEV3-005 R-110). Structural twin of `CancelSessionConfirmDialog`: same
 * portal/dialog/controlled-textarea form, REQUIRED reason instead of
 * optional, and a snackbar-mapped error vocabulary instead of the row-evict
 * arm.
 *
 * Mutation behavior and form logic are encapsulated in {@link useSessionDisputeForm}.
 */

export { MAX_DISPUTE_REASON_LENGTH };

interface SessionDisputeConfirmDialogProps {
  /** Id of the session being disputed. */
  readonly sessionId: string;
  readonly open: boolean;
  /**
   * Dismiss intent (cancel Button / backdrop click / Escape) — ignored
   * while the dispute mutation is pending: the Dialog's `onClose` is gated
   * on the `loading` flag and the cancel Button is separately `disabled={loading}`.
   */
  readonly onClose: () => void;
  /** Success — the cache already carries the disputed state. */
  readonly onDisputed: (sessionId: string) => void;
  /** `SESSION_NOT_FOUND` — error snackbar; the row stays (see the docblock). */
  readonly onSessionMissing: (sessionId: string) => void;
  /** `SESSION_INVALID_TRANSITION` — error snackbar; the row stays. */
  readonly onInvalidTransition: (sessionId: string) => void;
  /** Everything else — error toast; the dialog stays open for a retry. */
  readonly onFailure: (message: string) => void;
}

/** Confirm-and-required-reason dialog owning the `openSessionDispute` mutation. */
export function SessionDisputeConfirmDialog({
  sessionId,
  open,
  onClose,
  onDisputed,
  onSessionMissing,
  onInvalidTransition,
  onFailure,
}: Readonly<SessionDisputeConfirmDialogProps>): ReactNode {
  const t = useAppTranslation(Sessions);

  const { reason, reasonInvalid, loading, handleReasonChange, handleSubmit, handleDialogClose } = useSessionDisputeForm(
    {
      sessionId,
      onClose,
      onDisputed,
      onSessionMissing,
      onInvalidTransition,
      onFailure,
    }
  );

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: "form", onSubmit: handleSubmit } }}
      aria-labelledby="dispute-session-dialog-title"
    >
      <DialogTitle id="dispute-session-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.disputeConfirmTitle}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <SessionDialogWarningCallout message={t.disputeConfirmBody} />
        <SessionDialogReasonField
          value={reason}
          onValueChange={handleReasonChange}
          label={t.disputeReasonLabel}
          placeholder={t.disputeReasonPlaceholder}
          required
          error={reasonInvalid}
          helperText={reasonInvalid ? t.disputeReasonRequired : `${reason.length}/${MAX_DISPUTE_REASON_LENGTH}`}
          maxLength={MAX_DISPUTE_REASON_LENGTH}
        />
      </DialogContent>
      <SessionDialogActionButtons
        loading={loading}
        onClose={onClose}
        submitLabel={t.openDispute}
        submitColor="warning"
        submitDisabled={loading}
      />
    </Dialog>
  );
}
