"use client";

/**
 * AdminTeacherMobileCard — one per-teacher card of the mobile directory
 * list (radius 12, `border.light` outline, 16px padding):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the single-line ellipsized NAME (the shared bidi ellipsis
 *    recipe), and a trailing column stacking the joined timestamp caption
 *    above the explicit view-details quick action (read-only directory —
 *    no kebab menu; the card click and the quick action both open the
 *    detail drawer);
 *  - FULL-WIDTH email row immediately BELOW the header grid (above the
 *    divider) — the shared `MobileCardEmailRow` (`AdminTeachersMobileCardRows`);
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (approval
 *    pill + presence + governance pills), Rating, Subjects, Evaluator — the
 *    shared `MobileCardDetailRow`.
 *
 * Soft-deleted teachers render dimmed (name/email drop to the disabled ink).
 */

import { VisibilityOutlined as ViewIcon } from "@mui/icons-material";
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
import { MobileCardDetailRow, MobileCardEmailRow } from "@/frontend/views/admin/teachers/AdminTeachersMobileCardRows";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
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
        Header as a 3-track grid — [avatar 44px] [NAME (flexible,
        minmax(0,1fr) so it can shrink and ellipsize)] [joined caption +
        view-details quick action]. The name ALONE lives in the middle
        track: the email + copy affordance moved OUT to the full-width row
        below the grid, so the middle track no longer has to share its ~180px
        with a wrapping address. This surface is read-only, so there is no
        kebab column — the joined caption and the view-details quick action
        fill the trailing track.
      */}
      <Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 1 }}>
        <UserAvatar fullName={teacher.name} role={TEACHER_AVATAR_ROLE} size={44} />
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
      <MobileCardEmailRow email={teacher.email} labels={labels} deleted={deleted} onCopyEmail={onCopyEmail} />
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={1}>
        <MobileCardDetailRow label={labels.headers.status} dimmed={deleted}>
          <TeacherStatusStack teacher={teacher} labels={labels} />
        </MobileCardDetailRow>
        <MobileCardDetailRow label={labels.headers.rating} dimmed={deleted}>
          <TeacherRatingText teacher={teacher} locale={locale} />
        </MobileCardDetailRow>
        <MobileCardDetailRow label={labels.headers.subjects} dimmed={deleted}>
          <TeacherSubjectsChips teacher={teacher} />
        </MobileCardDetailRow>
        <MobileCardDetailRow label={labels.statusPills.evaluator} dimmed={deleted}>
          <TeacherEvaluatorChip teacher={teacher} labels={labels} />
        </MobileCardDetailRow>
      </Stack>
    </Card>
  );
}
