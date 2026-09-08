"use client";

/**
 * AdminTeacherRowCells — shared cell-level components for the admin teacher
 * directory surfaces (desktop table + mobile card list).
 *
 * Both surfaces render the SAME semantic content per row — approval pill,
 * presence dot, governance pills, rating, subject chips, evaluator chip,
 * joined timestamp — so the rendering lives in this component family and
 * each surface composes it.
 *
 * Structure mirrors the users directory split:
 *  - `TeacherIdentityCell`   → desktop-only `TableCell` (avatar + name +
 *    email + copy-email quick action; NO profile link — this directory is
 *    read-only).
 *  - `TeacherStatusStack`    → content-only (approval pill + presence +
 *    governance pills), reused by the desktop cell and the mobile body row.
 *  - `TeacherRatingText` / `TeacherSubjectsChips` / `TeacherEvaluatorChip` /
 *    `TeacherJoinedText` → content-only cells.
 *
 * Every color is resolved through a `sx` theme callback against the M3
 * container/`on<Color>Container` pairs; pills paint through the shared
 * `TonalChip` + `toneColors` utilities imported from the users directory
 * (single tonal-lane mapping across the admin domain).
 *
 * Bidi note (Latin names/emails inside an RTL page): the HTML `dir="ltr"`
 * ATTRIBUTE isolates glyph direction and participates in the bidi
 * algorithm. A CSS `direction: "ltr"` rule MUST NOT be added —
 * stylis-plugin-rtl flips it to `rtl` and it would override the attribute,
 * clipping the START of the text. With the attribute alone, direction stays
 * `ltr` and `text-align: start` shows the head with a trailing ellipsis.
 *
 * The copy affordance writes the email to the clipboard and reports success
 * through `onCopyEmail` (the container owns the shared success snackbar);
 * clipboard failures are silently dropped so the snackbar never lies about
 * a copy that did not happen.
 */

import { ContentCopyOutlined as CopyIcon, VisibilityOutlined as ViewIcon } from "@mui/icons-material";
import { Box, IconButton, Stack, TableCell, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminTeachersQuery } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  ADMIN_TEACHERS_SUBJECTS_LIMIT,
  formatTeacherRating,
} from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { TonalChip, UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for directory avatars (expression-passed — a `role` string
 * attribute would trip the ARIA role lint against a component prop). */
const TEACHER_AVATAR_ROLE = "Teacher" as const;

/** Directory list-item row consumed by the cell components. */
export type TeacherDirectoryItem = AdminTeachersQuery["adminTeachers"]["items"][number];

interface TeacherIdentityCellProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "quickActions" | "drawer">;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer (the explicit per-row view-details affordance). */
  readonly onViewDetails?: () => void;
}

/**
 * Desktop identity cell — role-tinted initials avatar (the Teacher lane)
 * + name + ellipsized email + copy-email quick action, with a trailing
 * explicit view-details quick action (the row's keyboard/touch affordance
 * — the row itself is click-only convenience). Read-only surface: the name
 * is NOT a link (there is no teacher detail route).
 */
export function TeacherIdentityCell({
  teacher,
  labels,
  onCopyEmail,
  onViewDetails,
}: TeacherIdentityCellProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(teacher.email, onCopyEmail);
  return (
    <TableCell sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <UserAvatar fullName={teacher.name} role={TEACHER_AVATAR_ROLE} size={40} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="div"
            title={teacher.name}
            dir="ltr"
            sx={theme => ({
              fontSize: 15,
              fontWeight: 600,
              color: teacher.isDeleted ? theme.palette.text.disabled : theme.palette.text.primary,
              unicodeBidi: "isolate",
              textAlign: "start",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            })}
          >
            {teacher.name}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography
              variant="body2"
              component="div"
              title={teacher.email}
              dir="ltr"
              sx={theme => ({
                fontSize: 13,
                color: teacher.isDeleted ? theme.palette.text.disabled : theme.palette.text.secondary,
                unicodeBidi: "isolate",
                textAlign: "start",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              })}
            >
              {teacher.email}
            </Typography>
            <Tooltip
              title={emailCopied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail}
              placement="top"
              enterTouchDelay={0}
              leaveTouchDelay={1500}
            >
              <IconButton
                size="small"
                aria-label={`${labels.quickActions.copyEmail}: ${teacher.email}`}
                onClick={event => {
                  // Copy only — the click must not also open the detail drawer.
                  event.stopPropagation();
                  handleCopyEmail();
                }}
                sx={theme => ({
                  // ≥44px touch target via transparent padding, matching the
                  // users-directory identity cell; the icon stays visually
                  // 20px.
                  p: 1.5,
                  my: -1.5,
                  color: emailCopied ? theme.palette.success.main : theme.palette.text.secondary,
                })}
              >
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
        {onViewDetails !== undefined && <ViewDetailsButton labels={labels} onViewDetails={onViewDetails} />}
      </Stack>
    </TableCell>
  );
}

interface ViewDetailsButtonProps {
  readonly labels: Pick<AdminTeachersLabels, "drawer">;
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

interface TeacherStatusStackProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "statusPills">;
}

/**
 * Status content — the approval headline pill, the presence dot-text, and
 * the governance pills (deleted / suspended / blocked, rendered only when
 * the flag is set). Wrapped in a wrapping row so the mobile card and the
 * desktop cell share one composition.
 */
