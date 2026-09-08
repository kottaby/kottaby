"use client";

/**
 * useAdminTeachersDirectory — state and query wiring for
 * `AdminTeachersDirectoryPanel` (the certified-teacher directory tab of the
 * /teachers two-tab surface).
 *
 * Owns:
 *  - the filter/search/pagination draft state (search debounced at 300ms;
 *    the approval/online/evaluator selects map their string-literal unions
 *    onto the backend's nullable Boolean filters), each setter resetting the
 *    page to the first page so a new result set is never opened on a stale
 *    page index,
 *  - the read-only `adminTeachers` query (cache-and-network so refetches
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
import { useState } from "react";
import type {
  AdminTeacherFiltersInput,
  AdminTeachersExportQuery,
  AdminTeachersExportQueryVariables,
  AdminTeachersQueryVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import { adminTeachersExportQueryDocument, adminTeachersQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import {
  approvalFilterToBoolean,
  evaluatorFilterToBoolean,
  onlineFilterToBoolean,
  type TeacherApprovalFilter,
  type TeacherEvaluatorFilter,
  type TeacherOnlineFilter,
} from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import type { DirectorySnackbar, DirectorySnackbarSeverity } from "@/frontend/views/admin/users/directory";

const DEFAULT_PAGE_SIZE = 10;

export function useAdminTeachersDirectory() {
  const [approvalFilter, setApprovalFilterState] = useState<TeacherApprovalFilter | "">("");
  const [onlineFilter, setOnlineFilterState] = useState<TeacherOnlineFilter | "">("");
  const [evaluatorFilter, setEvaluatorFilterState] = useState<TeacherEvaluatorFilter | "">("");
  const [searchInput, setSearchInputState] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [exportLoading, setExportLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<DirectorySnackbar | null>(null);
  const client = useApolloClient();

  // Debounce search input (300ms) — the same render-time pattern the users
  // directory hook uses: a timeout is scheduled while the draft differs from
  // the applied value, and the applied value settles once typing pauses.
  if (searchInput !== searchDebounced) {
    setTimeout(() => setSearchDebounced(searchInput), 300);
  }

  // Every filter setter resets to the first page — a new result set starts
  // at page 1, never on a stale (possibly out-of-range) page index.
  const setApprovalFilter = (value: TeacherApprovalFilter | "") => {
    setApprovalFilterState(value);
    setPage(0);
  };
  const setOnlineFilter = (value: TeacherOnlineFilter | "") => {
    setOnlineFilterState(value);
    setPage(0);
  };
  const setEvaluatorFilter = (value: TeacherEvaluatorFilter | "") => {
    setEvaluatorFilterState(value);
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

  // Narrow the draft unions onto the backend's nullable Boolean filters —
  // an empty draft means "no filter", which is how the absent field is sent.
  // The SAME normalized shape feeds the listing AND the export-all query —
  // one filter-to-variables mapping, no drift between screen and file.
  const filters: AdminTeacherFiltersInput = {
    search: searchDebounced || null,
    approval: approvalFilter === "" ? null : approvalFilterToBoolean(approvalFilter),
    online: onlineFilter === "" ? null : onlineFilterToBoolean(onlineFilter),
    evaluator: evaluatorFilter === "" ? null : evaluatorFilterToBoolean(evaluatorFilter),
  };

  const variables: AdminTeachersQueryVariables = {
    filters,
    page: page + 1,
    pageSize,
  };

  const { data, previousData, loading, error, refetch } = useQuery(adminTeachersQueryDocument, {
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
  const exportAll = async (): Promise<AdminTeachersExportQuery["adminTeachersExport"] | null> => {
    setExportLoading(true);
    try {
      const result = await client.query({
        query: adminTeachersExportQueryDocument,
        variables: { filters } satisfies AdminTeachersExportQueryVariables,
        fetchPolicy: "network-only",
      });
      return result.data?.adminTeachersExport ?? null;
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
  const items = pageData?.adminTeachers.items ?? [];
  const total = pageData?.adminTeachers.total ?? 0;

  // The error alert must key on query failure itself, not on
  // `firstErrorCode`: a plain transport failure (raw `Error` with no
  // `extensions.code`) extracts to `null`, which would otherwise make the
  // error branch unreachable and let the empty state render instead.
  const hasError = Boolean(error);
  const firstErrorCode = error ? extractErrorCode(error) : null;
  const hasFilters = approvalFilter !== "" || onlineFilter !== "" || evaluatorFilter !== "" || searchDebounced !== "";

  // The shared feedback channel — copy-email reports on the success lane;
  // export feedback may report on the warning (truncated) / error lanes.
  const showSnackbar = (message: string, severity: DirectorySnackbarSeverity = "success") => {
    setSnackbar({ message, severity });
  };
  const clearSnackbar = () => {
    setSnackbar(null);
  };

  return {
    approvalFilter,
    setApprovalFilter,
    onlineFilter,
    setOnlineFilter,
    evaluatorFilter,
    setEvaluatorFilter,
    searchInput,
    setSearchInput,
    searchDebounced,
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
