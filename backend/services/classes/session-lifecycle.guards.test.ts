/**
 * Unit tests for session-lifecycle.guards.ts
 *
 * Pure unit test suite — NO database connection, NO network.
 *
 * Tiers:
 *  - Tier 1: Branch and statement coverage for all exported pure guards, normalizers, and constants.
 *  - Tier 2: Boundary conditions (lengths, ranges, pagination bounds, status vocabulary).
 *  - Tier 3: Chaos and fuzz (cyclic cause chains, non-Error objects, malformed filter inputs).
 *  - Tier 4: Security and coercion resistance (type coercion traps, unsafe object shapes).
 */

import { describe, expect, test } from "bun:test";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { ValidationError } from "@/backend/lib/errors";
import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  SESSION_COMPLETED_STATUS,
  SESSION_DISPUTED_STATUS,
  SESSION_STARTED_STATUS,
  assertPositiveSafeSessionId,
  guardStatusFilter,
  intentLaneFor,
  isClaimKeyUniqueViolation,
  isPositiveSafeInteger,
  isPositiveSafeSessionId,
  normalizeAdminListBounds,
  normalizeOptionalReasonText,
  normalizePageBounds,
  normalizeRequiredReasonText,
  sessionFeeForIntent,
} from "@/backend/services/classes/session-lifecycle.guards";
import type { SessionListFilterInput } from "@/backend/types";
import { SESSION_FEE_HIFZ, SESSION_FEE_TAJWEED } from "@/shared/constants/session-fees.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const tErrors = getServerTranslations("en").errorsTranslations;

