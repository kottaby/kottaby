"use client";

/**
 * DirectoryEmptyState — the directory's empty-state block, rendered inside
 * the desktop table body and (wrapped in a card) on the mobile list.
 * Delegates to the shared `DirectoryEmptyState` block with the user icon;
 * the copy (`labels.emptyState`) and the two-variant title/message
 * selection are unchanged from the old table.
 */

import { PersonOutlineOutlined as PersonIcon } from "@mui/icons-material";
import type { ReactNode } from "react";
import { DirectoryEmptyState as DirectoryEmptyStateBlock } from "@/frontend/views/admin/directory-shared/DirectoryEmptyState";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface DirectoryEmptyStateProps {
  readonly labels: Pick<AdminUsersLabels, "emptyState">;
  readonly hasFilters: boolean;
}

export function DirectoryEmptyState({ labels, hasFilters }: DirectoryEmptyStateProps): ReactNode {
  return (
    <DirectoryEmptyStateBlock
      icon={<PersonIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />}
      hasFilters={hasFilters}
      labels={labels.emptyState}
    />
  );
}
