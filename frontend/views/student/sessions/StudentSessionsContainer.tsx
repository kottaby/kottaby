"use client";

import { useQuery } from "@apollo/client/react";
import { Alert, Box, Skeleton, Snackbar, Stack, Typography } from "@mui/material";
import { type ReactNode, useCallback, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type {
  MyStudentSessionsQuery_myStudentSessions_items,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { myStudentSessionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { CancelSessionConfirmDialog } from "@/frontend/views/student/sessions/CancelSessionConfirmDialog";
import { SessionRow } from "@/frontend/views/student/sessions/SessionRow";
import { SessionStatusFilterChips } from "@/frontend/views/student/sessions/SessionStatusFilterChips";
import { Errors, Sessions, useAppTranslation } from "@/shared/locale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * StudentSessionsContainer — the client orchestrator behind
 * `/student/sessions`.
 *
 * Stateful composition ONLY (NO Zustand store, NO persistence): the
 * status-filter selection lives in local `useState` and re-keys
 * `useQuery` `variables`, which re-runs the STATEFUL
 * `myStudentSessions` query (Apollo refetch semantics — `useLazyQuery`
 * is banned per `sharedDocuments/AGENTS.md`). Page-level authorization is
 * owned by the server guard (`withPageAuth`) — this container performs no
 * role logic.
 *
 * Render branches (visual state matrix):
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | query in flight (no settled payload yet) | skeleton list rows mirroring the `ApplicantStatusCard` loading skeleton (`aria-busy`) |
 * | 2 | query error, mapping-table denial family (`permission-fallback` / `auth-recovery`) | shared `PermissionDeniedFallback` |
 * | 3 | any other query error (masked 500 …) | inline `Alert` with `sessions.genericError` |
 * | 4 | zero items for the active filter | empty-state Stack (`studentEmptyTitle` / `studentEmptyBody`) |
 * | 5 | rows present | `SessionRow` list + filter chips header |
 *
 * Mutation outcome wiring — the `cancelSession` mutation and its code
 * classification live in {@link CancelSessionConfirmDialog}; the container
 * receives typed callbacks and renders the surfaces:
 *
 * | Outcome (extensions.code) | Container behavior |
 * |---------------------------|--------------------|
 * | success | `sessions.holdReleasedNotice` success snackbar + stale row alert dropped |
 * | `SESSION_NOT_FOUND` | `errors.sessionNotFound` error snackbar (cache eviction + list filtering are owned by the dialog's not-found arm — the row has already left the list here) |
 * | `SESSION_INVALID_TRANSITION` | row-scoped inline alert via `SessionRow` `alertMessage` carrying `errors.sessionInvalidTransition` |
 * | `DUPLICATE_REQUEST` | informational snackbar with `sessions.duplicateBookingInfo` (never an error treatment — docs/IDEMPOTENCY.md §3) |
 * | `FORBIDDEN` / masked `INTERNAL_SERVER_ERROR` / anything else | error snackbar with the copy the dialog resolved (`errors.forbidden` / `sessions.genericError`); the dialog stays open for a retry |
 *
 * Query-context errors classify through the SINGLE
 * `mapGraphQLErrorByCode` table (`frontend/providers/apollo/error-link.map.ts`)
 * — never the server `message`.
 *
 * Feedback surfaces use plain MUI `Snackbar`/`Alert` (the same snackbar
 * machinery as the app-scope `GraphQLErrorSurfaceHost`; no notistack, no
 * Zustand). All copy resolves through compile-time i18n handles
 * (`useAppTranslation(Sessions | Errors)` property access — NEVER
 * `t('key')`).
 *
 * MUI v9 discipline: `sx`-only styling, colors exclusively through
 * `theme.palette.*` callbacks, `*Outlined` icons only, RTL-safe logical
 * composition.
 */

/** Snackbar autohide — parity with the app-scope `GraphQLErrorSurfaceHost` toasts. */
const SNACKBAR_AUTOHIDE_MS = 6000;

/** Skeleton row count — approximates list density without claiming data. */
const LOADING_ROW_COUNT = 3;

/**
 * Stable skeleton keys — module-scope so the loading rows never key off the
 * render-time array index (`noArrayIndexKey`) while keeping one-to-one
 * cardinality with {@link LOADING_ROW_COUNT}.
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

/** Removes one row-scoped alert entry (pure — stable `useCallback` deps). */
function dropRowAlert(alerts: Readonly<Record<string, string>>, sessionId: string): Readonly<Record<string, string>> {
  if (!(sessionId in alerts)) return alerts;
  return Object.fromEntries(Object.entries(alerts).filter(([id]) => id !== sessionId));
}

/**
 * The student sessions view: filter chips header, skeleton/empty/error
 * branches, session rows and the cancel-dialog + snackbar chrome.
 */
export function StudentSessionsContainer(): ReactNode {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);

  // Status filter — `null` is the "all" token; every change re-keys the
  // query `variables`, which re-runs the stateful query (Apollo refetch).
  const [statusFilter, setStatusFilter] = useState<SessionStatus | null>(null);

  // Cancel-dialog owner (single dialog slot, re-keyed per session id).
  const [cancelDialogSessionId, setCancelDialogSessionId] = useState<string | null>(null);

  // sessionId → inline row alert copy (e.g. SESSION_INVALID_TRANSITION).
  const [rowAlerts, setRowAlerts] = useState<Readonly<Record<string, string>>>({});

  // Single transient notice slot (success / info / error snackbar).
  const [notice, setNotice] = useState<ContainerNotice | null>(null);

  const { data, loading, error } = useQuery(myStudentSessionsQueryDocument, {
    variables: {
      filter: statusFilter === null ? null : { status: statusFilter },
      page: null,
      pageSize: null,
    },
  });

  const handleFilterChange = useCallback((status: SessionStatus | null): void => {
    setStatusFilter(status);
  }, []);

  const openCancelDialog = useCallback((sessionId: string): void => {
    setCancelDialogSessionId(sessionId);
  }, []);

  const closeCancelDialog = useCallback((): void => {
    setCancelDialogSessionId(null);
  }, []);

  const dismissNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  const handleCancelled = useCallback(
    (sessionId: string): void => {
      setRowAlerts(prev => dropRowAlert(prev, sessionId));
      setNotice({ message: t.holdReleasedNotice, severity: "success" });
      setCancelDialogSessionId(null);
    },
    [t]
  );

  const handleSessionMissing = useCallback(
    (sessionId: string): void => {
      // Cache eviction + list filtering are owned by the dialog's
      // SESSION_NOT_FOUND arm — the row has already left the list here.
      setRowAlerts(prev => dropRowAlert(prev, sessionId));
      setNotice({ message: te.sessionNotFound, severity: "error" });
      setCancelDialogSessionId(null);
    },
    [te]
  );

  const handleInvalidTransition = useCallback(
    (sessionId: string): void => {
      setRowAlerts(prev => ({ ...prev, [sessionId]: te.sessionInvalidTransition }));
      setCancelDialogSessionId(null);
    },
    [te]
  );

  const handleDuplicateReplay = useCallback((): void => {
    setNotice({ message: t.duplicateBookingInfo, severity: "info" });
    setCancelDialogSessionId(null);
  }, [t]);

  const handleFailure = useCallback((message: string): void => {
    setNotice({ message, severity: "error" });
    // The dialog stays open for a retry (its own documented contract).
  }, []);

  // Branch 1 — first fetch for the active filter: skeleton rows announce
  // busy semantics. A cache-hit variables change keeps the settled list
  // mounted (no skeleton flash on filter round-trips).
  if (loading && data === undefined) {
    return <SessionsLoadingSkeleton />;
  }

  // Branches 2–3 — settled failures: denial family vs generic surfaced copy.
  if (error) {
    const rawCode = extractErrorCode(error);
    const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
    const action = mapGraphQLErrorByCode(code, { contextKind: "query", hasForm: false });
    // Denial family — FORBIDDEN maps to the shared section fallback;
    // UNAUTHORIZED (auth-recovery) surfaces identically after the error
    // link's refresh-retry path has given up (ApplicantStatusCard precedent).
    if (action?.kind === "permission-fallback" || action?.kind === "auth-recovery") {
      return <PermissionDeniedFallback />;
    }
    return <SessionsErrorNotice message={t.genericError} />;
  }

  // Apollo settles queries with data-or-error; this narrow guard keeps the
  // compiler informed without unsafe assertions.
  if (!data) {
    return <SessionsLoadingSkeleton />;
  }

  const sessions: readonly MyStudentSessionsQuery_myStudentSessions_items[] = data.myStudentSessions.items;

  // Branch 4 — empty page for the active filter.
  if (sessions.length === 0) {
    return <StudentSessionsEmptyState t={t} />;
  }

  // Branch 5 — rows + cancel dialog + snackbar chrome.
  return (
    <Stack data-testid="student-sessions-view" sx={{ gap: 3 }}>
      <Stack sx={{ gap: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {t.studentPageTitle}
        </Typography>
        <SessionStatusFilterChips value={statusFilter} onChange={handleFilterChange} />
      </Stack>
      <Stack sx={{ gap: 2 }}>
        {sessions.map(session => (
          <SessionRow
            key={session.id}
            session={session}
            alertMessage={rowAlerts[session.id] ?? null}
            onCancelIntent={openCancelDialog}
          />
        ))}
      </Stack>
      {cancelDialogSessionId !== null ? (
        <CancelSessionConfirmDialog
          key={cancelDialogSessionId}
          sessionId={cancelDialogSessionId}
          open
          onClose={closeCancelDialog}
          onCancelled={handleCancelled}
          onSessionMissing={handleSessionMissing}
          onInvalidTransition={handleInvalidTransition}
          onDuplicateReplay={handleDuplicateReplay}
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

interface StudentSessionsEmptyStateProps {
  readonly t: SessionsLabels;
}

/** Empty list for the active filter — centered heading + explanatory body. */
function StudentSessionsEmptyState({ t }: Readonly<StudentSessionsEmptyStateProps>): ReactNode {
  return (
    <Stack
      data-testid="student-sessions-empty"
      sx={{ alignItems: "center", gap: 1, py: { xs: 6, sm: 10 }, textAlign: "center" }}
    >
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {t.studentEmptyTitle}
      </Typography>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 420 })}>
        {t.studentEmptyBody}
      </Typography>
    </Stack>
  );
}

interface SessionsErrorNoticeProps {
  readonly message: string;
}

/** Settled query failure without a denial-family code — generic inline alert. */
function SessionsErrorNotice({ message }: Readonly<SessionsErrorNoticeProps>): ReactNode {
  return (
    <Stack data-testid="student-sessions-error" sx={{ py: { xs: 4, sm: 6 } }}>
      <Alert severity="error" variant="outlined">
        {message}
      </Alert>
    </Stack>
  );
}

/**
 * Loading skeleton — bordered row shells mirroring the `ApplicantStatusCard`
 * loading skeleton's line rhythm (title text + rounded pill + body panel).
 */
function SessionsLoadingSkeleton(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="student-sessions-loading" sx={{ gap: 2 }}>
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
