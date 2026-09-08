"use client";

/**
 * AdminStudentMobileCardRows — the per-student mobile card's row-level
 * building blocks, extracted from `AdminStudentMobileCard` (same visual
 * output):
 *  - `MobileStudentEmailRow`: the full-card-width email row rendered
 *    between the header grid and the divider,
 *  - `MobileDetailRow`: the strict two-column body row (label pinned to
 *    the inline-start edge, value cell flexing to the inline-end edge).
 */

import { ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { StudentDirectoryItem } from "@/frontend/views/admin/students/AdminStudentRowCells";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface MobileStudentEmailRowProps {
  readonly student: StudentDirectoryItem;
  readonly labels: Pick<AdminStudentsLabels, "quickActions">;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

/**
 * The full-card-width email row rendered between the header grid and the
 * divider. Layout rationale (QA fix): the old placement inside the header
 * grid's middle track squeezed addresses into ~180px and wrapped them
 * mid-word into 2–3 ragged lines — the row now spans the whole card and is
 * inset with the LOGICAL `paddingInlineStart: "52px"` (44px avatar + 8px grid
 * gap) so the email aligns under the name column; the inset flips correctly
 * under RTL. The email WRAPS (no ellipsis) so the full address stays
 * visible, with `overflowWrap: "anywhere"` as the pathological-address
 * fallback (seed addresses fit one line at ~full card width). The copy
 * affordance is unchanged: clipboard + success tint + `stopPropagation`
 * (the card click opens the detail drawer — copy must not), ≥44px touch
 * target via transparent padding, `flexShrink: 0` so the button never
 * squeezes the address narrower.
 *
 * Bidi note (Latin emails inside an RTL page): the HTML `dir="ltr"`
 * ATTRIBUTE isolates glyph direction — a CSS `direction` rule MUST NOT be
 * added (stylis-plugin-rtl would flip it and clip the string's head). With
 * the attribute alone plus `unicodeBidi: "isolate"`, `text-align: start`
 * reads correctly in both directions.
 */
export function MobileStudentEmailRow({ student, labels, onCopyEmail }: MobileStudentEmailRowProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(student.email, onCopyEmail);
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
          color: theme.palette.text.secondary,
        })}
      >
        {student.email}
      </Typography>
      <Tooltip title={emailCopied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail} placement="top">
        <IconButton
          size="small"
          aria-label={`${labels.quickActions.copyEmail}: ${student.email}`}
          onClick={event => {
            // Copy only — the click must not also open the detail drawer.
            event.stopPropagation();
            handleCopyEmail();
          }}
          sx={theme => ({
            // ≥44px touch target via transparent padding; the icon stays
            // visually 20px. flexShrink: 0 keeps the email at its full
            // available width instead of squeezing under the icon.
            p: 1.5,
            my: -1.5,
            flexShrink: 0,
            color: emailCopied ? theme.palette.success.main : theme.palette.text.secondary,
          })}
        >
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

interface MobileDetailRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** Strict two-column body row: label pinned to the inline-start edge, value
 *  cell flexes to fill and pins its content to the inline-end edge. */
export function MobileDetailRow({ label, children }: MobileDetailRowProps): ReactNode {
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
