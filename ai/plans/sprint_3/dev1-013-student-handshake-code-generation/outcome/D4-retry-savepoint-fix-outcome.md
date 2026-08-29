# D4 Fix Outcome — Handshake Retry Savepoint (Retry Absorption Defect on the DEV1-002 Surface)

**Ticket:** DEV1-013 blocked-production-defect ledger item **D4** (routed by the orchestrator for fix — this is the fix dispatch, not an in-ticket DEV1-013 edit)
**Plan directory:** `ai/plans/sprint_3/dev1-013-student-handshake-code-generation/`
**Fix date:** 2026-08-29
**Detection source:** Task 2.1 lock suite (`outcome/2.1-generation-lock-tests-outcome.md` §5) — absorption lock RED with SQLSTATE `25P02`

**VERDICT: ✅ FIXED — 8/8 lock tests GREEN with ZERO test changes (the absorption lock, the permanent regression lock, went green unmodified). All sibling suites stay green.**

---

## 1. Root cause (confirmed empirically)

`createStudentWithHandshakeRetry` (`backend/services/auth/registration.service.ts:347-387`) retried a handshake-code collision by re-inserting **on the same live transaction with no per-attempt savepoint**. PostgreSQL aborts a transaction on a failed `INSERT` (no implicit per-statement savepoint exists), so after attempt 1's `23505` on `students_handshake_code_unique`:

1. Attempt 2's insert fails with SQLSTATE **`25P02`** ("current transaction is aborted, commands ignored until end of transaction block").
2. `isUniqueViolation` (:103-118) classifies `25P02` as NON-collision and rethrows (:370-374).
3. `translateDbError` passes it through untranslated (:181-185) → **the entire student registration fails with a raw `DrizzleQueryError`** on a single collision.

This falsified `docs/auth/user-registration.md` §2.2 ("retries inside the same transaction"), `specs.md` REQ-041, and `plan.md` §4.3 row 1. Baseline re-confirmed before the fix: locks suite **7 pass / 1 fail** — the absorption lock (`handshake-code-generation-locks.test.ts:434-469`) failed at `:464` with `25P02` (`routine: "exec_parse_message"`), exactly as recorded by Task 2.1.

## 2. Fix mechanism — per-attempt savepoint via the typed Drizzle nested-transaction API

Each `StudentRepository.createForRegistration(userId, handshakeCode, tx)` attempt now runs its insert inside **its own SAVEPOINT**, created with Drizzle's nested-transaction API — `tx.transaction(async sp => …)` — which on the node-postgres driver issues `SAVEPOINT spN` / `RELEASE SAVEPOINT spN` (success) / `ROLLBACK TO SAVEPOINT spN` (failure) automatically (verified in `node_modules/drizzle-orm/node-postgres/session.js`, `NodePgTransaction.transaction()`). This is the exact mechanism the passing diagnostic sibling test proved at the raw-SQL level — mirrored through the typed API, so no `sql`` templates are used anywhere.

**Placement decision (empirically forced, documented for reviewers):** the bracket lives **inside `StudentRepository.createForRegistration`** — not as a wrapper in the service retry loop. Reason: the absorption lock (the permanent regression lock, unmodifiable by mandate) drives `StudentRepository.createForRegistration(registrant.id, code, tx)` **directly on the live transaction** — the byte-faithful model of the production attempt — and never invokes service code. Proof by experiment:

- **Service-level bracket only** (each attempt wrapped in `tx.transaction()` inside `createStudentWithHandshakeRetry`, applied and reverted): locks suite stayed **7 pass / 1 fail** — the absorption lock remained RED, because the unbracketed direct insert in the test still poisons the transaction. The service file was restored to byte-original (`git diff` empty).
- **Repository-level bracket** (the shipped fix): locks suite **8 pass / 0 fail** — the absorption lock goes green with ZERO test changes, and the production retry loop inherits the recoverability automatically (its attempts are exactly `createForRegistration` calls).

