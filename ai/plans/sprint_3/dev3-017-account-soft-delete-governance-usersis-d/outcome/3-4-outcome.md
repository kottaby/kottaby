# Phase 3.4 — Schema-Surface Baselines Outcome

**Task ID:** 3.4
**Plan:** ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d
**Date:** 2026-09-04
**Requirements:** REQ-061
**Branch applied:** RECONCILE-then-EXTEND (Phase 0.2 outcome confirmed STALE — both `schema-surface.test.ts` and `sdl-static-assertions.test.ts` baseline inventories predated the shipped DEV3-016 admin-user-management surface)

## What was implemented

### 1. RECONCILED `backend/graphql/test/schema-surface.test.ts` to mirror the LIVE built schema

The pre-existing baseline drift (documented in `0-2-reuse-substrate-outcome.md` §A20/A21 + the "Schema-Surface Freshness Check" verdict) was deeper than the prior 0.2 probe focused on:

- **Query root**: 4 admin-user queries (`adminUserActivity`, `adminUserDetail`, `adminUserStats`, `adminUsers`) were shipped on the live Query root by the dev3-016 admin-user-management surface but NEVER enumerated in `PRE_3_1_QUERY_FIELDS`. The test's `expect(additions.toSorted(...)).toEqual(...)` exact-match assertion was therefore RED.
- **Mutation root**: 3 admin-user mutations (`adminCreateUser`, `adminSetUserDeleted`, `adminUpdateUser`) were shipped by the dev3-016 admin-user-management surface but NEVER enumerated in `PRE_3_1_MUTATION_FIELDS`. The test's `expect(names).toEqual(...)` exact-match assertion was therefore RED.
- **Enum set**: 2 admin enums (`AdminUserGovernanceFilter`, `AuditActionType`) were shipped by the dev3-016 admin-user-management surface but NEVER enumerated in `PRE_3_1_ENUMS`. The test's `expect(enumNames).toEqual(...)` exact-match assertion was therefore RED.
- **Named-type delta**: 11 admin-user object/input types (`AdminCreateUserInput`, `AdminParentSnapshot`, `AdminStudentSnapshot`, `AdminTeacherSnapshot`, `AdminUpdateUserInput`, `AdminUserActivityEntry`, `AdminUserDetail`, `AdminUserFiltersInput`, `AdminUserListItem`, `AdminUserPage`, `AdminUserStats`) + 2 enum names (`AdminUserGovernanceFilter`, `AuditActionType`) were shipped by the dev3-016 admin-user-management surface but NEVER enumerated in the `additions` assertion. The test's `expect(additions).toEqual(...)` exact-match assertion was therefore RED.
- **sdl-static-assertions.test.ts lexical check**: `sdlText.not.toContain("Subscription")` was RED because the dev3-016 `AdminStudentSnapshot.hasActiveSubscription` and `AdminUserListItem.studentHasActiveSubscription` field names legitimately contain the substring "Subscription".

Reconciliation (documented, NOT a silent baseline flip):
- Added new constants `DEV3_016_ADMIN_USER_QUERY_FIELDS`, `DEV3_016_ADMIN_USER_MUTATION_FIELDS`, `DEV3_016_ADMIN_ENUMS`, `DEV3_016_ADMIN_TYPE_NAMES` — each documents the reconciled pre-existing dev3-016 admin-user-management surface as a one-time re-anchor to the live built schema. The `PRE_3_1_*` constants are byte-unchanged (preserving the captured-at-HEAD-`8e5ebb8` provenance).
- Spread the new constants into the existing `expect(...).toEqual(...)` exact-match assertions on Query / Mutation / enum / named-type inventories.
- Replaced the over-broad `sdlText.not.toContain("Subscription")` lexical check with a precise AST-tier `sdlDocument.definitions.some(...)` check (already present) + a tighter `sdlText.not.toMatch(/\btype\s+Subscription\b/)` belt-and-braces (so legitimate `hasActiveSubscription` substrings do NOT trigger a false positive). Documented as a one-time reconciliation in the JSDoc + inline comment.
- Documented the reconciliation as a "Reconciliation note (DEV3-017)" section in BOTH test files' JSDoc headers — explicitly identifying the prior baseline drift, the empirical evidence substrate (`printSchema(lexicographicSortSchema(graphQLSchema))`), and the "NOT a silent baseline flip" caveat.

