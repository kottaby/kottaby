"use client";

import { useApolloClient, useMutation, useQuery } from "@apollo/client/react";
import { Alert, Box, Skeleton, Snackbar, Stack, Typography } from "@mui/material";
import { type ReactNode, useCallback, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import {
  type MyTeacherSessionsQuery_myTeacherSessions_items,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  completeSessionMutationDocument,
  myTeacherSessionsQueryDocument,
  startSessionMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import {
  isNotFoundErrorFamily,
  mapGraphQLErrorByCode,
  normalizeGraphQLErrorCode,
} from "@/frontend/providers/apollo/error-link.map";
import { CancelSessionConfirmDialog } from "@/frontend/views/student/sessions/CancelSessionConfirmDialog";
import { SessionRow, type SessionRowAction } from "@/frontend/views/student/sessions/SessionRow";
import { SessionStatusFilterChips } from "@/frontend/views/student/sessions/SessionStatusFilterChips";
import { Errors, Sessions, useAppTranslation } from "@/shared/locale";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * TeacherSessionsContainer — the client orchestrator behind
 * `/teacher/sessions`.
 *
 * The STUDENT twin (`StudentSessionsContainer`) is the structural precedent:
 * this container reuses its shared primitives — `SessionRow` (via the
 * optional `actions` prop added for the teacher lifecycle),
 * `SessionStatusFilterChips` and `CancelSessionConfirmDialog` — and copies
 * its stateful-composition shape. Stateful composition ONLY (NO Zustand, NO
 * persistence): the status filter lives in local `useState` and re-keys the
 * `useQuery` `variables`, which re-runs the STATEFUL `myTeacherSessions`
 * query (Apollo refetch semantics — `useLazyQuery` is banned per
 * `sharedDocuments/AGENTS.md`). Page-level authorization is owned by the
 * server guard (`withPageAuth`) — this container performs no role logic.
 *
 * Teacher lifecycle (REQ-063): **Start** on `Scheduled`, **Complete** on
 * `Started`, **Cancel** on `Scheduled`/`Started` — each affordance disabled
 * while ITS OWN mutation is in flight (tracked per mutation kind AND session
 * id, so sibling rows and the other action kind stay interactive); terminal
 * rows (`Completed`/`Cancelled`/`Disputed`) render NO action affordances.
 * The applicant teacher never owns sessions — the server answers an empty
 * page and the localized EMPTY state renders (never an error).
 *
 * Render branches (visual state matrix — mirrors the student container):
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | query in flight (no settled payload yet) | skeleton list rows (`aria-busy`) |
 * | 2 | query error, mapping-table denial family (`permission-fallback` / `auth-recovery`) | shared `PermissionDeniedFallback` |
 * | 3 | any other query error (masked 500 …) | inline `Alert` with `sessions.genericError` |
 * | 4 | zero items for the active filter (incl. the applicant teacher) | empty-state Stack (`teacherEmptyTitle` / `teacherEmptyBody`) |
 * | 5 | rows present | `SessionRow` list + filter chips header + lifecycle CTAs |
 *
 * Mutation outcome wiring — `startSession` / `completeSession` are owned
 * HERE; cancel ownership stays in the reused `CancelSessionConfirmDialog`
 * (whose `update`/eviction arms already normalize the cache). Cache
 * convergence is NORMALIZATION ONLY (NO refetch): every returned `Session!`
 * payload selects `id` first, and each mutation rewrites the transitioned
 * fields onto the `Session:<id>` entity. Error classification per
 * `extensions.code` (single `mapGraphQLErrorByCode` table + the caller-kept
 * arms):
 *
 * | Outcome (extensions.code)                  | Behavior |
 * |--------------------------------------------|----------|
 * | success | per-kind success snackbar (`sessionStartedNotice` / `sessionCompletedNotice` / cancel → `sessionCancelledNotice`) + row alert dropped |
 * | `SESSION_NOT_FOUND` (not-found family)     | evict the row — `myTeacherSessions` list fields filtered by `__ref`, entity evicted, `gc()`; `errors.sessionNotFound` error snackbar |
 * | `SESSION_INVALID_TRANSITION` (no mapping row) | row-scoped inline alert with `errors.sessionInvalidTransition` |
 * | `TEACHER_NOT_CERTIFIED` (no mapping row)   | row-scoped inline alert with `errors.teacherNotCertified` (observed on Complete when the certification lock lost the race) |
 * | `DUPLICATE_REQUEST` (map row: success-equivalent) | informational snackbar with `sessions.duplicateBookingInfo` |
 * | `FORBIDDEN`                                | error snackbar with `errors.forbidden` |
 * | masked `INTERNAL_SERVER_ERROR` / anything else | error snackbar with `sessions.genericError` |
 *
 * Feedback surfaces use plain MUI `Snackbar`/`Alert` (no notistack, no
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

/** `__typename` of the normalized `Session` cache entity. */
const SESSION_TYPE_NAME = "Session";

/** Unmapped lifecycle-reject code (the mapping table defines NO row for it). */
const SESSION_INVALID_TRANSITION_CODE = "SESSION_INVALID_TRANSITION";

/** Unmapped certification-reject code (no mapping row — caller-kept arm). */
const TEACHER_NOT_CERTIFIED_CODE = "TEACHER_NOT_CERTIFIED";

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
 * Removes the missing session from the cached `myTeacherSessions` lists
 * (filter the reference out of every stored variant), evicts the entity and
 * garbage-collects — the list converges WITHOUT any refetch. Pattern copy of
 * the student dialog's not-found arm, retargeted at the teacher list field
 * (the 4.2 carry-forward sanctions pattern-copying container-level wiring
 * while the row/chips/dialog components are imported).
 */
function evictSessionFromTeacherLists(cache: ReturnType<typeof useApolloClient>["cache"], sessionId: string): void {
  const removedEntityId = cache.identify({ __typename: SESSION_TYPE_NAME, id: sessionId });
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      // Applies to EVERY stored variant of the field (args-serialized
      // storeFieldNames match their bare field name in `modify`).
      myTeacherSessions(existing: unknown) {
        if (typeof existing !== "object" || existing === null || !("items" in existing)) return existing;
        const items = existing.items;
        if (!Array.isArray(items)) return existing;
        return {
          ...existing,
          items: items.filter(item => {
            if (typeof item !== "object" || item === null) return true;
            // Normalized storage: dangling `Reference` entries carry `__ref`
            // (bracket access — the Apollo wire property is underscore-prefixed).
            if ("__ref" in item) return item.__ref !== removedEntityId;
            // Non-normalized storage (defensive): raw payloads carry `id`.
            if ("id" in item) return item.id !== sessionId;
            return true;
          }),
        };
      },
    },
  });
  if (removedEntityId !== undefined) {
    cache.evict({ id: removedEntityId });
  }
  cache.gc();
}

