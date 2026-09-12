"use client";

/**
 * WalletTransactionsTable — the picked teacher's paginated transaction
 * ledger (desktop table + mobile cards): type, status, amount (exact
 * decimal string, grouped for display only), description, date. Loading
 * renders stable-key skeleton rows/cards; a zero page renders the
 * inspector's empty state; rows render from the wire only.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors.
 */

import { Box, Card, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import { DirectoryHeaderCell } from "@/frontend/views/admin/directory-shared/DirectoryHeaderCell";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { type DirectoryTone } from "@/frontend/views/admin/users/utils";
import type { AdminTeacherWalletQuery_adminTeacherWallet_transactions } from "@/frontend/graphql/generated/gql/graphql";

/** The stable skeleton row keys of the ledger's loading state. */
const LEDGER_SKELETON_KEYS = [
  "wallet-ledger-skeleton-1",
  "wallet-ledger-skeleton-2",
  "wallet-ledger-skeleton-3",
  "wallet-ledger-skeleton-4",
  "wallet-ledger-skeleton-5",
  "wallet-ledger-skeleton-6",
] as const;

/** Ledger entry type → tonal lane (withdrawal = warning, bonus = success, earning = primary). */
function ledgerTypeTone(type: string): DirectoryTone {
  switch (type) {
    case "withdrawal":
      return "warning";
    case "bonus":
      return "success";
    default:
      return "primary";
  }
}

/** Ledger entry status → tonal lane (pending = warning, completed = success, failed = error). */
function ledgerStatusTone(status: string): DirectoryTone {
  switch (status) {
    case "pending":
      return "warning";
    case "completed":
      return "success";
    default:
      return "error";
  }
}

interface WalletTransactionsTableProps {
  readonly transactions: readonly AdminTeacherWalletQuery_adminTeacherWallet_transactions[];
  readonly loading: boolean;
  readonly locale: string;
  readonly labels: {
    readonly typeHeader: string;
    readonly statusHeader: string;
    readonly amountHeader: string;
    readonly descriptionHeader: string;
    readonly dateHeader: string;
    readonly empty: string;
    readonly loadingLabel: string;
  };
}

/** The picked teacher's transaction ledger (desktop table + mobile cards). */
export function WalletTransactionsTable({ transactions, loading, locale, labels }: Readonly<WalletTransactionsTableProps>): ReactNode {
  const empty = (
    <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {labels.empty}
      </Typography>
    </Stack>
  );

  return (
    <>
      {/* Desktop (≥md): the hand-rolled ledger table card. */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <Card
          sx={theme => ({
            borderRadius: "12px",
            border: `1px solid ${theme.palette.border.light}`,
            boxShadow: theme.palette.shadow.card,
            overflow: "hidden",
          })}
        >
          <Table sx={{ tableLayout: "fixed" }} aria-label={labels.typeHeader}>
            <TableHead>
              <TableRow sx={theme => ({ bgcolor: theme.palette.surfaceContainerHigh })}>
                <DirectoryHeaderCell width="14%">{labels.typeHeader}</DirectoryHeaderCell>
                <DirectoryHeaderCell width="14%">{labels.statusHeader}</DirectoryHeaderCell>
                <DirectoryHeaderCell width="16%">{labels.amountHeader}</DirectoryHeaderCell>
                <DirectoryHeaderCell width="34%">{labels.descriptionHeader}</DirectoryHeaderCell>
                <DirectoryHeaderCell width="22%">{labels.dateHeader}</DirectoryHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody aria-label={loading && transactions.length === 0 ? labels.loadingLabel : undefined}>
              {loading && transactions.length === 0
                ? LEDGER_SKELETON_KEYS.map(rowKey => (
                    <TableRow key={rowKey}>
                      <TableCell colSpan={5} sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                        <Skeleton variant="text" />
                      </TableCell>
                    </TableRow>
                  ))
                : null}
              {!loading && transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ borderBottom: 0 }}>
                    {empty}
                  </TableCell>
                </TableRow>
              ) : null}
              {transactions.map((tx, index) => (
                <TableRow
                  key={tx.id}
                  sx={theme => ({
                    ...(index % 2 === 1 && { backgroundColor: theme.palette.action.hover }),
                    "&:hover": { backgroundColor: theme.palette.action.selected },
                  })}
                >
                  <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                    <TonalChip tone={ledgerTypeTone(tx.type)} label={tx.type} />
                  </TableCell>
                  <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                    <TonalChip tone={ledgerStatusTone(tx.status)} label={tx.status} />
                  </TableCell>
                  <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}>
                    <Typography variant="body2">{formatMoneyAmount(tx.amount)}</Typography>
                  </TableCell>
                  <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                    <Typography variant="body2">{tx.description}</Typography>
                  </TableCell>
                  <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                    <Typography variant="body2">{formatApplicantDate(tx.createdAt, locale)}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Box>
      {/* Mobile (<md): per-transaction cards. */}
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <Stack spacing={2}>
          {loading && transactions.length === 0
            ? LEDGER_SKELETON_KEYS.slice(0, 4).map(rowKey => (
                <Card key={rowKey} sx={theme => ({ borderRadius: "12px", border: `1px solid ${theme.palette.border.light}`, boxShadow: theme.palette.shadow.card, p: 2, height: 132 })} />
              ))
            : null}
          {!loading && transactions.length === 0 ? (
            <Card sx={theme => ({ borderRadius: "12px", border: `1px solid ${theme.palette.border.light}`, boxShadow: theme.palette.shadow.card })}>{empty}</Card>
          ) : null}
          {transactions.map(tx => (
            <Card
              key={tx.id}
              sx={theme => ({ borderRadius: "12px", border: `1px solid ${theme.palette.border.light}`, boxShadow: theme.palette.shadow.card, p: 2 })}
            >
              <Stack spacing={1}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                  <TonalChip tone={ledgerTypeTone(tx.type)} label={tx.type} />
                  <TonalChip tone={ledgerStatusTone(tx.status)} label={tx.status} />
                </Stack>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                  <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
                    {labels.amountHeader}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {formatMoneyAmount(tx.amount)}
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                  <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
                    {labels.descriptionHeader}
                  </Typography>
                  <Typography variant="body2" sx={{ textAlign: "end" }}>
                    {tx.description}
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                  <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
                    {labels.dateHeader}
                  </Typography>
                  <Typography variant="body2">{formatApplicantDate(tx.createdAt, locale)}</Typography>
                </Stack>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Box>
    </>
  );
}
