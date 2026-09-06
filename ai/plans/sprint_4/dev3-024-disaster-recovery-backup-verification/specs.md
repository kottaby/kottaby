# Requirements & Specification: DEV3-024 — Disaster Recovery & Backup Verification

## Document Information

- **Feature Name**: Disaster Recovery & Backup Verification
- **Ticket**: DEV3-024 — `docs/planning/TICKETS.md` §Sprint 4 (Owner Stream: Dev 3, Sprint 4, 5 SP, Blocked By: none)
- **Target Directory**: `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification`
- **Outcome Directory**: `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/outcome`
- **Version**: 1.0
- **Date**: 2026-09-05
- **Author**: Dev 3 stream (spec authored by planning agent)
- **Stakeholders**: Platform Operator / SRE (Dev 3), Admin (business acceptor), DEV3-026 launch-checklist executor, Academy ownership
- **Related Canonical Documents**: `docs/planning/PRODUCTION_READINESS.md` §7.1–7.5 · `docs/specs/state-machine-invariants.md` (INV-W1..W8, INV-B1..B6, INV-U1..U5 as post-restore oracles) · `docs/specs/open-decisions-and-gaps.md` (A.4 notifications, A.5 audit_logs) · `docs/DATABASE_MIGRATIONS.md` · `docs/SQLITE_LOCAL_DEV.md` · `docs/notifications/realtime-engine.md` (persist-first rationale: DB restore restores notification truth)

---

## Introduction

Kottaby stores its entire business-critical state — users, wallets, escrow holds, session history, immutable audit logs, notifications — in one PostgreSQL database (production plan: Neon-managed Postgres; local validation: plain Postgres; SQLite is a dev-only dialect). A platform handling **money and minors' education** cannot ship with an untested belief that "Neon probably backs us up." PRODUCTION_READINESS §7 makes disaster recovery a launch checklist block, but — as verified on disk in the Phase-0 table below — **no backup automation, no restore-verification tooling, and no DR runbook exist in this repository today**. The checklist items 7.1–7.5 are unexecutable prose until this ticket lands.

This specification defines the requirements for: (1) a scripted, manifest-bearing logical backup; (2) a guarded restore-verification capability that restores into an isolated scratch database and proves completeness + invariant integrity; (3) the canonical DR runbook defining RPO/RTO, scheduling guidance, and a step-timed disaster drill. The deliverable is deliberately operator-side tooling (shell scripts + documentation), following the existing `scripts/ops/` conventions; nothing is exposed through the application, GraphQL, or UI.

### Feature Summary

Ship executable, verifiable disaster-recovery tooling (`backup` + `restore-verify` ops scripts with manifests, oracle checks, and reports) plus the canonical runbook that defines RPO = 1 hour and RTO = 4 hours and scripts the full disaster drill, unlocking PRODUCTION_READINESS §7.1–7.5 for DEV3-026.

### Business Value

- Converts a **launch-blocking checklist block into executable, evidenced procedures** — DEV3-026 cannot sign off §7 without this ticket's artifacts and drill evidence.
- **Caps worst-case loss**: RPO bounds data loss at 1 hour; RTO bounds downtime at 4 hours, with measurements, not vibes.
- **Protects the trust tables**: wallet/escrow/audit-log integrity is verified after restore against the same invariants the application enforces, so a "successful" restore can never silently corrupt financial history.
- **De-risks operations**: a runbook that a never-before-seen operator can execute cold, verified by drill.

### Scope

**In scope:** backup script with manifest + checksums; restore-verify script with destructive-guard protection and invariant oracles; test coverage for both (4-tier + integration drill-chain); DR runbook with RPO/RTO/scheduling/drill/runbook steps; repo wiring (`package.json` ops scripts, `.gitignore`); knowledge propagation.

**Out of scope (explicit non-goals):**
1. No application UI, GraphQL operations, resolvers, or runtime services — backup/restore must never be app-triggerable (BFLA by construction).
2. No schema changes, no migrations, no `backend/db/**` edits of any kind.
3. No Neon PITR console configuration *in code* (console-side; forward item D-001, evidenced in runbook).
4. No CI/scheduled automation (D-002) and no off-site upload (D-003) — both designed-for but deferred post-launch.
5. No restore of environment variables/secrets — documented as a manual runbook step; scripts never export env.
6. No Redis/WebSocket-state backup — the notification engine is persist-first (`docs/notifications/realtime-engine.md`); the DB restore restores notification truth by design.
7. No SQLite DR story — dev-only dialect.

