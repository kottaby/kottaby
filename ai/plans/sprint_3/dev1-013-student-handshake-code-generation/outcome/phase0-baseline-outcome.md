# Phase 0 Baseline Outcome — Task 0.1: Record Error Baseline & Initialize Deferred-Items Ledger

**Ticket:** DEV1-013 (Student Handshake Code Generation)
**Plan directory (actual):** `ai/plans/sprint_3/dev1-013-student-handshake-code-generation/`
**Captured at:** 2026-08-29 (sandbox session), HEAD `e39096f` ("New PLans, skills adjustments, update docs, update readme (#22)")
**_Requirements:_ REQ-001, REQ-034, REQ-083**

---

## 1. Baseline Numbers (headline)

| Check | Command (repo's own script) | Result | Count |
|---|---|---|---|
| TypeScript | `bun run tsgo` (→ `tsgo -b --noEmit`, locked) | exit 0 | **0 errors** (zero `error TS` lines) |
| Biome | `bun run biome:check` (→ `biome check --write --unsafe .`, locked) | exit 0 — "Checked 504 files in 5s. No fixes applied." | **0 findings** (0 warnings / 0 errors) |
| ESLint (service) | `bun run scripts/lint-service.ts --json --id baseline` | exit 0, `success: true`, `exitCode: 0` | **0 lint problems** (output contains only a benign concurrency warning; see caveat §4.1) |
| Git worktree | `git status --porcelain` + `git diff --name-only` | both EMPTY | **clean tree** (before AND after baseline tooling) |

**Interpretation:** the repo is fully green at baseline. After implementation, any NEW `error TS` line, biome finding, or eslint problem is attributable to this plan's changes.

---

## 2. tsgo — exact evidence

- Command: `cd /home/z/my-project && bun run tsgo` (script: `bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit`)
- Exit code: **0**
- `grep -c "error TS"` on full log: **0** (no first error lines exist to quote)
- Full log (5 lines) saved to **`/tmp/baseline-tsgo.log`**; tail-50 capture in `/tmp/baseline-tsgo-tail.txt`. Full log content:

```
$ bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit
Restored next-env.d.ts to canonical dev dist dir (.next-dev).
[process-lock] Enqueued request for "tsgo" (PID: 3001)
[process-lock] Acquired lock for "tsgo" (PID: 3001). Executing...
[process-lock] Released lock for "tsgo" (PID: 3001)
```

- Ran twice (second run for the `tail -50` capture) — both runs identical, exit 0, zero errors.

## 3. biome:check — exact evidence

- Command: `bun run biome:check` (script: `bun run scripts/lib/run-locked-cmd.ts biome:check bunx @biomejs/biome check --write --unsafe .` — includes `--write --unsafe`, i.e. auto-fix capable)
- Exit code: **0**
- Finding count: **0** (no `warn`/`error` lines in output)
- Auto-fixes applied: **NONE** — output states "No fixes applied."; `git status --porcelain` remained empty after the run → **no revert was needed**
- Full log saved to **`/tmp/baseline-biome.log`**:

```
$ bun run scripts/lib/run-locked-cmd.ts biome:check bunx @biomejs/biome check --write --unsafe .
[process-lock] Enqueued request for "biome:check" (PID: 3118)
[process-lock] Acquired lock for "biome:check" (PID: 3118). Executing...
Checked 504 files in 5s. No fixes applied.
[process-lock] Released lock for "biome:check" (PID: 3118)
```

## 4. lint-service — exact evidence

### 4.1 Recorded baseline run

- Command: `bun run scripts/lint-service.ts --json --id baseline`
- The script writes **no artifact file of its own** — it prints the JSON result to stdout. The JSON was persisted to **`/tmp/baseline-lint.json`** (raw run log incl. process-lock lines: `/tmp/baseline-lint-full.log`).
- Recorded JSON (exit 0):

```json
{
  "success": true,
  "output": "(node:3596) ESLintPoorConcurrencyWarning: You may reduce or disable concurrency to improve performance.\n(Use `node --trace-warnings ...` to show where the warning was created)\n",
  "exitCode": 0,
  "metrics": {
    "id": "baseline",
    "scope": "full-repo",
    "fileCount": 0,
    "durationMs": 14801,
    "enqueuedAt": 1787970808011,
    "startedAt": 1787970808011,
    "finishedAt": 1787970822812,
    "queueDepthAtEnqueue": 0
  }
}
```

- ESLint exit code 0 = **zero lint problems repo-wide**; the only output text is a benign Node `ESLintPoorConcurrencyWarning`.

### 4.2 Environment caveat (pre-existing, NOT a code finding)

On a **cold `.eslintcache`**, the full-repo eslint run under the script's default `--concurrency=4` fails in this sandbox (2 vCPU / 4 GB RAM): observed twice as exit 1 with `success: false`, `output: ""`, `fileCount: 0`, ~44–48 s (eslint worker processes are OOM-killed before emitting output; a foreground run of the same command kills the shell session). Evidence: `/tmp/baseline-lint-raw.log`, `/tmp/baseline-lint-raw2.log`.

Diagnosis performed (report-only, no source changes):
- `LINT_QUEUE_CONCURRENCY=1 bun run scripts/lint-service.ts --json --id baseline-c1` → `success: true`, `exitCode: 0`, zero findings, 32.7 s (`/tmp/baseline-lint-c1.log`)
- After the cache is warm, the default command succeeds (14.8 s run recorded in §4.1)
- Without the repo's `scripts/ts6-eslint-patch.cjs` NODE_OPTIONS shim, eslint 10.9.1 hard-crashes with `typescript-eslint does not support TS 7.0` (exit 2) — the shim (routing `typescript` → `@typescript/typescript6`) is required and present

**Guidance for later tasks:** in this sandbox, prefer `LINT_QUEUE_CONCURRENCY=1` for cold full-repo lint runs; per-file lint (as used by `sub-loop.ts`) works fine at defaults.

## 5. Dirty-worktree snapshot (proof of clean starting tree)

Captured BEFORE any baseline tooling ran:

- `git status --porcelain` → **EMPTY** (`/tmp/baseline-git-status-pre.txt`, `/tmp/baseline-git-status.txt`)
- `git diff --name-only` → **EMPTY** (`/tmp/baseline-files-pre.txt`, `/tmp/baseline-files.txt`)
- `git stash list` → **EMPTY**

Re-checked AFTER tsgo + biome:check + lint-service all ran: `git status --porcelain` and `git diff --name-only` both still EMPTY → biome applied no fixes, so nothing had to be reverted; the starting tree for implementation is **clean at commit `e39096f`**.

Notes:
- `.eslintcache` (created by lint runs) is gitignored (`.gitignore:49`) — contributes no dirty state.
- Untracked-but-present local files (`.env`, `.env.test`, `worklog.md`, `tool-results/`) do not appear in `git status --porcelain` (gitignored) and are intentionally kept.
- **Branch observation for the orchestrator:** the working tree is currently checked out on `main` at `e39096f`; the feature branch `feat/dev1-013-student-handshake-code-generation` exists at the **same commit** `e39096f` (identical content). No change was made by this task (environment left as-is), but implementation commits should go on the feature branch per the setup discipline ("never on main").

## 6. Pre-seeded deferred-items ledger (D1–D3)

`ai/plans/sprint_3/dev1-013-student-handshake-code-generation/deferred-items.md` (already existed from the plan commit with an empty ledger table) was edited to seed exactly three **non-blocking forward-note** entries (status `📝 Forward`, defined in the ledger's Status Values section; no ❌/⚠️ markers on these entries):

| ID | Deferred Item | Target | Status |
|---|---|---|---|
| D1 | Parent page "Send link request" CTA wire-up | DEV1-014 | 📝 Forward (non-blocking) |
| D2 | Real per-parent/per-IP rate limiting for the discovery query — brute-force mitigation rationale per REQ-034 | DEV2-002 | 📝 Forward (non-blocking) |
| D3 | Direct-onboarding (B.6-family) code generation reuse via shared `generateHandshakeCode` service entry point | DEV3-019 | 📝 Forward (non-blocking) |

Template structure (Purpose / Ledger Table / Status Values) kept intact.

## 7. Pre-existing issues to ignore during post-implementation review

1. **lint-service cold-cache full-repo failure at default concurrency=4** (§4.2): exit 1 with empty output — sandbox resource limit (OOM at 4 concurrent eslint workers on 2 vCPU / 4 GB), NOT a lint finding. Use `LINT_QUEUE_CONCURRENCY=1` or a warm cache.
2. **`ESLintPoorConcurrencyWarning`** appearing in lint-service stdout — benign Node warning, present at baseline.
3. **typescript-eslint vs TS 7.0 incompatibility** — eslint only runs via the repo's `scripts/ts6-eslint-patch.cjs` shim; any raw eslint invocation without `NODE_OPTIONS=-r ./scripts/ts6-eslint-patch.cjs` fails with exit 2 ("typescript-eslint does not support TS 7.0"). Pre-existing tooling constraint.
4. **HEAD on `main`** (same commit as the feature branch) — environment state noted in §5; not a code issue, but commits must target `feat/dev1-013-student-handshake-code-generation`.

No other pre-existing type/lint/format findings exist — baseline is fully green.

## 8. Files created/modified by this task

- MODIFIED: `ai/plans/sprint_3/dev1-013-student-handshake-code-generation/deferred-items.md` (seeded D1–D3 + `📝 Forward` status definition)
- CREATED: `ai/plans/sprint_3/dev1-013-student-handshake-code-generation/outcome/phase0-baseline-outcome.md` (this file)
- MODIFIED: `ai/plans/sprint_3/dev1-013-student-handshake-code-generation/tasks.md` (checkbox `0.1` → `[x]` only)
- APPENDED: `/home/z/my-project/worklog.md` (Task 0.1 section)
- NO source code, schema, config, or dependency files were touched. No biome fixes existed to revert.
