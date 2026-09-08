"use client";

/**
 * useAdminStudentsDirectory — state and query wiring for
 * `AdminStudentsDirectoryContainer` (the admin student directory surface).
 *
 * Owns:
 *  - the filter/search/pagination draft state (search debounced at 300ms;
 *    the has-parent select maps its string-literal union onto the backend's
 *    nullable Boolean filter; the language input is an EXACT-MATCH filter
 *    committed on Enter or through the Apply button so intermediate
 *    keystrokes never fire wasted queries), each setter resetting the page
 *    to the first page so a new result set is never opened on a stale page
 *    index,
 *  - the SHAREABLE-URL mirror of the APPLIED state: the query string seeds
 *    the initial state on mount (fail-closed parse — a stale or hand-edited
 *    link degrades to the defaults) and is written back through
 *    `router.replace` whenever the applied state settles, so a filtered
 *    view can be copied, bookmarked, or reloaded (directory-url-state.ts
 *    owns the pure contract),
 *  - the read-only `adminStudents` query (cache-and-network so refetches
 *    keep the current rows visible while the fresh page streams in),
 *  - the server-side EXPORT-ALL flow (`exportAll` — the dedicated export
 *    document executed with the SAME normalized filter state the listing
 *    uses; the backend caps the dump and reports `truncated` honestly),
 *  - the feedback snackbar shared by the copy-email quick action and the
 *    export flow (success / warning / error lanes).
 *
 * This directory is READ-ONLY — no mutations exist on this surface. The
 * hook returns plain state — no JSX. Errors surface through the same
 * `hasError` / `firstErrorCode` pair the users directory renders as an
 * alert with a retry action.
 */

