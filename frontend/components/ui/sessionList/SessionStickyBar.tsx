"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

/**
 * SessionStickyBar — the sticky bar strip shared by the session list
 * surfaces (status filter toolbar, admin honest-count bar). The dashboard
 * AppBar is sticky at `top: 0` with `minHeight` 56/64 (xs→sm), so the bar
 * pins right under it and its content stays reachable while the list
 * scrolls (`zIndex.appBar - 1` keeps it beneath the AppBar). A static
 * hairline bottom edge echoes the AppBar's border without any scroll
 * listener (static styling only — no scroll-conditional border/shadow).
 */

interface SessionStickyBarProps {
  readonly children: ReactNode;
}

/** The sticky bar strip pinned under the dashboard AppBar. */
export function SessionStickyBar({ children }: Readonly<SessionStickyBarProps>): ReactNode {
  return (
    <Box
      sx={theme => ({
        position: "sticky",
        top: { xs: 56, sm: 64 },
        zIndex: theme.zIndex.appBar - 1,
        bgcolor: theme.palette.surfaceContainer,
        backdropFilter: "blur(8px)",
        borderRadius: 2,
        py: 1,
        px: { xs: 0.5, sm: 1 },
        borderBottom: "1px solid",
        borderBottomColor: theme.palette.outlineVariant,
      })}
    >
      {children}
    </Box>
  );
}
