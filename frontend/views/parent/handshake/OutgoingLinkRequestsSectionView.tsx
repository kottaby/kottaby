"use client";

import { Stack, Typography } from "@mui/material";
import type React from "react";
import type { ReactNode } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type { MyOutgoingParentLinkRequestsQuery_myOutgoingParentLinkRequests } from "@/frontend/graphql/generated/gql/graphql";
import { OutgoingLinkRequestCancelDialog } from "@/frontend/views/parent/handshake/OutgoingLinkRequestCancelDialog";
import {
  OutgoingLinkRequestCard,
  type PendingCancellation,
} from "@/frontend/views/parent/handshake/OutgoingLinkRequestCard";
import {
  OutgoingDenialAlert,
  OutgoingEmptyState,
  OutgoingSettledList,
  OutgoingSuccessToast,
} from "@/frontend/views/parent/handshake/OutgoingSectionStates";
import { OutgoingUnsettledBody } from "@/frontend/views/parent/handshake/OutgoingSectionStates.parts";
import { Common, Errors, ParentLink, useAppLocale, useAppTranslation } from "@/shared/locale";

export interface OutgoingLinkRequestsSectionViewProps {
  /** The settled outgoing parent link requests (undefined if loading/error). */
  readonly rows: readonly MyOutgoingParentLinkRequestsQuery_myOutgoingParentLinkRequests[] | undefined;
  /** Extracted GraphQL error code from the list query (null if none/success). */
  readonly queryErrorCode: string | null;
  /** True when the initial or refetch query is in flight. */
  readonly loading: boolean;
  /** True when a cancel mutation is globally in flight. */
  readonly cancelInFlight: boolean;
  /** The open cancel decision (null = no dialog). */
  readonly cancelDecision: PendingCancellation | null;
  /** Localized copy of the success toast (null = hidden). */
  readonly successToast: string | null;
  /** `extensions.code` of the last mutation denial (null = no inline alert). */
  readonly denialCode: string | null;
  /** True when the retry-after-query-error refetch is in flight. */
  readonly retryPending: boolean;
  /** The mount-captured `now` (computed-expiry parity). */
  readonly nowMs: number;
  /** Dismisses the success toast. */
  readonly onToastClose: () => void;
  /** Opens or closes the cancel dialog. */
  readonly onCancelDecisionChange: (decision: PendingCancellation | null) => void;
  /** Fires the query refetch (retry affordance). */
  readonly onRetry: () => void;
  /** Submits the cancel mutation from the dialog. */
  readonly onCancelSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
}

/**
 * Presentational view component for the outgoing requests section.
 * Extracted from the stateful container to separate rendering logic from hooks.
 */
export function OutgoingLinkRequestsSectionView(props: Readonly<OutgoingLinkRequestsSectionViewProps>): ReactNode {
  const t = useAppTranslation(ParentLink);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  if (props.queryErrorCode === "UNAUTHORIZED" || props.queryErrorCode === "FORBIDDEN") {
    return <PermissionDeniedFallback />;
  }

  let sectionBody: ReactNode;
  if (props.rows === undefined) {
    sectionBody = (
      <OutgoingUnsettledBody
        queryErrorCode={props.queryErrorCode}
        errorLabels={te}
        retryLabel={commonT.retry}
        onRetry={props.onRetry}
        retryPending={props.retryPending}
      />
    );
  } else if (props.rows.length === 0) {
    sectionBody = <OutgoingEmptyState labels={t} />;
  } else {
    sectionBody = (
      <OutgoingSettledList
        listLabel={t.outgoingTitle}
        busy={props.loading || props.cancelInFlight}
        rowNodes={props.rows.map(row => (
          <OutgoingLinkRequestCard
            key={row.id}
            row={row}
            labels={t}
            locale={locale}
            nowMs={props.nowMs}
            cancelInFlight={props.cancelInFlight}
            onCancel={props.onCancelDecisionChange}
          />
        ))}
      />
    );
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }} data-testid="parent-outgoing-section">
      <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
        {t.outgoingTitle}
      </Typography>

      {props.denialCode !== null ? <OutgoingDenialAlert denialCode={props.denialCode} errorLabels={te} /> : null}

      {sectionBody}

      <OutgoingLinkRequestCancelDialog
        requestId={props.cancelDecision === null ? null : props.cancelDecision.requestId}
        labels={t}
        commonLabels={commonT}
        pending={props.cancelInFlight}
        onSubmit={props.onCancelSubmit}
        onClose={() => props.onCancelDecisionChange(null)}
      />

      <OutgoingSuccessToast copy={props.successToast} onClose={props.onToastClose} />
    </Stack>
  );
}
