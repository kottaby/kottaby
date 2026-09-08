"use client";

/**
 * AdminStudentMobileCard — one per-student card of the mobile directory
 * list (radius 12, `border.light` outline, 16px padding):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the single-line ellipsized NAME (the shared bidi ellipsis
 *    recipe), and a trailing column stacking the joined timestamp caption
 *    above the explicit view-details quick action (read-only directory —
 *    no kebab menu; the card click and the quick action both open the
 *    detail drawer);
 *  - FULL-WIDTH email row immediately BELOW the header grid (above the
 *    divider): the email + copy-email quick action live in their own row
 *    spanning the whole card instead of squeezing into the header's middle
 *    track (at 390px that track is ~180px and long addresses wrapped
 *    mid-word into 2–3 ragged lines — QA-verified);
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Balances, Parent,
 *    Languages, Trial.
 *
 * The email row and the body-row primitive live beside this file in
 * `AdminStudentMobileCardRows.tsx`.
 */

import { VisibilityOutlined as ViewIcon } from "@mui/icons-material";
import { Box, Card, Divider, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { MobileDetailRow, MobileStudentEmailRow } from "@/frontend/views/admin/students/AdminStudentMobileCardRows";
import { StudentParentContent } from "@/frontend/views/admin/students/AdminStudentParentContent";
import {
  StudentBalancesBadges,
  type StudentDirectoryItem,
  StudentLanguageChips,
  StudentTrialContent,
} from "@/frontend/views/admin/students/AdminStudentRowCells";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

/** Role lane for directory avatars (expression-passed — a `role` string
 * attribute would trip the ARIA role lint against a component prop). */
const STUDENT_AVATAR_ROLE = "Student" as const;

interface AdminStudentMobileCardProps {
  readonly labels: AdminStudentsLabels;
  readonly student: StudentDirectoryItem;
  readonly locale: "ar" | "en";
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for this card (the directory owns the drawer). */
  readonly onViewDetails?: (student: StudentDirectoryItem) => void;
}

export function AdminStudentMobileCard({
  labels,
  student,
  locale,
  onCopyEmail,
  onViewDetails,
}: AdminStudentMobileCardProps): ReactNode {
  const joinedCaption = formatApplicantDate(student.createdAt, locale);
  const openDetails = onViewDetails === undefined ? undefined : () => onViewDetails(student);
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
        <UserAvatar fullName={student.name} role={STUDENT_AVATAR_ROLE} size={44} />
        <Typography
          component="div"
          title={student.name}
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
            color: theme.palette.text.primary,
          })}
        >
          {student.name}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary, textAlign: "end" })}>
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
      <MobileStudentEmailRow student={student} labels={labels} onCopyEmail={onCopyEmail} />
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={1}>
        <MobileDetailRow label={labels.headers.balances}>
          <StudentBalancesBadges student={student} labels={labels} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.headers.parent}>
          <StudentParentContent student={student} labels={labels} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.headers.languages}>
          <StudentLanguageChips student={student} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.headers.trial}>
          <StudentTrialContent student={student} locale={locale} labels={labels} />
        </MobileDetailRow>
      </Stack>
    </Card>
  );
}
