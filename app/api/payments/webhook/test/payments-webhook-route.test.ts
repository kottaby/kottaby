/**
 * Payments webhook route contract (`POST /api/payments/webhook`).
 *
 * Pure-function tier: the POST handler is invoked directly with constructed
 * `NextRequest`s — NO server boot, NO database (the activation service is
 * mocked at the module boundary; its transactional settlement semantics are
 * exhaustively pinned by
 * `backend/services/billing/subscription-activation.service.test.ts`, so the
 * route-level "zero DB writes" guarantee is structural: every rejection path
 * here asserts the service mock was NEVER invoked).
 *
 * Coverage map:
 *  - KILL SWITCH fails closed: with `PAYMENT_WEBHOOK_ENABLED` anything other
 *    than exactly "true" the surface answers the endpoint-shaped BARE 404 —
 *    no envelope, no code, no requestId — even for perfectly signed
 *    deliveries (a disabled deployment is indistinguishable from any other
 *    unknown path);
 *  - SIGNATURE GATE fails closed: enabled surface + missing secret config
 *    (unset OR whitespace-only), missing header, empty header, wrong-secret
 *    signature, or a tampered body → the SAME masked 401 `UNAUTHORIZED`
 *    envelope, service never invoked;
 *  - BODY BOUND: the 64_000-byte cap is byte-exact (a UTF-8 multibyte body
 *    under 64_000 CHARACTERS still exceeds it) — the boundary body is
 *    accepted, cap+1 is a masked 400 that never echoes the payload; a
 *    declared Content-Length over the cap is rejected UP-FRONT (before the
 *    signature gate — an unsigned over-cap delivery answers the 400, not
 *    the 401), and a chunked body with no declared length is read
 *    incrementally under the byte budget (over-cap → masked 400, service
 *    never invoked; a multi-chunk delivery — multibyte characters split
 *    across chunk boundaries included — decodes byte-faithfully and
 *    verifies end-to-end); a request stream that ERRORS mid-read (the
 *    gateway aborting the connection) is masked to the same 400-family
 *    envelope with exactly one correlated log line — never an uncaught
 *    route error; a stream that STALLS past the per-read deadline
 *    (injected short — production default 30s) has its reader CANCELLED
 *    and rides the SAME masked unreadable-body envelope; a compliant-but-
 *    endless DRIP (inter-chunk gaps inside the per-read budget, total time
 *    unbounded) is cut off by the TOTAL delivery deadline (injected short —
 *    production default 60s) the same way — the per-read bound alone cannot
 *    stop a 1-byte-per-29s-forever delivery;
 *  - ENVELOPE contract: happy path `{ data: { processed: true }, requestId }`
 *    with the parsed event + "en" locale handed to the service exactly once;
 *    replay deliveries append `replayed: true`; unknown-reference/quarantine
 *    acks stay 200 `{ processed: false }`; parse rejections are masked 400
 *    `PAYMENT_WEBHOOK_MALFORMED` with the localized generic message;
 *    service-thrown non-domain failures mask behind 500 with the identical
 *    requestId in body AND exactly one correlated log line; service-thrown
 *    domain errors pass through WITHOUT any log line;
 *  - SPOOFING probes: randomized forgeries all denied while the correctly
 *    signed twin passes;
 *  - STATIC route-source pins: POST-only export surface, the bare-404 as the
 *    single numeric status decision, zero console disclosure sites.
 *
 * Signatures in this suite are computed with an INDEPENDENT
 * `createHmac(...).digest("hex")` oracle — never via the production
 * verifier (pinned by `backend/services/billing/payment-gateway/
 * webhook-signature.helpers.test.ts`).
 *
 * Env stubbing goes through `process.env` + `resetEnvironmentCache()` (the
 * typed gateway getters read a cached snapshot — see `backend/lib/env.ts`);
 * every test restores the keys it touched.
 *
 * Runs via `bun run test/scripts/run-test.ts
 * app/api/payments/webhook/test/payments-webhook-route.test.ts`.
 */

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Value import (NOT type-only): NextRequest is CONSTRUCTED below — the
// type-only form detonates at runtime (`ReferenceError`), exactly as the
// set-locale route test documents.
import { NextRequest } from "next/server";

