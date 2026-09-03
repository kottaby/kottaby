"use client";

/**
 * The audit-trail filter field grid (three-column wrap layout): actor-id / entity-id
 * number fields, free-text entity type, the
 * action-type `Select` fed by the generated `AuditActionType` values × the
 * REUSED `adminUsers.activity.action*` labels with an "all actions" empty
 * option, the native date-input from/to pair, and the ≥44px Apply / Clear
 * pair as the trailing grid cells. Purely controlled — every edit flows up
 * through `onDraftChange`; queries fire ONLY on the enclosing form submit.
 */

import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import type { CSSObject } from "@mui/material/styles";
import { type ReactNode, useMemo } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { shortNumericDateMask } from "@/frontend/lib/i18n/format-date";
import type { AuditActionType } from "@/frontend/graphql/generated/gql/graphql";
import { ACTION_VALUES, type FilterDrafts } from "@/frontend/views/admin/audit/audit-trail-filters";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

const ACTOR_ID_INPUT_ID = "audit-trail-actor-id";
const ENTITY_TYPE_INPUT_ID = "audit-trail-entity-type";
const ENTITY_ID_INPUT_ID = "audit-trail-entity-id";
const ACTION_TYPE_SELECT_ID = "audit-trail-action-type";
/** MUI wires the trigger's `aria-labelledby` ONLY from this prop — it is what gives the combobox its accessible name. */
const ACTION_TYPE_LABEL_ID = "audit-trail-action-type-label";
const FROM_DATE_INPUT_ID = "audit-trail-from-date";
const TO_DATE_INPUT_ID = "audit-trail-to-date";

const GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
  gap: 2,
  alignItems: "end",
} as const;

const ACTION_BUTTON_SX: CSSObject = { ...focusVisibleRingSx, minHeight: 44 };

/**
 * Native date field with a LOCALE-aware empty-state mask. Chromium paints its
 * internal `mm/dd/yyyy` mask from the browser language and ignores the input's
 * `lang` attribute, so the Arabic UI showed an LTR English mask (QA finding).
 * While the field is empty the browser mask is hidden (WebKit-only selector,
 * feature-guarded) and the locale's own short numeric mask — built by
 * `shortNumericDateMask` — is painted over the field instead. Focus and
 * non-empty states fall back to the native control untouched.
 */
function LocalizedDateField({
  id,
  label,
  value,
  onChange,
  disabled,
  locale,
}: Readonly<{
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly disabled: boolean;
  readonly locale: string;
}>): ReactNode {
  const mask = useMemo(() => shortNumericDateMask(locale), [locale]);
  const isEmpty = value === "";
  return (
    <TextField
      id={id}
      type="date"
      fullWidth
      label={label}
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled}
      slotProps={{
        // `lang` still helps browsers that DO honor it for the date mask.
        htmlInput: { lang: locale, "data-empty": isEmpty ? "true" : "false" },
        input: {
          sx: theme => ({
            // The mask text rides in as a CSS custom property (slot props are
            // typed, so a data-* carrier attribute is not allowed here).
            "--date-mask": `"${mask}"`,
            position: "relative",
            "&::before": {
              content: "var(--date-mask)",
              position: "absolute",
              insetInlineStart: 14,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              fontSize: "1rem",
              color: theme.palette.text.disabled,
              opacity: 0,
            },
            // `data-empty` sits on the inner <input> (via htmlInput) — :has
            // lifts it to the field root that hosts the overlay: empty and
            // unfocused shows the locale mask, focus/empty+focused hides it.
            "&:has(input[data-empty='true']):not(:focus-within)::before": {
              opacity: 1,
            },
            // Hiding the browser mask through the INPUT's own color (the
            // native date mask text inherits it) works across engines;
            // targeting the WebKit-internal `::-webkit-datetime-edit` pseudo
            // proved unobservable via CSSOM and is not needed.
            "&:has(input[data-empty='true']):not(:focus-within) input[data-empty='true']:not(:focus)": {
              color: "transparent",
            },
          }),
        },
      }}
    />
  );
}

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
      <FormControl sx={{ minWidth: 150 }}>
        <InputLabel id={ACTION_TYPE_LABEL_ID}>{labels.actionTypeLabel}</InputLabel>
        <Select
          id={ACTION_TYPE_SELECT_ID}
          labelId={ACTION_TYPE_LABEL_ID}
          value={drafts.actionType}
          label={labels.actionTypeLabel}
          onChange={event => onDraftChange({ actionType: event.target.value || "" })}
          disabled={fieldsDisabled}
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
      <LocalizedDateField
        id={FROM_DATE_INPUT_ID}
        label={labels.fromDateLabel}
        value={drafts.from}
        onChange={next => onDraftChange({ from: next })}
        disabled={fieldsDisabled}
        locale={locale}
      />
      <LocalizedDateField
        id={TO_DATE_INPUT_ID}
        label={labels.toDateLabel}
        value={drafts.to}
        onChange={next => onDraftChange({ to: next })}
        disabled={fieldsDisabled}
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
