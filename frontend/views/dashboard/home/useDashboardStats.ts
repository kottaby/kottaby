"use client";

import { useApolloClient, useQuery } from "@apollo/client/react";
import { useEffect, useMemo, useState } from "react";
import type {
  AdminUserStatsQuery,
  AdminUserStatsQueryVariables,
  MyLinkedChildrenQuery,
  MyLinkedChildrenQueryVariables,
  MyStudentSessionsQuery,
  MyStudentSessionsQueryVariables,
  MySubscriptionsQuery,
  MySubscriptionsQueryVariables,
  MyTeacherSessionsQuery,
  MyTeacherSessionsQueryVariables,
  MyUnreadNotificationCountQuery,
  MyUnreadNotificationCountQueryVariables,
  MyWalletQuery,
  MyWalletQueryVariables,
  ParentChildReportsQuery,
  ParentChildReportsQueryVariables,
  ParentChildSessionsQuery,
  ParentChildSessionsQueryVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import { SessionStatus } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminUserStatsQueryDocument,
  myLinkedChildrenQueryDocument,
  myStudentSessionsQueryDocument,
  mySubscriptionsQueryDocument,
  myTeacherSessionsQueryDocument,
  myUnreadNotificationCountQueryDocument,
  myWalletQueryDocument,
  parentChildReportsQueryDocument,
  parentChildSessionsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { useAuth } from "@/frontend/hooks/auth";
import {
  countActiveSubscriptions,
  type DashboardStatDraft,
  type DashboardStatsData,
  resolveStatDrafts,
} from "@/frontend/views/dashboard/home/useDashboardStats.helpers";

/**
 * `pageSize: 1` window for the status-filtered session count queries and
 * the per-child parent pages — the page ENVELOPE carries the honest
 * `totalCount`, so the single row is throwaway payload kept only because
 * the shared documents select it.
 */
const COUNT_PAGE_SIZE = 1;

/**
 * The role-aware dashboard stats hook.
 *
 * Reads ONLY the viewer's own already-authorized identity-scoped documents
 * (no admin surfaces for non-admins, no cross-user targeting arguments
 * anywhere):
 *
 *  - Student → two status-filtered `myStudentSessions` count envelopes,
 *    `mySubscriptions` (active rows counted client-side), and the shared
 *    `myUnreadNotificationCount` cache field the app-bar badge maintains.
 *  - Teacher → the two `myTeacherSessions` count envelopes, `myWallet`
 *    (the balance decimal string verbatim), and the unread count.
 *  - Parent → `myLinkedChildren` plus a per-child aggregate loop (reports
 *    received + total sessions, one `pageSize: 1` envelope per child) run
 *    imperatively against the Apollo client — Apollo v4 has no
 *    `useQueries`, and a fixed-length hook ladder would silently DROP
 *    children in larger families, so the aggregate waits for EVERY child
 *    envelope and re-runs whenever the linked-children list changes.
 *  - Admin → `adminUserStats` (the platform account mix) + the unread count.
 *
 * Cache posture: every value observes the same cache fields the feature
 * views write (badge socket, mark-read actions, wallet payouts), so a stat
 * re-renders from cache without its own polling — the 120s badge poll
 * remains the unread-count freshness floor. The parent aggregate uses
 * `network-only` reads: page-envelope counts are tiny and the loop runs
 * only when the linked-children list changes, so cache-normalization of
 * the single-row envelopes (shared `Session`/`Report` ids across children)
 * can never poison the sums.
 *
 * Error posture: a failed query degrades ITS OWN stat to `null` (the card
 * renders the localized unavailable marker); sibling stats are unaffected.
 * While loading, the stat stays `undefined` (the card renders a skeleton).
 */
export interface UseDashboardStatsResult {
  /** Role-resolved stat drafts — empty only for an unrecognized role. */
  readonly drafts: readonly DashboardStatDraft[];
  /** True while ANY of the role's stat values is still resolving. */
  readonly isLoading: boolean;
}

/** Per-child aggregate outcome — `undefined` running, `null` failed, number resolved. */
interface ParentAggregateState {
  readonly reportsTotal: number | null | undefined;
  readonly sessionsTotal: number | null | undefined;
}

const PARENT_AGGREGATE_FAILED: ParentAggregateState = { reportsTotal: null, sessionsTotal: null };
const PARENT_AGGREGATE_RUNNING: ParentAggregateState = { reportsTotal: undefined, sessionsTotal: undefined };

/**
 * Parent per-child aggregate runner — one cancel-checked `client.query`
 * pair per linked child, summed once EVERY envelope has resolved.
 *
 * The effect keys on the STABLE joined id string (not the array identity)
 * so a fresh children array from a cache update does not re-trigger the
 * loop; a genuine membership change (new link granted, child severed)
 * produces a different key and re-runs it.
 */
function useParentChildAggregates(childIds: readonly number[] | undefined): ParentAggregateState {
  const client = useApolloClient();
  const [state, setState] = useState<ParentAggregateState>(PARENT_AGGREGATE_RUNNING);

  const childKey = childIds === undefined ? undefined : childIds.join(",");

  useEffect(() => {
    if (childKey === undefined) return;

    let cancelled = false;
    setState(PARENT_AGGREGATE_RUNNING);

    const ids = childKey.length === 0 ? [] : childKey.split(",").map(Number);
    if (ids.length === 0) {
      // A parent with zero linked children has honest zero aggregates —
      // no per-child network round-trip is needed to know that.
      setState({ reportsTotal: 0, sessionsTotal: 0 });
      return;
    }

    void (async () => {
      const reports: number[] = [];
      const sessions: number[] = [];
      for (const studentId of ids) {
        if (cancelled) return;
        try {
          const [reportsPage, sessionsPage] = await Promise.all([
            client.query<ParentChildReportsQuery, ParentChildReportsQueryVariables>({
              query: parentChildReportsQueryDocument,
              variables: { studentId, page: 1, pageSize: COUNT_PAGE_SIZE },
              fetchPolicy: "network-only",
            }),
            client.query<ParentChildSessionsQuery, ParentChildSessionsQueryVariables>({
              query: parentChildSessionsQueryDocument,
              variables: { studentId, page: 1, pageSize: COUNT_PAGE_SIZE },
              fetchPolicy: "network-only",
            }),
          ]);
          const reportsCount = reportsPage.data?.parentChildReports?.totalCount;
          const sessionsCount = sessionsPage.data?.parentChildSessions?.totalCount;
          if (reportsCount === undefined || sessionsCount === undefined) {
            // errorPolicy "none" turns transport/GraphQL failures into
            // throws, so an empty payload here is protocol-anomalous —
            // degrade the aggregate instead of summing a partial family.
            if (!cancelled) setState(PARENT_AGGREGATE_FAILED);
            return;
          }
          reports.push(reportsCount);
          sessions.push(sessionsCount);
        } catch {
          if (!cancelled) setState(PARENT_AGGREGATE_FAILED);
          return;
        }
      }
      if (!cancelled) {
        setState({
          reportsTotal: reports.reduce((sum, count) => sum + count, 0),
          sessionsTotal: sessions.reduce((sum, count) => sum + count, 0),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [childKey, client]);

  return state;
}

/**
 * Optional-value resolver shared by every role branch — collapses the
 * Apollo result trio (loading / error / data) into the hook's
 * `undefined`-while-loading, `null`-on-error, value-when-ready contract.
 * Generic over the value type: numbers (counts) and strings (the wallet
 * balance, which passes through verbatim) resolve identically.
 */
function resolveOptional<T>(loading: boolean, error: unknown, value: T | undefined): T | undefined | null {
  if (error) return null;
  if (loading || value === undefined) return undefined;
  return value;
}

/**
 * Wires the viewer's role to its stat queries and resolves the rendered
 * drafts through the pure builders in `useDashboardStats.helpers`.
 */
export function useDashboardStats(): UseDashboardStatsResult {
  const { user } = useAuth();
  const role = user?.role ?? null;

  // Shared unread-count observer — the same cache field the app-bar badge
  // polls and the realtime socket maintains, so this adds no independent
  // network traffic beyond query deduplication with the badge's in-flight
  // request.
  const unreadQuery = useQuery<MyUnreadNotificationCountQuery, MyUnreadNotificationCountQueryVariables>(
    myUnreadNotificationCountQueryDocument
  );

  const studentCompletedQuery = useQuery<MyStudentSessionsQuery, MyStudentSessionsQueryVariables>(
    myStudentSessionsQueryDocument,
    {
      variables: { filter: { status: SessionStatus.Completed }, page: 1, pageSize: COUNT_PAGE_SIZE },
      skip: role !== "Student",
    }
  );
  const studentUpcomingQuery = useQuery<MyStudentSessionsQuery, MyStudentSessionsQueryVariables>(
    myStudentSessionsQueryDocument,
    {
      variables: { filter: { status: SessionStatus.Scheduled }, page: 1, pageSize: COUNT_PAGE_SIZE },
      skip: role !== "Student",
    }
  );
  const studentSubscriptionsQuery = useQuery<MySubscriptionsQuery, MySubscriptionsQueryVariables>(
    mySubscriptionsQueryDocument,
    { skip: role !== "Student" }
  );

  const teacherCompletedQuery = useQuery<MyTeacherSessionsQuery, MyTeacherSessionsQueryVariables>(
    myTeacherSessionsQueryDocument,
    {
      variables: { filter: { status: SessionStatus.Completed }, page: 1, pageSize: COUNT_PAGE_SIZE },
      skip: role !== "Teacher",
    }
  );
  const teacherUpcomingQuery = useQuery<MyTeacherSessionsQuery, MyTeacherSessionsQueryVariables>(
    myTeacherSessionsQueryDocument,
    {
      variables: { filter: { status: SessionStatus.Scheduled }, page: 1, pageSize: COUNT_PAGE_SIZE },
      skip: role !== "Teacher",
    }
  );
  const teacherWalletQuery = useQuery<MyWalletQuery, MyWalletQueryVariables>(myWalletQueryDocument, {
    skip: role !== "Teacher",
  });

  const parentChildrenQuery = useQuery<MyLinkedChildrenQuery, MyLinkedChildrenQueryVariables>(
    myLinkedChildrenQueryDocument,
    { skip: role !== "Parent" }
  );
  const parentChildIds = useMemo(() => {
    if (role !== "Parent") return undefined;
    const children = parentChildrenQuery.data?.myLinkedChildren;
    return children === undefined ? undefined : children.map(child => Number(child.id));
  }, [role, parentChildrenQuery.data]);
  const parentAggregate = useParentChildAggregates(parentChildIds);

  const adminUserStatsQuery = useQuery<AdminUserStatsQuery, AdminUserStatsQueryVariables>(adminUserStatsQueryDocument, {
    skip: role !== "Admin",
  });

  return useMemo(() => {
    const unreadNotificationsCount = resolveOptional(
      unreadQuery.loading,
      unreadQuery.error,
      unreadQuery.data?.myUnreadNotificationCount
    );

    // Built fully-formed per role — the stats payload's fields are
    // readonly by contract, so each branch composes its own object.
    let data: DashboardStatsData;
    if (role === "Student") {
      const subscriptionRows = studentSubscriptionsQuery.loading
        ? undefined
        : (studentSubscriptionsQuery.data?.mySubscriptions ?? null);
      data = {
        unreadNotificationsCount,
        completedSessionsCount: resolveOptional(
          studentCompletedQuery.loading,
          studentCompletedQuery.error,
          studentCompletedQuery.data?.myStudentSessions?.totalCount
        ),
        upcomingSessionsCount: resolveOptional(
          studentUpcomingQuery.loading,
          studentUpcomingQuery.error,
          studentUpcomingQuery.data?.myStudentSessions?.totalCount
        ),
        activeSubscriptionsCount: studentSubscriptionsQuery.error ? null : countActiveSubscriptions(subscriptionRows),
      };
    } else if (role === "Teacher") {
      data = {
        unreadNotificationsCount,
        completedSessionsCount: resolveOptional(
          teacherCompletedQuery.loading,
          teacherCompletedQuery.error,
          teacherCompletedQuery.data?.myTeacherSessions?.totalCount
        ),
        upcomingSessionsCount: resolveOptional(
          teacherUpcomingQuery.loading,
          teacherUpcomingQuery.error,
          teacherUpcomingQuery.data?.myTeacherSessions?.totalCount
        ),
        walletBalance: resolveOptional(
          teacherWalletQuery.loading,
          teacherWalletQuery.error,
          teacherWalletQuery.data?.myWallet.balance
        ),
      };
    } else if (role === "Parent") {
      data = {
        unreadNotificationsCount,
        linkedChildrenCount: resolveOptional(
          parentChildrenQuery.loading,
          parentChildrenQuery.error,
          parentChildrenQuery.data?.myLinkedChildren?.length
        ),
        reportsReceivedCount: parentAggregate.reportsTotal,
        totalSessionsCount: parentAggregate.sessionsTotal,
      };
    } else if (role === "Admin") {
      data = {
        unreadNotificationsCount,
        totalUsersCount: resolveOptional(
          adminUserStatsQuery.loading,
          adminUserStatsQuery.error,
          adminUserStatsQuery.data?.adminUserStats.totalCount
        ),
        teachersCount: resolveOptional(
          adminUserStatsQuery.loading,
          adminUserStatsQuery.error,
          adminUserStatsQuery.data?.adminUserStats.teachersCount
        ),
        studentsCount: resolveOptional(
          adminUserStatsQuery.loading,
          adminUserStatsQuery.error,
          adminUserStatsQuery.data?.adminUserStats.studentsCount
        ),
      };
    } else {
      data = { unreadNotificationsCount };
    }

    const drafts = resolveStatDrafts(role, data);
    // A draft with an empty value is the helpers' loading sentinel — any
    // such draft means at least one of the role's stats is still resolving.
    const isLoading = drafts.some(entry => entry.value === "");

    return { drafts, isLoading };
  }, [
    role,
    unreadQuery.loading,
    unreadQuery.error,
    unreadQuery.data,
    studentCompletedQuery.loading,
    studentCompletedQuery.error,
    studentCompletedQuery.data,
    studentUpcomingQuery.loading,
    studentUpcomingQuery.error,
    studentUpcomingQuery.data,
    studentSubscriptionsQuery.loading,
    studentSubscriptionsQuery.error,
    studentSubscriptionsQuery.data,
    teacherCompletedQuery.loading,
    teacherCompletedQuery.error,
    teacherCompletedQuery.data,
    teacherUpcomingQuery.loading,
    teacherUpcomingQuery.error,
    teacherUpcomingQuery.data,
    teacherWalletQuery.loading,
    teacherWalletQuery.error,
    teacherWalletQuery.data,
    parentChildrenQuery.loading,
    parentChildrenQuery.error,
    parentChildrenQuery.data,
    parentAggregate.reportsTotal,
    parentAggregate.sessionsTotal,
    adminUserStatsQuery.loading,
    adminUserStatsQuery.error,
    adminUserStatsQuery.data,
  ]);
}
