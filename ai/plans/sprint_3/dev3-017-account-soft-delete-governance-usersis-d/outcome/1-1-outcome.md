# Phase 1.1 — GovernanceProbeRowType Outcome

**Task ID:** 1.1
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-03
**Branch:** `feat/dev3-017-account-soft-delete-governance`
**Agent:** Phase 1.1 GovernanceProbeRowType Subagent
**Requirements:** REQ-003

---

## What was implemented

Added the canonical `GovernanceProbeRowType` interface to `backend/types/admin/admin-user.types.ts` — a focused probe-row shape carrying the five `users` governance columns consumed by the governance-state classifier (deleted flag, suspension flag + suspension window, block flag). The interface is `readonly` end-to-end, preserves the nullable-with-default schema shape (`boolean | null`, `Date | null`, `number | null`) matching Drizzle's `$inferSelect` for the underlying nullable columns, and excludes all PII columns by construction.

## Files modified

- `backend/types/admin/admin-user.types.ts` — added the `GovernanceProbeRowType` interface at lines 289-295, immediately after the existing `AdminUserUpdateDbPatch` type alias. Added a 19-line JSDoc comment (lines 270-288) describing what the probe represents, why the nullable-with-default shape is preserved (suspension-window predicate distinguishes "explicitly false" from "legacy NULL state" for fail-closed behavior), and why the shape is `readonly` end-to-end (probe rows are immutable snapshots consumed by the service layer for read-only state classification).

## Files NOT modified (and why)

- `backend/types/admin/index.ts` — barrel uses `export * from "./admin-user.types";` (verified line 1). `GovernanceProbeRowType` auto-re-exports via the wildcard; no edit needed. Per backend.instructions.md §"Barrel Files Conventions": `export *` is the canonical pattern.
- No service-layer `.types.ts` files created (task scope forbids it).
- No new `*Input`, `*SubmitInput`, or `*ReturnType` types added (task scope forbids it; this is a probe row, not a transport or return surface).
- No plan files (`tasks.md` / `specs.md` / `plan.md`) touched — orchestrator owns checkbox updates.

## Verification evidence

### 1.1.QL Quality Loop
- Command: `bun run scripts/health/sub-loop.ts backend/types/admin/admin-user.types.ts --lifecycle duplicates`
- Exit code: **0** ✅
- Output tail (verbatim):
  ```
  ℹ  Running tsgo (project-wide, filtering for backend/types/admin/admin-user.types.ts)...
  ✅ tsgo passed (no errors for backend/types/admin/admin-user.types.ts)
  ℹ  Running oxlint on backend/types/admin/admin-user.types.ts...
  ✅ oxlint passed
  ℹ  Running biome:check on backend/types/admin/admin-user.types.ts...
  ✅ biome:check passed
  ℹ  Submitting lint:type-aware via in-process service for backend/types/admin/admin-user.types.ts...
  [process-lock] Enqueued request for "lint-service: sub-loop" (PID: 3931)
  [process-lock] Acquired lock for "lint-service: sub-loop" (PID: 3931). Executing...
  [process-lock] Released lock for "lint-service: sub-loop" (PID: 3931)
  ✅ lint:type-aware passed
  ℹ  Running check:duplicates (jscpd, intra-file only) on backend/types/admin/admin-user.types.ts...
  ✅ check:duplicates passed

  ✅ All checks for lifecycle "duplicates" passed for backend/types/admin/admin-user.types.ts
  [process-lock] Released lock for "sub-loop: backend/types/admin/admin-user.types.ts" (PID: 3931)
  EXIT=0
  ```
- All five sub-loop gates passed: tsgo, oxlint, biome:check, lint:type-aware, check:duplicates.

### tsgo (project-wide)
- Command: `bun tsgo`
- Exit code: **0** ✅
- New errors introduced: **0** (post-install baseline was 0 per `0-baseline-outcome.md` Post-Install Re-Baseline section; still 0 after this edit).
- Output tail (verbatim):
  ```
  $ bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit
  [process-lock] Enqueued request for "tsgo" (PID: 4057)
  [process-lock] Acquired lock for "tsgo" (PID: 4057). Executing...
  [process-lock] Released lock for "tsgo" (PID: 4057)
  EXIT=0
  ```

### 1.1.TE Test Engineering
- Type-level only — tsgo is the gate (passed ✅). Repo/service tiers (tasks 2.3 / 2.4) will exercise the type transitively when `AdminUserRepository.findGovernanceState` consumes it as its return shape and `AdminUserManagementService.setUserSuspended` / `setUserBlocked` consume the probe for zero-row classifier disambiguation.

### 1.1.SEC Security & Tenancy Audit
- Zero PII columns: ✅
  - Members: `isDeleted`, `suspended`, `suspendedAt`, `suspendedPeriodDays`, `isBlocked` — all governance-state flags / timestamps / a period-days count.
- No email/phone/fullName/passwordHash/secret/token fields: ✅
- The probe-row shape is structurally PII-free by construction; the dedicated probe read (task 2.3) will `SELECT` ONLY these five columns, never `passwordHash`, never `*` — the type encodes that discipline at compile time.

