"use client";

/**
 * AdminTeachersEmptyState — the teacher directory's empty-state block,
 * rendered inside the desktop table body and (wrapped in a card) on the
 * mobile list. Mirrors `DirectoryEmptyState` (users directory) with a
 * teacher-specific icon.
 *
 * On the unfiltered zero-teachers state a call-to-action routes the admin
 * to the users directory — the surface where teacher applicants mid-review
 * live — so the empty state acts as a guided next step rather than a
 * dead end. The filtered variant stays CTA-free (the message already tells
 * the admin how to recover).
 */

import { ArrowBack as ArrowIcon, SchoolOutlined as SchoolIcon } from "@mui/icons-material";
import { Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
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
      <Typography sx={theme => ({ color: theme.palette.text.secondary, textAlign: "center" })}>
        {hasFilters ? labels.emptyState.filteredMessage : labels.emptyState.message}
      </Typography>
      {!hasFilters ? (
        <Button
          component={Link}
          href="/admin/users"
          size="small"
          variant="outlined"
          startIcon={<ArrowIcon sx={_theme => ({ transform: "scaleX(-1)" })} />}
          sx={theme => ({
            mt: 1.5,
            borderRadius: 2,
            textTransform: "none",
            fontWeight: 600,
            // RTL flips the flex order, so the icon leads in both directions;
            // the mirrored glyph keeps the arrow pointing "forward" either way.
            [theme.breakpoints.only("xs")]: { width: "100%" },
          })}
        >
          {labels.emptyState.cta}
        </Button>
      ) : null}
    </Stack>
  );
}
