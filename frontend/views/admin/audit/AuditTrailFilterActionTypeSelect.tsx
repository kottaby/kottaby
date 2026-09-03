"use client";

/**
 * The audit-trail action-type `Select` cell: fed by the generated
 * `AuditActionType` values × the REUSED `adminUsers.activity.action*` labels,
 * with an "all actions" empty option first. Purely controlled — the chosen
 * value flows up through `onDraftChange` (empty string = "all actions").
 */

import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import type { ReactNode } from "react";
import type { AuditActionType } from "@/frontend/graphql/generated/gql/graphql";
import { ACTION_VALUES, type FilterDrafts } from "@/frontend/views/admin/audit/audit-trail-filters";

const ACTION_TYPE_SELECT_ID = "audit-trail-action-type";
/** MUI wires the trigger's `aria-labelledby` ONLY from this prop — it is what gives the combobox its accessible name. */
const ACTION_TYPE_LABEL_ID = "audit-trail-action-type-label";

interface AuditTrailFilterActionTypeSelectProps {
  readonly drafts: FilterDrafts;
  readonly onDraftChange: (patch: Partial<FilterDrafts>) => void;
  readonly label: string;
  readonly allActionsOption: string;
  readonly actionLabels: Record<AuditActionType, string>;
  readonly disabled: boolean;
}

export function AuditTrailFilterActionTypeSelect({
  drafts,
  onDraftChange,
  label,
  allActionsOption,
  actionLabels,
  disabled,
}: Readonly<AuditTrailFilterActionTypeSelectProps>): ReactNode {
  return (
    <FormControl sx={{ minWidth: 150 }}>
      <InputLabel id={ACTION_TYPE_LABEL_ID}>{label}</InputLabel>
      <Select
        id={ACTION_TYPE_SELECT_ID}
        labelId={ACTION_TYPE_LABEL_ID}
        value={drafts.actionType}
        label={label}
        onChange={event => onDraftChange({ actionType: event.target.value || "" })}
        disabled={disabled}
        sx={{ minHeight: 44 }}
      >
        <MenuItem value="">{allActionsOption}</MenuItem>
        {ACTION_VALUES.map(value => (
          <MenuItem key={value} value={value}>
            {actionLabels[value]}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
