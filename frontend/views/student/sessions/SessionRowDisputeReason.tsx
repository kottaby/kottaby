"use client";

import { GavelOutlined as DisputeIcon } from "@mui/icons-material";
import { Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { formatApplicantDate, formatLedgerStamp } from "@/frontend/lib/i18n/format-date";
import { Sessions, useAppTranslation } from "@/shared/locale";
import type { AppLocale } from "@/shared/locale/AppLocale";

interface SessionRowDisputeReasonProps {
  /** Row identity (testid suffix). */
  readonly sessionId: string;
  /** Persisted dispute reason — never empty here (service-side required). */
  readonly reason: string;
  /** The moment the dispute was opened (rendered locale-aware, muted). */
  readonly disputedAt: string;
  /** Active request locale — drives the date formatter. */
  readonly locale: AppLocale;
}

/**
 * Participant-side dispute line — rendered ONLY while the row carries a
 * persisted dispute reason (open OR already-arbitrated: the claimed reason
 * stays part of the case story). Truncated to one line with the FULL reason
 * reachable through the tooltip; the disputed moment sits at the line end
 * (flexShrink:0 — the truncation ellipsis always lands on the reason run,
 * never on the date). Mirrors `SessionRowCancelReason`'s RTL-safe clamp
 * (min-width:0 + xs full-bleed pin) so the line cannot push the card wider
 * inside the wrap-friendly flex row.
 *
 * Both surfaces (student + teacher) share this row part — the dispute was
 * previously visible ONLY through the status chip, leaving the non-filing
 * participant without the "why".
 */
export function SessionRowDisputeReason({
  sessionId,
  reason,
  disputedAt,
  locale,
}: Readonly<SessionRowDisputeReasonProps>): ReactNode {
  const t = useAppTranslation(Sessions);

  return (
    <Tooltip title={reason} placement="top">
      <Stack
        data-testid={`session-dispute-reason-${sessionId}`}
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
        <DisputeIcon
          fontSize="small"
          sx={theme => ({ color: theme.palette.warning.main, fontSize: 16, flexShrink: 0, alignSelf: "center" })}
        />
        <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0 })}>
          {t.disputeReasonLine}
        </Typography>
        <Typography
          variant="body2"
          noWrap
          sx={theme => ({ color: theme.palette.text.secondary, minWidth: 0, flex: "1 1 0" })}
        >
          {reason}
        </Typography>
        <Typography
          variant="body2"
          noWrap
          dir="ltr"
          title={formatApplicantDate(disputedAt, locale)}
          sx={theme => ({
            color: theme.palette.text.secondary,
            flexShrink: 0,
            opacity: 0.75,
            // ASCII stamp in an isolated LTR box — the ICU `ar` stamp's RLM
            // controls scramble the visible punctuation against the row's
            // RTL base direction (round-1 wallet QA finding, same class).
            unicodeBidi: "isolate",
            fontVariantNumeric: "tabular-nums",
          })}
        >
          {formatLedgerStamp(disputedAt)}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
