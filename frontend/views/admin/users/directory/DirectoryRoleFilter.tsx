"use client";

/**
 * DirectoryRoleFilter — the role select inside the desktop
 * `DirectoryToolbar` (44px control height; the empty option means
 * "any role").
 */

import type { ReactNode } from "react";
import { DirectoryFilterSelect } from "@/frontend/views/admin/users/directory";
import { asDirectoryRole, type DirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface DirectoryRoleFilterProps {
  readonly id: string;
  readonly roleFilter: DirectoryRole | "";
  readonly setRoleFilter: (value: DirectoryRole | "") => void;
  readonly labels: Pick<AdminUsersLabels, "filters" | "roleLabels" | "genderOptions">;
}

function asRoleFilterValue(value: string): DirectoryRole | "" {
  if (value === "") return "";
  return asDirectoryRole(value);
}

export function DirectoryRoleFilter({ id, roleFilter, setRoleFilter, labels }: DirectoryRoleFilterProps): ReactNode {
  return (
    <DirectoryFilterSelect
      id={id}
      label={labels.filters.role}
      value={roleFilter}
      onChange={value => setRoleFilter(asRoleFilterValue(value))}
      emptyOptionLabel={labels.genderOptions.unspecified}
      options={[
        { value: "Admin", label: labels.roleLabels.admin },
        { value: "Teacher", label: labels.roleLabels.teacher },
        { value: "Student", label: labels.roleLabels.student },
        { value: "Parent", label: labels.roleLabels.parent },
      ]}
    />
  );
}
