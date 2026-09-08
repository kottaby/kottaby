"use client";

/**
 * ActiveFiltersRow — the applied-filters chip strip rendered directly above
 * the directory results (ALL viewports — it complements, never replaces:
 * the mobile quick-filter `FilterChipsRow` toggles role/governance, the
 * desktop toolbar owns the inputs, and THIS row shows what is actually
 * applied with one-click per-filter removal for the predicates the quick
 * chips don't cover — the applied search substring and the country).
 *
 * One deletable chip per applied filter, labeled `filter: value` in the
 * active locale (a single logical string — RTL-safe by construction, no
 * directional markup needed). Chips paint from the neutral tokens:
 * outlined with `outlineVariant`, `text.primary` ink, and a delete icon
 * that steps from `text.secondary` to `error` on hover — the destructive
 * affordance is discoverable but never shouts. The row disappears
 * entirely once nothing is applied (an empty strip never renders).
 *
 * Removal routes through the SAME page-resetting setters the toolbar uses
 * (a new result set starts at page 1 — the directory hook's invariant),
 * and the mirror effect rewrites the URL, so a chip deletion stays
 * shareable exactly like a toolbar edit.
 */

import { Chip, Stack } from "@mui/material";
import type { ReactNode } from "react";
import type { DirectoryGovernance, DirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface ActiveFilterChip {
  /** Stable React key. */
  readonly key: string;
  /** Rendered chip text — `filterLabel: value` in the active locale. */
  readonly label: string;
  /** The accessible name for the chip's remove action target. */
  readonly onDelete: () => void;
}

interface ActiveFiltersRowProps {
  readonly labels: Pick<AdminUsersLabels, "filters" | "roleLabels" | "statusBadges">;
  readonly roleFilter: DirectoryRole | "";
  readonly governanceFilter: DirectoryGovernance | "";
  readonly countryFilter: string;
  /** The APPLIED (debounced) search — mirrors what the URL and results show. */
  readonly searchApplied: string;
  readonly setRoleFilter: (value: DirectoryRole | "") => void;
  readonly setGovernanceFilter: (value: DirectoryGovernance | "") => void;
  readonly setCountryFilter: (value: string) => void;
  readonly setSearchInput: (value: string) => void;
}

export function ActiveFiltersRow(props: ActiveFiltersRowProps): ReactNode {
  const { labels } = props;
  const roleValueLabels: Record<DirectoryRole, string> = {
    Admin: labels.roleLabels.admin,
    Teacher: labels.roleLabels.teacher,
    Student: labels.roleLabels.student,
    Parent: labels.roleLabels.parent,
  };
  const governanceValueLabels: Record<DirectoryGovernance, string> = {
    Active: labels.statusBadges.active,
    Suspended: labels.statusBadges.suspended,
    Blocked: labels.statusBadges.blocked,
    Deleted: labels.statusBadges.deleted,
  };

  const chips: ActiveFilterChip[] = [];
  if (props.searchApplied !== "") {
    chips.push({
      key: "active-search",
      label: `${labels.filters.search}: ${props.searchApplied}`,
      onDelete: () => props.setSearchInput(""),
    });
  }
  if (props.roleFilter !== "") {
    chips.push({
      key: "active-role",
      label: `${labels.filters.role}: ${roleValueLabels[props.roleFilter]}`,
      onDelete: () => props.setRoleFilter(""),
    });
  }
  if (props.governanceFilter !== "") {
    chips.push({
      key: "active-governance",
      label: `${labels.filters.governance}: ${governanceValueLabels[props.governanceFilter]}`,
      onDelete: () => props.setGovernanceFilter(""),
    });
  }
  if (props.countryFilter.trim() !== "") {
    chips.push({
      key: "active-country",
      label: `${labels.filters.country}: ${props.countryFilter.trim()}`,
      onDelete: () => props.setCountryFilter(""),
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", rowGap: 1 }}>
      {chips.map(chip => (
        <Chip
          key={chip.key}
          label={chip.label}
          size="small"
          onDelete={chip.onDelete}
          variant="outlined"
          sx={theme => ({
            borderColor: theme.palette.outlineVariant,
            color: theme.palette.text.primary,
            bgcolor: "transparent",
            transition: theme.transitions.create(["background-color", "border-color"], {
              duration: theme.transitions.duration.short,
            }),
            "& .MuiChip-deleteIcon": {
              color: theme.palette.text.secondary,
              "&:hover": { color: theme.palette.error.main },
            },
          })}
        />
      ))}
    </Stack>
  );
}
