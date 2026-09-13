"use client";

import type { ReactNode } from "react";
import { CancelSessionConfirmDialog } from "@/frontend/views/student/sessions/CancelSessionConfirmDialog";
import { RateTeacherDialog } from "@/frontend/views/student/sessions/RateTeacherDialog";
import { SessionDisputeConfirmDialog } from "@/frontend/views/student/sessions/SessionDisputeConfirmDialog";
import type { StudentSessionRateArms } from "@/frontend/views/student/sessions/useStudentSessionRateArms";

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
  /** Dispute-dialog outcome arms — see the container's wiring docblock. */
  readonly onDisputed: (sessionId: string) => void;
  readonly onDisputeSessionMissing: (sessionId: string) => void;
  readonly onDisputeInvalidTransition: (sessionId: string) => void;
  readonly onDisputeFailure: (message: string) => void;
}

/**
 * The two ROLE-SHARED single-slot confirm dialogs (cancel + dispute — both
 * participant surfaces own them), mounted UNMOUNTED-KEYED per session
 * (`key={sessionId}`) so every open starts from the dialogs' initial draft
 * state. Dismissal + outcome routing stay owned by the dialogs and the
 * container's arm hooks; this component is the mounting seam only.
 *
 * The student-only rate dialog is deliberately NOT part of this seam: the
 * teacher twin container mounts this seam too (cancel + dispute are common
 * to both roles), so a rate slot here would have to be optional for it —
 * students rate teachers; teachers never rate. The rate dialog therefore
 * mounts in the student container directly (the student-only composition
 * root), exactly the way the student-only row actions are scoped through
 * `StudentSessionsBody`.
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
          onDisputed={onDisputed}
          onSessionMissing={onDisputeSessionMissing}
          onInvalidTransition={onDisputeInvalidTransition}
          onFailure={onDisputeFailure}
        />
      ) : null}
    </>
  );
}

interface StudentRateDialogSlotProps {
  /** Id of the session whose rate dialog is open (`null` = not mounted). */
  readonly rateDialogSessionId: string | null;
  /** Closes the rate dialog slot (every terminal rate outcome). */
  readonly onCloseRateDialog: () => void;
  /** Rate-dialog outcome arms — see the student container's wiring docblock. */
  readonly rateArms: StudentSessionRateArms;
}

/**
 * The STUDENT-ONLY rate-dialog mounting seam — the rate slot that
 * deliberately does NOT ride the role-shared seam above: the teacher twin
 * container mounts that seam too, and students rate teachers (teachers
 * never rate), so the rate dialog can never enter the teacher tree through
 * it. Same UNMOUNTED-KEYED per-session shape (`key={sessionId}` — every
 * open starts from the dialog's initial draft state).
 */
export function StudentRateDialogSlot({
  rateDialogSessionId,
  onCloseRateDialog,
  rateArms,
}: Readonly<StudentRateDialogSlotProps>): ReactNode {
  if (rateDialogSessionId === null) {
    return null;
  }
  return (
    <RateTeacherDialog
      key={rateDialogSessionId}
      sessionId={rateDialogSessionId}
      open
      onClose={onCloseRateDialog}
      onRated={rateArms.handleRated}
      onSessionMissing={rateArms.handleSessionMissing}
      onSessionNotCompleted={rateArms.handleSessionNotCompleted}
      onAlreadySubmitted={rateArms.handleAlreadySubmitted}
      onFailure={rateArms.handleFailure}
    />
  );
}
