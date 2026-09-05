/**
 * Platform analytics query — `adminPlatformAnalytics`, the admin-only
 * whole-platform snapshot read (users, sessions, revenue by currency,
 * subscriptions, teacher presence, ratings, health indicators, 30-day
 * daily trends).
 *
 * Contract:
 *  - `adminPlatformAnalytics: PlatformAnalytics!` — ZERO arguments. The
 *    read scope is the whole platform for the caller's governance window;
 *    there is no caller-steerable parameter of any kind (nothing to
 *    filter, page, or id).
 *
 * authScopes (`$all` conjunction, MANDATORY):
 *  - `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }`
 *  - Anonymous → `UNAUTHORIZED` (401); authenticated non-admin → `FORBIDDEN`
 *    (403) — both BEFORE the resolver body runs.
 *  - A plain `{ authenticated: true, role: [...] }` map is WRONG: Pothos
 *    combines scope keys with ANY semantics unless `$all` makes the
 *    conjunction explicit.
 *
 * Resolver discipline (thin resolvers):
 *  - `ctx.user` belt for TypeScript narrowing only (the repo-wide
 *    no-non-null-assertion rule forbids dereferencing the nullable context
 *    directly); the translated `UnauthorizedError` matches the
 *    `authenticated` scope's own throw so the belt is invisible when the
 *    scope did its job.
 *  - The resolver passes ONLY `ctx.user.id` + `ctx.locale` to the service —
 *    the service re-gates (defense-in-depth) and owns the governed-admin
 *    denials (deleted/blocked/suspended) in the deterministic order, so
 *    governed admins see `FORBIDDEN` from the service tier, past the
 *    role scope.
 *  - NO try/catch, NO business logic — service `DomainError` subclasses
 *    propagate with `extensions.code` and boundary masking.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - NO named exports — root fields register at import time via
 *    `gqlSchemaBuilder.queryField(...)`.
 *  - Wired through side-effect barrels:
 *    `query/admin/index.ts` → `query/index.ts` → `gqlSchema.ts`.
 */
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { PlatformAnalyticsPothosObject } from "@/backend/graphql/pothos/admin";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { UnauthorizedError } from "@/backend/lib/errors";
import { PlatformAnalyticsService } from "@/backend/services";

// Side-effect: register the `adminPlatformAnalytics` whole-snapshot query field.
gqlSchemaBuilder.queryField("adminPlatformAnalytics", t =>
  t.field({
    type: PlatformAnalyticsPothosObject,
    description:
      "Admin-only whole-platform analytics snapshot (users, sessions, revenue by currency, subscriptions, teacher presence, ratings, health indicators, 30-day daily trends). Zero arguments — the read scope is the closed contract. Governed admins are denied at the service tier.",
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Admin],
      },
    },
    resolve: async (_root, _args, ctx) => {
      // The `$all` scope conjunction guarantees an admin context at
      // resolution time; this branch exists purely for TypeScript narrowing
      // (see file docs).
      if (!ctx.user) {
        const tErrors = await ctx.t("errorsTranslations");
        throw new UnauthorizedError(tErrors.unauthorized);
      }
      return PlatformAnalyticsService.getPlatformAnalytics(ctx.user.id, ctx.locale);
    },
  })
);
