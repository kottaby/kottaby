/**
 * Billing-domain shared GraphQL documents barrel.
 *
 * Re-exports the plan-catalog documents (PR #28), the teacher
 * wallet documents: the self-wallet read (`myWallet`) and the
 * payout write (`requestWithdrawal`), and the verification-plan
 * purchase documents: the zero-argument applicant purchase write
 * (`purchaseVerificationPlan`).
 */
export * from "./plan-catalog.documents";
export * from "./verification-purchase.documents";
export * from "./wallet.documents";
