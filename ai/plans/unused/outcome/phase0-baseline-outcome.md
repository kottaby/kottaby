# Phase 0 Baseline Outcome — T0.1 (clean_unused)

- **Task:** T0.1 — SKILL.md §Phase 0 pre-implementation baseline capture
- **Plan:** `ai/plans/unused/clean_unused.md` (Quick-spec)
- **Date:** 2026-09-06 14:46 UTC
- **Agent:** general-purpose subagent (read-only baseline capture)
- **Head commit:** `1c134db` (🧪 Add unit test suite for parent-link-request.helpers.ts (#68))

## ⚠️ ANOMALY — Branch mismatch (action needed before any file edit)

The setup worklog claims the workspace is on branch `feat/clean-unused`, but **HEAD is currently on `main`**:

```
$ git branch -a -v
  feat/clean-unused   1c134db ...
* main                1c134db ...
  remotes/origin/HEAD -> origin/main
  remotes/origin/main 1c134db ...
```

`feat/clean-unused` exists and points at the **same commit** (`1c134db`) as `main`, so every baseline number below is valid for either branch. However, implementation edits will land on `main` unless the orchestrator runs `git checkout feat/clean-unused` first (safe: working tree is clean, both tips identical). This task was read-only, so no switch was performed.

## Baseline metrics (all green)

| Check | Result | Raw evidence |
|---|---|---|
| tsgo | **0 errors**, exit 0 | `/tmp/baseline-tsgo-raw.txt` (8 lines total, no `error TS` lines, no summary error line printed) |
| biome | **0 warnings, 0 errors**, exit 0 | `/tmp/baseline-biome-raw.txt` → `Checked 1465 files in 10s. No fixes applied.` (no "Found N warnings" line = no issues) |
| lint (ESLint, full-repo, in-process service) | **PASS — 0 errors / 0 warnings**, exit 0 | `/tmp/baseline-lint.json` → `{ success: true, output: "", exitCode: 0, scope: "full-repo", durationMs: 81478 }` |
| git stash list | empty | `/tmp/baseline-stash.txt` |
| git diff --name-only | **empty** — no tracked files modified before implementation | `/tmp/baseline-files.txt` |
| git status --porcelain | only 2 untracked files (see below) | `/tmp/baseline-status.txt` |

### Command adaptations (vs. task/SKILL.md snippets)

- Bun binary is `/usr/local/bin/bun` (not `~/.bun/bin/bun`) — all commands adapted.
- **biome run NON-MUTATING**: used `bunx @biomejs/biome check .` — deliberately NOT `bun run biome:check`, because that package.json script is `bunx @biomejs/biome check --write --unsafe .` and would MODIFY files. Exit code verified 0 on a second run.
- tsgo exit code verified 0 via a direct second run of `bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit` (first run's exit code was masked by the `tee | grep` pipeline).
- lint-service CLI flags `--json` and `--id` ARE supported (confirmed in `scripts/lint-service-cli.ts` `parseArgs`); ran `bun run scripts/lint-service.ts --json --id baseline` exactly as specified. No `--fix`.

### Untracked files (git status --porcelain)

```
?? ai/plans/unused/deferred-items.md
?? ai/plans/unused/tasks.md
```

Expected-and-gitignored (therefore invisible to git status, all confirmed via `git check-ignore`): `.env`, `dev.log`, `/db/` (pglite data), `worklog.md`, `next-env.d.ts`, `.eslintcache` / `.eslintcache-type-aware`. `ai/plans/unused/outcome/` exists but is an empty directory (git doesn't list empty dirs). `.quality-gate-state.json` does not exist yet.

### `bun run tsgo` noise (expected, recorded)

`tsgo` script chains `scripts/restore-next-env-dts.ts` first; it printed `Restored next-env.d.ts to canonical dev dist dir (.next-dev).` — `next-env.d.ts` is gitignored (`.gitignore:40`) so this regeneration does **not** appear in `git diff`/`git status`. Also present in tsgo/lint output: `[WARN] [PglitePool] ...` lines (DB provider env noise, not type errors) and `[process-lock] Enqueued/Acquired/Released` lines. Minor quirk: the lint service's `[process-lock]` log lines leak to **stdout**, so `/tmp/baseline-lint.json` has 3 non-JSON prefix lines; the JSON body itself is intact.

## Pre-existing issues to ignore during post-implementation review

**None — the baseline is fully green.** tsgo=0 errors, biome=0 warnings, ESLint=0 problems, no modified tracked files. Consequences for review:

- Any `error TS` line, biome warning, or ESLint error/warning appearing after implementation is a **new regression** attributable to the cleanup — there is no pre-existing noise to filter out.
- The only "noise" to disregard is environmental console output: PglitePool WARN lines, `[process-lock]` lines, and the next-env.d.ts restore message (gitignored, invisible to git).

## Carry-forward knowledge for subsequent tasks

1. **Switch to `feat/clean-unused` before the first file edit** (see anomaly above). Both branches sit at `1c134db`.
2. **`bun run biome:check` MUTATES files** (`--write --unsafe`). For non-mutating checks always use `bunx @biomejs/biome check .` (~10s, 1465 files). `bun run format` / `biome:format` also mutate.
3. `bun run tsgo` = `scripts/restore-next-env-dts.ts` + `run-locked-cmd` wrapper around `tsgo -b --noEmit` (build mode, project references). Serial lock namespace `tsgo`; safe to run concurrently with biome per AGENTS.md. Took well under a minute.
4. Lint: full-repo ESLint via in-process serialized service ≈ **81s** (first run builds `.eslintcache`; subsequent runs faster). CLI defaults `--max-warnings=0`, so any warning fails the run — counts as failure, exit 1. Exit 2 = service fault (e.g. OOM signal death).
5. **`check:unused` script is still MISSING from package.json** (knip `^6.34.0` installed, `knip.config.ts` present) — T0.2 must add `"check:unused": "knip"` as its minimal enabling change.
6. oxlint was NOT part of T0.1's requested baseline; it runs inside `bun quality-gate` (`bun run oxlint` — `--deny-warnings`, `run-locked-cmd` serialized) and can be captured later if a per-checker baseline is wanted.
7. Dev server on port 3000 was left untouched and re-verified **HTTP 200** after all checks.
8. Git hygiene rule for this plan: restore over-deletions with `git checkout HEAD -- <file>`; never stash across waves; no commits until the scoped end-of-plan commit.
9. Evidence files kept in `/tmp`: `baseline-tsgo.txt` (0), `baseline-tsgo-raw.txt`, `baseline-biome.txt` (0), `baseline-biome-raw.txt`, `baseline-lint.json`, `baseline-lint.stderr.txt`, `baseline-stash.txt` (empty), `baseline-files.txt` (empty), `baseline-status.txt`.