---

## ⚠️ Phase-0 Ground-Truth Verification (verify-then-claim, ruled against the live tree 2026-09-05)

Every capability claimed in this spec was checked against the filesystem BEFORE authoring. Nothing here relies on documentation prose alone.

| # | Item probed | Probe command (evidence) | Result | Disposition |
|---|---|---|---|---|
| G-01 | Existing backup/restore/DR automation | `grep -ri "pg_dump\|disaster\|restore" scripts/ scripts/ops/ backend/lib/ docs/drizzle/ docs/DATABASE_MIGRATIONS.md` | Only `scripts/shell/install_ohmyzsh.sh` matches — unrelated | **CREATE** — pure new work |
| G-02 | Existing DR documentation | `ls docs/` + grep for RPO/RTO | Only `docs/planning/PRODUCTION_READINESS.md:294-298` checklist lines; no `docs/ops/` | **CREATE** `docs/ops/disaster-recovery.md` |
| G-03 | RPO/RTO already defined | PRODUCTION_READINESS §7.4/7.5 | "Document RTO (e.g., 4 hours)" / "Document RPO (e.g., 1 hour)" — **examples, not ratified** | **DEFINE** — runbook ratifies RPO 1h / RTO 4h |
| G-04 | Destructive-command guard | `grep -n "export" scripts/lib/destructiveDbGuard.ts` | EXISTS: `assessDestructiveDbCommandSafety`, `formatDestructiveDbBlockMessage`, `assertDestructiveDbCommandAllowed`, `clearDestructiveGuardEnvVars`, `DESTRUCTIVE_GUARD_ENV_KEYS` (lines 5–159) | **CONSUME** — restore target DSN is guard-assessed |
| G-05 | DB provider matrix | `.env.example:8-32,321,332` | `DB_PROVIDER` = postgres (default) / neon / sqlite; `NEON_TEST_DATABASE_URL` for Neon integration tests; tests forbid production DSNs | Backup tooling targets Postgres/Neon only |
| G-06 | Ops-script convention | `scripts/ops/{sweep,remind}-expiring-link-requests.ts`, `package.json:66-67` | `--env <file>` flag, `applyEnvFile`, `--help` contract, exit-code doc in header, `console.*` stdout-as-ops-record, `ops:*` package script pair | **FOLLOW exactly** |
| G-07 | Script test harness | `ls scripts/dbActions/*.test.ts` | Colocated `bootstrapEnv.test.ts`, `envFile.test.ts`, `runCommand.test.ts`, `destructive.test.ts` | **FOLLOW** colocated pattern |
| G-08 | DB test runner for scripts | root `AGENTS.md` | `bun run test/scripts/run-test.ts <path>` mandatory for DB-touching tests (log capture) | Used for integration test |
| G-09 | Journey-test layer | `test/workflows/AGENTS.md` (144 lines) + `docs/testing/workflow-journey-tests.md` | EXISTS | Evaluated → **ruled N/A** (single-actor ops tooling; see Journeys section) |
| G-10 | Migration pipeline | `scripts/dbActions/cli.ts` + `docs/DATABASE_MIGRATIONS.md` | `bun run db` → generate/push/migrate; `reset`/`cleanGenerate` permanently disabled by repo policy | Zero schema drift guaranteed (no schema tasks exist) |
| G-11 | Drizzle journal paths | `ls backend/` | `backend/drizzle/` (PG) and `backend/drizzle-sqlite/` exist | Manifest records PG journal hash |
| G-12 | i18n surface | `shared/locale/` compile-time system | Operator tooling is English-only by precedent — i18n exemptions recorded (REQ-052) | N/A — documented |

**Rule applied**: anything "PROSE-ONLY" (documented but absent on disk) is treated as CREATE (new work), never as EXTEND.

---

## Requirements

### REQ-000: Pre-Implementation Baseline & Execution Protocol

**User Story:** As the executing agent, I want a recorded quality baseline and an outcome ledger before touching code, so that I can distinguish new issues from pre-existing ones and never re-do analysis.

#### Acceptance Criteria

