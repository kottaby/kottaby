"use client";

import { MoreVertOutlined, WarningOutlined } from "@mui/icons-material";
import { Box, Chip, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { type ReactNode, useState } from "react";
import { SessionMetaCell, SessionRowCardShell } from "@/frontend/components/ui/sessionList";
import { type AdminSessionsQuery_adminSessions_items, SessionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { AdminSessionRowStatusCell } from "@/frontend/views/admin/session-governance/AdminSessionRowStatusCell";
import { SESSION_TYPE_LABEL_KEY } from "@/frontend/views/admin/session-governance/sessionTypePresentation";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import { useAppLocale } from "@/shared/locale";
import type { AdminSessionGovernanceLabels } from "@/shared/locale/types/adminSessionGovernance";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminSessionRow — ONE session rendered as a bordered list card in the
 * admin governance directory (`/admin/session-governance`, DEV3-021).
 * Presentation mirrors the arbitration-queue row (shared card shell, overline
 * meta cells, verbatim fee) while the CONTENT is governance-specific:
 *
 *  - the lifecycle StatusBadge renders through
 *    {@link AdminSessionRowStatusCell} (shared status vocabulary);
 *  - the `needsAttention` server-derived badge (a disputed row or
 *    a scheduled row whose confirmation deadline lapsed) renders as a
 *    warning-palette chip when true; it is presentation ONLY, never an
 *    authorization signal;
 *  - the duration derives client-side from `startedAt`/`endedAt`
 *    (presentation-only — D-07: `durationMinutes` is not on the wire);
 *  - participant ids render verbatim (the admin surface is trusted — the
 *    directory is intentionally unscoped per-row);
 *  - the kebab menu gates the four governance actions by the state
 *    eligibility matrix (D-03): reschedule/cancel on `scheduled|started`,
 *    reassign on `scheduled` only, join on `started` only — INELIGIBLE
 *    actions render DISABLED with an explanatory tooltip instead of
 *    disappearing (the operator learns the rule, the affordance stays
 *    discoverable). View-details is always available, and the join item
 *    OPENS the drawer (the live-session banner inside is the single-click
 *    observe confirm) rather than joining in place — so its label names
 *    the view-and-observe intent, never the immediate action.
 *
 * The row is a pure affordance: dialog/drawer state lives in the container.
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, `*Outlined`
 * icons only, RTL-safe logical composition, ≥44px touch targets.
 */

/** Kebab intent — which governance dialog (or the drawer) the row requests. */
export type GovernanceDialogKind = "reschedule" | "cancel" | "reassign";

/** Reschedule/cancel eligibility — `scheduled|started` (D-03 matrix). */
const TIMING_MUTABLE_STATUSES: Record<string, true> = {
  [SessionStatus.Scheduled]: true,
  [SessionStatus.Started]: true,
};

/** Reassign eligibility — `scheduled` only (live/arbitration rows excluded). */
const REASSIGN_ELIGIBLE_STATUSES: Record<string, true> = {
  [SessionStatus.Scheduled]: true,
};

/** Join eligibility — `started` only. */
const JOIN_ELIGIBLE_STATUSES: Record<string, true> = {
  [SessionStatus.Started]: true,
};

/** Typographic placeholder for nullable payload values (NOT locale copy). */
const NO_VALUE_PLACEHOLDER = "—";

/** Card head-band layout — the type-title block inline-start, the lifecycle chip inline-end. */
const ROW_HEAD_BAND_SX: SxProps<Theme> = {
  gap: 1.5,
  flexDirection: { xs: "column", sm: "row" },
  alignItems: { xs: "flex-start", sm: "center" },
  justifyContent: "space-between",
  flexWrap: "wrap",
};

/** Rounded whole minutes between two ISO instants, or null when derivable data is missing. */
function durationMinutesBetween(startedAt: string | null, endedAt: string | null): number | null {
  if (startedAt === null || endedAt === null) return null;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || endedMs <= startedMs) return null;
  return Math.round((endedMs - startedMs) / 60000);
}

interface RowHeadBandProps {
  readonly session: AdminSessionsQuery_adminSessions_items;
  readonly t: AdminSessionGovernanceLabels;
  readonly tSessions: SessionsLabels;
}

/**
 * The card's head band — the overline type label + type title (with the
 * needs-attention warning chip beside it when raised) inline-start, and the
 * lifecycle status chip inline-end. The arbitration-queue row mirrors this
 * band's presentation through the shared band-layout token rather than a
 * copied literal.
 */
function RowHeadBand({ session, t, tSessions }: Readonly<RowHeadBandProps>): ReactNode {
  return (
    <Stack sx={ROW_HEAD_BAND_SX}>
      <Stack sx={{ gap: 0.5, minWidth: 0 }}>
        <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.rowTypeLabel}
        </Typography>
        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="h6" component="h3" sx={{ fontWeight: 700 }}>
            {t[SESSION_TYPE_LABEL_KEY[session.sessionType] ?? "typeStudentSession"]}
          </Typography>
          {session.needsAttention ? (
            <Tooltip title={t.needsAttentionLabel} placement="top">
              <Chip
                icon={<WarningOutlined fontSize="small" />}
                label={t.needsAttentionLabel}
                size="small"
                data-testid={`admin-session-needs-attention-${session.id}`}
                sx={theme => ({
                  fontWeight: 600,
                  bgcolor: theme.palette.warningContainer,
                  color: theme.palette.onWarningContainer,
                  "& .MuiChip-icon": { color: theme.palette.onWarningContainer },
                })}
              />
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>
      <AdminSessionRowStatusCell status={session.status} t={tSessions} />
    </Stack>
  );
}

interface AdminSessionRowProps {
  /** The session payload row (normalized `Session` entity + attention badge). */
  readonly session: AdminSessionsQuery_adminSessions_items;
  /** Localized governance-namespace labels. */
  readonly t: AdminSessionGovernanceLabels;
  /** Shared sessions-namespace labels (status chip + row meta vocabulary). */
  readonly tSessions: SessionsLabels;
  /** Open the read-only detail drawer for this session. */
  readonly onOpenDetails: (sessionId: string) => void;
  /** Open one governance dialog for this session (container owns the state). */
  readonly onDialogIntent: (kind: GovernanceDialogKind, session: AdminSessionsQuery_adminSessions_items) => void;
}

/** One governance-directory card: status + meta + attention badge + kebab. */
export function AdminSessionRow({
  session,
  t,
  tSessions,
  onOpenDetails,
  onDialogIntent,
}: Readonly<AdminSessionRowProps>): ReactNode {
  const locale = useAppLocale();
  const [actionsAnchorEl, setActionsAnchorEl] = useState<HTMLElement | null>(null);

  const feeText = session.fee === null ? NO_VALUE_PLACEHOLDER : `${session.fee} ${SESSION_FEE_CURRENCY}`;
  const createdText = formatApplicantDate(session.createdAt, locale);
  const startedText =
    session.startedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(session.startedAt, locale);
  const endedText = session.endedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(session.endedAt, locale);
  const deadlineText =
    session.confirmationDeadline === null
      ? NO_VALUE_PLACEHOLDER
      : formatApplicantDate(session.confirmationDeadline, locale);
  const durationMinutes = durationMinutesBetween(session.startedAt, session.endedAt);
  const participantsText = `${session.studentId} · ${session.teacherId}`;

  const timingMutable = TIMING_MUTABLE_STATUSES[session.status] === true;
  const reassignEligible = REASSIGN_ELIGIBLE_STATUSES[session.status] === true;
  const joinEligible = JOIN_ELIGIBLE_STATUSES[session.status] === true;

  const closeActionsMenu = (): void => {
    setActionsAnchorEl(null);
  };

  const runMenuAction = (action: () => void): void => {
    closeActionsMenu();
    action();
  };

  return (
    <SessionRowCardShell testId={`admin-session-row-${session.id}`}>
      <RowHeadBand session={session} t={t} tSessions={tSessions} />

      <Stack
        sx={{
          gap: 1.5,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
        }}
      >
        <SessionMetaCell label={tSessions.fee} value={feeText} />
        <SessionMetaCell label={tSessions.createdAt} value={createdText} />
        <SessionMetaCell label={t.rowStartLabel} value={startedText} />
        <SessionMetaCell label={t.rowEndLabel} value={endedText} />
        <SessionMetaCell label={t.rowDeadlineLabel} value={deadlineText} />
        <SessionMetaCell
          label={t.rowDurationLabel}
          value={durationMinutes === null ? NO_VALUE_PLACEHOLDER : t.durationMinutesValue(durationMinutes)}
        />
        <SessionMetaCell label={tSessions.participantsLabel} value={participantsText} />
      </Stack>

      <Stack sx={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Tooltip title={t.rowActionsAriaLabel} placement="top">
          <IconButton
            aria-label={t.rowActionsAriaLabel}
            aria-haspopup="menu"
            aria-expanded={actionsAnchorEl !== null}
            data-testid={`admin-session-actions-${session.id}`}
            onClick={event => {
              setActionsAnchorEl(event.currentTarget);
            }}
            sx={theme => ({
              minHeight: { xs: 44, sm: 40 },
              minWidth: { xs: 44, sm: 40 },
              "&:focus-visible": {
                outline: `2px solid ${theme.palette.outline}`,
                outlineOffset: 2,
              },
            })}
          >
            <MoreVertOutlined />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={actionsAnchorEl}
          open={actionsAnchorEl !== null}
          onClose={closeActionsMenu}
          // Menu origins stay at MUI's viewport-clamped defaults (matching the
          // admin users directory kebab) — `end` is not a valid origin value
          // and physical left/right edges are not direction-safe.
          slotProps={{ list: { "aria-label": t.rowActionsAriaLabel } }}
        >
          <MenuItem
            onClick={() => {
              runMenuAction(() => onOpenDetails(session.id));
            }}
            data-testid={`admin-session-action-${session.id}-details`}
          >
            {t.actionViewDetails}
          </MenuItem>
          <Tooltip
            title={timingMutable ? "" : t.rescheduleDisabledHint}
            placement="top"
            disableHoverListener={timingMutable}
          >
            <Box sx={{ display: "block" }}>
              <MenuItem
                disabled={!timingMutable}
                onClick={() => {
                  runMenuAction(() => onDialogIntent("reschedule", session));
                }}
                data-testid={`admin-session-action-${session.id}-reschedule`}
              >
                {t.actionReschedule}
              </MenuItem>
            </Box>
          </Tooltip>
          <Tooltip
            title={timingMutable ? "" : t.cancelDisabledHint}
            placement="top"
            disableHoverListener={timingMutable}
          >
            <Box sx={{ display: "block" }}>
              <MenuItem
                disabled={!timingMutable}
                onClick={() => {
                  runMenuAction(() => onDialogIntent("cancel", session));
                }}
                data-testid={`admin-session-action-${session.id}-cancel`}
              >
                {t.actionCancel}
              </MenuItem>
            </Box>
          </Tooltip>
          <Tooltip
            title={reassignEligible ? "" : t.reassignDisabledHint}
            placement="top"
            disableHoverListener={reassignEligible}
          >
            <Box sx={{ display: "block" }}>
              <MenuItem
                disabled={!reassignEligible}
                onClick={() => {
                  runMenuAction(() => onDialogIntent("reassign", session));
                }}
                data-testid={`admin-session-action-${session.id}-reassign`}
              >
                {t.actionReassign}
              </MenuItem>
            </Box>
          </Tooltip>
          <Tooltip title={joinEligible ? "" : t.joinDisabledHint} placement="top" disableHoverListener={joinEligible}>
            <Box sx={{ display: "block" }}>
              <MenuItem
                disabled={!joinEligible}
                onClick={() => {
                  runMenuAction(() => onOpenDetails(session.id));
                }}
                data-testid={`admin-session-action-${session.id}-join`}
              >
                {t.actionViewAndObserve}
              </MenuItem>
            </Box>
          </Tooltip>
        </Menu>
      </Stack>
    </SessionRowCardShell>
  );
}
