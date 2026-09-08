"use client";

/**
 * AdminApplicantsEmptyState — the applicant queue's empty-state block,
 * rendered inside the desktop table body and (wrapped in a card) on the
 * mobile list. Mirrors `AdminTeachersEmptyState` with an applicant-specific
 * icon; both variants (zero applicants / no filter matches) stay CTA-free —
 * an empty queue needs no routing hint and the filtered message already
 * tells the admin how to recover.
 */

import { PersonAddDisabledOutlined as ApplicantsIcon } from "@mui/icons-material";
import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminApplicantsEmptyStateProps {
  readonly labels: Pick<AdminTeachersLabels, "applicantsEmptyState">;
  readonly hasFilters: boolean;
}

export function AdminApplicantsEmptyState({ labels, hasFilters }: AdminApplicantsEmptyStateProps): ReactNode {
  return (
    <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
      <ApplicantsIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {hasFilters ? labels.applicantsEmptyState.filteredTitle : labels.applicantsEmptyState.title}
      </Typography>
      <Typography sx={theme => ({ color: theme.palette.text.secondary, textAlign: "center" })}>
        {hasFilters ? labels.applicantsEmptyState.filteredMessage : labels.applicantsEmptyState.message}
      </Typography>
    </Stack>
  );
}
