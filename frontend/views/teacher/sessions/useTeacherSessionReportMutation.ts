"use client";

/**
 * useTeacherSessionReportMutation — the dialog's submit arm. Encapsulates
 * the `useMutation` call + the `extensions.code` → behavior mapping
 * (plan §8.H). Kept separate from the dialog component so the dialog
 * file stays under the oxlint `max-lines-per-function` ceiling.
 */

import { useApolloClient, useMutation } from "@apollo/client/react";
import { myTeacherSessionsQueryDocument } from "@/frontend/graphql/sharedDocuments/scheduling";
import { submitSessionReportMutationDocument } from "@/frontend/graphql/sharedDocuments/scheduling/session-report.documents";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import type { ContainerNotice } from "@/frontend/views/teacher/sessions/teacherSessionSlots";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

const CODE_ALREADY_EXISTS = "SESSION_REPORT_ALREADY_EXISTS";
const CODE_INVALID_TRANSITION = "SESSION_INVALID_TRANSITION";

export interface TeacherSessionReportMutationWiring {
  readonly t: SessionsLabels;
  readonly sessionId: string;
  readonly onClose: () => void;
  readonly setNotice: (notice: ContainerNotice | null) => void;
  readonly setRowAlert: (sessionId: string, message: string | null) => void;
}

/** Returns the mutation tuple + loading flag. */
export function useTeacherSessionReportMutation(wiring: TeacherSessionReportMutationWiring) {
  const client = useApolloClient();
  return useMutation(submitSessionReportMutationDocument, {
    onError: error => {
      const code = extractErrorCode(error) ?? "";
      if (code === CODE_ALREADY_EXISTS) {
        wiring.setNotice({ message: wiring.t.reportAlreadySubmittedNotice, severity: "info" });
        void client.refetchQueries({ include: [myTeacherSessionsQueryDocument] });
        wiring.onClose();
        return;
      }
      if (code === CODE_INVALID_TRANSITION) {
        wiring.setRowAlert(wiring.sessionId, code);
        return;
      }
      wiring.setNotice({ message: wiring.t.genericError, severity: "error" });
    },
    onCompleted: () => {
      wiring.setNotice({ message: wiring.t.reportSubmitSuccessNotice, severity: "success" });
      void client.refetchQueries({ include: [myTeacherSessionsQueryDocument] });
    },
  });
}
