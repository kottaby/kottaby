"use client";

/**
 * TeacherSessionsBody — the swapping body BELOW the always-on chrome
 * (matrix branches 1–5) as a pure presentational resolver, extracted
 * verbatim from `TeacherSessionsContainer` (the max-lines split):
 * skeleton / permission fallback / error notice / empty (generic vs
 * filtered) / rows with lifecycle CTAs.
 */

import { SchoolOutlined as EmptyIcon } from "@mui/icons-material";
import type { ReactNode } from "react";
import type {
  MyTeacherSessionsQuery,
  MyTeacherSessionsQuery_myTeacherSessions_items,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  SessionQueryErrorBody,
  SessionsEmptyBranch,
  SessionsRowList,
} from "@/frontend/views/student/sessions/sessionBodyBranches";
import { TeacherSessionsLoadingSkeleton } from "@/frontend/views/teacher/sessions/TeacherSessionsLoadingSkeleton";
import { teacherActionsForSession } from "@/frontend/views/teacher/sessions/teacherSessionCacheArms";
import type { InFlightSlots } from "@/frontend/views/teacher/sessions/teacherSessionSlots";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

export interface TeacherSessionsBodyProps {
  readonly statusFilter: SessionStatus | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly data: MyTeacherSessionsQuery | undefined;
  readonly rowAlerts: Readonly<Record<string, string>>;
  readonly onCancelIntent: (sessionId: string) => void;
  readonly onDisputeIntent: (sessionId: string) => void;
  /** Per-row dispute slot book — dispute CTAs disable per row. */
  readonly disputeInFlightSlots: InFlightSlots;
  readonly inFlightSlots: InFlightSlots;
  readonly onStart: (sessionId: string) => void;
  readonly onComplete: (sessionId: string) => void;
  readonly t: SessionsLabels;
}

/**
 * The swapping body BELOW the always-on chrome — matrix branches 1–5 as a
 * pure presentational resolver (module-scope so the container stays a
 * state+callbacks orchestrator): skeleton / permission fallback / error
 * notice / empty (generic vs filtered) / rows with lifecycle CTAs.
 */
export function TeacherSessionsBody({
  statusFilter,
  loading,
  error,
  data,
  rowAlerts,
  onCancelIntent,
  onDisputeIntent,
  disputeInFlightSlots,
  inFlightSlots,
  onStart,
  onComplete,
  t,
}: Readonly<TeacherSessionsBodyProps>): ReactNode {
  if (loading && data === undefined) {
    // Branch 1 — first fetch for the active filter: skeleton rows announce
    // busy semantics. A cache-hit variables change keeps the settled list
    // mounted (no skeleton flash on filter round-trips).
    return <TeacherSessionsLoadingSkeleton />;
  }
  // Branches 2–3 — settled failures: denial family vs generic surfaced copy.
  if (error) {
    return (
      <SessionQueryErrorBody error={error} errorTestId="teacher-sessions-error" genericErrorMessage={t.genericError} />
    );
  }
  // Apollo settles queries with data-or-error; this narrow guard keeps the
  // compiler informed without unsafe assertions.
  if (!data) {
    return <TeacherSessionsLoadingSkeleton />;
  }
  const sessions: readonly MyTeacherSessionsQuery_myTeacherSessions_items[] = data.myTeacherSessions.items;
  if (sessions.length === 0) {
    // Branches 4a/4b — an empty page (the applicant teacher's permanent
    // state: an empty page, NEVER an error). The DISTINCT filtered-empty
    // copy only when a status chip is active; the generic empty state stays
    // reserved for the unfiltered "all" view.
    return (
      <SessionsEmptyBranch
        statusFilter={statusFilter}
        testId="teacher-sessions-empty"
        emptyIcon={EmptyIcon}
        emptyTitle={t.teacherEmptyTitle}
        emptyBody={t.teacherEmptyBody}
        filteredTitle={t.filteredEmptyTitle}
        filteredBody={t.filteredEmptyBody}
      />
    );
  }
  // Branch 5 — rows + lifecycle CTAs (each CTA disabled iff ITS OWN row+kind
  // slot is open).
  return (
    <SessionsRowList
      sessions={sessions}
      rowAlerts={rowAlerts}
      onCancelIntent={onCancelIntent}
      onDisputeIntent={onDisputeIntent}
      disputeInFlightSlots={disputeInFlightSlots}
      actionsFor={session => teacherActionsForSession(session, { t, inFlightSlots, onStart, onComplete })}
    />
  );
}
