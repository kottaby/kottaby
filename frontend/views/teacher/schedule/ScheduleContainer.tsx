"use client";

import { useQuery } from "@apollo/client/react";
import {
  CalendarMonthOutlined as CalendarIcon,
  EventBusyOutlined as CancelIcon,
  EventAvailableOutlined as DoneIcon,
  ChevronRightOutlined as NextLtrIcon,
  ChevronLeftOutlined as PrevLtrIcon,
  UpdateOutlined as UpcomingIcon,
} from "@mui/icons-material";
import { Alert, AlertTitle, Box, Button, Stack, Tooltip, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { myTeacherSessionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { DashboardStatCard } from "@/frontend/views/dashboard/home/DashboardStatCard";
import { ScheduleDayCard } from "@/frontend/views/teacher/schedule/ScheduleDayCard";
import { ScheduleLoadingSkeleton } from "@/frontend/views/teacher/schedule/ScheduleLoadingSkeleton";
import {
  addUtcDays,
  dayMonthYearStamp,
  groupSessionsByWeekDay,
  isSameUtcDay,
  type ScheduleDay,
  type ScheduleSession,
  startOfWeekUtc,
  utcMidnight,
  WEEK_STARTS_ON,
  weekStats,
} from "@/frontend/views/teacher/schedule/scheduleWeek.helpers";
import { Schedule, Sessions, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { ScheduleLabels } from "@/shared/locale/types/schedule";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * ScheduleContainer — the client orchestrator behind `/schedule`, the
 * teacher's WEEKLY PLANNER: an always-on chrome (title + week navigator +
 * summary strip) over a responsive seven-day grid of anchored sessions.
 *
 * Data — ONE stateful `myTeacherSessions` read (unfiltered, the SAME
 * identity the sessions list consumes); week navigation is pure client
 * state over the already-fetched items (no refetch per week). Anchoring
 * rule: a session renders on the UTC day it STARTED, falling back to its
 * booking day (see `scheduleWeek.helpers`).
 *
 * Week conventions — the Egyptian week (ar) opens SATURDAY, the
 * international week (en) opens SUNDAY; weekend columns tint per locale.
 * All stamps are UTC-fixed `Intl` formatters — server/client identical.
 *
 * Render branches (the chrome renders in EVERY branch; only the body
 * swaps — the teacher sessions container's branch matrix precedent):
 *
 * | # | Condition | Body |
 * |---|-----------|------|
 * | 1 | query in flight | `ScheduleLoadingSkeleton` (`aria-busy`) |
 * | 2 | query error | inline `Alert` (`errorTitle` / `errorBody`) |
 * | 3 | zero sessions across the visible week | empty state (calendar icon + `emptyWeekTitle`/`emptyWeekBody`) |
 * | 4 | rows present | summary strip + seven `ScheduleDayCard`s |
 *
 * Navigation — every session chip routes to `/teacher/sessions` (the
 * lifecycle CTA surface; the planner never duplicates mutation wiring),
 * and the footer CTA offers the same hop from the empty state.
 *
 * MUI v6 discipline: `sx`-only styling, theme-palette tokens only,
 * `*Outlined` icons only, RTL-safe logical composition (the CSS grid
 * mirrors automatically under the RTL document).
 */

/** The teacher's session-management list — the planner's action hop. */
const TEACHER_SESSIONS_ROUTE = "/teacher/sessions";

const EMPTY_WEEK: readonly ScheduleSession[] = [];

/**
 * Screen-reader-only recipe for the week-navigation live region (the
 * canonical `@mui/utils/visuallyHidden` values, as used by the
 * notifications feed's hidden copy).
 */
const VISUALLY_HIDDEN_LIVE_REGION_SX = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export function ScheduleContainer(): ReactNode {
  const scheduleT = useAppTranslation(Schedule);
  const sessionsT = useAppTranslation(Sessions);
  const locale = useAppLocale();
  const router = useRouter();

  // The visible week's opening UTC midnight — the ONLY navigation state.
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekUtc(new Date(), WEEK_STARTS_ON[locale]));

  const { data, loading, error } = useQuery(myTeacherSessionsQueryDocument, {
    variables: { filter: null, page: null, pageSize: null },
  });

  const sessions: readonly ScheduleSession[] = data?.myTeacherSessions?.items ?? EMPTY_WEEK;

  const days = useMemo(() => groupSessionsByWeekDay(sessions, weekStart), [sessions, weekStart]);
  const stats = useMemo(() => weekStats(days), [days]);

  const goPrevWeek = useCallback(() => setWeekStart(current => addUtcDays(current, -7)), []);
  const goNextWeek = useCallback(() => setWeekStart(current => addUtcDays(current, 7)), []);
  const goThisWeek = useCallback(() => setWeekStart(startOfWeekUtc(new Date(), WEEK_STARTS_ON[locale])), [locale]);
  const openSessionsList = useCallback(() => router.push(TEACHER_SESSIONS_ROUTE), [router]);

  const rangeFrom = dayMonthYearStamp(weekStart, locale);
  const rangeTo = dayMonthYearStamp(addUtcDays(weekStart, 6), locale);
  const isCurrentWeek = isSameUtcDay(weekStart, startOfWeekUtc(new Date(), WEEK_STARTS_ON[locale]));

  // RTL: "previous" points RIGHT under the Arabic reading direction.
  const PrevIcon = locale === "ar" ? NextLtrIcon : PrevLtrIcon;
  const NextIcon = locale === "ar" ? PrevLtrIcon : NextLtrIcon;

  const statCards = [
    { label: scheduleT.weekSessionsLabel, value: String(stats.total), Icon: CalendarIcon },
    { label: scheduleT.weekActiveLabel, value: String(stats.active), Icon: UpcomingIcon },
    { label: scheduleT.weekCompletedLabel, value: String(stats.completed), Icon: DoneIcon },
    { label: scheduleT.weekCancelledLabel, value: String(stats.cancelled), Icon: CancelIcon },
  ] as const;

  return (
    <Stack data-testid="schedule-view" sx={{ gap: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {scheduleT.pageTitle}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Typography
            variant="h6"
            component="h2"
            sx={theme => ({ color: theme.palette.text.secondary, fontWeight: 600 })}
          >
            {scheduleT.weekRangeLabel(rangeFrom, rangeTo)}
          </Typography>
          {/**
           * Week-change announcement: a mounted-always polite output region
           * (implicit role="status") whose text swaps with the navigator —
           * screen readers re-announce the visible week + its session count
           * on every prev/next/this-week hop without stealing focus.
           */}
          <Box component="output" sx={VISUALLY_HIDDEN_LIVE_REGION_SX}>
            {scheduleT.weekRangeLabel(rangeFrom, rangeTo)} · {scheduleT.dayCountLine(stats.total)}
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", ml: "auto" }}>
            <Button size="small" variant="text" onClick={goThisWeek} disabled={isCurrentWeek}>
              {scheduleT.thisWeekLabel}
            </Button>
            <Tooltip title={scheduleT.previousWeekLabel}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  aria-label={scheduleT.previousWeekLabel}
                  onClick={goPrevWeek}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  <PrevIcon fontSize="small" />
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={scheduleT.nextWeekLabel}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  aria-label={scheduleT.nextWeekLabel}
                  onClick={goNextWeek}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  <NextIcon fontSize="small" />
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Stack>

      <ScheduleBody
        loading={loading}
        error={error}
        empty={sessions.length === 0}
        statCards={statCards}
        days={days}
        locale={locale}
        scheduleT={scheduleT}
        sessionsT={sessionsT}
        onOpenSession={openSessionsList}
      />
    </Stack>
  );
}

interface ScheduleBodyProps {
  readonly loading: boolean;
  readonly error: unknown;
  /** True when the fetched feed carries zero sessions AT ALL (the generic empty state; a merely empty WEEK still renders the grid). */
  readonly empty: boolean;
  readonly statCards: readonly {
    readonly label: string;
    readonly value: string;
    readonly Icon: typeof CalendarIcon;
  }[];
  readonly days: readonly ScheduleDay[];
  readonly locale: "en" | "ar";
  readonly scheduleT: ScheduleLabels;
  readonly sessionsT: SessionsLabels;
  readonly onOpenSession: () => void;
}

/**
 * The swapping body below the always-on chrome — the branch matrix as
 * straight-line returns (skeleton / error alert / generic empty / summary
 * strip + seven day cards), extracted from the container's JSX so the
 * dispatch stays a flat statement chain.
 */
function ScheduleBody({
  loading,
  error,
  empty,
  statCards,
  days,
  locale,
  scheduleT,
  sessionsT,
  onOpenSession,
}: Readonly<ScheduleBodyProps>): ReactNode {
  if (loading) {
    return <ScheduleLoadingSkeleton loadingLabel={scheduleT.loadingLabel} />;
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: 3 }}>
        <AlertTitle sx={{ fontWeight: 700 }}>{scheduleT.errorTitle}</AlertTitle>
        {scheduleT.errorBody}
      </Alert>
    );
  }
  if (empty) {
    return (
      <EmptyState
        title={scheduleT.emptyWeekTitle}
        body={scheduleT.emptyWeekBody}
        onManage={onOpenSession}
        manageLabel={scheduleT.manageSessionsCta}
      />
    );
  }
  return (
    <>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
        }}
      >
        {statCards.map(card => (
          <DashboardStatCard key={card.label} stat={{ label: card.label, value: card.value, Icon: card.Icon }} />
        ))}
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)", lg: "repeat(7, 1fr)" },
          alignItems: "start",
        }}
      >
        {days.map(day => (
          <ScheduleDayCard
            key={day.startsAt.toISOString()}
            day={day}
            locale={locale}
            today={utcMidnight(new Date())}
            scheduleT={scheduleT}
            sessionsT={sessionsT}
            onOpenSession={onOpenSession}
          />
        ))}
      </Box>
    </>
  );
}

/** Empty state — a free week (or an empty teaching account) rendered kindly. */
function EmptyState({
  title,
  body,
  onManage,
  manageLabel,
}: Readonly<{ title: string; body: string; onManage: () => void; manageLabel: string }>): ReactNode {
  return (
    <Stack
      sx={theme => ({
        alignItems: "center",
        gap: 1.5,
        py: 8,
        px: 2,
        borderRadius: 3,
        border: "1px dashed",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
        textAlign: "center",
      })}
    >
      <CalendarIcon sx={theme => ({ fontSize: 48, color: theme.palette.onSurfaceVariant })} />
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 480 })}>
        {body}
      </Typography>
      <Button variant="contained" onClick={onManage}>
        {manageLabel}
      </Button>
    </Stack>
  );
}
