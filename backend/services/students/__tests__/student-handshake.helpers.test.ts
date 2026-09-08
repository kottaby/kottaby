/**
 * Pure unit tests for student handshake governance helpers.
 *
 * @see backend/services/students/student-handshake.helpers.ts
 */

import { describe, expect, test } from "bun:test";
import { isGovernanceExcludedFromDiscovery } from "@/backend/services/students/student-handshake.helpers";
import type { HandshakeDiscoveryRowType } from "@/backend/types";

type GovernanceInput = Omit<HandshakeDiscoveryRowType, "parentId">;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Helper to construct a `GovernanceInput` object with safe defaults.
 */
function createGovernanceFixture(overrides: Partial<GovernanceInput> = {}): GovernanceInput {
  return {
    fullName: "Test Student",
    isDeleted: false,
    isBlocked: false,
    suspended: false,
    suspendedAt: null,
    suspendedPeriodDays: null,
    ...overrides,
  };
}

describe("isGovernanceExcludedFromDiscovery", () => {
  describe("Clean / non-governed states", () => {
    test("returns false when student is neither deleted, blocked, nor suspended", () => {
      const now = new Date();
      const fixture = createGovernanceFixture();
      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(false);
    });

    test("returns false when suspended is false despite stale suspendedAt / suspendedPeriodDays data", () => {
      const now = new Date();
      const fixture = createGovernanceFixture({
        suspended: false,
        suspendedAt: new Date(now.getTime() - HOUR_MS),
        suspendedPeriodDays: 30,
      });
      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(false);
    });

    test("handles fullName variants (standard, empty, Arabic, special chars) without impacting governance outcome", () => {
      const now = new Date();
      const names = ["John Doe", "", "طالب تجريبي", "Student #123! @#$%^&*()"];
      for (const fullName of names) {
        const fixture = createGovernanceFixture({ fullName });
        expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(false);
      }
    });
  });

  describe("Deletion & Blocking exclusions", () => {
    test("returns true when student is soft-deleted (isDeleted: true)", () => {
      const now = new Date();
      const fixture = createGovernanceFixture({ isDeleted: true });
      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns true when student is blocked (isBlocked: true)", () => {
      const now = new Date();
      const fixture = createGovernanceFixture({ isBlocked: true });
      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns true when student is both soft-deleted and blocked", () => {
      const now = new Date();
      const fixture = createGovernanceFixture({ isDeleted: true, isBlocked: true });
      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns true when student is deleted or blocked even if suspension is active", () => {
      const now = new Date();
      const deletedAndSuspended = createGovernanceFixture({
        isDeleted: true,
        suspended: true,
        suspendedAt: new Date(now.getTime() - HOUR_MS),
        suspendedPeriodDays: 30,
      });
      const blockedAndSuspended = createGovernanceFixture({
        isBlocked: true,
        suspended: true,
        suspendedAt: new Date(now.getTime() - HOUR_MS),
        suspendedPeriodDays: 30,
      });

      expect(isGovernanceExcludedFromDiscovery(deletedAndSuspended, now)).toBe(true);
      expect(isGovernanceExcludedFromDiscovery(blockedAndSuspended, now)).toBe(true);
    });
  });

  describe("Suspension active vs lapsed window evaluation", () => {
    test("returns true when suspension window is currently active (endsAt strictly after now)", () => {
      const now = new Date(1_700_000_000_000);
      const suspendedAt = new Date(now.getTime() - HOUR_MS);
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt,
        suspendedPeriodDays: 1, // ends 23 hours after `now`
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns false when suspension window has lapsed in the past (endsAt strictly before now)", () => {
      const now = new Date(1_700_000_000_000);
      const suspendedAt = new Date(now.getTime() - 30 * DAY_MS);
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt,
        suspendedPeriodDays: 1, // ended 29 days before `now`
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(false);
    });

    test("returns false when suspension window ends EXACTLY at the evaluation instant (endsAt === now)", () => {
      const now = new Date(1_700_000_000_000);
      const suspendedAt = new Date(now.getTime() - 1 * DAY_MS);
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt,
        suspendedPeriodDays: 1, // ends exactly at `now`
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(false);
    });
  });

  describe("Fail-closed behavior for incomplete or corrupt suspension data", () => {
    test("returns true (fails closed) when suspended is true but suspendedAt is null", () => {
      const now = new Date();
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt: null,
        suspendedPeriodDays: 30,
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns true (fails closed) when suspended is true but suspendedPeriodDays is null", () => {
      const now = new Date();
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt: new Date(now.getTime() - HOUR_MS),
        suspendedPeriodDays: null,
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns true (fails closed) when suspended is true and both suspendedAt and suspendedPeriodDays are null", () => {
      const now = new Date();
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt: null,
        suspendedPeriodDays: null,
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns true (fails closed) when suspendedPeriodDays is 0 (zero duration)", () => {
      const now = new Date();
      const suspendedAt = new Date(now.getTime() - HOUR_MS);
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt,
        suspendedPeriodDays: 0,
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });

    test("returns true (fails closed) when suspendedPeriodDays is negative", () => {
      const now = new Date();
      const suspendedAt = new Date(now.getTime() - HOUR_MS);
      const fixture = createGovernanceFixture({
        suspended: true,
        suspendedAt,
        suspendedPeriodDays: -7,
      });

      expect(isGovernanceExcludedFromDiscovery(fixture, now)).toBe(true);
    });
  });
});
