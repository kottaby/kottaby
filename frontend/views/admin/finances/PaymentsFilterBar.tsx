"use client";

/**
 * PaymentsFilterBar — the payments audit panel's filter bar: a real
 * `<form>` whose submit narrows the query (NEVER per-field `onChange`
 * queries; `React.SubmitEvent` discipline). The bar edits a DRAFT (raw
 * strings; the student search is a free-text substring the server escapes
 * and ILIKE-wraps; dates are native `date` inputs committed as inclusive
 * from-midnight / exclusive to-midnight UTC instants) and lifts only the
 * settled outcomes: `onApply` receives the applied filter record, `onReset`
 * restores the unfiltered listing.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors, ≥44px touch targets.
 */

import { FilterListOutlined } from "@mui/icons-material";
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { type ReactNode, useId, useState } from "react";
import {
  type PaymentGateway,
  PaymentGateway as PaymentGatewayEnum,
  type PaymentStatus,
  PaymentStatus as PaymentStatusEnum,
} from "@/frontend/graphql/generated/gql/graphql";
import type { AppliedPaymentFilters } from "@/frontend/views/admin/finances/useAdminFinanceQueries";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** Filter drafts — raw controlled input shape (`""` = unset). */
interface PaymentFilterDrafts {
  readonly studentName: string;
  readonly status: PaymentStatus | "";
  readonly paymentGateway: PaymentGateway | "";
  readonly from: string;
  readonly to: string;
}

const EMPTY_DRAFTS: PaymentFilterDrafts = {
  studentName: "",
  status: "",
  paymentGateway: "",
  from: "",
  to: "",
};

/**
 * Parses a `YYYY-MM-DD` date-input value into UTC midnight. Malformed or
 * impossible calendar values normalize to `null` (the `Date.UTC` rollover
 * guard — an unparseable draft never constrains the query).
 */
