"use client";

/**
 * AdminApplicantRowCells — shared cell-level components for the admin
 * applicant-queue surfaces (desktop table + mobile card list).
 *
 * Both surfaces render the SAME semantic content per row — lifecycle status
 * chip, governance pills, attempts count, last-attempt timestamp, cooldown
 * (date or cooling-down chip), joined timestamp — so the rendering lives in
 * this component family and each surface composes it.
 *
 * Structure mirrors the directory split:
 *  - `ApplicantIdentityCell` → desktop-only `TableCell` (avatar + name
 *    PROFILE LINK + email + copy-email quick action — the name link is the
 *    `DirectoryUserIdentityCell` recipe verbatim: every applicant is a
 *    user, so `/admin/users/{id}` is the governance surface where
 *    certification actions live).
 *  - `ApplicantStatusStack`  → content-only (status chip + governance
 *    pills), reused by the desktop cell and the mobile body row.
 *  - `ApplicantAttemptsText` / `ApplicantLastAttemptText` /
 *    `ApplicantCooldownContent` / `ApplicantJoinedText` → content-only
 *    cells.
 *  - `ViewProfileButton`     → the explicit per-row navigation affordance
 *    (44px touch target, keyboard/touch access to the full profile).
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
 * clipping the START of the text.
 *
 * The copy affordance writes the email to the clipboard and reports success
 * through `onCopyEmail` (the panel owns the shared success snackbar);
 * clipboard failures are silently dropped so the snackbar never lies about
 * a copy that did not happen.
 */

import { ContentCopyOutlined as CopyIcon, VisibilityOutlined as ProfileIcon } from "@mui/icons-material";
import { Box, IconButton, Link as MuiLink, Stack, TableCell, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import type { AdminTeacherApplicantsQuery } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  applicantStatusLabel,
  applicantStatusTone,
  isCoolingDown,
} from "@/frontend/views/admin/teachers/adminApplicants.helpers";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { TonalChip, UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AppLocale } from "@/shared/locale";
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

interface ApplicantStatusStackProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "applicantStatus" | "statusPills">;
}

/**
 * Status content — the lifecycle headline chip (tone-mapped, honest
 * verbatim fallback for unknown wire values) plus the governance pills
 * (deleted / suspended / blocked, rendered only when the flag is set).
 * Wrapped in a wrapping row so the mobile card and the desktop cell share
 * one composition.
 */
export function ApplicantStatusStack({ applicant, labels }: ApplicantStatusStackProps): ReactNode {
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", rowGap: 0.5, columnGap: 1, minWidth: 0 }}>
      <ApplicantStatusChip applicant={applicant} labels={labels} />
      <ApplicantGovernancePills applicant={applicant} labels={labels} />
    </Stack>
  );
}

interface ApplicantStatusChipProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "applicantStatus">;
}

/** Lifecycle headline chip — tone-mapped with an honest neutral fallback. */
export function ApplicantStatusChip({ applicant, labels }: ApplicantStatusChipProps): ReactNode {
  return (
    <TonalChip
      tone={applicantStatusTone(applicant.status)}
      label={applicantStatusLabel(applicant.status, labels.applicantStatus)}
    />
  );
}

interface ApplicantGovernancePillsProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly labels: Pick<AdminTeachersLabels, "statusPills">;
}

/**
 * Governance pills — deleted / suspended / blocked, each rendered only when
 * its flag is set (priority semantics stay on the backend; the pills are a
 * faithful set rendering). Renders nothing when no governance flag is set.
 */
export function ApplicantGovernancePills({ applicant, labels }: ApplicantGovernancePillsProps): ReactNode {
  return (
    <>
      {applicant.isDeleted && <TonalChip tone="error" label={labels.statusPills.deleted} />}
      {applicant.suspended && <TonalChip tone="warning" label={labels.statusPills.suspended} />}
      {applicant.isBlocked && <TonalChip tone="error" label={labels.statusPills.blocked} />}
    </>
  );
}

interface ApplicantAttemptsTextProps {
  readonly applicant: ApplicantDirectoryItem;
}

/** Attempts content — the wire count rendered verbatim (0 is honest data). */
export function ApplicantAttemptsText({ applicant }: ApplicantAttemptsTextProps): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.primary, fontWeight: 500 })}>
      {applicant.verificationAttempts}
    </Typography>
  );
}

interface ApplicantLastAttemptTextProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly locale: AppLocale;
}

/** Last-attempt content — localized timestamp, honest em-dash before the first attempt. */
export function ApplicantLastAttemptText({ applicant, locale }: ApplicantLastAttemptTextProps): ReactNode {
  if (applicant.lastAttemptAt === null) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {formatApplicantDate(applicant.lastAttemptAt, locale)}
    </Typography>
  );
}

interface ApplicantCooldownContentProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly locale: AppLocale;
  readonly labels: Pick<AdminTeachersLabels, "applicantStatus">;
}

/**
 * Cooldown content — the cooling-down chip while the window is still in the
 * future, the localized expiry timestamp once set, or the honest em-dash
 * before any cooldown was granted.
 *
 * Hydration note: the chip's visibility depends on a clock comparison, so
 * the `now` tick resolves to "never cooling" on the server render and the
 * first client render (deterministic markup), then settles post-mount —
 * the chip appears after hydration when the window is live, never flickers
 * a mismatch.
 */
export function ApplicantCooldownContent({ applicant, locale, labels }: ApplicantCooldownContentProps): ReactNode {
  // `null` until mounted — the SSR + first-client render must stay byte-
  // identical, so the clock-dependent chip only turns on post-hydration.
  const [mountedNow, setMountedNow] = useState<number | null>(null);
  useEffect(() => {
    setMountedNow(Date.now());
  }, []);
  if (isCoolingDown(applicant.cooldownUntil, mountedNow ?? Number.POSITIVE_INFINITY)) {
    return <TonalChip tone="warning" label={labels.applicantStatus.coolingDown} />;
  }
  if (applicant.cooldownUntil === null) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {formatApplicantDate(applicant.cooldownUntil, locale)}
    </Typography>
  );
}

interface ApplicantJoinedTextProps {
  readonly applicant: ApplicantDirectoryItem;
  readonly locale: AppLocale;
}

/** Joined content — localized timestamp via the shared frontend date util. */
export function ApplicantJoinedText({ applicant, locale }: ApplicantJoinedTextProps): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {formatApplicantDate(applicant.createdAt, locale)}
    </Typography>
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
