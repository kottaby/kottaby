/**
 * Plan Catalog Seeder Tests
 *
 * Verifies:
 *  - Demo catalog seeding produces the expected plans.
 *  - Verification plan identity + session count are pinned to the shared
 *    verification-plan constants (seed spec AND persisted row).
 *  - Every demo plan carries its declared balance lane.
 *  - Idempotency: Multiple seed passes produce no duplicate rows.
 *  - Deactivated demo plan is correctly marked inactive.
 */

import { describe, expect, test } from "bun:test";
import { INITIAL_DEMO_PLANS, seedOrGet } from "@/backend/db/seeds/billing/seed-plans";
import { createTestUser } from "@/backend/db/test/entity-setup";
import { runInRollback } from "@/backend/db/test/test-utils";
import { PlanCatalogService } from "@/backend/services/billing/plan-catalog.service";
import {
  VERIFICATION_PLAN_SESSION_COUNT,
  VERIFICATION_PLAN_TITLE,
} from "@/shared/constants/verification-plan.constants";

describe("Plan Catalog Seeding", () => {
  test("seedOrGet creates all demo plans and is idempotent on repeat execution", async () => {
    await runInRollback(async tx => {
      // Catalog mutations are admin-gated: the seeder attributes every minted
      // plan to a real admin-role user row supplied by the caller when an
      // external transaction is in scope.
      const admin = await createTestUser(tx, { role: "admin" });

      // First pass: creates all demo plans
      const firstPass = await seedOrGet("en", admin.id, tx);
      expect(firstPass).toHaveLength(INITIAL_DEMO_PLANS.length);

      // Verify the verification plan row carries the shared-constant identity
      const verificationPlan = firstPass.find(p => p.title === VERIFICATION_PLAN_TITLE);
      expect(verificationPlan).toBeDefined();
      expect(verificationPlan?.title).toBe(VERIFICATION_PLAN_TITLE);
      expect(verificationPlan?.sessionCount).toBe(VERIFICATION_PLAN_SESSION_COUNT);
      expect(verificationPlan?.sessionCount).toBe(5);
      expect(verificationPlan?.isActive).toBe(true);

      // Verify deactivated demo plan
      const deactivatedPlan = firstPass.find(p => p.title === "Legacy Trial Plan");
      expect(deactivatedPlan).toBeDefined();
      expect(deactivatedPlan?.isActive).toBe(false);
      expect(deactivatedPlan?.deactivatedAt).not.toBeNull();

      // Second pass: must be idempotent and return identical plans without duplicate inserts
      const secondPass = await seedOrGet("en", admin.id, tx);
      expect(secondPass).toHaveLength(INITIAL_DEMO_PLANS.length);
      expect(secondPass.map(p => p.id)).toEqual(firstPass.map(p => p.id));

      const allPlans = await PlanCatalogService.listForAdmin({ includeInactive: true }, "en", tx);
      for (const demoPlan of INITIAL_DEMO_PLANS) {
        const found = allPlans.find(p => p.title === demoPlan.title);
        expect(found).toBeDefined();
        expect(found?.balanceLane).toBe(demoPlan.balanceLane);
      }
    });
  });

  test("verification plan identity is sourced from the shared constants (drift pin)", () => {
    // Seed-spec pin (no DB): the demo catalog spec itself sources the
    // verification plan's title and session count from the shared constants,
    // so the seeder and the server-side title resolution can never drift.
    const verificationSpec = INITIAL_DEMO_PLANS.find(p => p.title === VERIFICATION_PLAN_TITLE);
    expect(verificationSpec).toBeDefined();
    expect(verificationSpec?.sessionCount).toBe(VERIFICATION_PLAN_SESSION_COUNT);
    expect(VERIFICATION_PLAN_SESSION_COUNT).toBe(5);
  });
});