function parseUtcDayStart(value: string): Date | null {
  const match = DAY_PATTERN.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** The exclusive wire boundary for the `to` calendar day (UTC has no DST). */
function parseUtcDayEndExclusive(value: string): Date | null {
  const start = parseUtcDayStart(value);
  return start === null ? null : new Date(start.getTime() + DAY_MS);
}

/** The canonical payment-status draft options, in display order. */
const STATUS_OPTIONS: readonly PaymentStatus[] = [
  PaymentStatusEnum.Pending,
  PaymentStatusEnum.Paid,
  PaymentStatusEnum.Failed,
  PaymentStatusEnum.Refunded,
];

/** The canonical payment-gateway draft options, in display order. */
const GATEWAY_OPTIONS: readonly PaymentGateway[] = [
  PaymentGatewayEnum.Stripe,
  PaymentGatewayEnum.Paypal,
  PaymentGatewayEnum.Paymob,
  PaymentGatewayEnum.Fawry,
  PaymentGatewayEnum.OfflineCash,
  PaymentGatewayEnum.BankTransfer,
  PaymentGatewayEnum.Scholarship,
  PaymentGatewayEnum.Other,
];

interface PaymentsFilterBarProps {
  /** Apply intent — receives the applied filter record built from drafts. */
  readonly onApply: (applied: AppliedPaymentFilters) => void;
  /** Reset intent — restores the unfiltered listing. */
  readonly onReset: () => void;
}

/** The payments audit filter section (search + status + gateway + window). */
export function PaymentsFilterBar({ onApply, onReset }: Readonly<PaymentsFilterBarProps>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  const [drafts, setDrafts] = useState<PaymentFilterDrafts>(EMPTY_DRAFTS);

  const statusSelectId = useId();
  const gatewaySelectId = useId();
  const SEARCH_INPUT_ID = "admin-finances-filter-student";
  const STATUS_LABEL_ID = "admin-finances-filter-status-label";
  const GATEWAY_LABEL_ID = "admin-finances-filter-gateway-label";

  const updateDraft = (patch: Partial<PaymentFilterDrafts>): void => {
    setDrafts(current => ({ ...current, ...patch }));
  };

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const inverted =
      drafts.from !== "" &&
      drafts.to !== "" &&
      (parseUtcDayStart(drafts.from)?.getTime() ?? 0) > (parseUtcDayStart(drafts.to)?.getTime() ?? 0);
    onApply({
      studentName: drafts.studentName.trim() || null,
      status: drafts.status === "" ? null : drafts.status,
      paymentGateway: drafts.paymentGateway === "" ? null : drafts.paymentGateway,
      from: inverted || drafts.from === "" ? null : parseUtcDayStart(drafts.from),
      to: inverted || drafts.to === "" ? null : parseUtcDayEndExclusive(drafts.to),
    });
  };

  const handleReset = (): void => {
    setDrafts(EMPTY_DRAFTS);
    onReset();
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      data-testid="admin-finances-payments-filters"
      sx={theme => ({
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
        p: { xs: 2, sm: 2.5 },
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
      })}
    >
      <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 1, gridColumn: "1 / -1" }}>
        <FilterListOutlined fontSize="small" sx={theme => ({ color: theme.palette.text.secondary })} />
        <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 700 }}>
          {t.studentSearchLabel}
        </Typography>
      </Stack>

      <TextField
        id={SEARCH_INPUT_ID}
        fullWidth
        label={t.studentSearchLabel}
        value={drafts.studentName}
        onChange={event => updateDraft({ studentName: event.target.value })}
        data-testid="admin-finances-filter-student"
        slotProps={{ htmlInput: { autoComplete: "off" } }}
      />

      <FormControl>
        <InputLabel id={STATUS_LABEL_ID}>{t.statusFilterLabel}</InputLabel>
        <Select
          labelId={STATUS_LABEL_ID}
          id={statusSelectId}
          value={drafts.status}
          label={t.statusFilterLabel}
          onChange={event => updateDraft({ status: (event.target.value || "") as PaymentStatus | "" })}
          data-testid="admin-finances-filter-status"
        >
          <MenuItem value="">{t.allStatusesOption}</MenuItem>
          {STATUS_OPTIONS.map(status => (
            <MenuItem key={status} value={status}>
              {status}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl>
        <InputLabel id={GATEWAY_LABEL_ID}>{t.gatewayFilterLabel}</InputLabel>
        <Select
          labelId={GATEWAY_LABEL_ID}
          id={gatewaySelectId}
          value={drafts.paymentGateway}
          label={t.gatewayFilterLabel}
          onChange={event => updateDraft({ paymentGateway: (event.target.value || "") as PaymentGateway | "" })}
          data-testid="admin-finances-filter-gateway"
        >
          <MenuItem value="">{t.allGatewaysOption}</MenuItem>
          {GATEWAY_OPTIONS.map(gateway => (
            <MenuItem key={gateway} value={gateway}>
              {gateway}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Stack sx={{ flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}>
        <TextField
          fullWidth
          type="date"
          label={t.dateFromLabel}
          value={drafts.from}
          onChange={event => updateDraft({ from: event.target.value })}
          data-testid="admin-finances-filter-from"
          slotProps={{
            htmlInput: { autoComplete: "off" },
            // Native date inputs always paint their segments — an un-shrunk
            // label would overlap them.
            inputLabel: { shrink: true },
          }}
        />
        <TextField
          fullWidth
          type="date"
          label={t.dateToLabel}
          value={drafts.to}
          onChange={event => updateDraft({ to: event.target.value })}
          data-testid="admin-finances-filter-to"
          slotProps={{
            htmlInput: { autoComplete: "off" },
            inputLabel: { shrink: true },
          }}
        />
      </Stack>

      <Stack
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          gap: 1.5,
          gridColumn: "1 / -1",
          justifyContent: "flex-end",
          alignItems: { xs: "stretch", sm: "center" },
        }}
      >
        <Button
          variant="outlined"
          onClick={handleReset}
          data-testid="admin-finances-filters-reset"
          sx={theme => ({
            minHeight: { xs: 44, sm: 40 },
            px: 3,
            // Quiet must stay legible on the dark filter card — the reset
            // rides the near-white text + solid outline pair.
            color: theme.palette.text.primary,
            borderColor: theme.palette.outline,
            "&:hover": {
              borderColor: theme.palette.primary.main,
              backgroundColor: "transparent",
            },
          })}
        >
          {t.resetFilters}
        </Button>
        <Button
          type="submit"
          variant="contained"
          data-testid="admin-finances-filters-apply"
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.applyFilters}
        </Button>
      </Stack>
    </Box>
  );
}
