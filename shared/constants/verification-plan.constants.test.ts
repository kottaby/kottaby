/**
 * Verification plan identity constants — pure unit tests.
 * NO DB, NO network, NO env reads.
 *
 * Pins the canonical catalog identity of the teacher verification plan:
 * the exact title string server-side plan resolution matches against, and
 * the granted session count. Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts shared/constants/verification-plan.constants.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import {
  VERIFICATION_PLAN_SESSION_COUNT,
  VERIFICATION_PLAN_TITLE,
} from "@/shared/constants/verification-plan.constants";

describe("verification plan identity constants", () => {
  test("title is exactly the canonical catalog title", () => {
    expect(VERIFICATION_PLAN_TITLE).toBe("New Teacher Verification & Evaluation Plan");
    expect(typeof VERIFICATION_PLAN_TITLE).toBe("string");
  });

  test("session count is exactly 5", () => {
    expect(VERIFICATION_PLAN_SESSION_COUNT).toBe(5);
    expect(Number.isSafeInteger(VERIFICATION_PLAN_SESSION_COUNT)).toBe(true);
  });
});
