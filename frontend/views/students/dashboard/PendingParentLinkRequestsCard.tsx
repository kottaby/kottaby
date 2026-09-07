"use client";

import { useQuery } from "@apollo/client/react";
import { PendingActionsOutlined as PendingActionsIcon, RefreshOutlined as RefreshIcon } from "@mui/icons-material";
import { Alert, Button, Chip, Skeleton, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { myIncomingParentLinkRequestsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { STUDENT_LINK_REQUESTS_ROUTE } from "@/frontend/lib/notification-route-resolution";
import { resolveParentLinkDenialCopyOrNull } from "@/frontend/lib/parent-link-denials";
import { CardShell } from "@/frontend/views/students/dashboard/CardShell";
import { deriveActionableIncoming } from "@/frontend/views/students/dashboard/pending-parent-link-requests";
import { isolateBidi } from "@/shared/lib/isolate-bidi";
import { Common, Errors, ParentLink, useAppTranslation } from "@/shared/locale";

/** Review-CTA metrics — comfortable ≥44px touch target, full-width on mobile. */
const reviewCtaSx = { ...focusVisibleRingSx, minHeight: 44, px: 3, width: { xs: "100%", sm: "auto" } } as const;

/** Retry affordance metrics — same ≥44px discipline inside the error shell. */
const retryButtonSx = { ...focusVisibleRingSx, minHeight: 44 } as const;

/**
 * PendingParentLinkRequestsCard — the student dashboard's discoverability
 * card for incoming parent-link requests (DEV1-015 task 4.2). Mounted in the
 * `RoleDashboardPage` student status slot next to `HandshakeCodeCard`.
 *
 * Self-contained client component: NO props, NO client-side role logic — the
 * page-level server guards remain the ONLY authorization boundary and the
 * zero-argument `myIncomingParentLinkRequests` query answers identity
 * server-side. The SAME id-first list document as the decision page
 (`StudentLinkRequestsContainer`) — one query, no count endpoint, no bespoke
 * invalidation bus: the Apollo normalized cache is the single truth, so the
 * decision page's respond write-back re-renders this card to zero.
 *
 * Derivation: `deriveActionableIncoming` (pure, `now` captured ONCE at mount
 * per the read-purity convention) reuses the shared computed-status machinery
 * verbatim — a stored `pending` row past its expiry is NOT counted.
 *
 * Render branches (REQ-015/052):
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | query in flight | Skeleton card (`aria-busy` + `role="status"` labelled `dashboardCardLoading`) mirroring the settled geometry (zero layout-shift target) |
 * | 2 | any query error | ONE localized inline `Alert` (mapped denial codes via `resolveParentLinkDenialCopyOrNull`; UNMAPPED/internal classes fold onto `dashboardCardLoadError` — raw server messages NEVER reach the DOM) + retry via `refetch` |
 * | 3 | zero actionable rows | `null` — the card renders NOTHING (no empty-state chrome on the dashboard) |
 * | 4 | N ≥ 1 actionable | title + count chip + MOST RECENT requester line (bidi-isolated) + review CTA to the shared decision route |
 *
 * The N>1 state deliberately renders NO per-request list — the dashboard card
 * is a discoverability affordance only; the decision route owns the queue.
 *
 * MUI v9 discipline: `sx`-only styling (no direct style props), colors
 * exclusively through `theme.palette.*` tokens, `*Outlined` icons only,
 * logical properties only (RTL via the emotion-cache stylis-plugin-rtl
 * pipeline), and every user-facing string resolved through compile-time i18n
 * handles (`useAppTranslation(ParentLink)` property access — NEVER `t('key')`;
 * retry copy from the `Common` handle; mapped failure copy from the `Errors`
 * handle; unmapped failure copy from `dashboardCardLoadError`.
 */
export function PendingParentLinkRequestsCard(): ReactNode {
  const t = useAppTranslation(ParentLink);
  const te = useAppTranslation(Errors);
  const tc = useAppTranslation(Common);
  const { data, error, loading, refetch } = useQuery(myIncomingParentLinkRequestsQueryDocument);
  // Read purity: ONE `now` captured at mount (lazy initializer — no impure
  // calls during render). The actionable verdict stays stable for the mount's
  // lifetime; the server-side materialization + refetch settle the truth.
  const [nowMs] = useState(() => Date.now());

  const handleRetry = () => {
    void refetch().catch(() => undefined);
  };

  // Branch 1 — in flight: skeleton placeholder announces busy semantics.
  if (loading) {
    return (
      <CardShell testId="pending-parent-link-requests-card-loading" busy busyLabel={t.dashboardCardLoading}>
        <Skeleton variant="text" sx={{ fontSize: "1.75rem", maxWidth: 260 }} />
        <Skeleton variant="rounded" sx={{ height: 28, width: 220, borderRadius: 1 }} />
        <Skeleton variant="rectangular" sx={{ height: 44, width: 180, borderRadius: 2 }} />
      </CardShell>
    );
  }

  // Branch 2 — settled failure: ONE localized inline Alert + retry refetch.
  // Mapped denial codes keep their `errors`-namespace copy; every UNMAPPED
  // code (or absent code chain) folds onto the card's own generic failure
  // line — raw server messages never reach the DOM for masked classes.
  if (error) {
    return (
      <CardShell testId="pending-parent-link-requests-card-error">
        <Stack spacing={2}>
          <Alert severity="error" variant="outlined">
            {resolveParentLinkDenialCopyOrNull(extractErrorCode(error), te) ?? t.dashboardCardLoadError}
          </Alert>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRetry} sx={retryButtonSx}>
            {tc.retry}
          </Button>
        </Stack>
      </CardShell>
    );
  }

  // Branch 3 — settled, zero actionable: render NOTHING (discoverability
  // chrome disappears the moment the queue converges, REQ-016).
  const summary =
    data?.myIncomingParentLinkRequests === undefined
      ? null
      : deriveActionableIncoming(data.myIncomingParentLinkRequests, nowMs);
  if (summary === null) {
    return null;
  }

  // Branch 4 — N ≥ 1: title + count chip + most-recent requester + review CTA.
  return (
    <CardShell testId="pending-parent-link-requests-card">
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <PendingActionsIcon fontSize="small" sx={theme => ({ color: theme.palette.warning.main })} />
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
          {t.dashboardCardTitle}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Chip label={t.dashboardCardCount(summary.count)} size="small" color="warning" variant="outlined" />
        {/* The name is isolateBidi-assembled BEFORE interpolation (1.1
            carry-forward); `dir="auto"` adds first-strong isolation where the
            line abuts the card chrome. */}
        <Typography variant="body2" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.dashboardCardLatestRequester(isolateBidi(summary.latestParentFullName))}
        </Typography>
      </Stack>
      <Button variant="contained" href={STUDENT_LINK_REQUESTS_ROUTE} sx={reviewCtaSx}>
        {t.dashboardCardCta}
      </Button>
    </CardShell>
  );
}
