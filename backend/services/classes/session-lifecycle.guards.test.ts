/**
 * Unit tests for `session-lifecycle.guards.ts` — pure functions, pre-DB guards,
 * and filter normalizers for session lifecycle operations.
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
import { SESSION_FEE_HIFZ, SESSION_FEE_TAJWEED } from "@/shared/constants/session-fees.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const tErrors = getServerTranslations("en").errorsTranslations;

describe("session-lifecycle.guards — export constants and widenings", () => {
  test("MAX_IDEMPOTENCY_KEY_LENGTH is 128", () => {
    expect(MAX_IDEMPOTENCY_KEY_LENGTH).toBe(128);
  });

  test("status widening constants match SessionStatus enum values", () => {
    expect(SESSION_STARTED_STATUS).toBe(SessionStatus.Started);
    expect(SESSION_DISPUTED_STATUS).toBe(SessionStatus.Disputed);
    expect(SESSION_COMPLETED_STATUS).toBe(SessionStatus.Completed);
  });
});

describe("session-lifecycle.guards — booking vocabulary", () => {
  test("sessionFeeForIntent returns corresponding fee constant for Hifz and Tajweed", () => {
    expect(sessionFeeForIntent(SessionIntent.Hifz)).toBe(SESSION_FEE_HIFZ);
    expect(sessionFeeForIntent(SessionIntent.Tajweed)).toBe(SESSION_FEE_TAJWEED);
  });

  test("intentLaneFor resolves corresponding HeldBalanceLane for Hifz and Tajweed", () => {
    expect(intentLaneFor(SessionIntent.Hifz)).toBe(HeldBalanceLane.Hifz);
    expect(intentLaneFor(SessionIntent.Tajweed)).toBe(HeldBalanceLane.Tajweed);
  });
});

describe("session-lifecycle.guards — identifier guards", () => {
  test("isPositiveSafeInteger returns true for positive safe integers", () => {
    expect(isPositiveSafeInteger(1)).toBe(true);
    expect(isPositiveSafeInteger(42)).toBe(true);
    expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  test("isPositiveSafeInteger returns false for non-positive or non-safe-integers", () => {
    expect(isPositiveSafeInteger(0)).toBe(false);
    expect(isPositiveSafeInteger(-1)).toBe(false);
    expect(isPositiveSafeInteger(-100)).toBe(false);
    expect(isPositiveSafeInteger(1.5)).toBe(false);
    expect(isPositiveSafeInteger(0.1)).toBe(false);
    expect(isPositiveSafeInteger(Number.NaN)).toBe(false);
    expect(isPositiveSafeInteger(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPositiveSafeInteger(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  test("isPositiveSafeSessionId validates number types with positive safe integers", () => {
    expect(isPositiveSafeSessionId(1)).toBe(true);
    expect(isPositiveSafeSessionId(100)).toBe(true);

    expect(isPositiveSafeSessionId(0)).toBe(false);
    expect(isPositiveSafeSessionId(-5)).toBe(false);
    expect(isPositiveSafeSessionId(1.5)).toBe(false);
    expect(isPositiveSafeSessionId(Number.NaN)).toBe(false);
    expect(isPositiveSafeSessionId("1")).toBe(false);
    expect(isPositiveSafeSessionId("abc")).toBe(false);
    expect(isPositiveSafeSessionId(null)).toBe(false);
    expect(isPositiveSafeSessionId(undefined)).toBe(false);
    expect(isPositiveSafeSessionId({})).toBe(false);
    expect(isPositiveSafeSessionId(true)).toBe(false);
  });

  test("assertPositiveSafeSessionId passes for valid session IDs and throws ValidationError for invalid session IDs", () => {
    expect(() => assertPositiveSafeSessionId(1, tErrors)).not.toThrow();
    expect(() => assertPositiveSafeSessionId(100, tErrors)).not.toThrow();

    expect(() => assertPositiveSafeSessionId(0, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(-1, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(1.5, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(Number.NaN, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId("1", tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(null, tErrors)).toThrow(ValidationError);
    expect(() => assertPositiveSafeSessionId(undefined, tErrors)).toThrow(ValidationError);

    try {
      assertPositiveSafeSessionId(0, tErrors);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      if (err instanceof ValidationError) {
        expect(err.message).toBe(tErrors.validation);
      }
    }
  });
});

describe("session-lifecycle.guards — reason normalizers", () => {
  test("normalizeRequiredReasonText trims and returns valid reasons", () => {
    expect(normalizeRequiredReasonText("  Valid reason  ", tErrors)).toBe("Valid reason");
    expect(normalizeRequiredReasonText("a".repeat(500), tErrors)).toBe("a".repeat(500));
  });

  test("normalizeRequiredReasonText throws ValidationError for empty, whitespace-only, or over 500 chars reasons", () => {
    expect(() => normalizeRequiredReasonText("", tErrors)).toThrow(ValidationError);
    expect(() => normalizeRequiredReasonText("   \t\n ", tErrors)).toThrow(ValidationError);
    expect(() => normalizeRequiredReasonText("a".repeat(501), tErrors)).toThrow(ValidationError);

    try {
      normalizeRequiredReasonText("", tErrors);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      if (err instanceof ValidationError) {
        expect(err.message).toBe(tErrors.validation);
      }
    }
  });

  test("normalizeOptionalReasonText trims and returns valid optional reasons, or null when empty", () => {
    expect(normalizeOptionalReasonText("  Optional note  ", tErrors)).toBe("Optional note");
    expect(normalizeOptionalReasonText("b".repeat(500), tErrors)).toBe("b".repeat(500));

    expect(normalizeOptionalReasonText(null, tErrors)).toBeNull();
    expect(normalizeOptionalReasonText("", tErrors)).toBeNull();
    expect(normalizeOptionalReasonText("   \t\n ", tErrors)).toBeNull();
  });

  test("normalizeOptionalReasonText throws ValidationError when text exceeds 500 chars", () => {
    expect(() => normalizeOptionalReasonText("b".repeat(501), tErrors)).toThrow(ValidationError);

    try {
      normalizeOptionalReasonText("b".repeat(501), tErrors);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      if (err instanceof ValidationError) {
        expect(err.message).toBe(tErrors.validation);
      }
    }
  });
});

describe("session-lifecycle.guards — claim key unique violation detector", () => {
  test("isClaimKeyUniqueViolation returns true when top-level or cause error has PostgreSQL code 23505", () => {
    const topLevelError = Object.assign(new Error("Unique violation"), { code: "23505" });
    expect(isClaimKeyUniqueViolation(topLevelError)).toBe(true);

    const causeError = Object.assign(new Error("Driver error"), { code: "23505" });
    const wrapperError = new Error("Drizzle wrapper", { cause: causeError });
    expect(isClaimKeyUniqueViolation(wrapperError)).toBe(true);

    const deepCauseError = new Error("Outer wrapper", {
      cause: new Error("Middle wrapper", { cause: causeError }),
    });
    expect(isClaimKeyUniqueViolation(deepCauseError)).toBe(true);
  });

  test("isClaimKeyUniqueViolation returns false for non-23505 errors, non-errors, or circular cause chains", () => {
    expect(isClaimKeyUniqueViolation(new Error("Generic error"))).toBe(false);
    expect(isClaimKeyUniqueViolation(Object.assign(new Error("Other error"), { code: "23503" }))).toBe(false);
    expect(isClaimKeyUniqueViolation(null)).toBe(false);
    expect(isClaimKeyUniqueViolation(undefined)).toBe(false);
    expect(isClaimKeyUniqueViolation("23505")).toBe(false);
    expect(isClaimKeyUniqueViolation({ code: "23505" })).toBe(false);

    // Circular cause chain handling
    const errA = new Error("Err A");
    const errB = new Error("Err B");
    Object.assign(errA, { cause: errB });
    Object.assign(errB, { cause: errA });
    expect(isClaimKeyUniqueViolation(errA)).toBe(false);
  });
});

describe("session-lifecycle.guards — pagination and window normalizers", () => {
  test("normalizePageBounds normalizes page and pageSize correctly", () => {
    expect(normalizePageBounds(1, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(2, 50)).toEqual({ page: 2, pageSize: 50 });
    expect(normalizePageBounds(3, 1)).toEqual({ page: 3, pageSize: 1 });

    // Fallback page to 1
    expect(normalizePageBounds(0, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(-5, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1.5, 25)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(Number.NaN, 25)).toEqual({ page: 1, pageSize: 25 });

    // Fallback pageSize to default 25
    expect(normalizePageBounds(1, 0)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, -10)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, 51)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, 100)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, 25.5)).toEqual({ page: 1, pageSize: 25 });
    expect(normalizePageBounds(1, Number.NaN)).toEqual({ page: 1, pageSize: 25 });
  });

  test("normalizeAdminListBounds normalizes limit, offset, and computes page index", () => {
    expect(normalizeAdminListBounds(25, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(25, 25)).toEqual({ safeLimit: 25, safeOffset: 25, page: 2 });
    expect(normalizeAdminListBounds(10, 30)).toEqual({ safeLimit: 10, safeOffset: 30, page: 4 });

    // Limit clamp (1..50, default 25)
    expect(normalizeAdminListBounds(0, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(-5, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(51, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(25.5, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });

    // Offset floor (0)
    expect(normalizeAdminListBounds(25, -10)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    expect(normalizeAdminListBounds(25, Number.NaN)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
  });

  test("guardStatusFilter validates SessionStatus enum members or resets filter to null", () => {
    expect(guardStatusFilter({ status: SessionStatus.Scheduled })).toEqual({ status: SessionStatus.Scheduled });
    expect(guardStatusFilter({ status: SessionStatus.Started })).toEqual({ status: SessionStatus.Started });
    expect(guardStatusFilter({ status: SessionStatus.Completed })).toEqual({ status: SessionStatus.Completed });
    expect(guardStatusFilter({ status: SessionStatus.Cancelled })).toEqual({ status: SessionStatus.Cancelled });
    expect(guardStatusFilter({ status: SessionStatus.Disputed })).toEqual({ status: SessionStatus.Disputed });

    expect(guardStatusFilter({ status: undefined })).toEqual({ status: null });
    expect(guardStatusFilter({ status: null })).toEqual({ status: null });

    const invalidFilter = Object.assign({ status: SessionStatus.Scheduled }, { status: "invalid_status" });
    expect(guardStatusFilter(invalidFilter)).toEqual({
      status: null,
    });
  });
});
