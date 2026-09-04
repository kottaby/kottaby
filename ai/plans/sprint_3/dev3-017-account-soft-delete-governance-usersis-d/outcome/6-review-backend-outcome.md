# Phase 6.2 — review-backend Wave Outcome

**Task ID:** 6.2 | **Date:** 2026-09-04

## Changeset reviewed

Backend files in the DEV3-017 changeset (modified + untracked):

- `backend/types/admin/admin-user.types.ts` — `GovernanceProbeRowType` (5 readonly nullable columns, no null-coalesce)
- `backend/lib/auth/suspension-window.ts` — pure predicate, fail-closed (no `suspendedAt` OR non-positive `suspendedPeriodDays` → active)
- `backend/lib/auth/suspension-window.test.ts` — predicate + cross-module import surface assertions
- `backend/lib/auth/server-auth.ts` — SSR boundary consumes `isSuspensionActive`
- `backend/services/admin/admin-guards.helpers.ts` — relaxed `assertActorAdmin` re-export + strict `assertActiveActorAdmin` (deterministic order)
- `backend/services/admin/admin-guards.helpers.test.ts` — 4-tier coverage incl. Tier-2 precedence proofs
- `backend/services/admin/user-management.service.ts` — `setUserSuspended` + `setUserBlocked`
- `backend/services/admin/user-governance.service.test.ts` — service-tier coverage (incl. JR-C-1 count-probes + happy-path silence scan)
- `backend/services/admin/user-governance.chaos.test.ts` — concurrent suspend×2 / block×2 / opposing-race
- `backend/db/repo/admin/admin-user.repository.ts` — `setSuspendedOnce` + `setBlockedOnce` + `findGovernanceState`
- `backend/db/test/logic/admin/admin-user-governance.repository.test.ts`
- `backend/services/auth/auth.service.ts` — `assertUserActive` widened to consume predicate
- `backend/services/students/student-handshake.helpers.ts` — `isGovernanceExcludedFromDiscovery` refactored
- `backend/graphql/mutation/admin/admin-governance.mutation.ts` — thin resolvers (BFLA `$all` conjunction)
- `backend/graphql/mutation/admin/index.ts` — side-effect barrel wiring
- `backend/graphql/test/admin-governance.matrix.test.ts` — wire-tier matrix
- `backend/graphql/test/schema-surface.test.ts` + `backend/graphql/test/sdl-static-assertions.test.ts` — reconciled SDL pinning
- `backend/graphql/test/inv-u4-grep-lock.test.ts` — Phase 5.2 whitelist-discipline invariant

## Findings

### ZERO findings ✅

All eight review dimensions pass without exception. Per-dimension evidence below.

---

#### 1. Atomicity — PASS

- `setUserSuspended` (`user-management.service.ts:521`) wraps its entire write pipeline in a single `withTransaction(outerTx, async tx => …)` boundary.
- `setUserBlocked` (`user-management.service.ts:606`) same single-boundary shape.
- Pre-transaction actor gate (`assertActiveActorAdmin`) runs BEFORE the boundary opens (lines 500 / 598) — JR-C-1 production path keeps the actor check outside any open tx.
- `auth.service.ts:137-145` ships its own `withTransaction` helper with SAVEPOINT semantics on the test path; no fork.

#### 2. tx propagation — PASS

Every inner call inside `setUserSuspended` / `setUserBlocked` propagates `tx`:

| Method          | Call                                                                                              | Line |
|-----------------|---------------------------------------------------------------------------------------------------|-----:|
| setUserSuspended | `AdminUserRepository.setSuspendedOnce(id, suspended, suspended ? periodDays : null, tx)`         |  532 |
| setUserSuspended | `AdminUserRepository.findGovernanceState(id, tx)`                                                 |  535 |
| setUserSuspended | `AuditService.createAuditLog(buildAuditContract(…), tx)`                                          |  570 |
| setUserSuspended | `getUserDetail(id, locale, actorId, tx)`                                                          |  572 |
| setUserBlocked   | `AdminUserRepository.setBlockedOnce(id, blocked, tx)`                                              |  617 |
| setUserBlocked   | `AdminUserRepository.findGovernanceState(id, tx)`                                                 |  620 |
| setUserBlocked   | `AuditService.createAuditLog(buildAuditContract(…), tx)`                                          |  654 |
| setUserBlocked   | `getUserDetail(id, locale, actorId, tx)`                                                          |  656 |

Repo signatures take `tx: DBTransaction` (REQUIRED, not optional) on `setSuspendedOnce` / `setBlockedOnce` — the compiler refuses an out-of-tx call.

#### 3. Guarded-statement / no-TOCTOU — PASS

