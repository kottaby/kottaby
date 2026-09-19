"use client";

import { useQuery } from "@apollo/client/react";
import {
  AssignmentOutlined as AssignmentIcon,
  CalendarMonthOutlined as CalendarIcon,
  ChevronRightOutlined as ChevronIcon,
  EventNoteOutlined as EventNoteIcon,
  RefreshOutlined as RefreshIcon,
  TaskAltOutlined as TaskAltIcon,
} from "@mui/icons-material";
import { Alert, Box, Button, ButtonBase, Divider, Skeleton, Stack, Typography } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import {
  type MyStudentSessionsQuery_myStudentSessions_items,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { myStudentSessionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { STUDENT_SESSIONS_ROUTE } from "@/frontend/lib/notification-route-resolution";
import { computeHomeworkSummary } from "@/frontend/views/student/homework/homework.helpers";
import { useAllMyHomeworkPages } from "@/frontend/views/student/homework/useAllMyHomeworkPages";
import { CardShell } from "@/frontend/views/students/dashboard/CardShell";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import { Common, UpNext, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { UpNextLabels } from "@/shared/locale/types/upNext";

/** How many upcoming sessions the glance window shows — the rest live on `/student/sessions`. */
const UPCOMING_WINDOW_SIZE = 2;

/** Student homework route — the homework row's link target (nav literal parity). */
const STUDENT_HOMEWORK_ROUTE = "/homework";

/** Row metrics — comfortable ≥44px touch target + shared focus ring. */
const upNextRowSx = {
  ...focusVisibleRingSx,
  minHeight: 44,
  width: "100%",
  textAlign: "inherit",
} as const;

/**
 * The shared clickable-row shell for both glance rows: tinted card line,
 * short transition, hover wash + border emphasis. The hover border color
 * is the caller's emphasis choice (primary = the session hop, outline =
 * the quieter homework row), so the two rows never drift visually.
 */
function upNextRowShellSx(hoverBorderColor: "primary" | "outline") {
  return (theme: Theme) => ({
    ...upNextRowSx,
    display: "flex",
    alignItems: "center",
    gap: 1.5,
    padding: 1.5,
    borderRadius: 2,
    border: "1px solid",
    borderColor: theme.palette.outlineVariant,
    bgcolor: theme.palette.surfaceContainerLowest,
    transition: theme.transitions.create(["background-color", "border-color"], {
      duration: theme.transitions.duration.short,
      easing: theme.transitions.easing.easeOut,
    }),
    "&:hover": {
      bgcolor: theme.palette.action.hover,
      borderColor: hoverBorderColor === "primary" ? theme.palette.primary.main : theme.palette.outline,
    },
  });
}

/**
 * StudentUpNextCard — the student dashboard's "What's next" card, mounted
 * in the `RoleDashboardPage` student status slot next to the handshake and
 * parent-link cards.
 *
 * Self-contained client component: NO props, NO client-side role logic —
 * the page-level server guards remain the ONLY authorization boundary and
 * the identity-scoped `myStudentSessions` + `myHomework` reads answer
 * identity server-side (zero caller-supplied identity arguments, the SAME
 * documents the sessions/homework surfaces read — the Apollo normalized
 * cache is the single truth, so booking or grading on those surfaces
 * re-renders this card from cache without any bespoke invalidation bus).
 *
 * Content (a DISCOVERABILITY window, never a lifecycle surface):
 *  - Upcoming sessions — the `Scheduled` envelope's first rows (the API
 *    orders by booking recency; the card renders them verbatim with their
 *    booking date and fee — no invented schedule-time semantics). Every
 *    row routes to `/student/sessions`, the surface that owns the
 *    lifecycle CTAs.
 *  - Homework — the honest pending count over the WHOLE fetch-all-pages
 *    history (the shared `computeHomeworkSummary` partition the homework
 *    page itself renders). The row routes to `/homework`; the zero-pending
 *    arm renders "all caught up" (honest zero, never a hidden block).
 *
 * Render branches:
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | either query in flight | Skeleton card (`aria-busy` + `role="status"` labelled `loadingLabel`) mirroring the settled geometry (zero layout-shift target) |
 * | 2 | sessions query error | localized inline `Alert` + retry via `refetch` (a homework failure alone degrades SILENTLY — the homework row hides, the sessions block stays) |
 * | 3 | settled | title + upcoming block (rows or honest empty line + sessions CTA) + divider + homework row |
 *
 * MUI v9 discipline: `sx`-only styling, colors exclusively through
 * `theme.palette.*` tokens, `*Outlined` icons only, RTL-safe logical
 * composition (the directional chevron flips with `theme.direction`), and
 * every user-facing string resolved through compile-time i18n handles
 * (`useAppTranslation(UpNext)` property access — NEVER `t('key')`).
 */
export function StudentUpNextCard(): ReactNode {
  const t = useAppTranslation(UpNext);
  const tc = useAppTranslation(Common);
  const locale = useAppLocale();
  const router = useRouter();

  const sessions = useQuery(myStudentSessionsQueryDocument, {
    variables: { filter: { status: SessionStatus.Scheduled }, page: 1, pageSize: UPCOMING_WINDOW_SIZE },
    fetchPolicy: "cache-and-network",
  });
  const homework = useAllMyHomeworkPages();

  // Branch 1 — in flight: skeleton placeholder announces busy semantics.
  if (sessions.loading || homework.loading) {
    return (
      <CardShell testId="student-up-next-card-loading" busy busyLabel={t.loadingLabel}>
        <Skeleton variant="text" sx={{ fontSize: "1.75rem", maxWidth: 220 }} />
        <Skeleton variant="rounded" sx={{ height: 56, borderRadius: 2 }} />
        <Skeleton variant="rounded" sx={{ height: 44, borderRadius: 2 }} />
      </CardShell>
    );
  }

  // Branch 2 — the sessions read settled into a failure: ONE localized
  // inline Alert + retry refetch. The homework read carries no error UI of
  // its own (a homework failure only removes the homework row — silent
  // degradation, the sessions block stays authoritative).
  if (sessions.error !== undefined && extractErrorCode(sessions.error) !== null) {
    const handleRetry = () => {
      void sessions
        .refetch({ filter: { status: SessionStatus.Scheduled }, page: 1, pageSize: UPCOMING_WINDOW_SIZE })
        .catch(() => undefined);
    };
    return (
      <CardShell testId="student-up-next-card-error">
        <Stack spacing={2}>
          <Alert severity="error" variant="outlined">
            {t.errorBody}
          </Alert>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRetry} sx={focusVisibleRingSx}>
            {tc.retry}
          </Button>
        </Stack>
      </CardShell>
    );
  }

  const scheduledSessions: readonly MyStudentSessionsQuery_myStudentSessions_items[] =
    sessions.data?.myStudentSessions?.items ?? [];
  const homeworkRows = homework.data?.myHomework?.items;
  const pendingCount = homeworkRows === undefined ? undefined : computeHomeworkSummary(homeworkRows).pending;

  // Branch 3 — settled: the glance window.
  return (
    <CardShell testId="student-up-next-card">
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <EventNoteIcon fontSize="small" sx={theme => ({ color: theme.palette.primary.main })} />
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
          {t.upNextTitle}
        </Typography>
      </Stack>

      {/* Upcoming sessions block */}
      <Stack spacing={1.5} sx={{ minWidth: 0 }}>
        <Typography
          variant="overline"
          component="h3"
          sx={theme => ({ color: theme.palette.text.secondary, letterSpacing: "0.08em", lineHeight: 1.2 })}
        >
          {t.upcomingHeading}
        </Typography>
        {scheduledSessions.length === 0 ? (
          <Stack spacing={1}>
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {t.upcomingEmpty}
            </Typography>
            <Button
              variant="text"
              size="small"
              href={STUDENT_SESSIONS_ROUTE}
              startIcon={<CalendarIcon />}
              sx={{ ...focusVisibleRingSx, alignSelf: "flex-start", minHeight: 44 }}
            >
              {t.sessionsCta}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1} sx={{ minWidth: 0 }}>
            {scheduledSessions.map(session => (
              <UpNextSessionRow
                key={session.id}
                session={session}
                labels={t}
                locale={locale}
                onOpenSessions={() => {
                  router.push(STUDENT_SESSIONS_ROUTE);
                }}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <Divider sx={theme => ({ borderColor: theme.palette.outlineVariant })} />

      {/* Homework block — rendered only when the history resolved (a
          homework failure degrades silently; see branch 2). */}
      {pendingCount !== undefined ? (
        <Stack spacing={1.5} sx={{ minWidth: 0 }}>
          <Typography
            variant="overline"
            component="h3"
            sx={theme => ({ color: theme.palette.text.secondary, letterSpacing: "0.08em", lineHeight: 1.2 })}
          >
            {t.homeworkHeading}
          </Typography>
          <ButtonBase
            component="button"
            type="button"
            aria-label={pendingCount > 0 ? t.homeworkPendingLine(pendingCount) : t.homeworkAllGraded}
            onClick={() => {
              router.push(STUDENT_HOMEWORK_ROUTE);
            }}
            sx={upNextRowShellSx("outline")}
          >
            <UpNextRowIcon
              tone={pendingCount > 0 ? "primary" : "success"}
              icon={pendingCount > 0 ? <AssignmentIcon fontSize="small" /> : <TaskAltIcon fontSize="small" />}
            />
            <Box sx={{ minWidth: 0, flex: 1, textAlign: "start" }}>
              <Typography
                variant="body2"
                component="p"
                sx={theme => ({ fontWeight: 600, color: theme.palette.text.primary })}
              >
                {pendingCount > 0 ? t.homeworkPendingLine(pendingCount) : t.homeworkAllGraded}
              </Typography>
            </Box>
            <UpNextChevron />
          </ButtonBase>
        </Stack>
      ) : null}
    </CardShell>
  );
}

/**
 * One upcoming-session mini-row: session reference + booking meta + fee on
 * a single hover-washed line that routes to `/student/sessions`. Fee
 * renders verbatim (the money discipline: no client-side arithmetic, no
 * formatting drift) with the platform currency constant.
 */
function UpNextSessionRow({
  session,
  labels: t,
  locale,
  onOpenSessions,
}: Readonly<{
  session: MyStudentSessionsQuery_myStudentSessions_items;
  labels: UpNextLabels;
  locale: string;
  onOpenSessions: () => void;
}>): ReactNode {
  const feeText = session.fee === null ? "—" : `${session.fee} ${SESSION_FEE_CURRENCY}`;
  return (
    <ButtonBase
      component="button"
      type="button"
      aria-label={`${t.sessionLine(Number(session.id))} — ${t.bookedPrefix} ${formatApplicantDate(session.createdAt, locale)}`}
      onClick={onOpenSessions}
      sx={upNextRowShellSx("primary")}
    >
      <UpNextRowIcon tone="info" icon={<CalendarIcon fontSize="small" />} />
      <Box sx={{ minWidth: 0, flex: 1, textAlign: "start" }}>
        <Typography
          variant="body2"
          component="p"
          sx={theme => ({ fontWeight: 700, color: theme.palette.text.primary })}
        >
          {t.sessionLine(Number(session.id))}
        </Typography>
        <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.bookedPrefix} {formatApplicantDate(session.createdAt, locale)}
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

/** Directional affordance at the row's end — flips for RTL locales. */
function UpNextChevron(): ReactNode {
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
 * The row-leading icon chip — a small tinted circle keyed by a tone
 * vocabulary (`info` = upcoming session, `primary` = pending homework,
 * `success` = all caught up). Theme-palette container tokens only.
 */
function UpNextRowIcon({ tone, icon }: Readonly<{ tone: "info" | "primary" | "success"; icon: ReactNode }>): ReactNode {
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