import { useApolloClient, useQuery } from "@apollo/client/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AdminStudentFiltersInput,
  AdminStudentsExportQuery,
  AdminStudentsExportQueryVariables,
  AdminStudentsQueryVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import { adminStudentsExportQueryDocument, adminStudentsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { parseStudentsUrlState, serializeStudentsUrlState } from "@/frontend/views/admin/directory-url-state";
import {
  hasParentFilterToBoolean,
  type StudentHasParentFilter,
} from "@/frontend/views/admin/students/adminStudentsDirectory.helpers";
import type { DirectorySnackbar, DirectorySnackbarSeverity } from "@/frontend/views/admin/users/directory";

export function useAdminStudentsDirectory() {
  // ── Shareable-URL seeding (mount-once) ────────────────────────────────
  // The URL is the initial-state SOURCE for a shared/bookmarked link:
  // `?q=ali&parent=with&lang=Quran&page=2&size=25` opens the surface with
  // that exact view (the applied search seeds BOTH the draft and the
  // debounced value so the FIRST query is already filtered — no unfiltered
  // first fetch). Parsing is fail-closed (directory-url-state.ts); every
  // omitted key falls back to the same default the bare path renders. The
  // params object is read ONCE here — later URL changes do not re-seed
  // (the surface owns state; the URL is its mirror, not its driver).
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlSeed = parseStudentsUrlState(searchParams);

  const [hasParentFilter, setHasParentFilterState] = useState<StudentHasParentFilter | "">(urlSeed.parent);
  const [searchInput, setSearchInputState] = useState(urlSeed.q);
  const [searchDebounced, setSearchDebounced] = useState(urlSeed.q);
  // The language filter is an exact-match backend predicate, so the draft is
  // held locally and committed on Enter / Apply — never per keystroke.
  const [languageDraft, setLanguageDraft] = useState(urlSeed.lang);
  const [languageFilter, setLanguageFilterState] = useState(urlSeed.lang);
  const [page, setPage] = useState(urlSeed.page);
  const [pageSize, setPageSizeState] = useState<number>(urlSeed.pageSize);
  const [exportLoading, setExportLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<DirectorySnackbar | null>(null);
  const client = useApolloClient();

  // Debounce search input (300ms) — the same render-time pattern the users
  // directory hook uses: a timeout is scheduled while the draft differs from
  // the applied value, and the applied value settles once typing pauses.
  if (searchInput !== searchDebounced) {
    setTimeout(() => setSearchDebounced(searchInput), 300);
  }

  // ── Shareable-URL write-back (the URL mirrors the APPLIED state) ──────
  // The APPLIED (post-debounce) state — never the raw draft — serializes
  // into the query string through `router.replace` (no history entry per
  // keystroke; back/forward navigate BETWEEN surfaces, not between filter
  // states). Defaults are OMITTED (a clean surface shares as the bare
  // path), the write is skipped when the URL already matches (no replace
  // churn on unrelated re-renders), and `{ scroll: false }` keeps the
  // viewport anchored while typing or paging.
  const appliedQuery = serializeStudentsUrlState({
    q: searchDebounced,
    parent: hasParentFilter,
    lang: languageFilter,
    page,
    pageSize,
  });
  useEffect(() => {
    if (searchParams.toString() !== appliedQuery) {
      router.replace(appliedQuery === "" ? pathname : `${pathname}?${appliedQuery}`, { scroll: false });
    }
    // `searchParams` (the object — eslint exhaustive-deps) and
    // `searchParams.toString` (the member chain — biome's tracked shape, a
    // fresh function reference per params object) both stay dependencies:
    // after the replace the guard re-reads the NEW url, sees it already
    // mirrors the applied state, and skips — one extra effect pass, zero
    // replace churn.
  }, [appliedQuery, router, pathname, searchParams, searchParams.toString]);

  // Every filter setter resets to the first page — a new result set starts
  // at page 1, never on a stale (possibly out-of-range) page index.
  const setHasParentFilter = (value: StudentHasParentFilter | "") => {
    setHasParentFilterState(value);
    setPage(0);
  };
  const setSearchInput = (value: string) => {
    setSearchInputState(value);
    setPage(0);
  };
  const setPageSize = (value: number) => {
    setPageSizeState(value);
    setPage(0);
  };

  const applyLanguageFilter = () => {
    const trimmed = languageDraft.trim();
    if (trimmed === languageFilter) {
      return;
    }
    setLanguageFilterState(trimmed);
    setPage(0);
  };

  // Reset both halves of the language filter atomically (the clear action
  // must not depend on the render-closure's stale draft value).
  const clearLanguageFilter = () => {
    setLanguageDraft("");
    setLanguageFilterState("");
    setPage(0);
  };

  // The SAME normalized shape feeds the listing AND the export-all query —
  // one filter-to-variables mapping, no drift between screen and file.
  const filters: AdminStudentFiltersInput = {
    search: searchDebounced || null,
    hasParent: hasParentFilter === "" ? null : hasParentFilterToBoolean(hasParentFilter),
    language: languageFilter || null,
  };

  const variables: AdminStudentsQueryVariables = {
    filters,
    page: page + 1,
    pageSize,
  };

  const { data, previousData, loading, error, refetch } = useQuery(adminStudentsQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  /**
   * Export-all: executes the DEDICATED export document with the current
   * filter state (NO page/pageSize — the backend caps the dump at its own
   * EXPORT_MAX_ROWS and reports `truncated`). `useLazyQuery` is banned in
   * this repo, so the one-shot query runs through the Apollo client
   * directly. Resolves `null` on failure — the caller owns the error
   * feedback through the shared snackbar.
   */
  const exportAll = async (): Promise<AdminStudentsExportQuery["adminStudentsExport"] | null> => {
    setExportLoading(true);
    try {
      const result = await client.query({
        query: adminStudentsExportQueryDocument,
        variables: { filters } satisfies AdminStudentsExportQueryVariables,
        fetchPolicy: "network-only",
      });
      return result.data?.adminStudentsExport ?? null;
    } catch {
      return null;
    } finally {
      setExportLoading(false);
    }
  };

  // `errorPolicy: "none"` (the default) drops `data` to undefined when a
  // refetch fails; `previousData` keeps the last good page visible instead
  // of flashing the empty state next to the error alert.
  const pageData = data ?? previousData;
  const items = pageData?.adminStudents.items ?? [];
  const total = pageData?.adminStudents.total ?? 0;

  // The error alert must key on query failure itself, not on
  // `firstErrorCode`: a plain transport failure (raw `Error` with no
  // `extensions.code`) extracts to `null`, which would otherwise make the
  // error branch unreachable and let the empty state render instead.
  const hasError = Boolean(error);
  const firstErrorCode = error ? extractErrorCode(error) : null;
  const hasFilters = hasParentFilter !== "" || searchDebounced !== "" || languageFilter !== "";
  // The language draft differs from the applied value (shows the Apply action).
  const languageDirty = languageDraft.trim() !== languageFilter;

  // The shared feedback channel — copy-email reports on the success lane;
  // export feedback may report on the warning (truncated) / error lanes.
  const showSnackbar = (message: string, severity: DirectorySnackbarSeverity = "success") => {
    setSnackbar({ message, severity });
  };
  const clearSnackbar = () => {
    setSnackbar(null);
  };

  return {
    hasParentFilter,
    setHasParentFilter,
    searchInput,
    setSearchInput,
    searchDebounced,
    languageDraft,
    setLanguageDraft,
    applyLanguageFilter,
    clearLanguageFilter,
    languageDirty,
    page,
    setPage,
    pageSize,
    setPageSize,
    exportLoading,
    exportAll,
    snackbar,
    showSnackbar,
    clearSnackbar,
    items,
    total,
    loading,
    hasError,
    firstErrorCode,
    refetch,
    hasFilters,
  };
}
