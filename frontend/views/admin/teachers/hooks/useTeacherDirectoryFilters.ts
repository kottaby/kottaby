"use client";

/**
 * useTeacherDirectoryFilters — the draft filter/search/pagination state of
 * the certified-teacher directory (composed by `useAdminTeachersDirectory`):
 * the approval/online/evaluator selects (string-literal unions later mapped
 * onto the backend's nullable Boolean filters), the search draft debounced
 * at 300ms, and the page/pageSize pair. Every filter setter resets the page
 * to the first page so a new result set is never opened on a stale page
 * index; the URL seed (parsed by the owner hook, active-tab-gated) plants
 * the initial values.
 */

import { useState } from "react";
import type { TeachersDirectoryUrlState } from "@/frontend/views/admin/directory-url-state";
import type {
  TeacherApprovalFilter,
  TeacherEvaluatorFilter,
  TeacherOnlineFilter,
} from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";

export function useTeacherDirectoryFilters(urlSeed: TeachersDirectoryUrlState | undefined) {
  const [approvalFilter, setApprovalFilterState] = useState<TeacherApprovalFilter | "">(urlSeed?.approval ?? "");
  const [onlineFilter, setOnlineFilterState] = useState<TeacherOnlineFilter | "">(urlSeed?.online ?? "");
  const [evaluatorFilter, setEvaluatorFilterState] = useState<TeacherEvaluatorFilter | "">(urlSeed?.evaluator ?? "");
  const [searchInput, setSearchInputState] = useState(urlSeed?.q ?? "");
  const [searchDebounced, setSearchDebounced] = useState(urlSeed?.q ?? "");
  const [page, setPage] = useState(urlSeed?.page ?? 0);
  const [pageSize, setPageSizeState] = useState<number>(urlSeed?.pageSize ?? 10);

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
  };
}
