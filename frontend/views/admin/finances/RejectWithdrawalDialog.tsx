"use client";

/**
 * RejectWithdrawalDialog — the settlement-to-failed dialog of the
 * withdrawal payout queue (`/admin/finances`): reject ONE pending
 * withdrawal (balance restored server-side) WITH a MANDATORY reason field
 * — the submit stays disabled until the reason is non-empty (a rejection
 * outcome is never implied by a default), and the field carries
 * `aria-invalid` while the empty-submit is rejected.
 *
 * Structural sibling of {@link ApproveWithdrawalDialog}: the gated
 * `Dialog` shell (backdrop click and Escape are IGNORED while the mutation
 * is pending), the form element hosted on the paper, and
 * `React.SubmitEvent` discipline — carried by the shared
 * {@link GovernanceFormDialog} / {@link GovernanceDialogActions} atoms.
 *
 * The mutation lives in the parent panel's `useRejectWithdrawal` seam —
 * this dialog is presentational and receives the trigger + in-flight flag.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, ≥44px touch
 * targets, keyboard-focusable dialog (`aria-labelledby`).
 */

import { TextField } from "@mui/material";
import { type ReactNode, useEffect, useState } from "react";
import {
  GovernanceDialogActions,
  GovernanceFormDialog,
} from "@/frontend/views/admin/session-governance/dialogFormAtoms";
import { AdminFinance, Errors, useAppTranslation } from "@/shared/locale";

interface RejectWithdrawalDialogProps {
  /** The teacher whose withdrawal is being rejected (the testids key on it). */
  readonly transactionId: string;
  readonly open: boolean;
  /** Dismiss intent — ignored while the mutation is pending. */
  readonly onClose: () => void;
  /** Validated submit intent — receives the trimmed mandatory reason. */
  readonly onSubmit: (reason: string) => void;
  /** True while the reject mutation is in flight. */
  readonly loading: boolean;
  /** The submit affordance's testid (the suites + e2e drive it). */
  readonly submitTestId: string;
}

/** Confirm-and-reject dialog for one pending withdrawal (mandatory reason). */
export function RejectWithdrawalDialog({
  transactionId,
  open,
  onClose,
  onSubmit,
  loading,
  submitTestId,
}: Readonly<RejectWithdrawalDialogProps>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  const te = useAppTranslation(Errors);

  const [reason, setReason] = useState("");
  const [reasonInvalid, setReasonInvalid] = useState(false);

  // Fresh open state per dialog instance (the parent re-keys the dialog per
  // transaction id) — a stale reason never survives a dismissal.
  useEffect(() => {
    if (open) {
      setReason("");
      setReasonInvalid(false);
    }
  }, [open]);

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading) return;
    const trimmed = reason.trim();
    if (trimmed === "") {
      setReasonInvalid(true);
      return;
    }
    setReasonInvalid(false);
    onSubmit(trimmed);
  };

  return (
    <GovernanceFormDialog
      open={open}
      onClose={onClose}
      loading={loading}
      onSubmit={handleSubmit}
      titleId={`reject-withdrawal-dialog-title-${transactionId}`}
      title={t.rejectDialogTitle}
      actions={
        <GovernanceDialogActions
          onClose={onClose}
          loading={loading}
          cancelLabel={t.rejectCancel}
          submitLabel={t.rejectConfirm}
          submitTestId={submitTestId}
          submitDisabled={reason.trim() === ""}
          submitColor="error"
        />
      }
    >
      <TextField
        label={t.rejectReasonLabel}
        placeholder={t.rejectReasonPlaceholder}
        value={reason}
        onChange={event => {
          setReason(event.target.value);
          setReasonInvalid(false);
        }}
        required
        multiline
        minRows={3}
        error={reasonInvalid}
        helperText={reasonInvalid ? te.adjustmentReasonRequired : undefined}
        aria-invalid={reasonInvalid}
        data-testid={`reject-withdrawal-reason-${transactionId}`}
        slotProps={{ htmlInput: { autoComplete: "off" } }}
      />
    </GovernanceFormDialog>
  );
}
