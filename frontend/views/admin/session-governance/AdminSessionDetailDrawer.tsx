"use client";

import { CloseOutlined } from "@mui/icons-material";
import { Box, Dialog, Drawer, IconButton, Skeleton, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { SessionMetaCell } from "@/frontend/components/ui/sessionList";
import type { AdminSessionQuery_adminSession } from "@/frontend/graphql/generated/gql/graphql";
import { SessionIntent, SessionStatus, SessionType } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { AdminSessionRowStatusCell } from "@/frontend/views/admin/session-governance/AdminSessionRowStatusCell";
import { SESSION_INTENT_LABEL_KEY, SESSION_TYPE_LABEL_KEY } from "@/frontend/views/admin/session-governance/sessionTypePresentation";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import { AdminSessionGovernance, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminSessionDetailDrawer — the read-only side-panel detail of one
 * governance session (`/admin/session-governance`, DEV3-021). The SAME
 * read-only body renders through THREE responsive hosts (plan §5 — one
 * component tree, MUI responsive breakpoints, no mobile/desktop
 * triplication):
 *
 * | Host | Viewport | Surface |
 * |------|----------|---------|
 * | side `Drawer` | `md` and up (desktop, 1440-class) | inline-end panel (MUI flips horizontal anchors under RTL) |
 * | full-screen `Dialog` | `sm` … `md` (tablet ~768-class) | fullScreen dialog |
 * | bottom `Drawer` | below `sm` (mobile 375-class) | temporary bottom sheet-style drawer |
 *
 * The detail is a READ-ONLY browse view (REQ-012: any id, null-not-error):
 *  - `adminSession === null` renders the "absent row" body (data, not an
 *    error surface — the browse read answers id-probes with data);
 *  - the `needsAttention` badge is directory-only per the wire contract
 *    (detail always resolves false) and is deliberately NOT rendered here;
 *  - nullable lifecycle stamps render as rows ONLY when present (a
 *    scheduled row shows no resolution/cancel/dispute block);
 *  - for a `started` (live) session the caller-supplied `joinBanner` mounts
 *    above the meta grid — the single-click observation confirm
 *    ({@link JoinObservationAction}).
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, `*Outlined`
 * icons only, RTL-safe logical composition (no physical sides).
 */

/** Join-banner eligibility — `started` only (REQ-026/027, Record lookup). */
const JOIN_OBSERVABLE_STATUSES: Record<string, true> = {
  [SessionStatus.Started]: true,
};

/** Typographic placeholder for nullable payload values (NOT locale copy). */
const NO_VALUE_PLACEHOLDER = "—";

/** Side-panel width on the desktop host (fits the meta grid without wrap). */
const DRAWER_DESKTOP_WIDTH = 440;

interface AdminSessionDetailDrawerProps {
  /** Whether the drawer/dialog host is mounted-open. */
  readonly open: boolean;
  /** The settled browse-detail payload (`null` row = absent session). */
  readonly detail: AdminSessionQuery_adminSession | null;
  readonly loading: boolean;
  readonly error: unknown;
  /** Dismiss intent (close button / backdrop / Escape). */
  readonly onClose: () => void;
  /** Detail-refetch intent (the error state's retry affordance). */
  readonly onRetry: () => void;
  /**
   * The observation banner for a live session — rendered for `started`
   * rows only; the container owns the join mutation behind it.
   */
  readonly joinBanner: ReactNode;
  /** Shared sessions-namespace labels (status chip + meta vocabulary). */
  readonly tSessions: SessionsLabels;
}

/** The read-only session detail panel (responsive Drawer/Dialog hosts). */
export function AdminSessionDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
  onRetry,
  joinBanner,
  tSessions,
}: Readonly<AdminSessionDetailDrawerProps>): ReactNode {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const titleId = "admin-session-detail-title";
  const header = (
    <DrawerHeader
      titleId={titleId}
      onClose={onClose}
      status={detail?.status ?? SessionStatus.Scheduled}
      statusVisible={detail !== null}
      tSessions={tSessions}
    />
  );
  const body = (
    <DetailBody
      detail={detail}
      loading={loading}
      error={error}
      onRetry={onRetry}
      joinBanner={joinBanner}
      joinVisible={detail !== null && JOIN_OBSERVABLE_STATUSES[detail.status] === true}
      tSessions={tSessions}
    />
  );

  if (isDesktop) {
    // Desktop host — inline-end side panel. MUI flips horizontal anchors
    // under RTL, so `anchor="right"` stays logical.
    return (
      <Drawer
        open={open}
        onClose={onClose}
        anchor="right"
        slotProps={{
          paper: { sx: { width: { sm: DRAWER_DESKTOP_WIDTH }, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 } },
        }}
      >
        {header}
        {body}
      </Drawer>
    );
  }
  if (isMobile) {
    // Mobile host — temporary bottom drawer (plan §5: NOT a bottom nav).
    return (
      <Drawer open={open} onClose={onClose} anchor="bottom" slotProps={{ paper: { sx: { maxHeight: "92vh" } } }}>
        {header}
        {body}
      </Drawer>
    );
  }
  // Tablet host — full-screen dialog.
  return (
    <Dialog open={open} onClose={onClose} fullScreen aria-labelledby={titleId}>
      {header}
      {body}
    </Dialog>
  );
}

