# Task 0.1 Outcome — Baseline & Ledger

**Task:** `0.1 Baseline & Ledger` (Phase 0 — entry gate)
**Date:** 2026-09-17
**Tree state:** pristine checkout at commit `c4971c6924889388b5c52c35d9c45191a94f1e16` ("Plans (#193)")
**Pre-execution read:** `outcome/plan-review-R1.md` read in full (R1 verdict: plan passes all AGENTS.md rules; 20 mechanical findings all fixed and source-verified). Root `AGENTS.md` "Code Quality Workflow" + "Verification Loop" + "Lint Service" sections re-read (0.1.IV ✅).

---

## 1. Baseline Capture — REAL command output (0.1.SR: quoted, never from memory)

All commands run from `/home/z/my-project` with `bun` 1.3.14 (`/usr/local/bin/bun`), BEFORE any edit.

### 1.1 Typecheck — `bun tsgo`

```bash
bun tsgo > /tmp/baseline-tsgo-full.log 2>&1; echo "exit=$?"
# exit=0
grep "error TS" /tmp/baseline-tsgo-full.log | wc -l > /tmp/baseline-tsgo.txt
```

- `/tmp/baseline-tsgo.txt` → **`0`** — **tsgo error count = 0**
- `/tmp/baseline-tsgo-full.log` tail (proves a real full-project run, not a silent bail-out):

```
$ bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit
Restored next-env.d.ts to canonical dev dist dir (.next-dev).
[WARN] [PglitePool] initializing PGlite at ./db/pglite (DB_PROVIDER=pglite)
[process-lock] Enqueued request for "tsgo" (PID: 2408)
[process-lock] Acquired lock for "tsgo" (PID: 2408). Executing...
[process-lock] Released lock for "tsgo" (PID: 2408)
```

### 1.2 Biome — `bun biome:check`

```bash
bun biome:check > /tmp/baseline-biome-full.log 2>&1; echo "exit=$?"
# exit=0
grep -c "warn" /tmp/baseline-biome-full.log > /tmp/baseline-biome.txt
```

- `/tmp/baseline-biome.txt` → **`0`** — **biome "warn" occurrences = 0**
- `/tmp/baseline-biome-full.log` tail:

```
$ bun run scripts/lib/run-locked-cmd.ts biome:check bunx @biomejs/biome check --write --unsafe .
[WARN] [PglitePool] initializing PGlite at ./db/pglite (DB_PROVIDER=pglite)
[process-lock] Enqueued request for "biome:check" (PID: 2472)
[process-lock] Acquired lock for "biome:check" (PID: 2472). Executing...
Checked 2036 files in 14s. No fixes applied.
[process-lock] Released lock for "biome:check" (PID: 2472)
```

- **Did biome modify files? NO** — `Checked 2036 files ... No fixes applied.`; `git diff --name-only` after the run returned **0 files**. `git checkout -- .` was therefore NOT needed; the tree was never dirtied.

### 1.3 ESLint — `bun run scripts/lint-service.ts --json --id baseline`

Command executed verbatim; exit code **0**. `/tmp/baseline-lint.json` (stdout carried 3 `process-lock` lines above the JSON payload — cosmetic, payload intact):

```json
{
  "success": true,
  "output": "",
  "exitCode": 0,
  "metrics": {
    "id": "baseline",
    "scope": "full-repo",
    "fileCount": 0,
    "durationMs": 116536,
    "enqueuedAt": 1789754590157,
    "startedAt": 1789754590157,
    "finishedAt": 1789754706693,
    "queueDepthAtEnqueue": 0
  }
}
```

- **Lint status: PASS** (`success: true`, `exitCode: 0`, `output: ""` = zero ESLint findings, full-repo scope, 116.5s). `--json` + `--id` flags ARE supported by the CLI (`scripts/lint-service-cli.ts:34,36` — `-i, --id <string>`, `--json`) — **no deviation**.

### 1.4 Git state

