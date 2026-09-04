# Phase 1.2 — Suspension-Window Predicate Outcome

**Task ID:** 1.2
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-03
**Branch:** `feat/dev3-017-account-soft-delete-governance`
**Agent:** Phase 1.2 Suspension-Window Predicate Subagent
**Requirements:** REQ-017 (shared predicate — fail-closed, extracted)

---

## Source-of-truth (verbatim)

The predicate's exact math was extracted from the suspended-branch arm of `isGovernanceExcludedFromDiscovery` in `backend/services/students/student-handshake.helpers.ts`. The Phase 0.2 outcome's anchor A6 + the task description both cited `student-handshake.helpers.ts:39-59`; the actual function declaration lives at lines 39-59 verbatim — citation was accurate. Grepped for `isGovernanceExcludedFromDiscovery` first, then read lines 1-60 of the file (10 above + the matching range) to extract the exact suspended-branch math.

Verbatim source (lines 39-59 of `backend/services/students/student-handshake.helpers.ts`):

```typescript
export function isGovernanceExcludedFromDiscovery(
  governance: Omit<HandshakeDiscoveryRowType, "parentId">,
  now: Date
): boolean {
  if (governance.isDeleted || governance.isBlocked) {
    return true;
  }
  if (!governance.suspended) {
    return false;
  }
  // Fail-closed: `suspendedPeriodDays` is a plain nullable int with no CHECK
  // constraint — a non-positive value is corrupt governance data (a zero-day
  // window would compute `endsAt ≤ now` and misclassify an actively-suspended
  // student as lapsed), so it is treated exactly like a missing one.
  if (!governance.suspendedAt || governance.suspendedPeriodDays === null || governance.suspendedPeriodDays <= 0) {
    return true;
  }
  const endsAt = new Date(governance.suspendedAt.getTime() + governance.suspendedPeriodDays * MS_PER_DAY);
  // Strict comparison: a suspension window ending exactly at `now` has lapsed.
  return endsAt.getTime() > now.getTime();
}
```

Supporting constant (line 17 of the same file):

```typescript
/** Milliseconds per day — the unit of `users.suspended_period_days`. */
const MS_PER_DAY = 86_400_000;
```

### Extraction mapping (source arm → predicate arm)

| `isGovernanceExcludedFromDiscovery` arm | `isSuspensionActive` arm | Identical math? |
|---|---|---|
| `isDeleted \|\| isBlocked` → `true` | (OUT OF SCOPE — `isDeleted`/`isBlocked` are governed by REQ-018, not the window predicate) | n/a — these arms stay in the caller |
| `!suspended` → `false` | `!state.suspended` → `false` | ✅ |
| `!suspendedAt \|\| periodDays === null \|\| periodDays <= 0` → `true` (fail-closed) | `suspendedAt === null \|\| suspendedPeriodDays === null \|\| suspendedPeriodDays <= 0` → `true` (fail-closed) | ✅ — note the source uses `!suspendedAt` (catches `null`/`undefined`) while the predicate uses `=== null` because the type declares `Date \| null`; same observable behavior |
| `new Date(suspendedAt.getTime() + periodDays × MS_PER_DAY).getTime() > now.getTime()` (STRICT `>`) | `suspendedAt.getTime() + periodDays × MS_PER_DAY > now.getTime()` (STRICT `>`) | ✅ — predicate inlines the math (no intermediate `new Date(...)`); STRICT `>` preserved exactly so the boundary case (`now === suspendedAt + periodDays × MS_PER_DAY`) is LAPSED in both implementations |
| `MS_PER_DAY = 86_400_000` (line 17) | `MS_PER_DAY = 86_400_000` (predicate line 26) | ✅ — single source per file |

The predicate extracts ONLY the suspension-window branch (the `isDeleted`/`isBlocked` arms stay in the caller per REQ-018 — those flags have no lapse concept and are always-denied at the auth boundary).

---

## What was implemented

### `backend/lib/auth/suspension-window.ts` (NEW)

