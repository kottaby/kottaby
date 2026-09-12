"use client";

/**
 * ApproveWithdrawalDialog — the settlement confirm dialog of the withdrawal
 * payout queue (`/admin/finances`): approve (settle → completed) for ONE
 * pending withdrawal. Confirm/cancel only — NO reason field (an approval is
 * not reason-bearing; the rejection dialog owns the mandatory reason).
 *
 * Structural sibling of the session-governance dialog family: the gated
 * `Dialog` shell (backdrop click and Escape are IGNORED while the mutation
 * is pending — the cancel Button is separately disabled), the form element
 * hosted on the paper, and `React.SubmitEvent` discipline.
 *
 * The mutation lives in the parent panel's `useApproveWithdrawal` seam —
 * this dialog is presentational and receives the trigger + in-flight flag.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, ≥44px touch
 * targets, keyboard-focusable dialog (`aria-labelledby`).
 */

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { AdminFinance, Common, useAppTranslation } from "@/shared/locale";

interface ApproveWithdrawalDialogProps {
  /** The teacher whose withdrawal is being approved (the copy names them). */
  readonly teacherName: string;
  readonly open: boolean;
  /** Dismiss intent — ignored while the mutation is pending. */
  readonly onClose: () => void;
  /** Validated submit intent (confirm/cancel, no reason field). */
  readonly onSubmit: () => void;
  /** True while the approve mutation is in flight. */
  readonly loading: boolean;
  /** The submit affordance's testid (the suites + e2e drive it). */
  readonly submitTestId: string;
}

/** Confirm-and-settle dialog for one pending withdrawal (no reason field). */
export function ApproveWithdrawalDialog({
  teacherName,
  open,
  onClose,
  onSubmit,
  loading,
  submitTestId,
}: Readonly<ApproveWithdrawalDialogProps>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  const tc = useAppTranslation(Common);

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading) return;
    onSubmit();
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
      aria-labelledby="approve-withdrawal-dialog-title"
    >
      <DialogTitle id="approve-withdrawal-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.approveAction}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {teacherName}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}>
          {tc.cancel}
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={loading}
          data-testid={submitTestId}
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.approveAction}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
