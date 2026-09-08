"use client";

/**
 * AdminTeacherDetailDrawer identity section — the identity hero card:
 * role-tinted avatar, name, copy-email affordance, and the contact rows
 * (phone, country, joined timestamp).
 *
 * RTL/bidi: Latin names/emails/phones are pinned with the HTML `dir="ltr"`
 * ATTRIBUTE + `unicodeBidi: isolate` — a CSS `direction` rule MUST NOT be
 * added (stylis-plugin-rtl flips it and clips the string's head).
 */

import { ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  DrawerSection,
  EmptyValue,
  LabelValueRow,
} from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerPrimitives";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for the drawer avatar (expression-passed — matches the rows). */
const TEACHER_AVATAR_ROLE = "Teacher" as const;

interface TeacherDrawerIdentitySectionProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: AdminTeachersLabels;
  readonly locale: AppLocale;
  readonly onCopyEmail?: () => void;
}

/** Identity hero — role-tinted avatar, name, copy-email affordance, contact rows. */
export function TeacherDrawerIdentitySection({
  teacher,
  labels,
  locale,
  onCopyEmail,
}: TeacherDrawerIdentitySectionProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(teacher.email, onCopyEmail);
  return (
    <DrawerSection label={labels.drawer.sectionIdentity}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1.5 }}>
        <UserAvatar fullName={teacher.name} role={TEACHER_AVATAR_ROLE} size={64} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="div"
            title={teacher.name}
            dir="ltr"
            sx={{
              fontSize: 17,
              fontWeight: 600,
              unicodeBidi: "isolate",
              textAlign: "start",
              overflowWrap: "anywhere",
            }}
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
                color: theme.palette.text.secondary,
                unicodeBidi: "isolate",
                textAlign: "start",
                overflowWrap: "anywhere",
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
                  // Keep the drawer from reacting to the quick action.
                  event.stopPropagation();
                  handleCopyEmail();
                }}
                sx={theme => ({
                  p: 1.5,
                  my: -1.5,
                  flexShrink: 0,
                  color: emailCopied ? theme.palette.success.main : theme.palette.text.secondary,
                })}
              >
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>
      <LabelValueRow label={labels.fields.phone} ltr>
        {teacher.phone ?? <EmptyValue />}
      </LabelValueRow>
      <LabelValueRow label={labels.fields.country}>{teacher.country ?? <EmptyValue />}</LabelValueRow>
      <LabelValueRow label={labels.headers.joined}>{formatApplicantDate(teacher.createdAt, locale)}</LabelValueRow>
    </DrawerSection>
  );
}
