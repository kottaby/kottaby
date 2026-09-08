/**
 * Payment-gateway factory + mock adapter suite — pure unit tier (NO DB, NO
 * server boot), run via the mandated runner:
 * `bun run test/scripts/run-test.ts backend/services/billing/payment-gateway/payment-gateway.factory.test.ts`
 *
 * Covered contract:
 *  - Provider resolution: missing/empty `PAYMENT_GATEWAY_PROVIDER` defaults
 *    to the mock provider, an explicit value (case/whitespace tolerant)
 *    resolves through the same seam, and the resolved adapter is a lazy
 *    singleton (one instance per configuration epoch).
 *  - Fail-closed configuration: an unknown provider raises the typed
 *    `PAYMENT_GATEWAY_UNSUPPORTED` validation error with the localized
 *    message of the requested locale — never a silent fallback provider.
 *    Inherited `Object.prototype` names (`constructor`, `toString`, …) are
 *    pinned to the same typed rejection (no unguarded registry lookup).
 *  - Reset completeness: `resetPaymentGateway()` drops the resolved adapter
 *    AND the shared env snapshot, so an env change is observable on the
 *    next resolution; before a reset the singleton keeps serving (documented
 *    swap semantics).
 *  - Mock adapter determinism: every checkout mints a fresh `mock_<uuid>`
 *    reference with no checkout URL and never throws; the webhook parser
 *    accepts only the exact callback envelope and rejects malformed input
 *    with the masked-route validation error, echoing nothing from the raw
 *    payload.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { DomainError, ValidationError } from "@/backend/lib/errors";
import { MockPaymentGatewayAdapter } from "@/backend/services/billing/payment-gateway/mock-payment-gateway.adapter";
import {
  getPaymentGateway,
  resetPaymentGateway,
} from "@/backend/services/billing/payment-gateway/payment-gateway.factory";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Env-manipulation fixture (restored after every case) ───────────────────

/** Every gateway env key the factory subsystem resolves. */
const GATEWAY_ENV_KEYS = ["PAYMENT_GATEWAY_PROVIDER", "PAYMENT_WEBHOOK_SECRET", "PAYMENT_WEBHOOK_ENABLED"] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of GATEWAY_ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

function clearGatewayEnv(): void {
  for (const key of GATEWAY_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreGatewayEnv(): void {
  for (const key of GATEWAY_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetPaymentGateway();
}

beforeEach(() => {
  clearGatewayEnv();
  resetPaymentGateway();
});

afterEach(restoreGatewayEnv);

// ─── Sync error-capture helper (assertion-free) ─────────────────────────────

/** Runs a sync thunk, returning the thrown value (or null when nothing threw). */
function catchSync(fn: () => unknown): unknown {
  let caught: unknown = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  return caught;
}

/** Narrows a caught rejection into its DomainError code + message (or null). */
function domainRejection(error: unknown): { code: string; message: string } | null {
  if (!(error instanceof DomainError)) {
    return null;
  }
  return { code: error.code, message: error.message };
}

// ─── Provider resolution ─────────────────────────────────────────────────────

describe("getPaymentGateway provider resolution", () => {
  test("a missing PAYMENT_GATEWAY_PROVIDER defaults to the mock provider", () => {
    expect(getPaymentGateway()).toBeInstanceOf(MockPaymentGatewayAdapter);
  });

  test("an explicit mock provider resolves the mock adapter", () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "mock";
    resetPaymentGateway();
    expect(getPaymentGateway()).toBeInstanceOf(MockPaymentGatewayAdapter);
  });

  test("the provider value is trimmed and case-insensitive", () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "  MOCK  ";
    resetPaymentGateway();
    expect(getPaymentGateway()).toBeInstanceOf(MockPaymentGatewayAdapter);
  });

  test("an empty or whitespace-only provider falls back to mock, never fails", () => {
    for (const value of ["", "   "]) {
      process.env.PAYMENT_GATEWAY_PROVIDER = value;
      resetPaymentGateway();
      expect(getPaymentGateway()).toBeInstanceOf(MockPaymentGatewayAdapter);
    }
  });

  test("an unknown provider fails closed with the typed unsupported error", () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "paymob";
    resetPaymentGateway();

    const caught = catchSync(() => getPaymentGateway());
    expect(caught).toBeInstanceOf(DomainError);
    expect(caught).toBeInstanceOf(ValidationError);
    const rejection = domainRejection(caught);
    expect(rejection).not.toBeNull();
    expect(rejection?.code).toBe("PAYMENT_GATEWAY_UNSUPPORTED");
    expect(rejection?.message).toBe(getServerTranslations("en").errorsTranslations.validation);
    expect(rejection?.message).not.toContain("paymob");
  });

  test("the fail-closed message follows the requested locale", () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "paymob";
    resetPaymentGateway();

    const caught = catchSync(() => getPaymentGateway("ar"));
    expect(caught).toBeInstanceOf(DomainError);
    const rejection = domainRejection(caught);
    expect(rejection?.message).toBe(getServerTranslations("ar").errorsTranslations.validation);
  });

  test("inherited Object.prototype provider names fail closed — never resolve a registry member", () => {
    // The registry is a plain object literal, so prototype members like
    // `constructor`/`toString` would resolve truthy on an unguarded lookup
    // and get cached as the "gateway" (live-probed). The own-property guard
    // must send them down the typed unsupported-provider path instead.
    for (const provider of ["constructor", "toString"]) {
      process.env.PAYMENT_GATEWAY_PROVIDER = provider;
      resetPaymentGateway();

      const caught = catchSync(() => getPaymentGateway());
      expect(caught).toBeInstanceOf(DomainError);
      expect(caught).toBeInstanceOf(ValidationError);
      const rejection = domainRejection(caught);
      expect(rejection).not.toBeNull();
      expect(rejection?.code).toBe("PAYMENT_GATEWAY_UNSUPPORTED");
      expect(rejection?.message).toBe(getServerTranslations("en").errorsTranslations.validation);
    }
  });
});

