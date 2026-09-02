"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { Alert, Stack } from "@mui/material";
import { type ReactNode, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import {
  myIncomingParentLinkRequestsQueryDocument,
  respondToParentLinkRequestMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { resolveParentLinkDenialCopy } from "@/frontend/lib/parent-link-denials";
import { IncomingBody } from "@/frontend/views/students/link-requests/IncomingBody";
import { IncomingHeader, SuccessToast } from "@/frontend/views/students/link-requests/IncomingStates";
import type { PendingDecision } from "@/frontend/views/students/link-requests/LinkRequestCard";
import { LinkRequestDecisionDialog } from "@/frontend/views/students/link-requests/LinkRequestDecisionDialog";
import { Common, Errors, ParentLink, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * StudentLinkRequestsContainer — the client heart of
 * `/student/link-requests`.
 *
 * A stateful `useQuery` fetches the caller's OWN incoming parent-link
 * requests (zero-argument — the student id is derived server-side from the
 * verified context, identity NEVER crosses the wire), and a
 * `useMutation(respondToParentLinkRequest)` drives the Confirm/Reject
 * transitions. No `useLazyQuery` anywhere; the mutation→list refresh is the
 * plain `refetch()` (no cache surgery).
 *
 * Outcome state machine (derived per render — no stored list state):
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | query error `UNAUTHORIZED`/`FORBIDDEN` | shared `PermissionDeniedFallback` replaces the container (never bare `null`) |
 * | 2 | rows not settled, retryable query error | shared `RetryableNotice` (retry refetches) |
 * | 3 | rows not settled, any other query error | localized inline `Alert` (`errors.internalServerError`), retry affordance |
 * | 4 | rows not settled | skeleton region (`component="output"` + `aria-busy`) |
 * | 5 | zero rows | empty state (`incomingEmptyTitle`/`incomingEmptyBody`) |
 * | 6 | rows settled | per-row cards in the `component="output"` list region (`IncomingBody`) |
 *
 * Row rendering lives in `LinkRequestCard` (computed status chip,
 * `dir="auto"` name, ≥44px CTAs with the in-flight disable); the
 * confirm/reject gate in `LinkRequestDecisionDialog` (function-slot copy);
 * the shell states + list branches in `IncomingStates` / `IncomingBody`.
 *
 * Mutation flow: the submitted row's affordances (and the dialog) disable
 * while in flight; on success the dialog closes, the localized success
 * toast fires (`confirmSuccessToast`/`rejectSuccessToast`) and the list
 * refetches; on denial the dialog closes and `extensions.code` maps to a
 * localized inline `Alert` from the `errors` namespace
 * (`PARENT_LINK_REQUEST_EXPIRED` / `PARENT_LINK_REQUEST_ALREADY_RESOLVED` /
 * `PARENT_LINK_REQUEST_NOT_FOUND`; anything else falls back to
 * `internalServerError`).
 *
 * MUI v9 discipline: `sx`-only styling, colors ONLY through theme palette
 * roles, `*Outlined` icons, `focusVisibleRingSx` on interactive elements,
 * logical properties for RTL, `dir="auto"` on names, no `console.*`. Every
 * user-facing string resolves through the compile-time `ParentLink` /
 * `Errors` / `Common` namespace handles (property access only — never
 * call-by-key, never `next-intl`).
 */

/**
 * Denial-code → copy resolution is SHARED across the parent-link surfaces
 * (`resolveParentLinkDenialCopy`) — the send affordance and the outgoing
 * section on the parent side map the SAME wire codes to the SAME localized
 * copy (constant-shape denial discipline).
 */

export function StudentLinkRequestsContainer(): ReactNode {
  const t = useAppTranslation(ParentLink);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, error, loading, refetch } = useQuery(myIncomingParentLinkRequestsQueryDocument);
  const [respond] = useMutation(respondToParentLinkRequestMutationDocument);

  // The row whose respond mutation is in flight (row-level + dialog-level
  // in-flight disable).
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  // The open confirm/reject decision (null = no dialog).
  const [decision, setDecision] = useState<PendingDecision | null>(null);
  // Localized copy of the success toast (null = hidden).
  const [successToast, setSuccessToast] = useState<string | null>(null);
  // `extensions.code` of the last mutation denial (null = no inline alert).
  const [denialCode, setDenialCode] = useState<string | null>(null);
  // Retry-after-query-error refetch in flight (disables the affordance).
  const [retryPending, setRetryPending] = useState(false);
  // Read purity: ONE `now` captured at mount (lazy initializer — no
  // impure calls during render). The expired verdict stays stable for the
  // mount's lifetime; server-side materialization + refetch settle the
  // authoritative states.
  const [nowMs] = useState(() => Date.now());

  // Denial class — replaces the whole container, mirroring the
  // denial-surface precedent on the parent handshake discovery container.
  const queryErrorCode = error === undefined ? null : extractErrorCode(error);
  if (queryErrorCode === "UNAUTHORIZED" || queryErrorCode === "FORBIDDEN") {
    return <PermissionDeniedFallback />;
  }

  const rows = data?.myIncomingParentLinkRequests;
  const inFlight = pendingRequestId !== null;

  const handleRetry = (): void => {
    setRetryPending(true);
    void refetch()
      .catch(() => undefined)
      .finally(() => {
        setRetryPending(false);
      });
  };

  /**
   * The dialog form submit (React 19 `SubmitEvent` discipline — never
   * `FormEvent`). Delegates to `respondToDecision` so rejections are caught
   * in ONE place (the admin-dialogs contract: the mutation error projects
   * into the localized inline Alert, never an unhandled rejection).
   */
  const handleDecisionSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const submitted = decision;
    if (submitted === null || pendingRequestId !== null) {
      return;
    }
    setPendingRequestId(submitted.requestId);
    setDenialCode(null);
    void respondToDecision(submitted);
  };

  const respondToDecision = async (submitted: PendingDecision): Promise<void> => {
    try {
      await respond({ variables: { requestId: submitted.requestId, accept: submitted.accept } });
    } catch (mutationError: unknown) {
      setDecision(null);
      setDenialCode(extractErrorCode(mutationError));
      return;
    } finally {
      setPendingRequestId(null);
    }
    // The transition is COMMITTED above — the mutation write-back already
    // restyled the row. The list refresh runs OUTSIDE the mutation try-block
    // (6.3-F2): a refetch failure folds silently instead of being caught by
    // the denial handler, where an unmapped code would surface a misleading
    // "internal server error" alert and suppress the success toast.
    setDecision(null);
    setSuccessToast(submitted.accept ? t.confirmSuccessToast : t.rejectSuccessToast);
    await refetch().catch(() => undefined);
  };

  return (
    <Stack spacing={3} sx={{ width: "100%" }}>
      <IncomingHeader labels={t} />

      {denialCode !== null ? (
        <Alert
          severity="error"
          variant="outlined"
          data-testid="student-link-requests-denial-alert"
          sx={{ borderRadius: 2 }}
        >
          {resolveParentLinkDenialCopy(denialCode, te)}
        </Alert>
      ) : null}

      <IncomingBody
        rows={rows}
        queryErrorCode={queryErrorCode}
        loading={loading}
        locale={locale}
        nowMs={nowMs}
        respondInFlight={inFlight}
        retryPending={retryPending}
        labels={t}
        errorLabels={te}
        commonLabels={commonT}
        onRetry={handleRetry}
        onDecide={setDecision}
      />

      <LinkRequestDecisionDialog
        decision={decision}
        labels={t}
        commonLabels={commonT}
        pending={inFlight}
        onSubmit={handleDecisionSubmit}
        onClose={() => setDecision(null)}
      />

      <SuccessToast copy={successToast} onClose={() => setSuccessToast(null)} />
    </Stack>
  );
}
