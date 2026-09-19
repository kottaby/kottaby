"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import type { ReactNode } from "react";

/**
 * Shared form-dialog atoms for the admin student drawer's subscription
 * dialogs (extend / renew / cancel / change plan — the drawer's
 * subscription-management section).
 *
 * Structural siblings of the admin session-governance dialogs
 * (`dialogFormAtoms.tsx`): portal/dialog/form discipline,
 * `React.SubmitEvent`, and dismissal gated while the mutation is in
 * flight. The repeated shell — the gated `Dialog` + `DialogTitle` +
 * grid `DialogContent`, and the dismiss/submit `DialogActions` pair —
 * lives HERE exactly once and the four dialogs compose it.
 *
 * The dismissal gate enforces the `onClose` prop contract at the dialog
 * itself: backdrop click and Escape are IGNORED while the mutation is
 * pending (the dismiss Button is separately disabled while loading).
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, ≥44px touch
 * targets, keyboard-focusable dialog (`aria-labelledby` + focusable fields).
 */

interface SubscriptionFormDialogProps {
  /** Whether the dialog is mounted-open. */
  readonly open: boolean;
  /** Dismiss intent (dismiss Button / backdrop click / Escape). */
  readonly onClose: () => void;
  /** True while the section's mutation is in flight — dismissal gated. */
  readonly loading: boolean;
  /** The validated submit intent — the paper hosts the form element. */
  readonly onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  /** The dialog title's DOM id (the `aria-labelledby` target). */
  readonly titleId: string;
  /** The localized dialog title. */
  readonly title: string;
  /** The dialog body (fields + copy + server-error alert). */
  readonly children: ReactNode;
  /** The action row (typically {@link SubscriptionDialogActions}). */
  readonly actions: ReactNode;
}

/** The gated form-dialog shell: Dialog + title + grid content (actions passed through). */
export function SubscriptionFormDialog({
  open,
  onClose,
  loading,
  onSubmit,
  titleId,
  title,
  children,
  actions,
}: Readonly<SubscriptionFormDialogProps>): ReactNode {
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
      maxWidth="xs"
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

interface SubscriptionDialogActionsProps {
  /** Dismiss intent — the cancel affordance (disabled while loading). */
  readonly onClose: () => void;
  /** True while the section's mutation is in flight. */
  readonly loading: boolean;
  /** Localized Common-namespace dismiss label. */
  readonly dismissLabel: string;
  /** Localized confirm/submit label. */
  readonly submitLabel: string;
  /** The submit affordance's testid (the suites drive it). */
  readonly submitTestId: string;
  /**
   * Extra disable condition beyond `loading` (e.g. an invalid days count
   * or no eligible target plan) — the submit stays available for
   * gated-then-corrected submits.
   */
  readonly submitDisabled?: boolean;
  /** Submit palette — the destructive cancel arm uses `error`. */
  readonly submitColor?: "primary" | "error";
}

/** The shared dismiss/submit action pair of the subscription dialogs. */
export function SubscriptionDialogActions({
  onClose,
  loading,
  dismissLabel,
  submitLabel,
  submitTestId,
  submitDisabled,
  submitColor = "primary",
}: Readonly<SubscriptionDialogActionsProps>): ReactNode {
  return (
    <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
      {/* Outlined dismiss — a bare text button beside a contained primary
          reads as non-interactive; the outlined variant gives the dismiss
          affordance equal control quality (still ONE contained primary). */}
      <Button
        onClick={onClose}
        disabled={loading}
        variant="outlined"
        color="inherit"
        sx={{ minHeight: { xs: 44, sm: 40 }, px: 3, whiteSpace: "nowrap" }}
      >
        {dismissLabel}
      </Button>
      <Button
        type="submit"
        variant="contained"
        color={submitColor}
        disabled={loading || (submitDisabled ?? false)}
        data-testid={submitTestId}
        sx={theme => ({
          minHeight: { xs: 44, sm: 40 },
          px: 3,
          whiteSpace: "nowrap",
          // A disabled destructive submit keeps its error identity (dimmed
          // error-container pair instead of the neutral disabled wash) —
          // the destructive intent must read before the form is valid.
          ...(submitColor === "error" && {
            "&.Mui-disabled": {
              bgcolor: theme.palette.errorContainer,
              color: theme.palette.onErrorContainer,
              opacity: 0.6,
            },
          }),
        })}
      >
        {submitLabel}
      </Button>
    </DialogActions>
  );
}
