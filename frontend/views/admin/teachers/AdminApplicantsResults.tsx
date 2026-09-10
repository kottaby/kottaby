"use client";

/**
 * AdminApplicantsResults — the results section of the applicant queue,
 * mirroring the directory's `AdminTeachersResults`.
 *
 * Composes:
 *  - `AdminApplicantsTable` (desktop, ≥md) with the shared
 *    `DirectoryPagination` footer bar injected as the card's pagination
 *    slot,
 *  - `AdminApplicantsMobileCardList` (mobile, <md),
 *  - `AdminApplicantsMobilePaginationCard` — the mobile-only pagination
 *    card below the list.
 *
 * Pure presentation: all state and handlers come from
 * `useAdminTeacherApplicants`.
 */

import type { ReactNode } from "react";
import { AdminApplicantsMobileCardList } from "@/frontend/views/admin/teachers/AdminApplicantsMobileCardList";
import { AdminApplicantsMobilePaginationCard } from "@/frontend/views/admin/teachers/AdminApplicantsMobilePaginationCard";
import { AdminApplicantsTable } from "@/frontend/views/admin/teachers/AdminApplicantsTable";
import type { useAdminTeacherApplicants } from "@/frontend/views/admin/teachers/hooks";
import { DirectoryPagination } from "@/frontend/views/admin/users/directory";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

type ApplicantsState = ReturnType<typeof useAdminTeacherApplicants>;

interface AdminApplicantsResultsProps {
  readonly labels: AdminTeachersLabels;
  readonly applicants: ApplicantsState;
  /** Invoked after any row's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

export function AdminApplicantsResults({ labels, applicants, onCopyEmail }: AdminApplicantsResultsProps): ReactNode {
  // When the query (or a refetch with no cached rows) failed, the error
  // alert in `AdminApplicantsPanel` is the sole surface — rendering the
  // skeleton/empty state and pagination beside it reads as a second,
  // contradictory failure message.
  if (applicants.hasError && applicants.items.length === 0) return null;
  return (
    <>
      <AdminApplicantsTable
        labels={labels}
        items={applicants.items}
        loading={applicants.loading}
        hasFilters={applicants.hasFilters}
        onCopyEmail={onCopyEmail}
        pagination={
          <DirectoryPagination
            labels={labels}
            page={applicants.page}
            pageSize={applicants.pageSize}
            totalCount={applicants.total}
            onPageChange={applicants.setPage}
            onPageSizeChange={applicants.setPageSize}
          />
        }
      />

      <AdminApplicantsMobileCardList
        labels={labels}
        items={applicants.items}
        loading={applicants.loading}
        hasFilters={applicants.hasFilters}
        onCopyEmail={onCopyEmail}
      />

      <AdminApplicantsMobilePaginationCard
        labels={labels}
        page={applicants.page}
        pageSize={applicants.pageSize}
        totalCount={applicants.total}
        onPageChange={applicants.setPage}
        onPageSizeChange={applicants.setPageSize}
      />
    </>
  );
}
