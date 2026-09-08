"use client";

/**
 * ApplicantStatusQuickFilters — the applicant-queue status quick-filter
 * chip strip, rendered at ALL breakpoints (the deliberate difference from
 * the mobile-only `FilterChipsRow` of the users directory).
 *
 * A horizontally scrollable row of five chips: "All" plus the four
 * canonical applicant statuses (`ADMIN_APPLICANT_STATUSES` order). The
 * chips map onto the SAME single-select status-filter state the toolbar's
 * Status select drives — they compose with it, never replace it: selection
 * always agrees because the state is shared, and the select remains the
 * full a11y control. "All" clears the filter; each status chip toggles its
 * value (selecting an already-selected chip clears it).
 *
 * Chip labels carry live counts from the query's search-aware
 * `statusCounts` aggregate ("All" shows the four-slot sum) composed as
 * `<label> · <count>` with locale-neutral digits. While the aggregate has
 * not resolved (`null`), labels render WITHOUT counts — honest, never
 * guessed zeros.
 *
 * Styling mirrors `FilterChipsRow` exactly: selected chips render filled
 * `primary`/`onPrimary` at weight 600 with a same-color hover; unselected
 * chips are outlined with the `outlineVariant` border and `text.primary`
 * ink. Every chip is a ≥44px touch target with `flexShrink: 0` so the
 * scroll row never squeezes it. All colors resolve through theme-callback
 * sx; nothing is hardcoded.
 */

import { Box, Chip } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminTeacherApplicantsQuery } from "@/frontend/graphql/generated/gql/graphql";
import {
  ADMIN_APPLICANT_STATUSES,
  type ApplicantStatusFilter,
  applicantStatusLabel,
} from "@/frontend/views/admin/teachers/adminApplicants.helpers";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** The envelope's search-aware aggregate (inline codegen shape). */
type ApplicantStatusCounts = AdminTeacherApplicantsQuery["adminTeacherApplicants"]["statusCounts"];

interface ApplicantStatusQuickFiltersProps {
  readonly labels: Pick<AdminTeachersLabels, "filterOptions" | "applicantStatus" | "headers">;
  readonly statusFilter: ApplicantStatusFilter | "";
  readonly setStatusFilter: (value: ApplicantStatusFilter | "") => void;
  /** Search-aware counts; `null` while unresolved (chips render count-less). */
  readonly statusCounts: ApplicantStatusCounts | null;
}

interface QuickChip {
  readonly key: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export function ApplicantStatusQuickFilters(props: ApplicantStatusQuickFiltersProps): ReactNode {
  const { labels, statusFilter, setStatusFilter, statusCounts } = props;
  const allCount =
    statusCounts === null
      ? null
      : statusCounts.pending + statusCounts.inEvaluation + statusCounts.failed + statusCounts.passed;
  const chips: readonly QuickChip[] = [
    {
      key: "applicant-chip-all",
      label: composeCountLabel(labels.filterOptions.all, allCount),
      selected: statusFilter === "",
      onSelect: () => {
        setStatusFilter("");
      },
    },
    ...ADMIN_APPLICANT_STATUSES.map<QuickChip>(status => ({
      key: `applicant-chip-${status}`,
      label: composeCountLabel(applicantStatusLabel(status, labels.applicantStatus), countOf(statusCounts, status)),
      selected: statusFilter === status,
      onSelect: () => {
        setStatusFilter(statusFilter === status ? "" : status);
      },
    })),
  ];
  return (
    // A plain container div — no `group` role needed: each chip is its own
    // labeled, toggleable control, so the wrapper adds no AT semantics
    // (prefer-tag-over-role) and the strip keeps its scroll-row layout.
    <Box
      aria-label={labels.headers.status}
      sx={{ display: "flex", gap: 1, overflowX: "auto", WebkitOverflowScrolling: "touch", py: 0.5 }}
    >
      {chips.map(chip => (
        <Chip
          key={chip.key}
          label={chip.label}
          clickable
          onClick={chip.onSelect}
          variant={chip.selected ? "filled" : "outlined"}
          aria-pressed={chip.selected}
          sx={theme =>
            chip.selected
              ? {
                  flexShrink: 0,
                  minHeight: 44,
                  fontWeight: 600,
                  bgcolor: theme.palette.primary.main,
                  color: theme.palette.onPrimary,
                  "&:hover": { bgcolor: theme.palette.primary.main },
                }
              : {
                  flexShrink: 0,
                  minHeight: 44,
                  borderColor: theme.palette.outlineVariant,
                  color: theme.palette.text.primary,
                }
          }
        />
      ))}
    </Box>
  );
}

/**
 * `"<label> · <count>"` while a count is known; the bare label otherwise
 * (honest — the aggregate has not resolved yet).
 */
function composeCountLabel(label: string, count: number | null): string {
  return count === null ? label : `${label} · ${count}`;
}

/** Count of one canonical status slot; `null` while the aggregate is unresolved. */
function countOf(statusCounts: ApplicantStatusCounts | null, status: ApplicantStatusFilter): number | null {
  if (statusCounts === null) {
    return null;
  }
  // Total map over the four canonical slots (wire key: `inEvaluation`).
  const counts: Record<ApplicantStatusFilter, number> = {
    pending: statusCounts.pending,
    in_evaluation: statusCounts.inEvaluation,
    failed: statusCounts.failed,
    passed: statusCounts.passed,
  };
  return counts[status];
}
