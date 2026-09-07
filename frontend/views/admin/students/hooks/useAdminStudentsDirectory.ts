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
 *  - the read-only `adminStudents` query (cache-and-network so refetches
 *    keep the current rows visible while the fresh page streams in),
 *  - the copy-email success snackbar shared by the row identity cells.
 *
 * This directory is READ-ONLY — no mutations exist on this surface. The
 * hook returns plain state — no JSX. Errors surface through the same
 * `hasError` / `firstErrorCode` pair the users directory renders as an
 * alert with a retry action.
 */

import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import type { AdminStudentsQueryVariables } from "@/frontend/graphql/generated/gql/graphql";
import { adminStudentsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import {
  hasParentFilterToBoolean,
  type StudentHasParentFilter,
} from "@/frontend/views/admin/students/adminStudentsDirectory.helpers";

const DEFAULT_PAGE_SIZE = 10;

export function useAdminStudentsDirectory() {
  const [hasParentFilter, setHasParentFilterState] = useState<StudentHasParentFilter | "">("");
  const [searchInput, setSearchInputState] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  // The language filter is an exact-match backend predicate, so the draft is
  // held locally and committed on Enter / Apply — never per keystroke.
  const [languageDraft, setLanguageDraft] = useState("");
  const [languageFilter, setLanguageFilterState] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Debounce search input (300ms) — the same render-time pattern the users
  // directory hook uses: a timeout is scheduled while the draft differs from
  // the applied value, and the applied value settles once typing pauses.
  if (searchInput !== searchDebounced) {
    setTimeout(() => setSearchDebounced(searchInput), 300);
  }

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

  const variables: AdminStudentsQueryVariables = {
    filters: {
      search: searchDebounced || null,
      hasParent: hasParentFilter === "" ? null : hasParentFilterToBoolean(hasParentFilter),
      language: languageFilter || null,
    },
    page: page + 1,
    pageSize,
  };

  const { data, previousData, loading, error, refetch } = useQuery(adminStudentsQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

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
    snackbarMessage,
    setSnackbarMessage,
    items,
    total,
    loading,
    hasError,
    firstErrorCode,
    refetch,
    hasFilters,
  };
}
