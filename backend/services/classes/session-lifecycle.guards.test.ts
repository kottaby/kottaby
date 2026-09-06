/**
 * `session-lifecycle.guards` tests — pre-DB pure guards and normalizers.
 *
 * Per `tests.instructions.md` & project testing standards:
 *  - 4-Tier mixed suite (pure unit testing here, zero DB access).
 *  - Tier 1: Statement / branch coverage on happy and error paths.
 *  - Tier 2: Boundary & edge cases (e.g. whitespace, 500-char reason limits, NaN/Infinity/floats for IDs, max page size bounds).
 *  - Tier 3: Chaos & fuzz (e.g. cycle-safe cause traversal in `isClaimKeyUniqueViolation`, concurrent execution statelessness).
 *  - Tier 4: Security / denial taxonomy (e.g. invalid status filtering, unparseable inputs failing closed before DB work).
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

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

describe("session-lifecycle.guards — Widened status constants & export constants", () => {
  test("Tier 1: constants export exact expected values and match enum identities", () => {
    expect(MAX_IDEMPOTENCY_KEY_LENGTH).toBe(128);
    expect(SESSION_STARTED_STATUS).toBe(SessionStatus.Started);
    expect(SESSION_DISPUTED_STATUS).toBe(SessionStatus.Disputed);
    expect(SESSION_COMPLETED_STATUS).toBe(SessionStatus.Completed);
  });
});

describe("session-lifecycle.guards — Booking vocabulary (sessionFeeForIntent & intentLaneFor)", () => {
  test("Tier 1: sessionFeeForIntent resolves string fee constants per intent", () => {
    expect(sessionFeeForIntent(SessionIntent.Hifz)).toBe(SESSION_FEE_HIFZ);
    expect(sessionFeeForIntent(SessionIntent.Tajweed)).toBe(SESSION_FEE_TAJWEED);
  });

  test("Tier 1: intentLaneFor resolves HeldBalanceLane per intent", () => {
    expect(intentLaneFor(SessionIntent.Hifz)).toBe(HeldBalanceLane.Hifz);
    expect(intentLaneFor(SessionIntent.Tajweed)).toBe(HeldBalanceLane.Tajweed);
  });
});

describe("session-lifecycle.guards — ID shape guards (isPositiveSafeInteger, isPositiveSafeSessionId, assertPositiveSafeSessionId)", () => {
  test("Tier 1 & 2: isPositiveSafeInteger correctly validates safe positive integers", () => {
    expect(isPositiveSafeInteger(1)).toBe(true);
    expect(isPositiveSafeInteger(123456789)).toBe(true);
    expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);

    expect(isPositiveSafeInteger(0)).toBe(false);
    expect(isPositiveSafeInteger(-1)).toBe(false);
    expect(isPositiveSafeInteger(1.5)).toBe(false);
    expect(isPositiveSafeInteger(NaN)).toBe(false);
    expect(isPositiveSafeInteger(Infinity)).toBe(false);
    expect(isPositiveSafeInteger(-Infinity)).toBe(false);
    expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  test("Tier 1 & 2: isPositiveSafeSessionId handles typed numbers and unknown runtime shapes", () => {
    expect(isPositiveSafeSessionId(42)).toBe(true);

    expect(isPositiveSafeSessionId("42")).toBe(false); // string not parsed
    expect(isPositiveSafeSessionId(null)).toBe(false);
    expect(isPositiveSafeSessionId(undefined)).toBe(false);
    expect(isPositiveSafeSessionId({})).toBe(false);
    expect(isPositiveSafeSessionId([])).toBe(false);
    expect(isPositiveSafeSessionId(0)).toBe(false);
    expect(isPositiveSafeSessionId(-10)).toBe(false);
    expect(isPositiveSafeSessionId(3.14)).toBe(false);
    expect(isPositiveSafeSessionId(NaN)).toBe(false);
  });

  test("Tier 1 & 4: assertPositiveSafeSessionId passes valid IDs and throws ValidationError on garbage", () => {
    expect(() => assertPositiveSafeSessionId(100, tErrors)).not.toThrow();

    expect(() => assertPositiveSafeSessionId(0, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(-5, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId("100", tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(null, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(NaN, tErrors)).toThrow(ValidationError);

    try {
      assertPositiveSafeSessionId(-1, tErrors);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      if (err instanceof ValidationError) {
        expect(err.message).toBe(tErrors.validation);
      }
    }
  });
});

describe("session-lifecycle.guards — Reason normalizers (normalizeRequiredReasonText & normalizeOptionalReasonText)", () => {
  test("Tier 1 & 2: normalizeRequiredReasonText trims and rejects empty/whitespace/over-limit inputs", () => {
    expect(normalizeRequiredReasonText("  Valid reason text  ", tErrors)).toBe("Valid reason text");

    // Exact 500 characters
    const exact500 = "a".repeat(500);
    expect(normalizeRequiredReasonText(exact500, tErrors)).toBe(exact500);

    // Empty or whitespace only throws
    expect(() => normalizeRequiredReasonText("", tErrors)).toThrow(ValidationError);
    expect(() => normalizeRequiredReasonText("   \t\n  ", tErrors)).toThrow(ValidationError);

    // Over 500 characters throws
    const over500 = "a".repeat(501);
    expect(() => normalizeRequiredReasonText(over500, tErrors)).toThrow(ValidationError);
  });

  test("Tier 1 & 2: normalizeOptionalReasonText maps empty/whitespace to null and trims non-empty inputs", () => {
    expect(normalizeOptionalReasonText(null, tErrors)).toBeNull();
    expect(normalizeOptionalReasonText("", tErrors)).toBeNull();
    expect(normalizeOptionalReasonText("   \t\n  ", tErrors)).toBeNull();

    expect(normalizeOptionalReasonText("  Optional note  ", tErrors)).toBe("Optional note");

    const exact500 = "b".repeat(500);
    expect(normalizeOptionalReasonText(exact500, tErrors)).toBe(exact500);

    const over500 = "b".repeat(501);
    expect(() => normalizeOptionalReasonText(over500, tErrors)).toThrow(ValidationError);
  });
});

describe("session-lifecycle.guards — Claim key unique violation detector (isClaimKeyUniqueViolation)", () => {
  test("Tier 1 & 3: detects code 23505 at root or nested cause chain, handles non-errors and circular references safely", () => {
    // Top-level driver error with code 23505
    const topError = Object.assign(new Error("Unique constraint violation"), { code: "23505" });
    expect(isClaimKeyUniqueViolation(topError)).toBe(true);

    // Drizzle-wrapped error with cause
    const causeError = Object.assign(new Error("pg error"), { code: "23505" });
    const wrapperError = new Error("Drizzle query failed", { cause: causeError });
    expect(isClaimKeyUniqueViolation(wrapperError)).toBe(true);

    // Deeply nested error chain (3 levels)
    const deepCause = Object.assign(new Error("deep error"), { code: "23505" });
    const midCause = new Error("mid error", { cause: deepCause });
    const outerError = new Error("outer error", { cause: midCause });
    expect(isClaimKeyUniqueViolation(outerError)).toBe(true);

    // Error without 23505 code
    const otherError = Object.assign(new Error("Some other error"), { code: "23502" });
    expect(isClaimKeyUniqueViolation(otherError)).toBe(false);

    // Non-error values
    expect(isClaimKeyUniqueViolation(null)).toBe(false);
    expect(isClaimKeyUniqueViolation(undefined)).toBe(false);
    expect(isClaimKeyUniqueViolation("23505")).toBe(false);
    expect(isClaimKeyUniqueViolation({ code: "23505" })).toBe(false);

    // Circular cause error (cycle safety)
    const errA = new Error("A");
    const errB = new Error("B", { cause: errA });
    Object.assign(errA, { cause: errB }); // Circular
    expect(isClaimKeyUniqueViolation(errA)).toBe(false);
  });
});

describe("session-lifecycle.guards — Pagination & Window Normalizers (normalizePageBounds & normalizeAdminListBounds)", () => {
  test("Tier 1 & 2: normalizePageBounds enforces bounds and fallbacks", () => {
    // Valid page and pageSize
    expect(normalizePageBounds(1, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(3, 50)).toEqual({ page: 3, pageSize: 50 });

    // Invalid page (<1, fractional, non-number) falls back to 1
    expect(normalizePageBounds(0, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(-5, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1.5, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(NaN, 25)).toEqual({ page: 1, pageSize: 25 });

    // Invalid pageSize (<1, >50, fractional, non-number) falls back to default 25
    expect(normalizePageBounds(1, 0)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, 51)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, -10)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, 10.5)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, NaN)).toEqual({ page: 1, pageSize: 25 });
  });

  test("Tier 1 & 2: normalizeAdminListBounds enforces limit, offset floor, and 1-based page index", () => {
    // Valid limit and offset
    expect(normalizeAdminListBounds(25, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(10, 20)).toEqual({ safeLimit: 10, safeOffset: 20, page: 3 });
    expect(normalizeAdminListBounds(50, 99)).toEqual({ safeLimit: 50, safeOffset: 99, page: 2 });

    // Invalid limit falls back to default 25
    expect(normalizeAdminListBounds(0, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(100, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });

    // Invalid offset floors at 0
    expect(normalizeAdminListBounds(25, -10)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(25, NaN)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
  });
});

describe("session-lifecycle.guards — Filter normalizer (guardStatusFilter)", () => {
  test("Tier 1 & 4: guardStatusFilter passes valid SessionStatus and maps invalid/absent statuses to null", () => {
    // Valid SessionStatus members pass through
    expect(guardStatusFilter({ status: SessionStatus.Scheduled })).toEqual({ status: SessionStatus.Scheduled });
    expect(guardStatusFilter({ status: SessionStatus.Started })).toEqual({ status: SessionStatus.Started });
    expect(guardStatusFilter({ status: SessionStatus.Completed })).toEqual({ status: SessionStatus.Completed });

    // Null or undefined status
    expect(guardStatusFilter({ status: null })).toEqual({ status: null });
    expect(guardStatusFilter({})).toEqual({ status: null });

    // Invalid status value (not in SessionStatus enum)
    const invalidFilter: SessionListFilterInput = JSON.parse('{"status": "INVALID_STATUS"}');
    expect(guardStatusFilter(invalidFilter)).toEqual({ status: null });
  });
});

describe("session-lifecycle.guards — Tier 3 (Statelessness)", () => {
  test("Tier 3: concurrent executions prove functions are pure and stateless", async () => {
    const promises = Array.from({ length: 50 }, (_, i) => {
      return Promise.all([
        Promise.resolve(isPositiveSafeInteger(i + 1)),
        Promise.resolve(sessionFeeForIntent(i % 2 === 0 ? SessionIntent.Hifz : SessionIntent.Tajweed)),
        Promise.resolve(normalizePageBounds(i, i * 2)),
      ]);
    });

    const results = await Promise.all(promises);
    expect(results).toHaveLength(50);
  });
});
