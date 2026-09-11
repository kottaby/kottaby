"use client";

import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import type { MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests } from "@/frontend/graphql/generated/gql/graphql";
import { myIncomingParentLinkRequestsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import type { PendingDecision } from "@/frontend/views/students/link-requests/LinkRequestCard";
import { useLinkRequestDecision } from "@/frontend/views/students/link-requests/useLinkRequestDecision";
import { Common, Errors, ParentLink, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { AppLocale } from "@/shared/locale/AppLocale";
import type { CommonLabels } from "@/shared/locale/types/common";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { ParentLinkLabels } from "@/shared/locale/types/parentLink";

export interface UseStudentLinkRequestsResult {
  readonly rows: ReadonlyArray<MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests> | undefined;
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
  readonly handleRetry: () => void;
  readonly setDecision: (decision: PendingDecision | null) => void;
  readonly handleDecisionSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  readonly closeDecision: () => void;
  readonly dismissSuccessToast: () => void;
}

/**
 * Custom hook encapsulating data fetching, i18n translations, retry state,
 * and decision mutation state for the student link requests surface.
 */
export function useStudentLinkRequests(): UseStudentLinkRequestsResult {
  const t = useAppTranslation(ParentLink);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, error, loading, refetch } = useQuery(myIncomingParentLinkRequestsQueryDocument);
  const [retryPending, setRetryPending] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const {
    decision,
    setDecision,
    inFlight,
    denialCode,
    successToast,
    handleDecisionSubmit,
    closeDecision,
    dismissSuccessToast,
  } = useLinkRequestDecision(refetch, t);

  const queryErrorCode = error === undefined ? null : extractErrorCode(error);
  const rows = data?.myIncomingParentLinkRequests;

  const handleRetry = (): void => {
    setRetryPending(true);
    void refetch()
      .catch(() => undefined)
      .finally(() => {
        setRetryPending(false);
      });
  };

  return {
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
    labels: t,
    errorLabels: te,
    commonLabels: commonT,
    handleRetry,
    setDecision,
    handleDecisionSubmit,
    closeDecision,
    dismissSuccessToast,
  };
}
