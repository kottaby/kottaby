/**
 * Billing-domain services barrel — re-exports the wallet service (DEV3-013),
 * the plan-catalog service (DEV1-005 / PR #28) and the payment-gateway port
 * runtime (provider-agnostic checkout/webhook seam).
 *
 * Per `backend/services/AGENTS.md`: domain-driven architecture, one
 * namespace per service; the barrel is the only import path for consumers.
 */
export * from "./payment-gateway";
export * from "./plan-catalog.service";
export * from "./wallet.service";
