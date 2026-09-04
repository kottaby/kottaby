# Phase 3.2 — Auth Boundary Consumption Outcome

**Task ID:** 3.2
**Plan:** ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d
**Date:** 2026-09-03
**Branch:** `main` (DEV3-017 feature branch was not persisted on this sandbox per Phase 0.1 outcome note — working tree carries the cumulative DEV3-017 changeset across all phases)
**Agent:** Phase 3.2 Auth Boundary Consumption Subagent
**Requirements:** REQ-017, REQ-018, REQ-019, REQ-035, REQ-071

## What was implemented

1. Widened `assertUserActive` in `backend/services/auth/auth.service.ts` to accept `{ suspendedAt: Date | null; suspendedPeriodDays: number | null }` and changed the denial condition from `user.isDeleted || user.isBlocked || user.suspended` to consume `isSuspensionActive(...)` instead of the plain `user.suspended` boolean. The `suspended: true` plain-boolean arm was REPLACED by `isSuspensionActive({suspended, suspendedAt, suspendedPeriodDays}, new Date())` — the predicate is now the single source of truth for window liveness. Denial copy channel UNCHANGED (`t.accountBlocked` — wire-shape constancy per REQ-018).
2. Modified `getServerUserContext` in `backend/lib/auth/server-auth.ts` — same condition swap. The existing domain log line (`logger.logDomainError("SSR auth: governed account denied", ...)`) and the surrounding comment ("Governance: fail-closed for deleted / blocked / suspended accounts.") are byte-identical.
3. Activated the 2 deferred source pins in `backend/lib/auth/suspension-window.test.ts` — removed the `.skip` modifier on both calls (lines 114 + 120). The live assertion bodies (`readFileSync + .toContain("isSuspensionActive")`) were already present from task 1.2; the only edit required was the `.skip` removal plus a small JSDoc refresh (header + inline comment) so the file's documentation honestly reflects that the pins are now LIVE rather than deferred.
4. `backend/graphql/gqlContextFactory.ts` UNTOUCHED (verified by `git diff` — empty).
5. `backend/graphql/test/notification-integration.matrix.test.ts` UNTOUCHED (regression lock per tasks.md — byte-identical via `git diff` empty).
6. The governed-tier matrix regression-lock SEMANTICS are preserved by construction:
   - Matrix fixture (`applyGovernanceState` line 514-533) sets `suspended: true` + `suspendedAt: now` WITHOUT `suspendedPeriodDays` (stays `null` in DB).
   - Old condition: `isDeleted || isBlocked || suspended` → `false || false || true` → `true` → FORBIDDEN via `t.accountBlocked`.
   - New condition: `isDeleted || isBlocked || isSuspensionActive({suspended:true, suspendedAt:now, suspendedPeriodDays:null}, now)` → predicate returns `true` (fail-closed on null `suspendedPeriodDays`) → `false || false || true` → `true` → FORBIDDEN via `t.accountBlocked`.
   - Denial shape byte-identical. The matrix test file has ZERO edits.

## Files modified

- `backend/services/auth/auth.service.ts` — `assertUserActive` widened (input type gains `suspendedAt` + `suspendedPeriodDays`; denial condition consumes `isSuspensionActive`); JSDoc header updated to reflect the new semantics; import added: `import { isSuspensionActive } from "@/backend/lib/auth/suspension-window";`
- `backend/lib/auth/server-auth.ts` — `getServerUserContext` governance condition swapped to consume `isSuspensionActive`; import added; existing domain log line + surrounding comment byte-identical.
- `backend/lib/auth/suspension-window.test.ts` — 2 `it.skip` → `it` (source pins activated); JSDoc header + inline section comment refreshed to reflect "LIVE" state (no longer "deferred"). Live assertion bodies unchanged.

## Files NOT modified (verified)

- `backend/graphql/gqlContextFactory.ts` — UNTOUCHED (`git diff` empty). `createGraphQLContext` performs NO governance denial — the documented GraphQL context window (REQ-035) is honestly preserved: an actively-governed user holding a pre-issued unexpired token retains edge access until expiry. This ticket makes NO context-level governance claim.
- `backend/graphql/test/notification-integration.matrix.test.ts` — UNTOUCHED (`git diff` empty). The governed-tier regression lock at lines 514-533 + 1139-1272 stays byte-identical per tasks.md.
- No plan files (`tasks.md` / `specs.md` / `plan.md` / `deferred-items.md`) touched — orchestrator owns checkbox updates.

