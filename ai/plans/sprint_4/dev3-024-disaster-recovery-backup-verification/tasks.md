# Tasks: DEV3-024 — Disaster Recovery & Backup Verification

> **Plan directory (verbatim)**: `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification`
> **Execution rules (from `specs.md` REQ-001/071/072)**: read ALL `outcome/` files before ANY task; write `outcome/<task-id>-outcome.md` after each; flip `[ ]`→`[x]` as you go; deferred work goes to `deferred-items.md`, never silently.
> **Scope note**: no schema, no GraphQL, no frontend — pipelines below retain their mandatory subtask shells but several are `N/A (no-op with recorded justification)` where ground truth dictates.

---

## Phase 0 — Pre-Implementation Baseline

- [ ] 0.1 **Baseline & ledger**
  - Capture baseline: `bun tsgo 2>&1 | grep -c "error TS"`, `bun biome:check`, and `bun run scripts/lint-service.ts --json --id baseline-dev3-024` into `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/outcome/phase0-baseline.md`.
  - Initialize `deferred-items.md` (done at plan authoring; verify D-001..D-003 rows render).
  - _Requirements: REQ-001, REQ-002, REQ-003, REQ-071_

- [ ] 0.2 **Toolchain probe**
  - Verify `pg_dump`, `pg_restore`, `psql` availability and version ≥ the production Postgres major (document install steps for apt/brew in outcome if missing).
  - Verify destructive guard surface: `grep -n "export" scripts/lib/destructiveDbGuard.ts` matches plan.md §4.2 expectations.
  - Verify `.gitignore` covers `/backups/`; if missing, stage the one-line addition under task 4.4.
  - Write `outcome/0.2-toolchain-outcome.md`.
  - _Requirements: REQ-026, REQ-030, REQ-033_

---

## Phase 1 — Plan Review Gate (pre-implementation)

- [ ] 1.1 **Invoke `plan-review` skill** on this plan directory; fix all findings; write `outcome/plan-review-R1.md`. Repeat until clean. Do NOT start Phase 2 before green.

---

## Phase 2 — Backup Script (CREATE)

