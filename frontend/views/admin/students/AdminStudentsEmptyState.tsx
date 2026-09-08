"use client";

/**
 * AdminStudentsEmptyState — the student directory's empty-state block,
 * rendered inside the desktop table body and (wrapped in a card) on the
 * mobile list. Mirrors `DirectoryEmptyState` (users directory) with a
 * student-specific icon.
 */

import { PersonOutlineOutlined as PersonIcon } from "@mui/icons-material";
import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface AdminStudentsEmptyStateProps {
  readonly labels: Pick<AdminStudentsLabels, "emptyState">;
  readonly hasFilters: boolean;
}

export function AdminStudentsEmptyState({ labels, hasFilters }: AdminStudentsEmptyStateProps): ReactNode {
  return (
    <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
      <PersonIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {hasFilters ? labels.emptyState.filteredTitle : labels.emptyState.title}
      </Typography>
      <Typography sx={theme => ({ color: theme.palette.text.secondary })}>
        {hasFilters ? labels.emptyState.filteredMessage : labels.emptyState.message}
      </Typography>
    </Stack>
  );
}
