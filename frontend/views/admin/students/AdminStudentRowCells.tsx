"use client";

/**
 * AdminStudentRowCells — shared cell-level components for the admin student
 * directory surfaces (desktop table + mobile card list).
 *
 * Both surfaces render the SAME semantic content per row — balance badges,
 * parent identity, language chips, trial state, joined timestamp — so the
 * rendering lives in this component family and each surface composes it.
 *
 * Structure mirrors the users directory split:
 *  - `StudentIdentityCell`   → desktop-only `TableCell` (avatar + name +
 *    email + copy-email quick action; NO profile link — this directory is
 *    read-only).
 *  - `StudentBalancesBadges` / `StudentParentContent` / `StudentLanguageChips` /
 *    `StudentTrialContent` / `StudentJoinedText` → content-only cells,
 *    reused by the desktop row and the mobile body rows.
 *
 * Balance badges paint from four DISTINCT M3 container lanes (hifz =
 * primary, reviews = secondary, tajweed = success, trial = warning) via the
 * shared `TonalChip` utility imported from the users directory (single
 * tonal-lane mapping across the admin domain). The parent column renders
 * the verbatim parent identity, or the localized "independent" chip when
 * the student has no parent link.
 */

import { ContentCopyOutlined as CopyIcon, VisibilityOutlined as ViewIcon } from "@mui/icons-material";
import { Box, IconButton, TableCell, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminStudentsQuery } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { TonalChip, UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AppLocale } from "@/shared/locale";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

/** Role lane for directory avatars (expression-passed — a `role` string
 * attribute would trip the ARIA role lint against a component prop). */
const STUDENT_AVATAR_ROLE = "Student" as const;

/** Directory list-item row consumed by the cell components. */
export type StudentDirectoryItem = AdminStudentsQuery["adminStudents"]["items"][number];

interface StudentIdentityCellProps {
  readonly student: StudentDirectoryItem;
  readonly labels: Pick<AdminStudentsLabels, "quickActions" | "drawer">;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer (the explicit per-row view-details affordance). */
  readonly onViewDetails?: () => void;
}

/**
 * Desktop identity cell — role-tinted initials avatar (the Student lane)
 * + name + ellipsized email + copy-email quick action, with a trailing
 * explicit view-details quick action (the row's keyboard/touch affordance
 * — the row itself is click-only convenience). Read-only surface: the name
 * is NOT a link (there is no student detail route).
 */
