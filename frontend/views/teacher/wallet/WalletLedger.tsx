"use client";

/**
 * WalletLedger — the newest-first transaction ledger list, extracted
 * verbatim from `TeacherWalletContainer`'s `WalletBody` (the max-lines
 * split: the list was the bulk of the body's line count). Rows carry the
 * tinted type avatar, the signed amount (a string PREFIX — never math),
 * the status chip, and the description · date secondary line.
 *
 * Filter chips (CR-4): the header carries a client-side type filter —
 * `All` plus one chip per type PRESENT in the fetched page (a type with
 * zero rows renders no dead chip). Filtering is pure presentation: the
 * wire page stays the source of truth, the counts are derived in-memory,
 * and a defensively-empty filtered view renders an honest notice instead
 * of fabricating rows.
 */

import {
  Avatar,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { MyWalletQuery_myWallet_transactions } from "@/frontend/graphql/generated/gql/graphql";
import { TransactionType as WireTransactionType } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { SessionsEmptyState } from "@/frontend/views/student/sessions/SessionsEmptyState";
import {
  amountTone,
  avatarTone,
  ledgerRowVisual,
  ledgerStatusColor,
  ledgerStatusLabel,
  ledgerTypeLabel,
  signedAmount,
} from "@/frontend/views/teacher/wallet/walletLedgerVisuals";
import type { WalletLabels } from "@/shared/locale/types/wallet";

export interface WalletLedgerProps {
  readonly transactions: readonly MyWalletQuery_myWallet_transactions[];
  readonly locale: string;
  readonly t: WalletLabels;
}

/** Every ledger type chip in wire-enum order — `all` is prepended at render. */
const TYPE_FILTERS: readonly WireTransactionType[] = [
  WireTransactionType.Earning,
  WireTransactionType.Withdrawal,
  WireTransactionType.Bonus,
  WireTransactionType.ArbitrationReversal,
] as const;

/** The ledger list with its type filter — see the module docblock. */
export function WalletLedger({ transactions, locale, t }: Readonly<WalletLedgerProps>): ReactNode {
  const [filter, setFilter] = useState<WireTransactionType | "all">("all");

  /** Per-type row counts over the fetched page — drives chip visibility. */
  const counts = useMemo(() => {
    const map = new Map<WireTransactionType, number>();
    for (const row of transactions) {
      map.set(row.type, (map.get(row.type) ?? 0) + 1);
    }
    return map;
  }, [transactions]);

  const visible = useMemo(
    () => (filter === "all" ? transactions : transactions.filter(row => row.type === filter)),
    [filter, transactions]
  );

  const filterChips: readonly {
    readonly key: WireTransactionType | "all";
    readonly label: string;
    readonly count: number;
  }[] = [
    { key: "all", label: t.filterAll, count: transactions.length },
    ...TYPE_FILTERS.filter(type => (counts.get(type) ?? 0) > 0).map(type => ({
      key: type,
      label: ledgerTypeLabel(type, t),
      count: counts.get(type) ?? 0,
    })),
  ];

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Stack
        direction="row"
        spacing={1}
        sx={theme => ({
          px: 2.5,
          py: 1.5,
          alignItems: "center",
          bgcolor: theme.palette.surfaceContainerLow,
        })}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t.ledgerTitle}
        </Typography>
      </Stack>
      <Divider />
      <Stack
        direction="row"
        role="group"
        aria-label={t.ledgerTitle}
        data-testid="wallet-ledger-filter"
        spacing={0.75}
        sx={theme => ({
          px: 2.5,
          py: 1.25,
          flexWrap: "wrap",
          gap: 0.75,
          rowGap: 1,
          bgcolor: theme.palette.surfaceContainerLow,
        })}
      >
        {filterChips.map(chip => (
          <Chip
            key={chip.key}
            data-testid={`wallet-ledger-filter-${chip.key}`}
            label={`${chip.label} (${chip.count})`}
            aria-pressed={filter === chip.key}
            onClick={() => setFilter(chip.key)}
            color={filter === chip.key ? "primary" : "default"}
            variant={filter === chip.key ? "filled" : "outlined"}
            size="small"
            sx={{
              fontVariantNumeric: "tabular-nums",
              ...(filter === chip.key ? {} : { bgcolor: "transparent" }),
            }}
          />
        ))}
      </Stack>
      <Divider />
      {visible.length === 0 ? (
        <SessionsEmptyState
          testId="wallet-ledger-filtered-empty"
          icon={ledgerRowVisual(WireTransactionType.Earning).Icon}
          title={t.ledgerFilteredTitle}
          body={t.ledgerFilteredEmpty}
        />
      ) : (
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
      )}
    </Paper>
  );
}
