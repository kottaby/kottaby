"use client";

/**
 * WalletLedger parts — the ledger's presentational halves (the type-filter
 * chip bar and the newest-first row list), carved out of `WalletLedger` so
 * the filter affordance and the row anatomy each stay under the TSX
 * function-size tier. The arbitration_reversal chip filters like any other
 * ledger type.
 */

import { Avatar, Box, Chip, List, ListItem, ListItemAvatar, ListItemText, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { MyWalletQuery_myWallet_transactions } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  amountTone,
  avatarTone,
  ledgerRowVisual,
  ledgerStatusColor,
  ledgerStatusLabel,
  ledgerTypeLabel,
} from "@/frontend/views/teacher/wallet/walletLedgerVisuals";
import type { WalletLabels } from "@/shared/locale/types/wallet";

/** One filter chip's view model (the bar renders them verbatim). */
export interface WalletLedgerFilterChip {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/**
 * The type-filter chip bar. A native `fieldset` grouping (the a11y tier's
 * `prefer-tag-over-role` — the chips' toggle-group semantics ride the
 * element, not an ARIA role), reset to a plain flex row.
 */
export function WalletLedgerFilterBar({
  chips,
  activeKey,
  onChange,
  label,
}: Readonly<{
  chips: readonly WalletLedgerFilterChip[];
  activeKey: string;
  onChange: (next: string) => void;
  label: string;
}>): ReactNode {
  return (
    <Box
      component="fieldset"
      aria-label={label}
      data-testid="wallet-ledger-filter"
      sx={theme => ({
        border: 0,
        m: 0,
        minWidth: 0,
        px: 2.5,
        py: 1.25,
        display: "flex",
        flexWrap: "wrap",
        gap: 0.75,
        rowGap: 1,
        bgcolor: theme.palette.surfaceContainerLow,
      })}
    >
      {chips.map(chip => (
        <Chip
          key={chip.key}
          data-testid={`wallet-ledger-filter-${chip.key}`}
          label={`${chip.label} (${chip.count})`}
          aria-pressed={activeKey === chip.key}
          onClick={() => onChange(chip.key)}
          color={activeKey === chip.key ? "primary" : "default"}
          variant={activeKey === chip.key ? "filled" : "outlined"}
          size="small"
          sx={{
            fontVariantNumeric: "tabular-nums",
            ...(activeKey === chip.key ? {} : { bgcolor: "transparent" }),
          }}
        />
      ))}
    </Box>
  );
}

/** The newest-first ledger rows — avatar, signed amount, status chip, description · date. */
export function WalletLedgerRows({
  rows,
  locale,
  t,
}: Readonly<{
  rows: readonly MyWalletQuery_myWallet_transactions[];
  locale: string;
  t: WalletLabels;
}>): ReactNode {
  return (
    <List data-testid="wallet-ledger" disablePadding>
      {visible.map((row, index) => {
        const visual = ledgerRowVisual(row.type);
        return (
          <ListItem
            key={row.id}
            data-testid={`wallet-ledger-row-${row.id}`}
            divider={index < visible.length - 1}
            secondaryAction={
              <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                <Typography
                  data-testid={`wallet-ledger-row-${row.id}-amount`}
                  sx={theme => ({
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: amountTone(row.type, theme.palette),
                  })}
                >
                  {signedAmount(row)}
                </Typography>
                <Chip
                  data-testid={`wallet-ledger-row-${row.id}-status`}
                  label={ledgerStatusLabel(row.status, t)}
                  color={ledgerStatusColor(row.status)}
                  size="small"
                  variant="outlined"
                />
              </Stack>
            }
            sx={{ pr: { xs: 14, sm: 16 } }}
          >
            <ListItemAvatar>
              <Avatar variant="rounded" sx={theme => ({ borderRadius: 2, ...avatarTone(row.type, theme.palette) })}>
                <visual.Icon fontSize="small" />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={ledgerTypeLabel(row.type, t)}
              secondary={
                row.description === null
                  ? formatApplicantDate(row.createdAt, locale)
                  : `${row.description} · ${formatApplicantDate(row.createdAt, locale)}`
              }
              slotProps={{
                primary: { variant: "body2", sx: { fontWeight: 600 } },
                secondary: { variant: "caption" },
              }}
            />
          </ListItem>
        );
      })}
    </List>
  );
}
