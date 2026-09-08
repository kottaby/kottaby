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
 *  - **Bounded body, read ONCE, bounded TWICE** — the raw body is consumed
 *    exactly once (the signature is computed over these bytes, so no
 *    re-serialization may occur) and capped at
 *    `MAX_PAYMENT_WEBHOOK_BODY_BYTES` UTF-8 bytes; oversize is rejected
 *    with a masked 400 envelope that never echoes the payload. The bound
 *    is enforced in two layers: a `Content-Length` header over the cap is
 *    rejected up-front (no body byte is ever buffered), and an
 *    absent/undeclared length is read INCREMENTALLY through the request
 *    stream under a running byte budget that aborts the moment the cap is
 *    crossed — a chunked over-cap delivery can never force a full-body
 *    buffer.
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
 *    Parse rejections, oversize bodies, and a request stream that rejects
 *    mid-read are masked 400-family envelopes; anything thrown is masked
 *    through the shared error machinery with one correlated log line. The
 *    locale is the deployment default ("en") — the
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
import { logger } from "@/backend/lib/logger";
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

/**
 * Body-read failure — the delivery stream itself rejected mid-read (e.g. the
 * gateway aborted the connection while the body was still streaming).
 * Masked 400-class envelope: the code names the transport failure, the
 * message stays generic, and neither the payload nor the underlying error
 * ever reaches the wire.
 */
function webhookBodyUnreadableError(): DomainError {
  return new ValidationError("PAYMENT_WEBHOOK_BODY_UNREADABLE", "Webhook payload rejected.");
}

/**
 * Reads the request body INCREMENTALLY under the byte cap — the DoS-safe
 * counterpart of a plain `request.text()`, which would buffer the whole
 * delivery before any size check could run. Raw chunks accumulate as
 * `Uint8Array`s while a running byte budget aborts the moment the cap is
 * crossed; the abort answer is `null` (indistinguishable to the caller from
 * any other oversize rejection). The aborting read also releases the
 * underlying stream (`reader.cancel()`, best-effort — a cancel rejection,
 * typically the peer already gone, must never mask the oversize denial).
 * The accumulated chunks are joined and UTF-8 decoded ONCE, after the last
 * chunk: no per-chunk string concatenation (an adversarial 1-byte-chunk
 * delivery cannot wedge O(n²) string growth into the reader), and the single
 * decode over the reassembled bytes is exactly the byte-faithful treatment
 * a buffered read applies (multibyte sequences straddling chunk boundaries
 * decode whole). A null stream is an empty body.
 *
 * The read is a sequential pull on a stateful stream reader (each chunk
 * arrives only after the previous read resolves), so it is expressed as the
 * sanctioned recursive helper — one `await` per read step, no loop.
 *
 * @returns The decoded body, or `null` when the byte budget was exceeded.
 */
async function readBoundedBody(request: NextRequest): Promise<string | null> {
  const bodyStream = request.body;
  if (bodyStream === null) {
    return "";
  }
  const reader = bodyStream.getReader();

  async function readChunk(chunks: Uint8Array[], totalBytes: number): Promise<string | null> {
    const { done, value } = await reader.read();
    if (done) {
      // The single join + decode releases any multibyte sequence a chunk
      // boundary split.
      return new TextDecoder().decode(joinChunks(chunks, totalBytes));
    }
    const newTotalBytes = totalBytes + value.byteLength;
    if (newTotalBytes > MAX_PAYMENT_WEBHOOK_BODY_BYTES) {
      // Over cap: release the stream so the rejected delivery cannot keep
      // feeding a connection nobody will read. Cancel is best-effort.
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
    return readChunk(chunks, newTotalBytes);
  }

  return readChunk([], 0);
}

/** Joins the accumulated raw chunks into ONE buffer — no per-chunk strings. */
function joinChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = resolveRequestId(request.headers);

  // Kill switch FIRST — a disabled surface is a BARE 404, indistinguishable
  // from any other unknown path (no envelope, no code — see the docblock).
  if (!isPaymentWebhookEnabled()) {
    return new Response(null, { status: ENDPOINT_GONE_STATUS });
  }

  // The raw body is read EXACTLY once — signatures are computed over these
  // bytes — and bounded BEFORE any crypto work happens: a declared
  // Content-Length over the cap is rejected up-front (no byte buffered),
  // and every other delivery is read incrementally under the byte budget.
  const declaredContentLength = request.headers.get("content-length");
  const declaredLength = declaredContentLength === null ? Number.NaN : Number.parseInt(declaredContentLength, 10);
  if (Number.isSafeInteger(declaredLength) && declaredLength > MAX_PAYMENT_WEBHOOK_BODY_BYTES) {
    return apiErrorResponse(webhookBodyTooLargeError(), { requestId, locale: ENVELOPE_LOCALE });
  }

  // The bounded read runs under its own mask: a mid-stream transport
  // failure (the gateway aborting the connection) rejects the stream read —
  // an expected 400-family rejection, never an uncaught route error. The
  // exact transport breach goes to ONE correlated log line; the envelope
  // carries only the masked denial, never the payload or the raw error.
  let rawBody: string | null;
  try {
    rawBody = await readBoundedBody(request);
  } catch {
    // The raw transport error is deliberately unread — a mid-stream abort's
    // message is untrusted peer/transport material; the correlated log line
    // below carries only the fixed diagnostic + requestId.
    logger.error("Payment webhook body read failed: request stream rejected mid-delivery", {
      code: "PAYMENT_WEBHOOK_BODY_UNREADABLE",
      entity: "payment_webhook",
      requestId,
    });
    return apiErrorResponse(webhookBodyUnreadableError(), { requestId, locale: ENVELOPE_LOCALE });
  }
  if (rawBody === null) {
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
