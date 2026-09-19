"use client";

import { useApolloClient } from "@apollo/client/react";
import { useEffect, useState } from "react";
import type {
  ParentChildReportsQuery,
  ParentChildReportsQueryVariables,
  ParentChildSessionsQuery,
  ParentChildSessionsQueryVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  parentChildReportsQueryDocument,
  parentChildSessionsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { COUNT_PAGE_SIZE } from "@/frontend/views/dashboard/home/useDashboardStats.queries";

/** Per-child aggregate outcome — `undefined` running, `null` failed, number resolved. */
export interface ParentAggregateState {
  readonly reportsTotal: number | null | undefined;
  readonly sessionsTotal: number | null | undefined;
}

export const PARENT_AGGREGATE_FAILED: ParentAggregateState = { reportsTotal: null, sessionsTotal: null };
export const PARENT_AGGREGATE_RUNNING: ParentAggregateState = { reportsTotal: undefined, sessionsTotal: undefined };

/**
 * Parent per-child aggregate runner — one cancel-checked `client.query`
 * pair per linked child, summed once EVERY envelope has resolved.
 *
 * The effect keys on the STABLE joined id string (not the array identity)
 * so a fresh children array from a cache update does not re-trigger the
 * loop; a genuine membership change (new link granted, child severed)
 * produces a different key and re-runs it.
 *
 * The running/failed/reset transitions are DERIVED from the settled key,
 * not written synchronously inside the effect: an unknown family key reads
 * as running, so no setState ever fires before the first await (a
 * synchronous effect setState would cascade renders).
 */
export function useParentChildAggregates(childIds: readonly number[] | undefined): ParentAggregateState {
  const client = useApolloClient();
  const [settled, setSettled] = useState<Readonly<{ key: string; value: ParentAggregateState }> | null>(null);

  const childKey = childIds === undefined ? undefined : childIds.join(",");

  const aggregate: ParentAggregateState =
    childKey !== undefined && childKey.length === 0
      ? // A parent with zero linked children has honest zero aggregates —
        // no per-child network round-trip is needed to know that.
        { reportsTotal: 0, sessionsTotal: 0 }
      : settled !== null && settled.key === childKey
        ? settled.value
        : PARENT_AGGREGATE_RUNNING;

  useEffect(() => {
    if (childKey === undefined || childKey.length === 0) return;
    // Already settled for exactly this family — a re-fired effect (the
    // deps are stable in practice) must not re-run the per-child loop.
    if (settled !== null && settled.key === childKey) return;

    let cancelled = false;
    const ids = childKey.split(",").map(Number);

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
            if (!cancelled) setSettled({ key: childKey, value: PARENT_AGGREGATE_FAILED });
            return;
          }
          reports.push(reportsCount);
          sessions.push(sessionsCount);
        } catch {
          if (!cancelled) setSettled({ key: childKey, value: PARENT_AGGREGATE_FAILED });
          return;
        }
      }
      if (!cancelled) {
        setSettled({
          key: childKey,
          value: {
            reportsTotal: reports.reduce((sum, count) => sum + count, 0),
            sessionsTotal: sessions.reduce((sum, count) => sum + count, 0),
          },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [childKey, client, settled]);

  return aggregate;
}

/**
 * Optional-value resolver shared by every role branch — collapses the
 * Apollo result trio (loading / error / data) into the hook's
 * `undefined`-while-loading, `null`-on-error, value-when-ready contract.
 * Generic over the value type: numbers (counts) and strings (the wallet
 * balance, which passes through verbatim) resolve identically.
 */
export function resolveOptional<T>(loading: boolean, error: unknown, value: T | undefined): T | undefined | null {
  if (error) return null;
  if (loading || value === undefined) return undefined;
  return value;
}
