"use client";

import { Dialog, DialogTitle } from "@mui/material";
import { type ReactNode, useState } from "react";
import type { DisputeResolution } from "@/frontend/graphql/generated/gql/graphql";
import { ResolveDisputeActionsRow } from "@/frontend/views/admin/disputes/ResolveDisputeActionsRow";
import { ResolveDisputeFormFields } from "@/frontend/views/admin/disputes/ResolveDisputeFormFields";
import { resolveDisputeOutcomeOptions } from "@/frontend/views/admin/disputes/resolveDisputeOutcomeOptions";
import {
  deriveResolveDisputeDraftState,
  isPartialAmountValid,
} from "@/frontend/views/admin/disputes/resolvePartialAmount";
import { useResolveSessionDispute } from "@/frontend/views/admin/disputes/useResolveSessionDispute";
import { Common, Errors, Sessions, useAppTranslation } from "@/shared/locale";

/**
 * ResolveDisputeDialog — the ADMIN arbitration seam for one disputed session
 * (`/disputes`). Structural sibling of the participant
 * `CancelSessionConfirmDialog` family: same portal/dialog/form discipline,
 * but the decision space is EXACTLY ONE terminal outcome, OFFERED by the
 * row's escrow class — held rows (`feeHeld=true`) choose between
 * Cancel/Complete, consumed rows between Refund/PartialRefund/Uphold
 * (`resolveDisputeOutcomeOptions`); the radios never offer an outcome
 * outside the row's class and every picked value passes through as-is.
 *
 * Partial-refund amount: rendered ONLY while PARTIAL_REFUND is selected,
 * gated client-side against the fee-bounded two-decimal money policy
 * (`isPartialAmountValid` — the server re-validates before any write); a
 * blocked submit raises the localized errors-namespace copy inside the
 * dialog. A resolution that no longer belongs to the row's class (stale
 * selection after a cache flip) raises the localized classification
 * mismatch copy and disarms the submit — nothing is silently reclassified.
 *
 * Note field: OPTIONAL, ≤ {@link MAX_RESOLVE_NOTE_LENGTH} chars at the UI
 * seam (mirrors the backend contract), live raw-character counter. The
 * submit stays disabled until a resolution is chosen — an arbitration
 * outcome is never implied by a default.
 *
 * Mutation behavior (arbitration flow, NO refetch) — the
 * `resolveSessionDispute` mutation, its cache-convergence `update` arm and
 * the extensions-code classification live in
 * {@link useResolveSessionDispute}; EVERY outcome surfaces a snackbar up to
 * the container (`onResolved` / `onSessionMissing` /
 * `onInvalidTransition` / `onFailure`), and the dialog stays open for a
 * corrected choice on every failure arm.
 *
 * Form discipline: `React.SubmitEvent` (NEVER `FormEvent` — React 19 rules),
 * submit disabled while the mutation is in flight or no resolution chosen.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, `*Outlined`
 * icons only, ≥44px touch targets on the action buttons.
 */

interface ResolveDisputeDialogProps {
  /** Id of the disputed session being arbitrated. */
  readonly sessionId: string;
  /**
   * The disputed row's escrow class — offers the outcome vocabulary
   * (`true` → Cancel/Complete, `false` → Refund/PartialRefund/Uphold) and
   * bounds the partial-refund amount validation.
   */
  readonly feeHeld: boolean;
  /** The disputed row's verbatim fee (the partial-amount upper bound); `null` fails the range check closed. */
  readonly fee: string | null;
  readonly open: boolean;
  /**
   * Dismiss intent (cancel Button / backdrop click / Escape) — ignored
   * while the resolve mutation is pending: the Dialog's `onClose` is gated
   * on the `loading` flag below and the cancel Button is separately
   * `disabled={loading}`.
   */
  readonly onClose: () => void;
  /** Success — the queue cache already dropped the row. */
  readonly onResolved: (sessionId: string) => void;
  /** `SESSION_NOT_FOUND` — error snackbar; the row stays (see the docblock). */
  readonly onSessionMissing: (sessionId: string) => void;
  /** `SESSION_INVALID_TRANSITION` — error snackbar; the row stays. */
  readonly onInvalidTransition: (sessionId: string) => void;
  /** Everything else — error toast; the dialog stays open for a retry. */
  readonly onFailure: (message: string) => void;
}