// ─── Singleton semantics + reset completeness ───────────────────────────────

describe("getPaymentGateway singleton + resetPaymentGateway completeness", () => {
  test("repeated resolutions reuse ONE adapter instance", () => {
    const first = getPaymentGateway();
    const second = getPaymentGateway();
    expect(first).toBe(second);
  });

  test("the singleton keeps serving across an env change until reset", () => {
    const cached = getPaymentGateway();
    process.env.PAYMENT_GATEWAY_PROVIDER = "paymob";
    expect(getPaymentGateway()).toBe(cached);
  });

  test("after reset an env change is picked up and a NEW instance is built", () => {
    const stale = getPaymentGateway();
    expect(stale).toBeInstanceOf(MockPaymentGatewayAdapter);

    // Provider swap to an unsupported value: reset must surface the change.
    process.env.PAYMENT_GATEWAY_PROVIDER = "paymob";
    resetPaymentGateway();
    expect(catchSync(() => getPaymentGateway())).toBeInstanceOf(DomainError);

    // Swap back: reset must rebuild the mock adapter as a fresh instance.
    process.env.PAYMENT_GATEWAY_PROVIDER = "mock";
    resetPaymentGateway();
    const rebuilt = getPaymentGateway();
    expect(rebuilt).toBeInstanceOf(MockPaymentGatewayAdapter);
    expect(rebuilt).not.toBe(stale);
  });

  test("reset re-reads the env SNAPSHOT, not only the adapter slot", () => {
    // Build a cached snapshot while the provider reads "mock"…
    process.env.PAYMENT_GATEWAY_PROVIDER = "mock";
    resetPaymentGateway();
    expect(getPaymentGateway()).toBeInstanceOf(MockPaymentGatewayAdapter);

    // …then flip the raw env WITHOUT any explicit env-cache reset: the
    // factory's own reset must invalidate the snapshot too, or the stale
    // snapshot would keep resolving the mock adapter.
    process.env.PAYMENT_GATEWAY_PROVIDER = "paymob";
    resetPaymentGateway();
    expect(catchSync(() => getPaymentGateway())).toBeInstanceOf(DomainError);
  });
});

// ─── Mock adapter: checkout determinism ─────────────────────────────────────

