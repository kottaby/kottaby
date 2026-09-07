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
 *  - the copy-email success snackbar shared by the row identity cells.
 *
 * This directory is READ-ONLY — no mutations exist on this surface. The
 * hook returns plain state — no JSX. Errors surface through the same
 * `hasError` / `firstErrorCode` pair the users directory renders as an
 * alert with a retry action.
 */

import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import type { AdminTeachersQueryVariables } from "@/frontend/graphql/generated/gql/graphql";
import { adminTeachersQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import {
  approvalFilterToBoolean,
  evaluatorFilterToBoolean,
  onlineFilterToBoolean,
  type TeacherApprovalFilter,
  type TeacherEvaluatorFilter,
  type TeacherOnlineFilter,
} from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";

const DEFAULT_PAGE_SIZE = 10;

export function useAdminTeachersDirectory() {
  const [approvalFilter, setApprovalFilterState] = useState<TeacherApprovalFilter | "">("");
  const [onlineFilter, setOnlineFilterState] = useState<TeacherOnlineFilter | "">("");
  const [evaluatorFilter, setEvaluatorFilterState] = useState<TeacherEvaluatorFilter | "">("");
  const [searchInput, setSearchInputState] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
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
  const variables: AdminTeachersQueryVariables = {
    filters: {
      search: searchDebounced || null,
      approval: approvalFilter === "" ? null : approvalFilterToBoolean(approvalFilter),
      online: onlineFilter === "" ? null : onlineFilterToBoolean(onlineFilter),
      evaluator: evaluatorFilter === "" ? null : evaluatorFilterToBoolean(evaluatorFilter),
    },
    page: page + 1,
    pageSize,
  };

  const { data, previousData, loading, error, refetch } = useQuery(adminTeachersQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

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
