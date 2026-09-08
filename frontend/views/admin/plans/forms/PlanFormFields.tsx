/**
 * PlanFormFields — Editable field set for the plan create/edit dialog.
 *
 * Extracted from PlanFormDialog.
 *  - Client & server validation with field-level error messages
 *  - Accessible form fields with `aria-invalid`
 *  - Balance-credit lane select over the three subscription credit lanes
 */

"use client";

import { MenuItem, Stack, TextField } from "@mui/material";
import { SubscriptionCreditLane } from "@/frontend/graphql/generated/gql/graphql";
import type { PlanFormState } from "@/frontend/views/admin/plans/hooks/usePlanForm";
import { useAppTranslation } from "@/shared/locale/client";
import { Plans } from "@/shared/locale/namespaces/plans";

/** Lane options in catalog order (memorization → recitation rules → review). */
const BALANCE_LANE_OPTIONS: readonly SubscriptionCreditLane[] = [
  SubscriptionCreditLane.Hifz,
  SubscriptionCreditLane.Tajweed,
  SubscriptionCreditLane.Reviews,
];

export interface PlanFormFieldsProps {
  readonly form: PlanFormState;
  readonly loading: boolean;
  readonly onFieldChange: (field: keyof PlanFormState) => (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly fieldError: (field: keyof PlanFormState) => string | undefined;
}

export function PlanFormFields({ form, loading, onFieldChange, fieldError }: PlanFormFieldsProps): React.ReactElement {
  const t = useAppTranslation(Plans);

  const balanceLaneLabels: Record<SubscriptionCreditLane, string> = {
    [SubscriptionCreditLane.Hifz]: t.balanceLaneHifz,
    [SubscriptionCreditLane.Tajweed]: t.balanceLaneTajweed,
    [SubscriptionCreditLane.Reviews]: t.balanceLaneReviews,
  };

  return (
    <>
      <TextField
        label={t.titleFieldLabel}
        placeholder={t.titleFieldPlaceholder}
        value={form.title}
        onChange={onFieldChange("title")}
        error={Boolean(fieldError("title"))}
        helperText={fieldError("title")}
        aria-invalid={Boolean(fieldError("title"))}
        fullWidth
        required
        disabled={loading}
      />

      <Stack sx={{ flexDirection: { xs: "column", sm: "row" }, gap: 2 }}>
        <TextField
          label={t.sessionCountFieldLabel}
          type="number"
          value={form.sessionCount}
          onChange={onFieldChange("sessionCount")}
          error={Boolean(fieldError("sessionCount"))}
          helperText={fieldError("sessionCount")}
          aria-invalid={Boolean(fieldError("sessionCount"))}
          fullWidth
          required
          disabled={loading}
        />

        <TextField
          label={t.intervalDaysFieldLabel}
          type="number"
          value={form.intervalDays}
          onChange={onFieldChange("intervalDays")}
          error={Boolean(fieldError("intervalDays"))}
          helperText={fieldError("intervalDays")}
          aria-invalid={Boolean(fieldError("intervalDays"))}
          fullWidth
          required
          disabled={loading}
        />
      </Stack>

      <Stack sx={{ flexDirection: { xs: "column", sm: "row" }, gap: 2 }}>
        <TextField
          label={t.priceFieldLabel}
          value={form.price}
          onChange={onFieldChange("price")}
          error={Boolean(fieldError("price"))}
          helperText={fieldError("price")}
          aria-invalid={Boolean(fieldError("price"))}
          fullWidth
          required
          disabled={loading}
        />

        <TextField
          label={t.currencyFieldLabel}
          value={form.currency}
          onChange={onFieldChange("currency")}
          error={Boolean(fieldError("currency"))}
          helperText={fieldError("currency")}
          aria-invalid={Boolean(fieldError("currency"))}
          fullWidth
          required
          disabled={loading}
        />
      </Stack>

      <TextField
        select
        label={t.balanceLaneFieldLabel}
        value={form.balanceLane}
        onChange={onFieldChange("balanceLane")}
        error={Boolean(fieldError("balanceLane"))}
        helperText={fieldError("balanceLane")}
        aria-invalid={Boolean(fieldError("balanceLane"))}
        fullWidth
        required
        disabled={loading}
      >
        {BALANCE_LANE_OPTIONS.map(lane => (
          <MenuItem key={lane} value={lane}>
            {balanceLaneLabels[lane]}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}
