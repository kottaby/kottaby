"use client";

import { CheckCircleOutlined as ResolvedIcon } from "@mui/icons-material";
import { Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { DisputeResolution as WireDisputeResolution } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { resolutionOutcomeLabel } from "@/frontend/views/shared/disputes/resolution-outcome-label";
import { Sessions, useAppTranslation } from "@/shared/locale";
import type { AppLocale } from "@/shared/locale/AppLocale";

interface SessionRowResolutionNoteProps {
  /** Row identity (testid suffix). */
  readonly sessionId: string;
  /** The formal arbitration decision — null only for pre-CR-5 resolved rows. */
  readonly outcome: WireDisputeResolution | null;
  /**
   * The arbitration note the admin recorded — optional since CR-5: the
   * OUTCOME carries the line; the note is added detail when present.
   */
  readonly note: string | null;
  /** The arbitration moment (rendered locale-aware, muted). */
  readonly resolvedAt: string;
  /** Active request locale — drives the date formatter. */
  readonly locale: AppLocale;
}

/**
 * Participant-side arbitration-outcome line — rendered when the row
 * carries the arbitration terminal stamp (`resolvedAt`) and ANY decision
 * evidence (the stored outcome, or a pre-CR-5 note). The student and the
 * teacher each see HOW the case ended on the row itself: the formal
 * outcome (emphasized), the optional note (truncated, full text through
 * the tooltip), and the resolved moment at the line end (flexShrink:0 —
 * the truncation ellipsis always lands on the note run, never on the
 * date). Mirrors `SessionRowCancelReason`'s RTL-safe clamp (min-width:0 +
 * xs full-bleed pin) so the line cannot push the card wider inside the
 * wrap-friendly flex row.
 *
 * Tone: the check icon picks up `success.main` — the dispute reached a
 * decision; informational emphasis, never an error treatment (the outcome
 * and note copy stay neutral secondary text).
 */
export function SessionRowResolutionNote({
  sessionId,
  outcome,
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
          data-testid={`session-resolution-outcome-${sessionId}`}
          variant="body2"
          noWrap
          sx={theme => ({ color: theme.palette.text.secondary, fontWeight: 700, flexShrink: 0 })}
        >
          {resolutionOutcomeLabel(outcome, t)}
        </Typography>
        {note !== null ? (
          <Typography
            variant="body2"
            noWrap
            sx={theme => ({ color: theme.palette.text.secondary, minWidth: 0, flex: "1 1 0", opacity: 0.85 })}
          >
            {`— ${note}`}
          </Typography>
        ) : null}
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