// Module-boundary mock: the route must exercise ONLY its own gate/envelope
// logic here; the activation service's DB semantics belong to its service
// suite. The payment-gateway port runtime is NOT mocked — the mock adapter's
// parser is deterministic, network-free, and part of the route's shell
// contract.
const processCalls: Array<{ event: unknown; locale: string }> = [];
let processResult: { processed: boolean; replayed?: boolean } = { processed: true };
let processThrowable: unknown = null;

void mock.module("@/backend/services/billing/subscription-activation.service", () => ({
  SubscriptionActivationService: {
    processWebhookEvent: async (
      event: unknown,
      locale: string
    ): Promise<{ processed: boolean; replayed?: boolean }> => {
      processCalls.push({ event, locale });
      if (processThrowable !== null) {
        throw processThrowable;
      }
      return processResult;
    },
  },
}));

// The route import MUST trail its mock.module registration (bun evaluates
// the module registry in import order; the eslint import-order exemption is
// documented inline where the lint config expects it).
import { BODY_READ_DEADLINE_MS, BODY_READ_TOTAL_DEADLINE_MS, POST } from "@/app/api/payments/webhook/route";
import { resetEnvironmentCache } from "@/backend/lib/env";
import { ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const BASE_URL = "http://localhost:3000/api/payments/webhook";
const ROUTE_SECRET = "route-test-webhook-secret";
/** Pinned route cap — the route module declares the identical literal. */
const MAX_BODY_BYTES = 64_000;
const SIGNATURE_HEADER = "x-payment-signature";

const ENV_KEYS = ["PAYMENT_GATEWAY_PROVIDER", "PAYMENT_WEBHOOK_SECRET", "PAYMENT_WEBHOOK_ENABLED"] as const;

const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  savedEnv[key] = process.env[key];
}

const tEn = getServerTranslations("en").errorsTranslations;

const CONFIRMED_EVENT_BODY = JSON.stringify({
  reference: "mock_ref_route_1",
  outcome: "confirmed",
  amount: "120.00",
  currency: "USD",
});

// ─── Env + request fixtures ───────────────────────────────────────────────

function enableSurface(): void {
  process.env.PAYMENT_WEBHOOK_ENABLED = "true";
  process.env.PAYMENT_WEBHOOK_SECRET = ROUTE_SECRET;
  resetEnvironmentCache();
}

/** Enabled kill switch with NO secret configured — the fail-closed misconfig. */
function enableSurfaceWithoutSecret(): void {
  process.env.PAYMENT_WEBHOOK_ENABLED = "true";
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  resetEnvironmentCache();
}

function setSurfaceDisabled(value: string | undefined): void {
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  if (value === undefined) {
    delete process.env.PAYMENT_WEBHOOK_ENABLED;
  } else {
    process.env.PAYMENT_WEBHOOK_ENABLED = value;
  }
  resetEnvironmentCache();
}

/** Independent signature oracle: lowercase-hex HMAC-SHA256 over the exact body. */
function sign(body: string, secret: string = ROUTE_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function webhookRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE_URL, {
    method: "POST",
    headers: { [SIGNATURE_HEADER]: sign(body), ...headers },
    body,
  });
}

function webhookRequestSignedWith(body: string, secret: string): NextRequest {
  return new NextRequest(BASE_URL, {
    method: "POST",
    headers: { [SIGNATURE_HEADER]: sign(body, secret) },
    body,
  });
}

function webhookRequestWithoutSignature(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE_URL, { method: "POST", headers, body });
}

/**
 * Builds a streamed delivery: the chunks are enqueued verbatim (byte
 * boundaries preserved, no declared Content-Length) — the transport shape
 * the incremental body reader owns.
 */
function webhookRequestFromChunks(chunks: Uint8Array[], headers: Record<string, string> = {}): NextRequest {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new NextRequest(BASE_URL, { method: "POST", headers, body: stream });
}

/** Builds a confirmed-event body padded to EXACTLY `totalBytes` ASCII bytes. */
function paddedEventBody(totalBytes: number): string {
  const prefix = '{"reference":"';
  const suffix = '","outcome":"confirmed","amount":"120.00","currency":"USD"}';
  const body = `${prefix}${"b".repeat(totalBytes - prefix.length - suffix.length)}${suffix}`;
  expect(new TextEncoder().encode(body)).toHaveLength(totalBytes);
  return body;
}

