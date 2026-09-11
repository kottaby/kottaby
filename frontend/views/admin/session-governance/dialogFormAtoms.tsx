"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import type { ReactNode } from "react";

/**
 * Shared form-dialog atoms for the admin session-governance dialogs
 * (cancel / reschedule / reassign — `/admin/session-governance`).
 *
 * The three dialogs are structural siblings of the participant cancel +
 * arbitration dialogs (portal/dialog/form discipline, `React.SubmitEvent`,
 * dismissal gated while the mutation is in flight). The repeated shell —
 * the gated `Dialog` + `DialogTitle` + grid `DialogContent`, and the
 * dismiss/submit `DialogActions` pair — lives HERE exactly once and the
 * dialogs compose it; the sibling participant/arbitration dialogs keep
 * their own shells (out of this surface's blast radius).
 *
 * The dismissal gate enforces the `onClose` prop contract at the dialog
 * itself: backdrop click and Escape are IGNORED while the mutation is
 * pending (the cancel Button is separately disabled while loading).
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, ≥44px touch
 * targets, keyboard-focusable dialog (`aria-labelledby` + focusable fields).
 */

interface GovernanceFormDialogProps {
  /** Whether the dialog is mounted-open. */
  readonly open: boolean;
  /** Dismiss intent (cancel Button / backdrop click / Escape). */
  readonly onClose: () => void;
  /** True while the container's governance mutation is in flight — dismissal gated. */
  readonly loading: boolean;
  /** The validated submit intent — the paper hosts the form element. */
  readonly onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  /** The dialog title's DOM id (the `aria-labelledby` target). */
  readonly titleId: string;
  /** The localized dialog title. */
  readonly title: string;
  /** The dialog body fields (rendered inside the grid `DialogContent`). */
  readonly children: ReactNode;
  /** The action row (typically {@link GovernanceDialogActions}). */
  readonly actions: ReactNode;
}

/** The gated form-dialog shell: Dialog + title + grid content (actions passed through). */
export function GovernanceFormDialog({
  open,
  onClose,
  loading,
  onSubmit,
  titleId,
  title,
  children,
  actions,
}: Readonly<GovernanceFormDialogProps>): ReactNode {
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
      slotProps={{ paper: { component: "form", onSubmit } }}
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId} sx={theme => ({ color: theme.palette.onSurface })}>
        {title}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>{children}</DialogContent>
      {actions}
    </Dialog>
  );
}

interface GovernanceDialogActionsProps {
  /** Dismiss intent — the cancel affordance (disabled while loading). */
  readonly onClose: () => void;
  /** True while the governance mutation is in flight. */
  readonly loading: boolean;
  /** Localized Common-namespace cancel label. */
  readonly cancelLabel: string;
  /** Localized confirm/submit label. */
  readonly submitLabel: string;
  /** The submit affordance's testid (the suites + e2e drive it). */
  readonly submitTestId: string;
  /**
   * Extra disable condition beyond `loading` (e.g. an empty required
   * token) — the submit stays available for gated-then-corrected submits.
   */
  readonly submitDisabled?: boolean;
  /** Submit palette — the destructive cancel arm uses `error`. */
  readonly submitColor?: "primary" | "error";
}

/** The shared dismiss/submit action pair of the governance dialogs. */
export function GovernanceDialogActions({
  onClose,
  loading,
  cancelLabel,
  submitLabel,
  submitTestId,
  submitDisabled,
  submitColor = "primary",
}: Readonly<GovernanceDialogActionsProps>): ReactNode {
  return (
    <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
      <Button onClick={onClose} disabled={loading} sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}>
        {cancelLabel}
      </Button>
      <Button
        type="submit"
        variant="contained"
        color={submitColor}
        disabled={loading || (submitDisabled ?? false)}
        data-testid={submitTestId}
        sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
      >
        {submitLabel}
      </Button>
    </DialogActions>
  );
}
