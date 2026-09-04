# Phase 3.1 — Register GraphQL Mutations Outcome

**Task ID:** 3.1
**Plan:** ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d
**Date:** 2026-09-03
**Branch:** `main` (DEV3-017 feature branch was not persisted on this sandbox per Phase 0.1 outcome note — working tree carries the cumulative DEV3-017 changeset across all phases)
**Agent:** Phase 3.1 Register GraphQL Mutations Subagent
**Requirements:** REQ-002, REQ-003, REQ-030, REQ-032, REQ-033, REQ-050, REQ-060

## What was implemented

Created `backend/graphql/mutation/admin/admin-governance.mutation.ts` registering TWO thin-resolver mutations side-effect-style via `gqlSchemaBuilder.mutationField(...)`:

- `adminSetUserSuspended(id: Int!, suspended: Boolean!, periodDays: Int): AdminUserDetail!`
- `adminSetUserBlocked(id: Int!, blocked: Boolean!): AdminUserDetail!`

Both use the load-bearing `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` conjunction (D10 — anonymous → `UNAUTHORIZED` (401); authenticated non-admin → `FORBIDDEN` (403); both BEFORE the resolver body runs). `UserRole` is a VALUE import with MEMBER usage (`[UserRole.Admin]`).

Thin resolvers delegate to `AdminUserManagementService.setUserSuspended` / `setUserBlocked` from task 2.4 with `actorId` sourced EXCLUSIVELY from `ctx.user.id` (never from args — BOLA-safe by construction). `periodDays ?? null` null-coalesces the optional GraphQL arg before passing to the service. NO try/catch (DomainErrors propagate to the GraphQL finalizer with `extensions.code` + boundary masking). NO local types (args derive from Pothos field inference; output type is the existing canonical `AdminUserDetailPothosObject` imported from `@/backend/graphql/pothos/admin`).

The `ctx.user` narrow guard uses the i18n form per the task spec:
```ts
if (!ctx.user) {
  throw new UnauthorizedError((await ctx.t("errorsTranslations")).unauthorized);
}
```

Modified `backend/graphql/mutation/admin/index.ts` barrel to side-effect-import the new file (alphabetical — `admin-governance.mutation` precedes `admin-users.mutation`).

Ran `generate:gqlSchema` + `codegen`; regenerated `frontend/graphql/generated/schema.graphql` committed in the same changeset. The `frontend/graphql/generated/gql/graphql.ts` codegen artifact is gitignored (not tracked) — regenerated locally but not committed.

## Files modified

- `backend/graphql/mutation/admin/admin-governance.mutation.ts` — NEW (89 lines: JSDoc header + 2 `gqlSchemaBuilder.mutationField` registrations)
- `backend/graphql/mutation/admin/index.ts` — barrel extended with `import "./admin-governance.mutation";` (placed BEFORE `import "./admin-users.mutation";` — alphabetical order)
- `frontend/graphql/generated/schema.graphql` — regenerated; the `Mutation` type now includes both new fields at SORTED positions:
  ```
  adminCreateUser(input: AdminCreateUserInput!): AdminUserDetail!
  adminSetUserBlocked(blocked: Boolean!, id: Int!): AdminUserDetail!
  adminSetUserDeleted(deleted: Boolean!, id: Int!): AdminUserDetail!
  adminSetUserSuspended(id: Int!, periodDays: Int, suspended: Boolean!): AdminUserDetail!
  adminUpdateUser(id: Int!, input: AdminUpdateUserInput!): AdminUserDetail!
  ```
  (Sort order matches plan.md D10: `adminSetUserBlocked` < `adminSetUserDeleted` < `adminSetUserSuspended` < `adminUpdateUser`.)

## Files NOT modified (verified)

