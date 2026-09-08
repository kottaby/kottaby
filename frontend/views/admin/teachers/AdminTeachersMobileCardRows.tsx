"use client";

/**
 * AdminTeachersMobileCardRows — the shared building blocks of the admin
 * teachers mobile cards (the certified-teacher directory's
 * `AdminTeacherMobileCard` and the applicant queue's
 * `AdminApplicantMobileCard`): the full-card-width email row, the copy-email
 * quick action, and the strict two-column detail row.
 */

import { ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface MobileCardEmailRowProps {
  readonly email: string;
  readonly deleted: boolean;
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
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
export function MobileCardEmailRow({ email, deleted, labels, onCopyEmail }: MobileCardEmailRowProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(email, onCopyEmail);
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
        {email}
      </Typography>
      <MobileCardCopyButton email={email} copied={emailCopied} labels={labels} onCopy={handleCopyEmail} />
    </Box>
  );
}

interface MobileCardCopyButtonProps {
  readonly email: string;
  readonly copied: boolean;
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
  readonly onCopy: () => void;
}

/** The copy-email quick action — ≥44px touch target via transparent padding. */
export function MobileCardCopyButton({ email, copied, labels, onCopy }: MobileCardCopyButtonProps): ReactNode {
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

interface MobileCardDetailRowProps {
  readonly label: string;
  readonly dimmed: boolean;
  readonly children: ReactNode;
}

/** Strict two-column body row: label pinned to the inline-start edge, value
 *  cell flexes to fill and pins its content to the inline-end edge. */
export function MobileCardDetailRow({ label, dimmed, children }: MobileCardDetailRowProps): ReactNode {
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