```bash
git stash list > /tmp/baseline-stash.txt        # → EMPTY (0 stashes)
git diff --name-only > /tmp/baseline-files.txt  # → EMPTY (0 files)
```

- **`git diff --name-only` baseline file count: 0** (expected-empty confirmed). Re-verified after ALL baseline commands: `git status --porcelain | wc -l` → `0`.
- `/tmp` artifacts kept for task 4.2 baseline-compare: `baseline-tsgo.txt`, `baseline-tsgo-full.log`, `baseline-biome.txt`, `baseline-biome-full.log`, `baseline-lint.json`, `baseline-lint-stderr.txt`, `baseline-stash.txt`, `baseline-files.txt`.

## 2. Pre-existing Issues to Ignore During Post-Implementation Review

**None exist — the baseline is fully green** (tsgo 0 errors, biome 0 warns, ESLint clean). There is no recurring error-code inventory to carry. Consequence for tasks 1.1–4.2: **any** tsgo error, biome warning, or ESLint finding observed after implementation is introduced BY that work and must be fixed, never waved off as pre-existing. The Phase-4.2 compare gate is `delta === 0` against the `/tmp/baseline-*` artifacts.

## 3. DB Environment Statement

- `.env` declares **`DB_PROVIDER=pglite`** (project-sanctioned in-process PostgreSQL WASM provider for the sandbox; DATABASE_URL present). The runtime itself corroborates: every command above logged `[WARN] [PglitePool] initializing PGlite at ./db/pglite (DB_PROVIDER=pglite)`.
- Direct probe of the PGlite data dir (`./db/pglite`):
  - `drizzle.__drizzle_migrations` → **20 migration journal entries applied** — migrations green.
  - 25 `public` tables exist; `users` → **4 rows** (seed applied green); `teacher_transaction` exists with 0 rows (clean ledger, as a verification-plan baseline should be).
- This is the project-configured database; no external Postgres is in play.

## 4. Deferred-Items Ledger Verification (D1–D7)

`deferred-items.md` read in full. **All 7 rows (D1–D7) exist** and every row carries all required columns: Source · Target Owner · Status (all 🔄 Open — 5 forward-contracts, 2 rulings) · Verified By (all name the Task 4.1 matrix) · Notes. Row-scoped enforcement grep (the 4.2 gate pattern) returns **0** ❌/⚠️ rows:

```bash
grep -cE '^\| D[0-9]+ .*\| (❌|⚠️) ' deferred-items.md   # → 0  (correct)
grep -cE '^\| D[0-9]+ ' deferred-items.md                # → 7  (D1–D7 all present)
```

Anchor spot-checks against the live tree:

| Row | Anchor checked | Verdict |
|---|---|---|
| D1 | `notification-type.enum.ts:10-18` — 9 members, none withdrawal-related; journey spy anchors `:222-228`/`:429-433` exist (secondary cites per R1 finding 13; the oracle `expectNoDispatches` is `:243-246`) | ✅ accurate |
| D2 | `wallet.service.ts:198-200` — "Each request is a NEW financial instruction … recorded forward item (F11)" verbatim | ✅ accurate |
| D3 | `wallet.service.ts:47-51` — `WALLET_LEDGER_PAGE_LIMIT = 50` at :51 with F10 docblock | ✅ accurate |
| D4 | `backend/types/billing/wallet.types.ts` exports exactly `WalletSelectType` + `WalletViewType` (no Insert/Return shapes) | ✅ accurate |
| D5 | `session-completion-escrow.contract.types.ts` — contract region spans the cited `:14-80` | ✅ accurate |
| D6 | `docs/specs/state-machine-invariants.md:198` INV-W8 says `>= 0` · Drizzle CHECK `teacher_transaction_amount_check` at `teacher-transaction.ts:50` says `> 0` · stale DBML annotation at `db/schema.dbml:372` says `>= 0` | ✅ accurate (all three anchors re-read) |
| D7 | **ONE inaccuracy** — see below | ⚠️ citation drift |