1. WHEN implementation begins THEN the system SHALL record baseline counts — `bun tsgo 2>&1 | grep -c "error TS"`, `bun biome:check`, and `bun run scripts/lint-service.ts --json --id baseline-dev3-024` — into `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/outcome/phase0-baseline.md`.
2. WHEN implementation begins THEN the ledger `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/deferred-items.md` SHALL exist (created at planning; D-001..D-003 pre-seeded) and every deferred decision SHALL have a ledger row before its task may close.
3. WHEN an agent starts any task THEN it SHALL read ALL files in `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/outcome/` first.
4. WHEN an agent completes a task THEN it SHALL write `outcome/<task-id>-outcome.md` with findings, cross-file dependencies, and carry-over points.
5. WHEN a subtask completes THEN its checkbox in `tasks.md` SHALL flip `[ ]` → `[x]`.
6. WHEN any file is modified THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 before the next file is touched.
7. WHEN any subtask is marked complete THEN the semantic-review checklist (race conditions, env-config, dead code, cross-layer, enums, deferred items) SHALL have been executed.

#### Additional Details
- **Priority**: High · **Complexity**: Low · **Dependencies**: none · **Assumptions**: quality tooling is green or baselined on sprint_4 branch.

### REQ-000.5: Translation System & Enum Import Compliance

**User Story:** As a maintainer, I want the new tooling to respect the repo's i18n and enum rules, so quality gates stay honest and consistent.

#### Acceptance Criteria
1. WHEN a script emits operator-facing text THEN it SHALL use the established ops-script `console.*` stdout convention (English, operator-facing) — EXEMPT from `shared/locale` per `scripts/ops/` precedent; this exemption SHALL be recorded in the runbook conventions section so auditors don't flag it as a violation.
2. IF any enum is referenced (e.g., invariant oracle ids mapping to enum table names) THEN it SHALL be a value import, never `import type`.
3. WHEN code is linted THEN `next-intl`, `getBackendTranslations`, and `shared/messages/` SHALL appear nowhere in created files (grep-verifiable).
4. WHEN a future UI is proposed for backup status THEN it SHALL be a new ticket (this plan contains no UI).

#### Additional Details
- **Priority**: Medium · **Complexity**: Low · **Dependencies**: REQ-000 · **Assumptions**: operator tooling = English is accepted by stakeholders.

---

## Core Requirements: Backup Capability (REQ-010..REQ-014, REQ-024, REQ-026, REQ-027)

### REQ-010: Backup Execution

**User Story:** As the Platform Operator, I want a single command that produces a transactionally-consistent logical backup, so that I can protect the platform without learning pg flag trivia.

#### Acceptance Criteria
1. WHEN the operator runs `bun run ops:db-backup [--env <file>] [--out-dir <dir>]` THEN the system SHALL invoke `pg_dump` in custom format (`-Fc`) against the resolved `DATABASE_URL` and SHALL exit 0 only when pg_dump exits 0.
2. WHEN a backup runs THEN it SHALL write to a fresh, timestamped run directory `<outDir>/<UTC-YYYYmmddTHHMMSSZ>/` (default out dir: `<repo>/backups/`) and SHALL NOT overwrite any prior run directory.
3. WHEN `pg_dump` is not on PATH or its major version is older than the server major THEN the system SHALL exit 2 with an actionable message (install/upgrade instructions per runbook).
4. WHILE the backup runs THEN progress output SHALL be printed to stdout without credentials (REQ-030), with a completion line carrying artifact path, byte size, and SHA-256.

#### Additional Details
- **Priority**: High · **Complexity**: Medium · **Dependencies**: REQ-026 env bootstrap, REQ-042 lock · **Assumptions**: operator has read access to production-shaped DSN; `pg_dump` available in operator environment (runbook documents install).

### REQ-011: Backup Manifest

**User Story:** As the Platform Operator, I want every backup to carry a machine-readable manifest, so that restores are verifiable and an off-site uploader (D-003) can be added later without changing the producer.

#### Acceptance Criteria
1. WHEN a backup completes THEN the system SHALL write `manifest.json` into the run directory containing: `tool` name, `toolVersion`, `postgresServerVersion`, `pgDumpVersion`, `database` (name only), `startedAtUtc`, `finishedAtUtc`, `artifactFile`, `artifactBytes`, `sha256`, and `journalHash` (SHA-256 over `backend/drizzle/` journal listing).
2. WHEN the manifest is written THEN host, user, and password portions of the DSN SHALL be redacted in every field (REQ-030).
3. IF manifest writing fails THEN the backup run SHALL be reported as failed (exit 2) — an unverifiable backup is not a backup.
4. WHEN a manifest exists THEN its JSON SHALL round-trip parse in tests (schema-shape assertion).

### REQ-012: Backup Consistency

**User Story:** As the Admin, I want backups to be internally consistent even while users book sessions, so financial rows never restore half-written.

