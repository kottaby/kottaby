/**
 * `me` query — returns the authenticated user.
 *
 * Contract (`me` SHALL require an authenticated context):
 *  - Anonymous callers (no `ctx.user`) receive a GraphQL `UNAUTHORIZED`
 *    error BEFORE the resolver runs; they never receive `null`.
 *  - Authenticated callers receive the full user shape (`ctx.safeUser`).
 *  - The AuthProvider treats the `UNAUTHORIZED` error as the signal to run
 *    its refresh-then-retry restore path.
 *
 * authScopes:
 *  - The `me` query carries `authScopes: { authenticated: true }`. With
 *    Pothos scope-auth, anonymous callers (no `ctx.user`) receive a
 *    GraphQL `UNAUTHORIZED` error instead of `null`. The AuthProvider's
 *    `restoreSession` catches the error and falls through to its
 *    refresh-then-retry path — same UX as the prior return-null contract,
 *    but with explicit 401 semantics at the schema layer.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - This file has NO named exports — it registers the root field at import
 *    time via `gqlSchemaBuilder.queryField(...)`.
 *  - Wired via side-effect import in `backend/graphql/query/index.ts`.
 *
 * Apollo cache normalization: the returned `User` exposes `id`, so the
 * AuthProvider's `me` query result is normalized into the same cache entry
 * the `login` mutation wrote.
 */

import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { UserPothosObject } from "@/backend/graphql/pothos/users/user.pothos";

// Side-effect: register the `me` query field.
gqlSchemaBuilder.queryField("me", t =>
  t.field({
    type: UserPothosObject,
    nullable: true,
    description:
      "Returns the authenticated user. Anonymous callers are rejected with a GraphQL UNAUTHORIZED error before the resolver runs — the AuthProvider uses that to refresh the session and retry.",
    // Requires an authenticated context. Anonymous callers receive
    // a GraphQL UNAUTHORIZED error (401 semantics); the AuthProvider's
    // restoreSession catches it and falls through to refresh-then-retry.
    authScopes: {
      authenticated: true,
    },
    resolve: async (_root, _args, ctx) => {
      // ctx.user is populated by createGraphQLContext from the access_token
      // (Authorization header or cookie). The `authenticated` authScope
      // guarantees `ctx.user` is non-null here.
      return ctx.user;
    },
  })
);
