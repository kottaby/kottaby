"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { Stack } from "@mui/material";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { SessionNoticeSnackbar } from "@/frontend/components/ui/sessionList";
import type {
  AdminSessionListFilterInput,
  AdminSessionsQuery_adminSessions_items,
} from "@/frontend/graphql/generated/gql/graphql";
import { SessionStatus, type SessionType } from "@/frontend/graphql/generated/gql/graphql";
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
import { ReassignTeacherDialog } from "@/frontend/views/admin/session-governance/ReassignTeacherDialog";
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
 * corrected submit. Codes classify through `extractErrorCode` +
 * `normalizeGraphQLErrorCode` — the server `message` is NEVER echoed.
 *
 * Cancel idempotency — each logical cancel attempt mints ONE
 * `crypto.randomUUID()` key when the dialog opens and sends it via the
 * Apollo context header `x-idempotency-key` (the broadcasts compose-send
 * precedent); the key rotates only on SUCCESS so a retried submit stays on
 * the same claim (REQ-023 replay dedupe).
 *
 * Page-level authorization is owned by the server guard (`withPageAuth`
 * with `roles: [UserRole.Admin]`, task 5.3) — this container performs no
 * role logic. MUI v9 discipline: `sx`-only styling, theme-palette colors,
 * `*Outlined` icons only, RTL-safe logical composition.
 */

/** Page size — the backend's own default/clamp midpoint (1..50, default 25). */
const ADMIN_SESSIONS_PAGE_SIZE = 25;

/** Reschedule grace mirror — the replacement start may sit ≤5 min in the past. */
const RESCHEDULE_PAST_GRACE_MS = 5 * 60 * 1000;

/** Wire code family — a raced concurrent governance action (row gone / state moved). */
const SESSION_INVALID_TRANSITION_CODE = "SESSION_INVALID_TRANSITION";

/** One transient container-level notice rendered in the MUI Snackbar slot. */
export interface ContainerNotice {
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
export interface GovernanceDialogState {
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

/** Whole-number id tokens only — the wire member is `Int`, never a string. */
const WHOLE_NUMBER_PATTERN = /^\d+$/;

/** `yyyy-MM-dd` date token → inclusive-midnight UTC ISO instant. */
function dateTokenToInclusiveIso(token: string): string {
  return new Date(`${token}T00:00:00.000Z`).toISOString();
}

/** ISO wire instant → local `datetime-local` token (reschedule prefill). */
export function isoToDatetimeLocalToken(iso: string | null): string {
  if (iso === null) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(
    instant.getHours()
  )}:${pad(instant.getMinutes())}`;
}

/**
 * Client mirror of the reschedule validation envelope (service rules
 * mirrored per REQ-021): the pair must be ordered AND the start may not sit
 * further than the 5-minute grace window in the past. Returns the localized
 * message to surface on the start field, or null when the pair is valid.
 */
export function validateReschedulePair(
  startedAtIso: string,
  endedAtIso: string,
  tErrors: { readonly sessionRescheduleWindowInvalid: string; readonly sessionRescheduleStartInPast: string }
): string | null {
  const startedMs = new Date(startedAtIso).getTime();
  const endedMs = new Date(endedAtIso).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || startedMs >= endedMs) {
    return tErrors.sessionRescheduleWindowInvalid;
  }
  if (startedMs < Date.now() - RESCHEDULE_PAST_GRACE_MS) {
    return tErrors.sessionRescheduleStartInPast;
  }
  return null;
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
  const [filterInvalidId, setFilterInvalidId] = useState(false);
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
  const { data, loading, error, refetch } = useQuery(adminSessionsQueryDocument, {
    variables: { filter: appliedFilter, page, pageSize: ADMIN_SESSIONS_PAGE_SIZE },
  });

  const rows = data?.adminSessions.items ?? [];
  const totalCount = data?.adminSessions.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_SESSIONS_PAGE_SIZE));

  // A filter is "active" when any committed member is set — the body swaps
  // the empty-state copy ("no results match the filters" vs "no sessions").
  const filtersActive = Object.values(appliedFilter).some(value => value !== null);

  // Status summary — counts over the LOADED page only (honest, real data).
  const statusCounts = useMemo<StatusSummaryCounts>(() => {
    const counts = new Map<SessionStatus, number>();
    for (const row of rows) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }
    return {
      scheduled: counts.get(SessionStatus.Scheduled) ?? 0,
      started: counts.get(SessionStatus.Started) ?? 0,
      completed: counts.get(SessionStatus.Completed) ?? 0,
      cancelled: counts.get(SessionStatus.Cancelled) ?? 0,
      disputed: counts.get(SessionStatus.Disputed) ?? 0,
      needsAttention: rows.filter(row => row.needsAttention).length,
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
    setFilterInvalidId(false);
    setFilterDraft(prev => ({ ...prev, ...patch }));
  }, []);

  const applyFilters = useCallback((): void => {
    const teacherToken = filterDraft.teacherUserId.trim();
    const studentToken = filterDraft.studentUserId.trim();
    const teacherInvalid = teacherToken !== "" && !WHOLE_NUMBER_PATTERN.test(teacherToken);
    const studentInvalid = studentToken !== "" && !WHOLE_NUMBER_PATTERN.test(studentToken);
    if (teacherInvalid || studentInvalid) {
      setFilterInvalidId(true);
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
    setFilterInvalidId(false);
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
        // One idempotency key per LOGICAL cancel attempt — minted at open,
        // rotated only on success (see the docblock).
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
      // Rotation happens ONLY on success — a failed/retried submit keeps the
      // same claim so the server replay dedupe stays effective (REQ-023).
      cancelKeyRef.current = crypto.randomUUID();
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
    onCompleted: () => {
      // Observation continues — the drawer stays open, the banner leaves.
      setNotice({ message: t.joinSuccess, severity: "success" });
      setJoinedSessionId(drawerSessionId);
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
        filterInvalidId={filterInvalidId}
        filterInvalidMessage={t.filterInvalidId}
        onFilterDraftChange={updateFilterDraft}
        onApplyFilters={applyFilters}
        onResetFilters={resetFilters}
      />
      <AdminSessionsBody
        loading={loading}
        error={error}
        data={data}
        page={page}
        totalPages={totalPages}
        filtersActive={filtersActive}
        onRetry={() => {
          void refetch();
        }}
        onPageChange={setPage}
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
