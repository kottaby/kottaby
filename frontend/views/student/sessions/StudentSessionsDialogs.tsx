"use client";

import type { ReactNode } from "react";
import { CancelSessionConfirmDialog } from "@/frontend/views/student/sessions/CancelSessionConfirmDialog";
import {
  SessionDisputeConfirmDialog,
  type SessionDisputeMutationProps,
} from "@/frontend/views/student/sessions/SessionDisputeConfirmDialog";

interface StudentSessionsDialogsProps {
  /** Id of the session whose cancel dialog is open (`null` = not mounted). */
  readonly cancelDialogSessionId: string | null;
  /** Id of the session whose dispute dialog is open (`null` = not mounted). */
  readonly disputeDialogSessionId: string | null;
  readonly onCloseCancelDialog: () => void;
  /** Closing the dispute dialog also releases the row's dispute slot. */
  readonly onCloseDisputeDialog: () => void;
  /** Cancel-dialog outcome arms — see the container's wiring docblock. */
  readonly onCancelled: (sessionId: string) => void;
  readonly onSessionMissing: (sessionId: string) => void;
  readonly onInvalidTransition: (sessionId: string) => void;
  readonly onDuplicateReplay: () => void;
  readonly onCancelFailure: (message: string) => void;
  /**
   * The dispute-dialog's mutation binding (document + result accessor) —
   * the caller picks the dispute generation per its surface: the student
   * container resolves the arm from the disputed row (post-confirmation vs
   * held-escrow); the teacher container keeps the shipped held-escrow
   * binding byte-stable.
   */
  readonly disputeMutation: SessionDisputeMutationProps;
  /** Dispute-dialog outcome arms — see the container's wiring docblock. */
  readonly onDisputed: (sessionId: string) => void;
  readonly onDisputeSessionMissing: (sessionId: string) => void;
  readonly onDisputeInvalidTransition: (sessionId: string) => void;
  readonly onDisputeFailure: (message: string) => void;
}

/**
 * The two single-slot confirm dialogs, mounted UNMOUNTED-KEYED per session
 * (`key={sessionId}`) so every open starts from the dialogs' initial draft
 * state. Dismissal + outcome routing stay owned by the dialogs and the
 * container's arm hooks; this component is the mounting seam only.
 */
export function StudentSessionsDialogs({
  cancelDialogSessionId,
  disputeDialogSessionId,
  onCloseCancelDialog,
  onCloseDisputeDialog,
  onCancelled,
  onSessionMissing,
  onInvalidTransition,
  onDuplicateReplay,
  onCancelFailure,
  disputeMutation,
  onDisputed,
  onDisputeSessionMissing,
  onDisputeInvalidTransition,
  onDisputeFailure,
}: Readonly<StudentSessionsDialogsProps>): ReactNode {
  return (
    <>
      {cancelDialogSessionId !== null ? (
        <CancelSessionConfirmDialog
          key={cancelDialogSessionId}
          sessionId={cancelDialogSessionId}
          open
          onClose={onCloseCancelDialog}
          onCancelled={onCancelled}
          onSessionMissing={onSessionMissing}
          onInvalidTransition={onInvalidTransition}
          onDuplicateReplay={onDuplicateReplay}
          onFailure={onCancelFailure}
        />
      ) : null}
      {disputeDialogSessionId !== null ? (
        <SessionDisputeConfirmDialog
          key={disputeDialogSessionId}
          sessionId={disputeDialogSessionId}
          open
          onClose={onCloseDisputeDialog}
          mutationDocument={disputeMutation.mutationDocument}
          resultAccessor={disputeMutation.resultAccessor}
          onDisputed={onDisputed}
          onSessionMissing={onDisputeSessionMissing}
          onInvalidTransition={onDisputeInvalidTransition}
          onFailure={onDisputeFailure}
        />
      ) : null}
    </>
  );
}
