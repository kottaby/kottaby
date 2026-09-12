"use client";

import type { ReactNode } from "react";
import { CancelSessionConfirmDialog } from "@/frontend/views/student/sessions/CancelSessionConfirmDialog";
import { RateTeacherDialog } from "@/frontend/views/student/sessions/RateTeacherDialog";
import { SessionDisputeConfirmDialog } from "@/frontend/views/student/sessions/SessionDisputeConfirmDialog";

interface StudentSessionsDialogsProps {
  /** Id of the session whose cancel dialog is open (`null` = not mounted). */
  readonly cancelDialogSessionId: string | null;
  /** Id of the session whose dispute dialog is open (`null` = not mounted). */
  readonly disputeDialogSessionId: string | null;
  /** Id of the session whose rate dialog is open (`null` = not mounted). */
  readonly rateDialogSessionId: string | null;
  readonly onCloseCancelDialog: () => void;
  /** Closing the dispute dialog also releases the row's dispute slot. */
  readonly onCloseDisputeDialog: () => void;
  readonly onCloseRateDialog: () => void;
  /** Cancel-dialog outcome arms — see the container's wiring docblock. */
  readonly onCancelled: (sessionId: string) => void;
  readonly onSessionMissing: (sessionId: string) => void;
  readonly onInvalidTransition: (sessionId: string) => void;
  readonly onDuplicateReplay: () => void;
  readonly onCancelFailure: (message: string) => void;
  /** Dispute-dialog outcome arms — see the container's wiring docblock. */
  readonly onDisputed: (sessionId: string) => void;
  readonly onDisputeSessionMissing: (sessionId: string) => void;
  readonly onDisputeInvalidTransition: (sessionId: string) => void;
  readonly onDisputeFailure: (message: string) => void;
  /** Rate-dialog outcome arms — see the container's wiring docblock. */
  readonly onRated: (sessionId: string) => void;
  readonly onRateSessionMissing: (sessionId: string) => void;
  readonly onRateSessionNotCompleted: (sessionId: string) => void;
  readonly onRateAlreadySubmitted: (sessionId: string) => void;
  readonly onRateFailure: (message: string) => void;
}

/**
 * The three single-slot dialogs, mounted UNMOUNTED-KEYED per session
 * (`key={sessionId}`) so every open starts from the dialogs' initial draft
 * state. Dismissal + outcome routing stay owned by the dialogs and the
 * container's arm hooks; this component is the mounting seam only.
 */
export function StudentSessionsDialogs({
  cancelDialogSessionId,
  disputeDialogSessionId,
  rateDialogSessionId,
  onCloseCancelDialog,
  onCloseDisputeDialog,
  onCloseRateDialog,
  onCancelled,
  onSessionMissing,
  onInvalidTransition,
  onDuplicateReplay,
  onCancelFailure,
  onDisputed,
  onDisputeSessionMissing,
  onDisputeInvalidTransition,
  onDisputeFailure,
  onRated,
  onRateSessionMissing,
  onRateSessionNotCompleted,
  onRateAlreadySubmitted,
  onRateFailure,
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
          onDisputed={onDisputed}
          onSessionMissing={onDisputeSessionMissing}
          onInvalidTransition={onDisputeInvalidTransition}
          onFailure={onDisputeFailure}
        />
      ) : null}
      {rateDialogSessionId !== null ? (
        <RateTeacherDialog
          key={rateDialogSessionId}
          sessionId={rateDialogSessionId}
          open
          onClose={onCloseRateDialog}
          onRated={onRated}
          onSessionMissing={onRateSessionMissing}
          onSessionNotCompleted={onRateSessionNotCompleted}
          onAlreadySubmitted={onRateAlreadySubmitted}
          onFailure={onRateFailure}
        />
      ) : null}
    </>
  );
}