### 2. EXTENDED both test files with the two new DEV3-017 mutations at their SORTED positions

- Added new constant `DEV3_017_ADMIN_GOVERNANCE_MUTATION_FIELDS = ["adminSetUserBlocked", "adminSetUserSuspended"]` in `schema-surface.test.ts`. Spread into the Mutation root inventory assertion (on top of the reconciled DEV3-016 trio).
- Added a new describe block `"DEV3-017 admin-governance mutations — exact arg shapes + `$all` scope pins"` in `schema-surface.test.ts` with 5 tests:
  - `adminSetUserBlocked` returns `AdminUserDetail!` with EXACTLY the two required args (`blocked: Boolean!`, `id: Int!`).
  - `adminSetUserSuspended` returns `AdminUserDetail!` with EXACTLY three args (`id: Int!`, `periodDays: Int`, `suspended: Boolean!`) — `periodDays` is the ONLY nullable arg.
  - BOTH governance mutations carry the EXACT `$all` conjunction (`{ authenticated: true, role: [UserRole.Admin] }`) — pinned via the `authScopesSnapshot` Pothos-extensions introspection helper (mirrors `handshake-code-surface.test.ts:59-82` + `admin-governance.matrix.test.ts:460-465`). The scope keys are EXACTLY `["authenticated", "role"]`; the role set is EXACTLY `[UserRole.Admin]` (no sibling / teacher / parent / student read override).
  - BOTH governance mutations reject smuggled identity args (`actorId` / `userId`) at the GraphQL validation layer (BOPLA defense — undeclared args die as `Unknown argument` BEFORE the resolver body runs).
  - Anonymous (context-free) in-process execution of BOTH governance mutations yields `UNAUTHORIZED` (pre-resolver 401 — the `authScopes.authenticated` gate fires before the resolver body runs).
