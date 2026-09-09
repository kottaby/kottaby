/**
 * Plan Catalog Seeder — seeds initial demo subscription plans.
 *
 * Implements REQ-019, REQ-021.
 * Consumes PlanCatalogService exclusively (zero raw DB imports).
 * Idempotent via title matching.
 *
 * Actor attribution: plan mutations are admin-gated (the service re-asserts
 * the acting admin against the `users` table before any write), so every
 * mutation this seeder mints is attributed to a real admin-role user. The
 * actor is supplied explicitly (controller-context threading) or resolved
 * from the deterministic demo-admin identity provisioned by the users seed
 * step, which always runs before this seeder in `runAllSeeds`.
 */

import { loadSeedConfig } from "@/backend/db/seeds/lib";
import { INITIAL_DEMO_USERS } from "@/backend/db/seeds/users";
import { ConflictError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { AuthService, RegistrationService } from "@/backend/services";
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

/**
 * Reads the existing plan matching `title` from a fresh admin listing.
 * Used by the create-race recovery path below.
 */
async function findPlanByTitle(title: string, locale: string, tx?: DBTransaction): Promise<PlanReturnType | undefined> {
  const plans = await PlanCatalogService.listForAdmin({ includeInactive: true }, locale, tx);
  return plans.find(p => p.title === title);
}

/**
 * Resolves the admin actor id attributed to every catalog mutation this
 * seeder mints. The gate requires the id to resolve to a real admin-role
 * user row, so the actor is located (never invented) by authenticating
 * against the deterministic demo-admin identity that `seed-users.ts`
 * provisions — same email spec, same seed credential from `loadSeedConfig`.
 * On a fresh standalone database where the users step has not run, the
 * admin is provisioned through the same privileged entry point
 * `seed-users.ts` uses, so the row is identical to the one the users step
 * would create.
 */
async function resolveSeedAdminActorId(locale: string): Promise<number> {
  const seedConfig = loadSeedConfig();
  const adminSpec = INITIAL_DEMO_USERS.find(spec => spec.role === "admin");
  if (!adminSpec) {
    throw new Error("seed-plans: INITIAL_DEMO_USERS carries no admin spec — cannot resolve a gated actor");
  }

  try {
    const session = await AuthService.login(adminSpec.email, seedConfig.defaultAdminCredential, locale);
    return session.user.id;
  } catch (error) {
    logger.warn(
      `seed-plans: demo admin not resolvable by seed credential (${error instanceof Error ? error.message : "unknown"}) — provisioning via createAdminUser`
    );
  }

  const admin = await RegistrationService.createAdminUser(
    {
      fullName: adminSpec.fullName,
      email: adminSpec.email,
      phone: adminSpec.phone,
      country: adminSpec.country,
      password: seedConfig.defaultAdminCredential,
      gender: adminSpec.gender,
      role: "admin",
    },
    locale
  );
  return admin.id;
}

export async function seedOrGet(locale = "en", adminActorId?: number, tx?: DBTransaction): Promise<PlanReturnType[]> {
  logger.info("Seeding plan catalog via PlanCatalogService...");

  // An explicitly supplied actorId wins (controller-context threading per
  // seeds/AGENTS.md). Callers supplying an external transaction (tests) MUST
  // provision their own admin inside it and pass the id explicitly — the
  // credential fallback reads committed rows only, which a rollback-scoped
  // transaction cannot observe.
  const actorId = adminActorId ?? (tx === undefined ? await resolveSeedAdminActorId(locale) : undefined);
  if (typeof actorId !== "number") {
    throw new Error(
      "seedOrGet: adminActorId is required when an external transaction is supplied — provision an admin-role user inside the transaction and pass its id"
    );
  }

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

    results.push(plan);
  }, Promise.resolve());

  return results;
}
