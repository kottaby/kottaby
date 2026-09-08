"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface IconCircleEmptyStateProps {
  /** `data-testid` hook for the owning section's test suite. */
  readonly testId: string;
  /** Decorative icon rendered at the circle's center (caller sets the size). */
  readonly icon: ReactNode;
  /** Bolded headline under the icon. */
  readonly title: string;
  /** Secondary supporting copy under the title. */
  readonly body: string;
}

/**
 * IconCircleEmptyState — the shared zero-rows composition for the
 * link-request sections (parent outgoing, student incoming): a decorative
 * icon inside a 72px `secondaryContainer` tinted circle, atop a bolded
 * title and secondary body copy. Both pages keep the SAME 72/36 circle
 * rhythm and centered spacing so neither reads as the poorer sibling
 * (`frontend/AGENTS.md` sx-only styling; all colors come from the theme
 * palette — no hardcoded values).
 *
 * Presentational only: every surface-specific value (`data-testid`, icon
 * node, title, body) arrives via props with its label text already resolved
 * by the caller — no translation hooks here.
 */
export function IconCircleEmptyState({ testId, icon, title, body }: Readonly<IconCircleEmptyStateProps>): ReactNode {
  return (
    <Stack
      spacing={2}
      data-testid={testId}
      sx={{ alignItems: "center", justifyContent: "center", py: { xs: 6, sm: 10 }, px: 2, textAlign: "center" }}
    >
      <Box
        aria-hidden
        sx={theme => ({
          width: 72,
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          bgcolor: theme.palette.secondaryContainer,
          color: theme.palette.onSecondaryContainer,
        })}
      >
        {icon}
      </Box>
      <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 420 })}>
        {body}
      </Typography>
    </Stack>
  );
}
