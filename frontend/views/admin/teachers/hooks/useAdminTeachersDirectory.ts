"use client";

/**
 * useAdminTeachersDirectory — state and query wiring for
 * `AdminTeachersDirectoryPanel` (the certified-teacher directory tab of the
 * /teachers two-tab surface).
 *
 * Owns:
 *  - the filter/search/pagination draft state (composed from
 *    `useTeacherDirectoryFilters`; search debounced at 300ms; the
 *    approval/online/evaluator selects map their string-literal unions onto
 *    the backend's nullable Boolean filters),
 *  - the read-only `adminTeachers` query (cache-and-network so refetches
 *    keep the current rows visible while the fresh page streams in),
 *  - the server-side EXPORT-ALL flow (`exportAll` — the dedicated export
 *    document executed with the SAME normalized filter state the listing
 *    uses; the backend caps the dump and reports `truncated` honestly),
 *  - the feedback snackbar shared by the copy-email quick action and the
 *    export flow (success / warning / error lanes — `useDirectorySnackbar`).
 *
 * This directory is READ-ONLY — no mutations exist on this surface. The
 * hook returns plain state — no JSX. Errors surface through the same
 * `hasError` / `firstErrorCode` pair the users directory renders as an
 * alert with a retry action.
 *
 * Layout: the draft-state and snackbar blocks are composed hooks in this
 * `hooks/` folder; this entry owns the seeding, query, export flow, and the
 * public return shape.
 */

import { useApolloClient, useQuery } from "@apollo/client/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type {
  AdminTeacherFiltersInput,
  AdminTeachersExportQuery,
  AdminTeachersExportQueryVariables,
  AdminTeachersQueryVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import { adminTeachersExportQueryDocument, adminTeachersQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { parseTeachersDirectoryUrlState, parseTeachersUrlTab } from "@/frontend/views/admin/directory-url-state";
import {
  approvalFilterToBoolean,
  evaluatorFilterToBoolean,
  onlineFilterToBoolean,
} from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import { useDirectorySnackbar } from "@/frontend/views/admin/teachers/hooks/useDirectorySnackbar";
import { useTeacherDirectoryFilters } from "@/frontend/views/admin/teachers/hooks/useTeacherDirectoryFilters";

export function useAdminTeachersDirectory() {
  // ── Shareable-URL seeding (mount-once, ACTIVE-TAB-GATED) ────────────
  // The surface's write effect mirrors ONLY the active tab's view into the
  // URL, so this hook seeds from the URL ONLY when the URL's `tab` key
  // names THIS tab (default) — a link to `?tab=applicants&q=demo` must not
  // plant `demo` in the hidden directory's search box. The surface owns
  // the write side; this hook only consumes the shared link on mount.
  const searchParams = useSearchParams();
  const activeTabAtMount = parseTeachersUrlTab(searchParams);
  const urlSeed = activeTabAtMount === "teachers" ? parseTeachersDirectoryUrlState(searchParams) : undefined;

  const draft = useTeacherDirectoryFilters(urlSeed);
  const { snackbar, showSnackbar, clearSnackbar } = useDirectorySnackbar();
  const [exportLoading, setExportLoading] = useState(false);
  const client = useApolloClient();

  // Narrow the draft unions onto the backend's nullable Boolean filters —
  // an empty draft means "no filter", which is how the absent field is sent.
  // The SAME normalized shape feeds the listing AND the export-all query —
  // one filter-to-variables mapping, no drift between screen and file.
  const filters: AdminTeacherFiltersInput = {
    search: draft.searchDebounced || null,
    approval: draft.approvalFilter === "" ? null : approvalFilterToBoolean(draft.approvalFilter),
    online: draft.onlineFilter === "" ? null : onlineFilterToBoolean(draft.onlineFilter),
    evaluator: draft.evaluatorFilter === "" ? null : evaluatorFilterToBoolean(draft.evaluatorFilter),
  };

  const variables: AdminTeachersQueryVariables = {
    filters,
    page: draft.page + 1,
    pageSize: draft.pageSize,
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
  const hasFilters =
    draft.approvalFilter !== "" ||
    draft.onlineFilter !== "" ||
    draft.evaluatorFilter !== "" ||
    draft.searchDebounced !== "";

  return {
    ...draft,
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
