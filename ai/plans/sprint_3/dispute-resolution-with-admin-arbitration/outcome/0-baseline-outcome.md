# Task 0 — Pre-Implementation Baseline & Ledgers

**Task ID:** 0 · **Plan:** `ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/`
**Date:** 2026-09-11 · **Agent:** general-purpose subagent (baseline capture, read-only run)
**Working tree at start:** clean (fresh clone state)

---

## Baseline Counts

| Check | Command | Result | Exit |
|---|---|---|---|
| TypeScript (tsgo) | `bun tsgo` (→ `restore-next-env-dts.ts` + `tsgo -b --noEmit` under process-lock) | **0 errors** (`grep -c "error TS"` = 0) | 0 |
| Biome | `bun biome:check` (`biome check --write --unsafe .`) | **0 warnings** (`grep -c "warn"` = 0); `Checked 1777 files in 13s. No fixes applied.` | 0 |
| Lint | `bun run scripts/lint-service.ts --json --id baseline` | **pass** — JSON: `success: true`, `exitCode: 0`, `scope: full-repo`, `fileCount: 0`, duration ~112s, empty findings | 0 |
| Quality gate | **SKIPPED BY INSTRUCTION** (known OOM risk in ~4GB sandbox) | not run — to be judged at Task 6.1 | n/a |

Baseline artifact files written:

- `/tmp/baseline-tsgo.txt` → `0`
- `/tmp/baseline-biome.txt` → `0`
- `/tmp/baseline-lint.json` → raw JSON output of lint-service (`--id baseline`)
- `/tmp/baseline-lint.txt` → exit code + one-line summary
- `/tmp/baseline-files.txt` → `git status --porcelain` + `git diff --name-only` (both empty)
- `/tmp/baseline-stash.txt` → `git stash list` (empty)
- Raw logs kept at `/tmp/raw-tsgo.log`, `/tmp/raw-biome.log`, `/tmp/raw-lint-stderr.log`

## Git Baseline State

- `git status --porcelain` → **empty** (0 entries)
- `git diff --name-only` → **empty** (0 files)
- `git stash list` → **empty**
- `bun biome:check` (with `--write --unsafe`) applied **no fixes** → no restore (`git checkout`) needed; working tree verified clean after the run.

## DB / Env Verification

| Check | Result |
|---|---|
| Postgres connectivity | **PASS** — `/tmp/pg/usr/lib/postgresql/17/bin/psql -h 127.0.0.1 -U postgres -d app_db -c "\dt"` listed tables (`public.admin`, `public.applicants`, …); server at `/tmp/pgdata` (socket `/tmp/pgsock`, port 5432) was left running |
| `.env` DB_PROVIDER | **PASS** — `DB_PROVIDER=postgres` |
| `.env` DATABASE_URL | **PASS** — present; host `127.0.0.1`, port `5432`, db `app_db` (secret-safe check, value not printed) |
| `.env` key presence | **PASS** — both keys found (count = 2) |

## Deferred-Items Ledger Confirmation

`deferred-items.md` exists (created at planning time). Statuses confirmed:

- D1 (dispute time-window) — ✅ Done (planning ruling D-9: no window defined; out of scope)
- D2 (gateway money refunds) — ✅ Done (planning scope ruling; internal ledger value only)
- D3 (student-rates-teacher rows in case review) — ✅ Done (planning ruling D-7; future one-field extension)
- D4 (admin fanout paging) — ❌ **Blocked** (must close in Task 6.1: audit cohort size vs `resolveAudienceIds` bounds)
- D5 (`session-lifecycle.md` doc updates) — 🔄 **In Progress** (closes in Task 6.2)

## Pre-Existing Anomalies Observed

- **None of consequence.** The repository baseline is fully clean: 0 tsgo errors, 0 biome warnings, 0 lint findings, clean working tree.
- No pre-existing type errors exist, so **there is no pre-existing-error filter list** for the review waves — any `error TS` surfaced after Task 2.1 onward is attributable to this plan's changes and must be fixed or explicitly ruled on.
- Notes (not anomalies): `tsgo`/`biome`/`lint` all route through a process-lock wrapper (`scripts/lib/run-locked-cmd.ts`) that emits `[process-lock]` enqueue/acquire/release lines to output — these are expected and were excluded from error/warn counts. `tsgo` also restored `next-env.d.ts` to the canonical dev dist dir (`.next-dev`) without dirtying the tree.

## Files Created / Modified

- Created: `outcome/0-baseline-outcome.md` (this file) + six `/tmp/baseline-*` artifact files.
- Modified source files: **NONE** (baseline is read-only by mandate).

## Carry-Forward Knowledge

1. **Zero-error baseline.** Tasks 2.1–6.1 must keep the tree at 0 tsgo errors / 0 biome warnings; `6.1` diff-vs-baseline is trivially "no new errors" as long as hygiene is kept per-file.
2. **Quality gate not baseline-captured.** `bun quality-gate` was deliberately not run (sandbox ~4GB OOM risk). Task 6.1 must attempt it with awareness that a SIGABRT here is a sandbox limitation, not a regression signal.
3. **Baseline artifacts live in `/tmp`** (`baseline-tsgo.txt`, `baseline-biome.txt`, `baseline-lint.json`, `baseline-lint.txt`, `baseline-files.txt`, `baseline-stash.txt`; raw logs `raw-tsgo.log`, `raw-biome.log`). If the sandbox restarts before 6.1, re-run the three capture commands instead of trusting stale files.
4. **Process-lock wrapper.** All heavy commands (tsgo, biome, lint) serialize via `run-locked-cmd.ts`; concurrent invocations enqueue. Lint took ~112s full-repo — budget time in later tasks.
5. **DB ready for Task 2.1.** Postgres 17 user-space cluster is up on port 5432 with `app_db` populated; `DB_PROVIDER=postgres`. Task 2.1's `bun run db push` can proceed without infra setup.
6. **Ledger discipline.** D4 (blocked) and D5 (in progress) are the only open ledger items; 6.1's exit-criteria grep must be scoped to ledger rows (`grep -E '^\| D[0-9]+' … | grep -c "❌\|⚠️"` = 0).
7. **Biome `--write` safety.** `biome:check` auto-fixes by design; if a future task runs it and dirties files, capture `git diff --name-only` immediately and decide fix-vs-restore — this baseline run required no restore.
