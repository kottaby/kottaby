"use client";

import { Paper, Skeleton, Stack } from "@mui/material";
import { PLANS_SKELETON_TEST_ID } from "@/frontend/views/student/plans/plansViewIds";

/**
 * PlansLoadingSkeleton — the loading branch: skeleton card rows matching
 * the final plan-card geometry. The region announces itself politely
 * through `Box component="output"` + `aria-busy` (the MUI v9 aria-live
 * pattern).
 */
export function PlansLoadingSkeleton(): React.ReactElement {
  return (
    <Paper
      component="output"
      data-testid={PLANS_SKELETON_TEST_ID}
      aria-busy="true"
      elevation={0}
      sx={theme => ({
        border: 1,
        borderColor: theme.palette.divider,
        borderRadius: 2,
        p: 2,
      })}
    >
      <Stack sx={{ gap: 2 }}>
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={`skeleton-row-${String(idx)}`} variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
        ))}
      </Stack>
    </Paper>
  );
}
