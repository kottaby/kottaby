/**
 * Plan Catalog Seeder — seeds initial demo subscription plans.
 *
 * Consumes PlanCatalogService exclusively (zero raw DB imports).
 * Idempotent via title matching: existing plans are re-read on every pass and
 * their balance lane is reconciled to the declared spec, so rows seeded before
 * lanes were introduced converge without duplicate inserts.
 *
 * Actor attribution: plan mutations are admin-gated (the service re-asserts
 * the acting admin against the `users` table before any write), so every
 * mutation this seeder mints is attributed to a real admin-role user. The
 * actor id is REQUIRED and supplied by the master seed controller
 * (`seeds/index.ts`) via controller-context threading after the users step
 * has provisioned the demo admin — this seeder never authenticates or
 * provisions users itself (single-domain rule in seeds/AGENTS.md).
 */

import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { ConflictError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { PlanCatalogService } from "@/backend/services/billing/plan-catalog.service";
import type { DBTransaction, PlanReturnType, PlanSubmitInput } from "@/backend/types";

export interface DemoPlanSpec extends PlanSubmitInput {
  /** Balance lane this demo plan must carry; reconciled on every seed pass. */
  readonly balanceLane: SubscriptionCreditLane;
  readonly shouldBeActive?: boolean;
}

export const INITIAL_DEMO_PLANS: readonly DemoPlanSpec[] = [
  {
    title: "Hifz Jadid (Memorization)",
    sessionCount: 12,
    price: "450.00",
    currency: "EGP",
    intervalDays: 30,
    balanceLane: SubscriptionCreditLane.Hifz,
    shouldBeActive: true,
  },
  {
    title: "Tajweed & Tilawa",
    sessionCount: 8,
    price: "300.00",
    currency: "EGP",
    intervalDays: 30,
    balanceLane: SubscriptionCreditLane.Tajweed,
    shouldBeActive: true,
  },
  {
    // New-teacher verification sessions assess existing recitation instead of
    // teaching new memorization or recitation rules, so they draw the review
    // lane like the other assessment-style products below.
    title: "New Teacher Verification & Evaluation Plan",
    sessionCount: 5,
    price: "150.00",
    currency: "EGP",
    intervalDays: 14,
    balanceLane: SubscriptionCreditLane.Reviews,
    shouldBeActive: true,
  },
  {
    // Trial sessions are assessment-style: they sample and evaluate a
    // student's current recitation, which maps onto the review lane (no
    // dedicated trial lane exists in the credit-lane vocabulary).
    title: "Legacy Trial Plan",
    sessionCount: 4,
    price: "100.00",
    currency: "EGP",
    intervalDays: 7,
    balanceLane: SubscriptionCreditLane.Reviews,
    shouldBeActive: false,
  },
] as const;

/**
 * Reads the existing plan matching `title` from a fresh admin listing.
 * Used by the create-race recovery path below.
 */
async function findPlanByTitle(title: string, locale: string, tx?: DBTransaction): Promise<PlanReturnType | undefined> {
  const plans = await PlanCatalogService.listForAdmin({ includeInactive: true }, locale, tx);
  return plans.find(p => p.title === title);
}

export async function seedOrGet(locale = "en", adminActorId: number, tx?: DBTransaction): Promise<PlanReturnType[]> {
  logger.info("Seeding plan catalog via PlanCatalogService...");

  const actorId = adminActorId;

  const existingPlans = await PlanCatalogService.listForAdmin({ includeInactive: true }, locale, tx);
  const existingByTitle = new Map(existingPlans.map(p => [p.title, p]));

  const results: PlanReturnType[] = [];

  await INITIAL_DEMO_PLANS.reduce<Promise<void>>(async (previous, planSpec) => {
    await previous;
    let plan = existingByTitle.get(planSpec.title);
    if (!plan) {
      try {
        plan = await PlanCatalogService.createPlan(
          {
            title: planSpec.title,
            sessionCount: planSpec.sessionCount,
            price: planSpec.price,
            currency: planSpec.currency,
            intervalDays: planSpec.intervalDays,
            balanceLane: planSpec.balanceLane,
          },
          actorId,
          locale,
          tx
        );
        logger.info(`Seeded new plan "${plan.title}" (ID: ${plan.id})`);
      } catch (error) {
        // Race recovery (seeds/AGENTS.md "seed or get" pattern): a concurrent
        // seed process may create the same title between our look and create.
        // Only the expected duplicate-title ConflictError is absorbed — any
        // other failure keeps propagating to `runAllSeeds`.
        if (!(error instanceof ConflictError)) {
          throw error;
        }
        if (tx) {
          // A uniqueness violation aborts the supplied transaction (any
          // further statement would fail with 25P02), and a single
          // transaction cannot race itself — true cross-process seeding
          // always runs without a tx. Recovery is therefore only meaningful
          // (and only possible) on the pooled non-tx path; fail fast with
          // the real ConflictError instead of a confusing aborted-tx error.
          throw error;
        }
        logger.warn(`Seed race on plan "${planSpec.title}" — recovering via re-read`);
        const raced = await findPlanByTitle(planSpec.title, locale, tx);
        if (!raced) {
          throw error;
        }
        plan = raced;
      }
    }

    if (planSpec.shouldBeActive === false && plan.isActive) {
      plan = await PlanCatalogService.setPlanActiveStatus(plan.id, false, actorId, locale, tx);
      logger.info(`Deactivated plan "${plan.title}" (ID: ${plan.id})`);
    }

    if (plan.balanceLane !== planSpec.balanceLane) {
      plan = await PlanCatalogService.updatePlan(plan.id, { balanceLane: planSpec.balanceLane }, actorId, locale, tx);
      logger.info(`Reconciled balance lane of plan "${plan.title}" (ID: ${plan.id}) to "${planSpec.balanceLane}"`);
    }

    results.push(plan);
  }, Promise.resolve());

  return results;
}
