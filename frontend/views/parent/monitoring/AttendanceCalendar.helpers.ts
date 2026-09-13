import type { ParentChildSessionsQuery_parentChildSessions_items } from "@/frontend/graphql/generated/gql/graphql";

export type StatusColorKey = "success" | "info" | "warning" | "error" | "divider";

export function statusColorKey(status: string): StatusColorKey {
  const key = status.toLowerCase();
  if (key === "completed") {
    return "success";
  }
  if (key === "started") {
    return "info";
  }
  if (key === "scheduled") {
    return "warning";
  }
  if (key === "cancelled" || key === "disputed") {
    return "error";
  }
  return "divider";
}

export interface CalendarDay {
  readonly day: number;
  readonly sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[];
}

export function buildCalendarGrid(
  sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[]
): readonly CalendarDay[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const sessionsByDate = new Map<number, ParentChildSessionsQuery_parentChildSessions_items[]>();
  for (const session of sessions) {
    const dateIso = session.startedAt ?? session.createdAt;
    const date = new Date(dateIso);
    if (date.getFullYear() === year && date.getMonth() === month) {
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
