"use client";

/**
 * useApplicantQueueFilters — the draft filter/search/pagination state of
 * the applicant queue (composed by `useAdminTeacherApplicants`): the status
 * select (draft union later mapped onto the backend's plain-string `status`
 * filter), the search draft debounced at 300ms, and the page/pageSize pair.
 * Every filter setter resets the page to the first page so a new result set
 * is never opened on a stale page index; the URL seed (parsed by the owner
 * hook, active-tab-gated) plants the initial values.
 */

import { useState } from "react";
import type { ApplicantsUrlState } from "@/frontend/views/admin/directory-url-state";
import type { ApplicantStatusFilter } from "@/frontend/views/admin/teachers/adminApplicants.helpers";

export function useApplicantQueueFilters(urlSeed: ApplicantsUrlState | undefined) {
  const [statusFilter, setStatusFilterState] = useState<ApplicantStatusFilter | "">(urlSeed?.status ?? "");
  const [searchInput, setSearchInputState] = useState(urlSeed?.q ?? "");
  const [searchDebounced, setSearchDebounced] = useState(urlSeed?.q ?? "");
  const [page, setPage] = useState(urlSeed?.page ?? 0);
  const [pageSize, setPageSizeState] = useState<number>(urlSeed?.pageSize ?? 10);

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
  };
}
