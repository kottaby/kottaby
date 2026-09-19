"use client";

/**
 * WalletLedger — the newest-first transaction ledger list, extracted
 * verbatim from `TeacherWalletContainer`'s `WalletBody` (the max-lines
 * split: the list was the bulk of the body's line count). Rows carry the
 * tinted type avatar, the signed amount (a string PREFIX — never math),
 * the status chip, and the description + date-time secondary pair.
 * The card is a flex-grow item of the page column, so on `sm+` viewports
 * it stretches to the remaining viewport height instead of stranding a
 * bare band of background under it (mobile keeps its natural height).
 *
 * Filter chips (CR-4): the header carries a client-side type filter —
 * `All` plus one chip per type PRESENT in the fetched page (a type with
 * zero rows renders no dead chip). Filtering is pure presentation: the
 * wire page stays the source of truth, the counts are derived in-memory,
 * and a defensively-empty filtered view renders an honest notice instead
 * of fabricating rows.
 */

import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import { Divider, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import {
  type MyWalletQuery_myWallet_transactions,
  TransactionType as WireTransactionType,
} from "@/frontend/graphql/generated/gql/graphql";
import { SessionsEmptyState } from "@/frontend/views/student/sessions/SessionsEmptyState";
import { WalletLedgerFilterBar } from "@/frontend/views/teacher/wallet/WalletLedger.parts";
import { WalletLedgerRows } from "@/frontend/views/teacher/wallet/WalletLedgerRows";
import { exportLedgerCsv } from "@/frontend/views/teacher/wallet/walletLedgerCsv";
import {
  ledgerRowVisual,
  ledgerStatusLabel,
  ledgerTypeLabel,
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
    <Paper
      variant="outlined"
      sx={{ borderRadius: 3, overflow: "hidden", flexGrow: 1, display: "flex", flexDirection: "column" }}
    >
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
        <Tooltip title={t.exportCsv}>
          <IconButton
            data-testid="wallet-ledger-export-csv"
            aria-label={t.exportCsv}
            size="small"
            onClick={() =>
              exportLedgerCsv(transactions, {
                type: type => ledgerTypeLabel(type, t),
                status: status => ledgerStatusLabel(status, t),
              })
            }
            sx={theme => ({ marginInlineStart: "auto", color: theme.palette.onSurfaceVariant })}
          >
            <DownloadOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Divider />
      <WalletLedgerFilterBar
        chips={filterChips}
        activeKey={filter}
        onChange={next => setFilter(next)}
        label={t.ledgerTitle}
      />
      <Divider />
      {visible.length === 0 ? (
        <SessionsEmptyState
          testId="wallet-ledger-filtered-empty"
          icon={ledgerRowVisual(WireTransactionType.Earning).Icon}
          title={t.ledgerFilteredTitle}
          body={t.ledgerFilteredEmpty}
        />
      ) : (
        <WalletLedgerRows rows={visible} locale={locale} t={t} />
      )}
      {/* The stretch footer: on tall viewports the card grows, and this line
          (pinned to its end) absorbs the remainder deliberately instead of
          leaving an unstructured void under the last row. */}
      <Typography
        variant="caption"
        sx={theme => ({
          mt: "auto",
          px: 2.5,
          py: 1.25,
          borderTop: "1px solid",
          borderColor: theme.palette.divider,
          bgcolor: theme.palette.surfaceContainerLow,
          color: theme.palette.onSurfaceVariant,
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
        })}
      >
        {t.ledgerShownAll(visible.length, transactions.length)}
      </Typography>
    </Paper>
  );
}
