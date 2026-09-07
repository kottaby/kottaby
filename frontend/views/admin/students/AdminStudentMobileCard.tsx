"use client";

/**
 * AdminStudentMobileCard — one per-student card of the mobile directory
 * list (radius 12, `border.light` outline, 16px padding):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the name/email/copy-email block (truncating with the shared
 *    bidi ellipsis recipe), and a trailing column stacking the joined
 *    timestamp caption (this directory is read-only — no kebab menu),
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Balances, Parent,
 *    Languages, Trial.
 */

import { ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { Box, Card, Divider, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  StudentBalancesBadges,
  type StudentDirectoryItem,
  StudentLanguageChips,
  StudentParentContent,
  StudentTrialContent,
} from "@/frontend/views/admin/students/AdminStudentRowCells";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
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
}

export function AdminStudentMobileCard({
  labels,
  student,
  locale,
  onCopyEmail,
}: AdminStudentMobileCardProps): ReactNode {
  const joinedCaption = formatApplicantDate(student.createdAt, locale);
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 2,
      })}
    >
      {/*
        Header as a 3-track grid — [avatar 44px] [name/email block (flexible,
        minmax(0,1fr) so it can shrink and ellipsize)] [joined caption]. The
        middle block reserves every free pixel for the text; the trailing
        column stacks vertically so the name/email block keeps ≥ ~180px at a
        390px viewport. This surface is read-only, so there is no kebab
        column — the joined caption fills the trailing track.
      */}
      <Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 1 }}>
        <UserAvatar fullName={student.name} role={STUDENT_AVATAR_ROLE} size={44} />
        <MobileStudentIdentity student={student} labels={labels} onCopyEmail={onCopyEmail} />
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary, textAlign: "end" })}>
            {joinedCaption}
          </Typography>
        </Box>
      </Box>
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

interface MobileStudentIdentityProps {
  readonly student: StudentDirectoryItem;
  readonly labels: Pick<AdminStudentsLabels, "quickActions">;
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
function MobileStudentIdentity({ student, labels, onCopyEmail }: MobileStudentIdentityProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(student.email, onCopyEmail);
  return (
    <Box sx={{ minWidth: 0 }}>
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
            color: theme.palette.text.secondary,
          })}
        >
          {student.email}
        </Typography>
        <Tooltip title={emailCopied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail} placement="top">
          <IconButton
            size="small"
            aria-label={`${labels.quickActions.copyEmail}: ${student.email}`}
            onClick={handleCopyEmail}
            sx={theme => ({
              // ≥44px touch target via transparent padding; the icon stays
              // visually 20px. flexShrink: 0 keeps the wrapping email at its
              // full available width instead of squeezing under the icon.
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
  );
}

interface MobileDetailRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** Strict two-column body row: label pinned to the inline-start edge, value
 *  cell flexes to fill and pins its content to the inline-end edge. */
function MobileDetailRow({ label, children }: MobileDetailRowProps): ReactNode {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0, textAlign: "start" })}
      >
        {label}
      </Typography>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          justifyContent: "flex-end",
          textAlign: "end",
          fontWeight: 500,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