#### Acceptance Criteria
1. WHEN a backup runs THEN `pg_dump` SHALL execute with single-snapshot semantics (default for a single-connection custom dump) so the dump is consistent as of one point in time.
2. WHEN the runbook is written THEN it SHALL state that no application pause is required and explain the shared-lock footprint (REQ-042).
3. IF production runs Neon THEN the runbook SHALL also document Neon-native snapshots/PITR as the complementary layer (D-001 console-side, documented).

### REQ-013: Backup Failure Surfacing

**User Story:** As the Platform Operator, I want failed backups like "disk full" or "auth refused" to scream instead of whisper, so a week's silent failures can't accumulate.

#### Acceptance Criteria
1. IF `pg_dump` exits non-zero THEN the script SHALL exit 1, print the captured stderr tail (credentials stripped), and SHALL NOT write a success manifest.
2. IF the artifact is zero bytes after exit 0 THEN the script SHALL treat it as failure (exit 1).
3. WHEN a run fails THEN the partial run directory SHALL be retained with a `_FAILED` suffix marker (never auto-deleted silently) so postmortems have evidence; the lock SHALL be released either way.

### REQ-014: Artifact Hygiene

#### Acceptance Criteria
1. WHEN a backup is written THEN its path SHALL be confined under the out dir (default `<repo>/backups/`), which SHALL be git-ignored (`/backups/` entry asserted by test, REQ-033).
2. WHEN artifacts are written THEN file modes SHALL be `0600` (owner-only) for both dump and manifest.
3. IF `--out-dir` points outside the repo or at a system path THEN the script SHALL still confine all writes within that directory and warn once if it is not locally disposable storage.

### REQ-024: Idempotent & Repeatable Runs

1. WHEN the same command runs twice THEN each run SHALL produce its own timestamped run directory and SHALL NOT require deleting prior output.
2. IF two invocations collide on the same second THEN a collision suffix SHALL disambiguate run directories deterministically.

### REQ-026: Environment Bootstrap Convention

1. WHEN scripts boot THEN they SHALL reuse `scripts/dbActions/envFile.ts` (`applyEnvFile`) and `--env <file>` flag semantics identical to existing `scripts/ops/*` scripts; `.env`, `.env.sqlite`, and CI env files SHALL behave identically to existing ops commands.
2. WHEN `DATABASE_URL` is absent THEN the script SHALL exit 2 with `[env]` tag, never attempt a default connection.

### REQ-027: Help & UX Parity

1. WHEN invoked with `--help` THEN each script SHALL print usage, every flag, exit-code contract, and one copy-pasteable example, matching the layout of `scripts/ops/sweep-expired-link-requests.ts --help`.

## Core Requirements: Restore & Verification (REQ-015..REQ-019, REQ-025)

### REQ-015: Restore to Scratch/Staging

**User Story:** As the Platform Operator, I want a one-command restore into an isolated scratch database, so I can rehearse recovery without touching production.

#### Acceptance Criteria
1. WHEN the operator runs `bun run ops:db-restore-verify -- --from <runDir|artifact> --target <dsn> [--yes-i-understand]` THEN the system SHALL restore via `pg_restore --clean --if-exists --no-owner --no-privileges` into the explicitly-provided target.
2. WHEN `--from` is a run directory THEN the artifact SHA-256 SHALL be recomputed and compared against `manifest.json` BEFORE any restore begins; mismatch SHALL exit 1.
3. IF `--target` is omitted THEN the script SHALL exit 2 — there is intentionally no "default target".

### REQ-016: Production-Target Refusal

1. WHEN the target DSN is assessed THEN the script SHALL evaluate it through `assessDestructiveDbCommandSafety()` (existing `scripts/lib/destructiveDbGuard.ts`, G-04) using the *target* DSN as the assessed environment.
2. IF the assessment reports a production signal (NODE_ENV=production, neon/managed host, Upstash/GCP markers per the guard) THEN restore SHALL be refused with exit 2 and the guard's formatted block message, and NO `pg_restore` process SHALL be spawned (spy-asserted in tests).
3. WHEN the guard passes AND the session is non-interactive THEN the explicit `--yes-i-understand` flag SHALL still be required (double-gate: automated guard + human/flag acknowledgment).

### REQ-017: Structural Verification

