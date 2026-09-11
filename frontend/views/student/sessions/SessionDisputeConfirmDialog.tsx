"use client";

import { useMutation } from "@apollo/client/react";
import type { ReactNode } from "react";
import { openSessionDisputeMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { SessionConfirmDialogLayout } from "@/frontend/views/student/sessions/SessionConfirmDialogLayout";
import { handleDisputeSessionMutationError } from "@/frontend/views/student/sessions/sessionDialogErrorArms";
import { Errors, Sessions, useAppTranslation } from "@/shared/locale";

/**
 * SessionDisputeConfirmDialog — the confirm-and-reason seam for opening a
 * dispute on a `Scheduled`/`Started` session (student or teacher side,
 * DEV3-005 R-110). Structural twin of `CancelSessionConfirmDialog`: same
 * portal/dialog/controlled-textarea form, REQUIRED reason instead of
 * optional, and a snackbar-mapped error vocabulary instead of the row-evict
 * arm.
 *
 * Mutation behavior (plan §3.1 — dispute flow, NO refetch):
 *
 * | Outcome (extensions.code)                     | Behavior |
 * |-----------------------------------------------|----------|
 * | success                                       | cache NORMALIZE — `update` rewrites `status`/`disputeReason`/`disputedAt` on the normalized `Session:<id>` entity so the row flips to its DISPUTED chip instantly (the returned `Session!` payload also auto-merges); `onDisputed` up to the container → the role container's dispute-opened snackbar |
 * | `SESSION_NOT_FOUND` (not-found family)        | `onSessionMissing` up to the container → `errors.sessionNotFound` ERROR SNACKBAR. Deliberately NO eviction arm (unlike the cancel dialog): a dispute denial never mutates the caller's list — a row the caller can SEE is theirs, so the not-found answer can only mean a raced deletion/foreign id, and the honest surface is the notice while the row stays put. This also keeps the runner-hostile evict+gc broadcast (D9, deferred-items.md) OUT of the dispute flow. |
 * | `SESSION_INVALID_TRANSITION`                  | `onInvalidTransition` up to the container → `errors.sessionInvalidTransition` ERROR SNACKBAR (the dispute vocabulary per plan §4 is snackbar-mapped, NOT the cancel flow's row-scoped inline alert) |
 * | `VALIDATION` (server rejected the reason)     | `onFailure(errors.validation)` → error snackbar; the dialog stays open for a retry |
 * | `FORBIDDEN`                                   | `onFailure(errors.forbidden)` → error snackbar; the dialog stays open for a retry |
 * | masked `INTERNAL_SERVER_ERROR` / anything else| `onFailure(sessions.genericError)` → error snackbar; the dialog stays open for a retry |
 *
 * The code classification lives in `sessionDialogErrorArms.ts`
 * (`handleDisputeSessionMutationError`) — the server `message` is NEVER
 * echoed.
 *
 * Reason field: REQUIRED (trimmed 1..{@link MAX_DISPUTE_REASON_LENGTH}
 * chars at the UI seam, mirroring the backend contract), live raw-character
 * counter, `aria-invalid` raised when a submit carries an empty/over-cap
 * value. An empty submit never reaches the wire.
 *
 * Form discipline: `React.SubmitEvent` (NEVER `FormEvent` — React 19 rules),
 * submit button disabled while the mutation is in flight.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, `*Outlined`
 * icons only, ≥44px touch targets on the action buttons.
 */

/** UI-seam cap for the required dispute reason (mirrors the backend contract). */
export const MAX_DISPUTE_REASON_LENGTH = 500;

interface SessionDisputeConfirmDialogProps {
  /** Id of the session being disputed. */
  readonly sessionId: string;
  readonly open: boolean;
  /**
   * Dismiss intent (cancel Button / backdrop click / Escape) — ignored
   * while the dispute mutation is pending: the Dialog's `onClose` is gated
   * on the `loading` flag below and the cancel Button is separately
   * `disabled={loading}`.
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
  const te = useAppTranslation(Errors);

  const [openDispute, { loading }] = useMutation(openSessionDisputeMutationDocument, {
    // Cache NORMALIZE on success — rewrite the transitioned dispute fields
    // onto the normalized `Session:<id>` entity (belt-and-braces over the
    // automatic normalized merge of the returned `Session!` payload).
    // NO refetch — the row flips to its DISPUTED chip in place.
    update(cache, { data }) {
      const disputed = data?.openSessionDispute;
      if (!disputed) return;
      cache.modify({
        id: cache.identify({ __typename: "Session", id: disputed.id }),
        fields: {
          status: () => disputed.status,
          disputeReason: () => disputed.disputeReason,
          disputedAt: () => disputed.disputedAt,
        },
      });
    },
    onCompleted: data => {
      onDisputed(data.openSessionDispute.id);
    },
    onError: error => {
      handleDisputeSessionMutationError(error, {
        sessionId,
        onSessionMissing,
        onInvalidTransition,
        onFailure,
        validationCopy: te.validation,
        forbiddenCopy: te.forbidden,
        genericErrorCopy: t.genericError,
      });
    },
  });

  return (
    <SessionConfirmDialogLayout
      idPrefix="dispute-session"
      open={open}
      onClose={onClose}
      title={t.disputeConfirmTitle}
      warningMessage={t.disputeConfirmBody}
      reasonLabel={t.disputeReasonLabel}
      reasonPlaceholder={t.disputeReasonPlaceholder}
      reasonRequired={true}
      reasonRequiredMessage={t.disputeReasonRequired}
      maxLength={MAX_DISPUTE_REASON_LENGTH}
      loading={loading}
      onSubmit={reason => {
        void openDispute({ variables: { id: sessionId, reason } });
      }}
      submitLabel={t.openDispute}
      submitColor="warning"
    />
  );
}