/**
 * Shared onError arm for BOTH lifecycle mutations: clears the caller's
 * per-kind in-flight slot, then routes the classified outcome (the class
 * docblock's outcome table) — not-found family → teacher-list eviction +
 * error snackbar; `DUPLICATE_REQUEST` → informational snackbar;
 * `SESSION_INVALID_TRANSITION` / `TEACHER_NOT_CERTIFIED` → row-scoped
 * inline alert; `FORBIDDEN` → error snackbar; everything else → the
 * generic error snackbar.
 */
function handleLifecycleMutationError(
  mutationError: unknown,
  wiring: {
    readonly cache: ReturnType<typeof useApolloClient>["cache"];
    readonly sessionId: string;
    readonly t: SessionsLabels;
    readonly te: ErrorsLabels;
    readonly clearInFlight: () => void;
    readonly setRowAlerts: (
      updater: (prev: Readonly<Record<string, string>>) => Readonly<Record<string, string>>
    ) => void;
    readonly setNotice: (notice: ContainerNotice) => void;
  }
): void {
  wiring.clearInFlight();
  const rawCode = extractErrorCode(mutationError);
  const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
  if (isNotFoundErrorFamily(code)) {
    // The container owns the teacher-list eviction — the row has already
    // left the list when the snackbar lands.
    evictSessionFromTeacherLists(wiring.cache, wiring.sessionId);
    wiring.setRowAlerts(prev => dropRowAlert(prev, wiring.sessionId));
    wiring.setNotice({ message: wiring.te.sessionNotFound, severity: "error" });
    return;
  }
  const action = mapGraphQLErrorByCode(code, { contextKind: "mutation", hasForm: false });
  if (action?.duplicateSuccessEquivalent === true) {
    wiring.setNotice({ message: wiring.t.duplicateBookingInfo, severity: "info" });
    return;
  }
  if (code === SESSION_INVALID_TRANSITION_CODE) {
    wiring.setRowAlerts(prev => ({ ...prev, [wiring.sessionId]: wiring.te.sessionInvalidTransition }));
    return;
  }
  if (code === TEACHER_NOT_CERTIFIED_CODE) {
    wiring.setRowAlerts(prev => ({ ...prev, [wiring.sessionId]: wiring.te.teacherNotCertified }));
    return;
  }
  if (action?.kind === "toast" && action.messageKey === "forbidden") {
    wiring.setNotice({ message: wiring.te.forbidden, severity: "error" });
    return;
  }
  wiring.setNotice({ message: wiring.t.genericError, severity: "error" });
}

