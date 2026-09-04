# Phase 2.1 — Account-Governance Journey Test (TEST-FIRST) Outcome

**Task ID:** 2.1
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-03
**Branch:** `feat/dev3-017-account-soft-delete-governance`
**Agent:** Phase 2.1 Journey Test (TEST-FIRST) Subagent
**Requirements:** REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095
**Expected state:** RED at authoring (service surface absent); turns GREEN after tasks 2.2 / 2.3 / 2.4 / 3.2 land

---

## What was implemented

Created `test/workflows/admin/account-governance.journey.test.ts` — one cross-actor journey file covering the Workflow 05 §5 lifecycle (specs §2.9, steps 1-11). The test provisions five actors (Admin A acting, Admin B observer, Governed Admin G `isBlocked=true`, Teacher T cross-role control via REAL `RegistrationService.registerUser` teacher branch, Student S governance target via REAL `RegistrationService.registerUser` student branch with a recorded plaintext credential), then exercises the suspend / unsuspend / block / unblock / soft-delete / reactivate lifecycle with row-count oracles on `audit_logs` and `users`, byte-identical column proofs for the lapsed-suspension path (REQ-019 zero-write), and cross-role containment checks (Teacher T's `users` + `applicants` rows byte-identical across every step — REQ-015).

The test imports the EXISTING `AdminUserManagementService` namespace from `@/backend/services/admin/user-management.service` (DEV3-016 surface, consumed — never forked) and calls two methods that DO NOT EXIST on it at authoring time:

- `AdminUserManagementService.setUserSuspended(id, suspended, periodDays, actorId, locale, outerTx?)` — task 2.4 deliverable
- `AdminUserManagementService.setUserBlocked(id, blocked, actorId, locale, outerTx?)` — task 2.4 deliverable

The TypeScript namespace exists; the methods do not. The suite is RED by design (compile-time `TS2339: Property 'setUserSuspended'/'setUserBlocked' does not exist on type 'typeof AdminUserManagementService'`). The suite will go GREEN once tasks 2.2 (strict `assertActiveActorAdmin`), 2.3 (`setSuspendedOnce` / `setBlockedOnce` / `findGovernanceState` repository transitions), 2.4 (the service surface), and 3.2 (`AuthService.assertUserActive` consuming `isSuspensionActive` — needed for step 8's lapsed-suspension login success) all land.

A per-domain cast helper `test/workflows/helpers/admin-governance-cast.ts` was ALSO created — see the next section for the decision rationale.

## Cast helper decision

**CREATED** `test/workflows/helpers/admin-governance-cast.ts`.

The five-actor governance cast shape is NOT expressible by the existing `createJourneyFixtures` helper (DEV3-004 / DEV3-016 generic admin journey cast) because the governance lifecycle requires:

1. **TWO admins** (Admin A acting + Admin B observing) — the generic cast provisions exactly ONE admin (`cast.admin`).
2. **A Governed Admin G** with `isBlocked = true` to exercise the strict `assertActiveActorAdmin` blocked-actor denial path (step 9e) — the generic cast's `provisionAdmin` writes `isBlocked = false` (default) and never provisions a governed-state admin.
3. **Teacher T** produced via the REAL `RegistrationService.registerUser` teacher branch with a KNOWN plaintext credential (so the journey's login probes can submit it through `AuthService.login`) — the generic cast's `applicant` fixture is direct-inserted with a STUB password hash (`FIXTURE_CREDENTIAL_STUB = "journeyFixtureStubHash0123456789AB"`) that CANNOT be logged in as.
4. **Student S** produced via the REAL `RegistrationService.registerUser` student branch with a KNOWN plaintext credential — same rationale; the generic cast's `student` fixture is direct-inserted with a stub hash.

The new helper `createGovernanceCast(prefix)` provisions:

- `adminA` — direct insert (real `users` row with `role="admin"` + real `admin` role-child row; fixture stub password hash — A is never a login target).
- `adminB` — direct insert (same shape as A; B is the observer).
- `governedAdminG` — direct insert with `isBlocked=true` + `blockedAt=now` (real `admin` role-child row; G is the strict-guard denial target).
- `teacherT` — REAL `RegistrationService.registerUser({ role: "teacher", password: TEACHER_T_CREDENTIAL, ... })` → real `users` row (bcrypt hash) + real `applicants` row (the certification lock holds — NO `teacher` row).
- `studentS` — REAL `RegistrationService.registerUser({ role: "student", password: STUDENT_S_CREDENTIAL, ... })` → real `users` row (bcrypt hash) + real `students` row (zeroed balances + unique handshake code).

The helper returns `{ cast, registry }` where `registry: JourneyFixtureRegistry` is shape-compatible with the EXISTING `journeyCleanup(registry)` helper from `test/workflows/helpers/journey-cleanup.ts` (so it could be used) — BUT the journey test itself uses `deleteUsersByIds` from `test/helpers/db-cleanup.ts` per the task spec ("tracked hard-delete in FK-safe order via `withAuditDeleteTriggersSuspended` (`test/helpers/db-cleanup.ts:83-109`) + `deleteUsersByIds`"). `deleteUsersByIds` wraps `withAuditDeleteTriggersSuspended` internally (verified at `test/helpers/db-cleanup.ts:126-130`) and handles the `audit_logs.actor_id` `ON DELETE RESTRICT` FK + the append-only immutability trigger.

Every actor's `users` row is byte-captured at provisioning time as `userSnapshot` for the journey's fixture-immutability assertions. Teacher T also captures the `applicants` row snapshot as `applicantSnapshot` (Teacher T is the cross-role control target).

## Files created

- `test/workflows/helpers/admin-governance-cast.ts` — five-actor governance journey cast provisioner (351 lines). Real registration flows for Teacher T + Student S; direct-insert admin rows for Admin A / B / Governed Admin G. Returns `{ cast, registry }` shape-compatible with both `journeyCleanup(registry)` and `deleteUsersByIds(registry.userIds)`.
- `test/workflows/admin/account-governance.journey.test.ts` — the journey test covering Workflow 05 §5 cross-actor lifecycle (11 sequential steps; ~830 lines including header comments + helper functions).

## Files NOT modified

- (none — this task only CREATES test files. NO source files under `backend/`, `frontend/`, `app/`, `shared/` were touched. NO plan files (`tasks.md` / `specs.md` / `plan.md` / `deferred-items.md`) were modified. The `tasks.md` checkbox `[ ] 2.1` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome.)

## Verification evidence

### 2.1 Quality Loop — cast helper

- Command: `bun run scripts/health/sub-loop.ts test/workflows/helpers/admin-governance-cast.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed: tsgo, oxlint, biome:check, lint:type-aware, check:duplicates.
- Output tail (verbatim):
  ```
  ℹ  Running tsgo (project-wide, filtering for test/workflows/helpers/admin-governance-cast.ts)...
  ✅ tsgo passed (no errors for test/workflows/helpers/admin-governance-cast.ts)
  ℹ  Running oxlint on test/workflows/helpers/admin-governance-cast.ts...
  ✅ oxlint passed
  ℹ  Running biome:check on test/workflows/helpers/admin-governance-cast.ts...
  ✅ biome:check passed
  ℹ  Submitting lint:type-aware via in-process service for test/workflows/helpers/admin-governance-cast.ts...
  ✅ lint:type-aware passed
  ℹ  Running check:duplicates (jscpd, intra-file only) on test/workflows/helpers/admin-governance-cast.ts...
  ✅ check:duplicates passed

  ✅ All checks for lifecycle "duplicates" passed for test/workflows/helpers/admin-governance-cast.ts
  EXIT=0
  ```

### 2.1 Quality Loop — journey test (EXPECTED RED)

- Command: `bun run scripts/health/sub-loop.ts test/workflows/admin/account-governance.journey.test.ts --lifecycle duplicates`
- Exit code: **1** (EXPECTED — service surface absent)
- tsgo FAILED at the first gate (expected). Verbatim errors (14 total — all are `TS2339: Property '<method>' does not exist on type 'typeof AdminUserManagementService'`):
  ```
  test/workflows/admin/account-governance.journey.test.ts(335,53): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(399,53): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(436,53): error TS2339: Property 'setUserBlocked' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(484,53): error TS2339: Property 'setUserBlocked' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(537,34): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(619,53): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(643,34): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(662,34): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(674,38): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(687,34): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(708,38): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(721,34): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(747,34): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  test/workflows/admin/account-governance.journey.test.ts(764,34): error TS2339: Property 'setUserSuspended' does not exist on type 'typeof AdminUserManagementService'.
  ```
  Total: **14 errors** = 12 × `setUserSuspended` + 2 × `setUserBlocked`. All errors are the EXPECTED RED state — they will resolve once task 2.4 lands the two service methods on the `AdminUserManagementService` namespace.
- oxlint / biome:check / lint:type-aware / check:duplicates were NOT reached (sub-loop stops at the first failing gate).
- **Resolution:** deferred to task 2.4 — the journey test goes GREEN once tasks 2.2 + 2.3 + 2.4 + 3.2 land. Subsequent sub-loop re-runs (after task 2.4) MUST pass all five gates.

### 2.1 Test Execution (run-test — EXPECTED RED)

- Command: `bun run test/scripts/run-test.ts test/workflows/admin/account-governance.journey.test.ts`
- Exit code: **1** (EXPECTED — RED)
- Result: **0 pass / 1 fail / 1 test in 1 file** (202ms). The single failure is the `beforeAll` hook's `createGovernanceCast(PREFIX)` call which fails at DB-connect time.
- Failure mode (verbatim tail):
  ```
  error: connect ECONNREFUSED ::1:5432
     errno: -111,
   syscall: "connect",
      port: 5432,
   address: "::1",
      code: "ECONNREFUSED"

  error: connect ECONNREFUSED 127.0.0.1:5432
     errno: -111,
   syscall: "connect",
      port: 5432,
   address: "127.0.0.1",
      code: "ECONNREFUSED"
  ...
   0 pass
   1 fail
  Ran 1 test across 1 file. [202.00ms]
  ```
- Failure mode analysis: bun's transpiler-only pipeline does NOT type-check (the `TS2339` errors are compile-time only and do NOT prevent the test from running). The test reaches the `beforeAll` hook, calls `createGovernanceCast(PREFIX)`, which calls `db.transaction(...)` on the global `db` client. The `db` client resolves to a `pg.Pool` (Postgres-backed) because the sandbox's `.env.test` declares `DB_PROVIDER=sqlite`, but `sqlite` is NOT a recognized provider (only `pglite` triggers the alternate path) — every other value defaults to `postgres`. Postgres is unavailable on this sandbox (port 5432 refused), so the `beforeAll` hook fails before any governance logic is exercised. This is the SAME pre-existing sandbox hazard documented by `0-2-reuse-substrate-outcome.md` §"Sandbox note (PostgreSQL)" + `1-3-outcome.md` §"Pre-existing sandbox hazard (NOT caused by this refactor)".
- **Resolution:** deferred to (a) task 2.4 landing the absent service methods (so the TypeScript errors resolve) AND (b) a Postgres-available runtime environment (CI / production, NOT this sandbox). The test is still valuable as a compile-time contract for the service surface (tasks 2.2 / 2.3 / 2.4) — runtime green will be verified in the post-install / postgres-available environment.

### Project-wide tsgo regression check

- Command: `bun tsgo`
- Exit code: **1** (RED — but ALL errors are confined to the new journey test file)
- `rg -c "error TS"` over the full tsgo output: **14** (12 × `setUserSuspended` + 2 × `setUserBlocked`, all in `test/workflows/admin/account-governance.journey.test.ts`)
- ZERO errors elsewhere — the cast helper compiles clean; the rest of the project is unaffected. The post-install baseline (`0-baseline-outcome.md` §Post-Install Re-Baseline) was 0 errors project-wide; the new 14 errors are EXACTLY the EXPECTED RED state for this TEST-FIRST task.

---

## Step-by-step journey coverage (11 steps)

1. ✅ **Fixtures committed** — `beforeAll` calls `createGovernanceCast(PREFIX)`. Step 1 asserts all five actor ids > 0, real `admin`/`teacher`/`student` role-child rows present, Governed Admin G's `isBlocked=true` + `blockedAt` set, Teacher T's `applicants` row in canonical pending state, Student S's `students` row has `handshakeCode` matching `^KSB-`, registry tracks all five ids, Teacher T byte-identical at provisioning time.

2. ✅ **A suspends S (7 days)** — calls `AdminUserManagementService.setUserSuspended(S.id, true, 7, A.id, LOCALE)`. Asserts returned detail's `suspended=true`/`suspendedAt` not null/`suspendedPeriodDays=7`; `users(S)` columns set; EXACTLY ONE `audit_logs` row (`Suspend`, `entityType="user"`, `entityId=S.id`, `actorId=A.id`); Teacher T byte-identical.

3. ✅ **S login → ForbiddenError (active suspension denies)** — calls `AuthService.login(S.email, S.credential, LOCALE)`. Asserts `ForbiddenError` + translated `tAuth.accountBlocked` substring. B observes S's suspended state via `getUserDetail(S.id, LOCALE, B.id)` (cross-actor visibility). B observes the ONE audit row attributed to A.

4. ✅ **A unsuspends S** — calls `setUserSuspended(S.id, false, null, A.id, LOCALE)`. Asserts three columns cleared (`suspended=false`, `suspendedAt=null`, `suspendedPeriodDays=null`); ONE `Reactivate` audit row; S's login SUCCEEDS (real session payload returned).

5. ✅ **A blocks S** — calls `setUserBlocked(S.id, true, A.id, LOCALE)`. Asserts `isBlocked=true`/`blockedAt` not null; ONE additional `Suspend`-mapped audit row (REQ-011 mapping: block → `Suspend` actionType — total = 2 Suspend rows: step 2 + step 5); audit row's `details` JSON's `changedFields` array contains `["isBlocked", "blockedAt"]` (verified via `JSON.parse(latestAudit.details).changedFields` array-contains); S's login → `ForbiddenError` (NO lapse semantics for block).

6. ✅ **A unblocks S** — calls `setUserBlocked(S.id, false, A.id, LOCALE)`. Asserts `isBlocked=false`/`blockedAt=null`; ONE additional `Reactivate` audit row (total = 2 Reactivate rows: step 4 + step 6); login succeeds again.

7. ✅ **A soft-deletes S; suspend on DELETED S → USER_ALREADY_DELETED; reactivate S; login succeeds** — calls the EXISTING DEV3-016 `setUserDeleted(S.id, true, A.id, LOCALE)` (consumed, never forked). Asserts `isDeleted=true`; S's login → `ForbiddenError`. Then attempts `setUserSuspended(S.id, true, 7, A.id, LOCALE)` on the DELETED S → `ConflictError` with `code="USER_ALREADY_DELETED"` + `tErrors.adminUsers.userAlreadyDeleted` substring + ZERO new audit rows (verified by `countAuditForEntity` before/after equal AND `countAllAuditForActor` before/after equal — JR-C-1 denial-no-audit rule). Then reactivates S via the EXISTING `setUserDeleted(S.id, false, A.id, LOCALE)` path; S's login succeeds (full lifecycle loop closed cross-feature).

8. ✅ **LAPSED suspension fixture-write → login SUCCEEDS; columns BYTE-IDENTICAL (REQ-019 zero-write proof)** — uses `setGovernanceFixture(S.id, { suspended: true, suspendedAt: now-10d, suspendedPeriodDays: 7 })` (direct fixture write; the 7-day window has fully lapsed — 10 > 7). Captures `users(S)` row IMMEDIATELY before login. Calls `AuthService.login(S.email, S.credential, LOCALE)` — **MUST SUCCEED** (lapsed suspension allows login). **NOTE:** this assertion REQUIRES task 3.2 (`AuthService.assertUserActive` consuming `isSuspensionActive`); until then, `assertUserActive` treats `suspended` as a plain boolean flag and DENIES login regardless of window. Captures `users(S)` row AFTER login → asserts BYTE-IDENTICAL to before-login snapshot (REQ-019 zero-write proof). B's detail read still shows the suspended window fields (window fields persist until A's audited release — REQ-091). A then unsuspends S → columns cleared under audit (one new Reactivate row, count delta = +1).

9. ✅ **Denial battery** — six denial probes:
   - 9a: S (non-admin) calls `setUserSuspended(S.id, true, 7, S.id, LOCALE)` → `ForbiddenError` + `tErrors.forbidden` substring + ZERO writes (`users(S)` byte-identical before/after) + ZERO audit rows (count delta = 0).
   - 9b: A self-targets → `ConflictError("USER_SELF_SUSPENSION_FORBIDDEN")` + `tErrors.adminUsers.userSelfSuspensionForbidden` substring + ZERO writes (`users(A)` byte-identical) + ZERO audit rows (count delta = 0).
   - 9c: A re-suspends ALREADY-ACTIVE S → first `setUserSuspended(S.id, true, 7, A.id, LOCALE)` to make S active, then re-attempt → `ConflictError("USER_ALREADY_SUSPENDED")` + `tErrors.adminUsers.userAlreadySuspended` substring + ZERO new audit row for the denial.
   - 9d: A unsuspends a CLEAN user → first `setUserSuspended(S.id, false, null, A.id, LOCALE)` to clear S, then re-attempt unsuspend → `ConflictError("USER_NOT_SUSPENDED")` + `tErrors.adminUsers.userNotSuspended` substring + ZERO new audit row.
   - 9e: Governed Admin G (admin + `isBlocked=true`) calls `setUserSuspended(S.id, true, 7, G.id, LOCALE)` → `ForbiddenError` + `tAuth.accountBlocked` substring (the strict `assertActiveActorAdmin` guard evaluates G's `isBlocked=true` and rejects BEFORE any work) + ZERO writes + ZERO audit rows.
   - 9f: Anonymous (`actorId=0`) calls `setUserSuspended(S.id, true, 7, 0, LOCALE)` → `UnauthorizedError` + `tErrors.unauthorized` substring.
   - Teacher T control byte-identical throughout the denial battery.

10. ✅ **Teacher T control — byte-identical across the whole journey (REQ-015)** — consolidates the per-step `assertTeacherTUntouched()` proof. Asserts Teacher T's `users` + `applicants` rows byte-identical to provisioning-time snapshots; Teacher T's role is still `teacher` (not tampered with); Teacher T's governance state is clean (never targeted). Cross-entity audit visibility: `auditForS > 0` (the journey wrote multiple audit rows ABOUT S) but `auditForT = 0` (the journey NEVER wrote an audit row about Teacher T — cross-role containment).

11. ✅ **Teardown** — pre-teardown side-effect-absence proof: every tracked actor's `notifications` count equals its baseline captured at provisioning time (this surface emits ZERO notifications — D12 deferred decision). The actual hard-delete is performed by `afterAll` via `deleteUsersByIds(registry.userIds)` (wraps `withAuditDeleteTriggersSuspended` internally + handles the `audit_logs.actor_id` RESTRICT FK + the append-only immutability trigger). Residue re-probe via `countUsersByIds(registry.userIds)` MUST equal 0 (asserted in `afterAll` itself).

---

## Carry-forward knowledge for Phase 2.2 / 2.3 / 2.4 / 3.2 subagents

### Service method signatures (task 2.4 MUST implement these EXACTLY)

The journey test calls the following methods on `AdminUserManagementService`. The signatures are inferred from the call sites and the task spec verbatim — task 2.4 MUST implement them with these EXACT signatures:

```typescript
// In backend/services/admin/user-management.service.ts (task 2.4):

export async function setUserSuspended(
  id: number,
  suspended: boolean,
  periodDays: number | null,  // null when suspending=false (clear path); positive int 1..3650 when suspending=true
  actorId: number,
  locale: string,
  outerTx?: DBTransaction
): Promise<AdminUserDetailReturnType>;

export async function setUserBlocked(
  id: number,
  blocked: boolean,
  actorId: number,
  locale: string,
  outerTx?: DBTransaction
): Promise<AdminUserDetailReturnType>;
```

### Repository method signatures (task 2.3 MUST implement these)

```typescript
// In backend/db/repo/admin/admin-user.repository.ts (task 2.3):

export async function setSuspendedOnce(
  id: number,
  target: { suspended: boolean; suspendedAt: Date | null; suspendedPeriodDays: number | null },
  tx?: DBTransaction
): Promise<AdminUserSafeSelect | null>;  // null = zero rows matched (caller disambiguates)

export async function setBlockedOnce(
  id: number,
  target: { isBlocked: boolean; blockedAt: Date | null },
  tx?: DBTransaction
): Promise<AdminUserSafeSelect | null>;  // null = zero rows matched

export async function findGovernanceState(
  id: number,
  tx?: DBTransaction
): Promise<GovernanceProbeRowType | null>;  // null = user not found; returns the 5 governance columns ONLY (no PII, no passwordHash)
```

### Strict actor guard signature (task 2.2 MUST implement this)

```typescript
// In backend/services/admin/admin-governance-guard.helpers.ts (NEW file per 0-2-reuse-substrate-outcome.md A19 + Conditional Verdicts):

export async function assertActiveActorAdmin(
  actorId: number,
  locale: string,
  outerTx?: DBTransaction
): Promise<void>;  // throws ForbiddenError on governed actor; UnauthorizedError on anonymous
```

Per the 0-2 outcome's Conditional Verdicts section + plan-review-R1 F4: the EXISTING `assertActorAdmin` at `backend/services/admin/admin-gate.helpers.ts:59` is the BFLA actor gate (role-only check — does NOT evaluate `isBlocked`/`suspended`/`isDeleted`). Task 2.2 MUST BUILD a NEW strict variant `assertActiveActorAdmin` at a NEW file `backend/services/admin/admin-governance-guard.helpers.ts` (recommend filename per 0-2 outcome — avoids colliding with the existing `admin-gate.helpers.ts` BFLA gate). The new guard composes the base check on the SAME fetched actor row (no second query), then evaluates the governance state in deterministic order:
- `isDeleted` → `ForbiddenError(tErrors.accountDeleted)` (deleted actor)
- `isBlocked` → `ForbiddenError(tErrors.accountBlocked)` (blocked actor — Governed Admin G triggers this)
- `isSuspensionActive({…}, new Date())` → `ForbiddenError(tErrors.accountSuspended)` (actively suspended actor — window predicate from task 1.2's `backend/lib/auth/suspension-window.ts`)

ONE `logger.logDomainError({ code: "FORBIDDEN", entity: "user", entityId })` per denial. ZERO writes, ZERO audit rows on denial (JR-C-1).

### Journey expectations (the contract — task 2.4 MUST satisfy these)

- **EXACTLY ONE audit_logs row per transition**:
  - suspend (suspended=false → true): `actionType=Suspend`, `entityType="user"`, `entityId=S.id`, `actorId=A.id`, `details={"changedFields":["suspended","suspendedAt","suspendedPeriodDays"]}`
  - unsuspend (suspended=true → false): `actionType=Reactivate`, `entityType="user"`, `entityId=S.id`, `actorId=A.id`, `details={"changedFields":["suspended","suspendedAt","suspendedPeriodDays"]}`
  - block (isBlocked=false → true): `actionType=Suspend` (REQ-011 mapping: block → `Suspend`), `entityType="user"`, `entityId=S.id`, `actorId=A.id`, `details={"changedFields":["isBlocked","blockedAt"]}`
  - unblock (isBlocked=true → false): `actionType=Reactivate` (REQ-011 mapping: unblock → `Reactivate`), `entityType="user"`, `entityId=S.id`, `actorId=A.id`, `details={"changedFields":["isBlocked","blockedAt"]}`

- **ZERO writes / ZERO audit / ZERO notifications on denial paths** (JR-C-1). The journey's step 9 verifies this via byte-identical `users(S)` row snapshots before/after + `countAuditForEntity` count deltas = 0 + `countAllAuditRows` count deltas = 0.

- **Lapsed suspension → login SUCCEEDS with columns BYTE-IDENTICAL** (REQ-019 zero-write proof). Step 8 verifies this. Requires task 3.2's `assertUserActive` to consume `isSuspensionActive` (the window predicate from task 1.2) — the predicate's branch matrix (task 1.2 outcome §"Branch matrix") proves the lapsed-window returns `false` (login allowed).

- **Governed Admin G (`isBlocked=true`) → strict-guard `ForbiddenError` when G calls governance mutations**. Step 9e verifies this. Requires task 2.2's `assertActiveActorAdmin` to evaluate the actor's governance state — the existing `assertActorAdmin` (role-only) would PASS G (because G IS an admin), which would be a SECURITY BUG. Task 2.2 MUST land the strict variant.

- **Uniform deleted-target rule**: when S is soft-deleted (via DEV3-016 `setUserDeleted`), subsequent governance mutations against S answer `USER_ALREADY_DELETED` + ZERO new audit rows. Step 7c verifies this. Task 2.4's `setUserSuspended`/`setUserBlocked` MUST handle the deleted-target case via the same zero-row classifier disambiguation pattern as the EXISTING `setUserDeleted` (zero-row → `existsById` probe → `ConflictError("USER_ALREADY_DELETED")`).

- **Self-protection parity** (REQ-012): `id === actorId` for `setUserSuspended` → `ConflictError("USER_SELF_SUSPENSION_FORBIDDEN")` + `tErrors.adminUsers.userSelfSuspensionForbidden` substring + ZERO writes + ZERO audit rows (step 9b). Analogous for `setUserBlocked` → `ConflictError("USER_SELF_BLOCK_FORBIDDEN")` + `tErrors.adminUsers.userSelfBlockForbidden` substring (NOT explicitly tested in the journey but the symmetry is the contract).

- **Period-days validation matrix** (REQ-071): `periodDays` accepts `1..3650` (whole numbers); `null`/`0`/`-3`/`1.5`/`3651`/non-integer → `ValidationError("SUSPENSION_PERIOD_INVALID")` with `fields[]` naming `periodDays` (NOT explicitly tested in the journey — the journey uses `7` for suspend and `null` for unsuspend; task 2.4's service unit test owns the full validation matrix per REQ-071).

---

## Sandbox limitations

- **The journey test requires real DB (PostgreSQL per the harness rules)** — the `db` client in `backend/db/index.ts` resolves to a `pg.Pool` because `.env.test`'s `DB_PROVIDER=sqlite` is NOT a recognized provider (only `pglite` triggers the alternate path). PostgreSQL is unavailable on this sandbox (port 5432 refused). The journey's `beforeAll` hook fails at `createGovernanceCast(PREFIX)` → `db.transaction(...)` → `pg.Pool.connect()` → `ECONNREFUSED 127.0.0.1:5432`. This is the SAME pre-existing sandbox hazard documented by `0-2-reuse-substrate-outcome.md` §"Sandbox note (PostgreSQL)" + `1-3-outcome.md` §"Pre-existing sandbox hazard (NOT caused by this refactor)". The journey is still valuable as a compile-time contract for the service surface (tasks 2.2 / 2.3 / 2.4); runtime green will be verified in the post-install / postgres-available environment (CI / production).
- **No pglite skip wired** — the journey does NOT use `isPgliteProvider()` / `describeGraphqlSuite` skip pattern because the journey is a direct service call (NOT a GraphQL integration test). Journey tests are designed to run against real PostgreSQL; the sandbox's pglite/sqlite fallback is a sandbox-only concession that the journey intentionally does NOT take (per `test/workflows/AGENTS.md` rule 1: services use the global `db` and spawn their own transactions — the journey layer is the documented exception to the rollback rule and is designed for real-DB semantics only).

---

## Hazards discovered

- **`bun` binary path** — the `run-test.ts` script hardcodes `~/.bun/bin/bun` (line 6). The Phase 1.2 outcome documented the symlink fix (`~/.bun/bin/bun` → `/usr/local/bin/bun`); the symlink persists on this sandbox, so `run-test.ts` works.
- **TypeScript namespace method-absence vs. runtime** — bun's transpiler-only pipeline does NOT type-check, so the test file RUNS even though tsgo emits 14 `TS2339` errors. The runtime failure is at the DB-connect stage (not at the absent-method call sites). This is the EXPECTED state — the test would have reached the absent-method call sites if PostgreSQL were available, and the runtime would then have failed with `TypeError: AdminUserManagementService.setUserSuspended is not a function` (which is the SECOND failure mode the task spec anticipated). Both failure modes (compile-time `TS2339` AND runtime `TypeError`) are documented; both resolve once task 2.4 lands the methods.

---

## Verification Summary

| Verification | Expected | Actual | Status |
|---|---|---|---|
| Cast helper created | `test/workflows/helpers/admin-governance-cast.ts` (5-actor cast) | Created; 351 lines; 5 actors provisioned (adminA/adminB/governedAdminG/teacherT/studentS); registry shape-compatible with `journeyCleanup` + `deleteUsersByIds` | ✅ |
| Journey test created | `test/workflows/admin/account-governance.journey.test.ts` (11 steps) | Created; ~830 lines; 11 sequential `test()` calls; imports `AdminUserManagementService` + calls `setUserSuspended`/`setUserBlocked` (absent) | ✅ |
| Cast helper 2.1.QL | exit 0 (all 5 sub-loop gates) | exit 0 (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates) | ✅ |
| Journey test 2.1.QL | exit non-zero (EXPECTED RED — service surface absent) | exit 1; tsgo emits 14 TS2339 errors (12 setUserSuspended + 2 setUserBlocked) — all confined to the journey test file | ✅ (EXPECTED RED) |
| Journey test 2.1.TE | exit non-zero (EXPECTED RED — service surface absent) | exit 1; runtime fails at `beforeAll` DB-connect (`ECONNREFUSED 127.0.0.1:5432` — pre-existing sandbox hazard) | ✅ (EXPECTED RED) |
| Project-wide tsgo regression | new errors = 14 (all in journey test); zero elsewhere | 14 errors in `test/workflows/admin/account-governance.journey.test.ts`; ZERO errors elsewhere (cast helper compiles clean; rest of project unaffected) | ✅ |
| Carry-forward signatures documented | service + repo + guard signatures + journey expectations | documented in §"Carry-forward knowledge for Phase 2.2 / 2.3 / 2.4 / 3.2 subagents" | ✅ |
| Outcome file written | `2-1-outcome.md` exists, well-formed | this file | ✅ |
| Source code untouched | only `test/workflows/admin/` + `test/workflows/helpers/` files created | verified — no edits under `backend/`/`frontend/`/`app/`/`shared/` | ✅ |
| Plan files untouched | `tasks.md`/`specs.md`/`plan.md`/`deferred-items.md` not modified | verified — orchestrator owns checkbox toggle | ✅ |
| Worklog appended | to `/home/z/my-project/worklog.md` (shared root worklog) | appended | ✅ |

---

## Files Touched by This Task

| File | Operation |
|---|---|
| `test/workflows/helpers/admin-governance-cast.ts` | CREATED — five-actor governance journey cast provisioner (351 lines). Real registration flows for Teacher T + Student S; direct-insert admin rows for Admin A / B / Governed Admin G (Governed Admin G with `isBlocked=true`). Returns `{ cast, registry }` shape-compatible with `journeyCleanup(registry)` AND `deleteUsersByIds(registry.userIds)`. |
| `test/workflows/admin/account-governance.journey.test.ts` | CREATED — the journey test covering Workflow 05 §5 cross-actor lifecycle (11 sequential steps; ~830 lines). Imports `AdminUserManagementService` + calls `setUserSuspended`/`setUserBlocked` (absent at authoring time — TEST-FIRST contract for task 2.4). |
| `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/2-1-outcome.md` | CREATED — this file. |

No source files under `backend/`, `frontend/`, `app/`, `shared/` were touched. No plan files (`tasks.md`/`specs.md`/`plan.md`/`deferred-items.md`) were modified. The `tasks.md` checkbox `[ ] 2.1` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome.
