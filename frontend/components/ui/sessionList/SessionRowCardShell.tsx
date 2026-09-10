"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

/**
 * SessionRowCardShell — the bordered list-card shell shared by the session
 * row families (participant `SessionRow`, admin `AdminDisputeRow`, …): one
 * grid card with the outline token border, the low surface fill, the card
 * shadow and the idle→hover emphasis (elevation + outline emphasis ease in
 * together — the accent step goes from the `outlineVariant` line to the
 * stronger `outline` token). The row CONTENT stays caller-owned; the caller
 * passes its per-surface row testId through `testId`.
 */

interface SessionRowCardShellProps {
  /** Per-surface row testId (e.g. `session-row-<id>` / `admin-dispute-row-<id>`). */
  readonly testId: string;
  readonly children: ReactNode;
}

/** The bordered hover-emphasis card shell one session row renders into. */
export function SessionRowCardShell({ testId, children }: Readonly<SessionRowCardShellProps>): ReactNode {
  return (
    <Box
      data-testid={testId}
      sx={theme => ({
        display: "grid",
        // Single explicit track with a zero-able minimum: an `auto` track lets
        // a wide nowrap run (an LTR cancel reason inside the RTL card, etc.)
        // stretch the track past the card and bleed off-screen inline-end.
        // minmax(0,1fr) clamps every row family to the shell's real width.
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 1.5,
        p: { xs: 2.5, sm: 3 },
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
        boxShadow: theme.palette.shadow.card,
        transition: theme.transitions.create(["box-shadow", "transform", "border-color"]),
        "&:hover": {
          boxShadow: theme.shadows[4],
          borderColor: theme.palette.outline,
        },
      })}
    >
      {children}
    </Box>
  );
}
