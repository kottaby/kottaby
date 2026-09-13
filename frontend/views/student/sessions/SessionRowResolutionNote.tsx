"use client";

import { CheckCircleOutlined as ResolvedIcon } from "@mui/icons-material";
import { Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { Sessions, useAppTranslation } from "@/shared/locale";
import type { AppLocale } from "@/shared/locale/AppLocale";

interface SessionRowResolutionNoteProps {
  /** Row identity (testid suffix). */
  readonly sessionId: string;
  /** The arbitration note the admin recorded — never empty here. */
  readonly note: string;
  /** The arbitration moment (rendered locale-aware, muted). */
  readonly resolvedAt: string;
  /** Active request locale — drives the date formatter. */
  readonly locale: AppLocale;
}

/**
 * Participant-side arbitration-outcome line — rendered ONLY when the row
 * carries the admin's resolution note (the arbitration terminal stamp).
 * The student and the teacher each see HOW the case ended on the row
 * itself: the note (truncated, full text through the tooltip) plus the
 * resolved moment at the line end (flexShrink:0 — the truncation ellipsis
 * always lands on the note run, never on the date). Mirrors
 * `SessionRowCancelReason`'s RTL-safe clamp (min-width:0 + xs full-bleed
 * pin) so the line cannot push the card wider inside the wrap-friendly
 * flex row.
 *
 * Tone: the check icon picks up `success.main` — the dispute reached a
 * decision; informational emphasis, never an error treatment (the note
 * copy itself stays neutral secondary text).
 */
export function SessionRowResolutionNote({
  sessionId,
  note,
  resolvedAt,
  locale,
}: Readonly<SessionRowResolutionNoteProps>): ReactNode {
  const t = useAppTranslation(Sessions);

  return (
    <Tooltip title={note} placement="top">
      <Stack
        data-testid={`session-resolution-note-${sessionId}`}
        sx={{
          gap: 0.5,
          flexDirection: "row",
          alignItems: "baseline",
          minWidth: 0,
          maxWidth: "100%",
          // Stretched column child (xs): the nowrap run inside an RTL line
          // lifts the stack's min-content width past the card — pin the
          // cross size and clip (same reasoning as the cancel-reason line).
          width: { xs: "100%", sm: "auto" },
          overflow: "hidden",
        }}
      >
        <ResolvedIcon
          fontSize="small"
          sx={theme => ({ color: theme.palette.success.main, fontSize: 16, flexShrink: 0, alignSelf: "center" })}
        />
        <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0 })}>
          {t.arbitrationOutcomeLine}
        </Typography>
        <Typography
          variant="body2"
          noWrap
          sx={theme => ({ color: theme.palette.text.secondary, minWidth: 0, flex: "1 1 0" })}
        >
          {note}
        </Typography>
        <Typography
          variant="body2"
          noWrap
          sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0, opacity: 0.75 })}
        >
          {formatApplicantDate(resolvedAt, locale)}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