- `setSuspendedOnce` (`admin-user.repository.ts:456-479`): single `UPDATE users SET suspended=…, suspended_at=…, suspended_period_days=…, updated_at=… WHERE (id = $1) AND (is_deleted = false OR is_deleted IS NULL) AND (suspended = false OR suspended IS NULL [target=true] / suspended = true [target=false]) RETURNING SAFE_USER_SELECT`. NO SELECT-then-UPDATE.
- `setBlockedOnce` (`admin-user.repository.ts:512-533`): identical single-statement shape on the `is_blocked` / `blocked_at` columns.
- `findGovernanceState` (`admin-user.repository.ts:563-588`): 5-column read probe (`isDeleted`, `suspended`, `suspendedAt`, `suspendedPeriodDays`, `isBlocked`) — never `passwordHash`, never `*`, never any PII column. Drizzle path uses an explicit column pick; raw-SQL path uses an explicit column list. Called ONLY after a zero-row guarded update — never races the write because the write already holds the row lock inside the same tx.
- NULL-safe inverse-state guards preserve three-valued SQL semantics; legacy NULL rows read correctly as "not in target state".
- Chaos test (`user-governance.chaos.test.ts`) proves serialisation under `suspend×2`, `block×2`, and opposing-race matrices.

#### 4. Classifier honest disambiguation — PASS

Both service methods branch on `updated === null` and dispatch to the probe with full coverage:

| Branch in classifier                          | Code                    | Error                                                  |
|-----------------------------------------------|-------------------------|--------------------------------------------------------|
| `governanceState === null`                    | `USER_NOT_FOUND`        | `NotFoundError(USER_ENTITY, userNotFound)`            |
| `governanceState.isDeleted === true`          | `USER_ALREADY_DELETED`  | `ConflictError(USER_ALREADY_DELETED, userAlreadyDeleted)` |
| Axis already in requested state (suspend)     | `USER_ALREADY_SUSPENDED` / `USER_NOT_SUSPENDED` | `ConflictError(code, message)` |
| Axis already in requested state (block)       | `USER_ALREADY_BLOCKED`  / `USER_NOT_BLOCKED`   | `ConflictError(code, message)` |

The classifier never silently absorbs a zero-row outcome — every branch produces a typed `DomainError` carrying a stable machine code + localized message. No TOCTOU window because the probe shares the write's tx snapshot.

#### 5. DomainError taxonomy + localized keys — PASS

- **ForbiddenError** — `accountDeleted`, `accountBlocked`, `accountSuspended`, `forbidden` (existing flat keys at `shared/locale/en/errors/index.ts:17-21`; typed at `shared/locale/types/errors/index.ts:37-45`). Used by `assertActiveActorAdmin` + login/refresh `assertUserActive`.
- **ConflictError** — `USER_SELF_SUSPENSION_FORBIDDEN`, `USER_SELF_BLOCK_FORBIDDEN`, `USER_ALREADY_DELETED`, `USER_ALREADY_SUSPENDED`, `USER_NOT_SUSPENDED`, `USER_ALREADY_BLOCKED`, `USER_NOT_BLOCKED` (messages via `tErrors.adminUsers.*` — the 7 new keys from task 1.4: typed at `shared/locale/types/errors/index.ts:88-105`; EN at `shared/locale/en/errors/index.ts:45-51`; AR parity verified by sibling 1.4 outcome).
- **NotFoundError** — `USER_ENTITY` → `USER_NOT_FOUND` (`tErrors.adminUsers.userNotFound`).
- **ValidationError** — `tErrors.validation` (positive-safe-int guard) + `SUSPENSION_PERIOD_INVALID` (`tErrors.adminUsers.suspensionPeriodInvalid`) carrying `fields[]` naming `periodDays`.
- All localized keys are property-accessed on typed bundles — no raw key strings, no `errors[code]` indexing.

#### 6. ONE domain log per denial / silent happy path — PASS

`setUserSuspended` denials (exactly one `logger.logDomainError` per branch):

- Line 523 — `USER_SELF_SUSPENSION_FORBIDDEN` (self-protection)
- Line 537 — `USER_NOT_FOUND` (zero-row probe)
- Line 546 — `USER_ALREADY_DELETED` (deleted-target guard)
- Line 556 — `USER_ALREADY_SUSPENDED` / `USER_NOT_SUSPENDED` (axis-state conflict)

`setUserBlocked` denials (exactly one per branch):

- Line 608 — `USER_SELF_BLOCK_FORBIDDEN`
- Line 622 — `USER_NOT_FOUND`
- Line 631 — `USER_ALREADY_DELETED`
- Line 641 — `USER_ALREADY_BLOCKED` / `USER_NOT_BLOCKED`

`assertActiveActorAdmin` denials (exactly one per branch):

- Line 76 — anonymous caller (`UNAUTHORIZED`)
- Line 86 — actor row missing (`FORBIDDEN`)
- Line 96 — non-admin role (`FORBIDDEN`)
- Line 111 — `accountDeleted`
- Line 120 — `accountBlocked`
- Line 138 — `accountSuspended`

Happy path: ZERO `logger.logDomainError` calls in either `setUserSuspended` or `setUserBlocked`. Verified structurally by `user-governance.service.test.ts:1082` (`happy-path silence — no logger.logDomainError on the success path`) which scans service code only and asserts no log call sits after the `await AuditService.createAuditLog(…)` happy-path line. REQ-053 satisfied.

#### 7. Strict actor guard determinism — PASS

