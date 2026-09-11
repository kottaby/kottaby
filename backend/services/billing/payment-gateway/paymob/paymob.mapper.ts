/**
 * Paymob intention/callback mappers — pure functions over explicitly passed
 * arguments: no environment reads, no I/O, no logging, no module state. The
 * adapter resolves the configuration and callback URLs itself and passes
 * them in, so these functions stay deterministic and directly testable.
 *
 * Money crosses this boundary as integer minor units: the provider's
 * intention API carries amounts in cents (`amount`, `items[].amount`, and
 * the sum of item amounts must equal the total), so the decimal string the
 * domain uses is converted here under a strict shape guard — a non-negative
 * decimal with at most two fraction digits whose cent value stays within
 * the safe integer range. The checkout line item is built from the same
 * conversion, so the sum rule holds by construction.
 *
 * The provider requires the billing block's first/last name and email and
 * rejects deliveries without a phone number, while the domain carries only
 * the server-derived purchaser identity (phone nullable). Unknown or empty
 * members are therefore filled with the integration's `"NA"` placeholder
 * convention, and the address members the domain does not carry at all are
 * placeholder-filled outright — no contact or address data is fabricated.
 *
 * The hosted-checkout URL is assembled from the configured checkout prefix
 * plus exactly the two documented query parameters (`publicKey`,
 * `clientSecret`) — the prefix is a full host(+path) value owned by the
 * configuration, so no path is appended here.
 */

import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { DomainError, ValidationError } from "@/backend/lib/errors";
import type {
  PaymentCheckoutInput,
  PaymentCheckoutSession,
  PaymentWebhookEvent,
  PaymobBillingData,
  PaymobIntentionRequest,
  PaymobIntentionResponse,
  PaymobProcessedCallbackBody,
  PaymobResolvedConfig,
} from "@/backend/types";

/** Placeholder the integration fills unknown billing members with. */
const BILLING_PLACEHOLDER = "NA";

/** Matches a non-negative decimal string with at most two fraction digits. */
const DECIMAL_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Converts a decimal money string into integer cents. Fraction digits
 * beyond two, non-numeric shapes, signs, and values whose cent amount
 * exceeds the safe integer range are rejected before any network call.
 */
function convertAmountToCents(amount: string): number {
  if (!DECIMAL_AMOUNT_PATTERN.test(amount)) {
    throw new ValidationError("Plan price must be a non-negative decimal amount with at most two fraction digits.");
  }
  const [wholePart, fractionPart = ""] = amount.split(".");
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new ValidationError("Plan price exceeds the supported amount range.");
  }
  return cents;
}

/**
 * Trims one server-derived billing member and falls back to the `"NA"`
 * placeholder when nothing usable is on record (absent, empty, or
 * whitespace-only).
 */
function billingValueOrPlaceholder(value: string | null): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return BILLING_PLACEHOLDER;
  }
  return trimmed;
}

/**
 * Builds the provider's billing block from the server-derived purchaser
 * identity. Name/email/phone come from the record; every address member is
 * the placeholder because the domain carries no address data.
 */
function buildBillingData(billing: PaymentCheckoutInput["billing"]): PaymobBillingData {
  return {
    first_name: billingValueOrPlaceholder(billing.firstName),
    last_name: billingValueOrPlaceholder(billing.lastName),
    email: billingValueOrPlaceholder(billing.email),
    phone_number: billingValueOrPlaceholder(billing.phone),
    apartment: BILLING_PLACEHOLDER,
    street: BILLING_PLACEHOLDER,
    building: BILLING_PLACEHOLDER,
    city: BILLING_PLACEHOLDER,
    country: BILLING_PLACEHOLDER,
    floor: BILLING_PLACEHOLDER,
    state: BILLING_PLACEHOLDER,
  };
}

/**
 * Builds the payment-method list: the card integration is always offered;
 * the wallet integration joins it only when configured (a wallet
 * deployment is an operator choice, not a requirement).
 */
function buildPaymentMethods(config: PaymobResolvedConfig): number[] {
  const methods = [config.integrationIdCard];
  if (config.integrationIdWallet !== null) {
    methods.push(config.integrationIdWallet);
  }
  return methods;
}

/**
 * Builds the `POST v1/intention/` request body for one plan purchase: the
 * total and its single line item share one cents conversion, the
 * configured integration IDs ride as integers, the correlation key is sent
 * verbatim as `special_reference`, and the callback URLs are the ones the
 * caller resolved.
 */
export function buildIntentionRequest(args: {
  input: PaymentCheckoutInput;
  itemName: string;
  config: PaymobResolvedConfig;
  notificationUrl: string;
  redirectionUrl: string;
}): PaymobIntentionRequest {
  const amountCents = convertAmountToCents(args.input.amount);
  return {
    amount: amountCents,
    currency: args.input.currency,
    payment_methods: buildPaymentMethods(args.config),
    items: [{ name: args.itemName, amount: amountCents, quantity: 1 }],
    billing_data: buildBillingData(args.input.billing),
    special_reference: args.input.specialReference,
    notification_url: args.notificationUrl,
    redirection_url: args.redirectionUrl,
  };
}

/**
 * Validates the intention response and builds the checkout descriptor. The
 * response crosses the network boundary, so its identity members are
 * trusted only when present: a response lacking the intention id or the
 * hosted-checkout secret is a provider failure surfaced as a domain error
 * (the adapter logs the sanitized upstream status; the upstream body is
 * never rethrown). The descriptor's reference is the correlation key the
 * adapter sent as `special_reference` — NOT the intention id — because
 * fulfillment resolves purchases by that echoed reference alone.
 */
export function toCheckoutDescriptor(
  response: PaymobIntentionResponse,
  config: PaymobResolvedConfig,
  specialReference: string
): PaymentCheckoutSession {
  if (
    typeof response.id !== "string" ||
    response.id.length === 0 ||
    typeof response.client_secret !== "string" ||
    response.client_secret.length === 0
  ) {
    throw new DomainError("SERVICE_UNAVAILABLE", "Payment provider returned an incomplete checkout session.");
  }
  return {
    provider: PaymentGateway.Paymob,
    providerReference: specialReference,
    checkoutUrl: `${config.checkoutBaseUrl}?publicKey=${config.publicKey}&clientSecret=${response.client_secret}`,
  };
}

/**
 * Normalizes a verified processed-callback transaction object into the
 * domain webhook event. The correlation reference is the echo of the
 * intention's `special_reference` (`order.merchant_order_id`); a callback
 * without it cannot be resolved to a purchase and maps to an empty
 * reference, which fulfillment treats as an unknown payment. Only a
 * terminal successful transaction confirms — a success still flagged as
 * pending has not moved money. The provider's cents amount becomes a
 * two-fraction-digit decimal string, and the transaction id is carried as
 * its string form.
 */
export function mapCallbackToEvent(obj: PaymobProcessedCallbackBody["obj"]): PaymentWebhookEvent {
  return {
    reference: obj.order.merchant_order_id ?? "",
    outcome: obj.success && !obj.pending ? "confirmed" : "failed",
    amount: (obj.amount_cents / 100).toFixed(2),
    currency: obj.currency,
    providerTransactionId: String(obj.id),
  };
}