// ─── Assertion-free payload narrowing (cron/set-locale precedent) ─────────

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await response.json();
  if (!isPlainJsonObject(parsed)) {
    throw new Error(`response body was not a JSON object: status ${response.status}`);
  }
  return parsed;
}

function memberRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const candidate: unknown = parent[key];
  if (!isPlainJsonObject(candidate)) {
    throw new Error(`response member "${key}" was not a JSON object`);
  }
  return candidate;
}

function memberString(parent: Record<string, unknown>, key: string): string {
  const candidate: unknown = parent[key];
  if (typeof candidate !== "string") {
    throw new Error(`response member "${key}" was not a string`);
  }
  return candidate;
}

function ownKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record);
}

afterEach(() => {
  processCalls.length = 0;
  processResult = { processed: true };
  processThrowable = null;
  for (const key of ENV_KEYS) {
    const saved = savedEnv[key];
    if (saved === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved;
    }
  }
  resetEnvironmentCache();
});

// ─── Kill switch (disabled → bare 404) ────────────────────────────────────

describe("payments webhook route — kill switch fails closed", () => {
  test("disabled surface answers the BARE endpoint-shaped 404 even for a perfectly signed delivery", async () => {
    setSurfaceDisabled(undefined);
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(404);
    // BARE — no envelope, no code, no requestId: indistinguishable from any
    // other unknown path (the envelope's `code` would be an oracle).
    expect(await response.text()).toBe("");
    expect(processCalls).toHaveLength(0);
  });

  test.each(["false", "1", "yes", "TRUE"])("flag value %p is not the enabling literal → bare 404", async value => {
    setSurfaceDisabled(value);
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(processCalls).toHaveLength(0);
  });

  test("the enabling literal is TRIMMED: ' true' (padded) still enables the surface", async () => {
    // Documents the env parser contract at the route boundary: only the
    // trimmed exact value "true" enables; the parser — not the route — owns
    // the trim (a padded literal is NOT a second enabling shape to guard).
    setSurfaceDisabled(" true");
    process.env.PAYMENT_WEBHOOK_SECRET = ROUTE_SECRET;
    resetEnvironmentCache();
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(200);
    expect(processCalls).toHaveLength(1);
  });
});

// ─── Signature gate (fail closed) ─────────────────────────────────────────