`assertActiveActorAdmin` (`admin-guards.helpers.ts:72-145`) evaluates in canonical precedence order:

1. `actorId === ANONYMOUS_ACTOR_ID` (line 75) → `UnauthorizedError`
2. `UserRepository.findById(actorId) === null` (line 85) → `ForbiddenError(forbidden)`
3. `role !== UserRole.Admin` (line 95) → `ForbiddenError(forbidden)`
4. `actor.isDeleted === true` (line 110) → `ForbiddenError(accountDeleted)`
5. `actor.isBlocked === true` (line 119) → `ForbiddenError(accountBlocked)`
6. `isSuspensionActive({...actor}, new Date())` (line 128) → `ForbiddenError(accountSuspended)`

Tier-2 precedence proofs in `admin-guards.helpers.test.ts` lock the order: `deleted+blocked → accountDeleted`; `deleted+suspended → accountDeleted`; `blocked+suspended → accountBlocked`; `deleted+blocked+suspended → accountDeleted`. A future refactor that flips the order would flip those assertions. Lapsed suspension passes (window honesty — REQ-019 zero-write proof).

#### 8. Predicate fail-closed parity across BOTH auth boundaries + handshake consumption — PASS

All four consumers import `isSuspensionActive` from the single source of truth at `@/backend/lib/auth/suspension-window`:

| Consumer                                                                    | File:Line                | Boundary |
|-----------------------------------------------------------------------------|--------------------------|----------|
| `AuthService.assertUserActive` (login + refresh)                            | `auth.service.ts:114`    | auth     |
| `getServerUserContext` (SSR cookie verify)                                 | `server-auth.ts:103`     | SSR      |
| `isGovernanceExcludedFromDiscovery` (parent-side handshake discovery)       | `student-handshake.helpers.ts:44` | handshake |
| `assertActiveActorAdmin` (admin governance mutations)                      | `admin-guards.helpers.ts:129` | admin gate |

The predicate (`suspension-window.ts:46-56`) is fail-closed: `suspended === false/null` → `false`; `suspendedAt === null` OR `suspendedPeriodDays === null` OR `<= 0` → `true` (corrupt window never widens access). Strict-`>` boundary semantics: a window ending exactly at `now` is lapsed (returns `false`). Cross-module import surface assertions in `suspension-window.test.ts:111-119` lock the four import sites.

#### 9. JR-C-1 zero-audit-on-denial — PASS

- `assertActiveActorAdmin` performs ZERO writes / ZERO audit rows — every denial throws BEFORE any transaction opens in production (the actor check runs against the global pool when `outerTx` is undefined).
- `setUserSuspended` denial branches (lines 522-562) emit ZERO `AuditService.createAuditLog` calls. The single `createAuditLog` call (line 570) sits AFTER the `if (updated === null)` block on the HAPPY PATH only.
- `setUserBlocked` denial branches (lines 607-647) emit ZERO `createAuditLog` calls. The single `createAuditLog` call (line 654) is happy-path only.
- Verified structurally by `user-governance.service.test.ts:901` (`denial count-probes — every denial class emits ZERO writes, ZERO audit_logs, ZERO notifications (JR-C-1)`) and the structural scan at line 1056 (`AuditService.createAuditLog(…, tx)` always inside the tx — never out-of-band).

## Verdict

**PASS** ✅

All eight backend review dimensions hold without exception. No CRITICAL / HIGH / MEDIUM / LOW findings to resolve.

## Carry-forward for orchestrator

1. **Predicate parity is verified at 4 sites** — Phase 6.4 pentester wave should confirm via its own grep that no FIFTH consumer has forked the predicate (e.g. inline `suspendedAt + periodDays * MS_PER_DAY` reimplementation). The 4-site parity test in `suspension-window.test.ts` is the canonical gate.
2. **JR-C-1 is structurally asserted** — `user-governance.service.test.ts:901` count-probes; happy-path silence scan at line 1082; tx-propagation regex at line 1056. Phase 6.4 should re-confirm via its own denial-envelope consistency sweep.
3. **Classifier honest disambiguation** — `findGovernanceState` returns the 5-column probe on the cold path (`queryDb`) when no `tx` supplied. Production always passes a `tx` (Drizzle path) — the cold path is a defensive fallback only. Phase 6.4 may wish to add a non-functional assertion that the cold path is unreachable from production callers.
4. **Strict actor guard order is test-locked** — Tier-2 precedence proofs in `admin-guards.helpers.test.ts`. Any future refactor flipping the order will trip these tests.
5. **DomainError taxonomy keys (the 7 new ones from task 1.4)** are typed at `shared/locale/types/errors/index.ts:88-105`. EN/AR parity verified by sibling 1.4 outcome — no re-litigation needed in Phase 7.
6. **Wire-tier matrix** in `admin-governance.matrix.test.ts` and **schema pinning** in both `schema-surface.test.ts` and `sdl-static-assertions.test.ts` lock the BFLA `$all` conjunction, scalar-args discipline, and exact SDL signatures — Phase 6.4 BFLA/BOPLA reviews can rely on these as established invariants.
