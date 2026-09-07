/**
 * Payment gateway callback endpoint (`POST /api/payments/webhook`).
 *
 * Server-to-server settlement surface: the active gateway provider calls
 * back after a checkout attempt to report its outcome. The route is a THIN
 * trust-boundary shell — bounding, signature verification, and masking live
 * here; every domain decision belongs to `SubscriptionActivationService`.
 *
 *  - **POST-only** — gateway callbacks arrive as POST; only POST is
 *    exported, so every other verb rides Next.js' own 405.
 *  - **Kill switch fails closed** — unless `PAYMENT_WEBHOOK_ENABLED` is
 *    exactly "true", the surface answers a BARE 404: no envelope, no code,
 *    no requestId. Any structured body would prove THIS path exists and is
 *    special — the existence oracle a disabled deployment must never leak
 *    (a truly unknown path answers no envelope either).
 *  - **Bounded body, read ONCE** — the raw body is consumed exactly once
 *    via `request.text()` (the signature is computed over these bytes, so
 *    no re-serialization may occur) and capped at
 *    `MAX_PAYMENT_WEBHOOK_BODY_BYTES` UTF-8 bytes; oversize is rejected
 *    with a masked 400 envelope that never echoes the payload.
 *  - **Signature gate** — the `x-payment-signature` header must equal the
 *    lowercase-hex HMAC-SHA256 of the raw body under
 *    `PAYMENT_WEBHOOK_SECRET`, compared by the constant-time digest idiom
 *    inside `verifyWebhookSignature`. A missing/empty secret config, a
 *    missing header, and a failed compare all collapse into the SAME masked
 *    401: a misconfigured deployment is indistinguishable from a forged
 *    callback, and the gate can never be bypassed.
 *  - **Envelope** — success `{ data: { processed, replayed? }, requestId }`;
 *    replays ack 200 like first deliveries (gateways retry on non-2xx), and
 *    verified-but-unknown references / quarantined mismatches ack
 *    `{ processed: false }` 200 — settlement integrity beats liveness.
 *    Parse rejections and oversize bodies are masked 400-family envelopes;
 *    anything thrown is masked through the shared error machinery with one
 *    correlated log line. The locale is the deployment default ("en") — the
 *    caller is the gateway, not a localized user.
 *
 * NO session context participates: authorization is the signature alone,
 * and only references/outcome enums ever reach logs — never bodies or
 * secrets.
 */

import type { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccessResponse, resolveRequestId } from "@/backend/lib/api";
import { getPaymentWebhookSecret, isPaymentWebhookEnabled } from "@/backend/lib/env";
import { DomainError, ValidationError } from "@/backend/lib/errors";
import { getPaymentGateway, verifyWebhookSignature } from "@/backend/services/billing/payment-gateway";
import { SubscriptionActivationService } from "@/backend/services/billing/subscription-activation.service";

/**
 * The ONE status the error-code taxonomy cannot express: the endpoint-shaped
 * 404 of a disabled callback surface. Deliberately a BARE response (no
 * envelope, no code, no requestId) so a disabled deployment is
 * indistinguishable from any other unknown path.
 */
const ENDPOINT_GONE_STATUS = 404;

/** Hard ceiling for a callback payload, in UTF-8 bytes (not characters). */
const MAX_PAYMENT_WEBHOOK_BODY_BYTES = 64_000;

/** Header the gateway signs its deliveries with. */
const SIGNATURE_HEADER = "x-payment-signature";

/** Locale-free server-to-server surface: envelopes resolve in the deployment default. */
const ENVELOPE_LOCALE = "en";

/** UTF-8 byte length of a string (the body cap is bytes, not characters). */
function utf8ByteLength(body: string): number {
  return new TextEncoder().encode(body).length;
}

/**
 * Signature-gate denial — classified to 401 (UNAUTHORIZED family). One
 * shared producer for every deny shape (no secret configured, missing
 * header, failed compare) so the wire never reveals which one fired.
 */
function webhookUnauthorizedError(): DomainError {
  return new DomainError("UNAUTHORIZED", "Invalid payment webhook signature.");
}

/**
 * Oversize-payload rejection — masked 400-class envelope. The code names the
 * transport limit; the message stays generic and never echoes the payload.
 */
function webhookBodyTooLargeError(): DomainError {
  return new ValidationError("PAYMENT_WEBHOOK_BODY_TOO_LARGE", "Webhook payload rejected.");
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = resolveRequestId(request.headers);

  // Kill switch FIRST — a disabled surface is a BARE 404, indistinguishable
  // from any other unknown path (no envelope, no code — see the docblock).
  if (!isPaymentWebhookEnabled()) {
    return new Response(null, { status: ENDPOINT_GONE_STATUS });
  }

  // The raw body is read EXACTLY once — signatures are computed over these
  // bytes — and bounded before any crypto work happens.
  const rawBody = await request.text();
  if (utf8ByteLength(rawBody) > MAX_PAYMENT_WEBHOOK_BODY_BYTES) {
    return apiErrorResponse(webhookBodyTooLargeError(), { requestId, locale: ENVELOPE_LOCALE });
  }

  // Signature gate — fail closed: no configured secret, no presented header,
  // and a failed digest compare all land on the same masked 401.
  const secret = getPaymentWebhookSecret();
  const presentedSignature = request.headers.get(SIGNATURE_HEADER);
  if (secret === undefined || secret.length === 0 || !verifyWebhookSignature(rawBody, presentedSignature, secret)) {
    return apiErrorResponse(webhookUnauthorizedError(), { requestId, locale: ENVELOPE_LOCALE });
  }

  // Parse through the active gateway port, then delegate settlement. The
  // service never throws for outcome content — unknown references,
  // quarantines, and replays all come back as honest acks — so only true
  // infrastructure failures reach the masked envelope below.
  try {
    const event = getPaymentGateway(ENVELOPE_LOCALE).parseWebhookEvent(rawBody);
    const result = await SubscriptionActivationService.processWebhookEvent(event, ENVELOPE_LOCALE);
    return apiSuccessResponse(
      { processed: result.processed, ...(result.replayed !== undefined && { replayed: result.replayed }) },
      { requestId }
    );
  } catch (error: unknown) {
    return apiErrorResponse(error, { requestId, locale: ENVELOPE_LOCALE });
  }
}
