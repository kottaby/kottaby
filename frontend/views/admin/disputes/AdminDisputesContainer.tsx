"use client";

import { useQuery } from "@apollo/client/react";
import { GavelOutlined as EmptyIcon, NavigateBeforeOutlined, NavigateNextOutlined } from "@mui/icons-material";
import { Alert, Box, IconButton, Skeleton, Snackbar, Stack, Typography } from "@mui/material";
import { type ReactNode, useCallback, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type {
  AdminDisputedSessionsQuery,
  AdminDisputedSessionsQuery_adminDisputedSessions_items,
} from "@/frontend/graphql/generated/gql/graphql";
import { adminDisputedSessionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { AdminDisputeRow } from "@/frontend/views/admin/disputes/AdminDisputeRow";
import { ResolveDisputeDialog } from "@/frontend/views/admin/disputes/ResolveDisputeDialog";
import { SessionsEmptyState } from "@/frontend/views/student/sessions/SessionsEmptyState";
import { Errors, Sessions, useAppTranslation } from "@/shared/locale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminDisputesContainer — the client orchestrator behind `/disputes`
 * (DEV3-005 R-111, the admin arbitration queue).
 *
 * Stateful composition ONLY (mirrors the student/teacher sessions
 * orchestrators): the 1-based page lives in local `useState` and re-keys the
 * `useQuery` variables (`offset`), which re-runs the STATEFUL
 * `adminDisputedSessions` query (Apollo refetch semantics — `useLazyQuery`
 * is banned per `sharedDocuments/AGENTS.md`). The status filter is PINNED to
 * `Disputed` server-side (the admin predicate is status-first — R-106), so
 * no filter chips render; the sticky bar carries the honest total instead.
 * Page-level authorization is owned by the server guard (`withPageAuth` with
 * `roles: [UserRole.Admin]`) — this container performs no role logic (the
 * admin query identity is server-bound per BOPLA hygiene).
 *
 * Render branches (visual state matrix) — the chrome (title + sticky count
 * bar) renders in EVERY branch; only the body BELOW it swaps:
 *
 * | # | Condition | Body (below the always-on chrome) |
 * |---|-----------|-----------------------------------|
 * | 1 | query in flight (no settled payload yet) | skeleton list rows mirroring the sessions loading skeleton (`aria-busy`) |
 * | 2 | query error, mapping-table denial family (`permission-fallback` / `auth-recovery`) | shared `PermissionDeniedFallback` (non-admin callers fail the admin role leg into FORBIDDEN — R-106) |
 * | 3 | any other query error (masked 500 …) | inline `Alert` with `sessions.genericError` |
 * | 4 | zero items | empty state via the shared `SessionsEmptyState` (gavel icon-circle, `adminDisputesEmpty*` copy — single pinned status, NO filtered variant) |
 * | 5 | rows present | `AdminDisputeRow` list + prev/next pager (only when the honest total spans more than one page) |
 *
 * Arbitration-dialog wiring (DEV3-005 R-104/R-111) — the
 * `resolveSessionDispute` mutation and its code classification live in
 * {@link ResolveDisputeDialog}; EVERY outcome surfaces a snackbar:
 *
 * | Outcome (extensions.code) | Container behavior |
 * |---------------------------|--------------------|
 * | success | `sessions.disputeResolvedNotice` success snackbar; the resolved row leaves the queue via the dialog's cache filter (items + honest `totalCount` decrement, NO refetch); the dialog closes and the row's resolve affordance re-enables; a now-empty trailing page steps back one page instead of rendering a ghost page |
 * | `SESSION_NOT_FOUND` | `errors.sessionNotFound` error snackbar; the row STAYS (a raced concurrent arbitration is the honest explanation — no eviction arm on an admin surface) |
 * | `SESSION_INVALID_TRANSITION` | `errors.sessionInvalidTransition` error snackbar; the row stays |
 * | `VALIDATION` / `FORBIDDEN` / anything else | error snackbar with the copy the dialog resolved (`errors.validation` / `errors.forbidden` / `sessions.genericError`); the dialog stays open for a corrected choice |
 *
 * Query-context errors classify through the SINGLE `mapGraphQLErrorByCode`
 * table (`frontend/providers/apollo/error-link.map.ts`) — never the server
 * `message`.
 *
 * MUI v9 discipline: `sx`-only styling, colors exclusively through
 * `theme.palette.*` callbacks, `*Outlined` icons only, RTL-safe logical
 * composition.
 */

/** Page size — the backend's own default/clamp midpoint (R-106: 1..50, default 25). */
const ADMIN_DISPUTES_PAGE_SIZE = 25;

/** Snackbar autohide — parity with the sessions containers' snackbar slot. */
const SNACKBAR_AUTOHIDE_MS = 6000;

/** Skeleton row count — approximates list density without claiming data. */
const LOADING_ROW_COUNT = 3;

/**
 * Stable skeleton keys — module-scope so the loading rows never key off the
 * render-time array index (`noArrayIndexKey`).
 */
const LOADING_ROW_KEYS: readonly string[] = Array.from(
  { length: LOADING_ROW_COUNT },
  (_, index) => `skeleton-${index}`
);

/** One transient container-level notice rendered in the MUI Snackbar slot. */
interface ContainerNotice {
  readonly message: string;
  readonly severity: "success" | "info" | "error";
}

/** Clamps a 1-based page into `1..totalPages` (never renders a ghost page). */
function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

/**
 * The admin disputes view: ALWAYS-ON chrome (title + sticky honest-count
 * bar) over a swapping body — skeleton / permission fallback / error notice
 * / empty / rows + pager — plus the arbitration dialog and snackbar chrome.
 */
export function AdminDisputesContainer(): ReactNode {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);

  // 1-based page — re-keys the query variables (`offset`) on change.
  const [page, setPage] = useState(1);

  // Arbitration-dialog owner (single dialog slot, re-keyed per session id).
  const [resolveDialogSessionId, setResolveDialogSessionId] = useState<string | null>(null);

  // Single transient notice slot (success / info / error snackbar).
  const [notice, setNotice] = useState<ContainerNotice | null>(null);

  const { data, loading, error } = useQuery(adminDisputedSessionsQueryDocument, {
    variables: {
      filter: null,
      limit: ADMIN_DISPUTES_PAGE_SIZE,
      offset: (page - 1) * ADMIN_DISPUTES_PAGE_SIZE,
    },
  });

  const totalCount = data?.adminDisputedSessions.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_DISPUTES_PAGE_SIZE));

  const openResolveDialog = useCallback((sessionId: string): void => {
    setResolveDialogSessionId(sessionId);
  }, []);

  const closeResolveDialog = useCallback((): void => {
    setResolveDialogSessionId(null);
  }, []);

  const dismissNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  /** Success — queue already converged through the dialog's cache filter. */
  const handleResolved = useCallback((): void => {
    setNotice({ message: t.disputeResolvedNotice, severity: "success" });
    closeResolveDialog();
    // Ghost-page guard: the LAST row of a trailing page just left — step
    // back one page (re-keys `offset`, which re-runs the stateful query)
    // instead of rendering an empty page with a stale page number.
    if (data !== undefined && data.adminDisputedSessions.items.length === 1 && page > 1) {
      setPage(page - 1);
    }
  }, [t, data, page, closeResolveDialog]);

  const handleSessionMissing = useCallback((): void => {
    // Deliberately NO eviction arm (see the resolve dialog's docblock) —
    // the honest surface is the error notice; the row stays in the queue.
    // Parameterless: assignable to the dialog's `(sessionId: string) => void`
    // prop type, and the arm never addresses the row.
    setNotice({ message: te.sessionNotFound, severity: "error" });
    closeResolveDialog();
  }, [te, closeResolveDialog]);

  const handleInvalidTransition = useCallback((): void => {
    // Another admin resolved this dispute first — the snackbar is the
    // honest surface; the row stays until the next page flip refetches it.
    setNotice({ message: te.sessionInvalidTransition, severity: "error" });
    closeResolveDialog();
  }, [te, closeResolveDialog]);

  /**
   * Failure arm (VALIDATION / FORBIDDEN / masked) — the dialog STAYS OPEN
   * for a corrected choice (its own documented contract).
   */
  const handleFailure = useCallback((message: string): void => {
    setNotice({ message, severity: "error" });
  }, []);

  const handlePageChange = useCallback(
    (nextPage: number): void => {
      setPage(clampPage(nextPage, totalPages));
    },
    [totalPages]
  );

  // The body below the chrome resolves through the module-scope
  // `AdminDisputesBody` (matrix branches 1–5) — extracting it keeps this
  // orchestrator to state + callbacks only while the chrome above renders in
  // EVERY branch.
  return (
    <Stack data-testid="admin-disputes-view" sx={{ gap: 3 }}>
      <Stack sx={{ gap: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {t.adminDisputesPageTitle}
        </Typography>
        <Box
          sx={theme => ({
            position: "sticky",
            top: { xs: 56, sm: 64 },
            zIndex: theme.zIndex.appBar - 1,
            bgcolor: theme.palette.surfaceContainer,
            backdropFilter: "blur(8px)",
            borderRadius: 2,
            py: 1,
            px: { xs: 0.5, sm: 1 },
            borderBottom: "1px solid",
            borderBottomColor: theme.palette.outlineVariant,
          })}
        >
          <Typography
            variant="body2"
            data-testid="admin-disputes-count"
            sx={theme => ({ color: theme.palette.text.secondary })}
          >
            {t.adminDisputesCountLine(totalCount)}
          </Typography>
        </Box>
      </Stack>
      <AdminDisputesBody
        loading={loading}
        error={error}
        data={data}
        page={page}
        totalPages={totalPages}
        resolveDialogSessionId={resolveDialogSessionId}
        onPageChange={handlePageChange}
        onResolveIntent={openResolveDialog}
        t={t}
      />
      {resolveDialogSessionId !== null ? (
        <ResolveDisputeDialog
          key={resolveDialogSessionId}
          sessionId={resolveDialogSessionId}
          open
          onClose={closeResolveDialog}
          onResolved={handleResolved}
          onSessionMissing={handleSessionMissing}
          onInvalidTransition={handleInvalidTransition}
          onFailure={handleFailure}
        />
      ) : null}
      <Snackbar
        open={notice !== null}
        autoHideDuration={SNACKBAR_AUTOHIDE_MS}
        onClose={dismissNotice}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {notice === null ? undefined : (
          <Alert onClose={dismissNotice} severity={notice.severity} variant="filled">
            {notice.message}
          </Alert>
        )}
      </Snackbar>
    </Stack>
  );
}

interface AdminDisputesBodyProps {
  readonly loading: boolean;
  readonly error: unknown;
  readonly data: AdminDisputedSessionsQuery | undefined;
  readonly page: number;
  readonly totalPages: number;
  /** Session id whose arbitration dialog is open (its resolve CTA disables). */
  readonly resolveDialogSessionId: string | null;
  readonly onPageChange: (nextPage: number) => void;
  readonly onResolveIntent: (sessionId: string) => void;
  readonly t: SessionsLabels;
}

/**
 * The swapping body BELOW the always-on chrome — matrix branches 1–5 as a
 * pure presentational resolver (module-scope so the container stays a
 * state+callbacks orchestrator): skeleton / permission fallback / error
 * notice / empty / rows + pager.
 */
function AdminDisputesBody({
  loading,
  error,
  data,
  page,
  totalPages,
  resolveDialogSessionId,
  onPageChange,
  onResolveIntent,
  t,
}: Readonly<AdminDisputesBodyProps>): ReactNode {
  if (loading && data === undefined) {
    // Branch 1 — first fetch for the active page: skeleton rows announce
    // busy semantics. A cache-hit page change keeps the settled list
    // mounted (no skeleton flash on pager round-trips).
    return <AdminDisputesLoadingSkeleton />;
  }
  // Branches 2–3 — settled failures: denial family vs generic surfaced copy.
  if (error) {
    const rawCode = extractErrorCode(error);
    const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
    const action = mapGraphQLErrorByCode(code, { contextKind: "query", hasForm: false });
    // Denial family — FORBIDDEN maps to the shared section fallback (a
    // non-admin caller fails the R-106 role leg); UNAUTHORIZED
    // (auth-recovery) surfaces identically after the error link's
    // refresh-retry path has given up.
    if (action?.kind === "permission-fallback" || action?.kind === "auth-recovery") {
      return <PermissionDeniedFallback />;
    }
    return <AdminDisputesErrorNotice message={t.genericError} />;
  }
  // Apollo settles queries with data-or-error; this narrow guard keeps the
  // compiler informed without unsafe assertions.
  if (!data) {
    return <AdminDisputesLoadingSkeleton />;
  }
  const sessions: readonly AdminDisputedSessionsQuery_adminDisputedSessions_items[] = data.adminDisputedSessions.items;
  if (sessions.length === 0) {
    // Branch 4 — the queue drained: the shared icon-circle empty state with
    // the arbitration copy (single pinned status — NO filtered variant).
    return (
      <SessionsEmptyState
        testId="admin-disputes-empty"
        icon={EmptyIcon}
        title={t.adminDisputesEmptyTitle}
        body={t.adminDisputesEmptyBody}
      />
    );
  }
  // Branch 5 — rows + pager (the pager renders ONLY when the honest total
  // spans more than one page).
  return (
    <Stack sx={{ gap: 2 }}>
      {sessions.map(session => (
        <AdminDisputeRow
          key={session.id}
          session={session}
          t={t}
          onResolveIntent={onResolveIntent}
          resolveDisabled={resolveDialogSessionId === session.id}
        />
      ))}
      {totalPages > 1 ? (
        <Stack
          data-testid="admin-disputes-pager"
          sx={{
            gap: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            py: 1,
          }}
        >
          <IconButton
            aria-label={t.pagerPreviousLabel}
            data-testid="admin-disputes-pager-prev"
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
            aria-label={t.pagerNextLabel}
            data-testid="admin-disputes-pager-next"
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
      ) : null}
    </Stack>
  );
}

interface AdminDisputesErrorNoticeProps {
  readonly message: string;
}

/** Settled query failure without a denial-family code — generic inline alert. */
function AdminDisputesErrorNotice({ message }: Readonly<AdminDisputesErrorNoticeProps>): ReactNode {
  return (
    <Stack data-testid="admin-disputes-error" sx={{ py: { xs: 4, sm: 6 } }}>
      <Alert severity="error" variant="outlined">
        {message}
      </Alert>
    </Stack>
  );
}

/**
 * Loading skeleton — bordered row shells mirroring the sessions containers'
 * loading skeleton's line rhythm (title text + rounded pill + body panel).
 */
function AdminDisputesLoadingSkeleton(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="admin-disputes-loading" sx={{ gap: 2 }}>
      {LOADING_ROW_KEYS.map(key => (
        <Box
          key={key}
          sx={theme => ({
            display: "grid",
            gap: 1.5,
            p: { xs: 2.5, sm: 3 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: theme.palette.outlineVariant,
            bgcolor: theme.palette.surfaceContainerLow,
            boxShadow: theme.palette.shadow.card,
          })}
        >
          <Skeleton variant="text" sx={{ fontSize: "1.5rem", maxWidth: 260 }} />
          <Skeleton variant="rounded" sx={{ height: 24, width: 150, borderRadius: 999 }} />
          <Skeleton variant="rectangular" sx={{ height: 40, borderRadius: 2 }} />
        </Box>
      ))}
    </Stack>
  );
}
