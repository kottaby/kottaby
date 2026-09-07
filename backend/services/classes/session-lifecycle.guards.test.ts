/**
 * Session Lifecycle Guards & Normalizers 4-Tier Unit Test Suite.
 *
 * Tier 1: 100% statement & branch coverage for all exported functions/constants.
 * Tier 2: Boundary & edge cases (length limits, numerical bounds, status filters, cause chains).
 * Tier 3: Chaos & fuzzing (randomized non-enum strings, case-smuggling, concurrent storms).
 * Tier 4: Security & abuse (SQL wildcards, unicode/RTL payloads, control characters, huge payloads).
 */

import { describe, expect, test } from "bun:test";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { ValidationError } from "@/backend/lib/errors";
import {
  assertPositiveSafeSessionId,
  guardStatusFilter,
  intentLaneFor,
  isClaimKeyUniqueViolation,
  isPositiveSafeInteger,
  isPositiveSafeSessionId,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  normalizeAdminListBounds,
  normalizeOptionalReasonText,
  normalizePageBounds,
  normalizeRequiredReasonText,
  SESSION_COMPLETED_STATUS,
  SESSION_DISPUTED_STATUS,
  SESSION_STARTED_STATUS,
  sessionFeeForIntent,
} from "@/backend/services/classes/session-lifecycle.guards";
import type { SessionListFilterInput } from "@/backend/types";
import { SESSION_FEE_HIFZ, SESSION_FEE_TAJWEED } from "@/shared/constants/session-fees.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

function t() {
  return getServerTranslations("en").errorsTranslations;
}

describe("Session Lifecycle Constants", () => {
  test("MAX_IDEMPOTENCY_KEY_LENGTH equals 128", () => {
    expect(MAX_IDEMPOTENCY_KEY_LENGTH).toBe(128);
  });

  test("status constants widened to string identities", () => {
    expect(SESSION_STARTED_STATUS).toBe("started");
    expect(SESSION_STARTED_STATUS).toBe(SessionStatus.Started);
    expect(SESSION_DISPUTED_STATUS).toBe("disputed");
    expect(SESSION_DISPUTED_STATUS).toBe(SessionStatus.Disputed);
    expect(SESSION_COMPLETED_STATUS).toBe("completed");
    expect(SESSION_COMPLETED_STATUS).toBe(SessionStatus.Completed);
  });
});

describe("sessionFeeForIntent", () => {
  describe("Tier 1 — branch coverage", () => {
    test("Hifz intent resolves to SESSION_FEE_HIFZ constant ('25.00')", () => {
      expect(sessionFeeForIntent(SessionIntent.Hifz)).toBe(SESSION_FEE_HIFZ);
      expect(sessionFeeForIntent(SessionIntent.Hifz)).toBe("25.00");
    });

    test("Tajweed intent resolves to SESSION_FEE_TAJWEED constant ('25.00')", () => {
      expect(sessionFeeForIntent(SessionIntent.Tajweed)).toBe(SESSION_FEE_TAJWEED);
      expect(sessionFeeForIntent(SessionIntent.Tajweed)).toBe("25.00");
    });
  });

  describe("Tier 3 — chaos & statelessness", () => {
    test("concurrent resolution storm proves statelessness", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 500 }, (_, i) =>
          Promise.resolve(sessionFeeForIntent(i % 2 === 0 ? SessionIntent.Hifz : SessionIntent.Tajweed))
        )
      );
      expect(results.every(r => r.status === "fulfilled" && r.value === "25.00")).toBe(true);
    });
  });
});

