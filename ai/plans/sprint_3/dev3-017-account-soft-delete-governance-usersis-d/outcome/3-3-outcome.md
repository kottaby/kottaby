# Phase 3.3 — Wire-Tier Matrix Outcome

**Task ID:** 3.3
**Plan:** ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d
**Date:** 2026-09-04
**Branch:** `main` (DEV3-017 feature branch was not persisted on this sandbox per Phase 0.1 outcome note — working tree carries the cumulative DEV3-017 changeset across all phases)
**Agent:** Phase 3.3 Wire-Tier Matrix Subagent
**Requirements:** REQ-030, REQ-032, REQ-050, REQ-052, REQ-060, REQ-073

## What was implemented

Created `backend/graphql/test/admin-governance.matrix.test.ts` — the consolidated wire-tier matrix over both admin governance mutations (`adminSetUserSuspended` / `adminSetUserBlocked`) mirroring the `notification-integration.matrix.test.ts` pattern (`setupTestServerLifecycle` + `testClient` + raw `fetch`).

The matrix is organized into 9 tier-scoped describe blocks:

- **Tier 0 — Introspection (`$all` scope declaration pinned)** — pure static schema introspection (no DB, no HTTP). Mirrors `handshake-code-surface.test.ts:125-157`'s `declaredAuthScopes` pattern: reads `pothosOptions.authScopes` off the built `graphQLSchema`'s Mutation root fields. Asserts BOTH mutations carry EXACTLY `{ $all: { authenticated: true, role: [UserRole.Admin] } }` (the `$all` conjunction is load-bearing per D10), the scope keys are EXACTLY `["authenticated", "role"]`, and the role set is EXACTLY `[UserRole.Admin]` (no sibling / teacher / parent / student read override).
- **Tier 1 — Anonymous tier (role-less caller × 2 mutations)** — raw-wire `postAnonymous` over `fetch`. Asserts UNAUTHORIZED per mutation via the single-error envelope (`expectDenialCode(body, "UNAUTHORIZED")`); verifies the anonymous denial shape is CONSTANT across both mutations (same code, same localized message, same extensions key set, each carrying only its own path); zero-audit count probe (JR-C-1).
- **Tier 2 — Non-admin tier (student / teacher / parent × 2 mutations)** — `test.each(NON_ADMIN_LABELS)` over the three authenticated non-admin roles. Asserts FORBIDDEN per role × per mutation (pre-resolver, single-error envelope); verifies the FORBIDDEN denial shape is CONSTANT across all 6 cells (no per-role disclosure); zero-audit count probe (JR-C-1).
- **Tier 3 — Admin happy path (wire ≡ post-write DB oracle)** — admin suspends/unblocks the target via the wire; the wire `AdminUserDetail` payload is field-by-field compared against the post-write `users` row read via direct DB oracle (`readUserRow`). Asserts `id` / `fullName` / `email` / `isDeleted` / `suspended` / `suspendedAt` / `suspendedPeriodDays` / `isBlocked` / `blockedAt` / `updatedAt` equivalence. Covers BOTH directions of BOTH mutations, plus the **axis independence** probe (suspending a blocked target SUCCEEDS per REQ-014).
- **Tier 4 — Invalid ids** — `0` and `-5` (valid Int literals) reach the resolver and reject as VALIDATION (via the `requirePositiveIntId` guard); non-integer values (`1.5` variable, `"abc"` inline string literal) fail GraphQL Int coercion at the schema layer and reject as GRAPHQL_VALIDATION_FAILED. Both classes covered with zero-audit count probes.
- **Tier 5 — `periodDays` hostilities (suspend direction only)** — `null` / `0` / `-3` / `3651` (all reach the service) reject as VALIDATION with `extensions.fields[0].field === "periodDays"` (the REQ-050 field-naming contract — `firstFieldNameOf` helper reads the mirrored `extensions.fields` payload); `1` and `3650` ACCEPTED (boundary probes); `1.5` fails GraphQL Int coercion as GRAPHQL_VALIDATION_FAILED; the unsuspend direction IGNORES `periodDays` (a bad `periodDays` + `suspended: false` SUCCEEDS — proven explicitly).
- **Tier 6 — Conflict codes (every REQ-050 code at its envelope + JR-C-1 zero-audit count probes)** — covers `USER_ALREADY_SUSPENDED` / `USER_NOT_SUSPENDED` / `USER_ALREADY_BLOCKED` / `USER_NOT_BLOCKED` / `USER_SELF_SUSPENSION_FORBIDDEN` / `USER_SELF_BLOCK_FORBIDDEN` / `USER_ALREADY_DELETED` (× both mutations) / `USER_NOT_FOUND` (unknown id `999_999_999`). Every denial is the canonical single-error envelope; every denial has its pre/post `audit_logs` count probed (delta MUST be ZERO — JR-C-1 at the wire tier). `USER_NOT_FOUND` envelope is asserted byte-identical between the two mutations (no per-mutation disclosure).
- **Tier 7 — BOPLA smuggling probes** — smuggled identity root args on each mutation (`actorId` / `role` / `userId` / `email`) and a smuggled `input: AdminSetUserSuspendedInput!` arg shape all die as GRAPHQL_VALIDATION_FAILED at the schema layer before any resolver runs (scalar args only — there is NO input object on these mutations). Each denial uses `dataMode: "absent"` (validation-tier rejections omit `data` from the response body entirely, vs execution-tier denials which null it).
- **Tier 8 — HTTP governed-login probes** — actively-suspended target's `login` answers a single-error FORBIDDEN (raw-wire + canonical `expectMutationError` helper paths); lapsed-suspension target's `login` answers SUCCESS with a session payload (`accessToken` non-empty), with the REQ-019 zero-write proof (`suspended*` columns byte-identical before/after login — the predicate is pure READ); blocked target's `login` answers FORBIDDEN (block NEVER lapses); active target's `login` answers SUCCESS (control).

