"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";
import { RetryableNotice } from "@/frontend/components/ui/RetryableNotice";
import type { MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests } from "@/frontend/graphql/generated/gql/graphql";
import {
  IncomingEmptyState,
  IncomingLoadErrorAlert,
  IncomingSkeletonList,
} from "@/frontend/views/students/link-requests/IncomingStates";
import { LinkRequestCard, type PendingDecision } from "@/frontend/views/students/link-requests/LinkRequestCard";
import type { CommonLabels } from "@/shared/locale/types/common";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { ParentLinkLabels } from "@/shared/locale/types/parentLink";

/**
 * The retryable `extensions.code` taxonomy covered by the shared
 * `RetryableNotice` (the legacy `RATE_LIMIT_EXCEEDED` producer alias is
 * normalized upstream, kept here as belt-and-braces) — module-private, the
 * same posture as the notifications feed error surface.
 */
const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  "RATE_LIMITED",
  "RATE_LIMIT_EXCEEDED",
  "SERVICE_UNAVAILABLE",
]);

/** True when the query failure belongs to the shared retryable seam. */
function isRetryableErrorCode(errorCode: string | null): boolean {
  return errorCode !== null && RETRYABLE_ERROR_CODES.has(errorCode);
}

interface IncomingBodyProps {
  /** Settled incoming rows (undefined while the query has no data yet). */
  readonly rows: readonly MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests[] | undefined;
  /** `extensions.code` of the list-query failure (null = no failure). */
  readonly queryErrorCode: string | null;
  /** List query loading flag (marks the settled list region busy). */
  readonly loading: boolean;
  /** Active app locale (drives the locale-aware timestamp stamps). */
  readonly locale: string;
  /** The mount-captured `now` (computed-expiry parity). */
  readonly nowMs: number;
  /** A respond mutation is in flight (global in-flight disable). */
  readonly respondInFlight: boolean;
  /** Retry-after-query-error refetch in flight. */
  readonly retryPending: boolean;
  /** `parentLink` namespace labels (property access only). */
  readonly labels: ParentLinkLabels;
  /** `errors` namespace labels (generic failure copy). */
  readonly errorLabels: ErrorsLabels;
  /** `common` namespace labels (retry affordance). */
  readonly commonLabels: CommonLabels;
  /** Retry handler — refetches the list query. */
  readonly onRetry: () => void;
  /** Opens the confirm/reject decision dialog for a row. */
  readonly onDecide: (decision: PendingDecision) => void;
}

/**
 * IncomingBody — the settled + unsettled list surface of the student
 * link-requests container. Early-return branches
 * (retryable → generic failure → skeleton → empty → settled list) instead
 * of a nested ternary chain (`sonarjs/no-nested-conditional`), mirroring
 * `NotificationsFeedBody`. The settled region is a `Box component="output"`
 * carrying `aria-busy` while a load/refetch/respond runs (the MUI v9
 * aria-live pattern), holding one `LinkRequestCard` per row in the
 * responsive grid (single column mobile → two columns from `md`).
 */
export function IncomingBody({
  rows,
  queryErrorCode,
  loading,
  locale,
  nowMs,
  respondInFlight,
  retryPending,
  labels,
  errorLabels,
  commonLabels,
  onRetry,
  onDecide,
}: Readonly<IncomingBodyProps>): ReactNode {
  if (rows === undefined) {
    if (isRetryableErrorCode(queryErrorCode)) {
      return (
        <RetryableNotice
          kind={queryErrorCode === "SERVICE_UNAVAILABLE" ? "SERVICE_UNAVAILABLE" : "RATE_LIMITED"}
          onRetry={onRetry}
          retryInFlight={retryPending}
        />
      );
    }
    if (queryErrorCode !== null) {
      return (
        <IncomingLoadErrorAlert
          errorLabels={errorLabels}
          retryLabel={commonLabels.retry}
          onRetry={onRetry}
          retryPending={retryPending}
        />
      );
    }
    return <IncomingSkeletonList />;
  }
  if (rows.length === 0) {
    return <IncomingEmptyState labels={labels} />;
  }
  return (
    <Box
      component="output"
      data-testid="student-link-requests-list"
      aria-label={labels.studentPageTitle}
      aria-busy={loading || respondInFlight}
      sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}
    >
      {rows.map(row => (
        <LinkRequestCard
          key={row.id}
          row={row}
          labels={labels}
          locale={locale}
          nowMs={nowMs}
          respondInFlight={respondInFlight}
          onDecide={onDecide}
        />
      ))}
    </Box>
  );
}
