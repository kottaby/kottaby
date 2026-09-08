"use client";

/**
 * AdminTeachersTable — the desktop (≥`md`) admin teacher directory table,
 * rendered on the shared `DirectoryTableScaffold` (card chrome, header row
 * from the columns config below, skeleton/empty orchestration, pagination
 * slot).
 *
 * Columns (start → end; they mirror visually under RTL automatically):
 * NAME (avatar + name + ellipsized email + copy-email quick action),
 * STATUS (approval pill + presence + governance pills), RATING (star +
 * one-decimal localized value), SUBJECTS (chips with a "+N" overflow chip),
 * EVALUATOR (chip or em-dash), JOINED (localized timestamp). Each body row
 * is rendered by `AdminTeacherRow` (≥72px tall, `border.light` hairlines,
 * odd rows carry a faint `action.hover` zebra tint and pointer hover
 * upgrades the row to `action.selected`).
 *
 * Loading renders stable-key skeleton rows (the rowgroup announces the
 * localized loading label); the empty state reuses the
 * `labels.emptyState` copy via `AdminTeachersEmptyState` (threading the
 * surface's applicant-queue signals so the join-requests CTA can render).
 * The pagination footer is injected as a `pagination` slot rendered inside
 * the same card (top hairline from `DirectoryPagination`).
 */

import type { ReactNode } from "react";
import {
  type DirectoryTableHeader,
  DirectoryTableScaffold,
} from "@/frontend/views/admin/directory-shared/DirectoryTableScaffold";
import { AdminTeacherRow } from "@/frontend/views/admin/teachers/AdminTeacherRow";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { AdminTeachersEmptyState } from "@/frontend/views/admin/teachers/AdminTeachersEmptyState";
import { ADMIN_TEACHERS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminTeachersTableProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly TeacherDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any row's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for a row (the directory owns the drawer). */
  readonly onViewDetails?: (teacher: TeacherDirectoryItem) => void;
  /** Footer slot rendered inside the card (the shared `DirectoryPagination` bar). */
  readonly pagination?: ReactNode;
  /** Whether the applicant queue holds ≥1 row (gates the join-requests CTA). */
  readonly hasApplicants: boolean;
  /** Flips the /teachers surface to the applicants tab (surface-owned state). */
  readonly onReviewApplicants: () => void;
}

export function AdminTeachersTable(props: AdminTeachersTableProps): ReactNode {
  const { labels, items, loading, hasFilters, onCopyEmail, onViewDetails, hasApplicants, onReviewApplicants } = props;
  const locale = useAppLocale();
  const headers: readonly DirectoryTableHeader[] = [
    { id: "name", width: "26%", label: labels.headers.name },
    { id: "status", width: "21%", label: labels.headers.status },
    { id: "rating", width: "10%", label: labels.headers.rating },
    { id: "subjects", width: "20%", label: labels.headers.subjects },
    { id: "evaluator", width: "11%", label: labels.statusPills.evaluator },
    { id: "joined", width: "12%", label: labels.headers.joined },
  ];
  return (
    <DirectoryTableScaffold
      headers={headers}
      loading={loading}
      loadingLabel={labels.loading}
      skeletonKeys={ADMIN_TEACHERS_SKELETON_KEYS}
      empty={
        <AdminTeachersEmptyState
          labels={labels}
          hasFilters={hasFilters}
          hasApplicants={hasApplicants}
          onReviewApplicants={onReviewApplicants}
        />
      }
      rows={items.map((teacher, index) => (
        <AdminTeacherRow
          key={teacher.id}
          teacher={teacher}
          labels={labels}
          locale={locale}
          striped={index % 2 === 1}
          onCopyEmail={onCopyEmail}
          onViewDetails={onViewDetails}
        />
      ))}
      pagination={props.pagination}
    />
  );
}