1. WHEN a restore completes THEN the verifier SHALL assert all expected tables exist in the scratch DB, comparing against the `pg_catalog` inventory of the *source-known* table list derived from `backend/db/schema/` table names (no hardcoded drift-prone list without a derivation note).
2. WHEN row counts are checked THEN invariant-critical tables — `users`, `wallets`, `wallet_transactions`, `sessions`, `session_requests`, `audit_logs`, `notifications`, `parent_link_requests` — SHALL be reported individually; a source-non-empty table restored to 0 rows SHALL fail verification.
3. WHEN migration state is compared THEN the scratch's last applied `__drizzle_migrations` entry SHALL equal the backup-time expectation recorded via the manifest `journalHash` correspondence, with drift reported as FAIL.

### REQ-018: Invariant Oracle Verification

**User Story:** As the Admin, I want the restored database re-proven against the platform's own invariants, so "it restored" means "it's safe to serve".

#### Acceptance Criteria
1. WHEN verification runs THEN the system SHALL execute the oracle registry (plan §4.3): wallet non-negativity (INV-W*), wallet-transaction referential integrity (INV-W*), session-hold/balance-lane integrity (INV-B*), audit-log actor integrity (A.5/INV-U*), soft-deleted history retention (INV-U4/U5), session-request referential integrity (workflow 02), and migration-hash match (REQ-017).
2. WHEN an oracle runs THEN it SHALL be a read-only `SELECT` predicate returning pass/fail + offending-row count, never mutating the scratch DB.
3. WHEN any oracle fails THEN the overall verdict SHALL be `FAIL` and the report SHALL name the failing oracle ids with counts.
4. WHEN a new invariant lands in `docs/specs/state-machine-invariants.md` THEN adding an oracle SHALL be a pure data-append to the `ORACLES` registry (no control-flow edits).

### REQ-019: Restore Evidence Report

1. WHEN verification completes THEN the system SHALL write `restore-report.json` (manifest echo, re-verified artifact hash, redacted target db name, start/duration, structural table results, per-oracle results, final verdict) into the run directory AND print a human summary ending in `VERDICT: PASS|FAIL` plus the absolute report path.
2. WHEN the report exists THEN it SHALL be consumable by DEV3-026 as §7.2/7.3 evidence (report path + verdict are the evidence interface).
3. WHEN the artifact hash in the report differs from the manifest hash THEN the report itself SHALL be treated as FAIL (tamper-evident self-consistency).

### REQ-025: Zero Production Mutation

1. Under ALL invocation modes THEN the scripts SHALL perform zero writes against the source database (pg_dump is read-and-snapshot; no maintenance SQL is run against the source), and restore SHALL only ever target the guard-approved `--target`.

## Requirement: RPO/RTO, Scheduling & Runbook (REQ-020..REQ-023, REQ-028)

### REQ-020: RPO Definition

