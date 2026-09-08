"use client";

/**
 * useAdminTeacherApplicants — state and query wiring for the /teachers
 * applicant queue (the `AdminApplicantsPanel` tab surface).
 *
 * Mirrors `useAdminTeachersDirectory` exactly:
 *  - the filter/search/pagination draft state (composed from
 *    `useApplicantQueueFilters`; search debounced at 300ms; the status
 *    select maps its draft union onto the backend's plain-string `status`
 *    filter — the four canonical wire values pass verbatim),
 *  - the read-only `adminTeacherApplicants` query (cache-and-network so
 *    refetches keep the current rows visible while the fresh page streams
 *    in),
 *  - the server-side EXPORT-ALL flow (`exportAll` — the dedicated export
 *    document executed with the SAME normalized filter state the queue
 *    uses; the backend caps the dump and reports `truncated` honestly),
 *  - error code extraction for the shared error-alert recipe + the
 *    feedback snackbar shared by the copy-email quick action and the export
 *    flow (success / warning / error lanes — `useDirectorySnackbar`).
 *
 * This queue is READ-ONLY — no mutations exist on this surface; the only
 * per-row action deep-links to the admin user-detail page, where
 * certification and governance actions live. The hook returns plain state
 * — no JSX.
 *
 * Layout: the draft-state and snackbar blocks are composed hooks in this
 * `hooks/` folder; this entry owns the seeding, query, export flow, and the
 * public return shape.
 */

import { useApolloClient, useQuery } from "@apollo/client/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type {
  AdminApplicantFiltersInput,
  AdminTeacherApplicantsExportQuery,
  AdminTeacherApplicantsExportQueryVariables,
  AdminTeacherApplicantsQueryVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminTeacherApplicantsExportQueryDocument,
  adminTeacherApplicantsQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { parseApplicantsUrlState, parseTeachersUrlTab } from "@/frontend/views/admin/directory-url-state";
import { useApplicantQueueFilters } from "@/frontend/views/admin/teachers/hooks/useApplicantQueueFilters";
import { useDirectorySnackbar } from "@/frontend/views/admin/teachers/hooks/useDirectorySnackbar";

export function useAdminTeacherApplicants() {
  // ── Shareable-URL seeding (mount-once, ACTIVE-TAB-GATED) ────────────
  // Mirror of the directory hook's contract: seeds from the URL ONLY when
  // the link's `tab` key names THIS tab — a shared `?tab=applicants&q=demo`
  // opens the queue pre-filtered, and the hidden directory stays pristine.
  // The surface owns the write side.
  const searchParams = useSearchParams();
  const urlSeed =
    parseTeachersUrlTab(searchParams) === "applicants" ? parseApplicantsUrlState(searchParams) : undefined;

  const draft = useApplicantQueueFilters(urlSeed);
  const { snackbar, showSnackbar, clearSnackbar } = useDirectorySnackbar();
  const [exportLoading, setExportLoading] = useState(false);
  const client = useApolloClient();

  // Narrow the draft union onto the backend's plain-string status filter —
  // an empty draft means "no filter", which is how the absent field is
  // sent. The four canonical wire values pass verbatim (the backend
  // validates them fail-closed). The SAME normalized shape feeds the queue
  // AND the export-all query — one filter-to-variables mapping, no drift
  // between screen and file.
  const filters: AdminApplicantFiltersInput = {
    search: draft.searchDebounced || null,
    status: draft.statusFilter === "" ? null : draft.statusFilter,
  };

  const variables: AdminTeacherApplicantsQueryVariables = {
    filters,
    page: draft.page + 1,
    pageSize: draft.pageSize,
  };

  const { data, previousData, loading, error, refetch } = useQuery(adminTeacherApplicantsQueryDocument, {
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
  const exportAll = async (): Promise<AdminTeacherApplicantsExportQuery["adminTeacherApplicantsExport"] | null> => {
    setExportLoading(true);
    try {
      const result = await client.query({
        query: adminTeacherApplicantsExportQueryDocument,
        variables: { filters } satisfies AdminTeacherApplicantsExportQueryVariables,
        fetchPolicy: "network-only",
      });
      return result.data?.adminTeacherApplicantsExport ?? null;
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
  const hasFilters = draft.statusFilter !== "" || draft.searchDebounced !== "";

  return {
    ...draft,
    exportLoading,
    exportAll,
    snackbar,
    showSnackbar,
    clearSnackbar,
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
