/**
 * `purchaseVerificationPlan` mutation — the teacher applicant's purchase of
 * the platform-owned verification plan (a 5-session catalog plan) through
 * the SAME payment spine as the student purchase.
 *
 * Contract:
 *  - `purchaseVerificationPlan: PurchaseSubscriptionPayload!` — ZERO
 *    arguments on the wire: the purchaser identity is resolved exclusively
 *    from the verified context (`ctx.user.id`) and the plan is resolved
 *    server-side from the ACTIVE catalog by its canonical title. There is
 *    no caller-supplied plan id, amount, or user id of any kind —
 *    BOLA/BOPLA-proof by construction (a probe attempting to pass an
 *    argument dies at schema validation, never at the resolver).
 *  - The payload reuses the student purchase surface's exact shape
 *    (`PurchaseSubscriptionPayload` — subscription + payment + checkout),
 *    so no new Pothos object types are introduced.
 *  - The idempotency key is consumed EXACTLY as captured at the gateway
 *    (`ctx.idempotencyKey`, propagation-only): an absent header arrives as
 *    `null` and the service's own guard rejects it with the localized
 *    VALIDATION error, pre-DB. The key is never re-derived, never trimmed,
 *    and never consultable by any authorization decision.
 *  - DomainErrors (missing-applicant APPLICANT_NOT_FOUND, cooldown
 *    APPLICANT_COOLDOWN_ACTIVE, certified APPLICANT_ALREADY_CERTIFIED,
 *    missing-key VALIDATION, replay DUPLICATE_REQUEST, plan
 *    PLAN_NOT_FOUND) propagate UNCAUGHT to the masking boundary — no
 *    try/catch here.
 *
 * authScopes: `authenticated: true` ONLY — the applicant gate is
 * service-level (`VerificationPurchaseService.purchase` denies every
 * caller without an `applicants` row), which keeps post-conversion
 * re-application reachable for callers whose role has moved on while the
 * effective audience stays identical. Anonymous callers hit the scope's
 * UnauthorizedError (401 channel); the `ctx.user` branch below exists
 * purely for TypeScript narrowing (mirrors the `authenticated` scope's
 * own denial verbatim) and is unreachable in practice.
 *
 * Per `backend/graphql/mutation/AGENTS.md`:
 *  - NO named exports — the root field registers at import time via
 *    `gqlSchemaBuilder.mutationField(...)`.
 *  - Wired via side-effect barrels: `mutation/index.ts` → `gqlSchema.ts`.
 *  - Resolver delegates to the services layer with locale propagation;
 *    no business logic inline. Top-level static imports only.
 */

import { PurchaseSubscriptionPayloadPothosObject } from "@/backend/graphql/pothos/billing/purchase-checkout.pothos";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { UnauthorizedError } from "@/backend/lib/errors";
import { VerificationPurchaseService } from "@/backend/services";

// Side-effect: register the `purchaseVerificationPlan` mutation field.
gqlSchemaBuilder.mutationField("purchaseVerificationPlan", t =>
  t.field({
    type: PurchaseSubscriptionPayloadPothosObject,
    description:
      "Purchase the platform-owned teacher verification plan for the caller: identity is server-bound from the verified session, the plan is resolved server-side from the active catalog, and the pending subscription + payment pair commit atomically with the applicant lifecycle transition. Requires the X-Idempotency-Key header (a replayed key surfaces DUPLICATE_REQUEST). Applicant-only.",
    authScopes: {
      authenticated: true,
    },
    resolve: async (_root, _args, ctx) => {
      // TypeScript narrowing only — see the authScopes note above.
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      return VerificationPurchaseService.purchase(
        ctx.user.id,
        // Propagation-only key, verbatim from the context capture. The
        // `?? null` leg is a TYPE-level accommodation only (the context
        // field is optional in the type so pre-existing fixtures stay
        // compile-clean; the factory always materializes it at runtime).
        ctx.idempotencyKey ?? null,
        ctx.locale
      );
    },
  })
);
