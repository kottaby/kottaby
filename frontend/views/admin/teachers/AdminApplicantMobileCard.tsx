"use client";

/**
 * AdminApplicantMobileCard — one per-applicant card of the mobile queue
 * list (radius 12, `border.light` outline, 16px padding):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the single-line ellipsized NAME profile link (the shared bidi
 *    ellipsis recipe), and a trailing column stacking the joined timestamp
 *    caption above the explicit view-profile quick action (the queue has no
 *    drawer — the card itself stays inert and only the links navigate);
 *  - FULL-WIDTH email row immediately BELOW the header grid (above the
 *    divider) — the shared `MobileCardEmailRow` (`AdminTeachersMobileCardRows`);
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (lifecycle
 *    chip + governance pills), Attempts, Last attempt, Cooldown — the
 *    shared `MobileCardDetailRow`.
 *
 * Soft-deleted applicants render dimmed (name/email drop to the disabled
 * ink and the name is struck through).
 */

import { VisibilityOutlined as ProfileIcon } from "@mui/icons-material";
import { Box, Card, Divider, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  ApplicantAttemptsText,
  ApplicantCooldownContent,
  type ApplicantDirectoryItem,
  ApplicantLastAttemptText,
  ApplicantStatusStack,
} from "@/frontend/views/admin/teachers/AdminApplicantRowCells";
import { MobileCardDetailRow, MobileCardEmailRow } from "@/frontend/views/admin/teachers/AdminTeachersMobileCardRows";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
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
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 2,
      })}
    >
      {/*
        Header as a 3-track grid — [avatar 44px] [NAME profile link (flexible,
        minmax(0,1fr) so it can shrink and ellipsize)] [joined caption +
        view-profile quick action]. The name ALONE lives in the middle
        track: the email + copy affordance moved OUT to the full-width row
        below the grid, so the middle track no longer has to share its ~180px
        with a wrapping address. This surface is read-only, so there is no
        kebab column — the joined caption and the view-profile quick action
        fill the trailing track.
      */}
      <Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 1 }}>
        <UserAvatar fullName={applicant.name} role={APPLICANT_AVATAR_ROLE} size={44} />
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
            unicodeBidi: "isolate",
            textAlign: "start",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            color: deleted ? theme.palette.text.disabled : theme.palette.text.primary,
            // ≥44px tap target without shifting the layout below: transparent
            // block padding grows the clickable box while the matching
            // negative margins keep the layout height unchanged.
            minHeight: 44,
            paddingBlock: "10.5px",
            marginBlock: "-10.5px",
            ...(deleted && { textDecoration: "line-through" }),
          })}
        >
          {applicant.name}
        </MuiLink>
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
          <Tooltip title={labels.quickActions.viewProfile} placement="top">
            <IconButton
              size="small"
              component={Link}
              href={`/admin/users/${applicant.id}`}
              aria-label={`${labels.quickActions.viewProfile}: ${applicant.name}`}
              sx={theme => ({
                // ≥44px touch target via transparent padding; the icon
                // stays visually 20px.
                p: 1.5,
                my: -0.75,
                color: theme.palette.text.secondary,
              })}
            >
              <ProfileIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <MobileCardEmailRow email={applicant.email} labels={labels} deleted={deleted} onCopyEmail={onCopyEmail} />
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={1}>
        <MobileCardDetailRow label={labels.headers.status} dimmed={deleted}>
          <ApplicantStatusStack applicant={applicant} labels={labels} />
        </MobileCardDetailRow>
        <MobileCardDetailRow label={labels.applicantHeaders.attempts} dimmed={deleted}>
          <ApplicantAttemptsText applicant={applicant} />
        </MobileCardDetailRow>
        <MobileCardDetailRow label={labels.applicantHeaders.lastAttempt} dimmed={deleted}>
          <ApplicantLastAttemptText applicant={applicant} locale={locale} />
        </MobileCardDetailRow>
        <MobileCardDetailRow label={labels.applicantHeaders.cooldown} dimmed={deleted}>
          <ApplicantCooldownContent applicant={applicant} locale={locale} labels={labels} />
        </MobileCardDetailRow>
      </Stack>
    </Card>
  );
}
