/**
 * Admin platform-analytics query — the SINGLE zero-argument entry point for
 * the whole-platform analytics snapshot (DEV3-022c).
 *
 * Closed contract (REQ-033/034/073):
 *  - NO arguments — the read scope is the whole platform for admins; there
 *    is nothing steerable, so alias-bombing amplification is bounded and
 *    the closed input surface is enforced by GraphQL validation itself
 *    (pinned by the wire matrix).
 *  - `$all` authScopes conjunction: BOTH `authenticated` AND
 *    `role: [UserRole.Admin]` must hold — the `$all` wrapper is
 *    load-bearing (the default scope semantics are ANY, which would let a
 *    student token through either branch alone).
 *  - PRE-RESOLVER `ctx.user` null check (defense-in-depth under the scope
 *    gate) throws the localized `UnauthorizedError` via `ctx.t` — the wire
 *    matrix pins that anonymous requests fail BEFORE the resolver body.
 *  - The resolver is the thin hive: NO logic, NO types, NO SQL — it passes
 *    ONLY `ctx.user.id` + `ctx.locale` to the service. Governed admins
 *    (deleted/blocked/suspended) are denied at the SERVICE tier (D8 —
 *    REQ-032), NOT here.
 *  - NO try/catch: domain errors propagate as thrown (the error-handling
 *    contract owns the envelope).
 */
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { PlatformAnalyticsPothosObject } from "@/backend/graphql/pothos/admin/platform-analytics.pothos";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { UnauthorizedError } from "@/backend/lib/errors";
import { PlatformAnalyticsService } from "@/backend/services/admin";

// Side-effect: register the `adminPlatformAnalytics` query field.
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
      if (!ctx.user) {
        const tErrors = await ctx.t("errorsTranslations");
        throw new UnauthorizedError(tErrors.unauthorized);
      }
      return PlatformAnalyticsService.getPlatformAnalytics(ctx.user.id, ctx.locale);
    },
  })
);
