"use client";

/**
 * useAdminTeacherApplicants — state and query wiring for the /teachers
 * applicant queue (the `AdminApplicantsPanel` tab surface).
 *
 * Mirrors `useAdminTeachersDirectory` exactly:
 *  - the filter/search/pagination draft state (search debounced at 300ms;
 *    the status select maps its draft union onto the backend's plain-string
 *    `status` filter — the four canonical wire values pass verbatim), each
 *    setter resetting the page to the first page so a new result set is
 *    never opened on a stale page index,
 *  - the read-only `adminTeacherApplicants` query (cache-and-network so
 *    refetches keep the current rows visible while the fresh page streams
 *    in),
 *  - error code extraction for the shared error-alert recipe.
 *
 * This queue is READ-ONLY — no mutations exist on this surface; the only
 * per-row action deep-links to the admin user-detail page, where
 * certification and governance actions live. The hook returns plain state
 * — no JSX.
 */

import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import type { AdminTeacherApplicantsQueryVariables } from "@/frontend/graphql/generated/gql/graphql";
import { adminTeacherApplicantsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import type { ApplicantStatusFilter } from "@/frontend/views/admin/teachers/adminApplicants.helpers";

const DEFAULT_PAGE_SIZE = 10;

export function useAdminTeacherApplicants() {
  const [statusFilter, setStatusFilterState] = useState<ApplicantStatusFilter | "">("");
  const [searchInput, setSearchInputState] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Debounce search input (300ms) — the same render-time pattern the
  // directory hook uses: a timeout is scheduled while the draft differs
  // from the applied value, and the applied value settles once typing
  // pauses.
  if (searchInput !== searchDebounced) {
    setTimeout(() => setSearchDebounced(searchInput), 300);
  }

  // Every filter setter resets to the first page — a new result set starts
  // at page 1, never on a stale (possibly out-of-range) page index.
  const setStatusFilter = (value: ApplicantStatusFilter | "") => {
    setStatusFilterState(value);
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

  // Narrow the draft union onto the backend's plain-string status filter —
  // an empty draft means "no filter", which is how the absent field is
  // sent. The four canonical wire values pass verbatim (the backend
  // validates them fail-closed).
  const variables: AdminTeacherApplicantsQueryVariables = {
    filters: {
      search: searchDebounced || null,
      status: statusFilter === "" ? null : statusFilter,
    },
    page: page + 1,
    pageSize,
  };

  const { data, previousData, loading, error, refetch } = useQuery(adminTeacherApplicantsQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  // `errorPolicy: "none"` (the default) drops `data` to undefined when a
  // refetch fails; `previousData` keeps the last good page visible instead
  // of flashing the empty state next to the error alert.
  const pageData = data ?? previousData;
  const items = pageData?.adminTeacherApplicants.items ?? [];
  const total = pageData?.adminTeacherApplicants.total ?? 0;
  // Search-aware per-status aggregate for the quick-filter chips — always
  // describes the whole pipeline matching the current search term,
  // independent of the active status filter. `null` while unresolved (the
  // chips render count-less rather than guessing zeros).
  const statusCounts = pageData?.adminTeacherApplicants.statusCounts ?? null;

  // The error alert must key on query failure itself, not on
  // `firstErrorCode`: a plain transport failure (raw `Error` with no
  // `extensions.code`) extracts to `null`, which would otherwise make the
  // error branch unreachable and let the empty state render instead.
  const hasError = Boolean(error);
  const firstErrorCode = error ? extractErrorCode(error) : null;
  const hasFilters = statusFilter !== "" || searchDebounced !== "";

  return {
    statusFilter,
    setStatusFilter,
    searchInput,
    setSearchInput,
    searchDebounced,
    page,
    setPage,
    pageSize,
    setPageSize,
    snackbarMessage,
    setSnackbarMessage,
    items,
    total,
    statusCounts,
    loading,
    hasError,
    firstErrorCode,
    refetch,
    hasFilters,
  };
}
