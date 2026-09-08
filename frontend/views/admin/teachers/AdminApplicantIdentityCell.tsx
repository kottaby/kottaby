"use client";

/**
 * AdminApplicantIdentityCell — the applicant-queue identity column: the
 * desktop-only `TableCell` (avatar + name PROFILE LINK + email + copy-email
 * quick action — the name link is the `DirectoryUserIdentityCell` recipe
 * verbatim: every applicant is a user, so `/admin/users/{id}` is the
 * governance surface where certification actions live) plus the explicit
 * view-profile quick action (the row's keyboard/touch affordance).
 *
 * Also exports `ApplicantDirectoryItem` — the applicant-queue list-item row
 * consumed by every cell component of the queue surfaces.
 *
 * Bidi note (Latin names/emails inside an RTL page): the HTML `dir="ltr"`
 * ATTRIBUTE isolates glyph direction and participates in the bidi
 * algorithm. A CSS `direction: "ltr"` rule MUST NOT be added —
 * stylis-plugin-rtl flips it to `rtl` and it would override the attribute,
 * clipping the START of the text.
 */

import { ContentCopyOutlined as CopyIcon, VisibilityOutlined as ProfileIcon } from "@mui/icons-material";
import { Box, IconButton, Link as MuiLink, Stack, TableCell, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminTeacherApplicantsQuery } from "@/frontend/graphql/generated/gql/graphql";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for queue avatars (expression-passed — a `role` string
 * attribute would trip the ARIA role lint against a component prop). */
const APPLICANT_AVATAR_ROLE = "Teacher" as const;

/** Applicant-queue list-item row consumed by the cell components. */
export type ApplicantDirectoryItem = AdminTeacherApplicantsQuery["adminTeacherApplicants"]["items"][number];

interface ApplicantIdentityCellProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

/**
 * Desktop identity cell — role-tinted initials avatar (the Teacher lane) +
 * name PROFILE LINK + ellipsized email + copy-email quick action. The name
 * link mirrors `DirectoryUserIdentityCell` exactly (same href recipe, same
 * ≥44px tap-target padding trick).
 */
export function ApplicantIdentityCell({ applicant, labels, onCopyEmail }: ApplicantIdentityCellProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(applicant.email, onCopyEmail);
  return (
    <TableCell sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <UserAvatar fullName={applicant.name} role={APPLICANT_AVATAR_ROLE} size={40} />
        <Box sx={{ minWidth: 0 }}>
          <MuiLink
            component={Link}
            href={`/admin/users/${applicant.id}`}
            underline="hover"
            aria-label={`${labels.quickActions.viewProfile}: ${applicant.name}`}
            title={applicant.name}
            dir="ltr"
            sx={theme => ({
              display: "block",
              maxWidth: "100%",
              fontSize: 15,
              fontWeight: 600,
              color: theme.palette.text.primary,
              unicodeBidi: "isolate",
              textAlign: "start",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              // ≥44px tap target without changing the row's visual density:
              // transparent block padding grows the clickable box while the
              // matching negative margins keep the layout height unchanged.
              minHeight: 44,
              paddingBlock: "10.5px",
              marginBlock: "-10.5px",
            })}
          >
            {applicant.name}
          </MuiLink>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography
              variant="body2"
              component="div"
              title={applicant.email}
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
              {applicant.email}
            </Typography>
            <Tooltip
              title={emailCopied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail}
              placement="top"
              enterTouchDelay={0}
              leaveTouchDelay={1500}
            >
              <IconButton
                size="small"
                aria-label={`${labels.quickActions.copyEmail}: ${applicant.email}`}
                onClick={event => {
                  // Copy only — the click must not also trigger the row.
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
      </Stack>
    </TableCell>
  );
}

interface ViewProfileButtonProps {
  readonly applicantId: number;
  readonly applicantName: string;
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
}

/**
 * The explicit view-profile quick action — the row's keyboard/touch
 * affordance for the governance surface (the identity cell's name link is
 * pointer convenience; this button is the real focusable control).
 */
export function ViewProfileButton({ applicantId, applicantName, labels }: ViewProfileButtonProps): ReactNode {
  return (
    <Tooltip title={labels.quickActions.viewProfile} placement="top">
      <IconButton
        size="small"
        component={Link}
        href={`/admin/users/${applicantId}`}
        aria-label={`${labels.quickActions.viewProfile}: ${applicantName}`}
        sx={theme => ({
          // ≥44px touch target via transparent padding; the icon stays
          // visually 20px.
          p: 1.5,
          my: -1.5,
          flexShrink: 0,
          color: theme.palette.text.secondary,
        })}
      >
        <ProfileIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
