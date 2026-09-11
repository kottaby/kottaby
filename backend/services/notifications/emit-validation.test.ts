/**
 * `emit-validation.ts` — unit test suite for emit input validation guards.
 *
 * 4-Tier mixed suite for pure validation functions:
 *  - Tier 1 (branch/stmt): `isPositiveSafeInt` type guard behavior; valid single and
 *    batch emit inputs; fail-closed rejection on invalid title, body, type, entity
 *    refs, idempotency keys, recipient IDs, empty cohorts, and duplicate recipient IDs.
 *  - Tier 2 (boundary): exact string boundary checks (title lengths 0, 1, 255, 256;
 *    relatedEntityType lengths 0, 100, 101; idempotencyKey lengths 0, 128, 129);
 *    half-pair entity ref co-presence checks.
 *  - Tier 3 (chaos/fuzz): hostile string content (RTL override, Unicode emoji, SQL
 *    wildcards/injections); large batch recipient cohorts; unknown enum values.
 *  - Tier 4 (security/type coercion): smuggled input fields (BOPLA probe); type coercion
 *    probes (objects, booleans, BigInts, Symbols as IDs or strings); static scan
 *    verifying zero `console.*` calls in `emit-validation.ts`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { ValidationError } from "@/backend/lib/errors";
import {
  isPositiveSafeInt,
  validateEmitBatchInput,
  validateEmitInput,
} from "@/backend/services/notifications/emit-validation";
import type { NotificationEmitBatchInput, NotificationEmitInput } from "@/backend/types";

/** Error message fixture for testing error throwing. */
const TEST_ERROR_MSG = "Invalid notification emit input";

/** Helper to construct a valid single emit input. */
function makeValidSingleInput(overrides: Partial<NotificationEmitInput> = {}): NotificationEmitInput {
  return {
    userId: 101,
    type: NotificationType.SessionRequest,
    title: "Session Request Received",
    body: "You have a new session request from a student.",
    relatedEntityType: "session",
    relatedEntityId: 5001,
    idempotencyKey: "idem-single-key-01",
    ...overrides,
  };
}

/** Helper to construct a valid batch emit input. */
function makeValidBatchInput(overrides: Partial<NotificationEmitBatchInput> = {}): NotificationEmitBatchInput {
  return {
    userIds: [101, 102, 103],
    type: NotificationType.SystemBroadcast,
    title: "System Maintenance Notice",
    body: null,
    relatedEntityType: null,
    relatedEntityId: null,
    idempotencyKey: undefined,
    ...overrides,
  };
}

// ─── Tier 1: Statement & Branch Coverage ─────────────────────────────────────

describe("isPositiveSafeInt — ID-channel guard", () => {
  test("accepts positive safe integers", () => {
    const validValues = [1, 42, 9999, Number.MAX_SAFE_INTEGER];
    for (const val of validValues) {
      expect(isPositiveSafeInt(val)).toBe(true);
    }
  });

  test("rejects zero, negative numbers, floats, NaN, and Infinities", () => {
    const invalidNumbers = [0, -1, -99, 1.5, 0.0001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const val of invalidNumbers) {
      expect(isPositiveSafeInt(val)).toBe(false);
    }
  });

  test("rejects non-number primitives, objects, arrays, BigInts, and Symbols", () => {
    const nonNumbers: readonly unknown[] = [
      "1",
      "42",
      "",
      "  ",
      true,
      false,
      null,
      undefined,
      {},
      { valueOf: () => 1 },
      [],
      [1],
      10n,
      Symbol("1"),
      () => 1,
    ];
    for (const val of nonNumbers) {
      expect(isPositiveSafeInt(val)).toBe(false);
    }
  });
});

