"use client";

import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

/**
 * SessionMetaCell — one label/value meta pair inside a session row's header
 * or meta strip: an overline label over a semibold body value, wrap-friendly
 * (`minWidth: 0` keeps truncation RTL-safe inside the flex-wrap row). Shared
 * by the participant sessions rows and the admin arbitration queue rows.
 */

interface SessionMetaCellProps {
  readonly label: string;
  readonly value: string;
}

/** One label/value meta pair (overline label + body value), wrap-friendly. */
export function SessionMetaCell({ label, value }: Readonly<SessionMetaCellProps>): ReactNode {
  return (
    <Stack sx={{ gap: 0.25, minWidth: 0 }}>
      <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary })}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Stack>
  );
}
