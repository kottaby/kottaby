/**
 * `mySubscriptions` query — the caller's own subscription list.
 *
 * Contract:
 *  - `mySubscriptions: [StudentSubscription!]!` — ZERO arguments; identity
 *    is derived EXCLUSIVELY from the verified context (`ctx.user.id`; the
 *    student PK shares the users PK). There is no caller-supplied lookup
 *    surface of any kind: BOLA probes that attempt to address foreign rows
 *    die as GraphQL validation failures before a resolver ever runs, and
 *    another caller's subscriptions are unreachable by construction.
 *  - NON-NULL list of NON-NULL entities, every lifecycle status included,
 *    newest first (`created_at DESC` — the service's own ordering).
 *  - DomainErrors thrown deeper (governance FORBIDDEN, identifier
 *    VALIDATION) propagate uncaught to the masking boundary (no try/catch
 *    here by contract).
 *
 * authScopes: the explicit `$all { authenticated, role: [Student] }`
 * conjunction (the 401/403 split documented in this repo's billing queries
 * — a plain scope map combines its keys with ANY semantics): anonymous
 * callers hit the `authenticated` leg's UnauthorizedError (401 channel),
 * while authenticated non-students (parent, teacher, admin) fail the
 * `role` leg into the canonical localized ForbiddenError (403 channel).
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - NO named exports — the root field registers at import time via
 *    `gqlSchemaBuilder.queryField(...)`.
 *  - Wired through side-effect barrels: `query/index.ts` → `gqlSchema.ts`.
 *  - Resolver delegates to the services layer with locale propagation
 *    (backend/graphql/AGENTS.md); no business logic inline.
 */

import { UserRole } from "@/backend/enum/users/user-role.enum";
import { SubscriptionPothosObject } from "@/backend/graphql/pothos/billing/subscription.pothos";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { UnauthorizedError } from "@/backend/lib/errors";
import { SubscriptionPurchaseService } from "@/backend/services";

// Side-effect: register the `mySubscriptions` query field.
gqlSchemaBuilder.queryField("mySubscriptions", t =>
  t.field({
    type: [SubscriptionPothosObject],
    description: "The caller's own subscriptions across every lifecycle status, newest first. Student-only.",
    // Explicit `$all` conjunction per the 401/403 split documented above.
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Student],
      },
    },
    resolve: async (_root, _args, ctx) => {
      // TypeScript narrowing only — see `query/teachers/applicant.query.ts`.
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      // Zero arguments: the read scope IS the verified context identity —
      // the owner predicate lives service-side on the caller's own rows.
      // Locale propagates per backend/graphql/AGENTS.md (the context field
      // is always materialized — defaulted from cookie/header).
      return SubscriptionPurchaseService.listOwn(ctx.user.id, ctx.locale);
    },
  })
);
