/**
 * Billing-domain services barrel — re-exports the wallet service,
 * the plan-catalog service, the subscription purchase service, the
 * subscription activation service, and the payment-gateway port runtime.
 *
 * Per `backend/services/AGENTS.md`: domain-driven architecture, one
 * namespace per service; the barrel is the only import path for consumers.
 */
export * from "./payment-gateway";
export * from "./plan-catalog.service";
export * from "./subscription-activation.service";
export * from "./subscription-purchase.service";
export * from "./wallet.service";
