"use client";

/**
 * FilterChipsRow — the mobile-only (< md) quick-filter chip strip rendered
 * above the directory results, on the shared `DirectoryQuickFilterChips`
 * strip (the applicant queue renders the same strip at ALL breakpoints).
 * Chips map onto the SAME role/governance filter state the toolbar drives
 * (composing with it, not replacing it — the full toolbar remains visible
 * on desktop and the state is shared):
 *
 *  - `chipsAll`   → clears both role and governance;
 *  - `roleLabels.student` → toggles role = Student;
 *  - `statusBadges.active`  → toggles governance = Active;
 *  - `statusBadges.deleted` → toggles governance = Deleted.
 */

import type { ReactNode } from "react";
import {
  type DirectoryQuickChip,
  DirectoryQuickFilterChips,
} from "@/frontend/views/admin/directory-shared/DirectoryQuickFilterChips";
import type { DirectoryGovernance, DirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface FilterChipsRowProps {
  readonly labels: Pick<AdminUsersLabels, "filters" | "roleLabels" | "statusBadges">;
  readonly roleFilter: DirectoryRole | "";
  readonly governanceFilter: DirectoryGovernance | "";
  readonly setRoleFilter: (value: DirectoryRole | "") => void;
  readonly setGovernanceFilter: (value: DirectoryGovernance | "") => void;
}

export function FilterChipsRow(props: FilterChipsRowProps): ReactNode {
  const { labels, roleFilter, governanceFilter, setRoleFilter, setGovernanceFilter } = props;
  const chips: readonly DirectoryQuickChip[] = [
    {
      key: "chip-all",
      label: labels.filters.chipsAll,
      selected: roleFilter === "" && governanceFilter === "",
      onSelect: () => {
        setRoleFilter("");
        setGovernanceFilter("");
      },
    },
    {
      key: "chip-students",
      label: labels.roleLabels.student,
      selected: roleFilter === "Student",
      onSelect: () => setRoleFilter(roleFilter === "Student" ? "" : "Student"),
    },
    {
      key: "chip-active",
      label: labels.statusBadges.active,
      selected: governanceFilter === "Active",
      onSelect: () => setGovernanceFilter(governanceFilter === "Active" ? "" : "Active"),
    },
    {
      key: "chip-deleted",
      label: labels.statusBadges.deleted,
      selected: governanceFilter === "Deleted",
      onSelect: () => setGovernanceFilter(governanceFilter === "Deleted" ? "" : "Deleted"),
    },
  ];
  return <DirectoryQuickFilterChips chips={chips} display="mobileOnly" />;
}
