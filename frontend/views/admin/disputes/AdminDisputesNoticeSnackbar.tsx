"use client";

import type { ReactNode } from "react";
import { SessionNoticeSnackbar } from "@/frontend/components/ui/sessionList";
import type { ContainerNotice } from "@/frontend/views/admin/disputes/useAdminDisputesNotice";

/**
 * AdminDisputesNoticeSnackbar — the arbitration-queue slot of the shared
 * `SessionNoticeSnackbar`, fed by {@link useAdminDisputesNotice}'s
 * `ContainerNotice` (ONE transient success / info / error notice).
 */

interface AdminDisputesNoticeSnackbarProps {
  readonly notice: ContainerNotice | null;
  readonly onDismiss: () => void;
}

/** The single transient arbitration-outcome snackbar. */
export function AdminDisputesNoticeSnackbar({
  notice,
  onDismiss,
}: Readonly<AdminDisputesNoticeSnackbarProps>): ReactNode {
  return <SessionNoticeSnackbar notice={notice} onDismiss={onDismiss} />;
}
