"use client";

/**
 * AdminStudentsEmptyState — the student directory's empty-state block,
 * rendered inside the desktop table body and (wrapped in a card) on the
 * mobile list. Delegates to the shared `DirectoryEmptyState` block with
 * the student icon.
 */

import { PersonOutlineOutlined as PersonIcon } from "@mui/icons-material";
import type { ReactNode } from "react";
import { DirectoryEmptyState } from "@/frontend/views/admin/directory-shared/DirectoryEmptyState";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface AdminStudentsEmptyStateProps {
  readonly labels: Pick<AdminStudentsLabels, "emptyState">;
  readonly hasFilters: boolean;
}

export function AdminStudentsEmptyState({ labels, hasFilters }: AdminStudentsEmptyStateProps): ReactNode {
  return (
    <DirectoryEmptyState
      icon={<PersonIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />}
      hasFilters={hasFilters}
      labels={labels.emptyState}
    />
  );
}
