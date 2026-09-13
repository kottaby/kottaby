"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { type CalendarDay, statusColorKey } from "@/frontend/views/parent/monitoring/AttendanceCalendar.helpers";

export function StatusDot({ status }: Readonly<{ status: string }>): ReactNode {
  const colorKey = statusColorKey(status);
  return (
    <Box
      sx={theme => ({
        width: 8,
        height: 8,
        borderRadius: "50%",
        bgcolor: colorKey === "divider" ? theme.palette.divider : theme.palette[colorKey].main,
      })}
    />
  );
}

export function CalendarDayCell({ day }: Readonly<{ day: CalendarDay }>): ReactNode {
  const isFilled = day.day > 0;
  const visibleSessions = day.sessions.slice(0, 3);
  const overflow = day.sessions.length - visibleSessions.length;
  return (
    <Box
      sx={theme => ({
        minHeight: 64,
        border: 0.5,
        borderColor: theme.palette.divider,
        padding: 0.5,
        bgcolor: isFilled ? theme.palette.background.default : theme.palette.action.hover,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
      })}
    >
      {isFilled ? (
        <>
          <Typography variant="caption" sx={theme => ({ fontWeight: 600, color: theme.palette.text.secondary })}>
            {day.day}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", justifyContent: "center", maxWidth: "100%" }}>
            {visibleSessions.map(session => (
              <StatusDot key={session.id} status={session.status} />
            ))}
            {overflow > 0 ? (
              <Typography variant="caption" sx={{ fontSize: "0.6rem", fontWeight: 700 }}>
                +{overflow}
              </Typography>
            ) : null}
          </Stack>
        </>
      ) : null}
    </Box>
  );
}
