# Task 1 Outcome — Repository: Post-Completion Timeout Primitive

**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Task:** 1 (`sweepExpiredCompletedOnce`) · **Date:** 2026-09-07 · **Agent:** Task 1 repo-timeout subagent
**Requirement:** REQ-3 (AC 1, 3, 4 — timeout sweep leg; refund-ready rows; idempotence groundwork)

---

## Summary

Added `SessionRepository.sweepExpiredCompletedOnce(now, tx?)` — the post-completion timeout sweep leg — to `backend/db/repo/classes/session.repository.ts`, mirroring the existing `sweepExpiredScheduledOnce` shape exactly (ONE guarded batch UPDATE, query-builder only, `RETURNING *` full-row output, `tx ?? db` executor fallback, `tx` as last parameter):

- Predicate: `status = 'completed' AND confirmed_by_student_at IS NULL AND confirmed_by_teacher_at < cutoff`, where `cutoff = new Date(now.getTime() - SESSION_CONFIRMATION_WINDOW_MS)` (value import from `@/shared/constants/session-fees.constants` — pure sweep-time arithmetic on the recorded teacher stamp; the `confirmation_deadline` column is never re-armed, preserving the canonical B.2 ruling).
- SET: `status = cancelled` (`SessionStatus.Cancelled`), `fee_held = false`, `updated_at = now` (single captured caller instant shared by every swept row).
- Semantics preserved for the downstream same-lane refund (Task 3 composition): `held_balance_lane` is never rewritten; a NULL lane on a returned row means nothing to refund; cancelled is terminal so a re-run matches zero rows (idempotent); a student-confirmed row can never match (its escrow was consumed by earning); `disputed`/`cancelled` rows are structurally excluded by the status guard.

## Files Created / Modified

| File | Change |
|---|---|
| `backend/db/repo/classes/session.repository.ts` | +1 value import (`SESSION_CONFIRMATION_WINDOW_MS`); +1 exported method `sweepExpiredCompletedOnce` with full domain JSDoc (placed directly after `sweepExpiredScheduledOnce`). No other changes — existing methods untouched. |
| `backend/db/test/repo/classes/session.repository.test.ts` | Extended the existing session repo test file: header method list + coverage-map paragraph; 1 import; 1 new file-local helper `secondPrecisionInstant` (documents the timestamp storage resolution — see carry-forward); 6 Tier 1/2 tests + 3 Tier 3 race tests + 1 Tier 4 system-scope source pin + 1 standalone (pool-fallback) executor test; updated the stale-prone static source pins to the new honest counts (executor 9→10, exported methods 18→19, `tx?` signatures ≥18→≥19, SQL-interpolation allowlist 17→20 with `session.confirmedByTeacherAt` + `cutoff` added). |

## Files NOT Modified (and why)

- `backend/services/classes/session-lifecycle.service.ts` — the two-leg sweep composition (`sweepExpiredScheduledOnce` → `sweepExpiredCompletedOnce` → `refundSweptHolds`) is Task 3's scope. The primitive is deliberately service-agnostic: it returns the cancelled rows and lets the caller drive refunds/notifications on the same transaction.
- `backend/db/repo/classes/session.repository.helpers.ts` — the sweeper is a guarded WRITE; the helpers module hosts only the read machinery. No shared-predicate extraction was warranted for a single 3-condition batch predicate (extraction would be premature abstraction; jscpd intra-file scan passed).
- `backend/db/repo/index.ts` / `backend/db/repo/classes/index.ts` — no barrel change needed: the namespace `SessionRepository` is already re-exported; adding a method inside the namespace requires no registration.
- `docs/sessions/session-lifecycle.md` — Task 5 scope.
- Everything else in `git status` belonging to Task 2 (notification service/types/locale files, modified by the parallel Task 2 subagent) — left strictly untouched.

## Verification Results

### 1.1.QL — Per-file quality loop (`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`)

| File | Result |
|---|---|
| `backend/db/repo/classes/session.repository.ts` | **exit 0** — tsgo ✅ · oxlint ✅ · biome:check ✅ · lint:type-aware ✅ · check:duplicates (intra-file jscpd) ✅ |
| `backend/db/test/repo/classes/session.repository.test.ts` | **exit 0** (after fixing 4 TS2339 union-narrowing errors from the first run and re-running) — tsgo ✅ · oxlint ✅ · biome:check ✅ · lint:type-aware ✅ · check:duplicates ✅ (file outside jscpd scan scope, reported pass) |

