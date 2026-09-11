"use client";

import { Alert, Box } from "@mui/material";
import type { ReactNode } from "react";
import type { MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests } from "@/frontend/graphql/generated/gql/graphql";
import { resolveParentLinkDenialCopy } from "@/frontend/lib/parent-link-denials";
import { IncomingBody } from "@/frontend/views/students/link-requests/IncomingBody";
import { IncomingHeader, SuccessToast } from "@/frontend/views/students/link-requests/IncomingStates";
import type { PendingDecision } from "@/frontend/views/students/link-requests/LinkRequestCard";
import { LinkRequestDecisionDialog } from "@/frontend/views/students/link-requests/LinkRequestDecisionDialog";
import type { AppLocale } from "@/shared/locale/AppLocale";
import type { CommonLabels } from "@/shared/locale/types/common";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { ParentLinkLabels } from "@/shared/locale/types/parentLink";

export interface StudentLinkRequestsViewProps {
  readonly rows?: ReadonlyArray<MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests>;
  readonly queryErrorCode: string | null;
  readonly loading: boolean;
  readonly locale: AppLocale;
  readonly nowMs: number;
  readonly inFlight: boolean;
  readonly retryPending: boolean;
  readonly denialCode: string | null;
  readonly successToast: string | null;
  readonly decision: PendingDecision | null;
  readonly labels: ParentLinkLabels;
  readonly errorLabels: ErrorsLabels;
  readonly commonLabels: CommonLabels;
  readonly onRetry: () => void;
  readonly onDecide: (decision: PendingDecision | null) => void;
  readonly onDecisionSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  readonly onCloseDecision: () => void;
  readonly onDismissSuccessToast: () => void;
}

/**
 * Presentational component for the student incoming link requests view.
 * Handles the layout Box, header, denial alert, body list, decision dialog,
 * and success toast.
 */
export function StudentLinkRequestsView(props: StudentLinkRequestsViewProps): ReactNode {
  const {
    rows,
    queryErrorCode,
    loading,
    locale,
    nowMs,
    inFlight,
    retryPending,
    denialCode,
    successToast,
    decision,
    labels,
    errorLabels,
    commonLabels,
    onRetry,
    onDecide,
    onDecisionSubmit,
    onCloseDecision,
    onDismissSuccessToast,
  } = props;

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 880,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        minHeight: { sm: "calc(100dvh - 113px)", md: "calc(100dvh - 129px)" },
      }}
    >
      <IncomingHeader labels={labels} />

      {denialCode !== null ? (
        <Alert
          severity="error"
          variant="outlined"
          data-testid="student-link-requests-denial-alert"
          sx={{ borderRadius: 2 }}
        >
          {resolveParentLinkDenialCopy(denialCode, errorLabels)}
        </Alert>
      ) : null}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3, my: { sm: "auto" } }}>
        <IncomingBody
          rows={rows}
          queryErrorCode={queryErrorCode}
          loading={loading}
          locale={locale}
          nowMs={nowMs}
          respondInFlight={inFlight}
          retryPending={retryPending}
          labels={labels}
          errorLabels={errorLabels}
          commonLabels={commonLabels}
          onRetry={onRetry}
          onDecide={onDecide}
        />
      </Box>

      <LinkRequestDecisionDialog
        decision={decision}
        labels={labels}
        commonLabels={commonLabels}
        pending={inFlight}
        onSubmit={onDecisionSubmit}
        onClose={onCloseDecision}
      />

      <SuccessToast copy={successToast} onClose={onDismissSuccessToast} />
    </Box>
  );
}
