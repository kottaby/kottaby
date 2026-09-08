# Phase 0 Baseline Outcome — DEV3-012 Dual-Confirmation Completion Handshake

**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Task:** 0 (Baseline + ledger) · **Date:** 2026-09-05 · **Agent:** Phase 0 Baseline Subagent
**Requirement:** REQ-0 (Pre-Implementation Baseline & Execution Protocol)

---

## Quality Baselines (captured exactly per tasks.md Task 0 commands)

| Check | Command | Baseline Result | Artifact |
|---|---|---|---|
| tsgo typecheck | `bun tsgo 2>&1 \| grep -c "error TS" > /tmp/baseline-tsgo.txt` | **0 errors** (verified: script exited 0 on a re-run; raw log at `/tmp/baseline-tsgo-raw.log` shows the process-lock acquired/released cleanly and zero `error TS` lines — `tsgo -b --noEmit` prints nothing on success) | `/tmp/baseline-tsgo.txt` |
| Biome check | `bun biome:check 2>&1 \| grep -c warn > /tmp/baseline-biome.txt` | **0 warnings** (biome itself reported `Checked 1419 files in 11s. No fixes applied.`; grep count 0, grep exit 1 = no matches) | `/tmp/baseline-biome.txt` (raw: `/tmp/baseline-biome-raw.log`) |
| lint-service | `bun run scripts/lint-service.ts --json --id baseline > /tmp/baseline-lint.json` | **success: true, exitCode: 0**, scope `full-repo`, fileCount 0, durationMs ≈ 78.9s | `/tmp/baseline-lint.json` |

Parsing note for future agents: `/tmp/baseline-lint.json` contains 3 `[process-lock]` banner lines **before** the JSON body (the lock harness writes to stdout). The JSON object starts at line 4. `fileCount: 0` is what the tool reported for a passing full-repo run — treat `success: true` / `exitCode: 0` as the pass signal, not fileCount.

## Git Baseline

- **Current branch:** `feat/dev3-012-dual-confirmation-completion-handshake` (exists; see environment note below about sandbox HEAD resets)
- **HEAD sha:** `ffce4571ffdcef2c7704bbdd808da5282679da9a` — same commit as `origin/main` (`chore(cleanup): unused-code cleanup and quality gate to full green (clean_unused plan) (#73)`); the feature branch was created from this commit and both point at the identical tree.
- **`git diff --name-only`:** *empty* (no modified tracked files) → `/tmp/baseline-files.txt`
- **`git status --porcelain`:** *empty* → `/tmp/baseline-status.txt`
- **`git stash list`:** *empty* → `/tmp/baseline-stash.txt`

### Porcelain-expectation reconciliation (important)

The task brief expected porcelain to show `.env` / `.env.sqlite` / `.env.test` / `db/` untracked artifacts and worklog/plan-dir modifications. Actual state is **clean** because all of those are ignored or tracked:

- `.env`, `.env.sqlite`, `.env.test` → ignored by `.gitignore:59` (`.env*`)
- `db/pglite/` (PGlite data dir) → ignored by `.gitignore:84` (`/db/`); `db/schema.dbml` is upstream-tracked and unmodified
- `worklog.md` → ignored by `.gitignore:101` (`/worklog.md`)
- The plan directory itself (`ai/plans/sprint_2/dev3-012-...`) is **upstream-tracked** (committed in `53b11d0 plan: add new plans (#56)`), so it does not appear as untracked

Conclusion: git baseline is genuinely clean; there are zero pre-existing working-tree modifications. The only expected diff after Tasks 1–6 is implementation-authored content plus plan outcome-file/checkbox edits (outcome files are inside the tracked plan dir and will show as modified/untracked, which is expected and allowed).

## Deferred-Items Ledger Verification

`deferred-items.md` **exists** in the plan directory (1751 bytes). Ledger rows confirmed:

| ID | Item | Target | Status |
|---|---|---|---|
| D1 | Dispute from `completed` state (ticket AC 4 literal reading; design ruling D-DEV3-012-2) | DEV3-021 admin arbitration UX | ❌ Blocked (by design) |
| D2 | Wallet-side accounting depth / A1 payout reporting | DEV3-013 (Fee Escrow) | 🔄 Out-of-plan |
| D3 | Teacher notification of completed confirmation (not in REQ-5 ACs) | future polish ticket | ❌ Blocked (not in ACs) |

All three are cross-ticket ownership rows recorded by design; none are unresolved work of this plan. Task 6 enforcement (`grep -c "❌\|⚠️"` → 2, both intentional) is pre-acknowledged here so the final gate is not surprised.

## Pre-Existing Issues to IGNORE During Post-Implementation Review

- **Zero pre-existing tsgo errors** — any `error TS` after implementation is new and must be fixed.
- **Zero pre-existing Biome warnings** — any `warn` line after implementation is new (note `biome:check` runs with `--write --unsafe`; if it ever applies fixes, files will show as modified — after this baseline it reported "No fixes applied" and left the tree clean).
- **lint-service is green at baseline** — any lint-service failure after implementation is new.
- Non-issue observations (record, don't "fix" later): `[WARN] [PglitePool] initializing PGlite at ./db/pglite (DB_PROVIDER=pglite)` printed by repo tooling at startup is expected in this environment; `grep -c` returning shell exit 1 on zero matches is expected in the baseline pipelines.

## Environment Facts

- **DB_PROVIDER=pglite** in both `.env` (PGLITE data dir `./db/pglite`) and `.env.test` (isolated `./db/pglite-test`, `TEST_SERVER=1`, `TEST_CI=1`). `.env.sqlite` exists as a mirror of `.env` (repo db CLI requires a postgres-shaped `DATABASE_URL` even in pglite mode).
- **Migrations applied:** all 4 migration folders (24/24 tables, custom functions + immutability triggers verified per worklog).
- **Seed applied:** `bun db seed` completed successfully, `SEED_PROFILE=standard` (admin `admin@test.com` / `12345678`). Note: db CLI `migrate`/`seed` complete but hang before exit — run with timeout/background and verify by querying.
- **Dev server running:** `bun run dev` (Next.js 16.3.4 turbopack) on port 3000 — re-verified during this task: `GET / → 200`, `GET /login → 200`.
- **bun** 1.3.14 at `/usr/local/bin/bun` on PATH.

## Environment Quirk — Sandbox HEAD Reset (carry-forward for Tasks 1–6)

This sandbox automatically checks out `main` between external tool invocations (verified via `git reflog`: repeated `moving from feat/... to main` entries not caused by any repo script or hook — repo scripts contain no checkout logic; `.husky` hooks don't fire here). The checkout is a no-op on content because the feature branch and `main` are at the identical commit `ffce457` with a clean tree.

**Rule for all later tasks:** before any `git commit`, explicitly run `git checkout feat/dev3-012-dual-confirmation-completion-handshake && git branch --show-current` in the same command batch as the commit to guarantee the commit lands on the feature branch. Verify with `git branch --show-current` after committing.

## Summary

Baseline is fully green: tsgo 0 errors, Biome 0 warnings, lint-service success, git tree clean at `ffce457` with no stashes. Any deviation from these numbers after implementation is attributable to Tasks 1–6 and must be justified or fixed. Ready to begin Task 1 (repo primitive) and Task 2 (notification waves) in parallel.
