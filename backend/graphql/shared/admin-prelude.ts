/**
 * Shared admin-only query prelude.
 *
 * Centralizes the guard/context prelude that was cloned across the admin
 * root-field registrations (`admin-users.query.ts`, `audit-trail.query.ts`,
 * `platform-analytics.query.ts`):
 *
 *  - `adminOnlyAuthScopes` — the MANDATORY `$all` conjunction
 *    `{ authenticated: true, role: [UserRole.Admin] }`. Anonymous →
 *    `UNAUTHORIZED` (401), authenticated non-admin → `FORBIDDEN` (403), both
 *    BEFORE the resolver body runs. A plain `{ authenticated, role }` key map
 *    is WRONG: Pothos combines scope keys with ANY semantics unless `$all`
 *    makes the conjunction explicit (see `docs/teachers/applicant-lifecycle.md`).
 *  - `requireAdminUser` — the `ctx.user` belt for TypeScript narrowing only
 *    (the repo-wide no-non-null-assertion rule forbids dereferencing the
 *    nullable context directly). The translated `UnauthorizedError` matches
 *    the `authenticated` scope's own throw (`builder.ts`), so the belt is
 *    invisible whenever the scope did its job.
 */
import { UserRole } from "@/backend/enum/users/user-role.enum";
import type { Context } from "@/backend/graphql/gqlContextFactory";
import { UnauthorizedError } from "@/backend/lib/errors";

export const adminOnlyAuthScopes = {
  $all: {
    authenticated: true,
    role: [UserRole.Admin],
  },
};

export async function requireAdminUser(ctx: Context): Promise<NonNullable<Context["user"]>> {
  if (!ctx.user) {
    const tErrors = await ctx.t("errorsTranslations");
    throw new UnauthorizedError(tErrors.unauthorized);
  }
  return ctx.user;
}
