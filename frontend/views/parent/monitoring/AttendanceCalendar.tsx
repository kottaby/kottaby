"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ParentChildSessionsQuery_parentChildSessions_items } from "@/frontend/graphql/generated/gql/graphql";
import { buildCalendarGrid } from "@/frontend/views/parent/monitoring/AttendanceCalendar.helpers";

const WEEKDAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_AR = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

function StatusDot({ status }: Readonly<{ status: string }>): ReactNode {
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

export function AttendanceCalendar({
  sessions,
  locale,
}: Readonly<{
  sessions: readonly ParentChildSessionsQuery_parentChildSessions_items[];
  locale: string;
}>): ReactNode {
  const weekdays = locale === "ar" ? WEEKDAY_LABELS_AR : WEEKDAY_LABELS_EN;
  const days = buildCalendarGrid(sessions);
  const now = new Date();
  const monthName = now.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" });
  return (
    <Box sx={theme => ({ border: 1, borderColor: theme.palette.divider, borderRadius: 2, overflow: "hidden" })}>
      <Box
        sx={theme => ({
          bgcolor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          py: 1.5,
          px: 2,
          textAlign: "center",
        })}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {monthName}
        </Typography>
      </Box>
      <Box
        sx={theme => ({
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: 1,
          borderColor: theme.palette.divider,
        })}
      >
        {weekdays.map(day => (
          <Box key={day} sx={theme => ({ py: 1, textAlign: "center", bgcolor: theme.palette.action.hover })}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {day}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map((day, index) => (
          <Box
            key={day.day > 0 ? "cal-day-" + day.day : "cal-empty-" + index}
            sx={theme => ({
              minHeight: 64,
              border: 0.5,
              borderColor: theme.palette.divider,
              padding: 0.5,
              bgcolor: day.day > 0 ? theme.palette.background.default : theme.palette.action.hover,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
            })}
          >
            {day.day > 0 ? (
              <>
                <Typography variant="caption" sx={theme => ({ fontWeight: 600, color: theme.palette.text.secondary })}>
                  {day.day}
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ flexWrap: "wrap", justifyContent: "center", maxWidth: "100%" }}
                >
                  {day.sessions.slice(0, 3).map(session => (
                    <StatusDot key={session.id} status={session.status} />
                  ))}
                  {day.sessions.length > 3 ? (
                    <Typography variant="caption" sx={{ fontSize: "0.6rem", fontWeight: 700 }}>
                      +{day.sessions.length - 3}
                    </Typography>
                  ) : null}
                </Stack>
              </>
            ) : null}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