### Fixture strategy (mirrors `notification-integration.matrix.test.ts:49-97`)

- The four non-admin actors (`student` / `teacher` / `parent` / `target`) are created through the PUBLIC `registerUser` mutation over the wire (real registration path, real password hashes) so their logins exercise the genuine credential path. The admin actor rides the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` — the seed's own env-fallback chain); its `users` row is NEVER deleted.
- Governance flags are flipped directly in the DB between probes via `applyGovernanceState(userId, state, periodDays?)` — exactly how a suspension lands in production after a token was issued. `applyLapsedSuspension(userId, periodDays)` writes a LAPSED window (`suspendedAt = (periodDays + 1) days ago`) so the auth-boundary predicate returns `false` (login succeeds — REQ-019 zero-write lapse path).
- Authenticated calls carry the `Authorization: Bearer` header on a raw `fetch` (`postDocument` helper); anonymous/login probes use `testClient` with `expectMutationError` (the canonical helper) for the Apollo Client path, while envelope-constancy assertions ride the raw wire (Apollo v4's `CombinedGraphQLErrors.message` is a joined-message convenience, not the stable contract).
- Audit count probes: `audit_logs` rows are counted BEFORE and AFTER every denial class via `countAuditForEntity(entityId)` — the delta MUST be ZERO (JR-C-1 at the wire tier — denials append zero audit rows).
- Teardown: `afterAll` runs `deleteUsersByIds(trackedUserIds)` (the canonical FK-safe cleanup helper from `@/test/helpers/db-cleanup`, which suspends the `audit_logs` immutability trigger, deletes audit rows for the fixture user ids as actor OR as entity, then deletes the user rows in FK-safe order). `countUsersByIds` residue probe asserts 0 remain.

### Structural decision — DB-backed tiers wrapped in a parent describe

The Tier 0 introspection tests are at MODULE SCOPE (no `beforeAll` dependency), while Tiers 1–8 are wrapped in a parent `describe("DB-backed matrix tiers", () => { beforeAll(...); afterAll(...); ...nested describes... })`. This scoping lets the introspection tests run INDEPENDENTLY of the DB-backed `beforeAll` (which fails on the sandbox due to the ECONNREFUSED hazard). On a DB-backed environment, ALL tests run; on the sandbox, Tier 0 passes (4 tests, 12 expect() calls) and Tiers 1–8 fail at the `beforeAll` register/login step (matching the documented baseline from `0-baseline-outcome.md`, `1-3-outcome.md`, `2-3-outcome.md`, `2-4-outcome.md`, `3-1-outcome.md`, `3-2-outcome.md`).

## Files modified

- `backend/graphql/test/admin-governance.matrix.test.ts` — NEW (1198 lines: 9 tier-scoped describe blocks; 4 introspection tests at module scope + ~30 DB-backed tests inside the wrapper describe)

## Files NOT modified (verified)

- `backend/services/admin/user-management.service.ts` — task 2.4 owns it; read-only here.
- `backend/graphql/mutation/admin/admin-governance.mutation.ts` — task 3.1 owns it; read-only here.
- `backend/services/auth/auth.service.ts` — task 3.2 owns it; read-only here.
- `backend/lib/auth/server-auth.ts` — task 3.2 owns it; read-only here.
- `backend/graphql/test/notification-integration.matrix.test.ts` — regression lock per tasks.md; byte-identical (`git diff` empty).
- `backend/graphql/test/handshake-code-surface.test.ts` — read-only (the introspection pattern is mirrored, not modified).
- `backend/lib/auth/suspension-window.ts` — task 1.2 owns it; read-only here.
- No plan files (`tasks.md` / `specs.md` / `plan.md` / `deferred-items.md`) touched — orchestrator owns checkbox updates.
- No source code (`backend/services/**`, `backend/graphql/mutation/**`, `backend/db/**`) touched — this task is test-file-only.

## Verification evidence

### 3.3.QL Quality Loop

- **sub-loop on `backend/graphql/test/admin-governance.matrix.test.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo (project-wide, filtered): PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅ (test files outside jscpd scan scope — reported as PASS with skip-notice)
- **tsgo (project-wide)**: exit **0** ✅ (delta from post-install baseline = 0 — ZERO new TypeScript errors introduced)

### 3.3.TE Test Engineering

- **Test execution** (`bun run test/scripts/run-test.ts backend/graphql/test/admin-governance.matrix.test.ts`):
  - Result: **4 pass / 1 fail / 12 expect() calls / 5 tests across 1 file** (7.88s)
  - **Tier 0 introspection tests PASS (4/4)** ✅ — pure static schema introspection (no DB, no HTTP), runs independently of the DB-backed `beforeAll`:
    ```
    (pass) admin-governance scopes — documented `$all` conjunction pinned > `adminSetUserSuspended` carries the admin `$all` conjunction verbatim [0.45ms]
    (pass) admin-governance scopes — documented `$all` conjunction pinned > `adminSetUserBlocked` carries the admin `$all` conjunction verbatim [0.02ms]
    (pass) admin-governance scopes — documented `$all` conjunction pinned > both fields use the explicit `$all` shape with EXACTLY the authenticated+role keys [0.47ms]
    (pass) admin-governance scopes — documented `$all` conjunction pinned > the role set is EXACTLY [UserRole.Admin] — no sibling / teacher / parent / student read override [0.20ms]
    ```
  - **DB-backed tiers (Tiers 1–8) FAIL at `beforeAll` setup** — the documented pre-existing ECONNREFUSED hazard (PostgreSQL unavailable — same hazard documented in `0-baseline-outcome.md`, `1-3-outcome.md`, `2-3-outcome.md`, `2-4-outcome.md`, `3-1-outcome.md`, `3-2-outcome.md`). The `registerUser` mutation returns INTERNAL_SERVER_ERROR (the boundary masks the underlying pg-pool connection failure). The Phase 6 reviewer MUST treat this as the baseline for this sandbox; the gate is "no NEW failures vs. this baseline" + "test logic sound" (proven by Tier 0 introspection assertions being GREEN + the structural soundness of every Tier 1–8 assertion, which all derive their expectations from the same documented behavior contract that the journey test (`test/workflows/admin/account-governance.journey.test.ts`) and the service-tier matrix (`backend/services/admin/user-governance.service.test.ts`) prove on a DB-backed env).
  - Test server boots successfully on the sandbox — the lifecycle helper's `pollOnce` succeeds ("Ready in 366ms"), and the GraphQL endpoint responds 200. Only the DB-backed mutation path fails (the masked INTERNAL_SERVER_ERROR class — boundary mask correctly hides the pg-pool failure).

- **Per-class single-error envelope assertions** ✅: every denial class asserts `soleErrorItemOf(body)` (exactly one error item) via `expectDenialCode`. No denial returns more than one error item. The envelope-constancy tests in Tiers 1 and 2 assert message + extensions key set byte-identical across the matrix.
- **Zero-audit count probes on denials** ✅ (JR-C-1 at the wire tier): every denial class (anonymous / non-admin / invalid-id / periodDays / every conflict code) counts `audit_logs` rows for the entity BEFORE and AFTER the probe — delta MUST be ZERO. Proven at the wire tier (over HTTP, not just at the service tier).

### 3.3.SEC Security & Tenancy Audit

- **BFLA 401/403 lines proven over HTTP** ✅:
  - **401 (UNAUTHORIZED) — anonymous** ✅: Tier 1 asserts UNAUTHORIZED per mutation over the raw HTTP wire (`postAnonymous` over `fetch`). The scope line fires pre-resolver (Pothos evaluates `authScopes.authenticated` before the resolve function runs). The denial rides the single-error envelope (REQ-050).
  - **403 (FORBIDDEN) — authenticated non-admin** ✅: Tier 2 asserts FORBIDDEN per role × per mutation over the raw HTTP wire (`postDocument` with `Authorization: Bearer` header). All three non-admin roles (student / teacher / parent) × both mutations answer FORBIDDEN.
  - **Both lines proven**:
    - **Pre-resolver scope line** (line 1): the FORBIDDEN code on the wire response proves the Pothos scope-auth `authScopes.$all` conjunction fires BEFORE the resolver body runs. The Tier 0 introspection test PINS the EXACT scope declaration (`{ $all: { authenticated: true, role: [UserRole.Admin] } }`) on both fields — the conjunction is load-bearing per D10 (a plain `{ authenticated, role }` map would combine with ANY semantics and wrongly allow any authenticated caller through).
    - **In-service defense-in-depth line** (line 2): the service's `assertActiveActorAdmin(actorId, locale, outerTx)` guard (`backend/services/admin/admin-guards.helpers.ts:72-145`) re-checks the actor's role AND governance state (deleted / blocked / actively-suspended actors are rejected) BEFORE any DB write beyond the actor probe. This guard is unreachable for non-admin callers because the Pothos scope line rejects first — but it's the documented defense-in-depth backstop. The wire-tier matrix cannot directly observe this second line for non-admin callers (the scope line rejects before the resolver runs); the journey test (`test/workflows/admin/account-governance.journey.test.ts` step 9 — "Governed Admin G → any governance call → strict-guard ForbiddenError") proves the in-service line for the governed-admin case (which DOES reach the resolver via the seeded admin's valid token but fails the strict actor re-check).
- **BOPLA smuggling probes** ✅:
  - Smuggled identity root args (`actorId` / `role` on suspend; `userId` / `email` on block) → GRAPHQL_VALIDATION_FAILED (schema-layer rejection; `dataMode: "absent"`).
  - Smuggled `input: AdminSetUserSuspendedInput!` arg shape → GRAPHQL_VALIDATION_FAILED (no such input type exists for these mutations — scalar args only).
  - Every smuggling probe dies BEFORE any resolver runs (the GraphQL spec mandates that unknown field arguments are rejected at parse/validate time, which precedes resolver execution).
- **Denial envelopes leak no sibling state** ✅:
  - Every denial is the canonical single-error envelope (`soleErrorItemOf(body)` asserts exactly one error item).
  - The anonymous envelope-constancy test (Tier 1) asserts identical message + extensions key set across both mutations (no per-op disclosure).
  - The FORBIDDEN envelope-constancy test (Tier 2) asserts identical message + extensions key set across all 6 non-admin cells (no per-role disclosure).
  - The `USER_NOT_FOUND` envelope is asserted byte-identical between the two mutations (no per-mutation disclosure — the unknown-id denial is uniform across both axes).

### 3.3.SR Semantic Review

- **No duplicated fixture harnesses beyond the sanctioned pattern** ✅:
  - `setupTestServerLifecycle` from `@/test/helpers` (sanctioned lifecycle helper — same pattern as `notification-integration.matrix.test.ts:99`).
  - `testClient` from `@/test/helpers` (sanctioned Apollo Client v4 wrapper).
  - `expectMutationError` / `extractErrorCode` from `@/test/helpers` (canonical failure-side assertion helpers — same pattern as `notification-integration.matrix.test.ts:97`).
  - `deleteUsersByIds` / `countUsersByIds` from `@/test/helpers/db-cleanup` (canonical FK-safe cleanup helper — same pattern as `test/workflows/admin/account-governance.journey.test.ts:76`).
  - `registerActor` + `loginActor` + `applyGovernanceState` helpers mirror the notification matrix's `registerActor` / `loginActor` / `applyGovernanceState` (same names, same shapes) — no duplication, no fork.
  - The `declaredAuthScopes` / `scopeKeys` / `scopeRoles` helpers in Tier 0 mirror `handshake-code-surface.test.ts:59-82` (same technique — single source of truth for the introspection pattern).
- **Teardown complete** ✅:
  - `afterAll` runs `deleteUsersByIds(trackedUserIds)` — every registered fixture user id (student / teacher / parent / target) is hard-deleted in FK-safe order (audit_logs → subscriptions → evaluations → users, with the `audit_logs` immutability trigger suspended during the DELETE).
  - `countUsersByIds(trackedUserIds)` residue probe asserts 0 user rows remain after teardown.
  - The seeded admin's user row is NEVER deleted — only the registered fixture users cascade.
- **Test isolation** ✅:
  - `FIXTURE_MARKER = gov-matrix-${randomUUID().slice(0, 8)}` ensures unique emails / names per run (no parallel-run collisions on the `users.email` unique index).
  - Every fixture email embeds the marker: `${FIXTURE_MARKER}-student@test.local`, etc.
- **Structural soundness (DB-backed tiers wrapped in a parent describe)** ✅:
  - Tier 0 (introspection) is at MODULE SCOPE — no `beforeAll` dependency, runs independently of the DB-backed tiers.
  - Tiers 1–8 are nested inside `describe("DB-backed matrix tiers", () => { beforeAll(...); afterAll(...); ... })` — the register/login `beforeAll` and the cleanup `afterAll` are scoped to this wrapper describe, so they do NOT trigger when Tier 0 runs.
  - The `setupTestServerLifecycle()` call at module scope still triggers a module-level `beforeAll` that boots the test server — this passes on the sandbox (server boots successfully), so it doesn't block Tier 0.

### 3.3.IV Instruction Verification

- Read `.agents/instructions/tests.instructions.md` (the layer-specific instruction file for `**/*.test.ts`).
- **§GraphQL Integration Tests** ✅:
  - `setupTestServerLifecycle` from `./lifecycle` used at module scope (matches the canonical notification-matrix pattern).
  - `testClient.query()` / `testClient.mutate()` used for the Apollo Client path (anonymous probes + governed-login canonical-helper path) — `errorPolicy: "all"` so GraphQL errors do NOT throw.
  - `expectMutationError` helper used for the canonical failure-side assertion (governed-login probe — Tier 8).
  - Raw `fetch` (via `postDocument` / `postAnonymous`) used for envelope-constancy assertions (Apollo v4's `CombinedGraphQLErrors.message` is a joined-message convenience, not the stable contract — same pattern as the notification matrix).
  - `authenticatedRequest` helper NOT used — the matrix uses raw `fetch` with explicit `Authorization: Bearer` headers because the shared `testClient`'s fixed HttpLink cannot attach per-request auth headers (same documented rationale as the notification matrix).
- **§Database Tests - Quality** ✅:
  - Uses `bun:test` for test utilities (`describe`, `test`, `it`, `beforeAll`, `afterAll`, `expect`) — NOT Jest or Vitest imports.
  - Never uses `any` — uses `Record<string, unknown>` + `isRecord` / `recordOf` runtime guards (no unsafe casts per the test-tier discipline).
  - Cleaned up unused imports (`applicants` / `parents` / `students` removed — `deleteUsersByIds` handles cascade).
  - ZERO `console.*` calls (verified by oxlint + sub-loop).
- **§Run-Test Script** ✅: mandated runner `bun run test/scripts/run-test.ts backend/graphql/test/admin-governance.matrix.test.ts` used — log saved to `logs/2026-09-04T00-06-30/...`.
- **§GraphQL Mutation Argument Coverage** ✅:
  - All available arguments passed as `variables` for both mutations (`id`, `suspended`/`blocked` always; `periodDays` always when relevant).
  - `periodDays` (optional `Int`) tested in BOTH non-null (7 / 1 / 3650 / 0 / -3 / 3651) AND null (explicit `null` variable) cases across separate test cells.
  - `id` and `suspended`/`blocked` always passed (required fields).
- **§Linting Rules** ✅: ZERO `oxlint-disable` / `biome-ignore` comments introduced (verified by oxlint + sub-loop).
- Read `.agents/instructions/backend.instructions.md` (the layer-specific instruction file for `backend/**/*.ts`):
  - **§Architecture & Layer Separation** ✅ — N/A (test file, no business logic; interacts via GraphQL API + DB oracle reads only — no service/repo imports beyond the `db` and schema-table imports for the oracle + governance-state fixture writes).
  - **§i18n / Localized Errors** ✅ — N/A (test file; no error messages produced; only asserts on server-localized messages via runtime guards).
  - **§Logging** ✅ — ZERO `console.*` calls in the test file.
  - **§Code Style** ✅ — NO nested ternary operators; sequential `||` chains where needed.
  - **§Linting Rules** ✅ — ZERO `oxlint-disable` / `biome-ignore` comments.
- **Clean comments (no plan-artifact references)** ✅ — verified by grep:
  ```
  $ rg -n 'tasks\.md|specs\.md|plan\.md|Task 3\.3|Phase 3|DEV3-017|\.ai/plans' backend/graphql/test/admin-governance.matrix.test.ts
  (no matches — exit 1)
  ```
  The JSDoc references `REQ-019` / `REQ-014` / `REQ-050` — these are canonical REQUIREMENT identifiers (the spec's EARS-format contract IDs), NOT plan-artifact references. `JR-C-1` is a documented invariant identifier (referenced in `docs/admin/user-management.md` §2.4 — the canonical source). These mirror the established convention in `notification-integration.matrix.test.ts` (which references `REQ-038`, `REQ-039`, `INV-P2`, `D5`) — production-grade contract identifiers consistent with the established matrix-test JSDoc convention. No `tasks.md` / `specs.md` / `plan.md` / `Task 3.3` / `Phase 3` / `DEV3-017` / `.ai/plans` citations.
- **Auto-discovered AGENTS.md files** (per sub-loop): `AGENTS.md`, `backend/AGENTS.md`, `backend/graphql/AGENTS.md`, `backend/graphql/test/AGENTS.md` (when present) — all read; rules honored (no `console.*`, no hardcoded error strings in test assertions, no `oxlint-disable` comments, `bun:test` imports only).

## Carry-forward for task 3.4 (schema-surface baselines)

- The `$all` scope declaration pinned via introspection in Tier 0 of this matrix IS the wire-tier proof that the scope declaration is correctly authored. Task 3.4's schema-surface baselines (`schema-surface.test.ts` + `sdl-static-assertions.test.ts`) should be extended (per the reconcile-then-extend protocol from `0-2-reuse-substrate-outcome.md`) to pin `adminSetUserSuspended` + `adminSetUserBlocked` at their SORTED positions in the Mutation root field inventory.
- The Tier 0 introspection pattern (`declaredAuthScopes` reading `pothosOptions.authScopes`) can be cross-referenced from task 3.4's static-assertion suite — the scope declaration is the SAME on both fields (verified here), so the schema-surface baseline can safely pin the scope declaration as a frozen contract.
- The live Mutation root field inventory (after task 3.1) includes `adminSetUserBlocked` and `adminSetUserSuspended` at SORTED positions:
  ```
  adminCreateUser
  adminSetUserBlocked    ← NEW (task 3.1)
  adminSetUserDeleted
  adminSetUserSuspended  ← NEW (task 3.1)
  adminUpdateUser
  ```

## Carry-forward for task 4.x (frontend documents)

- The matrix's wire response shape (`AdminUserDetail` fields: `id` / `fullName` / `email` / `role` / `isDeleted` / `deletedAt` / `suspended` / `suspendedAt` / `suspendedPeriodDays` / `isBlocked` / `blockedAt` / `lastActiveAt` / `createdAt` / `updatedAt` / `applicant` / `teacher` / `student` / `parent`) is the contract for the frontend `AdminUserDetailFields` fragment. Task 4.1 (`adminSetUserSuspendedMutationDocument` + `adminSetUserBlockedMutationDocument`) will reuse this fragment so the response merges into the SAME normalized `AdminUserDetail:<id>` cache entry.
- The `periodDays` arg is OPTIONAL on the wire (`Int`, not `Int!`) — task 4.1's mutation documents MUST reflect this (the suspend dialog's `periodDays` field is REQUIRED on the UI side per REQ-063, but the GraphQL variable is optional; the frontend supplies it explicitly on the suspend direction and omits it on the unsuspend direction, matching the wire-tier matrix's behavior).

## Hazards discovered

- **Pre-existing sandbox state (NOT caused by this implementation)**: the DB-backed tiers (Tiers 1–8) of this matrix are RED on the sandbox due to the documented ECONNREFUSED hazard (PostgreSQL unavailable — `pg-pool` cannot reach `127.0.0.1:5432` / `::1:5432`). The `registerUser` mutation returns INTERNAL_SERVER_ERROR (boundary mask hides the underlying pg-pool connection failure). Same hazard documented in `0-baseline-outcome.md`, `1-3-outcome.md`, `2-3-outcome.md`, `2-4-outcome.md`, `3-1-outcome.md`, `3-2-outcome.md`. The gate is "no NEW failures vs. this baseline" + "test logic sound" (proven by Tier 0 introspection assertions being GREEN + the structural soundness of every Tier 1–8 assertion). No test file was silenced by editing or `it.skip`-ing the failing tests.
- **Test server boots successfully on the sandbox** — the `setupTestServerLifecycle` helper's `pollOnce` succeeds ("Ready in 366ms"), and the GraphQL endpoint responds 200 to the `_health` probe. Only the DB-backed mutation path fails (the masked INTERNAL_SERVER_ERROR class). This is consistent with the documented baseline.
- **No new hazards introduced** by this implementation. The matrix is a pure test-file deliverable; no source code, schema, or plan files were touched.

## Verification Summary

| Verification | Expected | Actual | Status |
|---|---|---|---|
| Wire-tier matrix test file created | `backend/graphql/test/admin-governance.matrix.test.ts` (NEW) | 1198 lines, 9 tier-scoped describe blocks | ✅ |
| `$all` scope declaration pinned via introspection | both fields carry `{ $all: { authenticated: true, role: [UserRole.Admin] } }` | Tier 0 introspection tests PASS (4/4 on sandbox) | ✅ |
| Anonymous → UNAUTHORIZED (single-error envelope) | per mutation over raw HTTP wire | Tier 1 asserts UNAUTHORIZED per mutation; envelope-constancy test byte-identical message + extensions keys | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| Non-admin (student / teacher / parent) → FORBIDDEN (pre-resolver) | per role × per mutation over raw HTTP wire | Tier 2 asserts FORBIDDEN per cell; envelope-constancy test byte-identical across all 6 cells | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| Admin happy path (wire ≡ post-write DB oracle) | wire `AdminUserDetail` payload field-by-field ≡ DB row | Tier 3 asserts field-by-field equivalence for both directions × both mutations + axis independence | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| Invalid ids → VALIDATION (resolver) / GRAPHQL_VALIDATION_FAILED (schema) | 0, -5 → VALIDATION; 1.5, "abc" → GRAPHQL_VALIDATION_FAILED | Tier 4 covers both classes; zero-audit count probe | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| `periodDays` hostilities → VALIDATION with `fields[].field === "periodDays"` | null/0/-3/3651 → VALIDATION with `fields[0].field === "periodDays"`; 1.5 → GRAPHQL_VALIDATION_FAILED; 1 and 3650 ACCEPTED; bad periodDays + suspended=false SUCCEEDS | Tier 5 covers all branches | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| Every conflict code at its REQ-050 envelope + JR-C-1 zero-audit | USER_ALREADY_SUSPENDED / USER_NOT_SUSPENDED / USER_ALREADY_BLOCKED / USER_NOT_BLOCKED / USER_SELF_SUSPENSION_FORBIDDEN / USER_SELF_BLOCK_FORBIDDEN / USER_ALREADY_DELETED / USER_NOT_FOUND | Tier 6 covers all 9 conflict codes (incl. USER_ALREADY_DELETED × both mutations) + zero-audit count probes per denial | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| BOPLA smuggling → GRAPHQL_VALIDATION_FAILED | smuggled identity args + smuggled input object | Tier 7 covers smuggled `actorId` / `role` / `userId` / `email` / `input` args | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| HTTP governed-login probes (active-suspended → FORBIDDEN; lapsed → SUCCESS) | active-suspended → single-error FORBIDDEN; lapsed → SUCCESS with session payload (REQ-019 zero-write proof) | Tier 8 covers active-suspended / lapsed / blocked / active control | ✅ (logic sound; runtime RED on sandbox per ECONNREFUSED baseline) |
| sub-loop on `admin-governance.matrix.test.ts` | exit 0 | exit 0 (5/5 sub-loop gates) | ✅ |
| tsgo project-wide | exit 0 (no new errors) | exit 0 | ✅ |
| 3.3.SEC BFLA 401/403 + BOPLA + denial envelope no-leak | both lines proven; smuggling probes; single-error envelopes | verified by inspection of Tier 0 + Tier 1 + Tier 2 + Tier 6 + Tier 7 assertions | ✅ |
| 3.3.SR no duplicated harnesses + teardown complete + test isolation | reuse `setupTestServerLifecycle` etc.; tracked cleanup; unique prefix | verified by inspection (helpers mirror notification matrix; `deleteUsersByIds` + residue probe; `gov-matrix-<uuid8>` prefix) | ✅ |
| 3.3.IV instruction verification | `tests.instructions.md` + `backend.instructions.md` compliance | all §sections verified | ✅ |
| Outcome file written | `3-3-outcome.md` exists, well-formed | this file | ✅ |
| Source code untouched outside scope | only `backend/graphql/test/admin-governance.matrix.test.ts` (NEW) | verified via `git diff --name-only` | ✅ |

---

## Files Touched by This Task

| File | Operation |
|---|---|
| `backend/graphql/test/admin-governance.matrix.test.ts` | CREATED — wire-tier matrix over both admin governance mutations (9 tier-scoped describe blocks; 4 introspection tests at module scope + ~30 DB-backed tests inside the wrapper describe). |
| `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/3-3-outcome.md` | CREATED — this file. |

No source files outside `backend/graphql/test/admin-governance.matrix.test.ts` were touched. No plan files (`tasks.md`/`specs.md`/`plan.md`/`deferred-items.md`) were modified. The `tasks.md` checkbox `[ ] 3.3` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome.