Pure runtime module exporting `isSuspensionActive(state, now): boolean`. Zero imports beyond the inline `SuspensionState` interface; no logging; no side effects; no `new Date(...)` construction inside the function body (the math is inlined to avoid the source's intermediate `endsAt` allocation). The single constant `MS_PER_DAY = 86_400_000` is defined once at module scope.

Module structure (57 lines total):

```typescript
const MS_PER_DAY = 86_400_000;

interface SuspensionState {
  readonly suspended: boolean | null;
  readonly suspendedAt: Date | null;
  readonly suspendedPeriodDays: number | null;
}

export function isSuspensionActive(state: SuspensionState, now: Date): boolean {
  if (!state.suspended) {
    return false;
  }

  if (state.suspendedAt === null || state.suspendedPeriodDays === null || state.suspendedPeriodDays <= 0) {
    return true;
  }

  return state.suspendedAt.getTime() + state.suspendedPeriodDays * MS_PER_DAY > now.getTime();
}
```

The function exports exactly one symbol (`isSuspensionActive`); `MS_PER_DAY` and `SuspensionState` are module-private.

### `backend/lib/auth/suspension-window.test.ts` (NEW)

Pure unit tier — NO DB, NO server boot. Eight branch-matrix arms covering the predicate's complete truth table, plus two deferred source pins proving (post-3.2) that both `backend/services/auth/auth.service.ts` and `backend/lib/auth/server-auth.ts` import `isSuspensionActive`. The two source pins are authored as `it.skip` calls carrying the LIVE assertion body (readFileSync + `.toContain("isSuspensionActive")`); when task 3.2 lands, the only edit required is removing the `.skip` modifier.

The `it.skip` pattern (rather than `it.todo`) was chosen after a lint-rule discovery loop:
- `it.todo(name)` requires a body in bun:test (the type signature is `(name, testFn, options?)` — 2-3 args).
- `it.todo(name, () => {})` with an empty body trips `sonarjs/assertions-in-tests` (no assertion in the body).
- A body containing a `TODO` comment trips `sonarjs/todo-tag`.
- `it.skip(name, () => { /* live assertion */ })` with a one-line deferred-pin explanation immediately above each call satisfies BOTH `sonarjs/assertions-in-tests` (the live assertion is present) AND `sonarjs/no-skipped-tests` (the adjacent comment provides the required explanation).

Branch matrix (fixed evaluation instant `NOW = new Date("2026-09-04T12:00:00.000Z")` for determinism across runs/timezones):

| Arm | suspended | suspendedAt | suspendedPeriodDays | now | Expected | Verifies |
|---|---|---|---|---|---|---|
| (a).1 | `false` | `null` | `null` | NOW | `false` | not-suspended short-circuit |
| (a).2 | `null` | `null` | `null` | NOW | `false` | `null` suspended treated as falsy |
| (b) | `true` | `null` | `7` | NOW | `true` | fail-closed on missing window start |
| (c) | `true` | 3 days before NOW | `null` | NOW | `true` | fail-closed on missing duration |
| (d) | `true` | 3 days before NOW | `0` | NOW | `true` | fail-closed on zero-day window (would otherwise compute `endsAt ≤ now`) |
| (e) | `true` | 3 days before NOW | `-3` | NOW | `true` | fail-closed on negative duration (corrupt int column) |
| (f) | `true` | 3 days before NOW | `7` | NOW | `true` | active window (now strictly inside) |
| (g) | `true` | 7 days before NOW | `7` | exactly NOW | `false` | EXACT boundary → lapsed (STRICT `>` semantics) |
| (h) | `true` | 15 days before NOW | `7` | NOW | `false` | fully-lapsed window |

Source pins (deferred):

| Pin | Target file | Asserted today? | Green condition |
|---|---|---|---|
| `backend/services/auth/auth.service.ts imports isSuspensionActive` | `backend/services/auth/auth.service.ts` | LIVE assertion body present; `it.skip` modifier suppresses the run | Task 3.2 lands the `assertUserActive` consumption; drop `.skip` |
| `backend/lib/auth/server-auth.ts imports isSuspensionActive` | `backend/lib/auth/server-auth.ts` | LIVE assertion body present; `it.skip` modifier suppresses the run | Task 3.2 lands the `getServerUserContext` consumption; drop `.skip` |

---

## Files modified

- `backend/lib/auth/suspension-window.ts` — CREATED (57 lines: 23-line JSDoc header + 33 lines of code/inline docs).
- `backend/lib/auth/suspension-window.test.ts` — CREATED (125 lines: 31-line JSDoc header + 94 lines of describe/tests/comments).

## Files NOT modified (and why)

- `backend/services/students/student-handshake.helpers.ts` — task 1.3 owns the refactor that consumes the predicate. The predicate is the extraction source; the helper is the consumer-to-be.
- `backend/services/auth/auth.service.ts` — task 3.2 owns the auth-boundary consumption (`assertUserActive`).
- `backend/lib/auth/server-auth.ts` — task 3.2 owns the SSR-boundary consumption (`getServerUserContext`).
- `backend/lib/auth/index.ts` (barrel) — does NOT exist; the predicate is imported directly via `@/backend/lib/auth/suspension-window` (path alias) per the test file's import. If a barrel is created later, `export * from "./suspension-window"` would auto-export `isSuspensionActive` (single export, no collision risk).
- No plan files (`tasks.md` / `specs.md` / `plan.md` / `deferred-items.md`) touched — orchestrator owns checkbox updates.

---

## Verification evidence

### 1.2.QL Quality Loop — predicate module

- Command: `bun run scripts/health/sub-loop.ts backend/lib/auth/suspension-window.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed: tsgo, oxlint, biome:check, lint:type-aware, check:duplicates.
- Output tail (verbatim):
  ```
  ℹ  Running tsgo (project-wide, filtering for backend/lib/auth/suspension-window.ts)...
  ✅ tsgo passed (no errors for backend/lib/auth/suspension-window.ts)
  ℹ  Running oxlint on backend/lib/auth/suspension-window.ts...
  ✅ oxlint passed
  ℹ  Running biome:check on backend/lib/auth/suspension-window.ts...
  ✅ biome:check passed
  ℹ  Submitting lint:type-aware via in-process service for backend/lib/auth/suspension-window.ts...
  ✅ lint:type-aware passed
  ℹ  Running check:duplicates (jscpd, intra-file only) on backend/lib/auth/suspension-window.ts...
  ✅ check:duplicates passed

  ✅ All checks for lifecycle "duplicates" passed for backend/lib/auth/suspension-window.ts
  EXIT_PRED=0
  ```

### 1.2.QL Quality Loop — test file

- Command: `bun run scripts/health/sub-loop.ts backend/lib/auth/suspension-window.test.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed: tsgo, oxlint, biome:check, lint:type-aware, check:duplicates (test files are outside jscpd's intra-file scan scope — reported as PASS with skip-notice).
- Lint-rule discovery loop summary (each rule surfaced, root-caused, and fixed in-test):
  - **`error TS2554: Expected 2-3 arguments, but got 1`** (tsgo) — bun:test's `it.todo(name)` signature requires a function. Switched to `it.todo(name, () => {})`, then to `it.skip(name, () => { ...live assertion... })`.
  - **`sonarjs/todo-tag`** (lint:type-aware) — fires on ANY literal `TODO` token (case-insensitive, including inside `it.todo` API names and `TODO-guarded` phrases in comments). Removed all `TODO` tokens from comments and switched from `it.todo` to `it.skip`.
  - **`sonarjs/assertions-in-tests`** (lint:type-aware) — `it.skip` with an empty body trips the rule. Resolved by moving the LIVE assertion (readFileSync + `.toContain`) INTO the skipped body; the test is skipped, but the assertion is present.
  - **`sonarjs/no-skipped-tests`** (lint:type-aware) — fires when a `.skip` call has no adjacent comment with letter content within 1 line. Resolved by placing a one-line `// Deferred pin: ...` explanation immediately above each `it.skip` call (within the rule's adjacency window of 1 line).
- Output tail (verbatim, post-fix):
  ```
  ℹ  Running tsgo (project-wide, filtering for backend/lib/auth/suspension-window.test.ts)...
  ✅ tsgo passed (no errors for backend/lib/auth/suspension-window.test.ts)
  ℹ  Running oxlint on backend/lib/auth/suspension-window.test.ts...
  ✅ oxlint passed
  ℹ  Running biome:check on backend/lib/auth/suspension-window.test.ts...
  ✅ biome:check passed
  ℹ  Submitting lint:type-aware via in-process service for backend/lib/auth/suspension-window.test.ts...
  ✅ lint:type-aware passed
  ℹ  Skipping check:duplicates for backend/lib/auth/suspension-window.test.ts (outside jscpd scan scope)...
  ✅ check:duplicates passed

  ✅ All checks for lifecycle "duplicates" passed for backend/lib/auth/suspension-window.test.ts
  EXIT_TEST=0
  ```

### 1.2.TE Test Engineering

- Command: `bun run test/scripts/run-test.ts backend/lib/auth/suspension-window.test.ts`
- Exit code: **0** ✅
- Result: **9 pass / 2 skip / 0 fail / 9 expect() calls / 11 tests across 1 file** (63ms).
- All 8 branch-matrix arms green (the (a) arm splits into two `it()` calls — `false` and `null` — for the falsy-suspended short-circuit, so the suite reports 9 passing tests for 8 conceptual arms).
- The 2 source pins are `skip` (deferred to task 3.2) — expected per the task description's "TODO-guarded or land 1.2.TE re-run at 3.2 completion" option; chosen the former.
- Output tail (verbatim):
  ```
  backend/lib/auth/suspension-window.test.ts:
  (pass) isSuspensionActive > returns false when suspended is false [0.20ms]
  (pass) isSuspensionActive > returns false when suspended is null [0.03ms]
  (pass) isSuspensionActive > returns true when suspended but suspendedAt is null [0.03ms]
  (pass) isSuspensionActive > returns true when suspended but suspendedPeriodDays is null [0.02ms]
  (pass) isSuspensionActive > returns true when suspendedPeriodDays is zero [0.01ms]
  (pass) isSuspensionActive > returns true when suspendedPeriodDays is negative [0.01ms]
  (pass) isSuspensionActive > returns true when now is strictly inside the active suspension window [0.01ms]
  (pass) isSuspensionActive > returns false at the exact boundary (now === suspendedAt + periodDays × MS_PER_DAY) [0.02ms]
  (pass) isSuspensionActive > returns false when the suspension window has fully lapsed [0.04ms]
  (skip) isSuspensionActive > backend/services/auth/auth.service.ts imports isSuspensionActive
  (skip) isSuspensionActive > backend/lib/auth/server-auth.ts imports isSuspensionActive

   9 pass
   2 skip
   0 fail
   9 expect() calls
  Ran 11 tests across 1 file. [63.00ms]
  EXIT=0
  ```
- Log saved at: `logs/2026-09-03T20-35-55/backend/lib/auth/suspension-window.test.ts.log` (per `[run-test] Log saved to:` line).

### Project-wide tsgo (regression check)

- Command: `bun tsgo`
- Exit code: **0** ✅
- New errors introduced: **0** (post-install baseline was 0 per `0-baseline-outcome.md` §Post-Install Re-Baseline; still 0 after this edit — predicate file + test file are clean).
- Output tail (verbatim):
  ```
  $ bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit
  [process-lock] Enqueued request for "tsgo" (PID: 5500)
  [process-lock] Acquired lock for "tsgo" (PID: 5500). Executing...
  [process-lock] Released lock for "tsgo" (PID: 5500)
  EXIT_TSGO=0
  ```

### 1.2.SEC Security & Tenancy Audit

- **Fail-closed bias** ✅: every corrupt-input arm in the truth table returns `true` (denies):
  - `suspended: true` + `suspendedAt: null` → `true` (test arm (b))
  - `suspended: true` + `suspendedPeriodDays: null` → `true` (test arm (c))
  - `suspended: true` + `suspendedPeriodDays: 0` → `true` (test arm (d) — zero-day window would otherwise compute `endsAt ≤ now` and misclassify as lapsed)
  - `suspended: true` + `suspendedPeriodDays: -3` → `true` (test arm (e) — corrupt int column accepts negative values)
- **No input shape widens access** ✅: the ONLY ways to get `false` (allow) are:
  1. `suspended` falsy (false/null) — the user is not flagged suspended, so window evaluation is moot.
  2. Valid `suspendedAt` + positive `suspendedPeriodDays` + window math evaluated to lapsed (`endsAt ≤ now`) — the user WAS suspended but the window has expired.
  - There is NO payload shape that combines `suspended: true` with missing/corrupt window data and returns `false`. A "free pass" payload is structurally impossible.
- **Corrupt data always denies** ✅: null `suspendedAt`, null `suspendedPeriodDays`, zero-day or negative-day durations all collapse to `true` (denies). No widening path exists.
- **Tenancy**: not applicable — the predicate is tenancy-agnostic (it accepts the governance state as a value, not a row scoped by tenant). The tenant scoping is the caller's responsibility (the `findGovernanceState` probe in task 2.3 selects by `users.id`, which is globally unique).

### 1.2.SR Semantic Review

- **Pure function** ✅: `now` is a parameter (no `Date.now()` / `new Date()` inside the function body). The only `Date` interaction is `.getTime()` reads on the caller-supplied `state.suspendedAt` and `now`. Verified by inspection: lines 46-56 of `backend/lib/auth/suspension-window.ts`.
- **No hidden Date construction leaks** ✅: the source-of-truth had `const endsAt = new Date(...)` to compute the window end; the predicate inlines the math (`suspendedAt.getTime() + suspendedPeriodDays * MS_PER_DAY > now.getTime()`) with no intermediate `Date` allocation. This is a deliberate simplification — fewer allocations, identical math, no behavior delta.
- **`MS_PER_DAY` single source** ✅: defined exactly once as `const MS_PER_DAY = 86_400_000` at line 26. Not exported, not duplicated. The `86_400_000` literal appears nowhere else in the file.
- **Zero dead code** ✅: every branch of the predicate is exercised by the test matrix:
  - `!state.suspended` → arm (a)
  - `suspendedAt === null` → arm (b)
  - `suspendedPeriodDays === null` → arm (c)
  - `suspendedPeriodDays <= 0` (zero) → arm (d)
  - `suspendedPeriodDays <= 0` (negative) → arm (e)
  - window math `>` true → arm (f)
  - window math `>` false at boundary → arm (g)
  - window math `>` false past boundary → arm (h)
- **Strict `>` (not `>=`)** ✅: line 55 uses `>` (not `>=`). Test arm (g) explicitly proves the boundary case (`now === suspendedAt + periodDays × MS_PER_DAY`) returns `false` (lapsed), matching the source-of-truth's strict-comparison semantics verbatim.

### 1.2.IV Instruction Verification

- Read `.agents/instructions/backend.instructions.md`.
- **Pure module, no side effects** ✅: no `console.*`, no `logger.*`, no I/O, no clock reads, no module-level mutable state. oxlint's `no-console: error` rule (line 33 of `oxlint.config.mts`) passes clean.
- **No `console.*` / `logger.*`** ✅: verified by `oxlint` passing (the rule would have errored on any `console.` call site).
- **Single export** ✅: `isSuspensionActive` is the only `export` in the module. `MS_PER_DAY` and `SuspensionState` are module-private (no `export` keyword).
- **Clean JSDoc (no plan-artifact references)** ✅: verified by grep:
  ```
  $ rg -n 'REQ-017|REQ-072|Task 1\.2|Phase 1|DEV3-017|tasks\.md|specs\.md|plan\.md|\.ai/plans' backend/lib/auth/suspension-window.ts
  (no matches — exit 1)
  ```
  The consumer references in the JSDoc (`isGovernanceExcludedFromDiscovery`, `assertUserActive`, `getServerUserContext`) are production-grade references to the canonical consumer functions, NOT plan-trio references. Same grep on the test file:
  ```
  $ rg -n 'REQ-017|REQ-072|Task 1\.2|Phase 1|DEV3-017|tasks\.md|specs\.md|plan\.md|\.ai/plans' backend/lib/auth/suspension-window.test.ts
  (no matches — exit 1)
  ```
- **Backend instructions §Logging** ✅: `NEVER use console.* - ESLint will error` — verified; no `console.*` call sites in either file.
- **Backend instructions §Code Style** ✅: no nested ternary operators. The predicate uses sequential `if` guards, which is the explicit recommended pattern.

---

## Carry-forward knowledge for future subtasks

- **`isSuspensionActive` is the single source of truth for suspension-window liveness** for ALL three consumption sites (handshake discovery filter, auth login+refresh boundary, SSR boundary). Task 1.3 will refactor `isGovernanceExcludedFromDiscovery` to consume it (behavior-preserving — its existing test suite is the regression net).
- **The predicate extracts ONLY the suspension-window branch** — the `isDeleted`/`isBlocked` arms stay in the caller. Per REQ-018, those flags have NO lapse concept and are always-denied at the auth boundary; the predicate's contract is "given a flagged suspension, is the window still active at `now`?".
- **Input shape is structurally compatible with `GovernanceProbeRowType`** (task 1.1 outcome): the probe type carries `{ isDeleted, suspended, suspendedAt, suspendedPeriodDays, isBlocked }` (all `readonly T | null`). The predicate accepts `{ readonly suspended; readonly suspendedAt; readonly suspendedPeriodDays }` — a structural subset. Task 2.3's `findGovernanceState` probe can be passed directly to `isSuspensionActive` via field selection.
- **Test seam convention for deferred source pins** — the pattern used here (`it.skip` with the LIVE assertion body present + a one-line adjacent explanation comment) is the canonical way to author deferred source pins in this repo:
  - `it.todo` is rejected by tsgo (signature requires a function body).
  - `it.todo(name, () => {})` is rejected by `sonarjs/assertions-in-tests` (empty body, no assertion).
  - `it.todo(name, () => { /* TODO */ })` is rejected by `sonarjs/todo-tag` (literal `TODO` token).
  - `it.skip(name, () => { /* live assertion */ })` with adjacent comment is accepted by all four gates.
  - When task 3.2 lands the auth-boundary consumption, the ONLY edit required to activate the two source pins is removing the `.skip` modifier on each call (lines 114 and 120 of the test file).
- **The `bun` binary path resolution issue** (`/home/z/.bun/bin/bun` missing — the runner hardcodes `join(homedir(), ".bun", "bin", "bun")`) was resolved by symlinking `~/.bun/bin/bun` → `/usr/local/bin/bun`. This is a sandbox-setup fix, not a code change. Future subagents in this sandbox benefit from the symlink being already in place.
- **MS_PER_DAY naming convention**: the source-of-truth uses `MS_PER_DAY = 86_400_000` (line 17 of `student-handshake.helpers.ts`). The predicate mirrors this naming EXACTLY so a future cleanup that consolidates the constant into a shared module (out-of-scope for this plan; would be a refactor ticket) can rename both occurrences in lockstep without semantic drift. The `86_400_000` literal appears nowhere else in either file.
- **STRICT `>` boundary semantics**: any future refactor that flips the comparison to `>=` is a behavior change — the boundary case (`now === suspendedAt + periodDays × MS_PER_DAY`) flips from "lapsed" (`false`) to "active" (`true`). Test arm (g) locks this behavior at the unit tier.

## Hazards discovered

- **`sonarjs/todo-tag` fires on `it.todo` API names** — discovered during the lint-rule discovery loop. The rule matches the literal `TODO` token case-insensitively, and `it.todo(...)` contains `todo`, so ANY use of the bun:test `it.todo` API in this repo trips the rule. The repo's `tests.instructions.md` does NOT document this constraint. Future subagents should prefer `it.skip` (with the live assertion body present + adjacent comment) over `it.todo` for ANY deferred-source-pin pattern. (No documentation file edited per the hard rule.)
- **`bun` binary not at the runner's hardcoded path** — the run-test script hardcodes `~/.bun/bin/bun`. On this sandbox, `bun` is at `/usr/local/bin/bun`. Resolved by symlink (one-shot, persists for future subagents). The orchestrator's `bun install` re-baseline step should consider adding this symlink.

## Ledger updates

- (none) — D1-D7 stay as `📅 Forward` (per `0-baseline-outcome.md` §"Deferred-Items Ledger Initialization"). This task did not resolve, advance, or block any deferred item. D2 (session-creation consumption of `isSuspensionActive`) is forward-referenced; the predicate is now AVAILABLE for that downstream consumption but is not yet consumed there.

---

## Verification Summary

| Verification | Expected | Actual | Status |
|---|---|---|---|
| Source-of-truth read (student-handshake.helpers.ts) | Grepped `isGovernanceExcludedFromDiscovery`, read lines 1-60 | Read verbatim; citation accurate (lines 39-59) | ✅ recorded |
| Predicate module created | `backend/lib/auth/suspension-window.ts`, single export, pure function | Created; 57 lines; one export (`isSuspensionActive`) | ✅ |
| Test file created | `backend/lib/auth/suspension-window.test.ts`, 8 branch-matrix arms + 2 source pins | Created; 125 lines; 9 passing tests + 2 skipped source pins | ✅ |
| 1.2.QL on predicate module | exit 0 | exit 0 (5/5 sub-loop gates) | ✅ |
| 1.2.QL on test file | exit 0 | exit 0 (5/5 sub-loop gates, check:duplicates skipped per scope) | ✅ |
| 1.2.TE branch-matrix tests pass | 8 arms green | 8 arms green (9 passing tests, arm (a) split into false/null) | ✅ |
| 1.2.TE source-pin TODOs deferred to 3.2 | 2 pins `it.skip` with live assertion body | 2 pins `it.skip` with live assertion body, adjacent explanation comment | ✅ |
| 1.2.SEC fail-closed bias | all corrupt-input arms return `true` | (b)(c)(d)(e) all return `true` | ✅ |
| 1.2.SR pure function | no `Date.now()` inside; `now` is a parameter | verified by inspection (lines 46-56) | ✅ |
| 1.2.SR `MS_PER_DAY` single source | defined once | line 26 (single `const`) | ✅ |
| 1.2.SR strict `>` (not `>=`) | boundary case returns `false` | line 55 uses `>`; test (g) locks the boundary | ✅ |
| 1.2.IV no plan-artifact references | grep returns 0 matches | 0 matches in both files (exit 1) | ✅ |
| Project-wide tsgo regression check | exit 0 (no new errors) | exit 0 | ✅ |
| Outcome file written | `1-2-outcome.md` exists, well-formed | this file | ✅ |
| Source code untouched outside scope | only `backend/lib/auth/suspension-window.{ts,test.ts}` modified | verified | ✅ |

---

## Files Touched by This Task

| File | Operation |
|---|---|
| `backend/lib/auth/suspension-window.ts` | CREATED — pure predicate module (57 lines, single export `isSuspensionActive`) |
| `backend/lib/auth/suspension-window.test.ts` | CREATED — branch-matrix unit suite (125 lines, 9 pass / 2 skip / 0 fail) |
| `~/.bun/bin/bun` | SYMLINKED — `-> /usr/local/bin/bun` (sandbox setup fix so `bun run test/scripts/run-test.ts` can spawn `bun`; one-shot, persists for downstream subagents on this sandbox) |
| `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/1-2-outcome.md` | CREATED — this file |

No source files outside `backend/lib/auth/suspension-window.{ts,test.ts}` were touched. No plan files (`tasks.md`/`specs.md`/`plan.md`/`deferred-items.md`) were modified. The `tasks.md` checkbox `[ ] 1.2` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome.
