/**
 * useSessionDisputeOutcomeArms — the four dispute-dialog outcome callbacks
 * shared by the student and teacher sessions containers.
 *
 * ALL outcomes are snackbars (the row stays in the list); the dialog closes
 * and releases the row's dispute slot on every terminal arm. The dispute
 * vocabulary is snackbar-mapped, NOT the cancel flow's row-scoped inline
 * alert. The session-missing arm deliberately performs NO eviction (see the
 * dispute dialog's docblock) — the honest surface is the error notice. The
 * failure arm leaves the dialog OPEN for a retry (the dispute slot stays
 * claimed); the caller passes its copy handles + shared setters + the dialog
 * close the arms ride on.
 */

import { useCallback } from "react";
import { type ContainerNotice, dropRowAlert } from "@/frontend/views/student/sessions/useStudentSessionNotices";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/** Copy handles + shared setters + the dialog close the arms ride on. */
export interface SessionDisputeOutcomeWiring {
  /** `Sessions` namespace labels (compile-time i18n handles). */
  readonly sessionsCopy: SessionsLabels;
  /** `Errors` namespace labels (compile-time i18n handles). */
  readonly errorsCopy: ErrorsLabels;
  /** Closing the dispute dialog also releases the row's dispute slot. */
  readonly closeDisputeDialog: () => void;
  readonly setRowAlerts: (
    updater: (prev: Readonly<Record<string, string>>) => Readonly<Record<string, string>>
  ) => void;
  readonly setNotice: (notice: ContainerNotice) => void;
}

/** The dispute-dialog outcome arms consumed by `SessionDisputeConfirmDialog`. */
export interface SessionDisputeOutcomeArms {
  /** success → `sessions.disputeOpenedNotice` snackbar; the row flips to DISPUTED via the dialog's cache normalize */
  readonly handleDisputed: (sessionId: string) => void;
  /** `SESSION_NOT_FOUND` → error snackbar; deliberately NO eviction arm — the row stays in the list */
  readonly handleDisputeSessionMissing: (sessionId: string) => void;
  /** `SESSION_INVALID_TRANSITION` → error snackbar; the row stays */
  readonly handleDisputeInvalidTransition: () => void;
  /** anything else → error snackbar; the dialog STAYS OPEN for a retry (the dispute slot stays claimed) */
  readonly handleDisputeFailure: (message: string) => void;
}

/** The dispute-dialog outcome arms — see the module docblock. */
export function useSessionDisputeOutcomeArms(wiring: SessionDisputeOutcomeWiring): SessionDisputeOutcomeArms {
  const { sessionsCopy: t, errorsCopy: te, closeDisputeDialog, setRowAlerts, setNotice } = wiring;

  const handleDisputed = useCallback(
    (sessionId: string): void => {
      setRowAlerts(prev => dropRowAlert(prev, sessionId));
      setNotice({ message: t.disputeOpenedNotice, severity: "success" });
      closeDisputeDialog();
    },
    [t, closeDisputeDialog, setRowAlerts, setNotice]
  );

  const handleDisputeSessionMissing = useCallback(
    (sessionId: string): void => {
      // Deliberately NO eviction arm (see the dispute dialog's docblock) —
      // the honest surface is the error notice; the row stays in the list.
      setRowAlerts(prev => dropRowAlert(prev, sessionId));
      setNotice({ message: te.sessionNotFound, severity: "error" });
      closeDisputeDialog();
    },
    [te, closeDisputeDialog, setRowAlerts, setNotice]
  );

  // No sessionId parameter: the invalid-transition arm never addresses the
  // row (no inline alert — the dispute vocabulary is snackbar-mapped), and a
  // parameterless callback stays assignable to the dialog's
  // `(sessionId: string) => void` prop type.
  const handleDisputeInvalidTransition = useCallback((): void => {
    setNotice({ message: te.sessionInvalidTransition, severity: "error" });
    closeDisputeDialog();
  }, [te, closeDisputeDialog, setNotice]);

  /**
   * Failure arm (VALIDATION / FORBIDDEN / masked) — the dispute dialog
   * STAYS OPEN for a retry (its own documented contract), so the dispute
   * slot stays claimed and the snackbar carries the resolved copy.
   */
  const handleDisputeFailure = useCallback(
    (message: string): void => {
      setNotice({ message, severity: "error" });
    },
    [setNotice]
  );

  return { handleDisputed, handleDisputeSessionMissing, handleDisputeInvalidTransition, handleDisputeFailure };
}
