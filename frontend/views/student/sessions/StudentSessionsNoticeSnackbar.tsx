"use client";

import type { ReactNode } from "react";
import { SessionNoticeSnackbar } from "@/frontend/components/ui/sessionList";
import type { ContainerNotice } from "@/frontend/views/student/sessions/useStudentSessionNotices";

interface StudentSessionsNoticeSnackbarProps {
  /** The active transient notice, or `null` while the slot is empty. */
  readonly notice: ContainerNotice | null;
  /** Dismiss intent (autohide, click-away, close icon). */
  readonly onDismiss: () => void;
}

/**
 * The container's single transient notice surface — the student-sessions
 * slot of the shared `SessionNoticeSnackbar`.
 */
export function StudentSessionsNoticeSnackbar({
  notice,
  onDismiss,
}: Readonly<StudentSessionsNoticeSnackbarProps>): ReactNode {
  return <SessionNoticeSnackbar notice={notice} onDismiss={onDismiss} />;
}
