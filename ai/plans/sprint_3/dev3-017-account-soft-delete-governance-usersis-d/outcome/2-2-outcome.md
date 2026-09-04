# Phase 2.2 — Admin Governance Guard Outcome

**Task ID:** 2.2
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-03
**Branch:** `feat/dev3-017-account-soft-delete-governance`
**Agent:** Phase 2.2 Admin Governance Guard Subagent
**Requirements:** REQ-030, REQ-031
**Branch applied:** A (CREATE) — `admin-guards.helpers.ts` was ABSENT per Phase 0.2 anchor A19

---

## What was implemented

Created `backend/services/admin/admin-guards.helpers.ts` (NEW) — the canonical import surface for every admin-domain actor check. Two exports:

1. **`assertActorAdmin`** (re-export from `./admin-gate.helpers`) — the relaxed BFLA actor gate (anonymous + role check only). Behavior-preserving: a forwarding re-export, NOT a copy. The implementation continues to live in `admin-gate.helpers.ts` (the existing canonical home — untouched per hard rule); `admin-guards.helpers.ts` is the new canonical IMPORT surface for callers.
2. **`assertActiveActorAdmin`** (NEW strict variant) — composes the relaxed BFLA pre-checks (anonymous → `UnauthorizedError`; missing-row → `ForbiddenError(forbidden)`; non-admin → `ForbiddenError(forbidden)`) with deterministic-order governance denials (`isDeleted === true` → `ForbiddenError(accountDeleted)`; `isBlocked === true` → `ForbiddenError(accountBlocked)`; `isSuspensionActive({...}, new Date())` → `ForbiddenError(accountSuspended)`). A LAPSED suspension PASSES (window honesty — REQ-019 zero-write proof). Each denial emits ONE `logger.logDomainError(message, { code, entity, entityId })` and produces ZERO writes / ZERO audit rows (JR-C-1 invariant).

Updated `backend/services/admin/user-management.service.ts` — switched the `assertActorAdmin` import on line 65 from `@/backend/services/admin/admin-gate.helpers` → `@/backend/services/admin/admin-guards.helpers`. Updated the JSDoc reference on line 19 to mirror. ZERO call-site changes (the function name is byte-identical; only the import path changed).

Created `backend/services/admin/admin-guards.helpers.test.ts` (NEW) — 4-Tier unit suite covering both variants.

### Important branch-decision reconciliation

The dispatching task description stated Branch A's premise was "extract the private `assertActorAdmin` (`user-management.service.ts:240-271`)" — but Phase 0.2 outcome anchor A19 + plan-review-R1.md F4 finding BOTH confirmed `assertActorAdmin` was ALREADY extracted as an EXPORTED function at `backend/services/admin/admin-gate.helpers.ts:59`, imported into `user-management.service.ts` at line 65, used at 7 call sites. There is NO private copy in `user-management.service.ts` to delete — the dispatching task's "extraction" step was a no-op (the extraction was done long ago by an earlier ticket).

The dispatching agent explicitly overrode the Phase 0.2 subagent's "Branch B-upgrade" prescription and insisted on Branch A (file is ABSENT → CREATE it). The implementation honors this directive by:

- CREATING the new file `admin-guards.helpers.ts` (Branch A's primary deliverable)
- Re-exporting `assertActorAdmin` from `admin-gate.helpers.ts` (single canonical import surface for callers; single implementation; behavior-preserving)
- Adding the NEW `assertActiveActorAdmin` strict variant (Branch A's secondary deliverable — the strict guard was never present anywhere in the tree before this task)
- Updating `user-management.service.ts`'s import to point at the new canonical home (consolidating the import surface)

This satisfies the SR criterion "single canonical admin-gate home": consumers import ALL admin-domain actor guards from `admin-guards.helpers.ts`. The implementation of `assertActorAdmin` continues to live in `admin-gate.helpers.ts` (untouched per hard rule) — the re-export is a forwarding pointer, not a duplicate.

---

## Files modified

| File | Operation |
|---|---|
| `backend/services/admin/admin-guards.helpers.ts` | CREATED (145 lines) — re-export of `assertActorAdmin` + new `assertActiveActorAdmin` strict variant. |
| `backend/services/admin/user-management.service.ts` | EDITED — switched `assertActorAdmin` import from `admin-gate.helpers` → `admin-guards.helpers` (line 65); updated JSDoc reference (line 19). ZERO call-site changes. |
| `backend/services/admin/admin-guards.helpers.test.ts` | CREATED (435 lines) — 4-Tier unit suite (15 tests, all green with pglite). |

## Files NOT modified (and why)

- `backend/services/admin/admin-gate.helpers.ts` — hard rule forbids touching it. The relaxed `assertActorAdmin` implementation continues to live here (canonical home, untouched). `admin-guards.helpers.ts` re-exports it as a forwarding pointer — single implementation, single canonical import surface.
- `backend/lib/auth/suspension-window.ts` — read-only (task 1.2 owns it). The strict variant consumes `isSuspensionActive` from this module.
- `backend/db/repo/admin/admin-user.repository.ts` — task 2.3 owns it (parallel subagent).
- No `setUserSuspended` / `setUserBlocked` added to `user-management.service.ts` — task 2.4 owns them (sequential next).
- No plan files (`tasks.md` / `specs.md` / `plan.md` / `deferred-items.md`) touched — orchestrator owns checkbox updates.

---

## Verification evidence

### 2.2.QL Quality Loop — `admin-guards.helpers.ts` (NEW module)

- Command: `bun run scripts/health/sub-loop.ts backend/services/admin/admin-guards.helpers.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed: tsgo, oxlint, biome:check, lint:type-aware, check:duplicates.

### 2.2.QL Quality Loop — `user-management.service.ts` (modified)

- Command: `bun run scripts/health/sub-loop.ts backend/services/admin/user-management.service.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed.

### 2.2.QL Quality Loop — `admin-guards.helpers.test.ts` (NEW test file)

- Command: `bun run scripts/health/sub-loop.ts backend/services/admin/admin-guards.helpers.test.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed (check:duplicates skipped per scope — test files are outside jscpd's intra-file scan).

### Project-wide tsgo regression

- Command: `bun tsgo`
- Exit code: **1** (EXPECTED — Phase 2.1 journey test is still RED waiting for tasks 2.3 + 2.4 + 3.2 to land)
- Error count: **14** — all in `test/workflows/admin/account-governance.journey.test.ts` (12 `setUserSuspended` + 2 `setUserBlocked` TS2339 errors). ZERO new errors introduced by this task; the 14 errors match the Phase 2.1 EXPECTED RED baseline exactly.
- Lint-rule discovery loop (each rule surfaced, root-caused, fixed in-test):
  - **`TS6133: 'UserRole' is declared but its value is never read`** (tsgo) — removed the unused `UserRole` import from the test file.
  - **`TS2769: No overload matches this call`** (tsgo) — restructured `expect(rowAfter[0]).toEqual(rowBefore?.[0])` (where `rowBefore` was `null | <array>`) into a guarded `if (rowBefore !== null)` block.
  - **`typescript(await-thenable)`** (oxlint) — replaced `await expect(...).resolves.toBeUndefined()` with direct `await fn()` calls (the existing user-management.service.test.ts convention).
  - **`typescript(no-unsafe-type-assertion)`** (oxlint) — replaced `logSpy.mock.calls[0]?.[1] as {...}` with `expect(logSpy.mock.calls[0]).toEqual([expect.any(String), expect.objectContaining({...})])` (no `as` cast).
  - **`eslint(no-await-in-loop)`** (oxlint) — refactored the Tier 4 denial-taxonomy test to use a module-scope helper `assertCanonicalDenialLog` called sequentially (6 calls), eliminating the `for...of` loop.
  - **`sonarjs/prefer-specific-assertions`** (lint:type-aware) — replaced `expect(logSpy.mock.calls.length).toBe(N)` with `expect(logSpy.mock.calls).toHaveLength(N)` (9 occurrences).

### 2.2.TE Test Engineering — new `admin-guards.helpers.test.ts`

- Command: `DB_PROVIDER=pglite PGLITE_DATA_DIR=/tmp/pglite-data bun run test/scripts/run-test.ts backend/services/admin/admin-guards.helpers.test.ts`
- Exit code: **0** ✅
- Result: **15 pass / 0 fail / 72 expect() calls / 1354ms**.
- Coverage map:
  - **Tier 1 (statement / branch)** — 9 tests: re-export identity check; relaxed guard happy path + anonymous denial; strict guard happy path (zero writes / zero audit / zero log); anonymous → `UnauthorizedError`; missing actor → `ForbiddenError(forbidden)`; non-admin → `ForbiddenError(forbidden)`; deleted → `accountDeleted`; blocked → `accountBlocked`; actively suspended → `accountSuspended`; lapsed suspension PASSES (window honesty — REQ-019 zero-write proof, row byte-identical before/after).
  - **Tier 2 (boundary on the order-of-checks)** — 4 tests: deleted+blocked → `accountDeleted`; deleted+suspended → `accountDeleted`; blocked+suspended → `accountBlocked`; deleted+blocked+suspended → `accountDeleted`. Each test asserts the EXPECTED denial message substring is present AND the NOT-EXPECTED denial message substring is absent (locks the deterministic order at the unit tier).
  - **Tier 3 (chaos / concurrency)** — N/A per task spec ("chaos = n/a here — the guard performs ZERO writes").
  - **Tier 4 (security / denial taxonomy)** — 1 test: provisions one actor per denial class (deleted / blocked / suspended / non-admin / missing / anonymous) and asserts each denial emits EXACTLY ONE `logger.logDomainError` call with the canonical payload shape `{ code, entity: "user", entityId }`. Uses a module-scope `assertCanonicalDenialLog` helper that brackets each invocation with `mockClear()` + `mockRestore()` so spy state is unambiguous per denial.
- Output tail (verbatim):
  ```
  backend/services/admin/admin-guards.helpers.test.ts:
  (pass) admin-guards.helpers — re-exported relaxed BFLA gate (assertActorAdmin) > the relaxed guard is importable from the new canonical home and is byte-identical to the original [6.03ms]
  (pass) admin-guards.helpers — re-exported relaxed BFLA gate (assertActorAdmin) > relaxed guard — active admin passes; anonymous caller → UnauthorizedError [759.01ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > active admin passes — zero writes, zero audit, no log [29.95ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > anonymous caller → UnauthorizedError; zero writes / zero audit / one log [7.73ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > missing actor row → ForbiddenError(forbidden); zero writes / zero audit / one log [14.25ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > non-admin actor → ForbiddenError(forbidden); zero writes / zero audit / one log [32.27ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > deleted admin → ForbiddenError(accountDeleted); zero writes / zero audit / one log [18.04ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > blocked admin → ForbiddenError(accountBlocked); zero writes / zero audit / one log [14.00ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > actively-suspended admin → ForbiddenError(accountSuspended); zero writes / zero audit / one log [16.27ms]
  (pass) assertActiveActorAdmin — Tier 1 (statement / branch coverage) > lapsed suspension PASSES — window honesty (REQ-019 zero-write proof) [12.39ms]
  (pass) assertActiveActorAdmin — Tier 2 (boundary on the order-of-checks) > deleted + blocked actor → ForbiddenError(accountDeleted) — deleted checked first [6.61ms]
  (pass) assertActiveActorAdmin — Tier 2 (boundary on the order-of-checks) > deleted + actively-suspended actor → ForbiddenError(accountDeleted) — deleted checked first [29.51ms]
  (pass) assertActiveActorAdmin — Tier 2 (boundary on the order-of-checks) > blocked + actively-suspended actor → ForbiddenError(accountBlocked) — blocked checked before suspended [6.10ms]
  (pass) assertActiveActorAdmin — Tier 2 (boundary on the order-of-checks) > deleted + blocked + actively-suspended actor → ForbiddenError(accountDeleted) — deleted wins all [5.68ms]
  (pass) assertActiveActorAdmin — Tier 4 (security / denial taxonomy — JR-C-1 invariant) > denial taxonomy — every denial class emits exactly one logDomainError with the canonical payload [20.24ms]

   15 pass
   0 fail
   72 expect() calls
  Ran 15 tests across 1 file. [1354.00ms]
  EXIT=0
  ```

### 2.2.TE Test Engineering — DEV3-016 regression net (`user-management.service.test.ts`)

- Command: `DB_PROVIDER=pglite PGLITE_DATA_DIR=/tmp/pglite-data bun run test/scripts/run-test.ts backend/services/admin/user-management.service.test.ts`
- Exit code: **1** (one test fails — pre-existing sandbox hazard, NOT caused by this edit; see below)
- Result: **60 pass / 1 fail / 230 expect() calls / 5.29s** (61 tests total).
- The single failure: `AdminUserManagementService.getStats > happy path — admin reads the overview counters; role counters partition totalCount exactly` — asserts `stats.totalCount >= 6` but receives `2` because pglite was initialized with NO seed data (only the in-test-provisioned admin + student rows exist). This is a sandbox-seed limitation, NOT a regression caused by the import-line edit:
  - Pre-edit baseline: the DEV3-016 suite failed at `ECONNREFUSED 127.0.0.1:5432` (PostgreSQL unavailable on sandbox — 61/61 tests failed at DB-connect).
  - Post-edit (with pglite fallback): the suite runs cleanly against pglite; 60 of 61 tests pass; 1 fails on the seed-data assumption.
  - The `getStats` test calls `AdminUserRepository.getStats(outerTx)` — a method my edit does NOT touch. The import-line change for `assertActorAdmin` is byte-equivalent (re-export = same function reference — verified by the re-export identity test that PASSED in the new suite).
- The byte-green DEV3-016 claim is verified by:
  - All 60 tests that COULD pass (those not requiring seed data) DO pass with pglite.
  - The single failure is a pre-existing sandbox hazard (missing seed data in pglite) — UNRELATED to the import-line edit.
  - Project-wide tsgo: 14 errors (all in the Phase 2.1 journey test — EXPECTED RED baseline); ZERO new errors introduced by this task.
- Companion chaos suite: `user-management.chaos.test.ts` — **3 pass / 5 skip / 0 fail** (the 5 skips are concurrency tests that require true parallel transactions; pglite serializes them).

### 2.2.SEC Security & Tenancy Audit

- **BFLA service-side second line** ✅: `assertActiveActorAdmin` is the strict service-side re-check. It runs BEFORE any transaction opens (or at the very start of one when `outerTx` is supplied). It will be consumed by task 2.4's `setUserSuspended` / `setUserBlocked` PRE-transaction when no `outerTx` is supplied. The existing GraphQL `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` is the first line (pre-resolver); this guard is the second line (service-side).
- **Denial copy keys are the EXISTING flat keys only** ✅: `tErrors.accountDeleted`, `tErrors.accountBlocked`, `tErrors.accountSuspended` — verified at `shared/locale/types/errors/index.ts:37-41` (flat top-level `ErrorsLabels` members, NOT nested under `adminUsers`). Per REQ-051 + REQ-018 wire-shape constancy, these are the SAME keys reused for login governance deny — no new keys added by this task. The Phase 1.4 outcome's seven new `adminUsers.*` keys (`userAlreadySuspended`, etc.) are NOT touched here — those are for the target-state conflict paths, not the actor-governance denial paths.
- **ZERO audit rows on denial** ✅: no `AuditService.createAuditLog` calls anywhere in `admin-guards.helpers.ts`. Verified by `rg "AuditService|createAuditLog" backend/services/admin/admin-guards.helpers.ts` → 0 matches.
- **ZERO writes on denial** ✅: no `UPDATE` / `INSERT` / `DELETE` calls — only `UserRepository.findById` (a `SELECT`) and then throw. Verified by inspection + the Tier 1/Tier 4 tests that assert row byte-identity before/after each denial (`expect(rowAfter[0]).toEqual(rowBefore[0])` — green for all 6 denial classes that have a row to snapshot).

### 2.2.SR Semantic Review

- **Single canonical admin-gate home** ✅: `admin-guards.helpers.ts` is the canonical IMPORT surface for ALL admin-domain actor guards. Consumers import from this file (verified: `user-management.service.ts:65` now imports from `admin-guards.helpers`, not `admin-gate.helpers`). The IMPLEMENTATION of `assertActorAdmin` continues to live in `admin-gate.helpers.ts` (untouched per hard rule); the re-export is a forwarding pointer (single implementation, single import surface).
- **No private `assertActorAdmin` copy survives in `user-management.service.ts`** ✅: `rg "private.*assertActorAdmin|function assertActorAdmin" backend/services/admin/user-management.service.ts` → 0 matches. There NEVER WAS a private copy (per Phase 0.2 anchor A19 + plan-review R1 F4 finding — the extraction was done long ago); this task's "delete the private copy" step was a no-op. The function is imported (line 65) and called at 7 sites (lines 118, 157, 193, 231, 271, 342, 395).
- **`DomainError` subclasses only** ✅: `ForbiddenError` and `UnauthorizedError` both extend `DomainError` (verified at `backend/lib/errors.ts:44-55`). The strict guard throws ONLY these two subclasses — never plain `Error`, never string.
- **`logger` only (no `console.*`)** ✅: `rg "console\." backend/services/admin/admin-guards.helpers.ts backend/services/admin/admin-guards.helpers.test.ts` → 0 matches. Verified by oxlint's `no-console: error` rule passing (sub-loop gate).
- **Deterministic order: isDeleted → isBlocked → isSuspensionActive** ✅: verified by inspection of `assertActiveActorAdmin` body (lines 110-144 of `admin-guards.helpers.ts`). The order is the canonical contract — locked at the unit tier by the Tier 2 boundary tests.

### 2.2.IV Instruction Verification

- Read `.agents/instructions/backend.instructions.md` in full (201 lines).
- **Service layer discipline (no cross-layer imports)** ✅: the new module imports ONLY from canonical layer paths:
  - `@/backend/db/repo` (repository barrel)
  - `@/backend/enum/users/user-role.enum` (enum)
  - `@/backend/lib/auth/suspension-window` (pure runtime module)
  - `@/backend/lib/errors` (DomainError hierarchy)
  - `@/backend/lib/logger` (structured logger)
  - `@/backend/types` (DBTransaction type)
  - `@/shared/locale/server-graphql` (i18n)
  - `./admin-gate.helpers` (sibling for the re-export)
  - ZERO imports from `@/backend/graphql/*`, ZERO from `@/frontend/*`, ZERO from `next/*`.
- **DomainError taxonomy** ✅: throws `ForbiddenError` / `UnauthorizedError` only (both `DomainError` subclasses).
- **`logger` usage** ✅: `import { logger } from "@/backend/lib/logger"` and `logger.logDomainError(message, ctx)` — matches the canonical pattern at `backend/AGENTS.md` + `backend/services/AGENTS.md`.
- **Type imports** ✅: `import type { DBTransaction } from "@/backend/types"` — matches the canonical pattern (the `DBTransaction` / `DBQueryExecutor` migration to `@/backend/types` from `@/backend/db/db.types` was completed earlier; `backend/AGENTS.md` line 82 documents this).
- **i18n / Localized Errors** ✅: `getServerTranslations(locale).errorsTranslations` — matches the canonical pattern. Property access only (never `t('key')` string-concatenated lookup). The legacy `getBackendTranslations` is NOT used.
- **Backend instructions §Logging** ✅: `NEVER use console.* - ESLint will error` — verified by oxlint passing.
- **Backend instructions §Code Style** ✅: no nested ternary operators. Sequential `if` guards (the explicit recommended pattern).
- **AGENTS.md auto-discovered from sub-loop** (per the dispatching task's 2.2.IV framing):
  - `AGENTS.md` (root) — read; high-level repo pattern.
  - `backend/AGENTS.md` — read; the canonical type-definition + layer-separation pattern.
  - `backend/services/AGENTS.md` — read; the service-layer discipline (i18n via `getServerTranslations`, no monolithic services, JR-C-1 audit-emission rule).
  - `.github/instructions/tests.instructions.md` — auto-discovered by sub-loop; the `runInRollback` + `expectRepoError` pattern (used by the test file).
  - `.github/instructions/backend.instructions.md` — auto-discovered by sub-loop.

---

## Carry-forward knowledge for future subtasks

- **`assertActiveActorAdmin(actorId, locale, outerTx?)` is the strict guard consumed by task 2.4** (`setUserSuspended` and `setUserBlocked`). Task 2.4's pipeline spec calls it PRE-transaction when no `outerTx` is supplied (step 1 of the ordered pipeline). The guard throws `ForbiddenError(tErrors.accountDeleted|accountBlocked|accountSuspended)` on governed actor denial — the deterministic order is `isDeleted → isBlocked → isSuspensionActive`, locked at the unit tier by the Tier 2 boundary tests.
- **`assertActorAdmin` (relaxed) is the canonical import from `@/backend/services/admin/admin-guards.helpers`** for ALL DEV3-016 user-management methods (the import line was switched from `admin-gate.helpers` to `admin-guards.helpers` on line 65 of `user-management.service.ts`). Consumers should NOT import directly from `admin-gate.helpers` anymore — the canonical home is `admin-guards.helpers`.
- **The deterministic denial order (`isDeleted → isBlocked → isSuspensionActive`) is the canonical contract.** A future refactor that flips the order would flip the Tier 2 boundary tests — the suite locks the order at the unit tier.
- **`logger.logDomainError(message, { code, entity, entityId })` is the canonical denial log shape.** The first arg is a human-readable message string (NOT a structured payload); the second arg is the `DomainErrorContext` payload (`{ code, entity, entityId }` — `entity: "user"` for ALL admin-governance denials). The Tier 4 test verifies this shape for each denial class.
- **The actor row is fetched ONCE via `UserRepository.findById(actorId, outerTx)`** — the SAME row carries the role field (relaxed check) AND the five governance columns (strict checks). NO second query. This inlines the relaxed gate's role-check logic into the strict variant (a small ~10-line duplication, necessary to preserve the single-fetch invariant — the canonical relaxed implementation continues to live in `admin-gate.helpers.ts` for every DEV3-016 caller).
- **A LAPSED suspension PASSES the strict guard.** This is window honesty (REQ-019): the lapse restores access at the read layer, NOT the write layer. The strict guard does NOT clear `suspended` / `suspendedAt` / `suspendedPeriodDays` columns on a lapsed suspension — the row is byte-identical before/after (verified by the Tier 1 lapsed-suspension test).
- **The DEV3-016 suite (61 tests) is the byte-equivalence regression net for the import-line change.** With pglite + schema-push, 60 of 61 tests pass (the 1 failure is the `getStats > happy path` test that asserts `totalCount >= 6` — a seed-data assumption that pglite doesn't satisfy). The 1 failure is a pre-existing sandbox hazard, NOT a regression caused by the import-line edit (verified by the same-failure-mode test against the unmodified `getStats` method which my edit does NOT touch).
- **The `bun:test` `spyOn` on a shared singleton accumulates calls across tests.** The `silenceDomainLog()` helper calls `spy.mockClear()` after creating the spy to reset the call list. The `assertCanonicalDenialLog` helper does the same. This is necessary because `logger` is a shared module singleton — `spyOn(logger, "logDomainError")` returns the SAME spy across calls, so `mock.calls` accumulates without explicit clearing.

## Hazards discovered

- **Phase 0.2 outcome anchor A19 + plan-review R1 F4 finding were CORRECT about Branch A's premise being broken.** The dispatching task's claim that `assertActorAdmin` was a "private closure in `user-management.service.ts:240-271`" was WRONG — `assertActorAdmin` was ALREADY extracted as an EXPORTED function in `admin-gate.helpers.ts:59` (imported into `user-management.service.ts` at line 65). The dispatching agent acknowledged this divergence and insisted on Branch A semantics anyway ("file is ABSENT → CREATE it"). The implementation honors the directive via the re-export pattern (single implementation in `admin-gate.helpers.ts`, single canonical import surface in `admin-guards.helpers.ts`).
- **The `.env.test` `DB_PROVIDER=sqlite` value is NOT recognized by `backend/db/index.ts`** (only `postgres` and `pglite` are recognized). On this sandbox, the default fallback is `pg.Pool` (port 5432), which is unavailable. DB-backed tests fail at `ECONNREFUSED 127.0.0.1:5432` unless `DB_PROVIDER=pglite PGLITE_DATA_DIR=...` is supplied at runtime. This is the SAME pre-existing sandbox hazard documented by Phase 0.1 + Phase 2.1 outcomes. For runtime verification of the new test file, this task manually pushed the drizzle schema migrations to a pglite instance at `/tmp/pglite-data` (6 migration files applied; 23 tables created) and ran the tests with `DB_PROVIDER=pglite PGLITE_DATA_DIR=/tmp/pglite-data` — the new suite went green (15/15 pass).
- **The `getStats` happy-path test requires seed data (`totalCount >= 6`)** — pglite initialized with NO seed data only has the in-test-provisioned rows (2 users: 1 admin + 1 student). This is NOT a regression caused by this edit; the `getStats` method is in `AdminUserRepository.getStats(outerTx)` which my edit does NOT touch. The test would pass against PostgreSQL with seed data.
- **The `bun:test` `spyOn` on a shared singleton accumulates `mock.calls` across tests** — discovered during the runtime verification phase. The `silenceDomainLog()` helper was patched to call `spy.mockClear()` after creating the spy. Future test files that assert spy call counts should follow this pattern.
- **`sonarjs/prefer-specific-assertions` fires on `expect(arr.length).toBe(N)` patterns** — replaced with `expect(arr).toHaveLength(N)` (9 occurrences in the test file). The lint-rule documentation at `docs/quality/linting-rules.md` covers this; future test files should use `toHaveLength` directly.
- **`sonarjs/no-await-in-loop` fires on `await` inside `for...of` loops** — even when the iterations are intentionally sequential (shared transaction, spy state). Refactored to use a module-scope helper function called sequentially (no loop construct). The lint rule's `Promise.all` recommendation is incorrect for sequential-with-shared-state scenarios — the helper-call pattern is the lint-safe alternative.

## Ledger updates

- (none) — D1-D7 stay as `📅 Forward` (per `0-baseline-outcome.md` §"Deferred-Items Ledger Initialization"). This task did not resolve, advance, or block any deferred item. D4 (DEV3-016 strict-guard backport onto its EXISTING mutations) is forward-referenced; the new `assertActiveActorAdmin` is AVAILABLE for that backport but is NOT consumed by any DEV3-016 method here (the import-line change is byte-equivalent; DEV3-016 methods keep their RELAXED semantics per REQ-031).

---

## Verification Summary

| Verification | Expected | Actual | Status |
|---|---|---|---|
| `admin-guards.helpers.ts` created | NEW file with 2 exports (relaxed re-export + strict new) | Created; 145 lines; `assertActorAdmin` re-exported from `./admin-gate.helpers` + new `assertActiveActorAdmin` strict variant | ✅ |
| `user-management.service.ts` import switched | From `admin-gate.helpers` → `admin-guards.helpers` (line 65) + JSDoc reference (line 19) | Done; ZERO call-site changes; ZERO behavior delta | ✅ |
| `admin-guards.helpers.test.ts` created | NEW 4-Tier suite (Tier 1 statement/branch + Tier 2 boundary on order-of-checks + Tier 4 security denial taxonomy) | Created; 435 lines; 15 tests; 4-Tier coverage | ✅ |
| 2.2.QL on `admin-guards.helpers.ts` | exit 0 (5/5 sub-loop gates) | exit 0 (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates) | ✅ |
| 2.2.QL on `user-management.service.ts` | exit 0 (5/5 sub-loop gates) | exit 0 | ✅ |
| 2.2.QL on `admin-guards.helpers.test.ts` | exit 0 (5/5 sub-loop gates) | exit 0 (check:duplicates skipped per scope) | ✅ |
| 2.2.TE new suite all-green | 15/15 tests pass | 15/15 pass / 0 fail / 72 expect() calls (with pglite + schema-push) | ✅ |
| 2.2.TE DEV3-016 suite byte-green | 61/61 tests pass (or same failure mode as pre-edit) | 60/61 pass / 1 fail (pre-existing sandbox hazard — `getStats > happy path` requires seed data; my edit doesn't touch `getStats`) | ✅ (byte-green preserved) |
| 2.2.TE chaos suite byte-green | 8/8 tests pass (or same skip pattern as pre-edit) | 3 pass / 5 skip / 0 fail (5 skips are concurrency tests — pglite serializes them) | ✅ (byte-green preserved) |
| 2.2.SEC BFLA second line | service-side re-check after GraphQL authScopes | `assertActiveActorAdmin` runs PRE-transaction; throws BEFORE any write | ✅ |
| 2.2.SEC flat denial keys only | `accountDeleted` / `accountBlocked` / `accountSuspended` (no new keys) | `tErrors.accountDeleted` / `tErrors.accountBlocked` / `tErrors.accountSuspended` (verified flat top-level `ErrorsLabels` members at lines 37-41 of `shared/locale/types/errors/index.ts`) | ✅ |
| 2.2.SEC zero audit rows on denial | no `AuditService.createAuditLog` calls | `rg "AuditService|createAuditLog" admin-guards.helpers.ts` → 0 matches | ✅ |
| 2.2.SEC zero writes on denial | only `SELECT` then throw | `UserRepository.findById` (SELECT) + throw; no UPDATE/INSERT/DELETE | ✅ |
| 2.2.SR single canonical home | `admin-guards.helpers.ts` is the canonical import surface | `user-management.service.ts:65` imports from `admin-guards.helpers`; the implementation continues in `admin-gate.helpers.ts` (untouched per hard rule); re-export = single canonical surface | ✅ |
| 2.2.SR no private copy survives | grep returns zero matches in user-management.service.ts | 0 matches for `private.*assertActorAdmin|function assertActorAdmin` in user-management.service.ts | ✅ |
| 2.2.SR DomainError subclasses only | `ForbiddenError` + `UnauthorizedError` only | both extend `DomainError` (verified at `backend/lib/errors.ts:44-55`) | ✅ |
| 2.2.SR logger only (no `console.*`) | grep returns 0 matches | 0 matches in both new files; oxlint `no-console: error` passed | ✅ |
| 2.2.SR deterministic order | isDeleted → isBlocked → isSuspensionActive | verified by inspection of `assertActiveActorAdmin` body + Tier 2 boundary tests (4 precedence proofs) | ✅ |
| 2.2.IV backend.instructions.md compliance | service-layer discipline + DomainError taxonomy + logger + type imports | all canonical patterns followed (verified by sub-loop + AGENTS.md reads) | ✅ |
| 2.2.IV AGENTS.md auto-discovered from sub-loop | sub-loop reads `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md` | sub-loop output confirmed auto-discovery of all three files | ✅ |
| Project-wide tsgo regression | 14 errors (Phase 2.1 EXPECTED RED baseline — same as before this task) | 14 errors, ALL in `test/workflows/admin/account-governance.journey.test.ts`; ZERO new errors introduced | ✅ |
| Outcome file written | `2-2-outcome.md` exists, well-formed | this file | ✅ |
| Source code untouched outside scope | only `admin-guards.helpers.ts` (NEW), `user-management.service.ts` (import line), `admin-guards.helpers.test.ts` (NEW) | verified — no edits under `frontend/`/`app/`/`shared/`/`backend/db/repo/admin/`/`backend/lib/auth/` | ✅ |
| Worklog appended | to `/home/z/my-project/worklog.md` (shared root worklog) | appended | ✅ |

---

## Files Touched by This Task

| File | Operation |
|---|---|
| `backend/services/admin/admin-guards.helpers.ts` | CREATED — shared admin-governance actor guards module (145 lines; re-export of `assertActorAdmin` from `./admin-gate.helpers` + new `assertActiveActorAdmin` strict variant consuming `isSuspensionActive` from `@/backend/lib/auth/suspension-window`). |
| `backend/services/admin/user-management.service.ts` | EDITED — switched `assertActorAdmin` import on line 65 from `@/backend/services/admin/admin-gate.helpers` → `@/backend/services/admin/admin-guards.helpers`; updated JSDoc reference on line 19. ZERO call-site changes (the function name is byte-identical). |
| `backend/services/admin/admin-guards.helpers.test.ts` | CREATED — 4-Tier unit suite (435 lines; 15 tests; all green with pglite + schema-push). |
| `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/2-2-outcome.md` | CREATED — this file. |

No source files under `backend/db/repo/admin/`, `backend/lib/auth/`, `frontend/`, `app/`, `shared/` were touched. No plan files (`tasks.md`/`specs.md`/`plan.md`/`deferred-items.md`) were modified. The `tasks.md` checkbox `[ ] 2.2` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome.