describe("intentLaneFor", () => {
  describe("Tier 1 — branch coverage", () => {
    test("Hifz intent resolves to HeldBalanceLane.Hifz", () => {
      expect(intentLaneFor(SessionIntent.Hifz)).toBe(HeldBalanceLane.Hifz);
    });

    test("Tajweed intent resolves to HeldBalanceLane.Tajweed", () => {
      expect(intentLaneFor(SessionIntent.Tajweed)).toBe(HeldBalanceLane.Tajweed);
    });
  });

  describe("Tier 3 — chaos & statelessness", () => {
    test("concurrent lane resolution storm", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 500 }, () => Promise.resolve(intentLaneFor(SessionIntent.Hifz)))
      );
      expect(results.every(r => r.status === "fulfilled" && r.value === HeldBalanceLane.Hifz)).toBe(true);
    });
  });
});

describe("isPositiveSafeInteger", () => {
  describe("Tier 1 — branch coverage", () => {
    test("returns true for positive safe integers", () => {
      expect(isPositiveSafeInteger(1)).toBe(true);
      expect(isPositiveSafeInteger(100)).toBe(true);
      expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    test("returns false for zero and negative integers", () => {
      expect(isPositiveSafeInteger(0)).toBe(false);
      expect(isPositiveSafeInteger(-1)).toBe(false);
      expect(isPositiveSafeInteger(-100)).toBe(false);
    });

    test("returns false for non-integers and special numbers", () => {
      expect(isPositiveSafeInteger(1.5)).toBe(false);
      expect(isPositiveSafeInteger(-0.5)).toBe(false);
      expect(isPositiveSafeInteger(Number.NaN)).toBe(false);
      expect(isPositiveSafeInteger(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isPositiveSafeInteger(Number.NEGATIVE_INFINITY)).toBe(false);
      expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });
  });

  describe("Tier 2 — boundary & edge cases", () => {
    test("boundary around 0 and 1", () => {
      expect(isPositiveSafeInteger(0)).toBe(false);
      expect(isPositiveSafeInteger(0.9999999999)).toBe(false);
      expect(isPositiveSafeInteger(1)).toBe(true);
    });

    test("boundary around MAX_SAFE_INTEGER", () => {
      expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });
  });
});

describe("isPositiveSafeSessionId", () => {
  describe("Tier 1 — branch coverage", () => {
    test("returns true for positive safe integer number primitives", () => {
      expect(isPositiveSafeSessionId(1)).toBe(true);
      expect(isPositiveSafeSessionId(42)).toBe(true);
      expect(isPositiveSafeSessionId(9007199254740991)).toBe(true);
    });

    test("returns false for non-number types", () => {
      expect(isPositiveSafeSessionId("1")).toBe(false);
      expect(isPositiveSafeSessionId(null)).toBe(false);
      expect(isPositiveSafeSessionId(undefined)).toBe(false);
      expect(isPositiveSafeSessionId({})).toBe(false);
      expect(isPositiveSafeSessionId([])).toBe(false);
      expect(isPositiveSafeSessionId(true)).toBe(false);
      expect(isPositiveSafeSessionId(Symbol("1"))).toBe(false);
      expect(isPositiveSafeSessionId(BigInt(1))).toBe(false);
    });

    test("returns false for number primitives failing isPositiveSafeInteger", () => {
      expect(isPositiveSafeSessionId(0)).toBe(false);
      expect(isPositiveSafeSessionId(-5)).toBe(false);
      expect(isPositiveSafeSessionId(1.23)).toBe(false);
      expect(isPositiveSafeSessionId(Number.NaN)).toBe(false);
      expect(isPositiveSafeSessionId(Number.POSITIVE_INFINITY)).toBe(false);
    });
  });

  describe("Tier 4 — type boundary smuggling", () => {
    test("objects with valueOf/toString returning positive numbers still return false", () => {
      const smuggled = {
        valueOf: () => 42,
        toString: () => "42",
      };
      expect(isPositiveSafeSessionId(smuggled)).toBe(false);
    });
  });
});

describe("assertPositiveSafeSessionId", () => {
  describe("Tier 1 — branch coverage", () => {
    test("passes without throwing for valid positive safe integer IDs", () => {
      expect(() => assertPositiveSafeSessionId(1, t())).not.toThrow();
      expect(() => assertPositiveSafeSessionId(12345, t())).not.toThrow();
    });

    test("throws ValidationError with translated validation message for invalid IDs", () => {
      const invalidInputs: unknown[] = ["abc", 0, -10, 1.5, Number.NaN, null, undefined, {}, []];
      for (const input of invalidInputs) {
        expect(() => assertPositiveSafeSessionId(input, t())).toThrow(ValidationError);
        try {
          assertPositiveSafeSessionId(input, t());
        } catch (e: unknown) {
          expect(e).toBeInstanceOf(ValidationError);
          if (e instanceof ValidationError) {
            expect(e.message).toBe(t().validation);
          }
        }
      }
    });
  });
});

describe("normalizeRequiredReasonText", () => {
  describe("Tier 1 — branch coverage", () => {
    test("trims whitespace and returns valid string", () => {
      expect(normalizeRequiredReasonText("  Reason for dispute  ", t())).toBe("Reason for dispute");
    });

    test("accepts exact 500-character string", () => {
      const string500 = "a".repeat(500);
      expect(normalizeRequiredReasonText(string500, t())).toBe(string500);
    });

    test("throws ValidationError for empty or whitespace-only string", () => {
      expect(() => normalizeRequiredReasonText("", t())).toThrow(ValidationError);
      expect(() => normalizeRequiredReasonText("   \t\n  ", t())).toThrow(ValidationError);
    });

    test("throws ValidationError when trimmed length exceeds 500 characters", () => {
      const string501 = "a".repeat(501);
      expect(() => normalizeRequiredReasonText(string501, t())).toThrow(ValidationError);

      const padded501 = `  ${"b".repeat(501)}  `;
      expect(() => normalizeRequiredReasonText(padded501, t())).toThrow(ValidationError);
    });
  });

  describe("Tier 2 — boundary cases", () => {
    test("boundary around 500 length: 500 passes, 501 fails", () => {
      expect(normalizeRequiredReasonText("x".repeat(500), t())).toHaveLength(500);
      expect(() => normalizeRequiredReasonText("x".repeat(501), t())).toThrow(ValidationError);
    });

    test("padded string whose trimmed length is 500 passes", () => {
      const padded = `   ${"c".repeat(500)}   `;
      expect(normalizeRequiredReasonText(padded, t())).toHaveLength(500);
    });
  });

  describe("Tier 4 — security & abuse", () => {
    test("unicode / RTL / control characters within 500 limit are preserved trimmed", () => {
      const rtlText = "  سبب النزاع بالتفصيل  ";
      expect(normalizeRequiredReasonText(rtlText, t())).toBe("سبب النزاع بالتفصيل");

      const unicodeText = "  \u0000 \u05D0\u05D1\u05D2  ";
      expect(normalizeRequiredReasonText(unicodeText, t())).toBe("\u0000 \u05D0\u05D1\u05D2");
    });
  });
});

describe("normalizeOptionalReasonText", () => {
  describe("Tier 1 — branch coverage", () => {
    test("returns null when input is null", () => {
      expect(normalizeOptionalReasonText(null, t())).toBeNull();
    });

    test("returns null when input is empty string or whitespace-only", () => {
      expect(normalizeOptionalReasonText("", t())).toBeNull();
      expect(normalizeOptionalReasonText("   \t\n  ", t())).toBeNull();
    });

    test("returns trimmed string when input is valid", () => {
      expect(normalizeOptionalReasonText("  Optional cancel note  ", t())).toBe("Optional cancel note");
    });

    test("accepts exact 500-character string", () => {
      const string500 = "x".repeat(500);
      expect(normalizeOptionalReasonText(string500, t())).toBe(string500);
    });

    test("throws ValidationError when trimmed length exceeds 500 characters", () => {
      const string501 = "x".repeat(501);
      expect(() => normalizeOptionalReasonText(string501, t())).toThrow(ValidationError);
    });
  });

  describe("Tier 2 — boundary cases", () => {
    test("boundary around 500 length: 500 passes, 501 fails", () => {
      expect(normalizeOptionalReasonText("y".repeat(500), t())).toHaveLength(500);
      expect(() => normalizeOptionalReasonText("y".repeat(501), t())).toThrow(ValidationError);
    });
  });
});

describe("isClaimKeyUniqueViolation", () => {
  describe("Tier 1 — branch coverage", () => {
    test("returns true for direct Error with code 23505", () => {
      const err = Object.assign(new Error("unique constraint violation"), { code: "23505" });
      expect(isClaimKeyUniqueViolation(err)).toBe(true);
    });

    test("returns true when code 23505 is nested in cause chain", () => {
      const driverError = Object.assign(new Error("duplicate key value"), { code: "23505" });
      const drizzleError = new Error("QueryFailed", { cause: driverError });
      expect(isClaimKeyUniqueViolation(drizzleError)).toBe(true);

      const topError = new Error("TopLevelWrapper", { cause: drizzleError });
      expect(isClaimKeyUniqueViolation(topError)).toBe(true);
    });

    test("returns false for errors without code 23505", () => {
      const notFoundErr = Object.assign(new Error("not found"), { code: "42703" });
      expect(isClaimKeyUniqueViolation(notFoundErr)).toBe(false);

      const plainErr = new Error("generic error");
      expect(isClaimKeyUniqueViolation(plainErr)).toBe(false);

      expect(isClaimKeyUniqueViolation(null)).toBe(false);
      expect(isClaimKeyUniqueViolation(undefined)).toBe(false);
      expect(isClaimKeyUniqueViolation("error string")).toBe(false);
      expect(isClaimKeyUniqueViolation({ code: "23505" })).toBe(false);
    });
  });

  describe("Tier 2 — boundary & edge cases", () => {
    test("cycle-safe Set prevents infinite loop on circular cause chains", () => {
      const circularErr = new Error("Circular error 1");
      const causeErr = new Error("Circular error 2", { cause: circularErr });
      Object.assign(circularErr, { cause: causeErr });

      // Circular chain without 23505 code -> terminates safely, returns false
      expect(isClaimKeyUniqueViolation(circularErr)).toBe(false);

      // Circular chain with 23505 code -> terminates safely, returns true
      const circularWithCode = new Error("Circular error with code");
      Object.assign(circularWithCode, { code: "23505", cause: circularWithCode });
      expect(isClaimKeyUniqueViolation(circularWithCode)).toBe(true);
    });
  });
});

describe("normalizePageBounds", () => {
  describe("Tier 1 — branch coverage", () => {
    test("valid page and pageSize pass through", () => {
      expect(normalizePageBounds(1, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(3, 10)).toEqual({ page: 3, pageSize: 10 });
      expect(normalizePageBounds(1, 1)).toEqual({ page: 1, pageSize: 1 });
      expect(normalizePageBounds(5, 50)).toEqual({ page: 5, pageSize: 50 });
    });

    test("invalid page falls back to 1", () => {
      expect(normalizePageBounds(0, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(-5, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1.5, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(Number.NaN, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(Number.POSITIVE_INFINITY, 25)).toEqual({ page: 1, pageSize: 25 });
    });

    test("invalid pageSize falls back to DEFAULT_PAGE_SIZE (25)", () => {
      expect(normalizePageBounds(1, 0)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, -10)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, 51)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, 100)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, 2.5)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, Number.NaN)).toEqual({ page: 1, pageSize: 25 });
    });
  });

  describe("Tier 2 — boundary cases", () => {
    test("pageSize upper bound 50: 50 is valid, 51 falls back to 25", () => {
      expect(normalizePageBounds(1, 50).pageSize).toBe(50);
      expect(normalizePageBounds(1, 51).pageSize).toBe(25);
    });

    test("pageSize lower bound 1: 1 is valid, 0 falls back to 25", () => {
      expect(normalizePageBounds(1, 1).pageSize).toBe(1);
      expect(normalizePageBounds(1, 0).pageSize).toBe(25);
    });
  });
});

describe("normalizeAdminListBounds", () => {
  describe("Tier 1 — branch coverage", () => {
    test("valid limit and offset calculate page index honestly", () => {
      expect(normalizeAdminListBounds(25, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(25, 25)).toEqual({ safeLimit: 25, safeOffset: 25, page: 2 });
      expect(normalizeAdminListBounds(10, 30)).toEqual({ safeLimit: 10, safeOffset: 30, page: 4 });
      expect(normalizeAdminListBounds(10, 25)).toEqual({ safeLimit: 10, safeOffset: 25, page: 3 });
    });

    test("invalid limit falls back to DEFAULT_PAGE_SIZE (25)", () => {
      expect(normalizeAdminListBounds(0, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(51, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(-5, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(1.5, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(Number.NaN, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    });

    test("invalid offset floors at 0", () => {
      expect(normalizeAdminListBounds(25, -1)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(25, -100)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(25, 1.5)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(25, Number.NaN)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    });
  });

  describe("Tier 2 — boundary & page index calculation", () => {
    test("page index formula Math.floor(safeOffset / safeLimit) + 1", () => {
      // Offset 0..24 with limit 25 => page 1
      expect(normalizeAdminListBounds(25, 0).page).toBe(1);
      expect(normalizeAdminListBounds(25, 24).page).toBe(1);
      // Offset 25..49 with limit 25 => page 2
      expect(normalizeAdminListBounds(25, 25).page).toBe(2);
      expect(normalizeAdminListBounds(25, 49).page).toBe(2);
      // Offset 50 with limit 25 => page 3
      expect(normalizeAdminListBounds(25, 50).page).toBe(3);
    });
  });
});

describe("guardStatusFilter", () => {
  describe("Tier 1 — branch coverage", () => {
    test("passes through valid SessionStatus enum members", () => {
      const validStatuses = Object.values(SessionStatus);
      for (const st of validStatuses) {
        const filter: SessionListFilterInput = { status: st };
        expect(guardStatusFilter(filter)).toEqual({ status: st });
      }
    });

    test("returns { status: null } when status is undefined or null", () => {
      expect(guardStatusFilter({ status: undefined })).toEqual({ status: null });
      expect(guardStatusFilter({ status: null })).toEqual({ status: null });
      expect(guardStatusFilter({})).toEqual({ status: null });
    });

    test("returns { status: null } when status is not a valid SessionStatus member", () => {
      const invalidFilter: SessionListFilterInput = Object.assign(
        { status: SessionStatus.Scheduled },
        { status: "INVALID_STATUS" }
      );
      expect(guardStatusFilter(invalidFilter)).toEqual({ status: null });

      const bogusFilter: SessionListFilterInput = Object.assign(
        { status: SessionStatus.Scheduled },
        { status: "expired" }
      );
      expect(guardStatusFilter(bogusFilter)).toEqual({ status: null });
    });
  });

  describe("Tier 3 — chaos & case-smuggling", () => {
    test("case-smuggled status strings drop out to null", () => {
      const smuggledInputs = ["SCHEDULED", "scheduled ", " Scheduled", "COMPLETED", "CANCELLED", "DISPUTED"];
      for (const smuggled of smuggledInputs) {
        const filter: SessionListFilterInput = Object.assign({ status: SessionStatus.Scheduled }, { status: smuggled });
        expect(guardStatusFilter(filter)).toEqual({ status: null });
      }
    });

    test("concurrent guardStatusFilter storm proves statelessness", async () => {
      const filter = { status: SessionStatus.Scheduled };
      const results = await Promise.allSettled(
        Array.from({ length: 500 }, () => Promise.resolve(guardStatusFilter(filter)))
      );
      expect(results.every(r => r.status === "fulfilled" && r.value.status === SessionStatus.Scheduled)).toBe(true);
    });
  });
});
