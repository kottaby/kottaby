/**
 * Billing-domain shared GraphQL documents barrel.
 *
 * Re-exports the plan-catalog documents (PR #28), the teacher wallet
 * documents (the self-wallet read `myWallet` and the payout write
 * `requestWithdrawal`), and the student subscription-purchase documents
 * (the purchase write `purchaseSubscription` and the caller's own list
 * read `mySubscriptions`).
 */
export * from "./plan-catalog.documents";
export * from "./subscription-purchase.documents";
export * from "./wallet.documents";
