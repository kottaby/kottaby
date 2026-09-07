"use client";

/**
 * AdminTeacherMobileCard — one per-teacher card of the mobile directory
 * list (radius 12, `border.light` outline, 16px padding):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the name/email/copy-email block (truncating with the shared
 *    bidi ellipsis recipe), and a trailing column stacking the joined
 *    timestamp caption above the explicit view-details quick action
 *    (read-only directory — no kebab menu; the card click and the quick
 *    action both open the detail drawer),
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (approval
 *    pill + presence + governance pills), Rating, Subjects, Evaluator.
 *
 * Soft-deleted teachers render dimmed (name/email drop to the disabled ink).
 */

import { ContentCopyOutlined as CopyIcon, VisibilityOutlined as ViewIcon } from "@mui/icons-material";
import { Box, Card, Divider, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  type TeacherDirectoryItem,
  TeacherEvaluatorChip,
  TeacherRatingText,
  TeacherStatusStack,
  TeacherSubjectsChips,
} from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for directory avatars (expression-passed — a `role` string
 * attribute would trip the ARIA role lint against a component prop). */
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
    <Card
      onClick={openDetails}
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 2,
        ...(openDetails !== undefined && { cursor: "pointer" }),
      })}
    >
      {/*
        Header as a 3-track grid — [avatar 44px] [name/email block (flexible,
        minmax(0,1fr) so it can shrink and ellipsize)] [joined caption +
        view-details quick action]. The middle block reserves every free
        pixel for the text; the trailing column stacks vertically so the
        name/email block keeps ≥ ~180px at a 390px viewport. This surface is
        read-only, so there is no kebab column — the joined caption and the
        view-details quick action fill the trailing track.
      */}
      <Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 1 }}>
        <UserAvatar fullName={teacher.name} role={TEACHER_AVATAR_ROLE} size={44} />
        <MobileTeacherIdentity teacher={teacher} labels={labels} deleted={deleted} onCopyEmail={onCopyEmail} />
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <Typography
            variant="caption"
            sx={theme => ({
              color: deleted ? theme.palette.text.disabled : theme.palette.text.secondary,
              textAlign: "end",
            })}
          >
            {joinedCaption}
          </Typography>
          {openDetails !== undefined && (
            <Tooltip title={labels.drawer.viewDetails} placement="top">
              <IconButton
                size="small"
                aria-label={labels.drawer.viewDetails}
                onClick={openDetails}
                sx={theme => ({
                  // ≥44px touch target via transparent padding; the icon
                  // stays visually 20px.
                  p: 1.5,
                  my: -0.75,
                  color: theme.palette.text.secondary,
                })}
              >
                <ViewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={1}>
        <MobileDetailRow label={labels.headers.status} dimmed={deleted}>
          <TeacherStatusStack teacher={teacher} labels={labels} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.headers.rating} dimmed={deleted}>
          <TeacherRatingText teacher={teacher} locale={locale} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.headers.subjects} dimmed={deleted}>
          <TeacherSubjectsChips teacher={teacher} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.statusPills.evaluator} dimmed={deleted}>
          <TeacherEvaluatorChip teacher={teacher} labels={labels} />
        </MobileDetailRow>
      </Stack>
    </Card>
  );
}

interface MobileTeacherIdentityProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
  readonly deleted: boolean;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

/**
 * The mobile card's middle header track: name + wrapping email + copy-email
 * quick action (parity with the desktop identity cell). The email WRAPS (no
 * ellipsis) so the full address stays visible at a 375px viewport; the name
 * keeps its single-line ellipsis. Bidi note: the HTML `dir="ltr"` ATTRIBUTE
 * isolates glyph direction — a CSS `direction` rule MUST NOT be added
 * (stylis-plugin-rtl would flip it and clip the string's head).
 */
function MobileTeacherIdentity({ teacher, labels, deleted, onCopyEmail }: MobileTeacherIdentityProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(teacher.email, onCopyEmail);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        component="div"
        title={teacher.name}
        dir="ltr"
        sx={theme => ({
          fontSize: 15,
          fontWeight: 600,
          unicodeBidi: "isolate",
          textAlign: "start",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          color: deleted ? theme.palette.text.disabled : theme.palette.text.primary,
          ...(deleted && { textDecoration: "line-through" }),
        })}
      >
        {teacher.name}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <Typography
          variant="body2"
          component="div"
          dir="ltr"
          sx={theme => ({
            display: "block",
            fontSize: 13,
            unicodeBidi: "isolate",
            textAlign: "start",
            // Wrap long addresses instead of ellipsizing them — a truncated
            // email defeats the card's purpose (the full value at a glance).
            overflowWrap: "anywhere",
            flex: 1,
            minWidth: 0,
            color: deleted ? theme.palette.text.disabled : theme.palette.text.secondary,
          })}
        >
          {teacher.email}
        </Typography>
        <CopyIconButton email={teacher.email} copied={emailCopied} labels={labels} onCopy={handleCopyEmail} />
      </Stack>
    </Box>
  );
}

interface CopyIconButtonProps {
  readonly email: string;
  readonly copied: boolean;
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
  readonly onCopy: () => void;
}

/** The copy-email quick action — ≥44px touch target via transparent padding. */
function CopyIconButton({ email, copied, labels, onCopy }: CopyIconButtonProps): ReactNode {
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
          p: 1.5,
          my: -1.5,
          flexShrink: 0,
          color: copied ? theme.palette.success.main : theme.palette.text.secondary,
        })}
      >
        <CopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

interface MobileDetailRowProps {
  readonly label: string;
  readonly dimmed: boolean;
  readonly children: ReactNode;
}

/** Strict two-column body row: label pinned to the inline-start edge, value
 *  cell flexes to fill and pins its content to the inline-end edge. */
function MobileDetailRow({ label, dimmed, children }: MobileDetailRowProps): ReactNode {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0, textAlign: "start" })}
      >
        {label}
      </Typography>
      <Box
        sx={theme => ({
          flex: 1,
          minWidth: 0,
          display: "flex",
          justifyContent: "flex-end",
          textAlign: "end",
          fontWeight: 500,
          ...(dimmed && { color: theme.palette.text.disabled }),
        })}
      >
        {children}
      </Box>
    </Box>
  );
}
