"use client";

/**
 * AdminApplicantsTable — the desktop (≥`md`) applicant-queue table,
 * rendered on the shared `DirectoryTableScaffold` (card chrome, header row
 * from the columns config below, skeleton/empty orchestration, pagination
 * slot). Mirrors `AdminTeachersTable`.
 *
 * Columns (start → end; they mirror visually under RTL automatically):
 * NAME (avatar + name profile link + ellipsized email + copy-email quick
 * action), STATUS (lifecycle chip + governance pills), ATTEMPTS (verbatim
 * count), LAST ATTEMPT (localized timestamp or em-dash), COOLDOWN (chip
 * while active, expiry timestamp, or em-dash), JOINED (localized
 * timestamp), ACTIONS (view-profile navigation — short `applicantHeaders
 * .actions` header; the long view-profile wording lives on the row
 * affordance's tooltip/aria). Each body row is rendered by
 * `AdminApplicantRow` (≥72px tall, `border.light` hairlines, odd rows
 * carry a faint `action.hover` zebra tint and hover upgrades the row to
 * `action.selected`).
 *
 * Loading renders stable-key skeleton rows (the rowgroup announces the
 * localized loading label); the empty state reuses the
 * `labels.applicantsEmptyState` copy via `AdminApplicantsEmptyState`. The
 * pagination footer is injected as a `pagination` slot rendered inside the
 * same card (top hairline from `DirectoryPagination`).
 */

import type { ReactNode } from "react";
import {
  type DirectoryTableHeader,
  DirectoryTableScaffold,
} from "@/frontend/views/admin/directory-shared/DirectoryTableScaffold";
import { AdminApplicantRow } from "@/frontend/views/admin/teachers/AdminApplicantRow";
import type { ApplicantDirectoryItem } from "@/frontend/views/admin/teachers/AdminApplicantRowCells";
import { AdminApplicantsEmptyState } from "@/frontend/views/admin/teachers/AdminApplicantsEmptyState";
import { ADMIN_APPLICANTS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminApplicants.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminApplicantsTableProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly ApplicantDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any row's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Footer slot rendered inside the card (the shared `DirectoryPagination` bar). */
  readonly pagination?: ReactNode;
}

export function AdminApplicantsTable(props: AdminApplicantsTableProps): ReactNode {
  const { labels, items, loading, hasFilters, onCopyEmail } = props;
  const locale = useAppLocale();
  const headers: readonly DirectoryTableHeader[] = [
    // COOLDOWN gets ≥15% — the active-cooldown chip ("Cooling down" /
    // "في فترة تهدئة") needs ~110px of label space; at the former 13% the
    // fixed-layout cell squeezed the chip into an ellipsis. ACTIONS drops
    // to 9.5% (a single 44px icon button + cell padding fits comfortably).
    { id: "name", width: "25%", label: labels.headers.name },
    { id: "status", width: "16%", label: labels.headers.status },
    { id: "attempts", width: "8%", label: labels.applicantHeaders.attempts },
    { id: "lastAttempt", width: "13.5%", label: labels.applicantHeaders.lastAttempt },
    { id: "cooldown", width: "15%", label: labels.applicantHeaders.cooldown },
    { id: "joined", width: "13%", label: labels.headers.joined },
    { id: "actions", width: "9.5%", label: labels.applicantHeaders.actions },
  ];
  return (
    <DirectoryTableScaffold
      headers={headers}
      loading={loading}
      loadingLabel={labels.applicantsLoading}
      skeletonKeys={ADMIN_APPLICANTS_SKELETON_KEYS}
      empty={<AdminApplicantsEmptyState labels={labels} hasFilters={hasFilters} />}
      rows={items.map((applicant, index) => (
        <AdminApplicantRow
          key={applicant.id}
          applicant={applicant}
          labels={labels}
          locale={locale}
          striped={index % 2 === 1}
          onCopyEmail={onCopyEmail}
        />
      ))}
      pagination={props.pagination}
    />
  );
}
