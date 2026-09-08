"use client";

/**
 * AdminTeachersMobileCardList — the mobile (< md) rendering of the admin
 * teacher directory, rendered on the shared `DirectoryMobileCardList` (a
 * vertical stack of per-teacher cards with a 16px gap and the 96px
 * `paddingBlockEnd` gap before the pagination card).
 *
 * Loading renders stable-key skeleton cards (announced through the
 * localized loading label); the empty state wraps `AdminTeachersEmptyState`
 * in a card (threading the surface's applicant-queue signals so the
 * join-requests CTA can render).
 */

import type { ReactNode } from "react";
import { DirectoryMobileCardList } from "@/frontend/views/admin/directory-shared/DirectoryMobileCardList";
import { AdminTeacherMobileCard } from "@/frontend/views/admin/teachers/AdminTeacherMobileCard";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { AdminTeachersEmptyState } from "@/frontend/views/admin/teachers/AdminTeachersEmptyState";
import { ADMIN_TEACHERS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminTeachersMobileCardListProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly TeacherDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any card's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for a card (the directory owns the drawer). */
  readonly onViewDetails?: (teacher: TeacherDirectoryItem) => void;
  /** Whether the applicant queue holds ≥1 row (gates the join-requests CTA). */
  readonly hasApplicants: boolean;
  /** Flips the /teachers surface to the applicants tab (surface-owned state). */
  readonly onReviewApplicants: () => void;
}

export function AdminTeachersMobileCardList(props: AdminTeachersMobileCardListProps): ReactNode {
  const locale = useAppLocale();
  return (
    <DirectoryMobileCardList
      loading={props.loading}
      loadingLabel={props.labels.loading}
      skeletonKeys={ADMIN_TEACHERS_SKELETON_KEYS}
      empty={
        <AdminTeachersEmptyState
          labels={props.labels}
          hasFilters={props.hasFilters}
          hasApplicants={props.hasApplicants}
          onReviewApplicants={props.onReviewApplicants}
        />
      }
      cards={props.items.map(teacher => (
        <AdminTeacherMobileCard
          key={teacher.id}
          labels={props.labels}
          teacher={teacher}
          locale={locale}
          onCopyEmail={props.onCopyEmail}
          onViewDetails={props.onViewDetails}
        />
      ))}
    />
  );
}
