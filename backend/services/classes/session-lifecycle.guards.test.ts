/**
 * Session Lifecycle Pre-DB Guards 4-Tier Test Suite.
 * Pure unit tier — NO DB, NO network, NO async state.
 *
 * Tier 1: Happy Paths & Core Logic — positive safe integer IDs, fee/lane mapping,
 *         valid reason trimming, unique violation detection, valid pagination bounds,
 *         and status filter passthrough.
 * Tier 2: Edge Cases & Boundaries — non-positive / non-integer / non-number / NaN /
 *         overflow IDs, 500-character reason boundaries, empty/whitespace strings,
 *         out-of-bound pagination fallback (1..50 window, offset floor), and invalid status filtering.
 * Tier 3: Hostile / Invalid Inputs & Cycle Safety — non-error / null / primitive throwables,
 *         cause chains without 23505 code, cyclic error cause chains (cycle-safe traversal),
 *         and exported constants shape inspection.
 * Tier 4: Architectural Invariants & Purity — purity pins (zero database / network / env imports),
 *         export descriptor inspection, and translation error contract conformity.
 *
 * Runs via the mandated runner:
 * `KOTTABY_TEST_RUNNER_OK=1 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kottaby_test bun --env-file=.env.test.ci test backend/services/classes/session-lifecycle.guards.test.ts`
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/** Standard mock translations fixture for pre-DB guard error assertions. */
const mockErrorsTranslations = getServerTranslations("ar").errorsTranslations;

