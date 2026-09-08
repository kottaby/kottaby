# Tasks: DEV3-024 — Disaster Recovery & Backup Verification

## Document Information

- **Feature Name**: Disaster Recovery & Backup Verification
- **Target Directory**: `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification`
- **Outcome Directory**: `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/outcome`
- **Version**: 1.0
- **Date**: 2026-09-05
- **Author**: Dev 3 stream (planning agent)
- **Related Documents**: `specs.md` (requirements), `plan.md` (design), `deferred-items.md` (ledger) — all in this directory

## Non-Negotiable Execution Protocol for All Tasks

1. **Pre-Execution Outcome Knowledge Read:** before ANY task, read ALL files in `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/outcome/`.
2. **Per-File Quality Verification Loop:** after modifying any file, run `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` and reach exit 0 before touching another file.
3. **Semantic Review Checklist (pre-completion gate):** execute the agent self-review checklist (race conditions, env-config, dead code, cross-layer, enums, deferred items, clean comments — code/JSDoc MUST never cite plan artifacts like `REQ-*`, `Task X.Y`, or `ai/plans/...` paths).
4. **Global Health Check:** before marking any subtask `[x]`, re-run sub-loop on all files the subtask modified; all exit 0.
5. **Post-Execution Outcome File:** write `outcome/<task-id>-outcome.md` with findings, cross-file dependencies, carry-overs.
6. **Progress Tracking:** flip `[ ]` → `[x]` in this file upon completion.

## Mandatory Subtask Pipeline (every implementation task X.Y, strict order)

