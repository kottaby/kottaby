"use client";

import { ChevronLeftOutlined, ChevronRightOutlined } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import type { ParentChildSessionsQuery_parentChildSessions_items } from "@/frontend/graphql/generated/gql/graphql";
import { buildCalendarGrid, formatMonthLabel, isCurrentMonth, shiftMonth, StatusDot, type CalendarMonth } from "@/frontend/views/parent/monitoring/AttendanceCalendar.helpers";

const WEEKDAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_AR = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

function currentMonth(): CalendarMonth { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; }

export function AttendanceCalendar({ sessions, locale }: Readonly<{ sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[]; locale: string }>): ReactNode {
  const weekdays = locale === "ar" ? WEEKDAY_LABELS_AR : WEEKDAY_LABELS_EN;
  const [viewMonth, setViewMonth] = useState<CalendarMonth>(currentMonth);
  const days = buildCalendarGrid(sessions, viewMonth);
  const monthLabel = formatMonthLabel(viewMonth, locale);
  const canGoForward = !isCurrentMonth(viewMonth);
  return (
    <Box sx={theme => ({ border: 1, borderColor: theme.palette.divider, borderRadius: 2, overflow: "hidden" })}>
      <Box sx={theme => ({ display: "flex", alignItems: "center", justifyContent: "space-between", bgcolor: theme.palette.primary.main, color: theme.palette.primary.contrastText, py: 0.5, px: 1 })}>
        <IconButton size="small" aria-label="previous month" onClick={() => { setViewMonth(prev => shiftMonth(prev, -1)); }} sx={theme => ({ color: theme.palette.primary.contrastText })}><ChevronLeftOutlined fontSize="small" /></IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{monthLabel}</Typography>
        <IconButton size="small" aria-label="next month" onClick={() => { if (canGoForward) { setViewMonth(prev => shiftMonth(prev, 1)); } }} disabled={!canGoForward} sx={theme => ({ color: theme.palette.primary.contrastText, "&.Mui-disabled": { color: theme.palette.primary.contrastText, opacity: 0.3 } })}><ChevronRightOutlined fontSize="small" /></IconButton>
      </Box>
      <Box sx={theme => ({ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: 1, borderColor: theme.palette.divider })}>{weekdays.map(day => <Box key={day} sx={theme => ({ py: 1, textAlign: "center", bgcolor: theme.palette.action.hover })}><Typography variant="caption" sx={{ fontWeight: 700 }}>{day}</Typography></Box>)}</Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>{days.map((day, index) => <Box key={day.day > 0 ? "cal-day-" + day.day : "cal-empty-" + index} sx={theme => ({ minHeight: 64, border: 0.5, borderColor: theme.palette.divider, padding: 0.5, bgcolor: day.day > 0 ? theme.palette.background.default : theme.palette.action.hover, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 })}>{day.day > 0 ? (<><Typography variant="caption" sx={theme => ({ fontWeight: 600, color: theme.palette.text.secondary })}>{day.day}</Typography><Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", justifyContent: "center", maxWidth: "100%" }}>{day.sessions.slice(0, 3).map(s => <StatusDot key={s.id} status={s.status} />)}{day.sessions.length > 3 ? <Typography variant="caption" sx={{ fontSize: "0.6rem", fontWeight: 700 }}>+{day.sessions.length - 3}</Typography> : null}</Stack></>) : null}</Box>)}</Box>
    </Box>
  );
}
