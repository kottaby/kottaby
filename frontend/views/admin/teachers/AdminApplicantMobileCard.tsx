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
 *    divider): the email + copy-email quick action live in their own row
 *    spanning the whole card instead of squeezing into the header's middle
 *    track (at 390px that track is ~180px and long addresses wrapped
 *    mid-word — QA-verified). The row is inset with the LOGICAL
 *    `paddingInlineStart: "52px"` (44px avatar + 8px grid gap) so the email
 *    aligns under the name column and the inset flips correctly under RTL;
 *    at ~full card width even seeded addresses fit one line, with
 *    `overflowWrap: "anywhere"` as the pathological-address fallback;
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (lifecycle
 *    chip + governance pills), Attempts, Last attempt, Cooldown.
 *
 * Soft-deleted applicants render dimmed (name/email drop to the disabled
 * ink and the name is struck through).
 */

import { ContentCopyOutlined as CopyIcon, VisibilityOutlined as ProfileIcon } from "@mui/icons-material";
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
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
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
      <MobileApplicantEmailRow applicant={applicant} labels={labels} deleted={deleted} onCopyEmail={onCopyEmail} />
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={1}>
        <MobileDetailRow label={labels.headers.status} dimmed={deleted}>
          <ApplicantStatusStack applicant={applicant} labels={labels} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.applicantHeaders.attempts} dimmed={deleted}>
          <ApplicantAttemptsText applicant={applicant} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.applicantHeaders.lastAttempt} dimmed={deleted}>
          <ApplicantLastAttemptText applicant={applicant} locale={locale} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.applicantHeaders.cooldown} dimmed={deleted}>
          <ApplicantCooldownContent applicant={applicant} locale={locale} labels={labels} />
        </MobileDetailRow>
      </Stack>
    </Card>
  );
}

interface MobileApplicantEmailRowProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
  readonly deleted: boolean;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

/**
 * The full-card-width email row rendered between the header grid and the
 * divider. Layout rationale (QA fix): the old placement inside the header
 * grid's middle track squeezed addresses into ~180px and wrapped them
 * mid-word — the row now spans the whole card and is inset with the LOGICAL
 * `paddingInlineStart: "52px"` (44px avatar + 8px grid gap) so the email aligns
 * under the name column; the inset flips correctly under RTL. The email
 * WRAPS (no ellipsis) so the full address stays visible, with
 * `overflowWrap: "anywhere"` as the pathological-address fallback. The copy
 * affordance is unchanged (clipboard + success tint + `stopPropagation`,
 * ≥44px touch target via transparent padding, `flexShrink: 0`).
 *
 * Bidi note (Latin emails inside an RTL page): the HTML `dir="ltr"`
 * ATTRIBUTE isolates glyph direction — a CSS `direction` rule MUST NOT be
 * added (stylis-plugin-rtl would flip it and clip the string's head). With
 * the attribute alone plus `unicodeBidi: "isolate"`, `text-align: start`
 * reads correctly in both directions.
 */
function MobileApplicantEmailRow({ applicant, labels, deleted, onCopyEmail }: MobileApplicantEmailRowProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(applicant.email, onCopyEmail);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        mt: 0.5,
        minWidth: 0,
        // 44px avatar + 8px grid gap — the email starts under the name
        // column; logical property so RTL mirrors the inset. Explicit px
        // STRING — a bare number would go through MUI's spacing transform
        // (×8) and inflate the inset to 416px.
        paddingInlineStart: "52px",
      }}
    >
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
        {applicant.email}
      </Typography>
      <CopyIconButton email={applicant.email} copied={emailCopied} labels={labels} onCopy={handleCopyEmail} />
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
          // Copy only — the click must not also trigger the card.
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
