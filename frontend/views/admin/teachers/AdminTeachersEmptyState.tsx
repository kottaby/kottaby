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
 * dead end. When the applicant QUEUE holds at least one row (the surface
 * passes the eagerly-fetched queue total down — the same source the
 * inactive-tab count badge reads), a SECOND CTA appears under the first and
 * flips the surface to the applicants tab in place: the surface owns the
 * tab state, so the callback is a plain `setActiveTab("applicants")` — NO
 * URL navigation, exactly like the tab strip itself. Visually the join-
 * requests CTA is the SECONDARY action (`variant="text"` under the
 * outlined users CTA — the outlined button reads as the primary next step,
 * the text button as the lighter alternative), and both CTAs render full
 * width on the xs breakpoint like every stacked empty-state action. The
 * filtered variant stays CTA-free (the message already tells the admin how
 * to recover), and a zero-applicant queue hides the second CTA — an empty
 * state must never offer a dead end.
 */

import {
  HowToRegOutlined as ApplicantsIcon,
  ArrowBack as ArrowIcon,
  SchoolOutlined as SchoolIcon,
} from "@mui/icons-material";
import { Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminTeachersEmptyStateProps {
  readonly labels: Pick<AdminTeachersLabels, "emptyState">;
  readonly hasFilters: boolean;
  /**
   * Whether the applicant-queue query currently holds ≥1 row (the surface's
   * eagerly-fetched `applicants.total > 0` — the same source the inactive
   * tab badge reads). Gates the join-requests CTA so a resolved/empty queue
   * never renders it.
   */
  readonly hasApplicants: boolean;
  /**
   * Flips the /teachers surface to the applicants tab (the surface owns the
   * tab state — no URL navigation).
   */
  readonly onReviewApplicants: () => void;
}

export function AdminTeachersEmptyState({
  labels,
  hasFilters,
  hasApplicants,
  onReviewApplicants,
}: AdminTeachersEmptyStateProps): ReactNode {
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
        <>
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
          {/*
            Secondary CTA — offered ONLY while the queue holds ≥1 applicant
            (see the prop docblock). `variant="text"` under the outlined
            primary keeps the visual hierarchy (outlined > text) in both
            directions; the icon is direction-neutral so no RTL mirroring is
            needed. Clicking flips the tab via the surface's callback — the
            button is deliberately NOT a Link (no URL navigation).
          */}
          {hasApplicants && (
            <Button
              size="small"
              variant="text"
              onClick={onReviewApplicants}
              startIcon={<ApplicantsIcon />}
              sx={theme => ({
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 600,
                [theme.breakpoints.only("xs")]: { width: "100%" },
              })}
            >
              {labels.emptyState.reviewApplicants}
            </Button>
          )}
        </>
      ) : null}
    </Stack>
  );
}
