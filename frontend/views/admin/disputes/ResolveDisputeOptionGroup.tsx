"use client";

import { FormControl, FormControlLabel, Radio, RadioGroup, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { DisputeResolution } from "@/frontend/graphql/generated/gql/graphql";
import type { ResolveDisputeOutcomeOption } from "@/frontend/views/admin/disputes/resolveDisputeOutcomeOptions";

/**
 * ResolveDisputeOptionGroup — the arbitration decision radios of the
 * `ResolveDisputeDialog`, driven entirely by the OFFERED outcome list of
 * the row's escrow class (localized helper texts; the server behavior per
 * outcome is documented on the dialog).
 *
 * | Escrow class (`feeHeld`) | Offered outcomes | Server behavior |
 * |--------------------------|------------------|-----------------|
 * | `true` (held)            | `Cancel`, `Complete` | `Cancel` cancels the session and refunds any held fee to its original balance lane (the SAME same-lane primitive `cancelSession` uses, inside the arbitration transaction); `Complete` completes the session and consumes the fee hold — only sessions that actually started can be completed (server `VALIDATION` otherwise) |
 * | `false` (consumed)       | `Refund`, `PartialRefund`, `Uphold` | `Refund` returns the whole fee to the student and debits the teacher's wallet; `PartialRefund` moves only the validated amount (the dialog owns that field); `Uphold` leaves the completed session standing with zero financial writes |
 *
 * The selection handler passes EVERY picked value through AS-IS — there is
 * NO fallback reclassification. A wire value that matches none of the
 * offered options (unreachable: the radio values come from `options`
 * themselves) is ignored, never silently coerced into a legal outcome.
 */

// The outcome vocabulary lives in the sibling non-component module (fast
// refresh: this file exports components only); the option TYPE stays
// reachable from this module's public surface.
export type { ResolveDisputeOutcomeOption } from "@/frontend/views/admin/disputes/resolveDisputeOutcomeOptions";

interface ResolveDisputeOptionGroupProps {
  /** The outcomes OFFERED for this row's escrow class — rendered in order, nothing else. */
  readonly options: readonly ResolveDisputeOutcomeOption[];
  /** Chosen resolution — `null` means nothing chosen (arbitration has NO default). */
  readonly value: DisputeResolution | null;
  /** Selection intent — the dialog owns the state; every offered value passes through as-is. */
  readonly onChange: (next: DisputeResolution) => void;
  /** The fieldset's accessible name (the dialog's decision vocabulary). */
  readonly groupLabel: string;
}

/** The arbitration decision radios — EXACTLY ONE terminal outcome. */
export function ResolveDisputeOptionGroup({
  options,
  value,
  onChange,
  groupLabel,
}: Readonly<ResolveDisputeOptionGroupProps>): ReactNode {
  return (
    <FormControl component="fieldset">
      <RadioGroup
        aria-label={groupLabel}
        value={value ?? ""}
        onChange={event => {
          // MUI radios hand back a plain wire string — match it against the
          // OFFERED options (string-vs-string) and hand the picked value
          // through unchanged. No whitelist collapse: an unoffered value is
          // dropped, never rewritten into a legal outcome.
          const picked = options.find(option => option.value.toString() === event.target.value);
          if (picked) {
            onChange(picked.value);
          }
        }}
        sx={{ gap: 1 }}
      >
        {options.map(option => (
          <Stack
            key={option.value}
            sx={theme => ({
              gap: 0.25,
              p: 2,
              borderRadius: 2,
              border: "1px solid",
              borderColor: theme.palette.outlineVariant,
            })}
          >
            <FormControlLabel
              value={option.value}
              control={<Radio data-testid={`resolve-dispute-radio-${option.value.toLowerCase()}`} />}
              label={option.label}
              sx={{ "& .MuiFormControlLabel-label": { fontWeight: 600 } }}
            />
            <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
              {option.helper}
            </Typography>
          </Stack>
        ))}
      </RadioGroup>
    </FormControl>
  );
}
