"use client";

import { GavelOutlined as EmptyIcon, NavigateBeforeOutlined, NavigateNextOutlined } from "@mui/icons-material";
import { IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { SessionListLoadingSkeleton } from "@/frontend/components/ui/sessionList";
import type {
  AdminSessionsQuery,
  AdminSessionsQuery_adminSessions_items,
} from "@/frontend/graphql/generated/gql/graphql";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import type { GovernanceDialogKind } from "@/frontend/views/admin/session-governance/AdminSessionRow";
import { AdminSessionRow } from "@/frontend/views/admin/session-governance/AdminSessionRow";
import { SessionsEmptyState } from "@/frontend/views/student/sessions/SessionsEmptyState";
import type { AdminSessionGovernanceLabels } from "@/shared/locale/types/adminSessionGovernance";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminSessionsBody — the swapping body BELOW the governance directory's
 * always-on chrome (`/admin/session-governance`, DEV3-021) — the visual
 * state matrix as a pure presentational resolver (module scope keeps the
 * container a state+callbacks orchestrator; the chrome renders in EVERY
 * branch, only this body swaps):
 *
 * | # | Condition | Body |
 * |---|-----------|------|
 * | 1 | query in flight (no settled payload yet) | the shared sessions loading skeleton (`aria-busy`), pinned to the `admin-session-governance-loading` testId |
 * | 2 | query error, mapping-table denial family (`permission-fallback` / `auth-recovery`) | shared `PermissionDeniedFallback` (non-admin callers fail the admin role leg into FORBIDDEN) |
 * | 3 | any other query error (masked 500 …) | `ErrorRetryAlert` with the governance error copy + retry |
 * | 4 | zero items | shared icon-circle empty state — generic copy when no filter is applied, filtered copy when the directory was narrowed (the operator learns WHY the page is bare) |
 * | 5 | rows present | `AdminSessionRow` list + inline pager (only when the honest total spans more than one page) |
 *
 * Query-context errors classify through the SINGLE `mapGraphQLErrorByCode`
 * table (`frontend/providers/apollo/error-link.map.ts`) — never the server
 * `message`.
 */

interface AdminSessionsBodyProps {
  readonly loading: boolean;
  readonly error: unknown;
  readonly data: AdminSessionsQuery | undefined;
  readonly page: number;
  readonly totalPages: number;
  /** True when the applied filter narrows the directory (filtered empty arm). */
  readonly filtersActive: boolean;
  /** Directory-refetch intent (the error state's retry affordance). */
  readonly onRetry: () => void;
  readonly onPageChange: (nextPage: number) => void;
  /** Open the read-only detail drawer for one session. */
  readonly onOpenDetails: (sessionId: string) => void;
  /** Open one governance dialog (container owns the dialog state). */
  readonly onDialogIntent: (kind: GovernanceDialogKind, session: AdminSessionsQuery_adminSessions_items) => void;
  /** Localized governance-namespace labels. */
  readonly t: AdminSessionGovernanceLabels;
  /** Shared sessions-namespace labels (status chips + pager aria). */
  readonly tSessions: SessionsLabels;
}

/** The swapping body — skeleton / denial fallback / error / empty / rows + pager. */
export function AdminSessionsBody({
  loading,
  error,
  data,
  page,
  totalPages,
  filtersActive,
  onRetry,
  onPageChange,
  onOpenDetails,
  onDialogIntent,
  t,
  tSessions,
}: Readonly<AdminSessionsBodyProps>): ReactNode {
  if (loading && data === undefined) {
    // Branch 1 — first fetch for the active filter/page: skeleton rows
    // announce busy semantics. A cache-hit page change keeps the settled
    // list mounted (no skeleton flash on pager round-trips).
    return <SessionListLoadingSkeleton testId="admin-session-governance-loading" />;
  }
  // Branches 2–3 — settled failures: denial family vs retryable surfaced copy.
  if (error) {
    const rawCode = extractErrorCode(error);
    const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
    const action = mapGraphQLErrorByCode(code, { contextKind: "query", hasForm: false });
    // Denial family — FORBIDDEN maps to the shared section fallback (a
    // non-admin caller fails the admin role leg; UNAUTHORIZED surfaces
    // identically after the error link's refresh-retry path gave up).
    if (action?.kind === "permission-fallback" || action?.kind === "auth-recovery") {
      return <PermissionDeniedFallback />;
    }
    return (
      <Stack data-testid="admin-session-governance-error" sx={{ py: { xs: 4, sm: 6 } }}>
        <ErrorRetryAlert title={t.errorTitle} retryLabel={t.retryLabel} retryPending={false} onRetry={onRetry}>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.errorTitle}
          </Typography>
        </ErrorRetryAlert>
      </Stack>
    );
  }
  // Apollo settles queries with data-or-error; this narrow guard keeps the
  // compiler informed without unsafe assertions.
  if (!data) {
    return <SessionListLoadingSkeleton testId="admin-session-governance-loading" />;
  }
  const sessions: readonly AdminSessionsQuery_adminSessions_items[] = data.adminSessions.items;
  if (sessions.length === 0) {
    // Branch 4 — zero rows: the filtered variant tells the operator the
    // filters (not the platform) are why the page is bare.
    return (
      <SessionsEmptyState
        testId="admin-session-governance-empty"
        icon={EmptyIcon}
        title={filtersActive ? t.filteredEmptyTitle : t.emptyTitle}
        body={filtersActive ? t.filteredEmptyBody : t.emptyBody}
      />
    );
  }
  // Branch 5 — rows + pager (the pager renders ONLY when the honest total
  // spans more than one page).
  return (
    <Stack sx={{ gap: 2 }}>
      {sessions.map(session => (
        <AdminSessionRow
          key={session.id}
          session={session}
          t={t}
          tSessions={tSessions}
          onOpenDetails={onOpenDetails}
          onDialogIntent={onDialogIntent}
        />
      ))}
      {totalPages > 1 ? (
        <AdminSessionsPager page={page} totalPages={totalPages} onPageChange={onPageChange} tSessions={tSessions} />
      ) : null}
    </Stack>
  );
}

interface AdminSessionsPagerProps {
  /** Current 1-based page. */
  readonly page: number;
  /** Honest page count (never below 1). */
  readonly totalPages: number;
  /** Page-change intent — the container clamps before committing. */
  readonly onPageChange: (nextPage: number) => void;
  /** Shared sessions-namespace labels (pager aria vocabulary). */
  readonly tSessions: SessionsLabels;
}

/** Prev / `page / totalPages` / next pager row (edge-clamped buttons). */
function AdminSessionsPager({
  page,
  totalPages,
  onPageChange,
  tSessions,
}: Readonly<AdminSessionsPagerProps>): ReactNode {
  return (
    <Stack
      data-testid="admin-session-governance-pager"
      sx={{
        gap: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        py: 1,
      }}
    >
      <IconButton
        aria-label={tSessions.pagerPreviousLabel}
        data-testid="admin-session-governance-pager-prev"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        sx={theme => ({
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.outline}`,
            outlineOffset: 2,
          },
        })}
      >
        <NavigateBeforeOutlined />
      </IconButton>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, minWidth: 64, textAlign: "center" })}
      >
        {page} / {totalPages}
      </Typography>
      <IconButton
        aria-label={tSessions.pagerNextLabel}
        data-testid="admin-session-governance-pager-next"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        sx={theme => ({
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.outline}`,
            outlineOffset: 2,
          },
        })}
      >
        <NavigateNextOutlined />
      </IconButton>
    </Stack>
  );
}