interface DrawerHeaderProps {
  readonly titleId: string;
  readonly onClose: () => void;
  readonly status: SessionStatus;
  readonly statusVisible: boolean;
  readonly tSessions: SessionsLabels;
}

/** Shared header band: title + status chip + close affordance. */
function DrawerHeader({ titleId, onClose, status, statusVisible, tSessions }: Readonly<DrawerHeaderProps>): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);
  return (
    <Stack
      sx={theme => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 1,
        p: 2,
        borderBottom: "1px solid",
        borderBottomColor: theme.palette.outlineVariant,
      })}
    >
      <Typography id={titleId} variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {t.detailTitle}
      </Typography>
      <Box sx={{ marginInlineStart: "auto" }}>
        {statusVisible ? <AdminSessionRowStatusCell status={status} t={tSessions} /> : null}
      </Box>
      <IconButton
        aria-label={t.detailCloseAriaLabel}
        data-testid="admin-session-detail-close"
        onClick={onClose}
        sx={theme => ({
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.outline}`,
            outlineOffset: 2,
          },
        })}
      >
        <CloseOutlined />
      </IconButton>
    </Stack>
  );
}

interface DetailBodyProps {
  readonly detail: AdminSessionQuery_adminSession | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly joinBanner: ReactNode;
  readonly joinVisible: boolean;
  readonly tSessions: SessionsLabels;
}

/** Shared scrollable body: banner / absent / error / skeleton / meta grid. */
function DetailBody({
  detail,
  loading,
  error,
  onRetry,
  joinBanner,
  joinVisible,
  tSessions,
}: Readonly<DetailBodyProps>): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);
  const locale = useAppLocale();

  if (loading && detail === null && error === undefined) {
    return (
      <Stack aria-busy="true" data-testid="admin-session-detail-loading" sx={{ gap: 1.5, p: 2 }}>
        <Skeleton variant="text" sx={{ fontSize: "1.25rem", maxWidth: 220 }} />
        <Skeleton variant="rounded" sx={{ height: 24, width: 140, borderRadius: 999 }} />
        <Skeleton variant="rectangular" sx={{ height: 48, borderRadius: 2 }} />
        <Skeleton variant="rectangular" sx={{ height: 48, borderRadius: 2 }} />
      </Stack>
    );
  }
  if (error) {
    return (
      <Stack data-testid="admin-session-detail-error" sx={{ gap: 2, p: 2 }}>
        <ErrorRetryAlert title={t.errorTitle} retryLabel={t.retryLabel} retryPending={false} onRetry={onRetry}>
          {null}
        </ErrorRetryAlert>
      </Stack>
    );
  }
  if (detail === null) {
    // The browse read answers an unknown id with DATA (`adminSession: null`)
    // — an absence body, not an error surface (REQ-012 null-not-error).
    return (
      <Stack data-testid="admin-session-detail-missing" sx={{ gap: 1.5, py: 8, px: 3, textAlign: "center" }}>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.detailMissingBody}
        </Typography>
      </Stack>
    );
  }

  const feeText = detail.fee === null ? NO_VALUE_PLACEHOLDER : `${detail.fee} ${SESSION_FEE_CURRENCY}`;
  const createdText = formatApplicantDate(detail.createdAt, locale);
  const startedText = detail.startedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(detail.startedAt, locale);
  const endedText = detail.endedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(detail.endedAt, locale);
  const deadlineText =
    detail.confirmationDeadline === null
      ? NO_VALUE_PLACEHOLDER
      : formatApplicantDate(detail.confirmationDeadline, locale);
  const studentConfirmedText =
    detail.confirmedByStudentAt === null
      ? NO_VALUE_PLACEHOLDER
      : formatApplicantDate(detail.confirmedByStudentAt, locale);
  const teacherConfirmedText =
    detail.confirmedByTeacherAt === null
      ? NO_VALUE_PLACEHOLDER
      : formatApplicantDate(detail.confirmedByTeacherAt, locale);
  const disputedText =
    detail.disputedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(detail.disputedAt, locale);
  const resolvedAtText =
    detail.resolvedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(detail.resolvedAt, locale);

  return (
    <Box sx={{ p: 2, overflowY: "auto" }}>
      {joinVisible ? joinBanner : null}
      <Stack
        data-testid="admin-session-detail-body"
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
        }}
      >
        <SessionMetaCell label={t.detailSessionIdLabel} value={detail.id} />
        <SessionMetaCell
          label={tSessions.intent}
          value={detail.intent === null ? NO_VALUE_PLACEHOLDER : t[SESSION_INTENT_LABEL_KEY[detail.intent]]}
        />
        <SessionMetaCell label={t.rowTypeLabel} value={t[SESSION_TYPE_LABEL_KEY[detail.sessionType]]} />
        <SessionMetaCell label={tSessions.fee} value={feeText} />
        <SessionMetaCell label={tSessions.participantsLabel} value={`${detail.studentId} · ${detail.teacherId}`} />
        <SessionMetaCell label={tSessions.createdAt} value={createdText} />
        <SessionMetaCell label={t.detailStartLabel} value={startedText} />
        <SessionMetaCell label={t.detailEndLabel} value={endedText} />
        <SessionMetaCell label={t.detailDeadlineLabel} value={deadlineText} />
        <SessionMetaCell label={t.detailConfirmedByStudentLabel} value={studentConfirmedText} />
        <SessionMetaCell label={t.detailConfirmedByTeacherLabel} value={teacherConfirmedText} />
        {detail.cancelReason !== null ? (
          <SessionMetaCell label={t.detailCancelReasonLabel} value={detail.cancelReason} />
        ) : null}
        {detail.disputeReason !== null ? (
          <SessionMetaCell label={t.detailDisputeReasonLabel} value={detail.disputeReason} />
        ) : null}
        {detail.disputedAt !== null ? <SessionMetaCell label={tSessions.disputedAtLabel} value={disputedText} /> : null}
        {detail.resolutionNote !== null ? (
          <SessionMetaCell label={t.detailResolutionLabel} value={detail.resolutionNote} />
        ) : null}
        {detail.resolvedAt !== null ? <SessionMetaCell label={t.detailResolvedAtLabel} value={resolvedAtText} /> : null}
      </Stack>
    </Box>
  );
}