**Inaccuracy found (D7, Notes column):** the note cites "the code taxonomy (`backend/lib/errors/error-code-taxonomy.ts:52-62`) maps CONFLICT→409/VALIDATION→422", but the HTTP-status mapping actually lives at **`:45-47`** (`CONFLICT: 409`, `DUPLICATE_REQUEST: 409`, `VALIDATION: 422`); `:52-62` is the `LEGACY_ERROR_CODE_ALIASES` docblock/constant. The claim itself is true — only the line anchor drifted. Per task-0.1 scope (verify + report; no other file touched), the fix is recorded here for **task 0.2's semantic review** (spec↔code drift → written back in the same commit): change `error-code-taxonomy.ts:52-62` → `error-code-taxonomy.ts:45-47` in the D7 Notes row. All other D7 content verified: the client routes on the code at `frontend/views/teacher/wallet/useTeacherWalletWithdraw.ts:86-91` (`if (code === "WALLET_INSUFFICIENT_FUNDS")`) — the bare filename resolves uniquely in the repo.

## 5. Carry-Forward Knowledge for Future Tasks

1. **Baseline is green across all three gates** — the 4.2 delta gate is a strict `=== 0` compare, not "no new errors": any error/warning after implementation is attributable to this plan's edits (expected: exactly the one journey-test file + two doc files + DBML line).
2. **`bun tsgo` takes ~seconds under the process lock and restores `next-env.d.ts` first** (`restore-next-env-dts.ts`) — a dirty `next-env.d.ts` at session start is normal repo machinery, not an edit.
3. **lint-service CLI honors `--json --id <caller>`** for full-repo runs (empty `-f` list ⇒ full-repo); note for 4.2: 3 `process-lock` log lines precede the JSON payload on stdout — strip them before `jq`.
4. **`biome:check` (`--write --unsafe`) made zero fixes on a pristine tree** — post-implementation fixes it applies are attributable to plan edits; re-run `git diff` after it during 4.2 to avoid polluting the delta.
5. **D7 ledger anchor fix queued for 0.2** (`error-code-taxonomy.ts:52-62` → `:45-47`) — one-line mechanical edit, owner: next executing agent.
6. **DB probes are free**: PGlite opens read-only-safe for SELECTs (`@electric-sql/pglite` on `./db/pglite`); migrations journal = `drizzle.__drizzle_migrations`. Do NOT run `bun run db --help` (no help flag — the CLI hangs waiting for input; avoid in automation).
7. **Test baseline**: no suites were run for 0.1 (not in scope); the first suite evidence lands in 3.1–3.3 — a red suite there is a finding per 3.1.SR, not a skip.

## 6. Subtask Ledger (0.1.x)

- **0.1.QL Quality Loop**: n/a per plan — not a code task; raw command output recorded in §1 above instead. No sub-loop run. ✅
- **0.1.TE Test Engineering**: n/a. ✅
- **0.1.SEC Security & Tenancy Audit**: n/a (no code touched; probes were read-only SELECTs against the sanctioned sandbox DB). ✅
- **0.1.SR Semantic Review**: every number in §1 quoted from real captured output (`/tmp/baseline-*` artifacts, tails quoted verbatim); zero values from memory. ✅
- **0.1.IV Instruction Verification**: root `AGENTS.md` quality-workflow sections re-read ("Code Quality Workflow", "Lint Service", "Verification Loop", "Parallel Subagent Quality Gate Workflow"); `bun quality-gate` stage order (tsgo → oxlint → biome → lint → duplicates) and the never-clear-caches rule noted for later tasks. ✅

## 7. Files Touched by This Task

- `outcome/0-baseline-outcome.md` (this file) — written.
- `tasks.md` — task `0.1` heading + `0.1.QL/.TE/.SEC/.SR/.IV` checkboxes flipped to `[x]`.
- Repo tree otherwise untouched (verified pristine post-run). Reported-not-fixed: D7 anchor (§4).
