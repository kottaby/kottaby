"use client";

/**
 * WithdrawQuickAmounts — the quick-amount chip group of the withdrawal
 * dialog: one chip per fraction of the teacher's available balance,
 * pre-formatted to the wire's 2-decimal shape so a chip value always
 * passes the client amount mirror. A native `fieldset` grouping (the
 * a11y tier's `prefer-tag-over-role`), reset to a plain flex row.
 */

import { Box, Chip } from "@mui/material";
import type { ReactNode } from "react";

interface WithdrawQuickAmountsProps {
  /** The available balance decimal string (the hint's source of truth). */
  readonly balance: string;
  /** Whether the request is in flight (chips park while it runs). */
  readonly disabled: boolean;
  /** Accessible name of the group (the localized copy). */
  readonly label: string;
  /** Amount setter — receives the pre-formatted decimal string. */
  readonly onPick: (amount: string) => void;
}

/** The quick-amount chip row — see the module docblock. */
export function WithdrawQuickAmounts({
  balance,
  disabled,
  label,
  onPick,
}: Readonly<WithdrawQuickAmountsProps>): ReactNode {
  const available = Number.parseFloat(balance);
  if (!Number.isFinite(available) || available <= 0) return null;
  const quicks = (
    [
      [0.25, "25%"],
      [0.5, "50%"],
      [1, "100%"],
    ] as const
  ).map(([fraction, tag]) => ({ label: tag, value: (available * fraction).toFixed(2) }));

  return (
    <Box
      component="fieldset"
      aria-label={label}
      data-testid="wallet-quick-amounts"
      sx={{ border: 0, m: 0, mt: 1.5, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 1 }}
    >
      {quicks.map(quick => (
        <Chip
          key={quick.label}
          data-testid={`wallet-quick-amount-${quick.label}`}
          label={quick.label}
          onClick={() => onPick(quick.value)}
          disabled={disabled}
          size="small"
          variant="outlined"
          sx={theme => ({
            fontVariantNumeric: "tabular-nums",
            borderColor: theme.palette.outline,
            "&:hover": { borderColor: theme.palette.primary.main },
          })}
        />
      ))}
    </Box>
  );
}
