/**
 * Billing-domain services barrel — re-exports the wallet service.
 *
 * Per `backend/services/AGENTS.md`: domain-driven architecture, one
 * namespace per service; the barrel is the only import path for consumers.
 */
export * from "./wallet.service";
