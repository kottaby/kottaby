/**
 * walletLedgerDisplay — the ledger entry type/status → tonal-lane +
 * localized-label mappings of the admin wallet inspector's transaction
 * ledger (`/admin/finances`, wallet tab): mapped lookups over the
 * canonical `TransactionType` / `TransactionStatus` wire values; unknown
 * wire values render VERBATIM (honest fallback — the ledger is a display
 * projection, never a lifecycle authority).
 */

import type { DirectoryTone } from "@/frontend/views/admin/users/utils";
import type { AdminFinanceLabels } from "@/shared/locale/types/adminFinance";

/** Ledger entry type → tonal lane (withdrawal = warning, bonus = success, earning = primary). */
export function ledgerTypeTone(type: string): DirectoryTone {
  switch (type) {
    case "withdrawal":
      return "warning";
    case "bonus":
      return "success";
    default:
      return "primary";
  }
}

/**
 * Localized ledger entry-type label — mapped lookup over the canonical
 * `TransactionType` wire values; any unknown wire value renders VERBATIM.
 */
export function ledgerTypeLabel(type: string, labels: AdminFinanceLabels): string {
  switch (type) {
    case "earning":
      return labels.typeEarning;
    case "bonus":
      return labels.typeBonus;
    case "withdrawal":
      return labels.typeWithdrawal;
    default:
      return type;
  }
}

/** Ledger entry status → tonal lane (pending = warning, completed = success, failed = error). */
export function ledgerStatusTone(status: string): DirectoryTone {
  switch (status) {
    case "pending":
      return "warning";
    case "completed":
      return "success";
    default:
      return "error";
  }
}

/**
 * Localized ledger entry-status label — mapped lookup over the canonical
 * `TransactionStatus` wire values; any unknown wire value renders VERBATIM.
 */
export function ledgerStatusLabel(status: string, labels: AdminFinanceLabels): string {
  switch (status) {
    case "pending":
      return labels.statusPending;
    case "completed":
      return labels.statusCompleted;
    case "failed":
      return labels.statusFailed;
    default:
      return status;
  }
}