export function TeacherStatusStack({ teacher, labels }: TeacherStatusStackProps): ReactNode {
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", rowGap: 0.5, columnGap: 1, minWidth: 0 }}>
      <TeacherApprovalPill teacher={teacher} labels={labels} />
      <TeacherPresenceLabel teacher={teacher} labels={labels} />
      <TeacherGovernancePills teacher={teacher} labels={labels} />
    </Stack>
  );
}

interface TeacherApprovalPillProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "statusPills">;
}

/** Approval headline pill — approved = success lane, pending = warning lane. */
export function TeacherApprovalPill({ teacher, labels }: TeacherApprovalPillProps): ReactNode {
  const label = teacher.isApproved ? labels.statusPills.approved : labels.statusPills.pending;
  return <TonalChip tone={teacher.isApproved ? "success" : "warning"} label={label} />;
}

interface TeacherPresenceLabelProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "statusPills">;
}

/**
 * Presence indicator — 8px dot + label (never a color-only signal):
 * online = success lane, offline = neutral surface lane.
 */
export function TeacherPresenceLabel({ teacher, labels }: TeacherPresenceLabelProps): ReactNode {
  const text = teacher.isOnline ? labels.statusPills.online : labels.statusPills.offline;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      <Box
        component="span"
        aria-hidden
        sx={theme => ({
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          bgcolor: teacher.isOnline ? theme.palette.success.main : theme.palette.onSurfaceVariant,
        })}
      />
      <Typography
        variant="body2"
        component="span"
        sx={theme => ({
          color: teacher.isOnline ? theme.palette.onSurfaceVariant : theme.palette.text.secondary,
          fontWeight: 500,
        })}
      >
        {text}
      </Typography>
    </Box>
  );
}

interface TeacherGovernancePillsProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "statusPills">;
}

/**
 * Governance pills — deleted / suspended / blocked, each rendered only when
 * its flag is set (priority semantics stay on the backend; the pills are a
 * faithful set rendering). Renders nothing when no governance flag is set.
 */
export function TeacherGovernancePills({ teacher, labels }: TeacherGovernancePillsProps): ReactNode {
  return (
    <>
      {teacher.isDeleted && <TonalChip tone="error" label={labels.statusPills.deleted} />}
      {teacher.suspended && <TonalChip tone="warning" label={labels.statusPills.suspended} />}
      {teacher.isBlocked && <TonalChip tone="error" label={labels.statusPills.blocked} />}
    </>
  );
}

interface TeacherRatingTextProps {
  readonly teacher: TeacherDirectoryItem;
  readonly locale: AppLocale;
}

/** Rating content — star icon + one-decimal localized value, em-dash when unrated. */
export function TeacherRatingText({ teacher, locale }: TeacherRatingTextProps): ReactNode {
  if (teacher.averageRating === null) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <StarIcon />
      <Typography
        variant="body2"
        component="span"
        sx={theme => ({ color: theme.palette.text.primary, fontWeight: 500 })}
      >
        {formatTeacherRating(teacher.averageRating, locale)}
      </Typography>
    </Stack>
  );
}

/** Decorative star glyph — aria-hidden, the adjacent value carries the meaning. */
function StarIcon(): ReactNode {
  return (
    <Box
      component="span"
      aria-hidden
      sx={theme => ({
        width: 16,
        height: 16,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: theme.palette.warningContainer,
        color: theme.palette.onWarningContainer,
        fontSize: 10,
        lineHeight: 1,
      })}
    >
      ★
    </Box>
  );
}

interface TeacherSubjectsChipsProps {
  readonly teacher: TeacherDirectoryItem;
}

/** Subjects content — up to three chips + a "+N" overflow chip, em-dash when empty. */
export function TeacherSubjectsChips({ teacher }: TeacherSubjectsChipsProps): ReactNode {
  if (teacher.subjects.length === 0) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  const visible = teacher.subjects.slice(0, ADMIN_TEACHERS_SUBJECTS_LIMIT);
  const overflow = teacher.subjects.length - visible.length;
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, minWidth: 0 }}>
      {visible.map(subject => (
        <Chip key={subject} label={subject} />
      ))}
      {overflow > 0 && <Chip label={`+${overflow}`} overflow />}
    </Stack>
  );
}

interface SubjectChipProps {
  readonly label: string;
  /** Overflow chips ("+N") render in the disabled ink to read as metadata. */
  readonly overflow?: boolean;
}

/** Small neutral subject chip (surface-container lane, 26px tall). */
function Chip({ label, overflow = false }: SubjectChipProps): ReactNode {
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
        color: overflow ? theme.palette.text.disabled : theme.palette.onSurfaceVariant,
        fontSize: 12,
        fontWeight: 600,
        maxWidth: 160,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      })}
    >
      {label}
    </Box>
  );
}

interface TeacherEvaluatorChipProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "statusPills">;
}

/** Evaluator content — the evaluator chip when the privilege is held, em-dash otherwise. */
export function TeacherEvaluatorChip({ teacher, labels }: TeacherEvaluatorChipProps): ReactNode {
  if (!teacher.isEvaluator) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return <TonalChip tone="secondary" label={labels.statusPills.evaluator} />;
}

interface TeacherJoinedTextProps {
  readonly teacher: TeacherDirectoryItem;
  readonly locale: AppLocale;
}

/** Joined content — localized timestamp via the shared frontend date util. */
export function TeacherJoinedText({ teacher, locale }: TeacherJoinedTextProps): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {formatApplicantDate(teacher.createdAt, locale)}
    </Typography>
  );
}
