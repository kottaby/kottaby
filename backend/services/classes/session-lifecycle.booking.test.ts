/**
 * Session Lifecycle Booking 4-Tier Unit Test Suite (pure validators — zero DB).
 *
 * Tier 1: 100% statement & branch coverage for `assertBookingBoundary`.
 * Tier 2: Boundary & edge cases (key lengths 1/128/129, numeric bounds, unicode verbatim).
 * Tier 3: Seeded deterministic fuzz sweep & statelessness concurrent storms.
 * Tier 4: Security & purity — frozen payload immutability, hostile shape smuggling,
 *         no payload echo in denials, localized en/ar translations, and source pin.
 */

import { describe, expect, test } from "bun:test";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { ValidationError } from "@/backend/lib/errors";
import { assertBookingBoundary } from "@/backend/services/classes/session-lifecycle.booking";
import { MAX_IDEMPOTENCY_KEY_LENGTH } from "@/backend/services/classes/session-lifecycle.guards";
import type { SessionSubmitInput } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

function t() {
  return getServerTranslations("en").errorsTranslations;
}

function tAr() {
  return getServerTranslations("ar").errorsTranslations;
}

function validInput(): SessionSubmitInput {
  return { teacherId: 10, intent: SessionIntent.Hifz };
}

/**
 * Asserts the ONLY thrown class is `ValidationError` with code `VALIDATION`
 * and the exact expected localized message.
 */
function expectValidationError(execute: () => void, message: string): void {
  let caught: unknown = null;
  try {
    execute();
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ValidationError);
  if (caught instanceof ValidationError) {
    expect(caught.code).toBe("VALIDATION");
    expect(caught.message).toBe(message);
  }
}