- **X.Y.QL Quality Loop** — `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (tsgo → oxlint → biome → lint:type-aware → check:duplicates; auto-prints applicable AGENTS.md + `.agents/instructions/*.instructions.md`; enforces Fix-Or-Report).
- **X.Y.TE Test Engineering** — 4-Tier framework (see each task for tier detail): branch/statement 100%, boundaries, chaos (`Promise.allSettled` races, fuzz), security/abuse. Layer rules: DB tests `runInRollback`+`tx` (N/A here — integration deviation documented in 5.1); service mocks N/A (no services touched); integration via `test/scripts/run-test.ts`.
- **X.Y.SEC Security & Tenancy Audit** — BOLA/IDOR, BOPLA, BFLA, composite relations, input sanitization (adapted to ops tooling per specs §2.3).
- **X.Y.SR Semantic Review** — checklist referenced above.
- **X.Y.IV Instruction Verification** — read every AGENTS.md and instructions file printed by sub-loop and validate.

Sequence: QL → TE → SEC → SR → IV → `[x]`.

*Pipeline scoping (documented negation):* doc-only tasks (6.x) and AGENTS.md-propagation edits (7.1) run QL/SR/IV with TE recorded N/A in the task outcome (no executable surface); SEC runs wherever secrets/DSNs could leak into the artifact (6.1.SEC / 6.2.SEC below); process gates (1.1, 8.x) and outcome-writing tasks (2.2, 3.2, 6.3, 7.2) are exempt (no repo code artifact). Test files capture/assert script streams — they do not echo captured output via `console.*` (existing `scripts/dbActions/*.test.ts` precedent).

## Layer-to-Instructions Mapping (applicable to this plan)

| Files in this plan | Instruction files | AGENTS.md files |
|---|---|---|
| `scripts/ops/*.ts` | `.agents/instructions/backend.instructions.md` (closest layer: backend TS — note the file's `applyTo` glob is `backend/**`; `scripts/` has no layer AGENTS.md) | root `AGENTS.md` (repo root — no layer AGENTS.md exists for `scripts/`) |
| `scripts/ops/*.test.ts` | `.agents/instructions/tests.instructions.md` (+ backend above) | root AGENTS.md |
| `package.json`, `.gitignore` | — | root AGENTS.md (barrel/naming rules N/A) |
| `docs/ops/disaster-recovery.md` | — | root AGENTS.md (docs policy) |
| `AGENTS.md` (root, Phase 7) | — | root AGENTS.md content policy (rules+references only) |

---

## Phase 0 — Pre-Implementation Baseline (blocking)

- [x] 0.1 **Record baseline & verify ledger**
  - Run `bun tsgo 2>&1 | grep "error TS" | wc -l`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline-dev3-024`; write `outcome/phase0-baseline.md` with all three counts/artifacts.
  - Confirm `deferred-items.md` exists with D-001..D-003 forward rows.
  - _Requirements: REQ-000 (specs); skill Phase-0._
- [x] 0.2 **Toolchain & anchor probe**
  - Verify `pg_dump`, `pg_restore`, `psql` exist on the dev host; record versions; if server > client major, document upgrade path (carried into runbook Task 6.1 prerequisites section).
  - Re-verify anchors: `scripts/lib/destructiveDbGuard.ts` exports (`grep -n "export"`), `scripts/dbActions/envFile.ts` exports `applyEnvFile`, `scripts/dbActions/bootstrapEnv.ts` exists, `package.json` `ops:*` block lines, `.gitignore` state re `/backups/`.
  - Write `outcome/0.2-toolchain-anchors-outcome.md`.
  - _Requirements: REQ-026, REQ-030, REQ-033; G-04, G-06 anchors._

## Phase 1 — Plan Review Gate (blocking)

- [x] 1.1 **Invoke `@plan-review` skill** on this directory; fix ALL findings; re-run until "passes"; write `outcome/plan-review-R1.md`; commit patched plan files before any implementation.
  - _Skill Phase 1.5; no REQ mapping (process gate)._

## Phase 2 — Backup Script (CREATE `scripts/ops/backup-database.ts`)

- [x] 2.1 **Implement `backup-database.ts`** per plan §Component-1: arg parser (`--env`, `--out-dir`, `--help`), env bootstrap reuse, toolchain probe, lockfile with stale-PID reclamation, `pg_dump -Fc` into `tmp-<pid>-<ts>/`, sha256 + journal hash, `manifest.json` (0600), atomic rename to `backups/<UTC>/`, redacted stdout summary, `_FAILED` marker on failure, exit codes 0/1/2.
  - Scope note: single file + (only if justified) `scripts/ops/_shared.ts` for redaction used by both scripts — if created, it gets its own QL/TE cycle before 3.1 consumes it.
  - [ ] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts scripts/ops/backup-database.ts --lifecycle duplicates` → exit 0.
  - [ ] 2.1.TE **Test Engineering** — create `scripts/ops/backup-database.test.ts` (colocated; G-07 precedent):
    - Tier 1: arg parsing branches (all flags, unknown flags, missing values); env bootstrap behaviors; manifest builder field-by-field; lock acquire/release/stale-reclaim; redaction helper matrix.
    - Tier 2: empty dump (0 bytes → failure), timestamp collision suffixing, out-dir at filesystem edge paths, TZ boundaries in UTC stamp.
    - Tier 3: chaos — `pg_dump` mock exits 137/segfault-ish codes, random garbage stderr, concurrent invocations via `Promise.allSettled` (one winner, one lock refusal), out-dir replaced by a file mid-run.
    - Tier 4: security — capture ALL stdout/stderr on success AND failure; assert the DSN password substring never appears; assert manifest contains no userinfo; assert spawn receives argv array (no shell string) via injected spawn spy.
    - Runner: plain `bun test` acceptable for pure-unit file (no DB); if any DB touch sneaks in, switch to `bun run test/scripts/run-test.ts` and log it in outcome.
  - [ ] 2.1.SEC **Security & Tenancy Audit**: injection-free spawn; 0600 perms; confinement to out dir; no env dumping on error paths; lockfile can't be used to squat on a directory name (stale detection).
  - [ ] 2.1.SR **Semantic Review**: atomic rename happens exactly once; `_FAILED` path releases lock; zero dead branches; no plan-artifact references in comments/JSDoc; no modules imported beyond need; enums (none introduced) — record "no enums" explicitly.
  - [ ] 2.1.IV **Instruction Verification**: read sub-loop-printed files (root AGENTS.md, backend instructions) and validate; confirm `console.*` usage is sanctioned for ops scripts (cite `scripts/ops/sweep-expired-link-requests.ts` precedent in outcome).
  - _Requirements: REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-024, REQ-026, REQ-027, REQ-030, REQ-033, REQ-040, REQ-042, REQ-050, REQ-051._
- [x] 2.2 **Outcome**: `outcome/2.1-backup-script-outcome.md` (findings, deviations, carry-overs for restore script — esp. shared redaction utility decision).
  - _Requirements: REQ-000.4 (outcome ledger); carries the 2.1 redaction-util decision to 3.1._

## Phase 3 — Restore & Verification Script (CREATE `scripts/ops/restore-verify.ts`)

- [x] 3.1 **Implement `restore-verify.ts`** per plan §Component-2/3: arg parse with REQUIRED `--target` (no default), `--from` run-dir-or-artifact resolution, `--yes-i-understand` non-TTY gate; guard assessment on the target DSN (single-variable threading); artifact SHA-256 re-check vs manifest; `pg_restore --clean --if-exists --no-owner --no-privileges`; structural checks (table presence derived from `backend/db/schema/` exports; REQ-017 critical table row counts; `__drizzle_migrations` hash check); `const ORACLES` registry (OR-W1, OR-W2, OR-B1, OR-U1, OR-U2, OR-REQ, OR-MIG) executed as read-only `psql` predicates; `restore-report.json` writer; `VERDICT: PASS|FAIL` summary with absolute report path.
  - [ ] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts scripts/ops/restore-verify.ts --lifecycle duplicates` → exit 0.
  - [ ] 3.1.TE **Test Engineering** — create `scripts/ops/restore-verify.test.ts`:
    - Tier 1: arg branches incl. every refusal; manifest load/validate; verdict aggregation (any structural fail → FAIL; any oracle fail → FAIL; hash mismatch → FAIL); report writer shape.
    - Tier 2: zero-row critical table verdict boundary; missing run-dir fields; oracle returning exactly-0 vs -1 (error) distinction.
    - Tier 3: chaos — truncated dump file, manifest with randomized missing keys, oracle SQL error injection, artifact hash flip one nibble.
    - Tier 4: security — guard refusal matrix (NODE_ENV=production env shape; `*.neon.tech` host; Upstash marker; RDS host) with spawn-spy asserting NO pg_restore spawn on refusal; `--target` omission exit 2; output greps for password.
  - [ ] 3.1.SEC **Security & Tenancy Audit**: guard executes before ANY restore spawn; argv-array spawns; report perms 0600; oracle SQL is static consts (no interpolation); scratch-target assumption documented in header.
  - [ ] 3.1.SR **Semantic Review**: registry is pure data (adding oracle = data append); TOCTOU single-DSN threading verified by reading the code top to bottom; no dead branches; comment hygiene (no plan refs).
  - [ ] 3.1.IV **Instruction Verification**: sub-loop-printed files read & validated.
  - _Requirements: REQ-015, REQ-016, REQ-017, REQ-018, REQ-019, REQ-024, REQ-025, REQ-027, REQ-030, REQ-031, REQ-032, REQ-041, REQ-050, REQ-051, REQ-052._
- [x] 3.2 **Outcome**: `outcome/3.1-restore-verify-outcome.md`.
  - _Requirements: REQ-000.4 (outcome ledger)._

## Phase 4 — Repo Wiring

- [x] 4.1 **`package.json` scripts**: add `"ops:db-backup"` and `"ops:db-restore-verify"` adjacent to existing `ops:*` entries (verified 0.2: lines 63–64 — insert immediately after the `ops:remind-link-requests` line, not at literal 66–67), exact binary invocations matching runbook.
  - [x] 4.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts package.json --lifecycle duplicates` → 0 (or schema-valid JSON if sub-loop no-ops on JSON — record behavior in outcome).
  - [x] 4.1.TE **Test**: inside `scripts/ops/backup-database.test.ts` (or a tiny `scripts/ops/scripts-registration.test.ts`), parse `package.json` and assert both keys exist and point at existing files; assert `.gitignore` contains `/backups/`.
  - [x] 4.1.SEC: no secrets introduced into manifest file. · [x] 4.1.SR: alphabetical/group placement consistent with surrounding block. · [x] 4.1.IV: root AGENTS.md conventions.
  - _Requirements: REQ-029, REQ-014, REQ-033._
- [x] 4.2 **`.gitignore`**: add `/backups/` if absent (verified 0.2); QL + covered-by-4.1.TE assertion + SR.
  - _Requirements: REQ-014, REQ-033._

## Phase 5 — Integration Test & Drill (drill chain; journey ruling N/A — see closing note)

- [x] 5.1 **CREATE `scripts/ops/backup-restore.integration.test.ts`** (TEST-first order within this phase: author against the Phase-2/3 contracts, which are already merged):
  - `beforeAll`: create scratch DB `kottaby_dr_it_<ts>` (via `psql`/createdb argv), push schema (existing dbActions push path or drizzle-kit push with sqlite-excluded config), seed MINIMAL fixtures covering every REQ-017 critical table and every oracle domain (one wallet + one `teacher_transaction` earning row, one `session` row with intent, one `session_request_idempotency` claim, a students-row balance-lane sanity fixture, audit row, notification row, parent link request).
  - Execute REAL `bun run ops:db-backup` against fixture DB → assert artifact+manifest; execute REAL restore-verify against a second scratch DB → assert `VERDICT: PASS` and report parses; tamper the artifact copy (flip bytes) → assert FAIL path and exit 1.
  - `afterAll`: drop both scratch DBs; remove test run dirs. NO `runInRollback` — OS-level tools require real DBs; document the deviation inline (clean, domain-language comment only) and in outcome.
  - [x] 5.1.QL: `bun run scripts/health/sub-loop.ts scripts/ops/backup-restore.integration.test.ts --lifecycle duplicates` → 0.
  - [x] 5.1.TE: run via `bun run test/scripts/run-test.ts scripts/ops/backup-restore.integration.test.ts`; confirm `--last` output reviewed; then `--focus` the verdict lines for the outcome.
  - [x] 5.1.SEC: assert guard refuses a prod-shaped DSN at integration level too (one probe reusing matrix fixture); assert scratch DB names are quote-safe.
  - [x] 5.1.SR / 5.1.IV standard (tests + backend instructions).
  - _Requirements: REQ-060, REQ-061, REQ-062; chain-covers REQ-010..REQ-019._
- [x] 5.2 **Cold drill execution** (human/agent-executed against scratch): follow the runbook draft (written in 6.1 but drilled against its draft as soon as 5.1 is green; final polish allowed only AFTER drill feedback) end-to-end as a "never-seen-it" operator; record every friction point; measure total wall-clock; write `outcome/5.2-drill-evidence.md` (durations table, verdict, friction log, runbook patch list).
  - _Requirements: REQ-021, REQ-022._

## Phase 6 — Canonical Documentation

- [x] 6.1 **CREATE `docs/ops/disaster-recovery.md`** (mkdir `docs/ops/`): repo docs template — Summary; Why; The Pattern (backup/restore-verify with exact `bun run ops:*` invocations; scheduling guidance cron/systemd + Neon PITR note); RPO=1h / RTO=4h definitions + budget arithmetic from drill; step-timed full-recovery runbook; disaster playbooks (DB-content loss; full-region loss incl. manual env re-entry); drill procedure + evidence checklist; conventions (operator-English stdout exemption, permission model, artifact hygiene); What NOT to Do; Rollout Summary; Related Documents (PRODUCTION_READINESS §7, DATABASE_MIGRATIONS, realtime-engine persist-first note, state-machine-invariants as oracle anchors, this plan's outcome dir).
  - [x] 6.1.QL: sub-loop on the md file → 0.
  - [x] 6.1.SR: every command in the doc verbatim-matches `package.json`; every deferred claim cites its ledger id; no orphaned references.
  - [x] 6.1.SEC: no credentials/real DSNs in the runbook — examples use placeholders only.
  - [x] 6.1.IV: root AGENTS docs policy (canonical docs live under `docs/<domain>/`, kebab-case).
  - _Requirements: REQ-020, REQ-021, REQ-022, REQ-023, REQ-028, REQ-052, REQ-070._
- [x] 6.2 **Neon PITR appendix evidence**: document console-observed retention/PITR settings in the runbook appendix (D-001 remains 📅 Forward for any console-side hardening beyond documentation); write what was observed, nothing aspirational.
  - [x] 6.2.SR: values match screenshot/panel exactly; no fabricated retention numbers.
  - [x] 6.2.SEC: any embedded console evidence is redacted — no credentials/tokens; 6.2.TE/QL/IV: N/A (docs-only, covered by 6.1 cycles) — record in outcome.
  - _Requirements: REQ-020, REQ-023 (Neon PITR complementary layer); ledger D-001._
- [x] 6.3 **Outcome**: `outcome/6.x-runbook-outcome.md` incl. drill-feedback patches applied to the final doc.
  - _Requirements: REQ-000.4 (outcome ledger); REQ-070._

## Phase 7 — Knowledge Propagation (executed only after Phase-8 review is green per skill ordering note: Phase 8 numbered after 7 but executes BEFORE 7's propagation write — keep the task ordering below)

- [x] 7.1 **Knowledge propagation**
  - Root `AGENTS.md` Important References: add ONE line — `docs/ops/disaster-recovery.md` — DR runbook (RPO 1h / RTO 4h), backup/restore-verify ops scripts, invariant-oracle verification.
  - IF implementation surfaced a durable rule (e.g., "operator scripts that target a database with mutating tools MUST guard-assess the target DSN"), add it as a 1–2 line rule in the appropriate AGENTS.md/instructions file per content policy (rules+references only).
  - QL each modified file; SR vs content policy (no code/prose dumps); IV.
  - Write `outcome/7.1-knowledge-propagation-outcome.md`.
  - _Requirements: REQ-028, REQ-070, REQ-071, REQ-072._
- [x] 7.2 **Deferred ledger sweep**: D-001..D-003 confirmed 📅 Forward with owners (D-001 operator/DEV3-026, D-002 post-launch CI, D-003 post-launch infra); zero ❌ rows; write `outcome/7.2-ledger-sweep-outcome.md`.
  - _Requirements: REQ-000.2, REQ-070.3 (ledger clean at plan close)._

## Phase 8 — Post-Implementation Review Wave (mandatory: plan exceeds 10 subtasked units; executes BEFORE Phase 7 writes)

- [x] 8.1 **Dispatch review agents** scoped to `git diff --name-only` vs Phase-0 baseline: backend-reviewer (scripts/ops correctness, races, TOCTOU, dead code), pentester/idor (guard bypass attempts, credential-leak probes, arg injection, confinement escape), types-reviewer (manifest/report contracts, no canonical-type pollution). Aggregate; fix-file dispatch with sub-loop per file; repeat until zero feature findings.
  - Write `outcome/post-implementation-review.md`.
  - _Process gate (skill Phase-8 review wave); no REQ mapping (consumes REQ-000.4 outcome ledger)._
- [ ] 8.2 **Final gate**: full `bun quality-gate` green against Phase-0 baseline; all checkboxes `[x]`; ledger clean; outcome summary enumerates DEV3-026 handoff artifacts (`docs/ops/disaster-recovery.md`, drill evidence path, sample PASS report path).
  - _Requirements: REQ-000 (baseline comparison); specs §Definition of Done._

---

## Journey-Test Note (mandatory check)

Specs §Journeys ruled cross-actor journeys N/A (operational single-actor tooling; documented actor table + negative steps). No `test/workflows/**` task exists by that ruling; the end-to-end chain is Phase 5.1 (integration) + 5.2 (cold drill). If 8.1 reviewers dispute, escalate via `deferred-items.md` before adding any workflow test.

## Estimated Effort / Sequencing

- 0.x: 0.5 h · 1.1: 0.5 h · 2.1: 4 h · 3.1: 5 h · 4.1–4.2: 0.5 h · 5.1: 3 h · 5.2: 1.5 h (+runbook draft dependency) · 6.1–6.3: 3 h · 7.x: 1 h · 8.x: 2 h ⇒ ≈ 2.5 focused days, consistent with 5 SP. Dependencies: 3.1 needs the redaction util decision from 2.2; 5.2 needs 6.1 draft; 7.x waits on 8.1/8.2 green.
