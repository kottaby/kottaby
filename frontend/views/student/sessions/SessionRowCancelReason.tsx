"use client";

import { Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Sessions, useAppTranslation } from "@/shared/locale";

interface SessionRowCancelReasonProps {
  /** Row identity (testid suffix). */
  readonly sessionId: string;
  /** Persisted cancellation reason (R-107) — never empty here. */
  readonly reason: string;
}

/**
 * Persisted cancellation reason (R-107) — rendered ONLY when the
 * lifecycle set it. Truncated to one line with the FULL reason reachable
 * through the tooltip (min-width:0 keeps the truncation RTL-safe inside the
 * wrap-friendly flex row).
 */
export function SessionRowCancelReason({ sessionId, reason }: Readonly<SessionRowCancelReasonProps>): ReactNode {
  const t = useAppTranslation(Sessions);

  return (
    <Tooltip title={reason} placement="top">
      <Stack
        data-testid={`session-cancel-reason-${sessionId}`}
        sx={{
          gap: 0.5,
          flexDirection: "row",
          alignItems: "baseline",
          minWidth: 0,
          maxWidth: "100%",
          // Stretched column child (xs): the nowrap LTR run inside an RTL line
          // lifts the stack's min-content width past the card and the box
          // bleeds off-screen inline-end. Pin the cross size and clip — the
          // truncation ellipsis then lands INSIDE the card.
          width: { xs: "100%", sm: "auto" },
          overflow: "hidden",
        }}
      >
        <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0 })}>
          {t.cancelReasonLine}
        </Typography>
        <Typography
          variant="body2"
          noWrap
          sx={theme => ({ color: theme.palette.text.secondary, minWidth: 0, flex: "1 1 0" })}
        >
          {reason}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
