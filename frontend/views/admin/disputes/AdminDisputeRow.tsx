"use client";

import { Button, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SessionMetaCell, SessionRowCardShell } from "@/frontend/components/ui/sessionList";
import type { AdminDisputedSessionsQuery_adminDisputedSessions_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { AdminDisputeRowReason } from "@/frontend/views/admin/disputes/AdminDisputeRowReason";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import { useAppLocale } from "@/shared/locale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminDisputeRow — ONE disputed session rendered as a bordered list card in
 * the admin arbitration queue (`/disputes`, R-111).
 *
 * Presentation mirrors the participant `SessionRow` family (bordered card,
 * hover elevation, overline-label meta cells, verbatim fee) while the ROW
 * CONTENT is arbitration-specific:
 *  - the booking intent renders verbatim (server-owned value — the admin
 *    queue never maps intents through a client vocabulary);
 *  - the fee renders VERBATIM (decimal string, never parsed) followed by the
 *    `SESSION_FEE_CURRENCY` label;
 *  - the dispute reason the participant filed renders clamped to TWO lines
 *    with an expand/collapse affordance — the full text stays in the DOM so
 *    the accessibility tree and the clamp both see it (the clamped block,
 *    with its toggle state, lives in {@link AdminDisputeRowReason});
 *  - the creation moment + the dispute moment expand through the shared
 *    locale-aware {@link formatApplicantDate};
 *  - the participant ids render verbatim (admin is trusted — R-111);
 *  - the resolve affordance is caller-driven: the container owns the
 *    arbitration dialog open/close state, this row stays a pure affordance
 *    (`onResolveIntent` + optional `resolveDisabled` in-flight slot).
 *
 * MUI v9 discipline: `sx`-only styling, colors exclusively through
 * `theme.palette.*` callbacks (no raw hex), `*Outlined` icons only, RTL-safe
 * logical composition (no physical margins), ≥44px touch target on the
 * mobile CTA.
 */

/** Typographic placeholder for nullable payload values (NOT locale copy). */
const NO_VALUE_PLACEHOLDER = "—";

interface AdminDisputeRowProps {
  /** The disputed session payload row (normalized `Session` entity). */
  readonly session: AdminDisputedSessionsQuery_adminDisputedSessions_items;
  /** Localized sessions-namespace labels (the arbitration vocabulary). */
  readonly t: SessionsLabels;
  /** Resolve-CTA intent — the container owns the arbitration dialog state. */
  readonly onResolveIntent: (sessionId: string) => void;
  /** Disabled while the arbitration dialog for THIS row is open (in-flight slot). */
  readonly resolveDisabled?: boolean;
}

/** One arbitration-queue card: intent + fee + dispute reason + meta + resolve. */
export function AdminDisputeRow({
  session,
  t,
  onResolveIntent,
  resolveDisabled = false,
}: Readonly<AdminDisputeRowProps>): ReactNode {
  const locale = useAppLocale();

  const feeText = session.fee === null ? NO_VALUE_PLACEHOLDER : `${session.fee} ${SESSION_FEE_CURRENCY}`;
  const createdText = formatApplicantDate(session.createdAt, locale);
  const disputedText =
    session.disputedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(session.disputedAt, locale);
  const intentText = session.intent ?? NO_VALUE_PLACEHOLDER;
  const participantsText = `${session.studentId} · ${session.teacherId}`;
  // The dispute reason is REQUIRED on the open-dispute seam, but the wire
  // type stays nullable (pre-ticket rows carry null) — the reason block
  // degrades to the em-dash placeholder so the card never renders blank.
  const disputeReason = session.disputeReason ?? NO_VALUE_PLACEHOLDER;

  return (
    <SessionRowCardShell testId={`admin-dispute-row-${session.id}`}>
      <Stack
        sx={{
          gap: 1.5,
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <Stack sx={{ gap: 0.5, minWidth: 0 }}>
          <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.intent}
          </Typography>
          <Typography variant="h6" component="h3" sx={{ fontWeight: 700 }}>
            {intentText}
          </Typography>
        </Stack>
        <Stack sx={{ gap: 1.5, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}>
          <SessionMetaCell label={t.fee} value={feeText} />
          <SessionMetaCell label={t.createdAt} value={createdText} />
          <SessionMetaCell label={t.disputedAtLabel} value={disputedText} />
          <SessionMetaCell label={t.participantsLabel} value={participantsText} />
        </Stack>
      </Stack>

      <AdminDisputeRowReason sessionId={session.id} reason={disputeReason} t={t} />

      {/*
       * Row CTA holds FULL opacity at idle (the hover affordance lives on
       * the card shell) and disables while the arbitration dialog owns the
       * mutation — the ≥44px mobile hit target stays pinned.
       */}
      <Stack sx={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Tooltip title={t.resolveDisputeTitle} placement="top">
          <Button
            variant="outlined"
            color="primary"
            disabled={resolveDisabled}
            onClick={() => onResolveIntent(session.id)}
            data-testid={`admin-dispute-action-${session.id}-resolve`}
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {t.resolveDispute}
          </Button>
        </Tooltip>
      </Stack>
    </SessionRowCardShell>
  );
}
