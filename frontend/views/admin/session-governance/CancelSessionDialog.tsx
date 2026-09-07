"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { type ReactNode, useState } from "react";
import type { AdminSessionsQuery_adminSessions_items } from "@/frontend/graphql/generated/gql/graphql";
import { SessionDialogReasonField } from "@/frontend/views/student/sessions/SessionDialogReasonField";
import { SessionDialogWarningCallout } from "@/frontend/views/student/sessions/SessionDialogWarningCallout";
import { AdminSessionGovernance, Common, useAppTranslation } from "@/shared/locale";

/**
 * CancelSessionDialog — the admin cancel seam for one governance session
 * (`/admin/session-governance`, DEV3-021 / REQ-022). Structural sibling of
 * the participant cancel + arbitration dialogs: portal/dialog/form
 * discipline, `React.SubmitEvent`, dismissal gated while the mutation is in
 * flight.
 *
 * Reason field — OPTIONAL (REQ-022: `reason?`), ≤2000 chars at the UI seam
 * (mirrors the audit `details` contract), hard `maxLength` clamp at the
 * input seam plus a live raw-character counter helper line. The reason
 * rides the mutation input verbatim-trimmed; empty resolves to `null`.
 *
 * Idempotency — the `x-idempotency-key` context header is owned by the
 * CONTAINER (one uuid per logical cancel attempt, minted at dialog open,
 * rotated on success); this dialog only forwards the reason. The mutation
 * and its error classification live in the container; the dialog stays
 * open on every failure arm for a corrected submit.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, ≥44px touch
 * targets, keyboard-focusable dialog (`aria-labelledby` + focusable field).
 */

/** UI-seam cap for the optional cancel reason (mirrors the audit contract). */
export const MAX_CANCEL_REASON_LENGTH = 2000;

interface CancelSessionDialogProps {
  /** The session being cancelled (drives the testids). */
  readonly session: AdminSessionsQuery_adminSessions_items;
  readonly open: boolean;
  /**
   * Dismiss intent (cancel Button / backdrop click / Escape) — ignored
   * while the cancel mutation is pending.
   */
  readonly onClose: () => void;
  /** True while the container's cancel mutation is in flight. */
  readonly loading: boolean;
  /** Submit intent — trimmed reason, or `null` when left blank. */
  readonly onSubmit: (reason: string | null) => void;
}

/** Confirm-and-cancel dialog (optional reason + live counter). */
export function CancelSessionDialog({
  session,
  open,
  onClose,
  loading,
  onSubmit,
}: Readonly<CancelSessionDialogProps>): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);
  const tc = useAppTranslation(Common);

  const [reason, setReason] = useState("");

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading) return;
    const trimmed = reason.trim();
    onSubmit(trimmed.length === 0 ? null : trimmed);
  };

  const handleDialogClose = (): void => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: "form", onSubmit: handleSubmit } }}
      aria-labelledby="cancel-session-dialog-title"
    >
      <DialogTitle id="cancel-session-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.cancelTitle}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <SessionDialogWarningCallout message={t.cancelBody} />
        <SessionDialogReasonField
          value={reason}
          onValueChange={setReason}
          label={t.cancelReasonLabel}
          placeholder={t.cancelReasonPlaceholder}
          required={false}
          error={false}
          helperText={`${reason.length}/${MAX_CANCEL_REASON_LENGTH}`}
          maxLength={MAX_CANCEL_REASON_LENGTH}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}>
          {tc.cancel}
        </Button>
        <Button
          type="submit"
          variant="contained"
          color="error"
          disabled={loading}
          data-testid={`cancel-session-submit-${session.id}`}
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.cancelSubmit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
