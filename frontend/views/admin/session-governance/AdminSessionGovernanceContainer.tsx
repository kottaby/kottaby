"use client";

import { NetworkStatus } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client/react";
import { Stack } from "@mui/material";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { SessionNoticeSnackbar } from "@/frontend/components/ui/sessionList";
import {
  type AdminSessionListFilterInput,
  type AdminSessionsQuery_adminSessions_items,
  SessionStatus,
  type SessionType,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSessionCancelMutationDocument,
  adminSessionJoinMutationDocument,
  adminSessionQueryDocument,
  adminSessionReassignMutationDocument,
  adminSessionRescheduleMutationDocument,
  adminSessionsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { AdminSessionDetailDrawer } from "@/frontend/views/admin/session-governance/AdminSessionDetailDrawer";
import { AdminSessionGovernanceChrome } from "@/frontend/views/admin/session-governance/AdminSessionGovernanceChrome";
import { AdminSessionsBody } from "@/frontend/views/admin/session-governance/AdminSessionsBody";
import { CancelSessionDialog } from "@/frontend/views/admin/session-governance/CancelSessionDialog";
import { JoinObservationAction } from "@/frontend/views/admin/session-governance/JoinObservationAction";
import {
  ReassignTeacherDialog,
  WHOLE_NUMBER_PATTERN,
} from "@/frontend/views/admin/session-governance/ReassignTeacherDialog";
import { RescheduleSessionDialog } from "@/frontend/views/admin/session-governance/RescheduleSessionDialog";
import { AdminSessionGovernance, Errors, Sessions, useAppTranslation } from "@/shared/locale";

/**
 * AdminSessionGovernanceContainer — the client orchestrator behind
 * `/admin/session-governance` (DEV3-021, the admin directory over ALL
 * sessions plus the four governance operations).
 *
 * Stateful composition ONLY (mirrors the admin disputes orchestrator):
 * this component owns every Apollo binding on the surface — the stateful
 * directory query (`adminSessions`, filter + honest-total paging), the
 * nullable browse-detail query for the drawer (`adminSession`, skipped
 * while closed) and the FOUR governance mutations
 * (`adminRescheduleSession` / `adminCancelSession` /
 * `adminReassignTeacher` / `adminJoinSession`); the dialogs, drawer and
 * banner stay presentational and receive triggers + in-flight flags.
 * `useLazyQuery` is banned per `sharedDocuments/AGENTS.md`.
 *
 * Filter orchestration — the chrome edits a DRAFT (raw strings for the
 * participant-id fields, `yyyy-MM-dd` tokens for the creation window);
 * APPLY validates (ids must be whole numbers; a zero-width window is a
 * legitimate empty result) and commits the wire-shaped filter into state,
 * re-keying the query variables and resetting the 1-based page. RESET
 * restores the unfiltered directory. Filter id members are `Int` on the
 * wire (numbers, never strings) and the window bounds are ISO-8601 UTC
 * instants (inclusive from-midnight, EXCLUSIVE to-midnight — the repo's
 * half-open `created_at >= from AND < to` contract).
 *
 * Status summary — the chrome's per-status counts derive from the LOADED
 * page rows (real data only; the honest `totalCount` is the only
 * server-truth number surfaced — nothing is extrapolated across pages).
 *
 * Mutation outcomes — EVERY arm surfaces a snackbar; the returned
 * `Session!` payloads auto-merge onto the cached directory entities by id
 * (no refetch): success closes the dialog + success notice;
 * `SESSION_NOT_FOUND` / `SESSION_INVALID_TRANSITION` close the dialog with
 * an error notice (a raced concurrent governance action makes the dialog's
 * premise stale — the merged payload updates the row in place);
 * `VALIDATION` / `FORBIDDEN` / masked failures keep the dialog open for a
 * corrected submit. The specific boundary denials
 * (`TEACHER_NOT_FOUND` / `TEACHER_NOT_CERTIFIED` /
 * `SESSION_RESCHEDULE_WINDOW_INVALID` / `SESSION_RESCHEDULE_START_IN_PAST`)
 * surface their OWN errors-namespace copy — never the directory-load
 * fallback. Codes classify through `extractErrorCode` +
 * `normalizeGraphQLErrorCode` — the server `message` is NEVER echoed.
 *
 * Cancel idempotency — each logical cancel attempt mints ONE
 * `crypto.randomUUID()` key when the dialog opens (the openDialog event
 * handler — the only ref write) and the submit handler threads it at call
 * time via the Apollo context header `x-idempotency-key` (the broadcasts
 * compose-send precedent); a retried submit stays on the SAME claim (server
 * replay dedupe) and a settled attempt can never leak its claim onward —
 * success closes the dialog while every open mints fresh, so no effect- or
 * hook-config-based rotation exists.
 *
 * Page-level authorization is owned by the server admin route guard —
 * this container performs no role logic. MUI v9 discipline: `sx`-only styling, theme-palette colors,
 * `*Outlined` icons only, RTL-safe logical composition.
 */

/** Page size — the backend's own default/clamp midpoint (1..50, default 25). */
const ADMIN_SESSIONS_PAGE_SIZE = 25;

/** Wire code family — a raced concurrent governance action (row gone / state moved). */
const SESSION_INVALID_TRANSITION_CODE = "SESSION_INVALID_TRANSITION";

/** One transient container-level notice rendered in the MUI Snackbar slot. */
interface ContainerNotice {
  readonly message: string;
  readonly severity: "success" | "info" | "error";
}

/** Raw filter-bar draft — participant ids stay STRINGS until APPLY validates. */
export interface DirectoryFilterDraft {
  readonly teacherUserId: string;
  readonly studentUserId: string;
  readonly type: SessionType | null;
  readonly status: SessionStatus | null;
  /** `yyyy-MM-dd` tokens from the native date inputs (null = unset). */
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
}

/** Which governance dialog (if any) is open, keyed to its session row. */
interface GovernanceDialogState {
  readonly kind: "reschedule" | "cancel" | "reassign";
  readonly session: AdminSessionsQuery_adminSessions_items;
}

/** Per-status summary over the LOADED page (real data only). */
export interface StatusSummaryCounts {
  readonly scheduled: number;
  readonly started: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly disputed: number;
  readonly needsAttention: number;
}

const EMPTY_FILTER_DRAFT: DirectoryFilterDraft = {
  teacherUserId: "",
  studentUserId: "",
  type: null,
  status: null,
  dateFrom: null,
  dateTo: null,
};

/** Wire-shaped unfiltered state — every member explicitly null (input members are required-nullable). */
const EMPTY_APPLIED_FILTER: AdminSessionListFilterInput = {
  teacherUserId: null,
  studentUserId: null,
  type: null,
  status: null,
  dateFrom: null,
  dateTo: null,
};

/** `yyyy-MM-dd` date token → inclusive-midnight UTC ISO instant. */
function dateTokenToInclusiveIso(token: string): string {
  return new Date(`${token}T00:00:00.000Z`).toISOString();
}

/**
 * The admin session-governance view: always-on chrome (title + honest-count
 * bar + status summary + filter bar) over a swapping body — skeleton /
 * permission fallback / error / empty / rows + pager — plus the detail
 * drawer, the governance dialogs, the join-observation banner and the
 * snackbar chrome.
 */
export function AdminSessionGovernanceContainer(): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);
  const tSessions = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);

  // ---- filter state (draft → applied) -------------------------------------
  const [filterDraft, setFilterDraft] = useState<DirectoryFilterDraft>(EMPTY_FILTER_DRAFT);
  // Per-field invalid-id flags — the error binds to the OFFENDING field
  // (teacher vs student), not one shared flag for both inputs.
  const [filterInvalidIds, setFilterInvalidIds] = useState<{
    teacher: boolean;
    student: boolean;
  }>({ teacher: false, student: false });
  const [appliedFilter, setAppliedFilter] = useState<AdminSessionListFilterInput>(EMPTY_APPLIED_FILTER);
  const [page, setPage] = useState(1);

  // ---- surface state -------------------------------------------------------
  const [drawerSessionId, setDrawerSessionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<GovernanceDialogState | null>(null);
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ContainerNotice | null>(null);

  const dismissNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  // ---- directory read ------------------------------------------------------
  // `notifyOnNetworkStatusChange` keeps the mid-flight page transition
  // observable: the pager busy affordance (aria-busy + disabled chevrons)
  // derives from `networkStatus`, mirroring the platform-analytics
  // container's refresh posture.
  const { data, loading, error, refetch, networkStatus } = useQuery(adminSessionsQueryDocument, {
    variables: { filter: appliedFilter, page, pageSize: ADMIN_SESSIONS_PAGE_SIZE },
    notifyOnNetworkStatusChange: true,
  });

  // The loaded page's rows, `undefined` until the directory settles — the
  // fallback to the empty list stays INSIDE the memo (a `?? []` dependency
  // initializer re-arms the memo every render).
  const rows = data?.adminSessions.items;
  const totalCount = data?.adminSessions.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_SESSIONS_PAGE_SIZE));

  // Pager busy affordance: a round-trip in flight OVER a settled payload
  // (page transition / refetch) — the body announces aria-busy and keeps
  // the pager chevrons disabled until the next page settles. The very
  // first fetch (no settled payload) swaps to the skeleton instead.
  const listBusy = data !== undefined && networkStatus !== NetworkStatus.ready;

  // A filter is "active" when any committed member is set — the body swaps
  // the empty-state copy ("no results match the filters" vs "no sessions").
  const filtersActive = Object.values(appliedFilter).some(value => value !== null);

  // Pager commits clamp against the honest total BEFORE re-keying the
  // query: below 1 resolves to 1, an empty directory resolves to the
  // single page, and anything past the last page clamps back into range
  // (a filtered shrink under a stale pager must not send an off-window
  // page the backend would reject).
  const changePage = useCallback(
    (nextPage: number): void => {
      const lastPage = Math.max(1, Math.ceil(totalCount / ADMIN_SESSIONS_PAGE_SIZE));
      setPage(Math.min(Math.max(nextPage, 1), lastPage));
    },
    [totalCount]
  );

  // Status summary — counts over the LOADED page only (honest, real data).
  const statusCounts = useMemo<StatusSummaryCounts>(() => {
    const effectiveRows = rows ?? [];
    const counts = new Map<SessionStatus, number>();
    for (const row of effectiveRows) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }
    return {
      scheduled: counts.get(SessionStatus.Scheduled) ?? 0,
      started: counts.get(SessionStatus.Started) ?? 0,
      completed: counts.get(SessionStatus.Completed) ?? 0,
      cancelled: counts.get(SessionStatus.Cancelled) ?? 0,
      disputed: counts.get(SessionStatus.Disputed) ?? 0,
      needsAttention: effectiveRows.filter(row => row.needsAttention).length,
    };
  }, [rows]);

  // ---- detail read (drawer) ------------------------------------------------
  const {
    data: detailData,
    loading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery(adminSessionQueryDocument, {
    variables: { id: drawerSessionId ?? "" },
    skip: drawerSessionId === null,
  });

  // ---- filter callbacks ----------------------------------------------------
  const updateFilterDraft = useCallback((patch: Partial<DirectoryFilterDraft>): void => {
    setFilterInvalidIds({ teacher: false, student: false });
    setFilterDraft(prev => ({ ...prev, ...patch }));
  }, []);

  const applyFilters = useCallback((): void => {
    const teacherToken = filterDraft.teacherUserId.trim();
    const studentToken = filterDraft.studentUserId.trim();
    const teacherInvalid = teacherToken !== "" && !WHOLE_NUMBER_PATTERN.test(teacherToken);
    const studentInvalid = studentToken !== "" && !WHOLE_NUMBER_PATTERN.test(studentToken);
    if (teacherInvalid || studentInvalid) {
      setFilterInvalidIds({ teacher: teacherInvalid, student: studentInvalid });
      return;
    }
    setAppliedFilter({
      teacherUserId: teacherToken === "" ? null : Number(teacherToken),
      studentUserId: studentToken === "" ? null : Number(studentToken),
      type: filterDraft.type,
      status: filterDraft.status,
      dateFrom: filterDraft.dateFrom === null ? null : dateTokenToInclusiveIso(filterDraft.dateFrom),
      dateTo: filterDraft.dateTo === null ? null : dateTokenToInclusiveIso(filterDraft.dateTo),
    });
    setPage(1);
  }, [filterDraft]);

  const resetFilters = useCallback((): void => {
    setFilterDraft(EMPTY_FILTER_DRAFT);
    setFilterInvalidIds({ teacher: false, student: false });
    setAppliedFilter(EMPTY_APPLIED_FILTER);
    setPage(1);
  }, []);

  // ---- drawer + dialog orchestration --------------------------------------
  const openDrawer = useCallback((sessionId: string): void => {
    setDrawerSessionId(sessionId);
  }, []);

  const closeDrawer = useCallback((): void => {
    setDrawerSessionId(null);
  }, []);

  const closeDialog = useCallback((): void => {
    setDialog(null);
  }, []);

  const openDialog = useCallback(
    (kind: GovernanceDialogState["kind"], session: AdminSessionsQuery_adminSessions_items): void => {
      setDialog({ kind, session });
      if (kind === "cancel") {
        // One idempotency key per LOGICAL cancel attempt — minted HERE, in
        // the event handler that opens the attempt (event-handler ref write;
        // the submit handler only reads it at call time — see the docblock):
        // a retried submit rides the SAME claim (server replay dedupe) and
        // a settled attempt can never leak its claim onward, because success
        // closes the dialog while every open mints fresh.
        cancelKeyRef.current = crypto.randomUUID();
      }
    },
    []
  );

  // ---- notice arms ---------------------------------------------------------
  const failNotice = useCallback((message: string): void => {
    setNotice({ message, severity: "error" });
  }, []);

  const successCloseDialog = useCallback((message: string): void => {
    setNotice({ message, severity: "success" });
    setDialog(null);
  }, []);

  const raceCloseDialog = useCallback((message: string): void => {
    // A raced concurrent governance action (SESSION_NOT_FOUND /
    // SESSION_INVALID_TRANSITION) makes the dialog's premise stale — close
    // with an error notice; the returned `Session!` payload already merged
    // the new state onto the cached row where one arrived.
    setNotice({ message, severity: "error" });
    setDialog(null);
  }, []);

  /** Classifies a governance-mutation failure against the localized error copy. */
  const classifyMutationFailure = useCallback(
    (mutationError: unknown): { readonly kind: "race" | "retryable"; readonly message: string } => {
      const rawCode = extractErrorCode(mutationError);
      const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
      if (code === SESSION_INVALID_TRANSITION_CODE) {
        return { kind: "race", message: te.sessionInvalidTransition };
      }
      // The directory detail read answers an absent row with data, but the
      // write tier still races: a concurrently-deleted target surfaces here.
      if (code === "SESSION_NOT_FOUND" || code === "NOT_FOUND") {
        return { kind: "race", message: te.sessionNotFound };
      }
      if (code === "TEACHER_NOT_CERTIFIED") {
        return { kind: "retryable", message: te.teacherNotCertified };
      }
      // Specific boundary denials surface their OWN errors-namespace copy —
      // never the directory-load fallback — so the operator learns WHICH
      // rule fired, not merely that something failed.
      if (code === "TEACHER_NOT_FOUND") {
        return { kind: "retryable", message: te.teacherNotFound };
      }
      if (code === "SESSION_RESCHEDULE_WINDOW_INVALID") {
        return { kind: "retryable", message: te.sessionRescheduleWindowInvalid };
      }
      if (code === "SESSION_RESCHEDULE_START_IN_PAST") {
        return { kind: "retryable", message: te.sessionRescheduleStartInPast };
      }
      if (code === "VALIDATION") {
        return { kind: "retryable", message: te.validation };
      }
      if (code === "FORBIDDEN") {
        return { kind: "retryable", message: te.forbidden };
      }
      return { kind: "retryable", message: t.errorTitle };
    },
    [te, t]
  );

  // ---- mutations (ALL Apollo writes live in the container) -----------------
  const cancelKeyRef = useRef<string>(crypto.randomUUID());

  const [commitReschedule, rescheduleMutation] = useMutation(adminSessionRescheduleMutationDocument, {
    onCompleted: () => {
      successCloseDialog(t.rescheduleSuccess);
    },
    onError: mutationError => {
      const classified = classifyMutationFailure(mutationError);
      if (classified.kind === "race") {
        raceCloseDialog(classified.message);
        return;
      }
      failNotice(classified.message);
    },
  });

  const [commitCancel, cancelMutation] = useMutation(adminSessionCancelMutationDocument, {
    onCompleted: () => {
      successCloseDialog(t.cancelSuccess);
    },
    onError: mutationError => {
      const classified = classifyMutationFailure(mutationError);
      if (classified.kind === "race") {
        raceCloseDialog(classified.message);
        return;
      }
      failNotice(classified.message);
    },
  });

  const [commitReassign, reassignMutation] = useMutation(adminSessionReassignMutationDocument, {
    onCompleted: () => {
      successCloseDialog(t.reassignSuccess);
    },
    onError: mutationError => {
      const classified = classifyMutationFailure(mutationError);
      if (classified.kind === "race") {
        raceCloseDialog(classified.message);
        return;
      }
      failNotice(classified.message);
    },
  });

  const [commitJoin, joinMutation] = useMutation(adminSessionJoinMutationDocument, {
    onCompleted: data => {
      // Observation continues — the drawer stays open, the banner leaves.
      // Keyed off the MUTATION's returned session id (the payload of THIS
      // call), never the drawer state: the drawer may already render a
      // DIFFERENT row by the time a slow response settles.
      setNotice({ message: t.joinSuccess, severity: "success" });
      setJoinedSessionId(data.adminJoinSession.id);
    },
    onError: mutationError => {
      const classified = classifyMutationFailure(mutationError);
      failNotice(classified.message);
    },
  });

  return (
    <Stack data-testid="admin-session-governance-view" sx={{ gap: 3 }}>
      <AdminSessionGovernanceChrome
        title={t.pageTitle}
        countLine={t.countLine(totalCount)}
        statusCounts={statusCounts}
        needsAttentionLabel={t.needsAttentionLabel}
        summaryScopeHint={t.summaryScopeHint}
        statusLabels={tSessions}
        filterDraft={filterDraft}
        filterInvalidTeacherId={filterInvalidIds.teacher}
        filterInvalidStudentId={filterInvalidIds.student}
        filterInvalidMessage={t.filterInvalidId}
        onFilterDraftChange={updateFilterDraft}
        onApplyFilters={applyFilters}
        onResetFilters={resetFilters}
      />
      <AdminSessionsBody
        loading={loading}
        busy={listBusy}
        error={error}
        data={data}
        page={page}
        totalPages={totalPages}
        filtersActive={filtersActive}
        onRetry={() => {
          void refetch();
        }}
        onPageChange={changePage}
        onOpenDetails={openDrawer}
        onDialogIntent={openDialog}
        t={t}
        tSessions={tSessions}
      />
      {dialog?.kind === "reschedule" ? (
        <RescheduleSessionDialog
          key={dialog.session.id}
          session={dialog.session}
          open
          onClose={closeDialog}
          loading={rescheduleMutation.loading}
          onSubmit={pair => {
            void commitReschedule({
              variables: { input: { sessionId: dialog.session.id, ...pair } },
            });
          }}
        />
      ) : null}
      {dialog?.kind === "cancel" ? (
        <CancelSessionDialog
          key={dialog.session.id}
          session={dialog.session}
          open
          onClose={closeDialog}
          loading={cancelMutation.loading}
          onSubmit={reason => {
            // The attempt's claim is read at CALL time inside this event
            // handler and threaded directly into the mutation context —
            // the header the authLink merges into the outgoing request.
            void commitCancel({
              variables: { input: { sessionId: dialog.session.id, reason } },
              context: { headers: { "x-idempotency-key": cancelKeyRef.current } },
            });
          }}
        />
      ) : null}
      {dialog?.kind === "reassign" ? (
        <ReassignTeacherDialog
          key={dialog.session.id}
          session={dialog.session}
          open
          onClose={closeDialog}
          loading={reassignMutation.loading}
          onSubmit={newTeacherUserId => {
            void commitReassign({
              variables: { input: { sessionId: dialog.session.id, newTeacherUserId } },
            });
          }}
        />
      ) : null}
      <AdminSessionDetailDrawer
        open={drawerSessionId !== null}
        detail={detailData?.adminSession ?? null}
        loading={detailLoading}
        error={detailError}
        tSessions={tSessions}
        onClose={closeDrawer}
        onRetry={() => {
          void refetchDetail();
        }}
        joinBanner={
          drawerSessionId === null ? null : (
            <JoinObservationAction
              sessionId={drawerSessionId}
              joined={joinedSessionId === drawerSessionId}
              loading={joinMutation.loading}
              onJoin={() => {
                if (drawerSessionId !== null) {
                  void commitJoin({ variables: { input: { sessionId: drawerSessionId } } });
                }
              }}
            />
          )
        }
      />
      <SessionNoticeSnackbar notice={notice} onDismiss={dismissNotice} />
    </Stack>
  );
}
