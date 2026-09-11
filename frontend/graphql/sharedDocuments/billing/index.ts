/**
 * Billing-domain shared GraphQL documents barrel.
 *
 * Re-exports the plan-catalog documents (PR #28) and the teacher
 * wallet documents: the self-wallet read (`myWallet`) and the
 * payout write (`requestWithdrawal`).
 */
export * from "./plan-catalog.documents";
export * from "./wallet.documents";
