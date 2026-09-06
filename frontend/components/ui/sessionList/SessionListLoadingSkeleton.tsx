"use client";

import { Box, Skeleton, Stack } from "@mui/material";
import type { ReactNode } from "react";

/**
 * SessionListLoadingSkeleton — bordered row shells mirroring the session
 * list card's line rhythm (title text + rounded pill + body panel), shared
 * by the student / teacher sessions lists and the admin arbitration queue.
 * Each surface passes its own testId so the loading slots stay
 * distinguishable on the accessibility tree.
 */

/** Skeleton row count — approximates list density without claiming data. */
const LOADING_ROW_COUNT = 3;

/**
 * Stable skeleton keys — module-scope so the loading rows never key off the
 * render-time array index (`noArrayIndexKey`) while keeping one-to-one
 * cardinality with {@link LOADING_ROW_COUNT}.
 */
const LOADING_ROW_KEYS: readonly string[] = Array.from(
  { length: LOADING_ROW_COUNT },
  (_, index) => `skeleton-${index}`
);

interface SessionListLoadingSkeletonProps {
  /** Per-surface loading-slot testId (e.g. `student-sessions-loading`). */
  readonly testId: string;
}

/** Bordered row shells announcing `aria-busy` semantics. */
export function SessionListLoadingSkeleton({ testId }: Readonly<SessionListLoadingSkeletonProps>): ReactNode {
  return (
    <Stack aria-busy="true" data-testid={testId} sx={{ gap: 2 }}>
      {LOADING_ROW_KEYS.map(key => (
        <Box
          key={key}
          sx={theme => ({
            display: "grid",
            gap: 1.5,
            p: { xs: 2.5, sm: 3 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: theme.palette.outlineVariant,
            bgcolor: theme.palette.surfaceContainerLow,
            boxShadow: theme.palette.shadow.card,
          })}
        >
          <Skeleton variant="text" sx={{ fontSize: "1.5rem", maxWidth: 260 }} />
          <Skeleton variant="rounded" sx={{ height: 24, width: 150, borderRadius: 999 }} />
          <Skeleton variant="rectangular" sx={{ height: 40, borderRadius: 2 }} />
        </Box>
      ))}
    </Stack>
  );
}
