"use client";

import {
  CalendarMonthOutlined as CalendarIcon,
  ChevronRightOutlined as ChevronIcon,
  MoreHorizOutlined as MoreHorizIcon,
} from "@mui/icons-material";
import { Box, Button, ButtonBase, Stack, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { formatApplicantDate as formatSessionDate } from "@/frontend/lib/i18n/format-date";
import { upNextRowShellSx } from "@/frontend/views/dashboard/home/upNextRowShell";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import type { UpNextLabels } from "@/shared/locale/types/upNext";

/**
 * Structural shape the glance block needs from a session row — BOTH the
 * student and teacher `Session` codegen items satisfy it (the SDL `Session`
 * type is shared by `myStudentSessions` and `myTeacherSessions`), so the
 * block stays role-neutral without a mapping layer.
 */
export interface UpNextSessionRowData {
  readonly id: string;
  readonly fee: string | null;
  readonly createdAt: string;
}

/**
 * Shared Up Next glance-card row chrome (component layer) — the row-leading
 * icon chip and the directional chevron both role cards compose so their
 * mini-rows never drift visually (or re-derive the same sx blocks, which
 * jscpd would flag as clones).
 *
 * Component-only exports keep Fast Refresh working; the style-layer
 * constants live in the sibling directive-free `upNextRowShell.ts`.
 *
 * MUI v9 discipline: `sx`-only styling, colors exclusively through
 * `theme.palette.*` tokens, RTL-safe logical composition (the directional
 * chevron flips with `theme.direction`).
 */

/**
 * The row-leading icon chip — a small tinted circle keyed by a tone
 * vocabulary (`info` = upcoming session, `primary` = pending work,
 * `success` = all caught up). Theme-palette container tokens only.
 */
export function UpNextRowIcon({
  tone,
  icon,
}: Readonly<{ tone: "info" | "primary" | "success"; icon: ReactNode }>): ReactNode {
  return (
    <Box
      aria-hidden
      sx={theme => ({
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        flexShrink: 0,
        ...(tone === "info" && {
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
        }),
        ...(tone === "primary" && {
          bgcolor: theme.palette.primaryContainer,
          color: theme.palette.onPrimaryContainer,
        }),
        ...(tone === "success" && {
          bgcolor: theme.palette.successContainer,
          color: theme.palette.onSuccessContainer,
        }),
      })}
    >
      {icon}
    </Box>
  );
}

/** Directional affordance at the row's end — flips for RTL locales. */
export function UpNextChevron(): ReactNode {
  return (
    <ChevronIcon
      fontSize="small"
      sx={theme => ({
        color: theme.palette.text.secondary,
        flexShrink: 0,
        transform: theme.direction === "rtl" ? "scaleX(-1)" : "none",
      })}
    />
  );
}

/**
 * The card heading row — small tinted leading icon + bold title, shared by
 * both role cards so the glance cards read as one family.
 */
export function UpNextCardHeading({ icon, title }: Readonly<{ icon: ReactNode; title: string }>): ReactNode {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      {icon}
      <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
    </Stack>
  );
}

/**
 * The scheduled-tail row — the quiet "N more scheduled" summary line both
 * role cards render when the envelope's `totalCount` exceeds the glance
 * window. Routes into the role's owning sessions surface (the caller owns
 * the hop target); the honest localized plural comes from the shared
 * `upNext` namespace.
 */
export function ScheduledTailRow({
  count,
  labels: t,
  onOpen,
}: Readonly<{
  count: number;
  labels: Pick<UpNextLabels, "scheduledMoreLine">;
  onOpen: () => void;
}>): ReactNode {
  return (
    <ButtonBase
      component="button"
      type="button"
      aria-label={t.scheduledMoreLine(count)}
      onClick={onOpen}
      sx={upNextRowShellSx("outline")}
    >
      <UpNextRowIcon tone="info" icon={<MoreHorizIcon fontSize="small" />} />
      <Box sx={{ minWidth: 0, flex: 1, textAlign: "start" }}>
        <Typography
          variant="body2"
          component="p"
          sx={theme => ({ fontWeight: 600, color: theme.palette.text.secondary })}
        >
          {t.scheduledMoreLine(count)}
        </Typography>
      </Box>
      <UpNextChevron />
    </ButtonBase>
  );
}