No process-lock/port contention was hit (retry budget unused; parallel Task 2 loops shared the lock queue cleanly).

### 1.1.TE — Test run (`bun run test/scripts/run-test.ts backend/db/test/repo/classes/session.repository.test.ts`)

**exit 0 — 62 pass / 0 fail / 388 expect() calls** (was 49 tests before this task; +13 new). New coverage per tier:

- **Tier 1 (branch/statement):** hit branch — overdue unconfirmed completed row is cancelled with `fee_held=false`, `updated_at == now`, full 21-column select shape returned, provenance lane (`hifz`) and stamps/end-span preserved, deadline untouched; read-back oracle confirms persisted state.
- **Tier 2 (boundary/edge):** cutoff boundary — a teacher stamp exactly at the cutoff is NEVER swept (strict `<`), one second older is swept (second = the storage resolution timestamps round-trip at; see carry-forward); mixed teacher-stamp ages (overdue swept, fresh untouched); lane-less rows (`heldBalanceLane=null`, both held and already-released shapes) swept and returned with a NULL lane — nothing to refund downstream; student-confirmed row never matched (stamps + `fee_held=false` preserved); `disputed`/`cancelled` rows never matched even when fabricated with every stamp condition of the predicate — the status guard alone excludes them, and non-matching rows keep their hold marker untouched.
- **Tier 3 (chaos/concurrency):** double sweep under `Promise.allSettled` — first run reports the row, re-run matches exactly zero rows (double-refund structurally impossible); confirm-vs-sweep race in BOTH enqueue orders — the escrow unit is consumed OR released, never both (confirm-first → row completed with student stamp, sweep zero rows; sweep-first → row cancelled with hold released for the caller's refund, confirm matches zero).
- **Tier 4 (security/abuse/static):** new source pin — the sweeper signature carries ONLY `now: Date` + `tx?: DBTransaction` (no id/participant parameter exists through which caller scope could reach the batch predicate), the cutoff derives from the captured instant minus the platform constant (never request data), and no `like(`/`ilike(`/`%` wildcard matching exists anywhere in the repository; the pre-existing interpolation-allowlist pin was extended (now 20 interpolations, every one a schema-object reference or a locally bound scalar) proving no caller-supplied value reaches any SQL fragment; the pool-fallback executor branch (`tx ?? db`) is covered by a committed-fixture standalone test with honest `toContain`/`not.toContain` assertions (rule 12) and `afterAll` hard-delete cleanup (rule 9).

`expectRepoError` was not exercised by the new cases: the sweeper performs no constraint-probing write (no new throw path exists — its only failure mode is a driver error, which the existing rollback wrapper surfaces). The pattern remains in use by the file's INV-S4 probes, which still pass.

**Zero-rows coverage note:** the empty-match contract is asserted three ways — the double-sweep re-run (`secondSweep` `toHaveLength(0)`), the single-row never-matched cases (student-confirmed / disputed / cancelled fixtures leave `sweptIds` empty of the fixture while the row reads back untouched), and the pool-fallback test's `not.toContain` for the fresh (in-window) fixture.

### Re-verification (execution session — post branch-revert quirk)

The full verification pipeline was re-executed end-to-end in the final execution session, with identical results (sandbox reverts HEAD to `main` between external invocations; the feature branch and working tree were re-established before every batch):

- `bun run scripts/health/sub-loop.ts backend/db/repo/classes/session.repository.ts --lifecycle duplicates` → **exit 0** (tsgo · oxlint · biome:check · lint:type-aware · check:duplicates all green).
- `bun run scripts/health/sub-loop.ts backend/db/test/repo/classes/session.repository.test.ts --lifecycle duplicates` → **exit 0** (jscpd skipped — file outside scan scope).
- `bun run test/scripts/run-test.ts backend/db/test/repo/classes/session.repository.test.ts` → **62 pass / 0 fail / 388 expect() calls**, exit 0, env `.env.test` → PGlite at `./db/pglite-test` (isolated dir confirmed in run log). All ten sweeper-specific tests confirmed `(pass)` in the captured log: Tier 1 provenance, cutoff boundary, mixed stamp ages, lane-less, student-confirmed-never-matched, disputed/cancelled-never-matched, double sweep, both confirm-vs-sweep race orders, pool fallback.
- Parallel Task 2 sub-loop activity shared the process lock cleanly (queue positions observed, no lock/port failure; retry budget unused).

### 1.1.SEC — Security audit

- **System-scope predicate:** the sweep accepts no caller identity/id/shape at all — signature `(now: Date, tx?)`. Nothing user-controlled can reach the WHERE clause; the only interpolations are `session.confirmedByStudentAt`, `session.confirmedByTeacherAt` (schema objects) and `cutoff` (locally derived scalar, bound as a parameter) — all pinned by the file's interpolation-allowlist test.
- **No wildcard/LIKE** anywhere in the repository source (pinned: `like(`, `ilike(`, `%` all absent). No `sql.raw`, no `inArray`, no prepared statements (pre-existing pins still green).
- **No oracle/info leak:** the batch result exposes only rows the system legitimately owns; no probe/classification read was added.

### 1.1.SR — Semantic review checklist verdicts (all items)

**Race Conditions & Concurrency**
- ✅ No read-then-write without atomicity — the full predicate and the mutation share ONE statement (row-lock atomic; zero check-then-write window). Race behavior proven by the Tier 3 tests.
- ✅ No module-level mutable state — only `const` locals inside the function (file's comment-stripped `let`-scan pin still passes).
- ✅ N/A credit/balance deductions — no wallet/lane writes here; the hold-marker flip is predicate-fused, the refund stays the caller's same-transaction follow-up.
- ✅ N/A Redis operations — none.

**Environment & Configuration**
- ✅ N/A `resolveEnvConfig` — none used. ✅ N/A cache invalidation. ✅ N/A credential setters.

**Code Quality & Clean Comments**
- ✅ No dead branches — a single statement, no conditionals/throws; every returned row is reachable by construction.
- ✅ No cross-layer imports — backend → `shared/constants` is an allowed direction (shared imports nothing from backend/frontend; the constants module declares itself safe for any layer).
- ✅ No manual ReturnType construction — returns `SessionSelectType[]` straight from `.returning()`.
- ✅ Clean comments/JSDoc — zero plan-artifact references (no REQ-/Task/DEV3-/plan paths; verified by grep AND the file's own "comments describe domain behavior only" pin). JSDoc describes what/why: window semantics, refund provenance, idempotence, NULL-lane meaning.

**Schema & Types**
- ✅ No schema/migration change; every column referenced (`status`, `fee_held`, `updated_at`, `confirmed_by_student_at`, `confirmed_by_teacher_at`) exists in the Drizzle schema and the migrations.
- ✅ Enums as VALUE imports — `SessionStatus` was already a value import; no string literals added (the file's closed-vocabulary regex pin passes; `SessionStatus.Cancelled/Completed` members only).
- ✅ DB column names match `$inferSelect` — property names used (`feeHeld`, `updatedAt`, `confirmedByStudentAt`, `confirmedByTeacherAt`, `heldBalanceLane`) are the `$inferSelect` names via `SessionSelectType`.
- ✅ N/A Pothos input nullability — no Pothos touched.

**Deferred Work**
- ✅ No new deferred items — nothing out-of-scope was discovered (second-precision timestamps are an environment fact recorded as carry-forward knowledge, not unfinished work). `deferred-items.md` requires no new row.

**Scope Boundary**
- ✅ Only the two in-scope files modified by this task (`git diff --name-only` cross-checked; the other modified files in the tree belong to the parallel Task 2 subagent and were not touched here).
- ✅ No out-of-scope refactoring (the tempting "add tests for `sweepExpiredScheduledOnce` while I'm here" was explicitly NOT done — not this task's scope).
- ✅ Single guarded statement; `cancelled` is terminal; no probe read added (batch sweep needs no classification — zero-row re-run is the idempotence contract); `tx` propagation as LAST parameter; enums as value imports — all verified.

### 1.1.IV — Instruction verification (rule files read + validated)

Rule files printed by sub-loop: root `AGENTS.md` ✅, `backend/AGENTS.md` ✅, `backend/db/repo/AGENTS.md` ✅ (repo run) / `backend/db/test/AGENTS.md` ✅ (test run), instruction files `backend.instructions.md` + `tests.instructions.md` ✅. Note: sub-loop prints the instruction paths as `.github/instructions/…`, which do not exist in this tree — the live files are the same-named `.agents/instructions/backend.instructions.md` / `tests.instructions.md`, both read in full. Validation highlights:

- Repo layer rules (one namespace per file; `tx?: DBTransaction` LAST param everywhere; writes on `tx ?? db`; no business logic/permissions/i18n/logging in the repo; guarded-UPDATE pattern per `backend/db/repo/AGENTS.md`) — satisfied; no `console.*`, no error strings, no prepared statements, `SessionStatus` vocabulary only.
- Test rules (`runInRollback` + `tx` to every repo call; no `expect(...).rejects.toThrow()`; entity-setup helpers only, never seed data; second-precision timestamp convention already used by the file; honest pre-existing-data handling; static source pins updated in the SAME change per tests.instructions.md "stale pin" rule; run-test script used instead of raw `bun test`) — satisfied.
- Backend instructions (6-layer data flow; repo = data-access only; types from `@/backend/types`) — satisfied.

## Carry-Forward Knowledge (for Tasks 3–6)

1. **Timestamp storage resolution is SECOND-granular in this environment** (`db/pglite` + driver round-trip truncates sub-second digits, write side). The existing test file already floor-ed deadlines to seconds; my new `secondPrecisionInstant` helper makes the convention explicit. Sweep/window fixtures in Tasks 3 and 4 MUST build stamps and sweep instants through second precision or `.getTime()` equality assertions will flake.
2. **The sweeper is deliberately refund-agnostic**: it returns rows with their recorded lanes; Task 3 must feed the completed-leg rows through `refundHeldLaneToProvenance`/`refundSweptHolds` on the SAME transaction and treat `heldBalanceLane === null` rows as "nothing to refund". Counts: `cancelled = scheduledLeg.length + completedLeg.length`.
3. **Batch-sweep blast radius**: the predicate is global (no id scoping). In tests, run it inside `runInRollback` (committed-fixture standalone test included) — any OTHER committed completed+unconfirmed+overdue row would be swept by a standalone run. Seed data contains no session rows, and parallel test files only commit scheduled/dispute-shape rows, so this is currently safe — but Task 4 journey fixtures must not leave eligible committed rows behind mid-suite.
4. **Static source pins in `session.repository.test.ts` are load-bearing**: executor count (10), exported-method count (19), `tx?`-signature floor (19), and the SQL-interpolation allowlist (20 entries incl. `session.confirmedByTeacherAt` + `cutoff`). Task 3's service edits do NOT touch these, but any future repo-file edit must update them in the same change.
5. **Sub-loop prints `.github/instructions/…` paths that do not exist in this tree**; the live instruction files are `.agents/instructions/*.instructions.md`. Read those.
6. **Environment (unchanged from Task 0, re-confirmed)**: the sandbox checks out `main` between tool invocations; untracked files and modifications to files whose content is identical across branches survive. Every Bash batch here re-checked-out `feat/dev3-012-dual-confirmation-completion-handshake` first. Tasks 2–6 must keep doing the same.

## Cross-File Dependencies

- `shared/constants/session-fees.constants.ts` (`SESSION_CONFIRMATION_WINDOW_MS = 86_400_000`) — consumed by the new primitive; the value must stay in sync with the booking-side deadline arithmetic (`session-lifecycle.booking.ts:142`).
- Task 3 will compose this primitive inside `SessionLifecycleService.sweepExpiredSessions` and must keep the notification emission post-commit (receipts), per plan decision D-DEV3-012-4.
- Task 4 journey tests will fabricate the same row shape my tests use (`completed` + old `confirmed_by_teacher_at` + null student stamp) — reuse `insertSessionRow`-style fixtures and the second-precision helper convention.

## Status

- [x] 1. `sweepExpiredCompletedOnce` implemented (sub-loop exit 0, tests 62/62 green)
- [x] 1.1.QL · [x] 1.1.TE · [x] 1.1.SEC · [x] 1.1.SR · [x] 1.1.IV
- No git commit / no git push (orchestrator commits).