describe("validateEmitInput — happy paths and basic validation", () => {
  test("passes a fully populated valid single emit input", () => {
    const input = makeValidSingleInput();
    expect(() => validateEmitInput(input, TEST_ERROR_MSG)).not.toThrow();
  });

  test("passes a valid single emit input with null body, entity refs, and undefined idempotencyKey", () => {
    const input = makeValidSingleInput({
      body: null,
      relatedEntityType: null,
      relatedEntityId: null,
      idempotencyKey: undefined,
    });
    expect(() => validateEmitInput(input, TEST_ERROR_MSG)).not.toThrow();
  });

  test("throws ValidationError with the passed validation message on failure", () => {
    const invalidInput = makeValidSingleInput({ title: "" });
    expect(() => validateEmitInput(invalidInput, TEST_ERROR_MSG)).toThrow(ValidationError);
    try {
      validateEmitInput(invalidInput, TEST_ERROR_MSG);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      if (err instanceof ValidationError) {
        expect(err.message).toBe(TEST_ERROR_MSG);
      }
    }
  });

  test("rejects invalid recipient userId (non-positive / non-safe integer)", () => {
    const invalidUserIds = [0, -1, 1.5, Number.NaN, 2 ** 53];
    for (const userId of invalidUserIds) {
      const input = Object.assign(makeValidSingleInput(), { userId });
      expect(() => validateEmitInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
    }
  });
});

describe("validateEmitBatchInput — happy paths and cohort validation", () => {
  test("passes a valid batch emit input with multiple distinct recipient userIds", () => {
    const input = makeValidBatchInput();
    expect(() => validateEmitBatchInput(input, TEST_ERROR_MSG)).not.toThrow();
  });

  test("rejects an empty recipient userIds array", () => {
    const input = makeValidBatchInput({ userIds: [] });
    expect(() => validateEmitBatchInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
  });

  test("rejects duplicate recipient userIds in batch cohort", () => {
    const input = makeValidBatchInput({ userIds: [101, 102, 101] });
    expect(() => validateEmitBatchInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
  });

  test("rejects batch cohort containing any non-positive / non-safe integer user id", () => {
    const invalidCohorts = [
      [101, 0, 102],
      [101, -5, 102],
      [101, 3.14, 102],
      [101, Number.NaN, 102],
    ];
    for (const cohort of invalidCohorts) {
      const input = Object.assign(makeValidBatchInput(), { userIds: cohort });
      expect(() => validateEmitBatchInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
    }
  });
});

// ─── Tier 2: Boundary Conditions ─────────────────────────────────────────────

describe("emit-validation — Tier 2 boundary conditions", () => {
  describe("title bounds (1..255 chars, non-empty after trim)", () => {
    test("accepts title with length 1 and 255", () => {
      const title1 = "a";
      const title255 = "x".repeat(255);

      expect(() => validateEmitInput(makeValidSingleInput({ title: title1 }), TEST_ERROR_MSG)).not.toThrow();
      expect(() => validateEmitInput(makeValidSingleInput({ title: title255 }), TEST_ERROR_MSG)).not.toThrow();
    });

    test("rejects empty string, whitespace-only string, and 256 char string", () => {
      const emptyTitle = "";
      const whitespaceTitle = "   \t\n ";
      const title256 = "x".repeat(256);

      expect(() => validateEmitInput(makeValidSingleInput({ title: emptyTitle }), TEST_ERROR_MSG)).toThrow(
        ValidationError
      );
      expect(() => validateEmitInput(makeValidSingleInput({ title: whitespaceTitle }), TEST_ERROR_MSG)).toThrow(
        ValidationError
      );
      expect(() => validateEmitInput(makeValidSingleInput({ title: title256 }), TEST_ERROR_MSG)).toThrow(
        ValidationError
      );
    });
  });

  describe("body bounds (nullable, string)", () => {
    test("accepts null or any string body (including empty string)", () => {
      expect(() => validateEmitInput(makeValidSingleInput({ body: null }), TEST_ERROR_MSG)).not.toThrow();
      expect(() => validateEmitInput(makeValidSingleInput({ body: "" }), TEST_ERROR_MSG)).not.toThrow();
      expect(() => validateEmitInput(makeValidSingleInput({ body: "   " }), TEST_ERROR_MSG)).not.toThrow();
      expect(() => validateEmitInput(makeValidSingleInput({ body: "long body text" }), TEST_ERROR_MSG)).not.toThrow();
    });

    test("rejects non-null, non-string body types", () => {
      const invalidBodies: readonly unknown[] = [123, true, false, {}, []];
      for (const body of invalidBodies) {
        const input = Object.assign(makeValidSingleInput(), { body });
        expect(() => validateEmitInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
      }
    });
  });

  describe("entity ref co-presence and bounds (both-or-neither)", () => {
    test("accepts when both relatedEntityType and relatedEntityId are null", () => {
      const input = makeValidSingleInput({ relatedEntityType: null, relatedEntityId: null });
      expect(() => validateEmitInput(input, TEST_ERROR_MSG)).not.toThrow();
    });

    test("accepts valid relatedEntityType (length 1..100) and positive safe integer relatedEntityId", () => {
      const inputMax = makeValidSingleInput({
        relatedEntityType: "e".repeat(100),
        relatedEntityId: Number.MAX_SAFE_INTEGER,
      });
      expect(() => validateEmitInput(inputMax, TEST_ERROR_MSG)).not.toThrow();
    });

    test("rejects half pairs (one null, one present)", () => {
      const halfTypeNull = makeValidSingleInput({ relatedEntityType: null, relatedEntityId: 42 });
      const halfIdNull = makeValidSingleInput({ relatedEntityType: "session", relatedEntityId: null });

      expect(() => validateEmitInput(halfTypeNull, TEST_ERROR_MSG)).toThrow(ValidationError);
      expect(() => validateEmitInput(halfIdNull, TEST_ERROR_MSG)).toThrow(ValidationError);
    });

    test("rejects invalid relatedEntityType (empty string, whitespace-only, or > 100 chars)", () => {
      const emptyType = makeValidSingleInput({ relatedEntityType: "", relatedEntityId: 10 });
      const whitespaceType = makeValidSingleInput({ relatedEntityType: "   ", relatedEntityId: 10 });
      const overlongType = makeValidSingleInput({ relatedEntityType: "a".repeat(101), relatedEntityId: 10 });

      expect(() => validateEmitInput(emptyType, TEST_ERROR_MSG)).toThrow(ValidationError);
      expect(() => validateEmitInput(whitespaceType, TEST_ERROR_MSG)).toThrow(ValidationError);
      expect(() => validateEmitInput(overlongType, TEST_ERROR_MSG)).toThrow(ValidationError);
    });

    test("rejects invalid relatedEntityId when relatedEntityType is present", () => {
      const invalidEntityIds = [0, -1, 2.5, Number.NaN, 2 ** 53];
      for (const relatedEntityId of invalidEntityIds) {
        const input = makeValidSingleInput({ relatedEntityType: "session", relatedEntityId });
        expect(() => validateEmitInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
      }
    });
  });

  describe("idempotencyKey bounds (optional, 1..128 chars, non-empty)", () => {
    test("accepts undefined or valid string of length 1..128", () => {
      const undefinedKey = makeValidSingleInput({ idempotencyKey: undefined });
      const key1 = makeValidSingleInput({ idempotencyKey: "k" });
      const key128 = makeValidSingleInput({ idempotencyKey: "k".repeat(128) });

      expect(() => validateEmitInput(undefinedKey, TEST_ERROR_MSG)).not.toThrow();
      expect(() => validateEmitInput(key1, TEST_ERROR_MSG)).not.toThrow();
      expect(() => validateEmitInput(key128, TEST_ERROR_MSG)).not.toThrow();
    });

    test("rejects empty string, whitespace-only string, or string > 128 chars", () => {
      const emptyKey = makeValidSingleInput({ idempotencyKey: "" });
      const whitespaceKey = makeValidSingleInput({ idempotencyKey: "   " });
      const overlongKey = makeValidSingleInput({ idempotencyKey: "k".repeat(129) });

      expect(() => validateEmitInput(emptyKey, TEST_ERROR_MSG)).toThrow(ValidationError);
      expect(() => validateEmitInput(whitespaceKey, TEST_ERROR_MSG)).toThrow(ValidationError);
      expect(() => validateEmitInput(overlongKey, TEST_ERROR_MSG)).toThrow(ValidationError);
    });
  });
});

// ─── Tier 3: Chaos and Fuzzing ───────────────────────────────────────────────

describe("emit-validation — Tier 3 chaos and hostile content", () => {
  test("accepts hostile title strings (RTL override, Unicode emojis, SQL wildcards/injections)", () => {
    const hostileTitles = [
      "\u202E%s_' OR 1=1; -- DROP TABLE notifications;--\u202C",
      "🎉 New Message from Student - 🌟",
      "SELECT * FROM users WHERE '1'='1'",
      "Line 1\nLine 2\tTabbed",
    ];

    for (const title of hostileTitles) {
      expect(() => validateEmitInput(makeValidSingleInput({ title }), TEST_ERROR_MSG)).not.toThrow();
    }
  });

  test("rejects unknown or invalid NotificationType enum values", () => {
    const invalidTypes: readonly unknown[] = [
      "INVALID_TYPE",
      "UNKNOWN",
      "session_request_v2",
      "",
      123,
      null,
      undefined,
    ];
    for (const type of invalidTypes) {
      const input = Object.assign(makeValidSingleInput(), { type });
      expect(() => validateEmitInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
    }
  });

  test("handles large batch recipient cohort without performance issues", () => {
    const largeCohort = Array.from({ length: 1000 }, (_, i) => i + 1);
    const batchInput = makeValidBatchInput({ userIds: largeCohort });

    const startTime = performance.now();
    expect(() => validateEmitBatchInput(batchInput, TEST_ERROR_MSG)).not.toThrow();
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(100);
  });

  test("rejects duplicate user ID positioned far into a large cohort", () => {
    const largeCohortWithDuplicate = Array.from({ length: 1000 }, (_, i) => i + 1);
    largeCohortWithDuplicate.push(500); // duplicate 500 at index 1000
    const batchInput = makeValidBatchInput({ userIds: largeCohortWithDuplicate });

    expect(() => validateEmitBatchInput(batchInput, TEST_ERROR_MSG)).toThrow(ValidationError);
  });
});

// ─── Tier 4: Security and Type Coercion Resistance ──────────────────────────

describe("emit-validation — Tier 4 security and type coercion probes", () => {
  test("ignores smuggled extra fields (BOPLA probe) without throwing or mutating", () => {
    const smuggledInput = Object.assign(makeValidSingleInput(), {
      smuggledAdminFlag: true,
      extraRoleOverride: "SUPERADMIN",
    });

    expect(() => validateEmitInput(smuggledInput, TEST_ERROR_MSG)).not.toThrow();
  });

  test("rejects type coercion probes on numeric ID fields", () => {
    const coercionProbes: readonly Record<string, unknown>[] = [
      { userId: "101" },
      { userId: true },
      { userId: false },
      { userId: { valueOf: () => 101 } },
      { userId: [101] },
      { userId: 101n },
      { userId: Symbol("101") },
    ];

    for (const probe of coercionProbes) {
      const input = Object.assign(makeValidSingleInput(), probe);
      expect(() => validateEmitInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
    }
  });

  test("rejects type coercion probes on title field", () => {
    const titleProbes: readonly unknown[] = [
      12345,
      true,
      false,
      { toString: () => "Coerced Title" },
      ["Title in array"],
      100n,
      Symbol("title"),
    ];

    for (const titleVal of titleProbes) {
      const input = Object.assign(makeValidSingleInput(), { title: titleVal });
      expect(() => validateEmitInput(input, TEST_ERROR_MSG)).toThrow(ValidationError);
    }
  });

  test("module static scan: emit-validation.ts contains zero raw console.* calls", () => {
    const source = readFileSync(join(import.meta.dir, "emit-validation.ts"), "utf8");
    expect(source.includes("console.log")).toBe(false);
    expect(source.includes("console.warn")).toBe(false);
    expect(source.includes("console.error")).toBe(false);
  });
});
