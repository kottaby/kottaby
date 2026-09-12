/**
 * Session arbitration queries — `adminDisputeCase`, the admin's
 * case-review read over one disputed session (the evidence bundle behind
 * the arbitration decision).
 *
 * Contract:
 *  - `adminDisputeCase(id: ID!): AdminDisputeCase!` — the full session row
 *    (dispute reason, stamps, fee, hold marker), the session report, the
 *    homework record, the recitation record, and the session-scoped audit
 *    trail, in ONE response. Artifacts that were never produced surface as
 *    honest `null`s (`report`/`homework`/`recitation`) or an empty trail —
 *    never fabricated placeholders. An unknown or malformed id surfaces as
 *    the localized not-found denial (the admin surface distinguishes
 *    state, never participants). The read is strictly side-effect free.
 *
 * authScopes (`$all` conjunction, MANDATORY — shared admin prelude):
 *  - `authScopes: adminOnlyAuthScopes` (the canonical
 *    `$all { authenticated: true, role: [UserRole.Admin] }` conjunction).
 *    Anonymous → `UNAUTHORIZED` (401); authenticated non-admin →
 *    `FORBIDDEN` (403) — both BEFORE the resolver body runs.
 *  - A plain `{ authenticated: true, role: [...] }` map is WRONG: Pothos
 *    combines scope keys with ANY semantics unless `$all` makes the
 *    conjunction explicit.
 *  - Defense in depth: the service re-asserts the governance-clean ADMIN
 *    role from the user row (`assertAdminGovernanceClean`) before reading.
 *
 * Resolver discipline (thin resolvers):
 *  - Identity comes EXCLUSIVELY from the verified context
 *    (`requireAdminUser(ctx)` → `user.id`; never client input).
 *  - NO try/catch, NO business logic — service `DomainError` subclasses
 *    propagate with `extensions.code` and boundary masking; all localized
 *    messaging happens inside the service via `ctx.locale` propagation.
 *  - Zero repository calls; top-level static imports ONLY.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - NO named exports — the root field registers at import time via
 *    `gqlSchemaBuilder.queryField(...)`.
 *  - Wired through side-effect barrels:
 *    `query/classes/index.ts` → `query/index.ts` → `gqlSchema.ts`.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { AdminDisputeCasePothosObject } from "@/backend/graphql/pothos/classes/session-arbitration.pothos";
import { adminOnlyAuthScopes, requireAdminUser } from "@/backend/graphql/shared";
import { SessionArbitrationService } from "@/backend/services";

// Side-effect: register the `adminDisputeCase` query field.
gqlSchemaBuilder.queryField("adminDisputeCase", t =>
  t.field({
    type: AdminDisputeCasePothosObject,
    args: {
      id: t.arg({ type: "ID", required: true }),
    },
    description:
      "Read the full dispute case for one session (admin-only): the session row, its report, homework, and recitation records (honest nulls when absent), and the session-scoped audit trail. Unknown or malformed ids are localized not-found denials.",
    authScopes: adminOnlyAuthScopes,
    resolve: async (_root, args, ctx) => {
      // The `$all` scope conjunction guarantees an admin context at
      // resolution time; `requireAdminUser` is the TS-narrowing belt whose
      // translated throw matches the `authenticated` scope's own throw (see
      // file docs + backend/graphql/shared/admin-prelude.ts).
      const user = await requireAdminUser(ctx);
      // `ID` arrives as a string on the wire; the service boundary is
      // numeric (shape-only `Number` parse — every shape decision is the
      // SERVICE's id guard). The service owns the read's shape entirely:
      // the admin belt re-assertion, the concurrent artifact reads, and
      // the honest nulls.
      return SessionArbitrationService.getAdminDisputeCase(user.id, Number(args.id), ctx.locale);
    },
  })
);