- [ ] 2.1 **`scripts/ops/backup-database.ts`** — implement plan.md §4.1 (`parseBackupArgs`, `resolvePgToolchain`, `buildSafeConnString`, `runBackup`, `writeManifest`, `printSummary`); bootstraps env via existing `scripts/dbActions` helpers; `--env`, `--out-dir`, `--help`; exit codes per REQ-050; atomic tmp→final rename + PID lockfile (REQ-040/042); stdout redacted (REQ-030).
  - [ ] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts scripts/ops/backup-database.ts --lifecycle duplicates` → exit 0.
  - [ ] 2.1.TE **Test Engineering** — `scripts/ops/backup-database.test.ts` (colocated, `scripts/dbActions/*.test.ts` precedent): Tier 1 branch coverage of arg parsing/env bootstrap; Tier 2 boundaries (missing tool, empty dump, huge artifact size field); Tier 3 chaos (garbage args, non-existent out-dir parent, fake pg_dump exiting 137); Tier 4 security (capture all printed output on success AND failure paths; assert raw DSN/password never appears; manifest contains only redacted host/db). Mock pg_dump via injectable `spawn` seam; real binary exercised in 5.2 integration test.
  - [ ] 2.1.SEC **Security & Tenancy Audit**: no shell-string injection (argv-array `Bun.spawn` only); 0600 perms; `/backups/` confinement; secret-scrub sweep.
  - [ ] 2.1.SR **Semantic Review**: atomic rename correctness on crash; lockfile stale-PID handling; no `console` misuse (ops scripts may use `console` per precedent — verify against `scripts/ops` convention, not the logger lint rule); no dead branches.
  - [ ] 2.1.IV **Instruction Verification**: read `.agents/instructions/backend.instructions.md` + `.agents/instructions/tests.instructions.md` (printed by sub-loop) and validate; zero drift.
  - _Requirements: REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-024, REQ-026, REQ-027, REQ-030, REQ-033, REQ-040, REQ-042, REQ-050, REQ-051, REQ-052_

## Phase 3 — Restore & Verification Script (CREATE)

- [ ] 3.1 **`scripts/ops/restore-verify.ts`** — plan.md §4.2: explicit `--target` (no default — REQ-031), `--from`, `--yes-i-understand`; `assertRestoreTargetSafe` consuming `assessDestructiveDbCommandSafety()` on the TARGET DSN (single-variable TOCTOU-safe); sha256 re-check vs manifest before restore; `pg_restore --clean --if-exists --no-owner --no-privileges`; structural checks (REQ-017) + oracle registry `const ORACLES` (plan §4.3, REQ-018); `restore-report.json` + PASS/FAIL summary (REQ-019).
  - [ ] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts scripts/ops/restore-verify.ts --lifecycle duplicates` → exit 0.
  - [ ] 3.1.TE **Test Engineering** — `scripts/ops/restore-verify.test.ts`: Tier 1 branches (flag combos, guard allow/deny), Tier 2 boundaries (zero-row source tables, manifest/journal hash drift), Tier 3 chaos (truncated dump, corrupted sha, oracle SQL error injection), Tier 4 security (guard refusal for: NODE_ENV=production shape, neon host, Upstash marker; assert exit 2 + guard message; assert NO restore subprocess spawned on refusal — spy on spawn).
  - [ ] 3.1.SEC **Security & Tenancy Audit**: guard called BEFORE any pg process spawn; DSN never printed; report writes 0600 inside run dir; no SQL string interpolation of user-controlled values (oracle SQL is static).
  - [ ] 3.1.SR **Semantic Review**: oracle registry data-driven; report schema matches plan.md `RestoreReport` verbatim; Fail on ANY oracle fail; no partial-success ambiguity.
  - [ ] 3.1.IV **Instruction Verification**: backend + tests instruction files, validated.
  - _Requirements: REQ-015, REQ-016, REQ-017, REQ-018, REQ-019, REQ-024, REQ-025, REQ-030, REQ-031, REQ-032, REQ-041, REQ-050, REQ-051, REQ-052_

## Phase 4 — Repo Wiring & Hygiene

- [ ] 4.1 **`package.json`** — add `ops:db-backup`, `ops:db-restore-verify` beside existing `ops:*` entries (REQ-029).
  - [ ] 4.1.QL: `bun run scripts/health/sub-loop.ts package.json --lifecycle duplicates` (JSON lint path) → 0; `.TE`: unit test asserts both scripts parse & target existing files; `.SEC/.SR/.IV` standard.
  - _Requirements: REQ-029_
- [ ] 4.2 **`.gitignore`** — ensure `/backups/` excluded (REQ-014/033); `.QL` per sub-loop; `.TE` assertion in 4.1 test (read `.gitignore`, assert entry); `.SEC/.SR/.IV` standard.

## Phase 5 — Integration Test & Drill (TEST-FIRST per journey rule; drill is the human arm)

- [ ] 5.1 **Integration test `scripts/ops/backup-restore.integration.test.ts`** — `beforeAll`: create scratch DB `kottaby_dr_it_<ts>`, load minimal schema via existing push path + seed minimal fixture rows exercising every REQ-017 table and each oracle domain; run REAL `backup-database.ts` → REAL `restore-verify.ts` against scratch; assert run-dir manifest + report PASS; tamper one artifact and assert FAIL path too; `afterAll`: drop scratch DB, clean run dirs. NO `runInRollback` (OS-level tools need a real DB — documented deviation, tests.instructions-compliant).
  - [ ] 5.1.QL: `bun run scripts/health/sub-loop.ts scripts/ops/backup-restore.integration.test.ts --lifecycle duplicates` → 0.
  - [ ] 5.1.TE: run via `bun run test/scripts/run-test.ts scripts/ops/backup-restore.integration.test.ts` (REQ-062); THEN `bun run test/scripts/run-test.ts --last scripts/ops/backup-restore.integration.test.ts` reviewed.
  - [ ] 5.1.SEC: scratch DSN passes guard by construction (non-prod signal); test also asserts the prod-shaped DSN is refused (reuses 3.1.TE matrix at integration level, one probe).
  - [ ] 5.1.SR / 5.1.IV standard (tests instructions file read).
  - _Requirements: REQ-060, REQ-061, REQ-062, REQ-010..REQ-019 (chain)_
- [ ] 5.2 **Manual drill execution** — operator executes `docs/ops/disaster-recovery.md` drill verbatim on scratch infra BEFORE the doc is finalized; every friction point feeds back into the doc; measured end-to-end duration recorded in `outcome/5.2-drill-evidence.md` (RTO evidence, REQ-021/022).
  - [ ] 5.2.SR: drill log shows zero undocumented steps (the doc alone was sufficient).
  - _Requirements: REQ-022_

## Phase 6 — Documentation (Canonical Runbook)

- [ ] 6.1 **`docs/ops/disaster-recovery.md`** (CREATE; `mkdir -p docs/ops`) — repo docs template: summary; Why (launch blocker §7); The Pattern (backup/restore/verify scripts + scheduling guidance REQ-023); **RPO = 1h / RTO = 4h** definitions with mechanism (REQ-020/021); step-timed recovery runbook; drill procedure; Rules; What NOT to Do (never restore to DATABASE_URL by default; never commit dumps; never skip manifest check); Rollout summary; Related (PRODUCTION_READINESS §7, DATABASE_MIGRATIONS.md, realtime-engine persist-first note, state-machine-invariants as oracle source, deferred D-001..D-003).
  - [ ] 6.1.QL: sub-loop on the doc (markdown lint path) → 0.
  - [ ] 6.1.SR: every runbook command copy-paste-exactly-matches a `package.json` script (REQ-028/029 consistency); every REQ id traced.
  - _Requirements: REQ-020..023, 028, 052_
- [ ] 6.2 **Neon/PITR evidence block** — document console-verified retention settings + screenshot reference into the runbook's appendix (D-001 stays open as console-side; doc records what operator verified).
  - [ ] 6.2.SR: no fabricated values; only observed settings written.

## Phase 7 — Knowledge Propagation

- [ ] 7.1 **Propagate learnings** — root `AGENTS.md` Important References gains one line (`docs/ops/disaster-recovery.md` — DR runbook, RPO/RTO, backup/restore verification); if a new durable ops-script rule emerged (e.g., "restore targets MUST be guard-assessed"), add the 1–2 line rule to root AGENTS.md or the scripts-layer doc per content policy — NOT prose duplication.
  - [ ] 7.1.QL per modified file via sub-loop; `.SR` (content policy: rules + references only, no code dumps); `.IV`.
  - _Requirements: REQ-070, REQ-072_
- [ ] 7.2 **Deferred ledger sweep** — D-001..D-003 confirmed 📅 Forward (owned post-launch / DEV3-026); no ❌ rows remain; write `outcome/7.2-ledger-sweep-outcome.md`.

## Phase 8 — Post-Implementation Review Wave (mandatory: plan touches >10 tasks when subtask-pipelines counted)

- [ ] 8.1 Dispatch review agents scoped to `git diff --name-only` vs Phase-0 baseline: review-backend (scripts/ops correctness, races), pentester/idor (guard-bypass probes, credential-leak probes, arg-injection), review-types (manifest/report shapes). Fix loop until zero feature-specific findings; write `outcome/post-implementation-review.md`.
- [ ] 8.2 **Final gate**: full `bun quality-gate` green from baseline; all execution tasks `[x]`; ledger clean; handoff comment for DEV3-026 referencing `docs/ops/disaster-recovery.md` + latest drill evidence path.

---

## Journey-Test Task Ruling (mandatory check per skill)

§2.9 of `specs.md` ruled cross-actor journeys **N/A** (operational, single-actor, no shared domain state). Therefore no `test/workflows/**/*.test.ts` task exists in this plan; the end-to-end chain is Phase 5's integration test + drill. If 8.1 reviewers challenge the ruling, escalate to `deferred-items.md` and proceed only with orchestrator sign-off.