/** Seeded deterministic PRNG (mulberry32) — identical seed ⇒ identical sweep. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function picker(random: () => number): <T>(pool: readonly T[]) => T {
  return <T>(pool: readonly T[]): T => pool[Math.floor(random() * pool.length)];
}

const STUDENT_ID_POOL: readonly number[] = [
  1,
  42,
  9007199254740991,
  0,
  -1,
  -10,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
];

const TEACHER_ID_POOL: readonly unknown[] = [
  1,
  10,
  9007199254740991,
  0,
  -5,
  2.25,
  Number.NaN,
  Number.NEGATIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
];

const KEY_POOL: readonly string[] = [
  "valid-key-1",
  "a",
  "k".repeat(128),
  "",
  "k".repeat(129),
  "  padded-key  ",
  "مفتاح-تأكيد",
  "key!@#$%^&*()_+",
];

const INTENT_POOL: readonly unknown[] = [
  SessionIntent.Hifz,
  SessionIntent.Tajweed,
  SessionIntent.Evaluation,
  "invalid_intent",
  "",
  "HIFZ",
  "tajweed ",
];

function runSweep(): string[] {
  const random = mulberry32(0x1337);
  const pick = picker(random);
  const en = t();
  const outcomes: string[] = [];

  for (let iteration = 0; iteration < 300; iteration++) {
    const studentId = pick(STUDENT_ID_POOL);
    const teacherId = pick(TEACHER_ID_POOL);
    const intent = pick(INTENT_POOL);
    const key = pick(KEY_POOL);

    const input: SessionSubmitInput = Object.assign({}, validInput(), { teacherId, intent });

    let caught: unknown = null;
    try {
      assertBookingBoundary(studentId, input, key, en);
    } catch (error: unknown) {
      caught = error;
    }

    if (caught === null) {
      outcomes.push("ok");
      continue;
    }

    expect(caught).toBeInstanceOf(ValidationError);
    if (caught instanceof ValidationError) {
      expect(caught.code).toBe("VALIDATION");
      outcomes.push(caught.message);
    }
  }

  return outcomes;
}

describe("assertBookingBoundary", () => {
  describe("Tier 1 — statement & branch coverage", () => {
    test("accepts valid booking boundary inputs with Hifz intent", () => {
      expect(() => assertBookingBoundary(1, validInput(), "valid-key-123", t())).not.toThrow();
    });

    test("accepts valid booking boundary inputs with Tajweed intent", () => {
      const input: SessionSubmitInput = { teacherId: 5, intent: SessionIntent.Tajweed };
      expect(() => assertBookingBoundary(2, input, "tajweed-key-456", t())).not.toThrow();
    });

    test("studentId branch: throws ValidationError(t.validation) for non-positive or non-safe integers", () => {
      const en = t();
      const badStudentIds = [0, -1, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];

      for (const badId of badStudentIds) {
        expectValidationError(
          () => assertBookingBoundary(badId, validInput(), "valid-key", en),
          en.validation
        );
      }
    });

    test("teacherId branch: throws ValidationError(t.validation) for non-positive or non-safe integers", () => {
      const en = t();
      const badTeacherIds = [0, -1, -50, 2.25, Number.NaN, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];

      for (const badTeacherId of badTeacherIds) {
        const input: SessionSubmitInput = Object.assign({}, validInput(), { teacherId: badTeacherId });
        expectValidationError(
          () => assertBookingBoundary(1, input, "valid-key", en),
          en.validation
        );
      }
    });

    test("idempotencyKey branch: throws ValidationError(t.idempotencyKeyRequired) when key is empty or > 128 chars", () => {
      const en = t();

      // Empty key
      expectValidationError(
        () => assertBookingBoundary(1, validInput(), "", en),
        en.idempotencyKeyRequired
      );

      // 129 chars key
      const oversizedKey = "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1);
      expectValidationError(
        () => assertBookingBoundary(1, validInput(), oversizedKey, en),
        en.idempotencyKeyRequired
      );
    });

    test("intent branch: throws ValidationError(t.invalidSessionIntent) for non-bookable intents", () => {
      const en = t();

      // SessionIntent.Evaluation is not bookable via createSession
      const evalInput: SessionSubmitInput = Object.assign({}, validInput(), { intent: SessionIntent.Evaluation });
      expectValidationError(
        () => assertBookingBoundary(1, evalInput, "valid-key", en),
        en.invalidSessionIntent
      );

      // Arbitrary invalid strings smuggled into input
      const invalidInput: SessionSubmitInput = Object.assign({}, validInput(), { intent: "INVALID_INTENT" });
      expectValidationError(
        () => assertBookingBoundary(1, invalidInput, "valid-key", en),
        en.invalidSessionIntent
      );
    });
  });

  describe("Tier 2 — boundary & edge cases", () => {
    test("idempotencyKey length boundaries: 1 and 128 pass, 0 and 129 fail", () => {
      const en = t();

      expect(() => assertBookingBoundary(1, validInput(), "a", en)).not.toThrow();
      expect(() => assertBookingBoundary(1, validInput(), "b".repeat(128), en)).not.toThrow();

      expectValidationError(
        () => assertBookingBoundary(1, validInput(), "", en),
        en.idempotencyKeyRequired
      );

      expectValidationError(
        () => assertBookingBoundary(1, validInput(), "c".repeat(129), en),
        en.idempotencyKeyRequired
      );
    });

    test("idempotencyKey preserves content verbatim (spaces, symbols, unicode)", () => {
      const en = t();
      const specialKeys = [
        "  key-with-padding  ",
        "مفتاح-تأكيد-١٢٣",
        "key_#123-abc.xyz",
        "key\twith\nwhitespace",
      ];

      for (const key of specialKeys) {
        expect(() => assertBookingBoundary(1, validInput(), key, en)).not.toThrow();
      }
    });

    test("studentId and teacherId numeric boundaries: 1 and MAX_SAFE_INTEGER pass, 0 and MAX_SAFE_INTEGER + 1 fail", () => {
      const en = t();

      expect(() => assertBookingBoundary(1, validInput(), "key", en)).not.toThrow();
      expect(() => assertBookingBoundary(Number.MAX_SAFE_INTEGER, validInput(), "key", en)).not.toThrow();

      expectValidationError(
        () => assertBookingBoundary(0, validInput(), "key", en),
        en.validation
      );

      expectValidationError(
        () => assertBookingBoundary(Number.MAX_SAFE_INTEGER + 1, validInput(), "key", en),
        en.validation
      );

      const maxTeacherInput: SessionSubmitInput = { teacherId: Number.MAX_SAFE_INTEGER, intent: SessionIntent.Hifz };
      expect(() => assertBookingBoundary(1, maxTeacherInput, "key", en)).not.toThrow();

      const invalidTeacherInput: SessionSubmitInput = Object.assign({}, validInput(), { teacherId: 0 });
      expectValidationError(
        () => assertBookingBoundary(1, invalidTeacherInput, "key", en),
        en.validation
      );
    });
  });

  describe("Tier 3 — chaos, fuzzing & statelessness", () => {
    test("seeded PRNG fuzz sweep over assertBookingBoundary throws only ValidationError (code VALIDATION)", () => {
      const en = t();
      const allowedMessages = new Set([
        en.validation,
        en.idempotencyKeyRequired,
        en.invalidSessionIntent,
      ]);

      const outcomes = runSweep();
      expect(outcomes).toHaveLength(300);

      const thrown = outcomes.filter(outcome => outcome !== "ok");
      expect(thrown.length).toBeGreaterThan(0);

      for (const message of thrown) {
        expect(allowedMessages.has(message)).toBe(true);
      }
    });

    test("fuzz sweep produces identical outcomes given identical seed (determinism pin)", () => {
      expect(runSweep()).toEqual(runSweep());
    });

    test("concurrent assertBookingBoundary storm proves statelessness", async () => {
      const en = t();
      const results = await Promise.allSettled(
        Array.from({ length: 500 }, (_, i) =>
          Promise.resolve().then(() =>
            assertBookingBoundary(i + 1, { teacherId: i + 10, intent: SessionIntent.Hifz }, `key-${i}`, en)
          )
        )
      );

      expect(results.every(r => r.status === "fulfilled")).toBe(true);
    });
  });

  describe("Tier 4 — security, type coercion & purity", () => {
    test("assertBookingBoundary mutates nothing — frozen input objects pass through untouched", () => {
      const frozenInput: SessionSubmitInput = Object.freeze({
        teacherId: 10,
        intent: SessionIntent.Hifz,
      });

      expect(() => assertBookingBoundary(1, frozenInput, "key-123", t())).not.toThrow();
      expect(frozenInput.teacherId).toBe(10);
      expect(frozenInput.intent).toBe(SessionIntent.Hifz);
    });

    test("smuggled hostile shapes via Object.assign fail closed", () => {
      const en = t();

      // Smuggled Evaluation intent
      const smuggledInput: SessionSubmitInput = Object.assign({}, validInput(), {
        intent: SessionIntent.Evaluation,
        extraHostileProp: "<script>alert('xss')</script>",
      });

      expectValidationError(
        () => assertBookingBoundary(1, smuggledInput, "key-123", en),
        en.invalidSessionIntent
      );
    });

    test("denials never echo rejected or hostile payloads", () => {
      const en = t();
      const hostileKey = "x".repeat(129) + "<script>alert(1)</script>";

      let caughtMessage = "";
      try {
        assertBookingBoundary(1, validInput(), hostileKey, en);
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          caughtMessage = error.message;
        }
      }

      expect(caughtMessage).toBe(en.idempotencyKeyRequired);
      expect(caughtMessage).not.toContain("script");
      expect(caughtMessage).not.toContain("xxxx");
    });

    test("source pin — session-lifecycle.booking.ts stays clean and dependency-isolated", async () => {
      const source = await Bun.file(new URL("./session-lifecycle.booking.ts", import.meta.url)).text();

      expect(source).toContain("export function assertBookingBoundary");
      expect(source).not.toContain("console.");
      expect(source).not.toContain("process.env");
    });
  });

  describe("localized denials — en + ar leaf maps", () => {
    test("every boundary denial resolves its dedicated flat key in English", () => {
      const en = t();

      expectValidationError(
        () => assertBookingBoundary(0, validInput(), "key", en),
        en.validation
      );

      const invalidTeacherInput: SessionSubmitInput = Object.assign({}, validInput(), { teacherId: -1 });
      expectValidationError(
        () => assertBookingBoundary(1, invalidTeacherInput, "key", en),
        en.validation
      );

      expectValidationError(
        () => assertBookingBoundary(1, validInput(), "", en),
        en.idempotencyKeyRequired
      );

      const evalInput: SessionSubmitInput = Object.assign({}, validInput(), { intent: SessionIntent.Evaluation });
      expectValidationError(
        () => assertBookingBoundary(1, evalInput, "key", en),
        en.invalidSessionIntent
      );
    });

    test("every boundary denial resolves its dedicated flat key in Arabic", () => {
      const ar = tAr();

      expectValidationError(
        () => assertBookingBoundary(0, validInput(), "key", ar),
        ar.validation
      );

      const invalidTeacherInput: SessionSubmitInput = Object.assign({}, validInput(), { teacherId: -1 });
      expectValidationError(
        () => assertBookingBoundary(1, invalidTeacherInput, "key", ar),
        ar.validation
      );

      expectValidationError(
        () => assertBookingBoundary(1, validInput(), "", ar),
        ar.idempotencyKeyRequired
      );

      const evalInput: SessionSubmitInput = Object.assign({}, validInput(), { intent: SessionIntent.Evaluation });
      expectValidationError(
        () => assertBookingBoundary(1, evalInput, "key", ar),
        ar.invalidSessionIntent
      );
    });

    test("en and ar copies are distinct localizations of the same error keys", () => {
      const en = t();
      const ar = tAr();

      expect(en.validation).not.toBe(ar.validation);
      expect(en.idempotencyKeyRequired).not.toBe(ar.idempotencyKeyRequired);
      expect(en.invalidSessionIntent).not.toBe(ar.invalidSessionIntent);
    });
  });
});