- Added a new test "admin-user mutations sit at their SORTED positions in the Mutation root inventory" in `schema-surface.test.ts` — asserts the 5 admin-user mutations form a contiguous slice in the alphabetically-sorted Mutation root inventory at the exact lexicographic order `adminCreateUser < adminSetUserBlocked < adminSetUserDeleted < adminSetUserSuspended < adminUpdateUser`.
- Extended the codegen-sync belt-and-braces to include pins for the DEV3-017 admin-governance pair (exact arg shapes + return types) AND the reconciled DEV3-016 admin-user-management surface (3 mutations + 4 queries + 11 named types + 2 enums).
- Added a new describe block `"DEV3-017 admin-governance pair — exact SDL signatures pinned on the artifact"` in `sdl-static-assertions.test.ts` with 3 tests:
  - `adminSetUserBlocked(blocked: Boolean!, id: Int!): AdminUserDetail!` — exact SDL signature pinned on the committed artifact (arg names + types + return type, in artifact definition order which the live sorted SDL emits alphabetically).
  - `adminSetUserSuspended(id: Int!, periodDays: Int, suspended: Boolean!): AdminUserDetail!` — exact SDL signature pinned on the committed artifact.
  - BOTH governance mutations sit at their SORTED positions in the Mutation root inventory (same lexicographic assertion as in schema-surface.test.ts, applied to the SDL artifact's Mutation type definition).
- Refreshed `FROZEN_MUTATION_FIELDS` in `sdl-static-assertions.test.ts` from 7 ops to 23 ops (all live Mutation root fields, alphabetically sorted — mirrors `printSchema(lexicographicSortSchema(graphQLSchema))` Mutation root inventory verbatim).
- Refreshed `FROZEN_QUERY_FIELDS` in `sdl-static-assertions.test.ts` from 6 ops to 19 ops (all live Query root fields, alphabetically sorted — mirrors `printSchema(lexicographicSortSchema(graphQLSchema))` Query root inventory verbatim, with locale-aware case handling: `adminUsers` precedes `adminUserStats` because the locale comparator treats `s`/`S` as primary-equal and lowercases win on the secondary tie-breaker — verified by the live built schema).

### 3. Refactored the existing `Notification mutation surface` describe block

- Hoisted a module-scope `mutationField(name: string)` helper (mirrors `handshake-code-surface.test.ts`'s module-scope `queryField(name)` pattern) — single source of truth for the root Mutation field lookup.
- Removed the closure-scoped `mutationField` and `authScopesOf` from the `Notification mutation surface` describe block — both are now served by the module-scope `mutationField(name)` + `authScopesSnapshot(field)` pair. This eliminates the `sonarjs/no-identical-functions` lint warning (the previous local `governanceMutationField` would have been flagged as identical to the local `mutationField`).
- The `Notification mutation surface` describe block's behavior is byte-identical: same tests, same assertions, same scope-pin discipline. Only the closure-scoped helpers are removed; the tests themselves are unchanged.

## Files modified

- `backend/graphql/test/schema-surface.test.ts` — RECONCILED (DEV3-016 admin-user surface: 4 queries + 3 mutations + 2 enums + 11 types) + EXTENDED (DEV3-017 admin-governance pair with sorted-position assertion, exact arg shapes, `$all` scope introspection pin, BOPLA smuggling probes, anonymous UNAUTHORIZED execution probes, codegen-sync belt-and-braces) + REFACTORED (hoisted `mutationField` + `authScopesOf` to module scope).
- `backend/graphql/test/sdl-static-assertions.test.ts` — RECONCILED (`FROZEN_MUTATION_FIELDS` 7 → 23 ops; `FROZEN_QUERY_FIELDS` 6 → 19 ops; `Subscription` lexical check tightened to AST-tier + `type Subscription` regex) + EXTENDED (DEV3-017 admin-governance pair with exact SDL signatures + sorted-position assertion).

## Files NOT modified (verified)

- `backend/graphql/test/handshake-code-surface.test.ts` — UNTOUCHED (`git diff` empty; `git status --short` shows zero changes for this file). The frozen allowlist + introspection pattern was preserved verbatim. 22/22 tests green.
- `backend/graphql/test/plan-catalog.schema.test.ts` — UNTOUCHED (the committed-vs-live SDL parity test stays green without any test modification — the regenerated `schema.graphql` from task 3.1 matches `printSchema(lexicographicSortSchema(graphQLSchema))` byte-for-byte). 5/5 tests green.
- `backend/graphql/test/admin-governance.matrix.test.ts` — UNTOUCHED (the wire-tier matrix's Tier 0 introspection is the canonical `$all` scope pin; cross-referenced from `schema-surface.test.ts`'s new `DEV3-017 admin-governance mutations` describe block). The 4 DB-backed tiers continue to ride the pre-existing ECONNREFUSED hazard (PostgreSQL unavailable on this sandbox — documented in 3-3-outcome.md as a baseline-acknowledgement pattern, NOT caused by this task).
- Any source code (`backend/graphql/mutation/**`, `backend/services/**`, `backend/db/**`) — UNTOUCHED. This task is test-file-only.
- Any plan files (`tasks.md` / `specs.md` / `plan.md`) — UNTOUCHED (orchestrator owns checkbox updates).
- `frontend/graphql/generated/schema.graphql` — UNTOUCHED by this task. The 2-line diff is from task 3.1's regeneration (the DEV3-017 mutations landed on the live schema in task 3.1); task 3.4 only reads the artifact, never writes it.

## LIVE schema evidence

Captured via `printSchema(lexicographicSortSchema(graphQLSchema))` Mutation root:

- **Total Mutation root ops**: 23 (was 21 prior to DEV3-017 task 3.1; +2 for `adminSetUserBlocked` + `adminSetUserSuspended`).
- **Sorted Mutation root inventory** (alphabetical):
  ```
  adminCreateUser, adminSetUserBlocked, adminSetUserDeleted, adminSetUserSuspended,
  adminUpdateUser, cancelSession, completeSession, confirmSessionCompletion,
  createPlan, createSession, login, logout, markAllNotificationsRead,
  markNotificationRead, openSessionDispute, refreshToken, registerUser,
  requestWithdrawal, resolveSessionDispute, setPlanActiveStatus, startSession,
  updateMyLocale, updatePlan
  ```
- **Sorted positions verified**: `adminCreateUser` < `adminSetUserBlocked` < `adminSetUserDeleted` < `adminSetUserSuspended` < `adminUpdateUser` — the DEV3-017 admin-governance pair slots BETWEEN `adminCreateUser` (prior dev3-016) and `adminSetUserDeleted` (prior dev3-016), and BETWEEN `adminSetUserDeleted` and `adminUpdateUser` (prior dev3-016). Both new fields form a contiguous slice with the prior dev3-016 admin-user mutations in the alphabetically-sorted Mutation root inventory (verified by the new "admin-user mutations sit at their SORTED positions" test in schema-surface.test.ts).
- **Total Query root ops**: 19 (4 admin-user queries + 3 DEV3-004 participant-read + 1 DEV3-005 admin arbitration + 1 DEV3-013 wallet + 2 DEV1-013 handshake + 1 probe + 7 PRE_3_1 baseline).
- **Total enum count**: 15 (7 PRE_3_1 + 3 DEV3-004 + 1 DEV3-005 + 2 DEV3-013 + 2 DEV3-016 admin).
- **Total named-type count**: 50 (PRE_3_1_TYPE_NAMES + DateTime + HandshakeCodeLookup + HealthCheck + DEV3-004 types + DEV3-004 enums + DEV3-005 enums + DEV3-013 types + DEV3-013 enums + DEV3-016 admin types + DEV3-016 admin enums).
- **New DEV3-017 field arg shapes** (captured via the live built schema):
  - `adminSetUserBlocked(blocked: Boolean!, id: Int!): AdminUserDetail!`
  - `adminSetUserSuspended(id: Int!, periodDays: Int, suspended: Boolean!): AdminUserDetail!`
  - (Args are emitted alphabetically by `lexicographicSortSchema` — the test assertions pin the LIVE arg order, NOT the tasks.md prose order `id, blocked` / `id, suspended, periodDays`. The two are equivalent contracts; GraphQL arg order carries no semantic weight.)
- **`$all` scope declaration** (captured via the live built schema's Pothos extensions):
  - `adminSetUserBlocked.extensions.pothosOptions.authScopes`: `{ $all: { authenticated: true, role: [UserRole.Admin] } }`
  - `adminSetUserSuspended.extensions.pothosOptions.authScopes`: `{ $all: { authenticated: true, role: [UserRole.Admin] } }`
  - (Byte-identical between both mutations — pinned via introspection in `schema-surface.test.ts` AND `admin-governance.matrix.test.ts` Tier 0.)

## Verification evidence

### 3.4.QL Quality Loop

- **sub-loop on `schema-surface.test.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo (filtered): PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅ (jscpd intra-file scan — no duplicated blocks beyond the sanctioned threshold)
- **sub-loop on `sdl-static-assertions.test.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo (filtered): PASS ✅
  - oxlint: PASS ✅ (after switching `Array#sort()` → `Array#toSorted()` to satisfy the `unicorn/no-array-sort` rule)
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅
- **tsgo (project-wide)**: exit **0** ✅ (zero new TypeScript errors introduced; the new `GraphQLField` type import is consumed by the module-scope `mutationField(name)` helper's return type annotation).

### 3.4.TE Test Engineering

- **schema-surface.test.ts**: **41/41 pass** ✅ (was 31 pass / 4 fail pre-reconciliation — the 4 prior RED tests are now GREEN; +6 new tests in the `DEV3-017 admin-governance mutations` describe block + 1 new sorted-position test in the `Surface freeze` describe block; 263 `expect()` calls).
- **sdl-static-assertions.test.ts**: **21/21 pass** ✅ (was 15 pass / 3 fail pre-reconciliation — the 3 prior RED tests are now GREEN; +3 new tests in the `DEV3-017 admin-governance pair` describe block; 66 `expect()` calls).
- **Committed-vs-live SDL parity test** (`backend/graphql/test/plan-catalog.schema.test.ts`): **5/5 pass** ✅ (the regenerated `schema.graphql` from task 3.1 matches `printSchema(lexicographicSortSchema(graphQLSchema))` byte-for-byte; the reconciliation added no new SDL — only test-side inventory updates).
- **handshake-code-surface.test.ts**: **22/22 pass** ✅ (UNTOUCHED — `git diff` empty; the frozen allowlist + introspection pattern preserved verbatim).
- **admin-governance.matrix.test.ts**: 4 pass / 1 fail (the 1 fail is the pre-existing ECONNREFUSED hazard — PostgreSQL unavailable on this sandbox — documented in `3-3-outcome.md` as a baseline-acknowledgement pattern; Tier 0 introspection tier passes, which is the part that pins the `$all` scope declaration).

### 3.4.SEC Security & Tenancy Audit

- **Scope pins included in the frozen surface** ✅:
  - The `BOTH governance mutations carry the EXACT `$all` conjunction` test in `schema-surface.test.ts` introspects the live built schema's Pothos extensions and asserts BOTH mutations carry EXACTLY `{ $all: { authenticated: true, role: [UserRole.Admin] } }`. Any drift (e.g., removing `$all`, swapping `role: [UserRole.Admin]` for `role: [UserRole.Teacher]`, adding `permission` / `superAdmin` bypass keys) would FAIL this test.
  - The wire-tier matrix's Tier 0 introspection (`admin-governance.matrix.test.ts:493-530`) pins the SAME declaration via the SAME introspection substrate — defense-in-depth (the schema-surface static assertion + the wire-tier matrix's Tier 0 introspection are TWO independent locks on the same scope declaration).
- **No scope drift possible silently** ✅:
  - The Mutation root inventory assertion (`expect(names).toEqual([...PRE_3_1_MUTATION_FIELDS, ...DEV3_004_MUTATION_FIELDS, ...DEV3_005_MUTATION_FIELDS, ...DEV3_012_MUTATION_FIELDS, ...DEV3_013_MUTATION_FIELDS, ...DEV3_016_ADMIN_USER_MUTATION_FIELDS, ...DEV3_017_ADMIN_GOVERNANCE_MUTATION_FIELDS].toSorted(...))`) is an EXACT-match assertion (uses `toEqual`). Any addition OR removal of a Mutation root field would FAIL this test — including silently adding a `hardDelete*` or `deleteUser`-class Mutation (the INV-U4 grep-lock carry-forward for task 5.2).
  - The `sdl-static-assertions.test.ts` Mutation root inventory assertion (`expect(names.toSorted(...)).toEqual([...FROZEN_MUTATION_FIELDS])`) is the SAME exact-match contract pinned against the COMMITTED SDL artifact (the byte-identical emission check in `plan-catalog.schema.test.ts` ensures the artifact matches the live builder).
  - The new `admin-user mutations sit at their SORTED positions` test in BOTH files asserts the 5 admin-user mutations form a CONTIGUOUS slice in the alphabetically-sorted Mutation root inventory — explicitly verifying the sorted-position contract (NOT just set membership). This is the explicit sorted-position assertion required by 3.4.TE.

### 3.4.SR Semantic Review

- **Reconciliation documented** ✅:
  - `schema-surface.test.ts` JSDoc header: added a "Reconciliation note (DEV3-017)" section explicitly identifying the prior baseline drift (the `PRE_3_1_*` inventories captured the dev3-016 admin-user-management surface by name in the JSDoc but never enumerated its fields/types/enums in the actual assertion arrays), the empirical evidence substrate (`printSchema(lexicographicSortSchema(graphQLSchema))`), and the "NOT a silent baseline flip" caveat. Each new `DEV3_016_ADMIN_*` constant has a JSDoc explaining its purpose (reconciled pre-existing dev3-016 admin-user-management surface).
  - `sdl-static-assertions.test.ts` JSDoc header: added a parallel "Reconciliation note (DEV3-017)" section explicitly identifying the prior 7-op Mutation baseline + 6-op Query baseline predating the dev3-016 admin-user-management surface (and the dev3-004/005/012/013 surfaces), and the same "NOT a silent baseline flip" caveat. Each refreshed `FROZEN_MUTATION_FIELDS` / `FROZEN_QUERY_FIELDS` constant has a JSDoc explaining its refreshed scope.
- **No unrelated inventory edits** ✅:
  - The `PRE_3_1_QUERY_FIELDS`, `PRE_3_1_MUTATION_FIELDS`, `PRE_3_1_ENUMS`, `PRE_3_1_TYPE_NAMES` constants are byte-unchanged (preserving the captured-at-HEAD-`8e5ebb8` provenance).
  - The `DEV3_004_*`, `DEV3_005_*`, `DEV3_012_*`, `DEV3_013_*` constants are byte-unchanged.
  - Only NEW constants added: `DEV3_016_ADMIN_USER_QUERY_FIELDS`, `DEV3_016_ADMIN_USER_MUTATION_FIELDS`, `DEV3_016_ADMIN_ENUMS`, `DEV3_016_ADMIN_TYPE_NAMES`, `DEV3_017_ADMIN_GOVERNANCE_MUTATION_FIELDS`.
  - The `FROZEN_MUTATION_FIELDS` and `FROZEN_QUERY_FIELDS` constants in `sdl-static-assertions.test.ts` were refreshed (the OLD 7-op / 6-op arrays were not preserved as legacy constants — the file has a single canonical frozen-inventory constant per root type, and the reconciliation note in the JSDoc documents the refresh). The new arrays are alphabetically sorted to mirror `printSchema(lexicographicSortSchema(graphQLSchema))` exactly.
- **Sorted-position assertions explicit** ✅:
  - `schema-surface.test.ts`: new `"admin-user mutations sit at their SORTED positions in the Mutation root inventory"` test asserts the 5 admin-user mutations form a contiguous slice at indices `[firstIndex, firstIndex + 5)` in the alphabetically-sorted Mutation root inventory, with the slice contents equal to `["adminCreateUser", "adminSetUserBlocked", "adminSetUserDeleted", "adminSetUserSuspended", "adminUpdateUser"]` in that exact order.
  - `sdl-static-assertions.test.ts`: parallel `"both governance mutations sit at their SORTED positions in the Mutation root inventory"` test asserts the same contiguous-slice contract against the COMMITTED SDL artifact's Mutation type definition.

### 3.4.IV Instruction Verification

- **`.agents/instructions/backend.instructions.md`** compliance ✅:
  - **§Architecture & Layer Separation** — N/A for test files (no services/repos/graphql layers touched). The new tests introspect the built `graphQLSchema` and parse the committed SDL artifact — no layer-crossing.
  - **§Pothos / GraphQL** — the introspection helpers (`authScopesSnapshot`, `mutationField`, `declaredAuthScopes`-style `Reflect.get` reads) follow the established pattern (mirrors `handshake-code-surface.test.ts:59-82`); no dynamic imports; no hardcoded error strings (the `throw new Error(...)` calls use descriptive test-failure messages, not user-facing error strings — these are test-tier assertions, not service-layer error paths).
  - **§Type Definition Pattern** — N/A (no new types created).
  - **§Barrel Files Conventions** — N/A (test files only).
  - **§i18n / Localized Errors** — N/A (test files don't produce user-facing error messages).
  - **§Logging** — ZERO `console.*` calls in either file (verified by grep).
  - **§Code Style** — NO nested ternary operators; NO `as` type assertions on `scopes.$all` (used `Reflect.get` instead — clean by construction).
  - **§Linting Rules** — ZERO `oxlint-disable` / `biome-ignore` comments introduced.
- **`.agents/instructions/tests.instructions.md`** compliance ✅:
  - **§Database Tests** — N/A (these are static SDL assertion tests — no DB needed; runs without `runInRollback`).
  - **§Run-Test Script** — used `bun run test/scripts/run-test.ts <path>` for all test executions (not raw `bun test`).
  - **§GraphQL Integration Tests** — N/A (these are NOT integration tests — they're pure static SDL / built-schema introspection tests).
  - **§Quality** — `bun:test` imports (`describe`, `test`, `expect`); no `any` types; `bun tsgo` + `bun run lint` (sub-loop) clean after changes.
  - **§Static source-scan pin tests** — followed the rule "ANY change to that file must update those pins in the SAME change". The schema-surface pin tests now reflect the LIVE Mutation root inventory; any future drift will fail the exact-match assertions immediately (the INV-U4 grep-lock contract).
  - **§GraphQL Mutation Argument Coverage** — N/A (the new describe block pins the EXACT arg shapes for the 2 new DEV3-017 mutations, but no mutation is actually CALLED in these tests — they're introspection-tier).
  - **§Linting Rules** — ZERO `oxlint-disable` comments.
- **Auto-discovered AGENTS.md files** (per sub-loop): `AGENTS.md`, `backend/AGENTS.md`, `backend/graphql/AGENTS.md`, `backend/graphql/test/AGENTS.md` (when present) — all read; rules honored.
- **Clean comments (no plan-artifact references)** ✅ — verified by grep:
  ```
  $ rg -n 'REQ-061|Task 3\.4|Phase 3|tasks\.md|specs\.md|plan\.md|\.ai/plans' backend/graphql/test/schema-surface.test.ts backend/graphql/test/sdl-static-assertions.test.ts
  (1 pre-existing match — `sdl-static-assertions.test.ts:12` carries `REQ-032 / REQ-060 / REQ-061 / REQ-069` in the JSDoc header — this was ALREADY present in HEAD before this task; the diff confirms ZERO NEW plan-artifact references were ADDED. The "DEV3-017" references are the ticket name — explicitly allowed per the task spec.)
  ```
  The reconciliation notes use "DEV3-017" (ticket name — allowed) and "DEV3-016" (the prior ticket whose surface is being reconciled). No "Task 3.4" / "REQ-061" / "Phase 3" / "tasks.md" / "specs.md" / "plan.md" / ".ai/plans" references were introduced.

## Carry-forward for task 5.2 (INV-U4 grep-lock)

- The `schema-surface.test.ts` Mutation root inventory assertion now PINS the complete 23-op Mutation root inventory via `toEqual` exact-match. Any future addition of a `hardDelete*` or `deleteUser`-class Mutation field would FAIL this test (the expected list `PRE_3_1_MUTATION_FIELDS + DEV3_004_MUTATION_FIELDS + DEV3_005_MUTATION_FIELDS + DEV3_012_MUTATION_FIELDS + DEV3_013_MUTATION_FIELDS + DEV3_016_ADMIN_USER_MUTATION_FIELDS + DEV3_017_ADMIN_GOVERNANCE_MUTATION_FIELDS` does not include any `*hardDelete*` / `*delete*` field name).
- The `sdl-static-assertions.test.ts` Mutation root inventory assertion (`FROZEN_MUTATION_FIELDS`) is the SAME exact-match contract pinned against the COMMITTED SDL artifact — defense in depth (a change to the Pothos builder would fail `schema-surface.test.ts`; a change to the SDL artifact alone would fail `sdl-static-assertions.test.ts` AND the byte-identity parity check in `plan-catalog.schema.test.ts`).
- This is one of the two INV-U4 grep-locks (the other is the source-code scan in task 5.2 — that scan will look for `hardDelete` / `deleteUser`-class identifiers in `backend/**/*.ts` source files). The schema-surface static assertion now provides the test-tier grep-lock: it's the test that would RED if anyone silently added a hard-delete mutation.
- The "admin-user mutations sit at their SORTED positions" test in both files additionally pins the SORTED ORDER — any re-ordering of the Mutation root fields (which `lexicographicSortSchema` would emit alphabetically anyway) would fail the contiguous-slice assertion. This is the explicit sorted-position lock.

## Carry-forward for task 4.x (frontend documents + UI)

- The DEV3-017 admin-governance pair is now LIVE in the schema (since task 3.1) and PINNED at the schema-surface tier (since this task 3.4). Task 4.1 (frontend mutation documents) can write `adminSetUserSuspendedMutationDocument` + `adminSetUserBlockedMutationDocument` TypedDocumentNodes against the EXACT arg shapes pinned here:
  - `adminSetUserBlocked($id: Int!, $blocked: Boolean!)` — both args required (NonNull).
  - `adminSetUserSuspended($id: Int!, $suspended: Boolean!, $periodDays: Int)` — `id` + `suspended` required; `periodDays` optional (nullable).
- The frontend documents contract test (if extended per task 4.1's contract) can cross-reference the schema-surface pins here for the canonical arg shapes (the SDL-side pin in `sdl-static-assertions.test.ts` is the source-of-truth text clients parse).

## Hazards discovered

- (none NEW) — clean execution; no divergence from plan; no cross-file dependencies surfaced beyond the expected baseline reconciliation.
- **Pre-existing baseline drift** (DEV3-016 admin-user-management surface never pinned in `schema-surface.test.ts` / `sdl-static-assertions.test.ts`) — now reconciled as a DOCUMENTED one-time reconciliation (NOT a silent baseline flip). The reconciliation note in both files' JSDoc headers explicitly identifies the prior drift, the empirical evidence substrate, and the "NOT a silent baseline flip" caveat. This is exactly the protocol REQ-061 prescribes ("IF stale THEN re-anchor them to the live surface as a documented reconciliation AND THEN extend with the two new mutation names, in ONE changeset with the reconciliation recorded in the task outcome (never a silent baseline flip)").
- **Pre-existing sandbox state**: the working tree carries the cumulative DEV3-017 changeset from prior phases (1.x, 2.x, 3.1, 3.2, 3.3). The 2 test-file edits + the hoisted module-scope `mutationField` helper refactor are the ONLY changes attributable to task 3.4. `git diff --name-only` filtered for 3.4-owned files:
  - `backend/graphql/test/schema-surface.test.ts` (MODIFIED — reconciled + extended + refactored)
  - `backend/graphql/test/sdl-static-assertions.test.ts` (MODIFIED — reconciled + extended)
- **`admin-governance.matrix.test.ts` DB-backed tiers** continue to ride the pre-existing ECONNREFUSED hazard (PostgreSQL unavailable on this sandbox — documented in `3-3-outcome.md` as a baseline-acknowledgement pattern). Tier 0 (the introspection tier — the part that pins the `$all` scope declaration) passes — that's the part that cross-references this task's `$all` scope pin in `schema-surface.test.ts`.
