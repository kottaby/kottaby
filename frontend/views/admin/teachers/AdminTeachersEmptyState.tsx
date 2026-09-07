"use client";

/**
 * AdminTeachersEmptyState — the teacher directory's empty-state block,
 * rendered inside the desktop table body and (wrapped in a card) on the
 * mobile list. Mirrors `DirectoryEmptyState` (users directory) with a
 * teacher-specific icon.
 */

import { SchoolOutlined as SchoolIcon } from "@mui/icons-material";
import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminTeachersEmptyStateProps {
  readonly labels: Pick<AdminTeachersLabels, "emptyState">;
  readonly hasFilters: boolean;
}

export function AdminTeachersEmptyState({ labels, hasFilters }: AdminTeachersEmptyStateProps): ReactNode {
  return (
    <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
      <SchoolIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {hasFilters ? labels.emptyState.filteredTitle : labels.emptyState.title}
      </Typography>
      <Typography sx={theme => ({ color: theme.palette.text.secondary })}>
        {hasFilters ? labels.emptyState.filteredMessage : labels.emptyState.message}
      </Typography>
    </Stack>
  );
}
