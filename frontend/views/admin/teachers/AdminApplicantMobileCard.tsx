"use client";

/**
 * AdminApplicantMobileCard — one per-applicant card of the mobile queue
 * list, composed from the shared directory mobile-card primitives
 * (`DirectoryMobileCard` shell + header atoms + email row + detail rows):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the single-line ellipsized NAME profile link (the shared
 *    bidi ellipsis recipe), and a trailing column stacking the joined
 *    timestamp caption above the explicit view-profile quick action (the
 *    queue has no drawer — the card itself stays inert and only the links
 *    navigate);
 *  - FULL-WIDTH email row immediately BELOW the header grid (above the
 *    divider) — the shared `DirectoryMobileEmailRow`;
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (lifecycle
 *    chip + governance pills), Attempts, Last attempt, Cooldown — the
 *    shared `DirectoryMobileDetailRow`.
 *
 * Soft-deleted applicants render dimmed (name/email drop to the disabled
 * ink and the name is struck through).
 */

import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { DirectoryMobileCard } from "@/frontend/views/admin/directory-shared/DirectoryMobileCard";
import {
  DirectoryMobileCardAction,
  DirectoryMobileCardCaption,
} from "@/frontend/views/admin/directory-shared/DirectoryMobileCardHeader";
import { DirectoryMobileDetailRow } from "@/frontend/views/admin/directory-shared/DirectoryMobileDetailRow";
import { DirectoryMobileEmailRow } from "@/frontend/views/admin/directory-shared/DirectoryMobileEmailRow";
import { DirectoryNameLink } from "@/frontend/views/admin/directory-shared/DirectoryNameLink";
import {
  ApplicantAttemptsText,
  ApplicantCooldownContent,
  type ApplicantDirectoryItem,
  ApplicantLastAttemptText,
  ApplicantStatusStack,
} from "@/frontend/views/admin/teachers/AdminApplicantRowCells";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for queue avatars (expression-passed — matches the rows). */
const APPLICANT_AVATAR_ROLE = "Teacher" as const;

interface AdminApplicantMobileCardProps {
  readonly labels: AdminTeachersLabels;
  readonly applicant: ApplicantDirectoryItem;
  readonly locale: "ar" | "en";
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

export function AdminApplicantMobileCard({
  labels,
  applicant,
  locale,
  onCopyEmail,
}: AdminApplicantMobileCardProps): ReactNode {
  const deleted = applicant.isDeleted;
  const joinedCaption = formatApplicantDate(applicant.createdAt, locale);
  return (
    <DirectoryMobileCard
      avatarName={applicant.name}
      avatarRole={APPLICANT_AVATAR_ROLE}
      name={
        <DirectoryNameLink
          href={`/admin/users/${applicant.id}`}
          name={applicant.name}
          viewProfileLabel={labels.quickActions.viewProfile}
          deleted={deleted}
        />
      }
      trailing={
        <>
          <DirectoryMobileCardCaption caption={joinedCaption} deleted={deleted} />
          <DirectoryMobileCardAction
            tooltipLabel={labels.quickActions.viewProfile}
            ariaLabel={`${labels.quickActions.viewProfile}: ${applicant.name}`}
            href={`/admin/users/${applicant.id}`}
          />
        </>
      }
      identity={
        <DirectoryMobileEmailRow
          email={applicant.email}
          deleted={deleted}
          copyEmailLabel={labels.quickActions.copyEmail}
          emailCopiedLabel={labels.quickActions.emailCopied}
          onCopyEmail={onCopyEmail}
        />
      }
      rows={
        <>
          <DirectoryMobileDetailRow label={labels.headers.status} dimmed={deleted}>
            <ApplicantStatusStack applicant={applicant} labels={labels} />
          </DirectoryMobileDetailRow>
          <DirectoryMobileDetailRow label={labels.applicantHeaders.attempts} dimmed={deleted}>
            <ApplicantAttemptsText applicant={applicant} />
          </DirectoryMobileDetailRow>
          <DirectoryMobileDetailRow label={labels.applicantHeaders.lastAttempt} dimmed={deleted}>
            <ApplicantLastAttemptText applicant={applicant} locale={locale} />
          </DirectoryMobileDetailRow>
          <DirectoryMobileDetailRow label={labels.applicantHeaders.cooldown} dimmed={deleted}>
            <ApplicantCooldownContent applicant={applicant} locale={locale} labels={labels} />
          </DirectoryMobileDetailRow>
        </>
      }
    />
  );
}
