"use client";

/**
 * AdminApplicantsMobileCardList — the mobile (< md) rendering of the
 * applicant queue, rendered on the shared `DirectoryMobileCardList` (a
 * vertical stack of per-applicant cards with a 16px gap and the 96px
 * `paddingBlockEnd` gap before the pagination card).
 *
 * Loading renders stable-key skeleton cards (announced through the
 * localized loading label); the empty state wraps
 * `AdminApplicantsEmptyState` in a card.
 */

import type { ReactNode } from "react";
import { DirectoryMobileCardList } from "@/frontend/views/admin/directory-shared/DirectoryMobileCardList";
import { AdminApplicantMobileCard } from "@/frontend/views/admin/teachers/AdminApplicantMobileCard";
import type { ApplicantDirectoryItem } from "@/frontend/views/admin/teachers/AdminApplicantRowCells";
import { AdminApplicantsEmptyState } from "@/frontend/views/admin/teachers/AdminApplicantsEmptyState";
import { ADMIN_APPLICANTS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminApplicants.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminApplicantsMobileCardListProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly ApplicantDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any card's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

export function AdminApplicantsMobileCardList(props: AdminApplicantsMobileCardListProps): ReactNode {
  const locale = useAppLocale();
  return (
    <DirectoryMobileCardList
      loading={props.loading}
      loadingLabel={props.labels.applicantsLoading}
      skeletonKeys={ADMIN_APPLICANTS_SKELETON_KEYS}
      empty={<AdminApplicantsEmptyState labels={props.labels} hasFilters={props.hasFilters} />}
      cards={props.items.map(applicant => (
        <AdminApplicantMobileCard
          key={applicant.id}
          labels={props.labels}
          applicant={applicant}
          locale={locale}
          onCopyEmail={props.onCopyEmail}
        />
      ))}
    />
  );
}