/**
 * The honest empty arm — the "no upcoming sessions" line plus the inline
 * CTA into the role's owning sessions surface (the caller owns the route
 * and the copy selection: student vs teacher empty-line vocabulary).
 */
export function UpNextEmptyArm({
  emptyLine,
  ctaLabel,
  ctaHref,
}: Readonly<{
  emptyLine: string;
  ctaLabel: string;
  ctaHref: string;
}>): ReactNode {
  return (
    <Stack spacing={1}>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        {emptyLine}
      </Typography>
      <Button
        variant="text"
        size="small"
        href={ctaHref}
        startIcon={<CalendarIcon />}
        sx={{ ...focusVisibleRingSx, alignSelf: "flex-start", minHeight: 44 }}
      >
        {ctaLabel}
      </Button>
    </Stack>
  );
}

/**
 * One upcoming-session mini-row — session reference + booking meta + fee on
 * a single hover-washed line, shared by both role cards. The caller renders
 * the strings (labels, date formatting, verbatim fee + currency) and owns
 * the hop target; this component owns only the row chrome. Fee/meta text is
 * pre-rendered by the caller so the money discipline (no client-side
 * arithmetic, no formatting drift) stays at the call site.
 */
export function UpNextMiniRow({
  sessionRef,
  bookedLabel,
  feeText,
  ariaLabel,
  onOpen,
}: Readonly<{
  sessionRef: string;
  bookedLabel: string;
  feeText: string;
  ariaLabel: string;
  onOpen: () => void;
}>): ReactNode {
  return (
    <ButtonBase
      component="button"
      type="button"
      aria-label={ariaLabel}
      onClick={onOpen}
      sx={upNextRowShellSx("primary")}
    >
      <UpNextRowIcon tone="info" icon={<CalendarIcon fontSize="small" />} />
      <Box sx={{ minWidth: 0, flex: 1, textAlign: "start" }}>
        <Typography
          variant="body2"
          component="p"
          sx={theme => ({ fontWeight: 700, color: theme.palette.text.primary })}
        >
          {sessionRef}
        </Typography>
        <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {bookedLabel}
        </Typography>
      </Box>
      <Typography
        variant="caption"
        sx={theme => ({
          color: theme.palette.text.secondary,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          whiteSpace: "nowrap",
        })}
      >
        {feeText}
      </Typography>
      <UpNextChevron />
    </ButtonBase>
  );
}

/**
 * The whole upcoming-sessions block — overline heading, the honest empty
 * arm, the glance-window rows, and the scheduled-tail row — shared by both
 * role cards. The caller supplies the role's empty-line copy and the route
 * of the owning sessions surface; every row hop and the tail row navigate
 * there. Fee renders verbatim with the platform currency constant (the
 * money discipline: no client-side arithmetic, no formatting drift).
 */
export function UpNextSessionsBlock({
  labels: t,
  locale,
  sessions,
  hiddenCount,
  emptyLine,
  route,
}: Readonly<{
  labels: UpNextLabels;
  locale: string;
  sessions: readonly UpNextSessionRowData[];
  hiddenCount: number;
  emptyLine: string;
  route: string;
}>): ReactNode {
  const router = useRouter();
  const openSessions = () => {
    router.push(route);
  };
  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Typography
        variant="overline"
        component="h3"
        sx={theme => ({ color: theme.palette.text.secondary, letterSpacing: "0.08em", lineHeight: 1.2 })}
      >
        {t.upcomingHeading}
      </Typography>
      {sessions.length === 0 ? (
        <UpNextEmptyArm emptyLine={emptyLine} ctaLabel={t.sessionsCta} ctaHref={route} />
      ) : (
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          {sessions.map(session => (
            <UpNextMiniRow
              key={session.id}
              sessionRef={t.sessionLine(Number(session.id))}
              bookedLabel={`${t.bookedPrefix} ${formatSessionDate(session.createdAt, locale)}`}
              feeText={session.fee === null ? "—" : `${session.fee} ${SESSION_FEE_CURRENCY}`}
              ariaLabel={`${t.sessionLine(Number(session.id))} — ${t.bookedPrefix} ${formatSessionDate(session.createdAt, locale)}`}
              onOpen={openSessions}
            />
          ))}
          {hiddenCount > 0 ? <ScheduledTailRow count={hiddenCount} labels={t} onOpen={openSessions} /> : null}
        </Stack>
      )}
    </Stack>
  );
}
