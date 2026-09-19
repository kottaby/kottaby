"use client";

/**
 * TeacherSessionReportDialogMount — the conditional mount for the
 * session-report dialog, extracted from the container to keep the
 * container function under the oxlint max-lines-per-function ceiling.
 * Resolves the session row from the cached `myTeacherSessions` data,
 * derives the studentId + status, and mounts the dialog when the
 * `sessionId` slot is non-null.
 */

import type { ReactNode } from "react";
import { type MyTeacherSessionsQuery, SessionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { TeacherSessionReportDialog } from "@/frontend/views/teacher/sessions/TeacherSessionReportDialog";
import { type ContainerNotice, dropRowAlert } from "@/frontend/views/teacher/sessions/teacherSessionSlots";

export interface TeacherSessionReportDialogMountProps {
  readonly sessionId: string | null;
  readonly data: MyTeacherSessionsQuery | undefined;
  readonly onClose: () => void;
  readonly setNotice: (notice: ContainerNotice | null) => void;
  readonly setRowAlerts: React.Dispatch<React.SetStateAction<Readonly<Record<string, string>>>>;
}

export function TeacherSessionReportDialogMount({
  sessionId,
  data,
  onClose,
  setNotice,
  setRowAlerts,
}: Readonly<TeacherSessionReportDialogMountProps>): ReactNode {
  if (sessionId === null) return null;
  const row = data?.myTeacherSessions?.items?.find(s => s.id === sessionId);
  return (
    <TeacherSessionReportDialog
      key={sessionId}
      sessionId={sessionId}
      studentId={row?.studentId ?? ""}
      sessionStatus={row?.status === SessionStatus.Started ? "started" : "completed"}
      open
      onClose={onClose}
      setNotice={setNotice}
      setRowAlert={(id, msg) => setRowAlerts(prev => (msg === null ? dropRowAlert(prev, id) : { ...prev, [id]: msg }))}
    />
  );
}