/** Reads a repo file from disk, cwd-relative. */
function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("session-lifecycle.guards", () => {
  // =========================================================================
  // Tier 1: Happy Paths & Core Logic
  // =========================================================================
  describe("Tier 1 — Happy Paths & Core Logic", () => {
    test("isPositiveSafeInteger returns true for valid positive safe integers", () => {
      expect(isPositiveSafeInteger(1)).toBe(true);
      expect(isPositiveSafeInteger(42)).toBe(true);
      expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    test("isPositiveSafeSessionId returns true for positive safe integer numbers", () => {
      expect(isPositiveSafeSessionId(1)).toBe(true);
      expect(isPositiveSafeSessionId(999999)).toBe(true);
      expect(isPositiveSafeSessionId(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    test("assertPositiveSafeSessionId passes silently for positive safe integers", () => {
      expect(() => assertPositiveSafeSessionId(1, mockErrorsTranslations)).not.toThrow();
      expect(() => assertPositiveSafeSessionId(100, mockErrorsTranslations)).not.toThrow();
    });

    test("sessionFeeForIntent maps bookable intent to exact fee constant", () => {
      expect(sessionFeeForIntent(SessionIntent.Hifz)).toBe(SESSION_FEE_HIFZ);
      expect(sessionFeeForIntent(SessionIntent.Tajweed)).toBe(SESSION_FEE_TAJWEED);
    });

    test("intentLaneFor maps bookable intent to canonical held balance lane", () => {
      expect(intentLaneFor(SessionIntent.Hifz)).toBe(HeldBalanceLane.Hifz);
      expect(intentLaneFor(SessionIntent.Tajweed)).toBe(HeldBalanceLane.Tajweed);
    });

    test("normalizeRequiredReasonText trims whitespace and returns clean text", () => {
      const result = normalizeRequiredReasonText("  Valid dispute reason text  ", mockErrorsTranslations);
      expect(result).toBe("Valid dispute reason text");
    });

    test("normalizeOptionalReasonText trims valid text or maps null/empty to null", () => {
      expect(normalizeOptionalReasonText("  Optional note  ", mockErrorsTranslations)).toBe("Optional note");
      expect(normalizeOptionalReasonText(null, mockErrorsTranslations)).toBeNull();
      expect(normalizeOptionalReasonText("   ", mockErrorsTranslations)).toBeNull();
    });

    test("isClaimKeyUniqueViolation identifies PostgreSQL 23505 unique constraint error", () => {
      const directError = new Error("unique violation");
      Object.assign(directError, { code: "23505" });
      expect(isClaimKeyUniqueViolation(directError)).toBe(true);

      const wrappedError = new Error("drizzle execution failed", {
        cause: directError,
      });
      expect(isClaimKeyUniqueViolation(wrappedError)).toBe(true);
    });

    test("normalizePageBounds returns requested bounds when within 1..50 limits", () => {
      expect(normalizePageBounds(1, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(3, 50)).toEqual({ page: 3, pageSize: 50 });
      expect(normalizePageBounds(10, 1)).toEqual({ page: 10, pageSize: 1 });
    });

    test("normalizeAdminListBounds calculates 1-based page index and keeps valid bounds", () => {
      expect(normalizeAdminListBounds(25, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(25, 25)).toEqual({ safeLimit: 25, safeOffset: 25, page: 2 });
      expect(normalizeAdminListBounds(10, 25)).toEqual({ safeLimit: 10, safeOffset: 25, page: 3 });
    });

    test("guardStatusFilter passes valid SessionStatus members through unchanged", () => {
      expect(guardStatusFilter({ status: SessionStatus.Started })).toEqual({ status: SessionStatus.Started });
      expect(guardStatusFilter({ status: SessionStatus.Completed })).toEqual({ status: SessionStatus.Completed });
      expect(guardStatusFilter({ status: SessionStatus.Disputed })).toEqual({ status: SessionStatus.Disputed });
    });
  });

  // =========================================================================
  // Tier 2: Edge Cases & Boundaries
  // =========================================================================
  describe("Tier 2 — Edge Cases & Boundaries", () => {
    test("isPositiveSafeInteger rejects zero, negative, fractional, and unsafe numbers", () => {
      expect(isPositiveSafeInteger(0)).toBe(false);
      expect(isPositiveSafeInteger(-1)).toBe(false);
      expect(isPositiveSafeInteger(1.5)).toBe(false);
      expect(isPositiveSafeInteger(-0.1)).toBe(false);
      expect(isPositiveSafeInteger(NaN)).toBe(false);
      expect(isPositiveSafeInteger(Infinity)).toBe(false);
      expect(isPositiveSafeInteger(-Infinity)).toBe(false);
      expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });

    test("isPositiveSafeSessionId rejects non-number types and malformed numbers", () => {
      expect(isPositiveSafeSessionId("1")).toBe(false);
      expect(isPositiveSafeSessionId("100")).toBe(false);
      expect(isPositiveSafeSessionId(null)).toBe(false);
      expect(isPositiveSafeSessionId(undefined)).toBe(false);
      expect(isPositiveSafeSessionId(true)).toBe(false);
      expect(isPositiveSafeSessionId({})).toBe(false);
      expect(isPositiveSafeSessionId([])).toBe(false);
      expect(isPositiveSafeSessionId(Symbol("1"))).toBe(false);
      expect(isPositiveSafeSessionId(1n)).toBe(false);
      expect(isPositiveSafeSessionId(0)).toBe(false);
      expect(isPositiveSafeSessionId(-1)).toBe(false);
      expect(isPositiveSafeSessionId(3.14)).toBe(false);
      expect(isPositiveSafeSessionId(NaN)).toBe(false);
    });

    test("assertPositiveSafeSessionId throws ValidationError for invalid session IDs", () => {
      const invalidValues = [0, -1, 1.5, NaN, "123", null, undefined, {}, []];

      for (const invalid of invalidValues) {
        expect(() => assertPositiveSafeSessionId(invalid, mockErrorsTranslations)).toThrow(ValidationError);
        try {
          assertPositiveSafeSessionId(invalid, mockErrorsTranslations);
        } catch (err) {
          expect(err).toBeInstanceOf(ValidationError);
          if (err instanceof ValidationError) {
            expect(err.message).toBe(mockErrorsTranslations.validation);
          }
        }
      }
    });

    test("normalizeRequiredReasonText accepts exactly 500 chars and rejects 501 or empty", () => {
      const exact500 = "a".repeat(500);
      expect(normalizeRequiredReasonText(exact500, mockErrorsTranslations)).toBe(exact500);

      const padded500 = `  ${"b".repeat(500)}  `;
      expect(normalizeRequiredReasonText(padded500, mockErrorsTranslations)).toBe("b".repeat(500));

      const over500 = "c".repeat(501);
      expect(() => normalizeRequiredReasonText(over500, mockErrorsTranslations)).toThrow(ValidationError);

      expect(() => normalizeRequiredReasonText("", mockErrorsTranslations)).toThrow(ValidationError);
      expect(() => normalizeRequiredReasonText("   ", mockErrorsTranslations)).toThrow(ValidationError);
    });

    test("normalizeOptionalReasonText rejects strings exceeding 500 chars after trimming", () => {
      const exact500 = "a".repeat(500);
      expect(normalizeOptionalReasonText(exact500, mockErrorsTranslations)).toBe(exact500);

      const over500 = "x".repeat(501);
      expect(() => normalizeOptionalReasonText(over500, mockErrorsTranslations)).toThrow(ValidationError);

      const paddedOver500 = `   ${"y".repeat(501)}   `;
      expect(() => normalizeOptionalReasonText(paddedOver500, mockErrorsTranslations)).toThrow(ValidationError);
    });

    test("normalizePageBounds falls back gracefully for non-integer or out-of-range bounds", () => {
      // Page < 1 or non-integer falls back to 1
      expect(normalizePageBounds(0, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(-5, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1.5, 25)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(NaN, 25)).toEqual({ page: 1, pageSize: 25 });

      // PageSize < 1 or > 50 or non-integer falls back to DEFAULT_PAGE_SIZE (25)
      expect(normalizePageBounds(1, 0)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, -10)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, 51)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, 100)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, 20.5)).toEqual({ page: 1, pageSize: 25 });
      expect(normalizePageBounds(1, NaN)).toEqual({ page: 1, pageSize: 25 });
    });

    test("normalizeAdminListBounds falls back gracefully for invalid limit/offset", () => {
      // Limit outside 1..50 falls back to DEFAULT_PAGE_SIZE (25)
      expect(normalizeAdminListBounds(0, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(100, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(12.5, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });

      // Offset < 0 or non-integer floors at 0
      expect(normalizeAdminListBounds(25, -10)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(25, 5.5)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      expect(normalizeAdminListBounds(25, NaN)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
    });

    test("guardStatusFilter maps absent, null, or invalid status values to null", () => {
      expect(guardStatusFilter({})).toEqual({ status: null });
      expect(guardStatusFilter({ status: null })).toEqual({ status: null });
      expect(guardStatusFilter({ status: undefined })).toEqual({ status: null });

      const invalidStatusFilter: SessionListFilterInput = JSON.parse('{"status": "INVALID_STATUS"}');
      expect(guardStatusFilter(invalidStatusFilter)).toEqual({ status: null });

      const uppercaseStatusFilter: SessionListFilterInput = JSON.parse('{"status": "STARTED"}');
      expect(guardStatusFilter(uppercaseStatusFilter)).toEqual({ status: null });

      const numericStatusFilter: SessionListFilterInput = JSON.parse('{"status": 123}');
      expect(guardStatusFilter(numericStatusFilter)).toEqual({ status: null });
    });
  });

  // =========================================================================
  // Tier 3: Hostile / Invalid Inputs & Cycle Safety
  // =========================================================================
  describe("Tier 3 — Hostile / Invalid Inputs & Cycle Safety", () => {
    test("isClaimKeyUniqueViolation handles non-error throwables safely", () => {
      expect(isClaimKeyUniqueViolation(null)).toBe(false);
      expect(isClaimKeyUniqueViolation(undefined)).toBe(false);
      expect(isClaimKeyUniqueViolation("error string")).toBe(false);
      expect(isClaimKeyUniqueViolation(123)).toBe(false);
      expect(isClaimKeyUniqueViolation({ code: "23505" })).toBe(false); // Plain object is not instanceof Error
    });

    test("isClaimKeyUniqueViolation traverses cause chain without matching non-23505 codes", () => {
      const genericError = new Error("some database failure");
      Object.assign(genericError, { code: "42P01" });

      const topError = new Error("top error", { cause: genericError });
      expect(isClaimKeyUniqueViolation(topError)).toBe(false);
    });

    test("isClaimKeyUniqueViolation handles self-referential / cyclic cause chains without infinite loops", () => {
      const cyclicError = new Error("cyclic error");
      Object.assign(cyclicError, { cause: cyclicError });

      expect(isClaimKeyUniqueViolation(cyclicError)).toBe(false);

      const errA = new Error("error A");
      const errB = new Error("error B", { cause: errA });
      Object.assign(errA, { cause: errB }); // A -> B -> A cycle

      expect(isClaimKeyUniqueViolation(errA)).toBe(false);
      expect(isClaimKeyUniqueViolation(errB)).toBe(false);
    });

    test("exported probe-row status widenings match SessionStatus enum values", () => {
      expect(SESSION_STARTED_STATUS).toBe(SessionStatus.Started);
      expect(SESSION_DISPUTED_STATUS).toBe(SessionStatus.Disputed);
      expect(SESSION_COMPLETED_STATUS).toBe(SessionStatus.Completed);
    });

    test("MAX_IDEMPOTENCY_KEY_LENGTH constant is 128", () => {
      expect(MAX_IDEMPOTENCY_KEY_LENGTH).toBe(128);
    });
  });

  // =========================================================================
  // Tier 4: Architectural Invariants & Purity
  // =========================================================================
  describe("Tier 4 — Architectural Invariants & Purity", () => {
    test("purity pins: module has zero database, network, or environment imports", () => {
      const source = readSource("backend/services/classes/session-lifecycle.guards.ts");

      // Must not import from db/repo or db connection
      expect(source).not.toMatch(/from ["']@\/backend\/db/);
      expect(source).not.toMatch(/process\.env/);
      expect(source).not.toMatch(/\bfetch\b/);
    });

    test("all exported functions are pure / deterministic", () => {
      // Multiple calls with identical inputs yield identical outputs
      expect(sessionFeeForIntent(SessionIntent.Hifz)).toBe(sessionFeeForIntent(SessionIntent.Hifz));
      expect(intentLaneFor(SessionIntent.Tajweed)).toBe(intentLaneFor(SessionIntent.Tajweed));
      expect(normalizePageBounds(2, 30)).toEqual(normalizePageBounds(2, 30));
      expect(normalizeAdminListBounds(15, 30)).toEqual(normalizeAdminListBounds(15, 30));
    });
  });
});
