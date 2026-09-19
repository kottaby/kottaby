"use client";

import type { TypedDocumentNode } from "@apollo/client";
/**
 * `useAllPagedPages` — the canonical fetch-all-pages composition for paged
 * GraphQL reads whose consumers render SUMMARY surfaces (count lines,
 * summary strips, filterable lists, print/export bundles) over a WHOLE
 * history.
 *
 * The backend page wrappers clamp to `pageSize <= 50` (default 25). A
 * consumer that reads only page 1 would silently truncate: counts,
 * summaries and filter results would all omit rows beyond the first page.
 * This hook keeps the SAME `useQuery` surface the consumers already use
 * and transparently chains `fetchMore` (one request per page, driven by
 * the envelope's own `page` / `pageSize` / `totalCount`) until every page
 * is in the cache, merging items through the caller's `mergePages`
 * adapter.
 *
 * Convergence + duplicate safety: the `updateQuery` refuses a fetched
 * envelope whose `page` is not strictly newer than the cached one, so a
 * double-fired `fetchMore` for the same page cannot duplicate rows (React
 * strict-mode double-effects included). The effect re-fires per cache
 * update and stops as soon as the accumulated item count reaches
 * `totalCount`. A fixture whose `totalCount === items.length` never fires
 * a single extra request.
 *
 * Variables are adapter-owned: the caller passes its natural variables
 * object plus a `buildPageVariables` builder that derives the NEXT page's
 * variables from them. The chain itself never assumes a variable shape —
 * a `{ studentId }` read and a zero-identity `myHomework` read share this
 * one implementation verbatim (the duplication-elimination discipline:
 * jscpd threshold 0).
 *
 * Per repo convention the Apollo surface is NOT re-wrapped: the hook
 * returns the `useQuery` result object as-is, so consumers keep
 * destructuring `{ data, loading, error, refetch }` (with
 * `notifyOnNetworkStatusChange` folding the fetch-more rounds into
 * `loading`).
 */
import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";

/** The paged-envelope subset the chain navigates by. */
interface PagedEnvelopeView {
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly itemCount: number;
}

/** The `useQuery` result surface the consumers receive (pass-through). */
type PagedQueryResult<TResult extends object, TVariables extends object> = Pick<
  ReturnType<typeof useQuery<TResult, TVariables>>,
  "data" | "loading" | "error" | "refetch"
>;

export function useAllPagedPages<TResult extends object, TVariables extends object>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables,
  /** Derives the NEXT page's variables from the caller's natural ones. */
  buildPageVariables: (variables: TVariables, page: number, pageSize: number) => TVariables,
  selectPage: (data: TResult | undefined) => PagedEnvelopeView | null | undefined,
  mergePages: (prev: TResult, next: TResult) => TResult
): PagedQueryResult<TResult, TVariables> {
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
      variables: buildPageVariables(variables, page.page + 1, page.pageSize),
      updateQuery: (prev, { fetchMoreResult }) => {
        if (fetchMoreResult === undefined) {
          return prev;
        }
        const prevPage = selectPage(prev);
        const nextPage = selectPage(fetchMoreResult);
        if (!prevPage || !nextPage || nextPage.page <= prevPage.page) {
          return prev;
        }
        return mergePages(prev, fetchMoreResult);
      },
    });
  }, [data, selectPage, mergePages, fetchMore, buildPageVariables, variables]);

  return { data, loading, error, refetch };
}