### 1.1.SR Semantic Review
- Canonical placement: ✅ — in `backend/types/admin/admin-user.types.ts`, the canonical admin types home per backend.instructions.md §"Type Definition Pattern" ("ALL types from `@/backend/types` — NEVER local definitions").
- All 5 fields `readonly`: ✅ — verified lines 290-294.
- All 5 fields accept `null` (matching Drizzle `$inferSelect` for nullable columns): ✅ — `isDeleted: boolean | null`, `suspended: boolean | null`, `suspendedAt: Date | null`, `suspendedPeriodDays: number | null`, `isBlocked: boolean | null`. The probe deliberately does NOT null-coalesce to `false` (the directory shape does, but the probe feeds the suspension-window predicate which must distinguish "explicitly false" from "legacy NULL state" for fail-closed behavior).
- No duplicated shape elsewhere: ✅
  - Grep for `GovernanceProbeRowType` across `/home/z/my-project` returned only the four plan-trio files (`tasks.md`, `specs.md`, `plan.md`, `plan-review-R1.md`) — no source file declares this symbol.
  - Grep for the 5-field combination `isDeleted ... suspended ... suspendedAt ... suspendedPeriodDays ... isBlocked` in `backend/**` returned two structurally-DISTINCT shapes:
    1. `AdminUserDetailRow` (`backend/db/repo/admin/admin-user-row-types.ts:109-147`) — carries the same five governance columns BUT as part of a 30+ field full-detail row projection (also includes `passwordHash`-excluded identity columns, timestamps, role-child columns). It is repo-internal per its JSDoc: "They live beside the repository (not in `backend/types/`) because they are repo-internal projections." Distinct purpose, distinct location.
    2. `AdminUserListItemReturnType` (`backend/types/admin/admin-user.types.ts:36-56`) — uses NON-nullable `boolean` (post-null-coalesce for the directory display), and does NOT carry `suspendedAt` / `suspendedPeriodDays`. Distinct shape, distinct purpose.
  - The new `GovernanceProbeRowType` is the canonical, minimal, focused probe shape — no other type in the tree matches this exact 5-field shape. No duplication.

### 1.1.IV Instruction Verification
- Read `.agents/instructions/backend.instructions.md`.
- Types come from canonical `backend/types/{entity}.types.ts`: ✅ — the interface lives in `backend/types/admin/admin-user.types.ts` (canonical admin types home).
- No local type definitions in services/repositories: ✅ — none created; the repo-internal `AdminUserDetailRow` already in `backend/db/repo/admin/admin-user-row-types.ts` is NOT a local admin-user-management type, it is a separate Drizzle-row projection type per its own JSDoc.
- No cross-layer imports: ✅ — the new interface has zero imports (it is a self-contained structural shape, no `UserSelectType` reference, no enum imports).
- Clean comments (no plan-artifact references): ✅ — JSDoc contains no "REQ-003", "Task 1.1", "Phase 1", "tasks.md", "specs.md", "plan.md", "DEV3-017", `.ai/plans/`, or any other plan-trio reference. Production-grade language only.
- Barrel discipline per §"Barrel Files Conventions": ✅ — verified `backend/types/admin/index.ts:1` uses `export * from "./admin-user.types";` (relative `./` path, wildcard re-export, no named exports, no imports). The new symbol auto-exports.

## Carry-forward knowledge for future subtasks

- **`GovernanceProbeRowType` is the canonical return shape for `AdminUserRepository.findGovernanceState`** (task 2.3). The repo will `SELECT` exactly these five columns from `users` (never `*`, never `passwordHash`) and return `GovernanceProbeRowType | null` (null = zero rows = user not found).
- **It is the input shape for the suspension-window classifier** (`isSuspensionActive`, task 1.2) via structural subset — task 1.2's predicate accepts `{ readonly suspended; readonly suspendedAt; readonly suspendedPeriodDays }`, which is structurally assignable from this probe type.
- **It is consumed by `AdminUserManagementService.setUserSuspended` / `setUserBlocked`** (task 2.4) for zero-row classifier disambiguation — the service probes governance state BEFORE the guarded mutation to emit the right denial code (`USER_ALREADY_SUSPENDED` / `USER_NOT_SUSPENDED` / `USER_ALREADY_BLOCKED` / `USER_NOT_BLOCKED`) without an extra round-trip per denial branch.
- **The 5 columns match the existing `users` table columns** (verified via grep — `backend/db/schema/users/users.ts` is in the `suspendedPeriodDays` file list). REQ-045 (zero schema drift) holds: this type is a projection of existing columns, NOT a schema change.
- **All fields are `readonly`** — consumers MUST treat the probe row as immutable. Any mutation goes through the dedicated guarded repository transitions (task 2.3 `setSuspendedOnce` / `setBlockedOnce`).
- **The barrel at `backend/types/admin/index.ts` uses `export *`** so future types added to `admin-user.types.ts` auto-export — no barrel edits needed for subsequent Phase 1.x tasks.
- **Repo-internal `AdminUserDetailRow` (in `backend/db/repo/admin/admin-user-row-types.ts`) is the FULL detail projection** — distinct from `GovernanceProbeRowType`. Future task 2.3 should NOT reuse `AdminUserDetailRow` as the probe return shape; it MUST use `GovernanceProbeRowType` to enforce the minimal-read discipline.
- **`AdminUserListItemReturnType` uses NON-nullable `boolean` (post-coalesce)** — distinct from the probe's `boolean | null`. The probe deliberately preserves nullability so the classifier can distinguish "explicitly set to false" from "legacy NULL state".

## Hazards discovered

- (none) — clean execution; no divergence from plan; no cross-file dependencies surfaced; no instruction-file ambiguities.

## Ledger updates

- (none) — D1-D7 stay as `📅 Forward` (per `0-baseline-outcome.md` §"Deferred-Items Ledger Initialization"). This task did not resolve, advance, or block any deferred item.
