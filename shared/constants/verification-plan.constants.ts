/**
 * Verification plan catalog identity constants.
 *
 * Pins the catalog identity of the platform-owned plan a teacher applicant
 * purchases to enter evaluation: the plan is resolved server-side from the
 * ACTIVE plan catalog by its canonical title (client input never carries a
 * plan id), and the seeded catalog row derives its title and session count
 * from these constants so seed data can never drift from what purchase and
 * UI flows expect.
 *
 * Shared-layer isolation: this module imports nothing from @/backend, @/frontend,
 * or @/app. It is safe to import from any layer.
 */

/** Canonical catalog title the verification plan is resolved by. */
export const VERIFICATION_PLAN_TITLE = "New Teacher Verification & Evaluation Plan" as const;

/** Number of 1:1 verification sessions a verification plan purchase grants. */
export const VERIFICATION_PLAN_SESSION_COUNT = 5 as const;
