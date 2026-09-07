"use client";

/**
 * AdminTeachersResults — the results section of the admin teacher
 * directory, mirroring the users directory's `DirectoryResults`.
 *
 * Composes:
 *  - `AdminTeachersTable` (desktop, ≥md) with the shared `DirectoryPagination`
 *    footer bar injected as the card's pagination slot,
 *  - `AdminTeachersMobileCardList` (mobile, <md),
 *  - `AdminTeachersMobilePaginationCard` — the mobile-only pagination card
 *    below the list.
 *
 * Pure presentation: all state and handlers come from
 * `useAdminTeachersDirectory`.
 */

import type { ReactNode } from "react";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { AdminTeachersMobileCardList } from "@/frontend/views/admin/teachers/AdminTeachersMobileCardList";
import { AdminTeachersMobilePaginationCard } from "@/frontend/views/admin/teachers/AdminTeachersMobilePaginationCard";
import { AdminTeachersTable } from "@/frontend/views/admin/teachers/AdminTeachersTable";
import type { useAdminTeachersDirectory } from "@/frontend/views/admin/teachers/hooks";
import { DirectoryPagination } from "@/frontend/views/admin/users/directory";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

type DirectoryState = ReturnType<typeof useAdminTeachersDirectory>;

interface AdminTeachersResultsProps {
  readonly labels: AdminTeachersLabels;
  readonly directory: DirectoryState;
  /** Invoked after any row's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for a row/card (the directory owns the drawer). */
  readonly onViewDetails?: (teacher: TeacherDirectoryItem) => void;
}

export function AdminTeachersResults({
  labels,
  directory,
  onCopyEmail,
  onViewDetails,
}: AdminTeachersResultsProps): ReactNode {
  // When the query (or a refetch with no cached rows) failed, the error
  // alert in `AdminTeachersDirectoryContainer` is the sole surface — rendering
  // the skeleton/empty state and pagination beside it reads as a second,
  // contradictory failure message.
  if (directory.hasError && directory.items.length === 0) return null;
  return (
    <>
      <AdminTeachersTable
        labels={labels}
        items={directory.items}
        loading={directory.loading}
        hasFilters={directory.hasFilters}
        onCopyEmail={onCopyEmail}
        onViewDetails={onViewDetails}
        pagination={
          <DirectoryPagination
            labels={labels}
            page={directory.page}
            pageSize={directory.pageSize}
            totalCount={directory.total}
            onPageChange={directory.setPage}
            onPageSizeChange={directory.setPageSize}
          />
        }
      />

      <AdminTeachersMobileCardList
        labels={labels}
        items={directory.items}
        loading={directory.loading}
        hasFilters={directory.hasFilters}
        onCopyEmail={onCopyEmail}
        onViewDetails={onViewDetails}
      />

      <AdminTeachersMobilePaginationCard
        labels={labels}
        page={directory.page}
        pageSize={directory.pageSize}
        totalCount={directory.total}
        onPageChange={directory.setPage}
        onPageSizeChange={directory.setPageSize}
      />
    </>
  );
}