describe("MockPaymentGatewayAdapter.createCheckout determinism", () => {
  const adapter = new MockPaymentGatewayAdapter();

  test("each checkout mints a fresh mock_<uuid> reference with no checkout URL", async () => {
    const first = await adapter.createCheckout({ studentId: 7, planId: 3, amount: "150.00", currency: "EGP" });
    const second = await adapter.createCheckout({ studentId: 7, planId: 3, amount: "150.00", currency: "EGP" });

    expect(first.provider).toBe(PaymentGateway.Mock);
    expect(second.provider).toBe(PaymentGateway.Mock);
    expect(first.checkoutUrl).toBeNull();
    expect(second.checkoutUrl).toBeNull();

    for (const session of [first, second]) {
      expect(session.providerReference).toMatch(/^mock_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    }
    expect(first.providerReference).not.toBe(second.providerReference);
  });

  test("checkout never throws — any well-formed input resolves", async () => {
    const inputs = [
      { studentId: 1, planId: 1, amount: "0.00", currency: "EGP" },
      { studentId: Number.MAX_SAFE_INTEGER, planId: 999_999, amount: "99999999.99", currency: "USD" },
      { studentId: 42, planId: 5, amount: "", currency: "" },
    ];
    const sessions = await Promise.all(inputs.map(input => adapter.createCheckout(input)));
    for (const session of sessions) {
      expect(session.providerReference.startsWith("mock_")).toBe(true);
      expect(session.checkoutUrl).toBeNull();
    }
  });
});

// ─── Mock adapter: webhook envelope parsing ─────────────────────────────────

describe("MockPaymentGatewayAdapter.parseWebhookEvent envelope", () => {
  const adapter = new MockPaymentGatewayAdapter();
  const malformedCode = "PAYMENT_WEBHOOK_MALFORMED";
  const localizedMessage = getServerTranslations("en").errorsTranslations.validation;

  /** Parses a body, returning the thrown value (or null when parsing succeeded). */
  function parseError(rawBody: string): unknown {
    return catchSync(() => adapter.parseWebhookEvent(rawBody));
  }

  function expectMalformed(rawBody: string): void {
    const rejection = domainRejection(parseError(rawBody));
    expect(rejection).not.toBeNull();
    expect(rejection?.code).toBe(malformedCode);
    expect(rejection?.message).toBe(localizedMessage);
  }

  test("a confirmed callback parses into the verified-event contract", () => {
    const event = adapter.parseWebhookEvent(
      JSON.stringify({ reference: "mock_abc", outcome: "confirmed", amount: "150.00", currency: "EGP" })
    );
    expect(event).toEqual({ reference: "mock_abc", outcome: "confirmed", amount: "150.00", currency: "EGP" });
  });

  test("a failed callback parses with the failed outcome", () => {
    const event = adapter.parseWebhookEvent(
      JSON.stringify({ reference: "mock_abc", outcome: "failed", amount: "150.00", currency: "EGP" })
    );
    expect(event.outcome).toBe("failed");
  });

  test("extra payload members are dropped — only the four contract fields survive", () => {
    const event = adapter.parseWebhookEvent(
      JSON.stringify({
        reference: "mock_abc",
        outcome: "confirmed",
        amount: "150.00",
        currency: "EGP",
        injectedField: "attacker-controlled",
      })
    );
    expect(Object.keys(event).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "amount",
      "currency",
      "outcome",
      "reference",
    ]);
  });

  test("malformed JSON is rejected as a masked-route validation error", () => {
    expectMalformed("{not json");
    expectMalformed("");
    expectMalformed("   ");
  });

  test("non-object roots are rejected", () => {
    expectMalformed("null");
    expectMalformed("42");
    expectMalformed('"a string"');
    expectMalformed("true");
    expectMalformed('[{"reference":"mock_abc"}]');
  });

  test("missing, empty, or ill-typed contract members are rejected", () => {
    expectMalformed(JSON.stringify({ outcome: "confirmed", amount: "150.00", currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "", outcome: "confirmed", amount: "150.00", currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: "confirmed", amount: "", currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: "confirmed", amount: 150, currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: "confirmed", amount: "150.00" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: "confirmed", amount: "150.00", currency: 818 }));
  });

  test("unknown or ill-typed outcomes are rejected — never coerced", () => {
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: "pending", amount: "150.00", currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: "", amount: "150.00", currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: "CONFIRMED", amount: "150.00", currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: 1, amount: "150.00", currency: "EGP" }));
    expectMalformed(JSON.stringify({ reference: "mock_abc", outcome: null, amount: "150.00", currency: "EGP" }));
  });
});
