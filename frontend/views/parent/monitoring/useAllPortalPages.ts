"use client";

/**
 * `useAllPortalPages` — fetch-all-pages composition for the parent
 * monitoring portal's paged reads.
 *
 * The portal tabs render SUMMARY surfaces (count + summary cards +
 * calendar + list) over a child's whole history, but the backend page
 * wrappers clamp to `pageSize <= 50` (default 25). A tab that consumes
 * only page 1 would silently truncate: counts, summaries, calendars,
 * filter results and the print/export bundle would all omit rows beyond
 * the first page. This hook keeps the SAME `useQuery` surface the tabs
 * already consume and transparently chains `fetchMore` (one request per
 * page, driven by the envelope's own `page` / `pageSize` / `totalCount`)
 * until every page is in the cache, merging items through the
 * per-document adapters below.
 *
 * Convergence + duplicate safety: each `updateQuery` refuses a fetched
 * envelope whose `page` is not strictly newer than the cached one, so a
 * double-fired `fetchMore` for the same page cannot duplicate rows
 * (React strict-mode double-effects included). The effect re-fires per
 * cache update and stops as soon as the accumulated item count reaches
 * `totalCount`. A document whose fixture sets
 * `totalCount === items.length` (the test-mock shape) never fires a
 * single extra request.
 *
 * Per repo convention the Apollo surface is NOT re-wrapped: the hook
 * returns the `useQuery` result object as-is, so tabs keep destructuring
 * `{ data, loading, error, refetch }` (with `notifyOnNetworkStatusChange`
 * folding the fetch-more rounds into `loading`).
 */
import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";
import type {
  ParentChildHomeworkQuery,
  ParentChildReportsQuery,
  ParentChildSessionsQuery,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  parentChildHomeworkQueryDocument,
  parentChildReportsQueryDocument,
  parentChildSessionsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";

/** The paged-envelope subset shared by every portal page wrapper. */
interface PortalPageEnvelope {
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly itemCount: number;
}

/** The `useQuery` result surface the portal tabs consume (pass-through). */
type PortalQueryResult<TResult extends object> = Pick<
  ReturnType<typeof useQuery<TResult>>,
  "data" | "loading" | "error" | "refetch"
>;

type PortalQueryVariables = { studentId: number; page?: number | null; pageSize?: number | null };

/**
 * Chains fetch-more rounds until every page of the portal envelope is
 * cached. `selectPage` projects the typed query result onto the shared
 * envelope view; `mergePage` re-builds the typed result with the two
 * pages' items concatenated (each adapter owns its exact types — no
 * casts anywhere).
 */
function useAllPortalPages<TResult extends object>(
  document: Parameters<typeof useQuery<TResult>>[0],
  variables: PortalQueryVariables,
  selectPage: (data: TResult | undefined) => PortalPageEnvelope | null | undefined,
  mergePage: (prev: TResult, next: TResult) => TResult
): PortalQueryResult<TResult> {
  const { data, loading, error, refetch, fetchMore } = useQuery(document, {
    variables,
    notifyOnNetworkStatusChange: true,
  });

  useEffect(() => {
    const page = selectPage(data);
    if (!page) {
      return;
    }
    if (page.itemCount >= page.totalCount) {
      return;
    }
    void fetchMore({
      variables: { ...variables, page: page.page + 1, pageSize: page.pageSize },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (fetchMoreResult === undefined) {
          return prev;
        }
        const prevPage = selectPage(prev);
        const nextPage = selectPage(fetchMoreResult);
        if (!prevPage || !nextPage || nextPage.page <= prevPage.page) {
          return prev;
        }
        return mergePage(prev, fetchMoreResult);
      },
    });
  }, [data, selectPage, mergePage, fetchMore, variables]);

  return { data, loading, error, refetch };
}

// ─── Per-document adapters ─────────────────────────────────────────────────
//
// Each adapter owns the typed projection + merge for ONE portal document
// (module scope = stable identity, so the fetch-more effect sees stable
// deps). Tab call sites stay one-liners.

function selectSessionsPage(data: ParentChildSessionsQuery | undefined) {
  const page = data?.parentChildSessions;
  return page
    ? { page: page.page, pageSize: page.pageSize, totalCount: page.totalCount, itemCount: page.items.length }
    : null;
}

function mergeSessionsPages(prev: ParentChildSessionsQuery, next: ParentChildSessionsQuery): ParentChildSessionsQuery {
  const prevPage = prev.parentChildSessions;
  const nextPage = next.parentChildSessions;
  if (!prevPage || !nextPage) {
    return next;
  }
  return { ...next, parentChildSessions: { ...nextPage, items: [...prevPage.items, ...nextPage.items] } };
}

/** Attendance tab — accumulates every `parentChildSessions` page. */
export function useAllAttendancePages(studentId: number): PortalQueryResult<ParentChildSessionsQuery> {
  return useAllPortalPages(
    parentChildSessionsQueryDocument,
    { studentId, page: undefined, pageSize: undefined },
    selectSessionsPage,
    mergeSessionsPages
  );
}

function selectReportsPage(data: ParentChildReportsQuery | undefined) {
  const page = data?.parentChildReports;
  return page
    ? { page: page.page, pageSize: page.pageSize, totalCount: page.totalCount, itemCount: page.items.length }
    : null;
}

function mergeReportsPages(prev: ParentChildReportsQuery, next: ParentChildReportsQuery): ParentChildReportsQuery {
  const prevPage = prev.parentChildReports;
  const nextPage = next.parentChildReports;
  if (!prevPage || !nextPage) {
    return next;
  }
  return { ...next, parentChildReports: { ...nextPage, items: [...prevPage.items, ...nextPage.items] } };
}

/** Evaluations + Reports tabs — accumulates every `parentChildReports` page. */
export function useAllReportPages(studentId: number): PortalQueryResult<ParentChildReportsQuery> {
  return useAllPortalPages(
    parentChildReportsQueryDocument,
    { studentId, page: undefined, pageSize: undefined },
    selectReportsPage,
    mergeReportsPages
  );
}

function selectHomeworkPage(data: ParentChildHomeworkQuery | undefined) {
  const page = data?.parentChildHomework;
  return page
    ? { page: page.page, pageSize: page.pageSize, totalCount: page.totalCount, itemCount: page.items.length }
    : null;
}

function mergeHomeworkPages(prev: ParentChildHomeworkQuery, next: ParentChildHomeworkQuery): ParentChildHomeworkQuery {
  const prevPage = prev.parentChildHomework;
  const nextPage = next.parentChildHomework;
  if (!prevPage || !nextPage) {
    return next;
  }
  return { ...next, parentChildHomework: { ...nextPage, items: [...prevPage.items, ...nextPage.items] } };
}

/** Homework tab — accumulates every `parentChildHomework` page. */
export function useAllHomeworkPages(studentId: number): PortalQueryResult<ParentChildHomeworkQuery> {
  return useAllPortalPages(
    parentChildHomeworkQueryDocument,
    { studentId, page: undefined, pageSize: undefined },
    selectHomeworkPage,
    mergeHomeworkPages
  );
}
