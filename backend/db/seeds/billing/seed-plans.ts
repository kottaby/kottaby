/**
 * Plan Catalog Seeder — seeds initial demo subscription plans.
 *
 * Implements REQ-019, REQ-021.
 * Consumes PlanCatalogService exclusively (zero raw DB imports).
 * Idempotent via title matching.
 */

import { logger } from "@/backend/lib/logger";
import { PlanCatalogService } from "@/backend/services/billing/plan-catalog.service";
import type { DBTransaction, PlanReturnType, PlanSubmitInput } from "@/backend/types";

export interface DemoPlanSpec extends PlanSubmitInput {
  readonly shouldBeActive?: boolean;
}

export const INITIAL_DEMO_PLANS: readonly DemoPlanSpec[] = [
  {
    title: "Hifz Jadid (Memorization)",
    sessionCount: 12,
    price: "450.00",
    currency: "EGP",
    intervalDays: 30,
    shouldBeActive: true,
  },
  {
    title: "Tajweed & Tilawa",
    sessionCount: 8,
    price: "300.00",
    currency: "EGP",
    intervalDays: 30,
    shouldBeActive: true,
  },
  {
    title: "New Teacher Verification & Evaluation Plan",
    sessionCount: 5,
    price: "150.00",
    currency: "EGP",
    intervalDays: 14,
    shouldBeActive: true,
  },
  {
    title: "Legacy Trial Plan",
    sessionCount: 4,
    price: "100.00",
    currency: "EGP",
    intervalDays: 7,
    shouldBeActive: false,
  },
] as const;

export async function seedOrGetPlans(locale = "en", tx?: DBTransaction): Promise<PlanReturnType[]> {
  logger.info("Seeding plan catalog via PlanCatalogService...");
  const existingPlans = await PlanCatalogService.listForAdmin({ includeInactive: true }, locale, tx);
  const existingByTitle = new Map(existingPlans.map(p => [p.title, p]));

  const results: PlanReturnType[] = [];

  await INITIAL_DEMO_PLANS.reduce<Promise<void>>(async (previous, planSpec) => {
    await previous;
    let plan = existingByTitle.get(planSpec.title);
    if (!plan) {
      plan = await PlanCatalogService.createPlan(
        {
          title: planSpec.title,
          sessionCount: planSpec.sessionCount,
          price: planSpec.price,
          currency: planSpec.currency,
          intervalDays: planSpec.intervalDays,
        },
        locale,
        tx
      );
      logger.info(`Seeded new plan "${plan.title}" (ID: ${plan.id})`);
    }

    if (planSpec.shouldBeActive === false && plan.isActive) {
      plan = await PlanCatalogService.setPlanActiveStatus(plan.id, false, locale, tx);
      logger.info(`Deactivated plan "${plan.title}" (ID: ${plan.id})`);
    }

    results.push(plan);
  }, Promise.resolve());

  return results;
}
