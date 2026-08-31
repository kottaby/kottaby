"use client";

import { useQuery } from "@apollo/client/react";
import { EventOutlined as EmptyIcon, FilterListOutlined as FilteredIcon } from "@mui/icons-material";
import { Alert, Box, Skeleton, Snackbar, Stack, Typography } from "@mui/material";
import { type ReactNode, useCallback, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type {
  MyStudentSessionsQuery,
  MyStudentSessionsQuery_myStudentSessions_items,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { myStudentSessionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { CancelSessionConfirmDialog } from "@/frontend/views/student/sessions/CancelSessionConfirmDialog";
import { SessionDisputeConfirmDialog } from "@/frontend/views/student/sessions/SessionDisputeConfirmDialog";
import { SessionRow } from "@/frontend/views/student/sessions/SessionRow";
import { SessionStatusFilterChips } from "@/frontend/views/student/sessions/SessionStatusFilterChips";
import { SessionsEmptyState } from "@/frontend/views/student/sessions/SessionsEmptyState";
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
 * Render branches (visual state matrix) — the chrome (page title + filter
 * chips) renders in EVERY branch; only the body BELOW it swaps. The former
 * early returns omitted the chrome on skeleton/error/empty, which stranded
 * the user with no filter row exactly when the page went bare (accepted-as-is
 * in the 4.BFBS visual loop — resolved here):
 *
 * | # | Condition | Body (below the always-on chrome) |
 * |---|-----------|-----------------------------------|
 * | 1 | query in flight (no settled payload yet) | skeleton list rows mirroring the `ApplicantStatusCard` loading skeleton (`aria-busy`) |
 * | 2 | query error, mapping-table denial family (`permission-fallback` / `auth-recovery`) | shared `PermissionDeniedFallback` |
 * | 3 | any other query error (masked 500 …) | inline `Alert` with `sessions.genericError` |
 * | 4a | zero items, NO status filter active | empty state (`studentEmptyTitle` / `studentEmptyBody`, calendar icon) |
 * | 4b | zero items, status filter ACTIVE | distinct filtered-empty state (`filteredEmptyTitle` / `filteredEmptyBody`, filter-list icon) |
 * | 5 | rows present | `SessionRow` list |
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
 * Dispute-dialog wiring (DEV3-005 R-110) — the `openSessionDispute` mutation
 * and its code classification live in {@link SessionDisputeConfirmDialog};
 * EVERY error arm surfaces a snackbar (the dispute vocabulary per plan §4)
 * and the row stays in the list (no eviction arm — the dialog's docblock):
 *
 * | Outcome (extensions.code) | Container behavior |
 * |---------------------------|--------------------|
 * | success | `sessions.disputeOpenedNotice` success snackbar; the row flips to its DISPUTED chip via the dialog's cache normalize (no refetch); the dispute dialog closes and the row's `dispute` in-flight slot releases |
 * | `SESSION_NOT_FOUND` | `errors.sessionNotFound` error snackbar; row stays; dialog closes |
 * | `SESSION_INVALID_TRANSITION` | `errors.sessionInvalidTransition` error snackbar; row stays; dialog closes |
 * | `VALIDATION` / `FORBIDDEN` / anything else | error snackbar with the copy the dialog resolved (`errors.validation` / `errors.forbidden` / `sessions.genericError`); the dialog stays open for a retry |
 *
 * The dispute affordance participates in the cron-r2 D9-bis per-row slot
 * book (`Record<sessionId, Set<kind>>` extended with the `dispute` kind):
 * the row whose dispute dialog is open holds the slot, disabling its own
 * dispute CTA while the modal owns the mutation.
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
 * Per-row action kinds tracked in the container's in-flight slots. `cancel`
 * is reserved for the dialog-owned mutation (its busy state lives inside
 * `CancelSessionConfirmDialog`); `dispute` marks the row whose dispute
 * dialog is open (the dialog-owned mutation — the D9-bis per-row slot book
 * extended with the DEV3-005 dispute kind).
 */
type RowActionKind = "cancel" | "dispute";

/**
 * In-flight slot book — sessionId → the set of action kinds currently in
 * flight FOR THAT ROW (cron-r2 D9-bis hardening). Immutable records +
 * copied sets only: the React state is never mutated in place, so every
 * `setState` yields a new snapshot and per-row slots clear independently.
 */
type InFlightSlots = Readonly<Record<string, ReadonlySet<RowActionKind>>>;

/** Opens a row+kind slot (pure — returns a new record, never mutating). */
function addInFlightAction(slots: InFlightSlots, sessionId: string, kind: RowActionKind): InFlightSlots {
  const next = new Set(slots[sessionId] ?? []);
  next.add(kind);
  return { ...slots, [sessionId]: next };
}

/** Closes a row+kind slot, dropping the entry once its set drains (pure). */
function removeInFlightAction(slots: InFlightSlots, sessionId: string, kind: RowActionKind): InFlightSlots {
  const previous = slots[sessionId];
  if (!previous?.has(kind)) return slots;
  const next = new Set(previous);
  next.delete(kind);
  if (next.size === 0) {
    return Object.fromEntries(Object.entries(slots).filter(([id]) => id !== sessionId));
  }
  return { ...slots, [sessionId]: next };
}

/** Whether THIS row's slot for THIS action kind is currently in flight. */
function isInFlight(slots: InFlightSlots, sessionId: string, kind: RowActionKind): boolean {
  return slots[sessionId]?.has(kind) ?? false;
}

/**
 * The student sessions view: ALWAYS-ON chrome (title + sticky filter chips)
 * over a swapping body — skeleton / permission fallback / error notice /
 * empty (generic or filtered) / rows — plus the cancel-dialog and snackbar
 * chrome.
 */
export function StudentSessionsContainer(): ReactNode {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);

  // Status filter — `null` is the "all" token; every change re-keys the
  // query `variables`, which re-runs the stateful query (Apollo refetch).
  const [statusFilter, setStatusFilter] = useState<SessionStatus | null>(null);

  // Cancel-dialog owner (single dialog slot, re-keyed per session id).
  const [cancelDialogSessionId, setCancelDialogSessionId] = useState<string | null>(null);

  // Dispute-dialog owner (DEV3-005, single dialog slot, re-keyed per id).
  const [disputeDialogSessionId, setDisputeDialogSessionId] = useState<string | null>(null);

  // Per-row in-flight slots (D9-bis mechanism) — the row whose dispute dialog
  // is open holds the `dispute` slot, disabling its dispute CTA behind the
  // modal while its mutation runs.
  const [inFlightSlots, setInFlightSlots] = useState<InFlightSlots>({});

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

  /** Dispute-dialog open — ALSO claims the row's `dispute` in-flight slot. */
  const openDisputeDialog = useCallback((sessionId: string): void => {
    setDisputeDialogSessionId(sessionId);
    setInFlightSlots(prev => addInFlightAction(prev, sessionId, "dispute"));
  }, []);

  /** Dispute-dialog close (any outcome) — releases the row's dispute slot. */
  const closeDisputeDialog = useCallback((): void => {
    setDisputeDialogSessionId(null);
    setInFlightSlots(prev =>
      disputeDialogSessionId === null ? prev : removeInFlightAction(prev, disputeDialogSessionId, "dispute")
    );
  }, [disputeDialogSessionId]);

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

  // --- dispute-dialog outcome arms (DEV3-005 — all snackbars; the row
  // stays in the list; the dialog closes and releases the dispute slot) ---

  const handleDisputed = useCallback(
    (sessionId: string): void => {
      setRowAlerts(prev => dropRowAlert(prev, sessionId));
      setNotice({ message: t.disputeOpenedNotice, severity: "success" });
      closeDisputeDialog();
    },
    [t, closeDisputeDialog]
  );

  const handleDisputeSessionMissing = useCallback(
    (sessionId: string): void => {
      // Deliberately NO eviction arm (see the dispute dialog's docblock) —
      // the honest surface is the error notice; the row stays in the list.
      setRowAlerts(prev => dropRowAlert(prev, sessionId));
      setNotice({ message: te.sessionNotFound, severity: "error" });
      closeDisputeDialog();
    },
    [te, closeDisputeDialog]
  );

  // No sessionId parameter: the invalid-transition arm never addresses the
  // row (no inline alert — the dispute vocabulary is snackbar-mapped), and a
  // parameterless callback stays assignable to the dialog's
  // `(sessionId: string) => void` prop type.
  const handleDisputeInvalidTransition = useCallback((): void => {
    setNotice({ message: te.sessionInvalidTransition, severity: "error" });
    closeDisputeDialog();
  }, [te, closeDisputeDialog]);

  /**
   * Failure arm (VALIDATION / FORBIDDEN / masked) — the dispute dialog
   * STAYS OPEN for a retry (its own documented contract), so the dispute
   * slot stays claimed and the snackbar carries the resolved copy.
   */
  const handleDisputeFailure = useCallback((message: string): void => {
    setNotice({ message, severity: "error" });
  }, []);

  // The body below the chrome resolves through the module-scope
  // `StudentSessionsBody` (matrix branches 1–5) — extracting it keeps this
  // orchestrator to state + callbacks only while the chrome above renders in
  // EVERY branch (the user never loses the filter row — 4.BFBS fix).
  return (
    <Stack data-testid="student-sessions-view" sx={{ gap: 3 }}>
      <Stack sx={{ gap: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {t.studentPageTitle}
        </Typography>
        <SessionStatusFilterChips value={statusFilter} onChange={handleFilterChange} />
      </Stack>
      <StudentSessionsBody
        statusFilter={statusFilter}
        loading={loading}
        error={error}
        data={data}
        rowAlerts={rowAlerts}
        onCancelIntent={openCancelDialog}
        onDisputeIntent={openDisputeDialog}
        disputeInFlightSlots={inFlightSlots}
        t={t}
      />
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
      {disputeDialogSessionId !== null ? (
        <SessionDisputeConfirmDialog
          key={disputeDialogSessionId}
          sessionId={disputeDialogSessionId}
          open
          onClose={closeDisputeDialog}
          onDisputed={handleDisputed}
          onSessionMissing={handleDisputeSessionMissing}
          onInvalidTransition={handleDisputeInvalidTransition}
          onFailure={handleDisputeFailure}
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

interface StudentSessionsBodyProps {
  readonly statusFilter: SessionStatus | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly data: MyStudentSessionsQuery | undefined;
  readonly rowAlerts: Readonly<Record<string, string>>;
  readonly onCancelIntent: (sessionId: string) => void;
  readonly onDisputeIntent: (sessionId: string) => void;
  /** Per-row dispute slot book (D9-bis) — dispute CTAs disable per row. */
  readonly disputeInFlightSlots: InFlightSlots;
  readonly t: SessionsLabels;
}

/**
 * The swapping body BELOW the always-on chrome — matrix branches 1–5 as a
 * pure presentational resolver (module-scope so the container stays a
 * state+callbacks orchestrator): skeleton / permission fallback / error
 * notice / empty (generic vs filtered) / rows.
 */
function StudentSessionsBody({
  statusFilter,
  loading,
  error,
  data,
  rowAlerts,
  onCancelIntent,
  onDisputeIntent,
  disputeInFlightSlots,
  t,
}: Readonly<StudentSessionsBodyProps>): ReactNode {
  if (loading && data === undefined) {
    // Branch 1 — first fetch for the active filter: skeleton rows announce
    // busy semantics. A cache-hit variables change keeps the settled list
    // mounted (no skeleton flash on filter round-trips).
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
  if (sessions.length === 0) {
    // Branches 4a/4b — an empty page: the DISTINCT filtered-empty copy
    // (with the filter-list icon) only when a status chip is active; the
    // generic empty state stays reserved for the unfiltered "all" view.
    const isFiltered = statusFilter !== null;
    return (
      <SessionsEmptyState
        testId="student-sessions-empty"
        icon={isFiltered ? FilteredIcon : EmptyIcon}
        title={isFiltered ? t.filteredEmptyTitle : t.studentEmptyTitle}
        body={isFiltered ? t.filteredEmptyBody : t.studentEmptyBody}
      />
    );
  }
  // Branch 5 — rows.
  return (
    <Stack sx={{ gap: 2 }}>
      {sessions.map(session => (
        <SessionRow
          key={session.id}
          session={session}
          alertMessage={rowAlerts[session.id] ?? null}
          onCancelIntent={onCancelIntent}
          onDisputeIntent={onDisputeIntent}
          disputeDisabled={isInFlight(disputeInFlightSlots, session.id, "dispute")}
        />
      ))}
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