/** Confirm-and-resolve arbitration dialog owning the `resolveSessionDispute` mutation. */
export function ResolveDisputeDialog({
  sessionId,
  feeHeld,
  fee,
  open,
  onClose,
  onResolved,
  onSessionMissing,
  onInvalidTransition,
  onFailure,
}: Readonly<ResolveDisputeDialogProps>): ReactNode {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);
  const tc = useAppTranslation(Common);

  // No default resolution — arbitration requires an EXPLICIT outcome choice.
  const [resolution, setResolution] = useState<DisputeResolution | null>(null);
  const [note, setNote] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  // The amount policy error raises LIVE once the value is a non-empty
  // invalid amount, or after a submit attempt — never on a pristine field.
  const [amountErrorArmed, setAmountErrorArmed] = useState(false);

  const { resolveDispute, loading } = useResolveSessionDispute({
    sessionId,
    onResolved,
    onSessionMissing,
    onInvalidTransition,
    onFailure,
  });

  // The offered outcomes + the picked value travel as STRINGS (the shipped
  // wire-comparison idiom) so no enum-vs-enum comparison ever fires.
  const options = resolveDisputeOutcomeOptions(feeHeld, t);
  const { isPartialRefund, selectionOffClass, amountError } = deriveResolveDisputeDraftState({
    resolution,
    options,
    fee,
    partialAmount,
    amountErrorArmed,
    amountInvalidCopy: te.partialRefundAmountInvalid,
  });

  const handleResolutionChange = (next: DisputeResolution | null): void => {
    setResolution(next);
  };

  const handleAmountChange = (next: string): void => {
    setPartialAmount(next);
    setAmountErrorArmed(next.length > 0 && !isPartialAmountValid(next, fee));
  };

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading || resolution === null || selectionOffClass) return;
    if (isPartialRefund && !isPartialAmountValid(partialAmount, fee)) {
      setAmountErrorArmed(true);
      return;
    }
    const trimmed = note.trim();
    void resolveDispute({
      variables: {
        id: sessionId,
        resolution,
        note: trimmed.length === 0 ? null : trimmed,
        // The amount rides ONLY with a PartialRefund arbitration — every
        // other outcome carries the explicit null.
        partialAmount: isPartialRefund ? partialAmount : null,
      },
    });
  };

  /** Dismissal gate: backdrop/Escape are ignored while the mutation is pending. */
  const handleDialogClose = (): void => {
    if (!loading) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: "form", onSubmit: handleSubmit } }}
      aria-labelledby="resolve-dispute-dialog-title"
    >
      <DialogTitle id="resolve-dispute-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.resolveDisputeTitle}
      </DialogTitle>
      <ResolveDisputeFormFields
        introBody={t.resolveDisputeBody}
        selectionOffClass={selectionOffClass}
        mismatchCopy={te.disputeResolutionMismatch}
        options={options}
        resolution={resolution}
        onResolutionChange={handleResolutionChange}
        groupLabel={t.resolveDisputeTitle}
        isPartialRefund={isPartialRefund}
        partialAmount={partialAmount}
        onAmountChange={handleAmountChange}
        amountError={amountError}
        fee={fee}
        note={note}
        onNoteChange={setNote}
        t={t}
      />
      <ResolveDisputeActionsRow
        loading={loading}
        canSubmit={resolution !== null && !selectionOffClass}
        onCancel={onClose}
        cancelLabel={tc.cancel}
        submitLabel={t.resolveDisputeSubmit}
      />
    </Dialog>
  );
}
