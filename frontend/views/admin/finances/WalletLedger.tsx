"use client";

/**
 * WalletLedger — the picked teacher's ledger section of the admin wallet
 * inspector (`/admin/finances`, wallet tab): the balance / total-earnings
 * summary cards over the transaction table, extracted from the panel as a
 * focused sibling component.
 *
 * Honest wallet state: the null-pair `balance`/`totalEarning` means the
 * teacher has no wallet row yet — the summary cards render the namespace's
 * empty copy (never fake zeros), and a null balance alone (without the
 * totalEarning pair) renders the empty copy too.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors.
 */

import type { ReactNode } from "react";
import type { AdminTeacherWalletQuery_adminTeacherWallet } from "@/frontend/graphql/generated/gql/graphql";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { WalletSummaryCards } from "@/frontend/views/admin/finances/WalletSummaryCards";
import { WalletTransactionsTable } from "@/frontend/views/admin/finances/WalletTransactionsTable";
import { useAppLocale, useAppTranslation } from "@/shared/locale";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";

/** The ledger section: summary cards + the picked teacher's transactions. */
export function WalletLedger({
  wallet,
  loading,
  page,
  pageSize,
  onPageChange,
}: Readonly<{
  /** The picked teacher's wallet envelope — `null` while unresolved. */
  wallet: AdminTeacherWalletQuery_adminTeacherWallet | null;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  const locale = useAppLocale();

  // Honest wallet state: the null-pair balance/totalEarning means the
  // teacher has no wallet row yet — the summary cards render the empty
  // copy (never fake zeros). The nullable balances guard BEFORE the
  // display helper — a null balance alone (without the totalEarning pair)
  // renders the empty copy too (the honest no-wallet posture, never a
  // fabricated value).
  const noWallet = wallet !== null && wallet.balance === null && wallet.totalEarning === null;
  const balanceDisplay =
    wallet === null || noWallet || wallet.balance === null ? t.inspectorEmpty : formatMoneyAmount(wallet.balance);
  const totalEarningsDisplay =
    wallet === null || noWallet || wallet.totalEarning === null
      ? t.inspectorEmpty
      : formatMoneyAmount(wallet.totalEarning);

  return (
    <>
      {/* Summary cards — balance / total earnings, the honest pair. */}
      <WalletSummaryCards balanceDisplay={balanceDisplay} totalEarningsDisplay={totalEarningsDisplay} />
      <WalletTransactionsTable
        transactions={wallet?.transactions ?? []}
        loading={loading}
        locale={locale}
        labels={t}
        page={page}
        pageSize={pageSize}
        totalCount={wallet?.totalCount ?? 0}
        onPageChange={onPageChange}
      />
    </>
  );
}