describe("session-lifecycle.guards — Pure Unit Tests", () => {
  // ─── Constants & Fee/Lane Mappings ─────────────────────────────────────
  describe("Constants & Vocabulary Mappings", () => {
    test("Tier 1 — exported constants match expected values and enums", () => {
      expect(MAX_IDEMPOTENCY_KEY_LENGTH).toBe(128);
      expect(SESSION_STARTED_STATUS).toBe(SessionStatus.Started);
      expect(SESSION_DISPUTED_STATUS).toBe(SessionStatus.Disputed);
      expect(SESSION_COMPLETED_STATUS).toBe(SessionStatus.Completed);
    });

    test("Tier 1 — sessionFeeForIntent resolves constant decimal string per intent", () => {
      expect(sessionFeeForIntent(SessionIntent.Hifz)).toBe(SESSION_FEE_HIFZ);
      expect(sessionFeeForIntent(SessionIntent.Tajweed)).toBe(SESSION_FEE_TAJWEED);
    });

    test("Tier 1 — intentLaneFor resolves held balance lane per intent", () => {
      expect(intentLaneFor(SessionIntent.Hifz)).toBe(HeldBalanceLane.Hifz);
      expect(intentLaneFor(SessionIntent.Tajweed)).toBe(HeldBalanceLane.Tajweed);
    });
  });

  // ─── Identifier Guards ────────────────────────────────────────────────
  describe("Identifier Guards (isPositiveSafeInteger, isPositiveSafeSessionId, assertPositiveSafeSessionId)", () => {
    describe("Tier 1 — Happy Paths & Branch Coverage", () => {
      test("isPositiveSafeInteger returns true for valid positive safe integers", () => {
        expect(isPositiveSafeInteger(1)).toBe(true);
        expect(isPositiveSafeInteger(42)).toBe(true);
        expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
      });

      test("isPositiveSafeInteger returns false for 0, negative integers, floats, NaN, and unsafe integers", () => {
        expect(isPositiveSafeInteger(0)).toBe(false);
        expect(isPositiveSafeInteger(-1)).toBe(false);
        expect(isPositiveSafeInteger(-100)).toBe(false);
        expect(isPositiveSafeInteger(1.5)).toBe(false);
        expect(isPositiveSafeInteger(Number.NaN)).toBe(false);
        expect(isPositiveSafeInteger(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      });

      test("isPositiveSafeSessionId validates number type and positive safe integer shape", () => {
        expect(isPositiveSafeSessionId(10)).toBe(true);
        expect(isPositiveSafeSessionId("10")).toBe(false);
        expect(isPositiveSafeSessionId(null)).toBe(false);
        expect(isPositiveSafeSessionId(undefined)).toBe(false);
        expect(isPositiveSafeSessionId({})).toBe(false);
        expect(isPositiveSafeSessionId(0)).toBe(false);
        expect(isPositiveSafeSessionId(-5)).toBe(false);
        expect(isPositiveSafeSessionId(1.23)).toBe(false);
      });

      test("assertPositiveSafeSessionId passes silently for valid id and throws ValidationError for invalid id", () => {
        expect(() => assertPositiveSafeSessionId(100, tErrors)).not.toThrow();

        expect(() => assertPositiveSafeSessionId(0, tErrors)).toThrow(ValidationError);
        expect(() => assertPositiveSafeSessionId(-1, tErrors)).toThrow(ValidationError);
        expect(() => assertPositiveSafeSessionId("abc", tErrors)).toThrow(ValidationError);
        expect(() => assertPositiveSafeSessionId(null, tErrors)).toThrow(ValidationError);
      });
    });

    describe("Tier 2 — Boundary Cases", () => {
      test("boundary around 1 and MAX_SAFE_INTEGER", () => {
        expect(isPositiveSafeInteger(1)).toBe(true);
        expect(isPositiveSafeInteger(0)).toBe(false);
        expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
        expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      });
    });

    describe("Tier 4 — Coercion Resistance & Unsafe Shapes", () => {
      test("non-primitive numbers / boxed numbers / objects with valueOf are rejected without throwing", () => {
        const boxedNumber = Object(5);
        expect(isPositiveSafeSessionId(boxedNumber)).toBe(false);

        const maliciousObj = {
          valueOf() {
            return 10;
          },
        };
        expect(isPositiveSafeSessionId(maliciousObj)).toBe(false);
        expect(() => assertPositiveSafeSessionId(maliciousObj, tErrors)).toThrow(ValidationError);
      });
    });
  });

  // ─── Reason Text Normalizers ──────────────────────────────────────────
  describe("Reason Text Normalizers (normalizeRequiredReasonText, normalizeOptionalReasonText)", () => {
    describe("Tier 1 — Statement & Branch Coverage", () => {
      test("normalizeRequiredReasonText trims and returns valid required text", () => {
        expect(normalizeRequiredReasonText("  Valid reason  ", tErrors)).toBe("Valid reason");
        expect(normalizeRequiredReasonText("SingleWord", tErrors)).toBe("SingleWord");
      });

      test("normalizeRequiredReasonText throws ValidationError for empty or whitespace-only text", () => {
        expect(() => normalizeRequiredReasonText("", tErrors)).toThrow(ValidationError);
        expect(() => normalizeRequiredReasonText("   ", tErrors)).toThrow(ValidationError);
        expect(() => normalizeRequiredReasonText("\t\n", tErrors)).toThrow(ValidationError);
      });

      test("normalizeRequiredReasonText throws ValidationError for text exceeding 500 chars", () => {
        const exact500 = "a".repeat(500);
        expect(normalizeRequiredReasonText(exact500, tErrors)).toBe(exact500);

        const over500 = "a".repeat(501);
        expect(() => normalizeRequiredReasonText(over500, tErrors)).toThrow(ValidationError);
      });

      test("normalizeOptionalReasonText maps null, empty, and whitespace-only text to null", () => {
        expect(normalizeOptionalReasonText(null, tErrors)).toBeNull();
        expect(normalizeOptionalReasonText("", tErrors)).toBeNull();
        expect(normalizeOptionalReasonText("    ", tErrors)).toBeNull();
        expect(normalizeOptionalReasonText("\n\t ", tErrors)).toBeNull();
      });

      test("normalizeOptionalReasonText trims and returns valid optional text", () => {
        expect(normalizeOptionalReasonText("  Optional note  ", tErrors)).toBe("Optional note");
      });

      test("normalizeOptionalReasonText throws ValidationError for text exceeding 500 chars", () => {
        const exact500 = "b".repeat(500);
        expect(normalizeOptionalReasonText(exact500, tErrors)).toBe(exact500);

        const over500 = "b".repeat(501);
        expect(() => normalizeOptionalReasonText(over500, tErrors)).toThrow(ValidationError);
      });
    });

    describe("Tier 2 — Boundary Cases", () => {
      test("500 content chars padded with whitespace trims to 500 chars and succeeds", () => {
        const content500 = "x".repeat(500);
        const padded = `   ${content500}   `;
        expect(normalizeRequiredReasonText(padded, tErrors)).toBe(content500);
        expect(normalizeOptionalReasonText(padded, tErrors)).toBe(content500);
      });

      test("501 content chars padded with whitespace fails validation after trim", () => {
        const content501 = "x".repeat(501);
        const padded = `   ${content501}   `;
        expect(() => normalizeRequiredReasonText(padded, tErrors)).toThrow(ValidationError);
        expect(() => normalizeOptionalReasonText(padded, tErrors)).toThrow(ValidationError);
      });
    });
  });

  // ─── Unique Violation Detector ────────────────────────────────────────
  describe("Unique Violation Detector (isClaimKeyUniqueViolation)", () => {
    describe("Tier 1 — Cause Chain Traversal", () => {
      test("returns true when error itself has code 23505", () => {
        const err = Object.assign(new Error("Unique constraint violation"), { code: "23505" });
        expect(isClaimKeyUniqueViolation(err)).toBe(true);
      });

      test("returns true when cause in chain has code 23505", () => {
        const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
        const drizzleError = new Error("QueryFailed", { cause: pgError });
        const wrapperError = new Error("ServiceError", { cause: drizzleError });

        expect(isClaimKeyUniqueViolation(wrapperError)).toBe(true);
      });

      test("returns false when no error in chain has code 23505", () => {
        const otherPgErr = Object.assign(new Error("foreign key violation"), { code: "23503" });
        const wrapperError = new Error("ServiceError", { cause: otherPgErr });

        expect(isClaimKeyUniqueViolation(wrapperError)).toBe(false);
        expect(isClaimKeyUniqueViolation(new Error("Generic error"))).toBe(false);
        expect(isClaimKeyUniqueViolation(null)).toBe(false);
        expect(isClaimKeyUniqueViolation("string error")).toBe(false);
      });
    });

    describe("Tier 3 — Cycle Safety & Non-Error Hostile Input", () => {
      test("handles cyclic cause chains safely without infinite loops", () => {
        const errA = new Error("Error A");
        const errB = new Error("Error B", { cause: errA });
        // Create cycle: errA -> errB -> errA
        (errA as { cause?: unknown }).cause = errB;

        expect(isClaimKeyUniqueViolation(errA)).toBe(false);

        // Cyclic chain containing 23505
        const err23505 = Object.assign(new Error("Unique error"), { code: "23505", cause: errA });
        (errA as { cause?: unknown }).cause = err23505;

        expect(isClaimKeyUniqueViolation(errB)).toBe(true);
      });

      test("handles non-Error cause objects gracefully", () => {
        const errWithObjectCause = new Error("Parent", { cause: { code: "23505" } });
        // { code: "23505" } is not instanceof Error, so traversal stops
        expect(isClaimKeyUniqueViolation(errWithObjectCause)).toBe(false);
      });
    });
  });

  // ─── List Pagination & Bounds Normalizers ─────────────────────────────
  describe("List Pagination & Bounds Normalizers (normalizePageBounds, normalizeAdminListBounds)", () => {
    describe("Tier 1 — Default & Boundary Normalization", () => {
      test("normalizePageBounds returns given values when within valid ranges", () => {
        expect(normalizePageBounds(1, 10)).toEqual({ page: 1, pageSize: 10 });
        expect(normalizePageBounds(5, 50)).toEqual({ page: 5, pageSize: 50 });
      });

      test("normalizePageBounds falls back for page < 1, float page, or non-integer", () => {
        expect(normalizePageBounds(0, 20)).toEqual({ page: 1, pageSize: 20 });
        expect(normalizePageBounds(-5, 20)).toEqual({ page: 1, pageSize: 20 });
        expect(normalizePageBounds(1.5, 20)).toEqual({ page: 1, pageSize: 20 });
        expect(normalizePageBounds(Number.NaN, 20)).toEqual({ page: 1, pageSize: 20 });
      });

      test("normalizePageBounds falls back to default pageSize (25) when pageSize is out of range 1..50", () => {
        expect(normalizePageBounds(1, 0)).toEqual({ page: 1, pageSize: 25 });
        expect(normalizePageBounds(1, -10)).toEqual({ page: 1, pageSize: 25 });
        expect(normalizePageBounds(1, 51)).toEqual({ page: 1, pageSize: 25 });
        expect(normalizePageBounds(1, 100)).toEqual({ page: 1, pageSize: 25 });
        expect(normalizePageBounds(1, 12.5)).toEqual({ page: 1, pageSize: 25 });
        expect(normalizePageBounds(1, Number.NaN)).toEqual({ page: 1, pageSize: 25 });
      });

      test("normalizeAdminListBounds clamps limit to 1..50 (default 25) and offset to >= 0 (default 0)", () => {
        expect(normalizeAdminListBounds(10, 0)).toEqual({ safeLimit: 10, safeOffset: 0, page: 1 });
        expect(normalizeAdminListBounds(25, 50)).toEqual({ safeLimit: 25, safeOffset: 50, page: 3 });

        // Over limit clamp
        expect(normalizeAdminListBounds(100, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
        // Under limit clamp
        expect(normalizeAdminListBounds(0, 0)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
        // Negative offset floor
        expect(normalizeAdminListBounds(10, -15)).toEqual({ safeLimit: 10, safeOffset: 0, page: 1 });
        // Fractional values
        expect(normalizeAdminListBounds(10.5, -1)).toEqual({ safeLimit: 25, safeOffset: 0, page: 1 });
      });

      test("normalizeAdminListBounds computes 1-based page index correctly", () => {
        expect(normalizeAdminListBounds(10, 0).page).toBe(1);
        expect(normalizeAdminListBounds(10, 9).page).toBe(1);
        expect(normalizeAdminListBounds(10, 10).page).toBe(2);
        expect(normalizeAdminListBounds(10, 25).page).toBe(3);
      });
    });
  });

  // ─── Status Filter Guard ──────────────────────────────────────────────
  describe("Status Filter Guard (guardStatusFilter)", () => {
    describe("Tier 1 — Closed Vocabulary Filtering", () => {
      test("passes through valid SessionStatus members", () => {
        expect(guardStatusFilter({ status: SessionStatus.Scheduled })).toEqual({ status: SessionStatus.Scheduled });
        expect(guardStatusFilter({ status: SessionStatus.Started })).toEqual({ status: SessionStatus.Started });
        expect(guardStatusFilter({ status: SessionStatus.Completed })).toEqual({ status: SessionStatus.Completed });
        expect(guardStatusFilter({ status: SessionStatus.Cancelled })).toEqual({ status: SessionStatus.Cancelled });
        expect(guardStatusFilter({ status: SessionStatus.Disputed })).toEqual({ status: SessionStatus.Disputed });
      });

      test("maps undefined or null status to { status: null }", () => {
        expect(guardStatusFilter({})).toEqual({ status: null });
        expect(guardStatusFilter({ status: undefined })).toEqual({ status: null });
        expect(guardStatusFilter({ status: null })).toEqual({ status: null });
      });

      test("drops out-of-vocabulary or bogus statuses to { status: null }", () => {
        // Untyped / hostile status values
        const baseFilter: SessionListFilterInput = {};
        const bogus1: SessionListFilterInput = Object.assign({}, baseFilter, { status: "expired" });
        expect(guardStatusFilter(bogus1)).toEqual({ status: null });

        const bogus2: SessionListFilterInput = Object.assign({}, baseFilter, { status: "SCHEDULED" });
        expect(guardStatusFilter(bogus2)).toEqual({ status: null });

        const bogus3: SessionListFilterInput = Object.assign({}, baseFilter, { status: 123 });
        expect(guardStatusFilter(bogus3)).toEqual({ status: null });
      });
    });

    describe("Tier 4 — Coercion Resistance in Filters", () => {
      test("objects or arrays as status are dropped to null without throwing", () => {
        const baseFilter: SessionListFilterInput = {};
        const hostileObj: SessionListFilterInput = Object.assign({}, baseFilter, { status: { $ne: "cancelled" } });
        expect(() => guardStatusFilter(hostileObj)).not.toThrow();
        expect(guardStatusFilter(hostileObj)).toEqual({ status: null });
      });
    });
  });
});