/**
 * Lifecycle → affordance matrix: Start on `Scheduled`, Complete on `Started`,
 * NOTHING on terminal rows. Each descriptor disables while its OWN mutation
 * is in flight for THIS row (`startInFlightId` / `completeInFlightId`).
 */
function teacherActionsForSession(
  session: MyTeacherSessionsQuery_myTeacherSessions_items,
  wiring: {
    readonly t: SessionsLabels;
    readonly startInFlightId: string | null;
    readonly completeInFlightId: string | null;
    readonly onStart: (sessionId: string) => void;
    readonly onComplete: (sessionId: string) => void;
  }
): ReadonlyArray<SessionRowAction> {
  const actions: SessionRowAction[] = [];
  if (session.status === SessionStatus.Scheduled) {
    actions.push({
      id: "start",
      label: wiring.t.startSession,
      disabled: wiring.startInFlightId === session.id,
      onIntent: wiring.onStart,
    });
  }
  if (session.status === SessionStatus.Started) {
    actions.push({
      id: "complete",
      label: wiring.t.completeSession,
      disabled: wiring.completeInFlightId === session.id,
      onIntent: wiring.onComplete,
    });
  }
  return actions;
}

/**
 * The teacher sessions view: filter chips header, skeleton/empty/error
 * branches, session rows with lifecycle CTAs, the cancel dialog and the
 * snackbar chrome.
 */
