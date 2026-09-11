"use client";

import type { ReactNode } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { StudentLinkRequestsView } from "@/frontend/views/students/link-requests/StudentLinkRequestsView";
import { useStudentLinkRequests } from "@/frontend/views/students/link-requests/useStudentLinkRequests";

/**
 * StudentLinkRequestsContainer — the client heart of
 * `/student/link-requests`.
 *
 * Orchestrates data fetching and decision mutation workflow via `useStudentLinkRequests`,
 * handles authorization fallback (`PermissionDeniedFallback`), and delegates
 * layout rendering to `StudentLinkRequestsView`.
 */
export function StudentLinkRequestsContainer(): ReactNode {
  const state = useStudentLinkRequests();

  // Denial class — replaces the whole container, mirroring the
  // denial-surface precedent on the parent handshake discovery container.
  if (state.queryErrorCode === "UNAUTHORIZED" || state.queryErrorCode === "FORBIDDEN") {
    return <PermissionDeniedFallback />;
  }

  return (
    <StudentLinkRequestsView
      rows={state.rows}
      queryErrorCode={state.queryErrorCode}
      loading={state.loading}
      locale={state.locale}
      nowMs={state.nowMs}
      inFlight={state.inFlight}
      retryPending={state.retryPending}
      denialCode={state.denialCode}
      successToast={state.successToast}
      decision={state.decision}
      labels={state.labels}
      errorLabels={state.errorLabels}
      commonLabels={state.commonLabels}
      onRetry={state.handleRetry}
      onDecide={state.setDecision}
      onDecisionSubmit={state.handleDecisionSubmit}
      onCloseDecision={state.closeDecision}
      onDismissSuccessToast={state.dismissSuccessToast}
    />
  );
}