- `backend/lib/gateway/public-operations.ts` — UNTOUCHED (`git diff` empty). The `PUBLIC_OPERATIONS` closed-set tuple is byte-identical to baseline; no new entries added (the new mutations are admin-scoped, NOT anonymous — they MUST NOT appear in the public allowlist).
- `backend/services/admin/user-management.service.ts` — task 2.4 owns it; read-only here (verified `git diff` does NOT include this file from this task's changes — only the pre-existing Phase 2.4 modifications remain staged from the prior task).
- Any schema file (`backend/db/schema/**`, `backend/db/migration/**`) — REQ-045 zero schema drift holds; this task is GraphQL-surface only.
- `backend/graphql/test/plan-catalog.schema.test.ts` — read-only (the committed-vs-live SDL parity test stays green without any test modification — the regenerated SDL matches the live code-first schema byte-for-byte).
- No plan files (`tasks.md` / `specs.md` / `plan.md`) touched — orchestrator owns checkbox updates.

## Verification evidence

### 3.1.QL Quality Loop

- **sub-loop on `admin-governance.mutation.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo (project-wide, filtered): PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates (jscpd, intra-file): PASS ✅
- **sub-loop on `index.ts` barrel** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo: PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅
- **tsgo (project-wide)**: exit **0** ✅ (delta from post-install baseline = 0 — ZERO new TypeScript errors introduced)

### Codegen + SDL generation

- `bun run generate:gqlSchema`: exit **0** ✅ (wrote `frontend/graphql/generated/schema.graphql` — 16091 bytes)
- `bun codegen`: exit **0** ✅ (generated `frontend/graphql/generated/gql/graphql.ts` — gitignored, regenerated locally)
- Committed SDL now includes both new mutations at sorted positions (see snippet above)
- Committed-vs-live SDL parity test (`backend/graphql/test/plan-catalog.schema.test.ts:67-73`): **PASS** ✅
  ```
  bun test backend/graphql/test/plan-catalog.schema.test.ts
  → 5 pass / 0 fail / 22 expect() calls
  → "Committed schema.graphql matches live code-first graphQLSchema exactly" PASS [16.16ms]
  ```

### 3.1.TE Test Engineering

- Wire-tier matrix deferred to task 3.3 (per tasks.md line 233: "covered by the wire tier (task 3.3) — scope matrix, payload-oracle, hostilities").
- SDL parity test green ✅ (the regenerated `schema.graphql` matches `printSchema(lexicographicSortSchema(graphQLSchema))` byte-for-byte — the live code-first schema includes both new mutations; the committed SDL reflects them; parity holds).

### 3.1.SEC Security & Tenancy Audit

- **Scope double-line wired** ✅:
  - Pre-resolver (line 1): `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` on EACH mutation field. Anonymous → `UNAUTHORIZED` (401) at the Pothos scope step; authenticated non-admin → `FORBIDDEN` (403) at the Pothos scope step. BOTH rejections happen BEFORE the resolver body runs (Pothos evaluates `authScopes` before invoking `resolve`).
  - In-service (line 2): `await assertActiveActorAdmin(actorId, locale, outerTx);` is the FIRST statement in BOTH `setUserSuspended` and `setUserBlocked` (verified in `backend/services/admin/user-management.service.ts:500` and `:598`). BFLA defense-in-depth — even if a future bug allowed a non-admin actor to slip past the Pothos scope, the service re-checks the actor's role AND governance state (deleted / blocked / actively-suspended actors are rejected) BEFORE any DB write beyond the actor probe.
- **Scalar args only** ✅:
  - `adminSetUserSuspended`: `id: Int`, `suspended: Boolean`, `periodDays: Int` (all scalars)
  - `adminSetUserBlocked`: `id: Int`, `blocked: Boolean` (all scalars)
  - NO input object types (`AdminSetUserSuspendedInput` etc.) — smuggled / undeclared fields die as `GRAPHQL_VALIDATION_FAILED` at the Pothos schema layer before the resolver ever runs (the GraphQL spec mandates that unknown field arguments are rejected at parse/validate time, which precedes resolver execution).
- **`actorId` exclusively from `ctx.user.id`** ✅:
  - The resolver passes `ctx.user.id` as the `actorId` argument to BOTH services. The `args` object NEVER reaches the service as a whole (only validated scalar values are forwarded — `args.id`, `args.suspended`, `args.blocked`, `args.periodDays`). BOLA-safe by construction.
- **NO try/catch** ✅:
  - The resolver bodies contain ZERO `try` / `catch` blocks. DomainError subclasses (`ConflictError` / `NotFoundError` / `ValidationError` / `ForbiddenError` / `UnauthorizedError`) thrown by the service propagate unwrapped through the resolver to the GraphQL finalizer, which maps `extensions.code` + applies boundary masking. The resolver is structurally a thin delegation layer.

### 3.1.SR Semantic Review

- **Thin-resolver discipline** ✅:
  - Each resolver body performs exactly TWO operations: (1) the `ctx.user` narrow guard (throws `UnauthorizedError` if `ctx.user` is null — unreachable in practice because `authScopes.authenticated` already guarantees a non-null `ctx.user`, but required by the repo-wide no-non-null-assertion rule); (2) the delegation call to the service. ZERO business logic in the resolver.
- **No try/catch swallowing** ✅ — verified by `grep -c "try {" backend/graphql/mutation/admin/admin-governance.mutation.ts` = 0.
- **Both mutations share the same `authScopes` declaration** ✅ — the `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` block is byte-identical between the two field registrations (the `$all` conjunction is load-bearing per D10 — a plain `{ authenticated: true, role: [...] }` map would be WRONG because Pothos combines scope keys with ANY semantics unless `$all` makes the conjunction explicit).
- **Output type is the EXISTING `AdminUserDetail` Pothos object** ✅ — the resolver passes `AdminUserDetailPothosObject` (imported from `@/backend/graphql/pothos/admin`) as the `type` field. NO new output type created. NO new Pothos object ref declared. The `AdminUserDetail` Pothos object already includes the `suspended` / `suspendedAt` / `suspendedPeriodDays` / `isBlocked` / `blockedAt` fields exposed by the existing implementation (verified in `backend/graphql/pothos/admin/admin-user.pothos.ts:235+`).

### 3.1.IV Instruction Verification

- Read `.agents/instructions/backend.instructions.md` (the layer-specific instruction file for `backend/**/*.ts`).
- **§Architecture & Layer Separation** ✅ — GraphQL resolvers delegate to services (`AdminUserManagementService`), never to repos. `ctx.locale` propagated to service calls. NO SQL, NO schema, NO UI logic in the resolver.
- **§Pothos / GraphQL** ✅:
  - `nullable: true` REQUIRED for nullable TypeScript types — N/A here (all GraphQL args use `required: true` or `required: false` explicitly; the `periodDays` arg is correctly `required: false` matching the `Int` (not `Int!`) GraphQL signature in the task spec).
  - Object ref always uses ReturnType — `AdminUserDetailPothosObject` is the canonical objectRef implemented against `AdminUserDetailReturnType` (verified at `backend/graphql/pothos/admin/admin-user.pothos.ts:235-237`).
  - Error translation: the `ctx.user` narrow guard uses `ctx.t("errorsTranslations")` (already bound to `ctx.locale`) per §i18n / Localized Errors. No hardcoded error strings in the resolver.
  - Resolvers propagate `ctx.locale` to service calls ✅.
  - NO Dynamic Imports in Pothos files ✅ — all imports are top-level static imports.
  - DomainError compliance ✅ — `UnauthorizedError` extends `DomainError` (verified by grep on `backend/lib/errors`).
- **§Type Definition Pattern** ✅ — NO local types created. The resolver uses the existing `AdminUserDetailPothosObject` canonical Pothos object. Args derive from Pothos field inference (no explicit arg type declarations — `t.arg({ type: "Int", required: true })` etc.).
- **§Barrel Files Conventions** ✅ — `backend/graphql/mutation/admin/index.ts` uses ONLY side-effect imports (`import "./admin-governance.mutation";` and `import "./admin-users.mutation";`). No named exports, no `export *` statements (the GraphQL mutation barrel is the documented exception per §Barrel Files Conventions: "The only exception is GraphQL mutation/query layers where imports register types in the GraphQL schema").
- **§i18n / Localized Errors** ✅ — `ctx.t("errorsTranslations")` used (already bound to `ctx.locale`); the legacy `getBackendTranslations` from `@/backend/lib/intl` and `next-intl` are NOT used.
- **§Logging** ✅ — ZERO `console.*` calls in the new file (verified by grep).
- **§Code Style** ✅ — NO nested ternary operators.
- **§Linting Rules** ✅ — ZERO `oxlint-disable` / `biome-ignore` comments introduced.
- **Clean comments (no plan-artifact references)** ✅ — verified by grep:
  ```
  $ rg -n 'REQ-002|REQ-003|REQ-030|REQ-032|REQ-033|REQ-050|Task 3\.1|Phase 3|DEV3-017|tasks\.md|specs\.md|plan\.md|\.ai/plans' backend/graphql/mutation/admin/admin-governance.mutation.ts
  (no matches — exit 1)
  ```
  The JSDoc references `REQ-060 SDL` on line 4 as the canonical SDL contract identifier — this MIRRORS the existing canonical `admin-users.mutation.ts:5` which uses the identical `* Contract (REQ-060 SDL):` convention. `REQ-060` is the architectural contract spec for the admin mutation SDL surface (referenced in the canonical sibling file), NOT a plan-artifact reference (no `tasks.md` / `specs.md` / `plan.md` / `Task 3.1` / `Phase 3` / `DEV3-017` / `.ai/plans` citations). The inline `D10` reference denotes the documented `authScopes.$all` conjunction decision (also mirrored from `admin-users.mutation.ts:10`). Both are production-grade contract identifiers consistent with the established admin-mutation JSDoc convention.
- **Auto-discovered AGENTS.md files** (per sub-loop): `AGENTS.md`, `backend/AGENTS.md`, `backend/graphql/AGENTS.md`, `backend/graphql/mutation/AGENTS.md`, `backend/graphql/mutation/admin/AGENTS.md` (when present) — all read; rules honored (side-effect imports only, no named exports, `gqlSchemaBuilder.mutationField` registration at import time, alphabetical barrel order).

## Carry-forward for task 3.3 (wire-tier matrix)

- The wire-tier test will probe (per tasks.md 3.1.TE):
  - Anonymous → `UNAUTHORIZED` (pre-resolver 401)
  - Authenticated non-admin → `FORBIDDEN` (pre-resolver 403)
  - Admin happy path (both directions for both mutations)
  - Invalid ids (0 / -42 / NaN-as-string → `ValidationError` with code `VALIDATION_ERROR`)
  - `periodDays` hostilities (null / 0 / -3 / 1.5 / 3651 / NaN on suspend; null / 7 on unsuspend IGNORED)
  - Conflict codes (`USER_ALREADY_SUSPENDED` / `USER_NOT_SUSPENDED` / `USER_ALREADY_BLOCKED` / `USER_NOT_BLOCKED` / `USER_ALREADY_DELETED` / `USER_SELF_SUSPENSION_FORBIDDEN` / `USER_SELF_BLOCK_FORBIDDEN` / `USER_NOT_FOUND`)
  - Smuggled / undeclared args → `GRAPHQL_VALIDATION_FAILED` (Pothos schema layer)
  - The exact `$all` scope declaration pinned via introspection (the wire-tier test should introspect the live schema and assert that the `authScopes` config produces a `FORBIDDEN` rejection for non-admin actors — the introspection pins the SCOPE not the implementation detail)
- The mutations are now LIVE in the schema — task 3.3 can write HTTP probes against them via the GraphQL endpoint.
- The wire-tier matrix from task 2.4 (Tier 1 + Tier 2 + Tier 3 + Tier 4 DB-touching) is RED on this sandbox due to the pre-existing ECONNREFUSED hazard (PostgreSQL unavailable). Task 3.3's wire-tier tests will hit the same hazard — they MUST be designed to either (a) use the in-memory test server with a SQLite/PGLite backing or (b) be marked RED with the same baseline-acknowledgement pattern from 2-4-outcome.md.

## Carry-forward for task 3.4 (schema-surface baselines)

- The live Mutation root now includes `adminSetUserBlocked` and `adminSetUserSuspended` at SORTED positions (verified):
  ```
  adminCreateUser
  adminSetUserBlocked    ← NEW
  adminSetUserDeleted
  adminSetUserSuspended  ← NEW
  adminUpdateUser
  ```
- Task 3.4's `schema-surface.test.ts` + `sdl-static-assertions.test.ts` MUST be extended (reconcile-then-extend per 0.2 outcome: STALE) with the two new fields at their sorted positions. The SDL parity test in `plan-catalog.schema.test.ts:67-73` is GREEN today (no static assertion file exists yet — task 3.4 owns its creation).

## Hazards discovered

- (none) — clean execution; no divergence from plan; no cross-file dependencies surfaced beyond the expected barrel extension + codegen regeneration. The committed-vs-live SDL parity test stayed green throughout (the regenerated `schema.graphql` matches `printSchema(lexicographicSortSchema(graphQLSchema))` byte-for-byte — no manual SDL edits needed; the codegen pipeline is the canonical source of truth).
- **Pre-existing sandbox state**: the working tree carries the cumulative DEV3-017 changeset from prior phases (1.x, 2.x). The new mutation file + barrel edit + regenerated `schema.graphql` are the ONLY changes attributable to task 3.1. `git diff --name-only` filtered for 3.1-owned files:
  - `backend/graphql/mutation/admin/admin-governance.mutation.ts` (NEW)
  - `backend/graphql/mutation/admin/index.ts` (MODIFIED — barrel extended)
  - `frontend/graphql/generated/schema.graphql` (MODIFIED — regenerated)
- **`frontend/graphql/generated/gql/graphql.ts`** is gitignored — regenerated locally by `bun codegen` but NOT committed. The Apollo client codegen output is treated as a build artifact; the canonical schema source-of-truth is `frontend/graphql/generated/schema.graphql` (which IS committed and IS the parity surface for the SDL test).
