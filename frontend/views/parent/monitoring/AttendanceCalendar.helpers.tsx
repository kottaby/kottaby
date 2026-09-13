import { Box } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildSessionsQuery_parentChildSessions_items } from "@/frontend/graphql/generated/gql/graphql";

export type StatusColorKey = "success" | "info" | "warning" | "error" | "divider";

export function statusColorKey(status: string): StatusColorKey {
  switch (status.toLowerCase()) {
    case "completed":
      return "success";
    case "started":
      return "info";
    case "scheduled":
      return "warning";
    case "cancelled":
    case "disputed":
      return "error";
    default:
      return "divider";
  }
}

export interface CalendarDay {
  readonly day: number;
  readonly sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[];
}

export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

export function calendarMonthKey(cm: CalendarMonth): string {
  return cm.year + "-" + cm.month;
}

export function shiftMonth(cm: CalendarMonth, delta: number): CalendarMonth {
  const total = cm.year * 12 + cm.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function isCurrentMonth(cm: CalendarMonth): boolean {
  const now = new Date();
  return cm.year === now.getFullYear() && cm.month === now.getMonth();
}

export function currentMonth(): CalendarMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function buildCalendarGrid(
  sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[],
  target: CalendarMonth
): readonly CalendarDay[] {
  const firstDay = new Date(target.year, target.month, 1);
  const lastDay = new Date(target.year, target.month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const sessionsByDate = new Map<number, ParentChildSessionsQuery_parentChildSessions_items[]>();
  for (const session of sessions) {
    const dateIso = session.startedAt ?? session.createdAt;
    const date = new Date(dateIso);
    if (date.getFullYear() === target.year && date.getMonth() === target.month) {
      const day = date.getDate();
      const existing = sessionsByDate.get(day) ?? [];
      existing.push(session);
      sessionsByDate.set(day, existing);
    }
  }
  const days: CalendarDay[] = [];
  for (let i = 0; i < startWeekday; i++) {
    days.push({ day: 0, sessions: [] });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push({ day, sessions: sessionsByDate.get(day) ?? [] });
  }
  return days;
}

export function formatMonthLabel(cm: CalendarMonth, locale: string): string {
  const date = new Date(cm.year, cm.month, 1);
  return date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" });
}

const WEEKDAY_LABELS_EN: readonly string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_AR: readonly string[] = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

export function weekdayLabels(locale: string): readonly string[] {
  return locale === "ar" ? WEEKDAY_LABELS_AR : WEEKDAY_LABELS_EN;
}

export function StatusDot({ status }: Readonly<{ status: string }>): ReactNode {
  const key = status.toLowerCase();
  return (
    <Box
      sx={theme => {
        let bgcolor: string = theme.palette.divider;
        if (key === "completed") {
          bgcolor = theme.palette.success.main;
        } else if (key === "started") {
          bgcolor = theme.palette.info.main;
        } else if (key === "scheduled") {
          bgcolor = theme.palette.warning.main;
        } else if (key === "cancelled" || key === "disputed") {
          bgcolor = theme.palette.error.main;
        }
        return { width: 8, height: 8, borderRadius: "50%", bgcolor };
      }}
    />
  );
}
