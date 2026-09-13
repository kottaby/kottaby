"use client";

/**
 * WalletLedgerTableCard — the desktop (≥`md`) transaction ledger table
 * card of the admin wallet inspector (`/admin/finances`, wallet tab),
 * extracted from the original monolithic table as a focused sibling
 * component: type, status, amount (exact decimal string, grouped for
 * display only), description, date, over the shared header cell + footer
 * atoms. Loading renders stable-key skeleton rows; a zero page renders the
 * inspector's empty state.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors.
 */

import { Card, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminTeacherWalletQuery_adminTeacherWallet_transactions } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { DirectoryHeaderCell } from "@/frontend/views/admin/directory-shared/DirectoryHeaderCell";
import { directoryTableCardSx } from "@/frontend/views/admin/directory-shared/directory-skins";
import { AdminFinancePaginationBar } from "@/frontend/views/admin/finances/AdminFinancePaginationBar";
import { WalletLedgerSkeletonKeys } from "@/frontend/views/admin/finances/adminFinanceSkeletonKeys";
import {
  ledgerStatusLabel,
  ledgerStatusTone,
  ledgerTypeLabel,
  ledgerTypeTone,
} from "@/frontend/views/admin/finances/walletLedgerDisplay";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import type { AdminFinanceLabels } from "@/shared/locale/types/adminFinance";

interface WalletLedgerTableCardProps {
  readonly transactions: readonly AdminTeacherWalletQuery_adminTeacherWallet_transactions[];
  readonly loading: boolean;
  readonly locale: string;
  readonly labels: AdminFinanceLabels;
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly onPageChange: (page: number) => void;
}

/** Desktop (≥md) transaction ledger table card — the hand-rolled MUI table. */
export function WalletLedgerTableCard({
  transactions,
  loading,
  locale,
  labels,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: Readonly<WalletLedgerTableCardProps>): ReactNode {
  return (
    <Card sx={directoryTableCardSx()}>
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
          {" "}
          {loading && transactions.length === 0
            ? WalletLedgerSkeletonKeys.map(rowKey => (
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
                <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {labels.inspectorEmpty}
                  </Typography>
                </Stack>
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
                <TonalChip tone={ledgerTypeTone(tx.type)} label={ledgerTypeLabel(tx.type, labels)} />
              </TableCell>
              <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                <TonalChip tone={ledgerStatusTone(tx.status)} label={ledgerStatusLabel(tx.status, labels)} />
              </TableCell>
              <TableCell
                sx={theme => ({
                  borderBottom: `1px solid ${theme.palette.border.light}`,
                  fontVariantNumeric: "tabular-nums",
                })}
              >
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
      <Stack
        direction="row"
        sx={theme => ({
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 2,
          flexWrap: "wrap",
          py: 2,
          px: 2.5,
          borderTop: `1px solid ${theme.palette.border.light}`,
        })}
      >
        <AdminFinancePaginationBar
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
        />
      </Stack>
    </Card>
  );
}