## Verification evidence

### 3.2.QL Quality Loop

- **sub-loop on `backend/services/auth/auth.service.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo (project-wide, filtered): PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates (jscpd, intra-file): PASS ✅
- **sub-loop on `backend/lib/auth/server-auth.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo: PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅
- **sub-loop on `backend/lib/auth/suspension-window.test.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo: PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅ (test files outside jscpd scan scope — reported as PASS with skip-notice)
- **tsgo (project-wide)**: exit **0** ✅ (delta from post-install baseline = 0 — ZERO new TypeScript errors introduced)

### 3.2.TE Test Engineering

- **Predicate suite** (`bun run test/scripts/run-test.ts backend/lib/auth/suspension-window.test.ts`): exit **0** ✅
  - Result: **11 pass / 0 skip / 0 fail / 11 expect() calls / 11 tests across 1 file** (65ms)
  - 9 predicate branch-matrix arms green (the (a) arm splits into two `it()` calls — `false` and `null` — for the falsy-suspended short-circuit; the conceptual matrix has 8 arms but the test file reports 9 passing tests for arm (a)).
  - 2 source pins NOW LIVE (no longer `it.skip`):
    - `backend/services/auth/auth.service.ts imports isSuspensionActive` — PASS ✅
    - `backend/lib/auth/server-auth.ts imports isSuspensionActive` — PASS ✅
  - Output tail (verbatim):
    ```
    backend/lib/auth/suspension-window.test.ts:
    (pass) isSuspensionActive > returns false when suspended is false [0.06ms]
    (pass) isSuspensionActive > returns false when suspended is null [0.01ms]
    (pass) isSuspensionActive > returns true when suspended but suspendedAt is null
    (pass) isSuspensionActive > returns true when suspended but suspendedPeriodDays is null [0.02ms]
    (pass) isSuspensionActive > returns true when suspendedPeriodDays is zero [0.01ms]
    (pass) isSuspensionActive > returns true when suspendedPeriodDays is negative [0.01ms]
    (pass) isSuspensionActive > returns true when now is strictly inside the active suspension window [0.02ms]
    (pass) isSuspensionActive > returns false at the exact boundary (now === suspendedAt + periodDays × MS_PER_DAY) [0.02ms]
    (pass) isSuspensionActive > returns false when the suspension window has fully lapsed [0.04ms]
    (pass) isSuspensionActive > backend/services/auth/auth.service.ts imports isSuspensionActive [0.12ms]
    (pass) isSuspensionActive > backend/lib/auth/server-auth.ts imports isSuspensionActive [0.03ms]

     11 pass
     0 fail
     11 expect() calls
    Ran 11 tests across 1 file. [65.00ms]
    EXIT_PREDICATE=0
    ```
- **Governed-tier notification matrix** (`backend/graphql/test/notification-integration.matrix.test.ts`):
  - File is byte-identical to baseline (`git diff` empty) — ZERO edits per the regression-lock rule ✅
  - On-sandbox execution hits the documented pre-existing ECONNREFUSED hazard (PostgreSQL unavailable — same hazard documented in `0-baseline-outcome.md`, `1-3-outcome.md`, `2-3-outcome.md`, `2-4-outcome.md`, `3-1-outcome.md`); the suite fails at the `beforeAll` setup (`registerUser failed for student`) BEFORE any governed-tier matrix test is exercised. The Phase 6 reviewer MUST treat this as the baseline for this sandbox; the gate is "no NEW failures vs. this baseline" + "test logic sound".
  - Regression-lock semantics PRESERVED by construction (verified by inspection of the condition swap; see "What was implemented" §6 above):
    - Matrix fixture: `suspended: true`, `suspendedAt: now`, `suspendedPeriodDays: null` (column stays null — `.set({...})` does not include it).
    - Old denial: `isDeleted || isBlocked || suspended` → `false || false || true` → `true` → `ForbiddenError(t.accountBlocked)` → response `FORBIDDEN`.
    - New denial: `isDeleted || isBlocked || isSuspensionActive({suspended:true, suspendedAt:now, suspendedPeriodDays:null}, now)` → predicate returns `true` (fail-closed on null `suspendedPeriodDays`) → `false || false || true` → `true` → `ForbiddenError(t.accountBlocked)` → response `FORBIDDEN`.
    - Denial code `FORBIDDEN` + message channel `t.accountBlocked` are byte-identical across both implementations.
  - Login allow/deny: covered by the committed-fixture auth-consumption block from task 2.4.TE (D11 — `backend/services/admin/user-governance.service.test.ts`). The matrix is RED on this sandbox for the same ECONNREFUSED reason; the static-source-scan tier (D11's `assertUserActive` consumption probes) is now GREEN via the predicate suite's source pins.
  - Wire-login HTTP probes: deferred to task 3.3 (wire-tier matrix) per the task spec.
- **assertUserActive unit tier** (active suspension denies; lapsed allows; blocked denies; deleted denies): the predicate suite covers the WINDOW MATH at the unit tier (`isSuspensionActive`'s 9-arm truth table). The `assertUserActive` consumption is proven via the source pin (grep-based import proof). The 4-state denial matrix (active-suspended / lapsed-suspended / blocked / deleted) is covered by task 2.4.TE's committed-fixture auth-consumption block (D11), which is RED on this sandbox for the ECONNREFUSED reason (same baseline as the matrix test).

### 3.2.SEC Security & Tenancy Audit

- **Both boundaries fail-closed on corrupt windows** ✅:
  - `assertUserActive` (login + refresh): `isDeleted || isBlocked || isSuspensionActive({suspended, suspendedAt, suspendedPeriodDays}, now)`. The predicate returns `true` (denies) on ALL corrupt-input arms (null `suspendedAt`, null `suspendedPeriodDays`, zero-day / negative-day `suspendedPeriodDays`) — verified by the 9-arm unit tier (test arms (b)/(c)/(d)/(e)). No widening path exists.
  - `getServerUserContext` (SSR): SAME condition swap — fail-closed on the SAME corrupt-input arms. Returns `{ userId: null, user: null, role: null }` (anonymous) — never 500s the SSR render.
- **Lapse path performs ZERO writes (REQ-019)** ✅:
  - The predicate `isSuspensionActive` is PURE READ — no `UPDATE`, no `INSERT`, no `audit_logs` write. The `assertUserActive` function calls ONLY `isSuspensionActive(...)` + a conditional `throw new ForbiddenError(...)`. ZERO side effects on the success path.
  - `getServerUserContext` similarly: the `isSuspensionActive(...)` call is a pure read; no UPDATE on the lapse path. The existing `touchLastActiveAt` fire-and-forget on the login success path (auth.service.ts ~line 166) is the SAME write that happened BEFORE this task — it is NOT a governance write and is NOT gated by the suspension-window predicate. The `suspended*` columns persist UNCHANGED until an audited admin unsuspend (REQ-019's documented consequence).
  - REQ-019 byte-identical column proof: the journey test step 8 (lapsed suspension → login SUCCEEDS with BYTE-IDENTICAL columns) now has the auth-boundary consumption it needs. The byte-identical probe is owned by the journey test (task 2.1) — task 3.2 supplies the predicate consumption that makes the lapse path possible at all.
- **No input shape widens access** ✅: the predicate's truth table (1.2-outcome.md §1.2.SEC) proves there is NO payload shape that combines `suspended: true` with missing/corrupt window data and returns `false`. A "free pass" payload is structurally impossible — the fail-closed arm collapses non-positive values onto missing ones.

### 3.2.SR Semantic Review

- **ONE condition line per gate** ✅:
  - `assertUserActive` (auth.service.ts): exactly ONE `if` statement combining `user.isDeleted || user.isBlocked || isSuspensionActive(...)` into a single boolean expression (the multi-line formatting is for readability — the expression is logically ONE condition).
  - `getServerUserContext` (server-auth.ts): exactly ONE `if` statement combining `fetched.isDeleted || fetched.isBlocked || isSuspensionActive(...)` into a single boolean expression.
- **No duplicated window math** ✅:
  - The window math (`suspendedAt.getTime() + suspendedPeriodDays * MS_PER_DAY > now.getTime()`) lives EXACTLY ONCE — in `backend/lib/auth/suspension-window.ts:55`. Both consumption sites (auth.service.ts + server-auth.ts) import `isSuspensionActive` and consume it; neither site duplicates the math, the `MS_PER_DAY` constant, or the fail-closed arm logic.
  - Verified by grep: `MS_PER_DAY` appears ONLY in `backend/lib/auth/suspension-window.ts` (line 26) — not in auth.service.ts, not in server-auth.ts.
- **No log-shape change** ✅:
  - The existing `logger.logDomainError("SSR auth: governed account denied", { code: "SSR_GOVERNED_ACCOUNT", entity: "users", entityId: fetched.id })` call in server-auth.ts is byte-identical (verified by `git diff` — only the `if` condition + import line changed; the log call + surrounding comment are byte-identical).
  - `assertUserActive` previously had NO log call (it just throws); the new implementation also has NO log call — byte-identical log surface.
- **Login/refresh/SSR consume the SAME predicate** ✅:
  - All three sites (`assertUserActive` on login, `assertUserActive` on refreshToken, `getServerUserContext` on SSR) import `isSuspensionActive` from the SAME module: `@/backend/lib/auth/suspension-window`. The import specifier is byte-identical across all three call sites (`import { isSuspensionActive } from "@/backend/lib/auth/suspension-window";`). NO divergence — redirect-loop class prevention per `docs/auth/REDIRECT_LOOP_FIX.md`.
- **gqlContextFactory byte-identical** ✅:
  - `git diff backend/graphql/gqlContextFactory.ts` is EMPTY — `createGraphQLContext` is byte-identical to baseline. This ticket makes NO context-level governance claim (REQ-035's documented gap — D5 ledger row — is honestly preserved).

### 3.2.IV Instruction Verification

- Read `.agents/instructions/backend.instructions.md` (the layer-specific instruction file for `backend/**/*.ts`).
- **§Architecture & Layer Separation** ✅ — the auth service layer consumes the predicate (a `lib/` module), never the repo. The repo (`UserRepository.findById` / `findByEmail`) returns the full `UserSelectType` row — the service layer selects the governance fields it needs.
- **§i18n / Localized Errors** ✅ — the denial copy channel `t.accountBlocked` (already bound to `ctx.locale` via `getServerTranslations(locale).authTranslations`) is byte-identical. No hardcoded error strings introduced.
- **§Logging** ✅ — ZERO new `console.*` / `logger.*` call sites introduced. The existing `logger.logDomainError("SSR auth: governed account denied", ...)` call in server-auth.ts is byte-identical.
- **§Code Style** ✅ — NO nested ternary operators. The new conditions use sequential `||` chains (single expression, multi-line for readability) — the explicit recommended pattern.
- **§Linting Rules** ✅ — ZERO `oxlint-disable` / `biome-ignore` comments introduced. The sub-loop's lint:type-aware gate is PASS on all three files.
- **§Barrel Files Conventions** ✅ — N/A (no barrel touched). The new import `@/backend/lib/auth/suspension-window` is the highest available barrel path (the module has no `index.ts` barrel — it's imported directly via the path alias, consistent with task 1.2's outcome).
- **§Type Definition Pattern** ✅ — NO local types created. The widened input shape is an inline anonymous type literal (mirrors the existing pattern). `UserSelectType` (the canonical Drizzle `$inferSelect` type) is imported from `@/backend/types` per the existing pattern.
- **Clean comments (no plan-artifact references)** ✅ — verified by grep:
  ```
  $ rg -n 'REQ-017|REQ-018|REQ-019|REQ-035|REQ-071|Task 3\.2|Phase 3|DEV3-017|tasks\.md|specs\.md|plan\.md|\.ai/plans' backend/services/auth/auth.service.ts backend/lib/auth/server-auth.ts backend/lib/auth/suspension-window.test.ts
  (no matches — exit 1)
  ```
  The `assertUserActive` JSDoc references `getServerUserContext` and `isSuspensionActive` — production-grade references to the canonical consumer functions, NOT plan-trio references.
- **Auto-discovered AGENTS.md files** (per sub-loop): `AGENTS.md`, `backend/AGENTS.md`, `backend/lib/AGENTS.md`, `backend/lib/auth/AGENTS.md`, `backend/services/AGENTS.md`, `backend/services/auth/AGENTS.md` (when present) — all read; rules honored (no console.*, no hardcoded error strings, no oxlint-disable comments).

## Carry-forward for task 2.1 journey test (TURNING GREEN)

- The journey test step 8 (lapsed suspension → login SUCCEEDS with BYTE-IDENTICAL columns, REQ-019) now has the auth-boundary consumption it needs. The predicate is window-honest: a lapsed window (`now ≥ suspendedAt + periodDays × MS_PER_DAY`) returns `false` from `isSuspensionActive` → `assertUserActive` does NOT throw → login succeeds → columns byte-identical before/after (the predicate is pure READ — no UPDATE on the success path).
- The journey test step 9 denial battery (deleted/blocked/actively-suspended → ForbiddenError) now has the strict guard. Active suspension → `isSuspensionActive` returns `true` → `assertUserActive` throws ForbiddenError → response FORBIDDEN with `t.accountBlocked` message channel.
- After task 3.3 (wire-tier matrix) lands, the journey test should turn fully GREEN (modulo the DB-connect sandbox hazard — same baseline as 2.4 + 3.1).

## Carry-forward for task 3.3 (wire-tier matrix)

- HTTP governed-login probes (actively-suspended target → FORBIDDEN; lapsed target → SUCCESS with session payload) live in 3.3.TE.
- The auth boundary is now window-honest — the wire-tier matrix can write the assertions.
- The matrix's `applyGovernanceState` fixture (lines 514-533) sets `suspended: true` + `suspendedAt: now` WITHOUT `suspendedPeriodDays` → fail-closed predicate returns `true` → FORBIDDEN. The wire-tier matrix's "actively-suspended target" probe (per tasks.md 3.3) MUST set `suspendedPeriodDays: 7` explicitly in the fixture if it wants to test the ACTIVE-window case (currently the fixture tests the FAIL-CLOSED-on-null-periodDays case, which is correct but distinct from the active-window case).

## Carry-forward for the predicate parity (D2 — session-creation consumption)

- D2 (session-creation consumption of `isSuspensionActive`) stays `📅 Forward` per `0-baseline-outcome.md` §"Deferred-Items Ledger Initialization". The predicate is now consumed at the auth boundary (login + refresh + SSR); the session-write consumption (INV-U2 — suspended cannot request sessions DURING the period) stays with its owning stream. The predicate is AVAILABLE for that downstream consumption.

## Hazards discovered

- **Pre-existing sandbox state (NOT caused by this implementation)**: the governed-tier notification matrix (`backend/graphql/test/notification-integration.matrix.test.ts`) and the D11 committed-fixture auth-consumption block (`backend/services/admin/user-governance.service.test.ts`) are RED on this sandbox due to the documented ECONNREFUSED hazard (PostgreSQL unavailable — `pg-pool` cannot reach `127.0.0.1:5432` / `::1:5432`). Same hazard documented in `0-baseline-outcome.md`, `1-3-outcome.md`, `2-3-outcome.md`, `2-4-outcome.md`, `3-1-outcome.md`. The gate is "no NEW failures vs. this baseline" + "test logic sound" (proven by the predicate suite's 11 green tests + the regression-lock semantics inspection above). No test file was silenced by editing or `it.skip`-ing the failing tests.
- **No new hazards introduced** by this implementation. The condition swap is behavior-preserving for the matrix fixture (fail-closed on null `suspendedPeriodDays` → `true` → FORBIDDEN — byte-identical denial shape) and widens the lapse path (lapsed suspension no longer denies — REQ-018's window-honest semantics).

## Verification Summary

| Verification | Expected | Actual | Status |
|---|---|---|---|
| `assertUserActive` widened + consumes `isSuspensionActive` | input type gains `suspendedAt` + `suspendedPeriodDays`; denial condition swaps `user.suspended` for `isSuspensionActive(...)` | verified via `git diff` (auth.service.ts:91-125) | ✅ |
| `getServerUserContext` condition swapped | condition becomes `fetched.isDeleted \|\| fetched.isBlocked \|\| isSuspensionActive(...)` | verified via `git diff` (server-auth.ts:97-118) | ✅ |
| Existing domain log line UNCHANGED | `logger.logDomainError("SSR auth: governed account denied", ...)` byte-identical | verified via `git diff` (only the `if` condition + import line changed) | ✅ |
| 2 source pins activated | `it.skip` → `it` on both source pins | verified via grep (lines 111 + 117 are `it(...)` — no `.skip`) | ✅ |
| gqlContextFactory UNTOUCHED | `git diff` empty | verified — empty | ✅ |
| Notification matrix UNTOUCHED | `git diff` empty | verified — empty | ✅ |
| Regression-lock semantics preserved | matrix fixture's `suspended: true` + `suspendedAt: now` + `suspendedPeriodDays: null` → predicate returns `true` (fail-closed) → FORBIDDEN with `t.accountBlocked` | verified by inspection (the fail-closed arm collapses null `suspendedPeriodDays` onto missing) | ✅ |
| sub-loop on auth.service.ts | exit 0 | exit 0 (5/5 sub-loop gates) | ✅ |
| sub-loop on server-auth.ts | exit 0 | exit 0 (5/5 sub-loop gates) | ✅ |
| sub-loop on suspension-window.test.ts | exit 0 | exit 0 (5/5 sub-loop gates, check:duplicates skipped per scope) | ✅ |
| tsgo project-wide | exit 0 (no new errors) | exit 0 | ✅ |
| Predicate suite | 11 pass / 0 skip / 0 fail (9 matrix arms + 2 source pins LIVE) | 11 pass / 0 skip / 0 fail / 11 expect() calls | ✅ |
| 3.2.SEC fail-closed on corrupt windows | both boundaries deny on all corrupt-input arms | verified by inspection (predicate's truth table arms (b)/(c)/(d)/(e)) | ✅ |
| 3.2.SEC lapse path ZERO writes | predicate is pure READ; no UPDATE on the success path | verified by inspection (no `UPDATE` / `INSERT` / `audit_logs` write in the predicate or the assertUserActive consumption) | ✅ |
| 3.2.SR ONE condition line per gate | single `if` statement per gate | verified by `git diff` (one `if` per gate) | ✅ |
| 3.2.SR no duplicated window math | `MS_PER_DAY` appears ONLY in suspension-window.ts | verified by grep (`MS_PER_DAY` appears in 1 file only) | ✅ |
| 3.2.SR no log-shape change | existing `logger.logDomainError(...)` call byte-identical | verified via `git diff` (log call unchanged) | ✅ |
| 3.2.SR login/refresh/SSR consume SAME predicate | all 3 sites import `isSuspensionActive` from `@/backend/lib/auth/suspension-window` | verified by grep (import specifier byte-identical across all 3 sites) | ✅ |
| 3.2.SR gqlContextFactory byte-identical | `git diff` empty | verified — empty | ✅ |
| 3.2.IV instruction verification | backend.instructions.md compliance | all §sections verified | ✅ |
| Outcome file written | `3-2-outcome.md` exists, well-formed | this file | ✅ |
| Source code untouched outside scope | only `auth.service.ts` + `server-auth.ts` + `suspension-window.test.ts` modified | verified via `git diff --name-only` (plus untracked test file from task 1.2) | ✅ |

---

## Files Touched by This Task

| File | Operation |
|---|---|
| `backend/services/auth/auth.service.ts` | MODIFIED — `assertUserActive` widened (input type gains `suspendedAt` + `suspendedPeriodDays`; denial condition consumes `isSuspensionActive`); JSDoc header refreshed; import added (`import { isSuspensionActive } from "@/backend/lib/auth/suspension-window";`). Existing call sites (`login` ~line 156, `refreshToken` ~line 244) pass the SAME fetched row — ZERO call-site signature churn (the widened columns are already returned by `UserRepository.findById` / `findByEmail` via the full `UserSelectType`). |
| `backend/lib/auth/server-auth.ts` | MODIFIED — `getServerUserContext` governance condition swapped to consume `isSuspensionActive`; import added. Existing domain log line + surrounding comment byte-identical. |
| `backend/lib/auth/suspension-window.test.ts` | MODIFIED — 2 `it.skip` → `it` (source pins activated); JSDoc header + inline section comment refreshed to reflect "LIVE" state. Live assertion bodies unchanged. |
| `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/3-2-outcome.md` | CREATED — this file. |

No source files outside `backend/services/auth/auth.service.ts`, `backend/lib/auth/server-auth.ts`, and `backend/lib/auth/suspension-window.test.ts` were touched. No plan files (`tasks.md`/`specs.md`/`plan.md`/`deferred-items.md`) were modified. The `tasks.md` checkbox `[ ] 3.2` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome.
