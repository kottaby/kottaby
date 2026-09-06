/**
 * Unit test suite for `student-handshake.helpers.ts`.
 *
 * Tests the pure governance predicate `isGovernanceExcludedFromDiscovery`
 * without database or network I/O.
 */

import { describe, expect, test } from "bun:test";
import { isGovernanceExcludedFromDiscovery } from "@/backend/services/students/student-handshake.helpers";

type GovernanceInputType = Parameters<typeof isGovernanceExcludedFromDiscovery>[0];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function buildGovernanceInput(overrides: Partial<GovernanceInputType> = {}): GovernanceInputType {
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

describe("isGovernanceExcludedFromDiscovery (pure predicate unit tests)", () => {
  describe("Tier 1: Branch Coverage & Clean Governance", () => {
    test("clean governance (active, non-deleted, non-blocked, non-suspended) is discoverable (returns false)", () => {
      const now = new Date();
      const input = buildGovernanceInput();
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(false);
    });

    test("suspended=false ignores leftover suspendedAt or suspendedPeriodDays and stays discoverable", () => {
      const now = new Date();
      const input = buildGovernanceInput({
        suspended: false,
        suspendedAt: new Date(now.getTime() - HOUR_MS),
        suspendedPeriodDays: 30,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(false);
    });

    test("deleted student (isDeleted=true) is excluded (returns true)", () => {
      const now = new Date();
      const input = buildGovernanceInput({ isDeleted: true });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });

    test("blocked student (isBlocked=true) is excluded (returns true)", () => {
      const now = new Date();
      const input = buildGovernanceInput({ isBlocked: true });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });

    test("deleted AND blocked student is excluded (returns true)", () => {
      const now = new Date();
      const input = buildGovernanceInput({ isDeleted: true, isBlocked: true });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });
  });

  describe("Tier 2: Fail-Closed Behavior for Incomplete or Corrupt Governance Data", () => {
    test("suspended=true with missing suspendedAt is excluded (fail-closed)", () => {
      const now = new Date();
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: null,
        suspendedPeriodDays: 30,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });

    test("suspended=true with missing suspendedPeriodDays is excluded (fail-closed)", () => {
      const now = new Date();
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: now,
        suspendedPeriodDays: null,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });

    test("suspended=true with both missing start and period is excluded (fail-closed)", () => {
      const now = new Date();
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: null,
        suspendedPeriodDays: null,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });

    test("suspended=true with zero period (suspendedPeriodDays=0) is excluded (fail-closed)", () => {
      const now = new Date();
      const startedInPast = new Date(now.getTime() - HOUR_MS);
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: startedInPast,
        suspendedPeriodDays: 0,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });

    test("suspended=true with negative period (suspendedPeriodDays=-7) is excluded (fail-closed)", () => {
      const now = new Date();
      const startedInPast = new Date(now.getTime() - HOUR_MS);
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: startedInPast,
        suspendedPeriodDays: -7,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });
  });

  describe("Tier 3: Active vs. Lapsed Suspension Windows & Exact Boundaries", () => {
    test("actively suspended student (window end strictly after now) is excluded", () => {
      const now = new Date();
      const startedOneHourAgo = new Date(now.getTime() - HOUR_MS);
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: startedOneHourAgo,
        suspendedPeriodDays: 30,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });

    test("lapsed suspension (window end strictly before now) is discoverable (returns false)", () => {
      const now = new Date();
      const started30DaysAgo = new Date(now.getTime() - 30 * DAY_MS);
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: started30DaysAgo,
        suspendedPeriodDays: 1, // ended 29 days ago
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(false);
    });

    test("window ending EXACTLY at the evaluation instant (endsAt == now) is considered lapsed (returns false)", () => {
      const now = new Date(1_700_000_000_000);
      const startedOneDayAgo = new Date(now.getTime() - DAY_MS);
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: startedOneDayAgo,
        suspendedPeriodDays: 1, // endsAt = startedOneDayAgo + 1 day = now
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(false);
    });

    test("window ending 1 millisecond after evaluation instant (endsAt = now + 1ms) is actively suspended (returns true)", () => {
      const now = new Date(1_700_000_000_000);
      const startedOneDayAgoMinus1ms = new Date(now.getTime() - DAY_MS + 1);
      const input = buildGovernanceInput({
        suspended: true,
        suspendedAt: startedOneDayAgoMinus1ms,
        suspendedPeriodDays: 1, // endsAt = now + 1ms
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(true);
    });
  });

  describe("Tier 4: Input Shape Resilience", () => {
    test("ignores extra fields such as fullName riding along in the discovery row shape", () => {
      const now = new Date();
      const input = buildGovernanceInput({
        fullName: "Jane Doe - Unused Field",
        isDeleted: false,
        isBlocked: false,
        suspended: false,
      });
      expect(isGovernanceExcludedFromDiscovery(input, now)).toBe(false);
    });
  });
});