export function TeacherSessionsContainer(): ReactNode {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);
  const client = useApolloClient();

  // Status filter — `null` is the "all" token; every change re-keys the
  // query `variables`, which re-runs the stateful query (Apollo refetch).
  const [statusFilter, setStatusFilter] = useState<SessionStatus | null>(null);

  // Cancel-dialog owner (single dialog slot, re-keyed per session id).
  const [cancelDialogSessionId, setCancelDialogSessionId] = useState<string | null>(null);

  // sessionId → inline row alert copy (SESSION_INVALID_TRANSITION /
  // TEACHER_NOT_CERTIFIED rejections).
  const [rowAlerts, setRowAlerts] = useState<Readonly<Record<string, string>>>({});

  // Single transient notice slot (success / info / error snackbar).
  const [notice, setNotice] = useState<ContainerNotice | null>(null);

  // Per-kind in-flight session id — the row's OWN CTA disables while its
  // mutation is in flight; sibling rows (and the other action kind) stay live.
  const [startInFlightId, setStartInFlightId] = useState<string | null>(null);
  const [completeInFlightId, setCompleteInFlightId] = useState<string | null>(null);

  const { data, loading, error } = useQuery(myTeacherSessionsQueryDocument, {
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
      setNotice({ message: t.sessionCancelledNotice, severity: "success" });
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

  // --- startSession mutation (Scheduled → Started) -------------------------
  // Per-call options carry the session id in scope so every outcome arm can
  // address ITS row (row alerts, in-flight clearing) precisely.

  const [startSession] = useMutation(startSessionMutationDocument);

  const handleStart = useCallback(
    (sessionId: string): void => {
      setStartInFlightId(sessionId);
      void startSession({
        variables: { id: sessionId },
        // Cache NORMALIZE — rewrite the transitioned fields onto the
        // normalized `Session:<id>` entity (belt-and-braces over the
        // automatic normalized merge of the returned `Session!` payload).
        // NO refetch.
        update(cache, { data: resultData }) {
          const started = resultData?.startSession;
          if (!started) return;
          cache.modify({
            id: cache.identify({ __typename: SESSION_TYPE_NAME, id: started.id }),
            fields: {
              status: () => started.status,
              startedAt: () => started.startedAt,
            },
          });
        },
        onCompleted: result => {
          setStartInFlightId(null);
          setRowAlerts(prev => dropRowAlert(prev, result.startSession.id));
          setNotice({ message: t.sessionStartedNotice, severity: "success" });
        },
        onError: mutationError =>
          handleLifecycleMutationError(mutationError, {
            cache: client.cache,
            sessionId,
            t,
            te,
            clearInFlight: () => setStartInFlightId(null),
            setRowAlerts,
            setNotice,
          }),
      });
    },
    [startSession, client, t, te]
  );

  // --- completeSession mutation (Started → Completed) ----------------------

  const [completeSession] = useMutation(completeSessionMutationDocument);

  const handleComplete = useCallback(
    (sessionId: string): void => {
      setCompleteInFlightId(sessionId);
      void completeSession({
        variables: { id: sessionId },
        update(cache, { data: resultData }) {
          const completed = resultData?.completeSession;
          if (!completed) return;
          cache.modify({
            id: cache.identify({ __typename: SESSION_TYPE_NAME, id: completed.id }),
            fields: {
              status: () => completed.status,
              endedAt: () => completed.endedAt,
              confirmedByTeacherAt: () => completed.confirmedByTeacherAt,
            },
          });
        },
        onCompleted: result => {
          setCompleteInFlightId(null);
          setRowAlerts(prev => dropRowAlert(prev, result.completeSession.id));
          setNotice({ message: t.sessionCompletedNotice, severity: "success" });
        },
        onError: mutationError =>
          handleLifecycleMutationError(mutationError, {
            cache: client.cache,
            sessionId,
            t,
            te,
            clearInFlight: () => setCompleteInFlightId(null),
            setRowAlerts,
            setNotice,
          }),
      });
    },
    [completeSession, client, t, te]
  );

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

  const sessions: readonly MyTeacherSessionsQuery_myTeacherSessions_items[] = data.myTeacherSessions.items;

  // Branch 4 — empty page for the active filter (the applicant teacher's
  // permanent state: an empty page, NEVER an error).
  if (sessions.length === 0) {
    return <TeacherSessionsEmptyState t={t} />;
  }

  // Branch 5 — rows + lifecycle CTAs + cancel dialog + snackbar chrome.
  return (
    <Stack data-testid="teacher-sessions-view" sx={{ gap: 3 }}>
      <Stack sx={{ gap: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {t.teacherPageTitle}
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
            actions={teacherActionsForSession(session, {
              t,
              startInFlightId,
              completeInFlightId,
              onStart: handleStart,
              onComplete: handleComplete,
            })}
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

interface TeacherSessionsEmptyStateProps {
  readonly t: SessionsLabels;
}

/** Empty list for the active filter — centered heading + explanatory body. */
function TeacherSessionsEmptyState({ t }: Readonly<TeacherSessionsEmptyStateProps>): ReactNode {
  return (
    <Stack
      data-testid="teacher-sessions-empty"
      sx={{ alignItems: "center", gap: 1, py: { xs: 6, sm: 10 }, textAlign: "center" }}
    >
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {t.teacherEmptyTitle}
      </Typography>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 420 })}>
        {t.teacherEmptyBody}
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
    <Stack data-testid="teacher-sessions-error" sx={{ py: { xs: 4, sm: 6 } }}>
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
    <Stack aria-busy="true" data-testid="teacher-sessions-loading" sx={{ gap: 2 }}>
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