describe("payments webhook route — signature gate fails closed", () => {
  test("enabled + missing secret config → 401 UNAUTHORIZED for a presented header", async () => {
    enableSurfaceWithoutSecret();
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(401);
    const body = await readJson(response);
    const error = memberRecord(body, "error");
    expect(error.code).toBe("UNAUTHORIZED");
    expect(ownKeys(error)).toEqual(["code", "message", "requestId"]);
    expect(processCalls).toHaveLength(0);
  });

  test("enabled + whitespace-only secret config → 401 (empty after trim counts as unset)", async () => {
    process.env.PAYMENT_WEBHOOK_ENABLED = "true";
    process.env.PAYMENT_WEBHOOK_SECRET = "   ";
    resetEnvironmentCache();
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(401);
    expect(processCalls).toHaveLength(0);
  });

  test("enabled + missing signature header → 401", async () => {
    enableSurface();
    const response = await POST(webhookRequestWithoutSignature(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(401);
    expect(processCalls).toHaveLength(0);
  });

  test("enabled + empty signature header value → 401", async () => {
    enableSurface();
    const response = await POST(webhookRequestWithoutSignature(CONFIRMED_EVENT_BODY, { [SIGNATURE_HEADER]: "" }));
    expect(response.status).toBe(401);
    expect(processCalls).toHaveLength(0);
  });

  test("forged signature (signed under an attacker secret) → masked 401, service never invoked", async () => {
    enableSurface();
    const response = await POST(webhookRequestSignedWith(CONFIRMED_EVENT_BODY, "attacker-secret"));
    expect(response.status).toBe(401);
    const body = await readJson(response);
    const error = memberRecord(body, "error");
    expect(error.code).toBe("UNAUTHORIZED");
    // Masked: the denial never reveals WHICH deny shape fired (misconfig vs
    // forgery) — the message is the shared generic.
    expect(error.message).toBe("Invalid payment webhook signature.");
    expect(processCalls).toHaveLength(0);
  });

  test("tampered body (valid signature over DIFFERENT bytes) → 401", async () => {
    enableSurface();
    const otherBody = JSON.stringify({
      reference: "mock_ref_route_1",
      outcome: "confirmed",
      amount: "0.01",
      currency: "USD",
    });
    const response = await POST(
      webhookRequestWithoutSignature(otherBody, { [SIGNATURE_HEADER]: sign(CONFIRMED_EVENT_BODY) })
    );
    expect(response.status).toBe(401);
    expect(processCalls).toHaveLength(0);
  });
});

// ─── Body bound (byte-exact cap) ──────────────────────────────────────────

describe("payments webhook route — bounded body", () => {
  test("a body of EXACTLY the cap bytes is accepted end-to-end", async () => {
    enableSurface();
    const boundaryBody = paddedEventBody(MAX_BODY_BYTES);
    const response = await POST(webhookRequest(boundaryBody));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(memberRecord(body, "data")).toEqual({ processed: true });
    expect(processCalls).toHaveLength(1);
  });

  test("cap + 1 byte → masked 400 that never echoes the payload", async () => {
    enableSurface();
    const overCapBody = paddedEventBody(MAX_BODY_BYTES + 1);
    // The requestId is PINNED: the bare-"bb" payload probe below must never
    // collide with a RANDOM generated requestId hex (an unpinned uuid can
    // legitimately contain "bb" without any payload echo — a flaky false
    // failure, not a leak).
    const response = await POST(webhookRequest(overCapBody, { "x-request-id": "corr-over-cap" }));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    const error = memberRecord(body, "error");
    expect(error.code).toBe("PAYMENT_WEBHOOK_BODY_TOO_LARGE");
    // Zero payload echo: neither the reference padding nor the raw body can
    // surface in the wire JSON.
    const wireJson = JSON.stringify(body) ?? "";
    expect(wireJson).not.toContain("bb");
    expect(wireJson).not.toContain(overCapBody.slice(0, 32));
    expect(error.requestId).toBe("corr-over-cap");
    expect(processCalls).toHaveLength(0);
  });

  test("the cap counts UTF-8 BYTES: a multibyte body under the char budget is still over-cap", async () => {
    enableSurface();
    // 40_000 × 2-byte characters = 80_000 bytes > 64_000, yet only 40_000
    // characters — the byte budget, not the character count, governs.
    const multibyteBody = "λ".repeat(40_000);
    const response = await POST(webhookRequest(multibyteBody));
    expect(response.status).toBe(400);
    expect(processCalls).toHaveLength(0);
  });

  test("a declared Content-Length over the cap is rejected UP-FRONT (before the signature gate)", async () => {
    enableSurface();
    // A tiny body with a lying-large declared length: the up-front header
    // check rejects without reading a byte. UNSIGNED on purpose — the 400
    // (not the signature gate's 401) proves the cap fired first.
    const response = await POST(
      webhookRequestWithoutSignature(CONFIRMED_EVENT_BODY, { "content-length": String(MAX_BODY_BYTES + 1) })
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    const error = memberRecord(body, "error");
    expect(error.code).toBe("PAYMENT_WEBHOOK_BODY_TOO_LARGE");
    // The masked envelope never echoes the payload.
    const wireJson = JSON.stringify(body) ?? "";
    expect(wireJson).not.toContain("mock_ref_route_1");
    expect(processCalls).toHaveLength(0);
  });

  test("a chunked over-cap body with NO declared length is rejected past the byte budget", async () => {
    enableSurface();
    // 7 × 10_000-byte chunks = 70_000 bytes > 64_000, streamed with no
    // Content-Length: the incremental reader aborts the moment the budget
    // is crossed — the full delivery is never buffered. UNSIGNED: the
    // bounded read precedes the signature gate.
    const chunk = new TextEncoder().encode("b".repeat(10_000));
    const overCapChunks: Uint8Array[] = Array.from({ length: 7 }, () => chunk);
    const response = await POST(webhookRequestFromChunks(overCapChunks));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(memberRecord(body, "error").code).toBe("PAYMENT_WEBHOOK_BODY_TOO_LARGE");
    expect(processCalls).toHaveLength(0);
  });

  test("a multi-chunk streamed body of EXACTLY the cap bytes is accepted end-to-end", async () => {
    enableSurface();
    // The same byte-exact boundary body, streamed in 9_000-byte chunks with
    // no declared length: the incremental reader reassembles and decodes it
    // byte-faithfully, so the signature over the decoded string verifies.
    const boundaryBody = paddedEventBody(MAX_BODY_BYTES);
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < boundaryBody.length; offset += 9_000) {
      chunks.push(new TextEncoder().encode(boundaryBody.slice(offset, offset + 9_000)));
    }
    const response = await POST(webhookRequestFromChunks(chunks, { [SIGNATURE_HEADER]: sign(boundaryBody) }));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(memberRecord(body, "data")).toEqual({ processed: true });
    expect(processCalls).toHaveLength(1);
  });

  test("a multibyte character SPLIT across stream chunks decodes identically to a buffered read (signature verifies)", async () => {
    enableSurface();
    // 2-byte λ and é characters straddling 2-byte chunk boundaries: the
    // streamed incremental decode (with its trailing flush) must produce
    // exactly the string the sender signed — the same treatment a plain
    // buffered read applies.
    const multibyteBody = JSON.stringify({
      reference: "λé-ref-1",
      outcome: "confirmed",
      amount: "120.00",
      currency: "USD",
    });
    const chunks: Uint8Array[] = [];
    const encoded = new TextEncoder().encode(multibyteBody);
    for (let offset = 0; offset < encoded.length; offset += 2) {
      chunks.push(encoded.slice(offset, offset + 2));
    }
    const response = await POST(webhookRequestFromChunks(chunks, { [SIGNATURE_HEADER]: sign(multibyteBody) }));
    expect(response.status).toBe(200);
    expect(processCalls).toHaveLength(1);
    const deliveredEvent: unknown = processCalls[0]?.event;
    if (!isPlainJsonObject(deliveredEvent)) {
      throw new Error("service event was not a JSON object");
    }
    expect(memberString(deliveredEvent, "reference")).toBe("λé-ref-1");
  });

  test("a request stream that ERRORS mid-read answers the masked 400-family envelope (never an uncaught route error)", async () => {
    enableSurface();
    // The delivery stream itself rejects after a first chunk — the reader's
    // mid-stream abort path (the gateway dropped the connection). The route
    // must MASK it: a 400-family envelope with zero payload/transport echo
    // and exactly ONE correlated log line — not a framework 500 with a raw
    // stack. Unsigned on purpose: the bounded read precedes the gate.
    const partialPrefix = CONFIRMED_EVENT_BODY.slice(0, 12);
    const brokenStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(partialPrefix));
        controller.error(new Error("simulated mid-stream abort (peer gone)"));
      },
    });
    const errorSpy = spyOn(logger, "error");
    const response = await POST(new NextRequest(BASE_URL, { method: "POST", headers: {}, body: brokenStream }));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    const error = memberRecord(body, "error");
    expect(error.code).toBe("PAYMENT_WEBHOOK_BODY_UNREADABLE");
    // Zero echo: neither the partial payload nor the transport error's
    // message may reach the wire.
    const wireJson = JSON.stringify(body) ?? "";
    expect(wireJson).not.toContain(partialPrefix);
    expect(wireJson).not.toContain("simulated mid-stream abort");

    // Exactly ONE correlated log line carrying a requestId — and none of the
    // transport error material.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const firstCall: unknown = errorSpy.mock.calls[0];
    if (!Array.isArray(firstCall)) {
      throw new Error("logger.error call was not captured");
    }
    const logBag: unknown = firstCall[1];
    if (!isPlainJsonObject(logBag)) {
      throw new Error("logger.error context bag was not a JSON object");
    }
    expect(typeof memberString(logBag, "requestId")).toBe("string");
    expect(JSON.stringify(logBag)).not.toContain("simulated mid-stream abort");
    expect(processCalls).toHaveLength(0);
    errorSpy.mockRestore();
  });

  test("a body stream that STALLS past the per-read deadline → reader cancelled + the same masked envelope", async () => {
    enableSurface();
    // The slow-drip shape: one chunk, then the stream NEVER closes and
    // NEVER errors — without the deadline each incremental read would hang
    // until the platform reaps the request (~300s). The deadline holder's
    // `current` is shortened for the test and restored in the finally
    // (production keeps the 30s default).
    const productionDeadline = BODY_READ_DEADLINE_MS.current;
    BODY_READ_DEADLINE_MS.current = 25;
    let cancelCalls = 0;
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(CONFIRMED_EVENT_BODY.slice(0, 10)));
      },
      cancel() {
        cancelCalls += 1;
      },
    });
    const errorSpy = spyOn(logger, "error");
    try {
      const startedAt = Date.now();
      const response = await POST(new NextRequest(BASE_URL, { method: "POST", headers: {}, body: stalledStream }));
      const elapsedMs = Date.now() - startedAt;

      // The SAME masked unreadable-body envelope the mid-read abort rides —
      // a deadline stall is never an uncaught route error and never a 500.
      expect(response.status).toBe(400);
      const body = await readJson(response);
      const error = memberRecord(body, "error");
      expect(error.code).toBe("PAYMENT_WEBHOOK_BODY_UNREADABLE");
      // Zero payload echo.
      const wireJson = JSON.stringify(body) ?? "";
      expect(wireJson).not.toContain(CONFIRMED_EVENT_BODY.slice(0, 10));
      expect(wireJson).not.toContain("mock_ref_route_1");

      // The injected deadline — not the 30s default — bounded the read.
      expect(elapsedMs).toBeLessThan(5_000);

      // Exactly ONE correlated log line carrying a requestId — and none of
      // the payload material.
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const firstCall: unknown = errorSpy.mock.calls[0];
      if (!Array.isArray(firstCall)) {
        throw new Error("logger.error call was not captured");
      }
      const logBag: unknown = firstCall[1];
      if (!isPlainJsonObject(logBag)) {
        throw new Error("logger.error context bag was not a JSON object");
      }
      expect(typeof memberString(logBag, "requestId")).toBe("string");
      expect(JSON.stringify(logBag)).not.toContain("mock_ref_route_1");

      // The reader was CANCELLED — the stalled delivery released its
      // connection instead of holding it.
      expect(cancelCalls).toBe(1);
      expect(processCalls).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
      BODY_READ_DEADLINE_MS.current = productionDeadline;
    }
  });

  test("a compliant-but-endless DRIP is cut off by the TOTAL delivery deadline → the same masked envelope", async () => {
    enableSurface();
    // The per-read deadline cannot bound TOTAL delivery time: a drip whose
    // every inter-chunk gap stays inside the per-read budget could stream
    // 1 byte per 29s forever. Both holders' `current` are shortened for the
    // test — the per-read deadline WIDENED to 200ms (the drip's 40ms gaps
    // stay compliant) and the total deadline to 60ms — and restored in the
    // finally (production keeps 30s + 60s).
    const productionReadDeadline = BODY_READ_DEADLINE_MS.current;
    const productionTotalDeadline = BODY_READ_TOTAL_DEADLINE_MS.current;
    BODY_READ_DEADLINE_MS.current = 200;
    BODY_READ_TOTAL_DEADLINE_MS.current = 60;
    let cancelCalls = 0;
    let drippedChunks = 0;
    const drippingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(CONFIRMED_EVENT_BODY.slice(0, 10)));
        drippedChunks += 1;
        // A second drip 40ms later — well inside the injected 200ms per-read
        // window — then the stream never closes and never errors.
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(CONFIRMED_EVENT_BODY.slice(10, 20)));
          drippedChunks += 1;
        }, 40);
      },
      cancel() {
        cancelCalls += 1;
      },
    });
    const errorSpy = spyOn(logger, "error");
    try {
      const startedAt = Date.now();
      const response = await POST(new NextRequest(BASE_URL, { method: "POST", headers: {}, body: drippingStream }));
      const elapsedMs = Date.now() - startedAt;

      // The SAME masked unreadable-body envelope the stall and transport
      // failure ride — a total-deadline cut-off is never a 500 or an echo.
      expect(response.status).toBe(400);
      const body = await readJson(response);
      const error = memberRecord(body, "error");
      expect(error.code).toBe("PAYMENT_WEBHOOK_BODY_UNREADABLE");
      // Zero payload echo.
      const wireJson = JSON.stringify(body) ?? "";
      expect(wireJson).not.toContain(CONFIRMED_EVENT_BODY.slice(0, 10));
      expect(wireJson).not.toContain("mock_ref_route_1");

      // The injected TOTAL deadline — not the 60s default — bounded the
      // delivery: the response arrives ~60ms in, and the drip PROGRESSED
      // (two chunks delivered, every gap inside the per-read window), so
      // the per-read deadline cannot be what fired.
      expect(elapsedMs).toBeLessThan(5_000);
      expect(drippedChunks).toBe(2);

      // Exactly ONE correlated log line carrying a requestId — and none of
      // the payload material.
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const firstCall: unknown = errorSpy.mock.calls[0];
      if (!Array.isArray(firstCall)) {
        throw new Error("logger.error call was not captured");
      }
      const logBag: unknown = firstCall[1];
      if (!isPlainJsonObject(logBag)) {
        throw new Error("logger.error context bag was not a JSON object");
      }
      expect(typeof memberString(logBag, "requestId")).toBe("string");
      expect(JSON.stringify(logBag)).not.toContain("mock_ref_route_1");

      // The reader was CANCELLED — the endless drip released its connection
      // instead of holding it forever.
      expect(cancelCalls).toBe(1);
      expect(processCalls).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
      BODY_READ_DEADLINE_MS.current = productionReadDeadline;
      BODY_READ_TOTAL_DEADLINE_MS.current = productionTotalDeadline;
    }
  });
});