The repo-level bracket is transactional data-access mechanics (not business logic — no service-layer rule violated), uses the typed nested-transaction API (no `sql`` template; repo rules only forbid raw SQL templates for reads), and preserves the "retries inside the same transaction" contract: savepoints ARE inside the same transaction.

**Contract preservation (all verified):**
- `HANDSHAKE_RETRY_LIMIT` (5) unchanged — the service is byte-identical.
- `HANDSHAKE_COLLISION` per-attempt logging + `HANDSHAKE_EXHAUSTED` on exhaustion unchanged.
- `ConflictError("Handshake code generation failed after retries")` on exhaustion unchanged.
- Non-collision errors still surface immediately (the nested transaction rethrows the original error after `ROLLBACK TO SAVEPOINT`; `isUniqueViolation`'s cause-chain traversal sees the same `23505`).
- 23505 on OTHER columns (e.g. `users.email` from `UserRepository.create`, outside this retry function) unaffected — that insert is not bracketed; the service-level savepoint from `withTransaction` still rescues it into `ConflictError` (DEV1-002 race test 18/18 green).
- Atomicity unchanged: on success the savepoint is `RELEASE`d (transparent); on retry exhaustion / non-collision surfacing, the enclosing registration transaction still rolls back everything.
- Zero doc changes (§2.2 "retries inside the same transaction" remains true).

## 3. Diff summary

| File | Change | Lines |
|---|---|---|
| `backend/db/repo/students/student.repository.ts` | `createForRegistration`: insert wrapped in `tx.transaction(async sp => …)` per-attempt savepoint + expanded doc comment (domain-terms rationale; no plan-artifact references) | +28 / −15 |
| `backend/services/auth/registration.service.ts` | **NONE** — byte-original (service-level experiment applied + reverted; `git diff` empty) | 0 |
| `backend/db/test/logic/students/handshake-code-generation-locks.test.ts` | **NONE** — zero test changes (permanent regression lock untouched) | 0 |
| `ai/plans/sprint_3/dev1-013-student-handshake-code-generation/deferred-items.md` | D4 ledger row: Status ❌ Blocked → ✅ Done; Verified By updated; resolution note appended | +1 line (row edit) |
| `ai/plans/sprint_3/…/outcome/D4-retry-savepoint-fix-outcome.md` | This outcome file | NEW |
| `worklog.md` | D4-fix entry appended | NEW |

## 4. Verification evidence (commands, exit codes, pass counts)

| Gate | Command | Result |
|---|---|---|
| Locks suite (THE gate) | `bun run test/scripts/run-test.ts backend/db/test/logic/students/handshake-code-generation-locks.test.ts` | **exit 0 — 8 pass / 0 fail / 547 expect()** (baseline before fix: exit 1 — 7/1/544; absorption lock RED with 25P02 at :464; with fix: absorption lock GREEN, +3 expect() = the previously-skipped assertions at :464-467 now execute and pass) |
| DEV1-002 registration suite (untouched file; actual path — the stale `backend/services/auth/…` path does not exist) | `bun run test/scripts/run-test.ts backend/db/test/logic/auth/registration.service.test.ts` | **exit 0 — 18 pass / 0 fail / 80 expect()** |
| Journey smoke | `bun run test/scripts/run-test.ts test/workflows/helpers/journey-fixtures.smoke.test.ts` | **exit 0 — 6 pass / 0 fail / 20 expect()** |
| Immutability scan (write-statement scan — must not trip on the savepoint wrap) | `bun run test/scripts/run-test.ts backend/db/test/logic/students/handshake-code-immutability-scan.test.ts` | **exit 0 — 14 pass / 0 fail / 19 expect()** |
| Bonus: repo suite covering `createForRegistration` directly | `bun run test/scripts/run-test.ts backend/db/test/repo/students/student.repository.test.ts` | **exit 0 — 10 pass / 0 fail / 43 expect()** |
| Quality loop — CHANGED file | `bun run scripts/health/sub-loop.ts backend/db/repo/students/student.repository.ts --lifecycle duplicates` | **exit 0** (biome:check ✅, lint:type-aware ✅, check:duplicates ✅) |
| Quality loop — instructed service file (unchanged) | `bun run scripts/health/sub-loop.ts backend/services/auth/registration.service.ts --lifecycle duplicates` | **exit 0** (same three sub-checks ✅) |
| Biome direct | `bunx biome check backend/db/repo/students/student.repository.ts` | **exit 0** — no fixes applied |
| Type safety | `bun tsgo` (project-wide) | exit 1 with the ONE known intentional error only: `test/workflows/parents/handshake-discovery.test.ts(43,41): TS2307` (Task 2.2's expected RED — missing `student-handshake.service`). **Zero errors from the changed file.** |
| DB residue probe (psql on `app_db`, pre-existing env-override target) | fixture users `hs-lock-%`/`hs-rollback-%`/`test-%`/`reg-%`/`race-%` = **0**; `students.handshake_code LIKE 'KSB-C0FFEE%'` = **0**; total students = 1 (pre-existing seed, untouched) | ✅ rollback/tracked-teardown clean |
| Git discipline | ZERO git state commands (no checkout/switch/stash/restore/branch/commit/add); read-only `git status`/`git diff`/`git log` only | ✅ |

## 5. Semantic review of the fix

- **No monkey-patching, no mocks** — the fix is production code only; every test above runs against the real DB and real service/repo.
- **No `console.*`**, no `sql`` template, no `any`, no lint-disables, no dead branches, no plan-artifact references in code comments (the savepoint rationale is stated in domain terms).
- **Sequential-savepoint safety**: drizzle derives sibling savepoint names from the parent's `nestedIndex` (`spN`), so siblings reuse names; the retry loop is strictly sequential (each attempt settles before the next), and re-establishing a same-named savepoint after `ROLLBACK TO SAVEPOINT` is well-defined PostgreSQL behavior — no collision risk (the known collision hazard is CONCURRENT siblings, which the retry loop never creates; that hazard is documented in DEV1-002's own race-test harness note).
- **Coverage note**: the nested callback keeps the pre-existing defensive `.returning()` empty-row guard; branch coverage of the repo file is unaffected in kind (same branches, new nesting).

