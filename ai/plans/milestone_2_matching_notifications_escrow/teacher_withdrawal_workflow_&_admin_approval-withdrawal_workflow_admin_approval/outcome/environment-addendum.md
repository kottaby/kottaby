# Environment Addendum — DB Provider Switch (pglite → real PostgreSQL 17.11)

**Plan:** `ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/`
**Date:** 2026-09-18
**Status:** Supersedes the DB statement in `outcome/0-baseline-outcome.md` §3 **for test execution only** (see §2). Typecheck/lint baselines are provider-independent and remain valid (see §3).

---

## 1. Timeline (what happened and in what order)

1. **Phase 0 baseline ran under pglite.** `outcome/0-baseline-outcome.md` §3 recorded `DB_PROVIDER=pglite` (project-sanctioned in-process WASM Postgres at `./db/pglite`; 20 migration journal entries applied, seed green, `teacher_transaction` clean) and concluded "no external Postgres is in play". That statement was accurate at baseline time.
2. **Task 1.1 execution hit PRE-EXISTING failures under pglite:** journey steps **1/3/4/6** and finsec steps **A/B/D/D2/H** failed intermittently/deterministically — intermittent `25001` on nested top-level transactions, and corrupted outcomes on true-concurrency races.
3. **Root cause (recorded, REPORTED-not-fixed, in `outcome/1.1-journey-gapfill-outcome.md` §5):** the PGlite pool shim (`backend/db/pglite-pool.ts:12-16, 277-289`) hands every "connection" the SAME single-connection WASM session, and Drizzle's `NodePgSession` only acquires a dedicated pool client for a real `Pool` (`isPool` check) — so every `db.transaction()`, including nested ones opened by `readInSnapshot`, serializes onto one shared session. The service code is correct on a real pool; the sandbox provider cannot honor the semantics. A pglite data-dir reset is NOT a fix (the same-session nested `BEGIN` hazard is structural, only timing noise changes).
4. **Environmental remediation (zero production code):** a **real PostgreSQL 17.11** cluster was provisioned — user-space cluster from the apt binaries, listening on **port 5432**, database **`app_db`**, **trust auth** (no password in the URL). Connection URL form (no secrets):
   `postgresql://postgres@127.0.0.1:5432/app_db`
5. **`.env` and `.env.test` switched to `DB_PROVIDER=postgres`**; drizzle **migrate + seed re-run green** against the real cluster.
6. **Validation run: 48/48 green** under postgres — the entire pre-existing-failure set from step 2 passes.
7. **All Phase 3 evidence was captured under postgres and is ALL GREEN:**
   - `outcome/3.1-teacher-request-outcome.md`: wallet service suite **9** + wallet repository suite **24**;
   - `outcome/3.2-admin-settlement-outcome.md`: **22 / 26 / 13**;
   - `outcome/3.3-journey-wire-outcome.md`: journey **8/8 (×2 consecutive runs)**, finsec **9/9**, wire **31/31** (see its §1 green-run ledger).

## 2. What this addendum supersedes (and what it does not)

- **Superseded for test execution only:** the DB environment statement in `outcome/0-baseline-outcome.md` §3 (`DB_PROVIDER=pglite`, "no external Postgres is in play"). All Phase 1–3 suites execute against real PostgreSQL 17.11 as recorded above.
- **NOT superseded:** the baseline's historical observations (they accurately describe the pglite data dir they probed at Phase 0 time).

## 3. Provider-independent baselines — still valid

- The Phase-0 typecheck/lint baselines — `bun tsgo` **0 errors**, `biome` **0 issues**, `bun run scripts/lint-service.ts` **PASS** — do not exercise the DB provider and are **provider-independent; they remain the valid compare targets** for task 4.2's baseline compare.
- Task 4.2 must cite THIS addendum when documenting its baseline compare: test-execution DB = real PostgreSQL 17.11 (`postgresql://postgres@127.0.0.1:5432/app_db`), tsgo/biome/lint baselines unchanged.

## 4. Citations

- Root cause of the pglite failures: `outcome/1.1-journey-gapfill-outcome.md` §5.
- Green evidence under postgres: `outcome/3.1-teacher-request-outcome.md`, `outcome/3.2-admin-settlement-outcome.md`, `outcome/3.3-journey-wire-outcome.md` (§1 green-run ledger), plus the 48/48 validation run (§1 step 6 above).
- Discovered by mid-point review R1 (finding 1, MEDIUM); record: `outcome/midpoint-review-R1.md`.
