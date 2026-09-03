"use client";

/**
 * The audit-trail date-range pair (from/to) as native date inputs sharing the
 * locale-aware empty-state mask implemented by the internal `LocalizedDateField`.
 * Purely controlled — each pick flows up through `onDraftChange`.
 */

import { TextField } from "@mui/material";
import { type ReactNode, useMemo } from "react";
import { shortNumericDateMask } from "@/frontend/lib/i18n/format-date";
import type { FilterDrafts } from "@/frontend/views/admin/audit/audit-trail-filters";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

const FROM_DATE_INPUT_ID = "audit-trail-from-date";
const TO_DATE_INPUT_ID = "audit-trail-to-date";

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

interface AuditTrailFilterDateRangeFieldsProps {
  readonly drafts: FilterDrafts;
  readonly onDraftChange: (patch: Partial<FilterDrafts>) => void;
  readonly labels: AdminUsersLabels["auditTrail"]["filters"];
  readonly fieldsDisabled: boolean;
  /** Active UI locale — localizes the browser's built-in date mask via `lang`. */
  readonly locale: string;
}

/**
 * Renders the from/to pair as two direct grid items (a fragment — no wrapper
 * element) so the enclosing three-column grid lays them out unchanged.
 */
export function AuditTrailFilterDateRangeFields({
  drafts,
  onDraftChange,
  labels,
  fieldsDisabled,
  locale,
}: Readonly<AuditTrailFilterDateRangeFieldsProps>): ReactNode {
  return (
    <>
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
    </>
  );
}
