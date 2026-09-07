import {
  type SessionDisputeOutcomeArms,
  useSessionDisputeOutcomeArms,
} from "@/frontend/views/student/sessions/useSessionDisputeOutcomeArms";
import type { StudentSessionNoticeWiring } from "@/frontend/views/student/sessions/useStudentSessionNotices";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/** Copy handles + shared setters + the dialog close the arms ride on. */
export interface StudentSessionDisputeArmsDeps extends StudentSessionNoticeWiring {
  /** `Sessions` namespace labels (compile-time i18n handles). */
  readonly sessionsCopy: SessionsLabels;
  /** `Errors` namespace labels (compile-time i18n handles). */
  readonly errorsCopy: ErrorsLabels;
  /** Closing the dispute dialog also releases the row's dispute slot. */
  readonly closeDisputeDialog: () => void;
}

/** The dispute-dialog outcome arms consumed by `SessionDisputeConfirmDialog`. */
export type StudentSessionDisputeArms = SessionDisputeOutcomeArms;

/**
 * Dispute-dialog outcome arms (ALL snackbars; the row stays in the list;
 * the dialog closes and releases the dispute slot on every terminal arm):
 * the dispute vocabulary per plan §4 is snackbar-mapped, NOT the cancel
 * flow's row-scoped inline alert. Delegates to the role-neutral
 * `useSessionDisputeOutcomeArms` (the SAME four arms the teacher container
 * wires over its own dialog slot).
 */
export function useStudentSessionDisputeArms(deps: Readonly<StudentSessionDisputeArmsDeps>): StudentSessionDisputeArms {
  const { sessionsCopy, errorsCopy, closeDisputeDialog, setRowAlerts, setNotice } = deps;
  return useSessionDisputeOutcomeArms({ sessionsCopy, errorsCopy, closeDisputeDialog, setRowAlerts, setNotice });
}
