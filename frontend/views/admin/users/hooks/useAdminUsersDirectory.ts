"use client";

/**
 * useAdminUsersDirectory — state, query, and mutation wiring for
 * `AdminUsersDirectoryContainer` (the admin user directory surface).
 *
 * Owns:
 *  - the filter/search/pagination draft state (search debounced at 300ms),
 *  - the `adminUsers` query (variables narrowed from the local filter unions
 *    to the GraphQL enums via `directoryConversions` — no `as` cast),
 *  - the create / update / soft-delete mutations, each refetching the
 *    current page via `refetchQueries` so the list stays honest without a
 *    manual reload,
 *  - the dialog targets (create / edit / delete) and the success snackbar.
 *
 * Presentation stays in `AdminUsersDirectoryContainer` and its siblings; this
 * module returns plain state — no JSX.
 */

import { useMutation, useQuery } from "@apollo/client/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { AdminUsersQueryVariables } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminCreateUserMutationDocument,
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUsersQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { parseUsersUrlState, serializeUsersUrlState } from "@/frontend/views/admin/directory-url-state";
import { useDirectoryPageAndDialogs } from "@/frontend/views/admin/users/hooks/useDirectoryPageAndDialogs";
import { useUsersUrlSync } from "@/frontend/views/admin/users/hooks/useUsersUrlSync";
import {
  type DirectoryGovernance,
  type DirectoryRole,
  toGovernanceFilter,
  toUserRole,
} from "@/frontend/views/admin/users/utils";

type Role = DirectoryRole;
type Governance = DirectoryGovernance;

/**
 * Role / governance / country / search filter draft state (search debounced
 * at 300ms). Every value seeds from the URL contract (`/users` shareable
 * link); the applied search seeds BOTH the draft and the debounced value so
 * the FIRST query is already filtered — no unfiltered first fetch.
 */
function useDirectoryFilters() {
  const urlSeed = parseUsersUrlState(useSearchParams());
  const [roleFilter, setRoleFilter] = useState<Role | "">(urlSeed.role);
  const [governanceFilter, setGovernanceFilter] = useState<Governance | "">(urlSeed.governance);
  const [countryFilter, setCountryFilter] = useState(urlSeed.country);
  const [searchInput, setSearchInput] = useState(urlSeed.q);
  const [searchDebounced, setSearchDebounced] = useState(urlSeed.q);

  // Debounce search input (300ms).
  if (searchInput !== searchDebounced) {
    setTimeout(() => setSearchDebounced(searchInput), 300);
  }

  return {
    roleFilter,
    setRoleFilter,
    governanceFilter,
    setGovernanceFilter,
    countryFilter,
    setCountryFilter,
    searchInput,
    setSearchInput,
    searchDebounced,
  };
}

/** The three directory write mutations, all refetching the current page after success. */
function useDirectoryMutations(variables: AdminUsersQueryVariables) {
  // Every completed write re-fetches the directory page so the list stays
  // honest without a manual reload.
  const refetchAfterWrite = [{ query: adminUsersQueryDocument, variables }];

  const [createUser, { loading: createLoading }] = useMutation(adminCreateUserMutationDocument, {
    refetchQueries: refetchAfterWrite,
    awaitRefetchQueries: true,
  });
  const [updateUser, { loading: updateLoading }] = useMutation(adminUpdateUserMutationDocument, {
    refetchQueries: refetchAfterWrite,
    awaitRefetchQueries: true,
  });
  const [setDeleted, { loading: deleteLoading }] = useMutation(adminSetUserDeletedMutationDocument, {
    refetchQueries: refetchAfterWrite,
    awaitRefetchQueries: true,
  });

  return { createUser, createLoading, updateUser, updateLoading, setDeleted, deleteLoading };
}

export function useAdminUsersDirectory() {
  const filters = useDirectoryFilters();
  const { roleFilter, governanceFilter, countryFilter, searchDebounced } = filters;
  // The URL is read ONCE for pagination seeding (same params ref the filters
  // hook read — `parseUsersUrlState` is pure so re-parsing is free).
  const urlSeed = parseUsersUrlState(useSearchParams());
  const pageAndDialogs = useDirectoryPageAndDialogs(urlSeed.page, urlSeed.pageSize);
  const { page, pageSize } = pageAndDialogs;

  // Every filter setter resets to the first page — a new result set starts
  // at page 1, never on a stale (possibly out-of-range) page index (the
  // same invariant the students directory hook documents; the raw setters
  // stay available for the URL-seeded initial state, which must NOT reset).

  const variables: AdminUsersQueryVariables = {
    filters: {
      // Narrow the local `Role` / `Governance` string-literal unions to the
      // GraphQL-codegen `UserRole` / `AdminUserGovernanceFilter` enums via
      // the runtime-validated `toUserRole` / `toGovernanceFilter` helpers
      // (no `as unknown as ...` cast).
      role: roleFilter ? toUserRole(roleFilter) : null,
      governance: governanceFilter ? toGovernanceFilter(governanceFilter) : null,
      country: countryFilter || null,
      search: searchDebounced || null,
    },
    page: page + 1,
    pageSize,
  };

  const { data, previousData, loading, error, refetch } = useQuery(adminUsersQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });
  const mutations = useDirectoryMutations(variables);

  // `errorPolicy: "none"` (the default) drops `data` to undefined when a
  // refetch fails; `previousData` keeps the last good page visible instead
  // of flashing the empty state next to the error alert.
  const pageData = data ?? previousData;
  const items = pageData?.adminUsers.items ?? [];
  const totalCount = pageData?.adminUsers.totalCount ?? 0;
  // The error alert must key on query failure itself, not on
  // `firstErrorCode`: a plain transport failure (raw `Error` with no
  // `extensions.code` / no `code`) extracts to `null`, which previously made
  // the error branch unreachable and let the empty state render instead.
  const hasError = Boolean(error);
  const firstErrorCode = error ? extractErrorCode(error) : null;
  const hasFilters = roleFilter !== "" || governanceFilter !== "" || countryFilter !== "" || searchDebounced !== "";

  // ── Shareable-URL write-back (the URL mirrors the APPLIED state) ──────
  // The applied (post-debounce) query string is written back through
  // `router.replace` by the sibling `useUsersUrlSync` hook — no history
  // entry per keystroke, `{ scroll: false }`, no replace churn when the
  // URL already mirrors the applied state.
  const appliedQuery = serializeUsersUrlState({
    q: searchDebounced,
    role: roleFilter,
    governance: governanceFilter,
    country: countryFilter,
    page,
    pageSize,
  });
  useUsersUrlSync(appliedQuery);

  return {
    ...filters,
    // Page-resetting filter setters shadow the raw ones (the students
    // directory's invariant): picking a role/status/country or typing a
    // search always restarts the result set at page 1.
    setRoleFilter: (value: Role | "") => {
      filters.setRoleFilter(value);
      pageAndDialogs.setPage(0);
    },
    setGovernanceFilter: (value: Governance | "") => {
      filters.setGovernanceFilter(value);
      pageAndDialogs.setPage(0);
    },
    setCountryFilter: (value: string) => {
      filters.setCountryFilter(value);
      pageAndDialogs.setPage(0);
    },
    setSearchInput: (value: string) => {
      filters.setSearchInput(value);
      pageAndDialogs.setPage(0);
    },
    ...pageAndDialogs,
    ...mutations,
    items,
    totalCount,
    loading,
    hasError,
    firstErrorCode,
    refetch,
    hasFilters,
  };
}
