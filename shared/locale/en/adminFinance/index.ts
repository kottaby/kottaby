import type { AdminFinanceLabels } from "@/shared/locale/types/adminFinance";

export const adminFinanceEn: AdminFinanceLabels = {
  metaTitle: "Admin Finances — Kottaby Academy",
  metaDescription:
    "Financial auditing console for Kottaby Academy — payment records, the withdrawal payout queue, and teacher wallet inspection.",
  title: "Admin Finances",
  subtitle: "Audit payments, settle withdrawal requests, and inspect teacher wallets.",
  paymentsTab: "Payments",
  withdrawalsTab: "Withdrawals",
  walletInspectorTab: "Wallet Inspector",
  studentSearchLabel: "Student search",
  statusFilterLabel: "Status",
  gatewayFilterLabel: "Gateway",
  dateFromLabel: "From",
  dateToLabel: "To",
  applyFilters: "Apply",
  resetFilters: "Reset",
  studentHeader: "Student",
  amountHeader: "Amount",
  currencyHeader: "Currency",
  gatewayHeader: "Gateway",
  statusHeader: "Status",
  dateHeader: "Date",
  paymentsResultCount: count => {
    if (count === 0) return "No payments";
    if (count === 1) return "1 payment";
    return `${count} payments`;
  },
  teacherHeader: "Teacher",
  walletBalanceHeader: "Wallet balance",
  requestedAtHeader: "Requested at",
  pendingWithdrawalsCount: count => {
    if (count === 0) return "No pending withdrawals";
    if (count === 1) return "1 pending withdrawal";
    return `${count} pending withdrawals`;
  },
  approveAction: "Approve",
  rejectAction: "Reject",
  rejectDialogTitle: "Reject withdrawal request",
  rejectReasonLabel: "Rejection reason",
  rejectReasonPlaceholder: "Explain why this withdrawal is being rejected",
  rejectConfirm: "Reject request",
  rejectCancel: "Cancel",
  teacherPickerLabel: "Teacher",
  teacherPickerPlaceholder: "Select a teacher to inspect",
  balanceLabel: "Balance",
  totalEarningsLabel: "Total earnings",
  typeHeader: "Type",
  descriptionHeader: "Description",
  adjustDialogTitle: "Adjust wallet balance",
  directionCredit: "Credit",
  directionDebit: "Debit",
  adjustAmountLabel: "Amount",
  adjustReasonLabel: "Reason",
  adjustSubmit: "Apply adjustment",
  loadingLabel: "Loading…",
  errorTitle: "Couldn't load the finances console",
  forbiddenTitle: "Access denied",
  forbiddenBody: "You don't have permission to view the financial auditing console.",
  paymentsEmpty: "No payments match the current filters.",
  withdrawalsEmpty: "No withdrawal requests are pending.",
  inspectorEmpty: "No wallet transactions to display.",
};