## 6. Residual risks

- **+2 round trips per student registration** (`SAVEPOINT` + `RELEASE` on the registration transaction) — negligible for a registration-rate write path; buys correctness under real collisions.
- **Behavioral widening (intended)**: a failed `createForRegistration` insert no longer poisons the caller's transaction (the error still rethrows unchanged). All current callers want exactly this; future callers that deliberately rely on transaction poisoning after this specific insert would need to propagate the error (which they naturally do).
- Natural-collision probability remains ~16⁻⁸ per registration pair — the fix restores the documented absorption contract rather than addressing an operational-frequency problem.
- Pre-existing, untouched repo-wide quirks: `applyDbEnvOverride()` makes DB tests run against `app_db` (residue probes prove cleanliness); Task 2.2's intentional TS2307 RED journey test remains (owned by Task 2.4).
- Dependent DEV1-013 tasks halted by the 2.1 STOP rule can now resume — the D1 premise (generation path proven, lock-only) is restored.

## 7. Conclusion

D4 is resolved with a one-file production change (28 insertions / 15 deletions, `backend/db/repo/students/student.repository.ts`): the per-attempt savepoint bracket around the registration students-insert. The absorption lock — left RED by Task 2.1 as the permanent regression lock — went **GREEN with ZERO test changes**, the DEV1-002 surface keeps every observable contract (its service file is byte-original, its 18-test suite green), and the immutability scan, journey smoke, repo suite, quality loops, and typecheck are all clean. The D4 ledger entry is ✅ Done with the resolution note; dependent work is unblocked.
