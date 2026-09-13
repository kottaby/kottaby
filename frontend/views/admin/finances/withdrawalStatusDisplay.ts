/**
 * withdrawalStatusDisplay — the withdrawal / ledger status → tonal-lane +
 * localized-label mappings shared by the admin finance display projections
 * (`/admin/finances`): mapped lookups over the canonical `TransactionStatus`
 * wire values; any unknown wire value renders VERBATIM (honest fallback —
 * these are display projections, never lifecycle authorities).
 */

import type { DirectoryTone } from "@/frontend/views/admin/users/utils";
import type { AdminFinanceLabels } from "@/shared/locale/types/adminFinance";

/** Settlement / ledger status → tonal lane (pending = warning; settled = terminal). */
export function withdrawalStatusTone(status: string): DirectoryTone {
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
 * Localized withdrawal-status label — mapped lookup over the canonical
 * `TransactionStatus` wire values; any unknown wire value renders VERBATIM.
 */
export function withdrawalStatusLabel(status: string, labels: AdminFinanceLabels): string {
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
