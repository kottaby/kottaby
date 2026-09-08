"use client";

/**
 * AdminTeacherMobileCard — one per-teacher card of the mobile directory
 * list, composed from the shared directory mobile-card primitives
 * (`DirectoryMobileCard` shell + header atoms + email row + detail rows):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the single-line ellipsized NAME (the shared bidi ellipsis
 *    recipe), and a trailing column stacking the joined timestamp caption
 *    above the explicit view-details quick action (read-only directory —
 *    no kebab menu; the card click and the quick action both open the
 *    detail drawer);
 *  - FULL-WIDTH email row immediately BELOW the header grid (above the
 *    divider) — the shared `DirectoryMobileEmailRow`;
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (approval
 *    pill + presence + governance pills), Rating, Subjects, Evaluator — the
 *    shared `DirectoryMobileDetailRow`.
 *
 * Soft-deleted teachers render dimmed (name/email drop to the disabled ink).
 */

import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { DirectoryMobileCard } from "@/frontend/views/admin/directory-shared/DirectoryMobileCard";
import {
  DirectoryMobileCardAction,
  DirectoryMobileCardCaption,
  DirectoryMobileCardName,
} from "@/frontend/views/admin/directory-shared/DirectoryMobileCardHeader";
import { DirectoryMobileDetailRow } from "@/frontend/views/admin/directory-shared/DirectoryMobileDetailRow";
import { DirectoryMobileEmailRow } from "@/frontend/views/admin/directory-shared/DirectoryMobileEmailRow";
import {
  type TeacherDirectoryItem,
  TeacherEvaluatorChip,
  TeacherRatingText,
  TeacherStatusStack,
  TeacherSubjectsChips,
} from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for directory avatars (expression-passed — matches the rows). */
const TEACHER_AVATAR_ROLE = "Teacher" as const;

interface AdminTeacherMobileCardProps {
  readonly labels: AdminTeachersLabels;
  readonly teacher: TeacherDirectoryItem;
  readonly locale: "ar" | "en";
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for this card (the directory owns the drawer). */
  readonly onViewDetails?: (teacher: TeacherDirectoryItem) => void;
}

export function AdminTeacherMobileCard({
  labels,
  teacher,
  locale,
  onCopyEmail,
  onViewDetails,
}: AdminTeacherMobileCardProps): ReactNode {
  const deleted = teacher.isDeleted;
  const joinedCaption = formatApplicantDate(teacher.createdAt, locale);
  const openDetails = onViewDetails === undefined ? undefined : () => onViewDetails(teacher);
  return (
    <DirectoryMobileCard
      avatarName={teacher.name}
      avatarRole={TEACHER_AVATAR_ROLE}
      onClick={openDetails}
      name={<DirectoryMobileCardName name={teacher.name} deleted={deleted} />}
      trailing={
        <>
          <DirectoryMobileCardCaption caption={joinedCaption} deleted={deleted} />
          {openDetails !== undefined && (
            <DirectoryMobileCardAction
              tooltipLabel={labels.drawer.viewDetails}
              ariaLabel={labels.drawer.viewDetails}
              onClick={openDetails}
            />
          )}
        </>
      }
      identity={
        <DirectoryMobileEmailRow
          email={teacher.email}
          deleted={deleted}
          copyEmailLabel={labels.quickActions.copyEmail}
          emailCopiedLabel={labels.quickActions.emailCopied}
          onCopyEmail={onCopyEmail}
        />
      }
      rows={
        <>
          <DirectoryMobileDetailRow label={labels.headers.status} dimmed={deleted}>
            <TeacherStatusStack teacher={teacher} labels={labels} />
          </DirectoryMobileDetailRow>
          <DirectoryMobileDetailRow label={labels.headers.rating} dimmed={deleted}>
            <TeacherRatingText teacher={teacher} locale={locale} />
          </DirectoryMobileDetailRow>
          <DirectoryMobileDetailRow label={labels.headers.subjects} dimmed={deleted}>
            <TeacherSubjectsChips teacher={teacher} />
          </DirectoryMobileDetailRow>
          <DirectoryMobileDetailRow label={labels.statusPills.evaluator} dimmed={deleted}>
            <TeacherEvaluatorChip teacher={teacher} labels={labels} />
          </DirectoryMobileDetailRow>
        </>
      }
    />
  );
}
