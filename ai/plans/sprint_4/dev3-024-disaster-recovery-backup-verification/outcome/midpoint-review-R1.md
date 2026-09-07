# Mid-Point Review Gate — R1 (DEV3-024, after Phases 2-4)

**Scope:** `git diff ffce457..HEAD` minus plan artifacts — 12 scripts/ops source files + 4 test files + package.json + .gitignore.
**Reviewers dispatched (parallel, independent):** review-backend, review-types, review-config/security.
**Baseline filter:** Phase-0 baseline was fully green (tsgo 0 / biome 0 / lint clean / git clean) → every finding below is feature-new.

## Round 1 — aggregated findings (15, deduplicated across reviewers)

| # | Severity | File:loc | Finding |
|---|---|---|---|
| 1 | CRITICAL | restore-oracles.ts:108 | OR-MIG compared incompatible hash domains (drizzle per-migration sql hash vs directory-aggregate journalHash) → every real restore would FAIL; unit tests masked via injected stdout |
| 2 | HIGH | restore-guard.ts:43 | Guard host-analysis silently skipped for non-URL (keyword/value conninfo) targets → prod-shaped conninfo could reach pg_restore |
| 3 | MEDIUM | restore-shared.ts:121 | Weaker `scrubDsnSecrets` duplicated instead of reusing `_shared.ts` (2 reviewers) |
| 4 | MEDIUM | restore-shared.ts:63 | Full parent env passed to children vs backup's explicit allowlist (2 reviewers) |
| 5 | MEDIUM | restore-structure.ts:120 | Critical-table count errors failed OPEN (sentinel -1 + absent source context → ok=true) |
| 6 | MEDIUM | restore-oracles.ts:172 | Value-oracle path hardcoded journalHash expectation → registry data-append contract held only for count oracles |
| 7 | LOW | restore-shared.ts:156,171 | Duplicated manifest contract/sha256File; widened tool type; phantom `journalHash:"none"` branch |
| 8 | LOW | backup-database.ts:315+ | `[backup]` tag outside plan tag set on error paths |
| 9 | LOW | backup-lock.ts:138 | EEXIST race reported holderPid = selfPid (misleading diagnostics) |
| 10 | LOW | restore-verify.ts:120 | Env-bootstrap failure detail printed unscrubbed |
| 11 | LOW | backup-cli.ts:25 | Unreachable `arg ?? ""` |
| 12 | LOW | restore-cli.ts:42 | "(got none)" message wrong when flag-like value present |
| 13 | LOW | backup-artifacts.ts:40 | manifestProblems consumed only by tests, not production publish path |
| 14 | LOW | restore-verify.ts:265 | evaluateVerdict hardwired hashesMatch=true (pre-spawn gate enforced equality anyway) |
| 15 | LOW | .gitignore / env resolution | check-ignore bare-path caveat + cwd-relative `--env` — accepted-as-documented (runbook notes) |

## Fix round 1

All fixes F1-F14 applied by fix subagent; live-chain acceptance run: real backup of `app_db` → journalHash 64-hex `bb5cd7ab…` → restore-verify into scratch `mpv_scratch` → **VERDICT: PASS** (24/24 structural, 7/7 oracles); guard conninfo probe `host=prod-db.rds.amazonaws.com dbname=x` → exit 2 zero spawns. Two additional live-discovered defects fixed en route: `migrationFolderNames.reverse()` → `.toReversed()`; OR-MIG psql single-statement `to_regclass` planner failure on push-managed DBs → data-driven absence ladder (`fallbackSql`/`absentValue`).

## Round 2 (re-review) — 3 new findings, all fixed

| Severity | File | Finding → Resolution |
|---|---|---|
| MEDIUM | restore-guard.ts | conninfo first-occurrence extraction vs libpq last-wins → duplicate-key decoy bypass. Fixed: libpq-faithful last-occurrence + BOTH host/hostaddr assessed in any token order + malformed-host URL round-trip refusal. (Blanket duplicate-key refusal rejected as libpq-unfaithful; effective-host assessment closes the bypass — accepted by orchestrator.) |
| LOW | restore-oracles.ts | absence ladder descended on ANY error → fail-open on degraded targets. Fixed: ladder gated on SQLSTATE 42P01 only (`--set=VERBOSITY=verbose` added so SQLSTATE is observable); all other errors fail closed. |
| LOW | plan.md/specs.md | stale journalHash wording → synced to implemented trailing-migration derivation (doc-only). |

## Round 3 (confirmation re-review)

F-verdicts: guard **OK**, oracles **OK**, tests/typecheck **OK** (45 restore tests pass incl. new tier-4: last-wins, both-values, malformed-host refusal, 42P01-only ladder, non-42P01 fail-closed). **NO NEW FINDINGS.**

## Final state

- Tests: 138 pass / 0 fail across 4 ops suites (997 assertions)
- QL: sub-loop duplicates exit 0 on all touched files; tsgo 0; biome clean
- Live acceptance: backup → restore-verify **VERDICT: PASS** via both URL-form and conninfo-form targets; negative probes (managed conninfo host, malformed host) → exit 2 `[guard]`, zero spawns

**GATE VERDICT: PASSED** (3 rounds: 15+3 findings found, 18 fixed, 0 remaining; accepted-as-documented items: #15 + INFO exhaustiveness note).
