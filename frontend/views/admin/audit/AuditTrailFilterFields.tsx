"use client";

/**
 * The audit-trail filter field grid (three-column wrap layout): actor-id /
 * entity-id number fields, free-text entity type, the action-type `Select`
 * (`AuditTrailFilterActionTypeSelect`), the locale-masked date pair
 * (`AuditTrailFilterDateRangeFields`), and the ≥44px Apply / Clear pair as
 * the trailing grid cells. Purely controlled — every edit flows up through
 * `onDraftChange`; queries fire ONLY on the enclosing form submit.
 */

import { Box, Button, TextField } from "@mui/material";
import type { CSSObject } from "@mui/material/styles";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import type { AuditActionType } from "@/frontend/graphql/generated/gql/graphql";
import { AuditTrailFilterActionTypeSelect } from "@/frontend/views/admin/audit/AuditTrailFilterActionTypeSelect";
import { AuditTrailFilterDateRangeFields } from "@/frontend/views/admin/audit/AuditTrailFilterDateRangeFields";
import type { FilterDrafts } from "@/frontend/views/admin/audit/audit-trail-filters";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

const ACTOR_ID_INPUT_ID = "audit-trail-actor-id";
const ENTITY_TYPE_INPUT_ID = "audit-trail-entity-type";
const ENTITY_ID_INPUT_ID = "audit-trail-entity-id";

const GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
  gap: 2,
  alignItems: "end",
} as const;

const ACTION_BUTTON_SX: CSSObject = { ...focusVisibleRingSx, minHeight: 44 };

interface AuditTrailFilterFieldsProps {
  readonly drafts: FilterDrafts;
  readonly onDraftChange: (patch: Partial<FilterDrafts>) => void;
  readonly labels: AdminUsersLabels["auditTrail"]["filters"];
  readonly allActionsOption: string;
  readonly actionLabels: Record<AuditActionType, string>;
  readonly fieldsDisabled: boolean;
  readonly applyInFlight: boolean;
  readonly onClear: () => void;
  /** Active UI locale — localizes the browser's built-in date mask via `lang`. */
  readonly locale: string;
}

export function AuditTrailFilterFields({
  drafts,
  onDraftChange,
  labels,
  allActionsOption,
  actionLabels,
  fieldsDisabled,
  applyInFlight,
  onClear,
  locale,
}: Readonly<AuditTrailFilterFieldsProps>): ReactNode {
  return (
    <Box sx={GRID_SX}>
      <TextField
        id={ACTOR_ID_INPUT_ID}
        type="number"
        fullWidth
        label={labels.actorIdLabel}
        value={drafts.actorId}
        onChange={event => onDraftChange({ actorId: event.target.value })}
        disabled={fieldsDisabled}
        slotProps={{ htmlInput: { min: 1, step: 1 } }}
      />
      <TextField
        id={ENTITY_TYPE_INPUT_ID}
        fullWidth
        label={labels.entityTypeLabel}
        value={drafts.entityType}
        onChange={event => onDraftChange({ entityType: event.target.value })}
        disabled={fieldsDisabled}
      />
      <TextField
        id={ENTITY_ID_INPUT_ID}
        type="number"
        fullWidth
        label={labels.entityIdLabel}
        value={drafts.entityId}
        onChange={event => onDraftChange({ entityId: event.target.value })}
        disabled={fieldsDisabled}
        slotProps={{ htmlInput: { min: 1, step: 1 } }}
      />
      <AuditTrailFilterActionTypeSelect
        drafts={drafts}
        onDraftChange={onDraftChange}
        label={labels.actionTypeLabel}
        allActionsOption={allActionsOption}
        actionLabels={actionLabels}
        disabled={fieldsDisabled}
      />
      <AuditTrailFilterDateRangeFields
        drafts={drafts}
        onDraftChange={onDraftChange}
        labels={labels}
        fieldsDisabled={fieldsDisabled}
        locale={locale}
      />
      <Button
        type="submit"
        variant="contained"
        disabled={applyInFlight}
        aria-busy={applyInFlight}
        sx={ACTION_BUTTON_SX}
      >
        {labels.applyAction}
      </Button>
      <Button type="button" variant="outlined" onClick={onClear} disabled={fieldsDisabled} sx={ACTION_BUTTON_SX}>
        {labels.clearAction}
      </Button>
    </Box>
  );
}