// ─── Envelope contract (enabled + valid signature) ────────────────────────

describe("payments webhook route — envelope contract", () => {
  test("happy path → 200 { data: { processed: true }, requestId } with the parsed event + 'en' locale", async () => {
    enableSurface();
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY, { "x-request-id": "corr-webhook-happy" }));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(ownKeys(body)).toEqual(["data", "requestId"]);
    expect(memberRecord(body, "data")).toEqual({ processed: true });
    expect(body.requestId).toBe("corr-webhook-happy");
    expect(processCalls).toHaveLength(1);
    expect(processCalls[0]?.event).toEqual({
      reference: "mock_ref_route_1",
      outcome: "confirmed",
      amount: "120.00",
      currency: "USD",
    });
    expect(processCalls[0]?.locale).toBe("en");
  });

  test("replay delivery → 200 { data: { processed: true, replayed: true } } (gateways retry on non-2xx)", async () => {
    enableSurface();
    processResult = { processed: true, replayed: true };
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(memberRecord(body, "data")).toEqual({ processed: true, replayed: true });
    expect(processCalls).toHaveLength(1);
  });

  test("unknown reference / quarantine ack posture → 200 { data: { processed: false } }", async () => {
    enableSurface();
    processResult = { processed: false };
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(memberRecord(body, "data")).toEqual({ processed: false });
    expect(processCalls).toHaveLength(1);
  });

  test("malformed JSON body (validly signed) → masked 400 PAYMENT_WEBHOOK_MALFORMED, localized generic message", async () => {
    enableSurface();
    const malformed = '{"reference": "mock_ref_route_1",';
    const response = await POST(webhookRequest(malformed));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    const error = memberRecord(body, "error");
    expect(error.code).toBe("PAYMENT_WEBHOOK_MALFORMED");
    expect(error.message).toBe(tEn.validation);
    expect(JSON.stringify(body)).not.toContain("mock_ref_route_1");
    expect(processCalls).toHaveLength(0);
  });

  test("structurally invalid event (unknown outcome, valid JSON + signature) → masked 400, service never invoked", async () => {
    enableSurface();
    const invalidEvent = JSON.stringify({
      reference: "mock_ref_route_1",
      outcome: "pending",
      amount: "120.00",
      currency: "USD",
    });
    const response = await POST(webhookRequest(invalidEvent));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(memberRecord(body, "error").code).toBe("PAYMENT_WEBHOOK_MALFORMED");
    expect(processCalls).toHaveLength(0);
  });

  test("service-thrown non-domain failure masks behind 500 with requestId parity in body AND log", async () => {
    enableSurface();
    processThrowable = new Error("ledger unavailable (simulated driver failure)");
    const errorSpy = spyOn(logger, "error");
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY, { "x-request-id": "corr-webhook-masked" }));
    expect(response.status).toBe(500);
    const body = await readJson(response);
    const error = memberRecord(body, "error");
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.requestId).toBe("corr-webhook-masked");
    const wireJson = JSON.stringify(body) ?? "";
    expect(wireJson).not.toContain("simulated driver failure");

    // Exactly ONE correlated log line carrying the SAME requestId — and none
    // of the raw body material.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const firstCall: unknown = errorSpy.mock.calls[0];
    if (!Array.isArray(firstCall)) {
      throw new Error("logger.error call was not captured");
    }
    const logBag: unknown = firstCall[1];
    if (!isPlainJsonObject(logBag)) {
      throw new Error("logger.error context bag was not a JSON object");
    }
    expect(memberString(logBag, "requestId")).toBe("corr-webhook-masked");
    expect(JSON.stringify(logBag)).not.toContain("mock_ref_route_1");
    errorSpy.mockRestore();
  });

  test("service-thrown DOMAIN error passes through its code WITHOUT a log line (expected rejection)", async () => {
    enableSurface();
    processThrowable = new ValidationError("PLAN_LANE_UNCONFIGURED", "lane unconfigured");
    const errorSpy = spyOn(logger, "error");
    const response = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    // Custom domain codes fall back to the 400-classification row.
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(memberRecord(body, "error").code).toBe("PLAN_LANE_UNCONFIGURED");
    // Expected rejections never produce logger.error noise.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ─── Spoofing probes (randomized forgeries) ───────────────────────────────

describe("payments webhook route — spoofing probes", () => {
  test("randomized signature forgeries are ALL denied while the correctly signed twin passes", async () => {
    enableSurface();
    // Parallel forgery burst (12 randomized signatures) — every one denied.
    const forgedResponses = await Promise.all(
      Array.from({ length: 12 }, () =>
        POST(
          new NextRequest(BASE_URL, {
            method: "POST",
            headers: { [SIGNATURE_HEADER]: randomBytes(32).toString("hex") },
            body: CONFIRMED_EVENT_BODY,
          })
        )
      )
    );
    for (const forgedResponse of forgedResponses) {
      expect(forgedResponse.status).toBe(401);
    }
    expect(processCalls).toHaveLength(0);
    const twin = await POST(webhookRequest(CONFIRMED_EVENT_BODY));
    expect(twin.status).toBe(200);
    expect(processCalls).toHaveLength(1);
  });

  test("uppercase-hex re-encoding of a valid signature is DENIED (wire contract is lowercase hex)", async () => {
    enableSurface();
    const response = await POST(
      webhookRequestWithoutSignature(CONFIRMED_EVENT_BODY, {
        [SIGNATURE_HEADER]: sign(CONFIRMED_EVENT_BODY).toUpperCase(),
      })
    );
    expect(response.status).toBe(401);
    expect(processCalls).toHaveLength(0);
  });
});

// ─── Static route-source pins ─────────────────────────────────────────────

describe("payments webhook route — static route-source pins", () => {
  const ROUTE_SOURCE = readFileSync(join(process.cwd(), "app", "api", "payments", "webhook", "route.ts"), "utf8");

  test("route surface is POST-only (every other verb rides the framework 405)", () => {
    expect(ROUTE_SOURCE).toContain("export async function POST");
    expect(ROUTE_SOURCE).not.toMatch(/export\s+async\s+function\s+(GET|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/u);
  });

  test("the bare kill-switch 404 is the route's single numeric status decision", () => {
    expect(ROUTE_SOURCE).toContain("const ENDPOINT_GONE_STATUS = 404;");
    expect(ROUTE_SOURCE).not.toMatch(/status:\s*\d/u);
  });

  test("zero console disclosure sites in the route source", () => {
    expect(ROUTE_SOURCE).not.toContain("console.");
  });
});
