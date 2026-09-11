import type { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";

/**
 * Provider-agnostic request to open a gateway checkout session.
 *
 * Everything an adapter needs to start a payment: the purchaser (for
 * provider-side customer metadata), the purchasable plan identity, and
 * the amount/currency copied verbatim from the freshly-read plan row.
 * Money is carried as decimal strings — never numbers — so no adapter
 * can re-derive or round a price.
 */
export interface PaymentCheckoutInput {
  readonly studentId: number;
  readonly planId: number;
  readonly amount: string;
  readonly currency: string;
}

/**
 * Checkout descriptor returned by a gateway adapter and surfaced to the
 * purchaser once the pending subscription/payment pair is committed.
 * `checkoutUrl` is nullable: hosted-checkout providers return a redirect
 * URL, while server-side providers (the built-in mock among them)
 * legitimately have none.
 */
export interface PaymentCheckoutSession {
  readonly provider: PaymentGateway;
  readonly providerReference: string;
  readonly checkoutUrl: string | null;
}

/**
 * Normalized gateway webhook outcome, produced by an adapter's webhook
 * parser after transport-level verification (signature, size cap) and
 * handed to the activation service as an already-verified event.
 * `reference` correlates the event with the subscription's stored gateway
 * reference; `amount`/`currency` are the settlement values as decimal
 * strings, compared against the stored payment row — a mismatch
 * quarantines the event and mutates nothing.
 */
export interface PaymentWebhookEvent {
  readonly reference: string;
  readonly outcome: "confirmed" | "failed";
  readonly amount: string;
  readonly currency: string;
}

/**
 * Payment gateway port — the provider-agnostic seam between the billing
 * domain and any gateway implementation. Domain services depend only on
 * this interface, never on a concrete adapter, so swapping the mock for a
 * real provider is a factory configuration change with zero domain-code
 * impact.
 */
export interface PaymentGatewayPort {
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutSession>;
  parseWebhookEvent(rawBody: string): PaymentWebhookEvent;
}