export function StudentIdentityCell({
  student,
  labels,
  onCopyEmail,
  onViewDetails,
}: StudentIdentityCellProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(student.email, onCopyEmail);
  return (
    <TableCell sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <UserAvatar fullName={student.name} role={STUDENT_AVATAR_ROLE} size={40} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="div"
            title={student.name}
            dir="ltr"
            sx={{
              fontSize: 15,
              fontWeight: 600,
              unicodeBidi: "isolate",
              textAlign: "start",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {student.name}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
            <Typography
              variant="body2"
              component="div"
              title={student.email}
              dir="ltr"
              sx={theme => ({
                fontSize: 13,
                color: theme.palette.text.secondary,
                unicodeBidi: "isolate",
                textAlign: "start",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              })}
            >
              {student.email}
            </Typography>
            <CopyEmailCell email={student.email} copied={emailCopied} labels={labels} onCopy={handleCopyEmail} />
          </Box>
        </Box>
        {onViewDetails !== undefined && <ViewDetailsButton labels={labels} onViewDetails={onViewDetails} />}
      </Box>
    </TableCell>
  );
}

interface ViewDetailsButtonProps {
  readonly labels: Pick<AdminStudentsLabels, "drawer">;
  readonly onViewDetails: () => void;
}

/**
 * The explicit view-details quick action — the row's keyboard/touch
 * affordance for opening the detail drawer (row click stays pointer-only
 * convenience; this button is the real focusable control).
 */
export function ViewDetailsButton({ labels, onViewDetails }: ViewDetailsButtonProps): ReactNode {
  return (
    <Tooltip title={labels.drawer.viewDetails} placement="top">
      <IconButton
        size="small"
        aria-label={labels.drawer.viewDetails}
        onClick={onViewDetails}
        sx={theme => ({
          // ≥44px touch target via transparent padding; the icon stays
          // visually 20px.
          p: 1.5,
          my: -1.5,
          flexShrink: 0,
          color: theme.palette.text.secondary,
        })}
      >
        <ViewIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

interface CopyEmailCellProps {
  readonly email: string;
  readonly copied: boolean;
  readonly labels: Pick<AdminStudentsLabels, "quickActions">;
  readonly onCopy: () => void;
}

/** Copy-email quick action shared by the desktop and mobile identity cells. */
function CopyEmailCell({ email, copied, labels, onCopy }: CopyEmailCellProps): ReactNode {
  return (
    <Tooltip title={copied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail} placement="top">
      <IconButton
        size="small"
        aria-label={`${labels.quickActions.copyEmail}: ${email}`}
        onClick={event => {
          // Copy only — the click must not also open the detail drawer.
          event.stopPropagation();
          onCopy();
        }}
        sx={theme => ({
          // ≥44px touch target via transparent padding, matching the
          // users-directory identity cell; the icon stays visually 20px.
          p: 1.5,
          my: -1.5,
          color: copied ? theme.palette.success.main : theme.palette.text.secondary,
        })}
      >
        <CopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

interface StudentBalancesBadgesProps {
  readonly student: StudentDirectoryItem;
  readonly labels: Pick<AdminStudentsLabels, "balances">;
}

/**
 * Balances content — four compact badges in the backend's canonical lane
 * order, each composed as `label + count` and painted from its own M3
 * container lane: hifz = primary, reviews = secondary, tajweed = success,
 * trial = warning. The row wraps so a 390px viewport keeps all four
 * visible.
 */
export function StudentBalancesBadges({ student, labels }: StudentBalancesBadgesProps): ReactNode {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, minWidth: 0 }}>
      <TonalChip tone="primary" label={`${labels.balances.hifz} ${student.balanceHifz}`} />
      <TonalChip tone="secondary" label={`${labels.balances.reviews} ${student.balanceReviews}`} />
      <TonalChip tone="success" label={`${labels.balances.tajweed} ${student.balanceTajweed}`} />
      <TonalChip tone="warning" label={`${labels.balances.trial} ${student.balanceTrial}`} />
    </Box>
  );
}

interface StudentParentContentProps {
  readonly student: StudentDirectoryItem;
  readonly labels: Pick<AdminStudentsLabels, "parentLabels">;
}

/**
 * Parent content — the verbatim parent identity (name + email) when the
 * student is linked, the localized "independent" chip when they are not,
 * or the em-dash fallback for a linked student whose parent identity is
 * missing (defensive — the backend derives the link from the parent_id).
 */
export function StudentParentContent({ student, labels }: StudentParentContentProps): ReactNode {
  if (!student.hasParent) {
    return <TonalChip tone="neutral" label={labels.parentLabels.noParent} />;
  }
  if (student.parentName === null && student.parentEmail === null) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Box sx={{ minWidth: 0 }}>
      {student.parentName !== null && (
        <Typography
          component="div"
          title={student.parentName}
          sx={theme => ({
            fontSize: 14,
            fontWeight: 500,
            color: theme.palette.text.primary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          {student.parentName}
        </Typography>
      )}
      {student.parentEmail !== null && (
        <Typography
          variant="body2"
          component="div"
          title={student.parentEmail}
          dir="ltr"
          sx={theme => ({
            fontSize: 13,
            color: theme.palette.text.secondary,
            unicodeBidi: "isolate",
            textAlign: "start",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          {student.parentEmail}
        </Typography>
      )}
    </Box>
  );
}

interface StudentLanguageChipsProps {
  readonly student: StudentDirectoryItem;
}

/** Languages content — primary + another chips (neutral lane), em-dash when unset. */
export function StudentLanguageChips({ student }: StudentLanguageChipsProps): ReactNode {
  const languages = [student.primaryLanguage, student.anotherLanguage].filter(
    (language): language is string => language !== null
  );
  if (languages.length === 0) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, minWidth: 0 }}>
      {languages.map(language => (
        <LanguageChip key={language} label={language} />
      ))}
    </Box>
  );
}

/** Small neutral language chip (surface-container lane, 26px tall). */
function LanguageChip({ label }: { readonly label: string }): ReactNode {
  return (
    <Box
      component="span"
      sx={theme => ({
        display: "inline-flex",
        alignItems: "center",
        px: 1,
        height: 26,
        borderRadius: "999px",
        bgcolor: theme.palette.surfaceContainerHighest,
        color: theme.palette.onSurfaceVariant,
        fontSize: 12,
        fontWeight: 600,
        maxWidth: 120,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      })}
    >
      {label}
    </Box>
  );
}

interface StudentTrialContentProps {
  readonly student: StudentDirectoryItem;
  readonly locale: AppLocale;
  readonly labels: Pick<AdminStudentsLabels, "trialBadge">;
}

/**
 * Trial content — the trial chip above the localized granted timestamp when
 * a trial was granted, the em-dash otherwise.
 */
export function StudentTrialContent({ student, locale, labels }: StudentTrialContentProps): ReactNode {
  if (student.trialGrantedAt === null) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.5 }}>
      <TonalChip tone="warning" label={labels.trialBadge} />
      <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
        {formatApplicantDate(student.trialGrantedAt, locale)}
      </Typography>
    </Box>
  );
}

interface StudentJoinedTextProps {
  readonly student: StudentDirectoryItem;
  readonly locale: AppLocale;
}

/** Joined content — localized timestamp via the shared frontend date util. */
export function StudentJoinedText({ student, locale }: StudentJoinedTextProps): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {formatApplicantDate(student.createdAt, locale)}
    </Typography>
  );
}