1. WHEN the runbook is published THEN it SHALL define **RPO = 1 hour** (ratifying PRODUCTION_READINESS §7.5's example) and SHALL describe the mechanism achieving it: hourly scheduled logical backups (scripted here) and/or Neon PITR window (D-001, console-side).

### REQ-021: RTO Definition

1. WHEN the runbook is published THEN it SHALL define **RTO = 4 hours** (ratifying §7.4's example), SHALL include a step-timed recovery procedure, and SHALL record the measured drill duration as outcome evidence proving the 4-hour bound is achievable.

### REQ-022: Disaster Drill

1. WHEN the documented drill is executed against scratch infrastructure THEN every step SHALL be executable verbatim by an operator who has never performed it, terminating in a `VERDICT: PASS` report; any step requiring undocumented knowledge SHALL be treated as a runbook defect.
2. WHEN the drill completes THEN the measured wall-clock duration SHALL be filed in `outcome/` as RTO evidence.

### REQ-023: Scheduling Guidance

1. WHEN the runbook documents scheduling THEN it SHALL provide a copy-pasteable cron/systemd-timer example for hourly+daily backups and cite Neon snapshot settings (D-001), satisfying PRODUCTION_READINESS §7.1's "verify backup schedule" with a concrete documented schedule (the CI-cron automation itself remains D-002).

### REQ-028: Documentation Linkage

1. WHEN the runbook lands THEN root `AGENTS.md` Important References SHALL gain a one-line pointer to `docs/ops/disaster-recovery.md`, and `docs/planning/PRODUCTION_READINESS.md` references SHALL be noted in the outcome — but flipping §7 checkboxes remains DEV3-026's exclusive authority.

### REQ-029: Script Registration

1. WHEN scripts land THEN `package.json` SHALL register `ops:db-backup` and `ops:db-restore-verify` adjacent to the existing `ops:*` block, and the runbook SHALL use those exact invocations verbatim.

---

## Requirement: Security & Tenancy (REQ-030..REQ-033)

**User Story:** As the Admin, I want backup artifacts — which contain every user's PII and financial history — handled with at least the same paranoia as the live DB, so a DR exercise can't become a breach.

### Acceptance Criteria
1. WHEN any output is produced (stdout, manifest, report, error) THEN raw `DATABASE_URL`, passwords, or DSN userinfo SHALL never appear — Tier-4 tests SHALL grep captured streams for the password substring (REQ-030).
2. WHEN restore arguments are parsed THEN no default target SHALL exist and no positional-DSN shortcut SHALL bypass `--target` + `--yes-i-understand` — BOPLA-analogue for operator input (REQ-031).
3. WHEN app actors are considered THEN NO application role (including SUPER_ADMIN) SHALL be able to trigger backup/restore through UI/API — BFLA by absence (no surface exists; REQ-032).
4. WHEN artifacts persist THEN modes SHALL be 0600 and the `.gitignore` entry SHALL be test-asserted; runbook SHALL forbid copying dumps into deploy artifacts, Docker layers, or VCS (REQ-033).
5. IF sub-agents implement shared helpers THEN no helper SHALL accept a DSN and evaluate a *different* DSN for safety (TOCTOU-safe single-variable rule, plan §4.4).

## Requirement: Atomicity, Concurrency & Integrity (REQ-040..REQ-042)

1. WHEN a backup writes THEN it SHALL stage into a `tmp-<pid>-<ts>` directory and atomically rename to the final run directory only after dump+manifest succeed — watchers never see half-written runs (REQ-040).
2. WHEN restore targets a scratch DB THEN either a freshly-created DB or `--clean --if-exists` semantics SHALL be used; a failed restore SHALL leave the scratch DB droppable without production impact (REQ-041).
3. WHEN a backup starts THEN a run-directory lockfile `<outDir>/.lock-<pid>` SHALL prevent a second concurrent backup on the same host; stale locks SHALL be detected via PID-liveness and reclaimed with a warning (REQ-042).

## Requirement: Error & Exit-Code Contracts (REQ-050..REQ-052)

1. WHEN scripts exit THEN codes SHALL be: `0` success · `1` operational failure (tool error, verification mismatch) · `2` usage/guard refusal — matching `scripts/dbActions/cli-entry.ts` and `scripts/ops/*` precedent (REQ-050).
2. WHEN failures print THEN messages SHALL carry a bracketed tag — `[env]`, `[guard]`, `[pg_dump]`, `[pg_restore]`, `[verify:<oracle-id>]` — and unexpected throws MAY print a stack but SHALL strip credentials first (REQ-051).
3. WHEN conventions are documented THEN the runbook SHALL record the operator-English stdout i18n exemption (REQ-052), mirroring REQ-000.5.

## Requirement: GraphQL & Frontend Contracts

**N/A by design.** Zero GraphQL operations, zero UI routes, zero sharedDocuments changes. Phase-0 grep + tree inspection confirmed no DR surface exists to extend in `backend/graphql/`, `frontend/`, or `app/`. This is a deliberate BFLA hardening decision (never let the app trigger backups), not an omission. Any future admin "backup status" widget is a new ticket and MUST go through full spec-driven planning.

## Requirement: Test Coverage (REQ-060..REQ-062)

### REQ-060: Unit Tests (4-Tier)

1. WHEN unit tests land (colocated `scripts/ops/*.test.ts` per G-07) THEN they SHALL cover: arg parsing matrix (Tier 1 branch/statement); boundaries — empty dump, zero-byte artifact, zero-row tables, extreme timestamps, missing manifest keys (Tier 2); chaos — truncated/garbage artifacts, random DSN shapes, `pg_dump` exiting with arbitrary codes, concurrent lock races via `Promise.allSettled` (Tier 3); security — credential-leak greps over every captured output channel, guard refusal matrix (prod-shaped env vars, neon hosts), `--target`-omission refusal, spawn-not-called-on-refusal spies (Tier 4).
2. WHEN tests stub external binaries THEN a `spawn` injection seam SHALL be used; real binaries are exercised only by the integration test (REQ-061).

### REQ-061: Integration Test (drill chain)

1. WHEN the integration test runs THEN it SHALL: create an isolated scratch DB (`kottaby_dr_it_<ts>`), push schema + seed minimal fixtures covering every REQ-017 table and each oracle domain, run the REAL backup script, run the REAL restore-verify against the scratch DB, and assert `VERDICT: PASS` with a well-formed report; then SHALL tamper one artifact copy and assert FAIL.
2. LAYER RULE: `runInRollback` is NOT applicable to OS-level dump/restore (it cannot wrap `pg_dump`); instead the test SHALL create the scratch DB in `beforeAll` and drop it in `afterAll` — a documented, tests-instructions-compliant deviation recorded in the outcome.
3. WHEN executed THEN it SHALL run via `bun run test/scripts/run-test.ts <path>` (log capture), per root AGENTS.md (REQ-062).

## Requirement: Documentation & Knowledge Gates (REQ-070..REQ-072)

1. WHEN the runbook lands THEN `docs/ops/disaster-recovery.md` SHALL follow the repo docs template (summary · Why · The Pattern · Rules · What NOT to Do · Rollout · Related Documents) and SHALL contain: RPO/RTO definitions, scheduling guidance, the step-timed recovery runbook, the drill procedure, Neon/PITR appendix evidence, deferred-item acknowledgements (D-001..D-003) (REQ-070).
2. WHEN knowledge propagates THEN root `AGENTS.md` Important References SHALL gain exactly one line referencing the runbook; if the plan surfaces any durable ops-script rule (e.g., "operator scripts that mutate a database MUST pass the target DSN through `assessDestructiveDbCommandSafety`"), it SHALL be added to the appropriate AGENTS.md/instructions file in rule form only (no code) (REQ-071/072).
3. WHEN the plan closes THEN `deferred-items.md` SHALL contain no ❌/❌-equivalent unresolved rows, and every 📅 Forward row SHALL name its owning ticket.

---

## UX / Navigation Requirements (MANDATORY section — resolved as N/A)

| Aspect | Decision | Evidence |
|---|---|---|
| New routes | None | No UI surface (BFLA-by-absence, REQ-032) |
| Sidebar / navItems | Unchanged | `frontend/views/dashboard/navItems.ts` untouched |
| Role-based access | All in-app roles: N/A | Backup/restore are shell-only operator capabilities |
| Mobile/nav-bottom | N/A | No UI |

This table satisfies the mandatory UX/Navigation gate by **documented negation** rather than omission-by-silence; Phase-0 verified no DR UI exists to extend.

## Cross-Actor Workflow Scenarios (Journeys) — RULING: NOT APPLICABLE

**Verdict:** single-actor operational tooling over a read-only snapshot of production and an isolated scratch DB; no shared *domain* state is mutated by 2+ roles. Required-condition for journeys (2+ actors over shared state) is unmet.

**Actor Table (operational actors, documented for completeness):**

| Actor | Role/Surface | Can Do | Cannot Do |
|---|---|---|---|
| Operator | shell + prod DSN | backup; restore-verify to scratch; read reports; run drill | target production for restore (guard, REQ-016); publish unverified artifacts (REQ-019) |
| Admin | in-app role | view runbook; consume drill evidence | trigger backup/restore via app (no surface, REQ-032) |
| CI runner (future) | scheduled job (D-002) | run verify on schedule | write production |
| DEV3-026 executor | launch checklist | consume runbook + reports | ratify §7 without evidence |

**Negative steps enforced by design:** app-triggered backup (denied — no surface); restore-to-production (denied — guard); restore without explicit target (denied — arg contract).

**Consequence:** no `test/workflows/<domain>/<journey>.test.ts` is created; the end-to-end chain is carried by the REQ-061 integration test + REQ-022 human drill. If post-implementation reviewers dispute, escalate via `deferred-items.md` (escalation row) — never silently add a fake journey test.

---

## Non-Functional Requirements

### Performance
1. WHEN a backup runs against the expected production data volume (< 5 GB at launch) THEN the run SHALL complete in under 15 minutes (observed during drill; recorded in outcome).
2. WHEN restore-verify runs THEN the full chain SHALL fit inside the 4-hour RTO budget with ≥ 50% headroom (drill-measured).

### Security
- (Covered by REQ-030..033: credential redaction, artifact perms, no app surface, guard refusal.)

### Usability
1. WHEN a new operator runs the drill cold THEN zero undocumented steps SHALL be needed (REQ-022 drill criterion doubles as the usability gate).

### Reliability
1. IF a backup host crashes mid-run THEN the next scheduled run SHALL succeed without manual cleanup beyond stale-lock reclamation (REQ-040/042).
2. WHEN verification cannot complete (e.g., scratch DB unreachable) THEN the script SHALL exit 1 with `[pg_restore]`/`[verify]` tag — never print PASS.

## Constraints and Assumptions

### Technical Constraints
- Postgres is the only DR-supported dialect; SQLite is dev-only (G-05); backup binaries must exist on the operator host.
- `pg_dump` major version ≥ server major (toolchain probe documented in runbook).
- No shell injection surface: all process spawns use argv arrays (`Bun.spawn`), never composed shell strings.

### Business Constraints
- Sprint 4, 5 SP; `Blocked By: none`; must land before DEV3-026 sign-off.
- Launch checklist §7 flips only via DEV3-026 — this ticket produces evidence, not checkbox authority.

### Assumptions
- Production is Neon-managed Postgres (per `.env.example` + migrations doc); an equivalent self-hosted Postgres satisfies the same flow.
- Scratch/staging Postgres is reachable for drills (local Docker or a Neon branch is acceptable; runbook covers both).
- Operator hosts are trusted, access-controlled machines; artifact repository security (off-site) is D-003.

## Success Criteria

### Definition of Done
- [ ] All acceptance criteria above satisfied with tests green.
- [ ] Drill executed once end-to-end with PASS verdict and duration evidence filed.
- [ ] Runbook linked from root AGENTS.md; deferred ledger clean or explicitly forwarded.
- [ ] `bun quality-gate` green from Phase-0 baseline.

### Acceptance Metrics
- `VERDICT: PASS` report exists from the drill run; measured RTO ≤ 4 h with ≥ 50% headroom; test coverage of new scripts at Tier-1 100% branch; zero credential substrings found by Tier-4 greps.

## Glossary

| Term | Definition |
|---|---|
| RPO | Recovery Point Objective — max tolerable data-loss window (defined: 1 hour) |
| RTO | Recovery Time Objective — max tolerable downtime (defined: 4 hours) |
| Run directory | Timestamped `backups/<UTC>/` holding one backup's artifact + manifest (+ restore report) |
| Manifest | `manifest.json` — machine-readable backup provenance + integrity record |
| Oracle | Read-only SQL predicate mapping one state-machine invariant onto restored data |
| Guard | `scripts/lib/destructiveDbGuard.ts` production-signal assessment |
| Drill | Full human execution of the runbook against scratch infra, timed |

## Cross-Layer Traceability Matrix

| REQ | Invariant/Anchor | Producer file(s) | Entry | UI | Tests |
|---|---|---|---|---|---|
| REQ-000, 000.5 | repo conventions | all new files | n/a | n/a | process-gated via outcome files |
| REQ-010..014, 024, 026, 027 | A.4/A.5 tables covered by dumps | `scripts/ops/backup-database.ts` | `bun run ops:db-backup` | n/a | `scripts/ops/backup-database.test.ts` + integration |
| REQ-015..019, 025, 040..042 | INV-W*/B*/U* oracles | `scripts/ops/restore-verify.ts` (consumes `scripts/lib/destructiveDbGuard.ts`) | `bun run ops:db-restore-verify` | n/a | `scripts/ops/restore-verify.test.ts` + integration |
| REQ-020..023, 028 | PRODUCTION_READINESS §7.1–7.5 | `docs/ops/disaster-recovery.md` | operator reads | n/a | REQ-022 drill + doc review |
| REQ-029 | repo script conventions | `package.json` | `bun run ops:*` | n/a | package-scripts shape test |
| REQ-030..033 | guard + secrets rules | both scripts + `.gitignore` | n/a | n/a | Tier-4 security tests |
| REQ-050..052 | ops-script precedent | both scripts | exit codes | n/a | unit exit-code matrix |
| REQ-060..062 | testing conventions | colocated `*.test.ts` | `test/scripts/run-test.ts` | n/a | self |
| REQ-070..072 | docs template + AGENTS policy | `docs/ops/disaster-recovery.md`, root `AGENTS.md` | n/a | n/a | Phase-7 checklist |

## Requirements Review Checklist (author self-certification)

- [x] All roles addressed (operator primary; in-app roles explicitly denied; DEV3-026 consumer).
- [x] Normal, edge, error cases covered (happy path + failure surfacing + chaos tiers).
- [x] Requirements are testable/measurable (exit codes, verdicts, countdowns, hashes).
- [x] No conflicting requirements (single-writer scripts; guard single-variable rule).
- [x] EARS format used (WHEN/IF/WHILE + SHALL).
- [x] Cross-actor journeys evaluated and ruled N/A with justification.
- [x] UX/Navigation section present (negation-documented).
- [x] Ground-truth Phase-0 table distinguishes CREATE vs CONSUME for every anchor.
