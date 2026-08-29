---
name: autofix
description: >
  End-to-end autonomous fix loop for this repository. Detects every failure across the full
  verification pipeline — DB migrations, seeding, GraphQL schema generation + codegen, all test
  suites, and the quality gates — diagnoses root causes, applies fixes, and re-runs until one
  completely green round. Use this skill when:
  (1) the user asks to "fix all issues and make everything green",
  (2) the user requests the full pipeline (db migrate, seed, generate:gqlSchema, codegen, tests,
  quality-gate) in one shot,
  (3) a CI or local run is red and the failure source is unknown,
  (4) the user asks to verify the repo is in a committable state.
license: MIT
metadata:
  author: kottaby
  version: "1.0.0"
allowed-tools: shell Read Edit Write Grep Glob
---

# Autofix

Run the entire verification pipeline, classify every failure, fix the root cause, and loop until a
full round passes clean. This skill composes the `quality-gate` and `quality-loop` skills — it owns
the sequencing, the failure taxonomy, and the stop conditions; those skills own the per-check
remediation detail.

## Ground Rules (read before starting)

- **NEVER clear caches** — ESLint `.eslintcache` / `.eslintcache-type-aware` are preserved across
  runs. `--fresh` on the quality gate only clears `.quality-gate-state.json`, never caches.
- **NEVER suppress a rule to pass** — no `oxlint-disable` comments, no `jscpd:ignore` comments, no
  edits to `.jscpd.json` ignore patterns. Fix the root cause.
- **NEVER run checks out of order** — the pipeline order below is deliberate: cheap, static checks
  surface before expensive, server-backed suites.
- **NEVER widen a failing check into a "known flake"** without reproducing it once. A failure is a
  flake only if it passes on an isolated re-run with an unchanged tree.
- **ALWAYS read the instruction files and `AGENTS.md` layers the sub-loop prints** before editing a
  file. Fixes must comply with them.
- **ALWAYS report honestly** — if a failure cannot be fixed, say so with the diagnosis instead of
  claiming green.

## Process

Follow this process in order. Each phase gates the next.

- [ ] **Step 1: Recon** — read `/home/z/my-project/worklog.md` (latest entries) to know the current
      state, recent failure classes, and sanctioned gaps. Run `git status` + `git log --oneline -5`
      to know the working-tree state and HEAD.
- [ ] **Step 2: Data & codegen pipeline** — run in order, stopping at the first failure:
      1. `bun db migrate`
      2. `bun db seed`
      3. `bun run generate:gqlSchema`
      4. `bun run codegen`
      5. **Drift check**: `git status --porcelain` must be EMPTY after the generators. Committed
         codegen artifacts (`schema.graphql`, `gql/graphql.ts`) must be byte-identical to fresh
         output. A non-empty status is a REAL finding — see the playbook before committing the diff.
- [ ] **Step 3: Quality gate** — first invocation of a session: `bun quality-gate:fresh`; on resume
      after a fix wave: `bun quality-gate`. The gate runs tsgo → oxlint → biome → lint:type-aware →
      check:duplicates. Fix per stage; do not skip ahead. See the `quality-gate` skill for the
      parallel subagent orchestration (pool size 16, one file per subagent, `sub-loop.ts` per-file
      verification, CROSS-FILE DEPENDENCY reporting).
- [ ] **Step 4: Test suites** — run every suite in the table below. Run them in the listed order:
      fast, isolated suites first, server-backed suites last. Fix failures per the playbook, then
      re-run the failed suite in isolation before re-running the whole tier.
- [ ] **Step 5: Fix loop** — after fixing any failure, resume from the phase that failed (never
      restart from scratch mid-session). A round is green only when ALL phases pass with zero
      findings. Budget: at most **3 full rounds**. If a failure survives two rounds with no
      progress, STOP and report it — see "Stop conditions".
- [ ] **Step 6: Report** — when a full round is green, report per phase: what ran, what failed, what
      was fixed, how many iterations. If the user asked for commit + push, do Step 7.
- [ ] **Step 7: Commit & push** (only when requested) — see the commit rules below.

## Pipeline Reference

### Test suites (run in this order)

| # | Suite | Command | Notes |
|---|---|---|---|
| 1 | locale | `KOTTABY_TEST_RUNNER_OK=1 bun test shared/locale/` | No server. Fastest signal on i18n regressions. |
| 2 | db | `bun run test:db` | Parallel runner, no Next.js server. |
| 3 | services | `bun run test:services` | Parallel runner, no Next.js server. |
| 4 | graphql | `bun run test:graphql` | Self-managed server. Do NOT run while a fix wave is editing GraphQL code. |
| 5 | ui:components | `bun run test:ui:components` | happydom preloads baked into the script. |
| 6 | ui:static | `bun run test:ui:static` | Import-boundary scans only, per `test/ui/AGENTS.md`. |
| 7 | integration | `bun run test:integration` | May be an empty tier — the runner exits 0 gracefully. |

For a single failing test file use the run-test script instead of the whole suite:

```bash
bun run scripts/run-test/run-test.ts <test-path>
bun run scripts/run-test/run-test.ts --last <test-path>  # view last result
```

### Sanctioned gaps (NOT failures — never "fix" these)

These scripts exist in `package.json` but point at directories that are absent BY DESIGN, owned by
future tickets (dev3-002 BLT-05/BLT-13 and the cron/e2e scaffolds). Report them as "not runnable,
sanctioned" and move on:

| Script | Absent target | Owner |
|---|---|---|
| `test:cron` | `backend/services/cron/test/`, `app/api/cron/` | future cron ticket |
| `test:simulate` | `test/simulate/` | future ticket |
| `test:ui:e2e` | `test/ui/e2e/` | future e2e scaffold ticket |

### Known-benign signals (verify, then ignore)

| Signal | Why it is benign | What to verify first |
|---|---|---|
| `bun run lint` exits 1 with zero printed diagnostics | Pre-existing runner quirk in some states | Confirm the diagnostics array is truly empty, then treat as pass |
| jscpd reports clones UNDER the configured threshold | Gate only fails on threshold breach | Note the count in the report |
| `bun db migrate` reports "No pending Drizzle migrations" | Journal intact from a prior round | No action |

## Failure Handling

Every failure gets a root-cause diagnosis before any edit. The full playbook — migration
idempotency, codegen drift adjudication, per-stage fix patterns, test pollution, and the
fix-loop mechanics — lives in the reference file:

- [Failure playbook](references/failure-playbook.md) — failure classes, root-cause patterns, and
  fix mechanics per pipeline phase.

Non-negotiable mechanics, summarized:

1. **Fix within the assigned file whenever possible.** If a proper fix requires touching another
   file, STOP editing and report a CROSS-FILE DEPENDENCY (target file, blocked-by file, rule
   violated, required fix). The orchestrator collects reports and coordinates the follow-up wave.
2. **Per-file verification** after every fix:
   ```bash
   bun run scripts/health/sub-loop.ts <file-path> --lifecycle lint        # tsgo → oxlint → biome → lint:type-aware
   bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates  # adds check:duplicates
   ```
3. **Batch verification** of all uncommitted files: `bun run scripts/health/sub-loop-uncommitted.ts`.
4. **Fix waves inside the quality gate** must not interleave stages: finish the current stage's wave
   completely, then re-run `bun quality-gate` to advance.

## Stop Conditions

Stop the loop and report instead of continuing when ANY of these hits:

- **Iteration budget spent** — 3 full rounds without a green round.
- **No-progress failure** — the same failure reappears twice after a genuine root-cause fix attempt.
- **Blocked by ruling** — the fix requires a product/architecture decision (e.g., a schema semantic
  or a cross-module contract). Report the decision needed, with options.
- **Cross-file cycle** — the CROSS-FILE DEPENDENCY reports form a cycle that no single wave can
  resolve.

The final report MUST then list: the surviving failures, the diagnosis for each, what was tried,
and the concrete next step.

## Commit & Push Rules (Step 7)

Only run this phase when the user asked for it.

- **Scoped commits** — one concern per commit (e.g., `fix(db): ...`, `test(ui): ...`); never `git add .`
- Generated artifacts (`backend/drizzle/**` rewrites, `frontend/graphql/generated/**`) are
  committed when their regeneration is an intended, adjudicated outcome — never silently bundled
  with an unrelated fix.
- No `Co-authored-by` trailers.
- Push to `origin main` after commits land; verify with `git status` that the tree is clean and
  HEAD is pushed.
- If everything is green and the tree is already clean: report an honest no-op — the pipeline
  reproduced the committed state exactly.
- Append a session entry to `/home/z/my-project/worklog.md` (`Task ID`, `Agent`, `Task`,
  `Work Log`, `Stage Summary`) — append, never overwrite.

## Quick Reference

```bash
# Phase 2 — data & codegen
bun db migrate && bun db seed
bun run generate:gqlSchema && bun run codegen
git status --porcelain   # MUST be empty (drift check)

# Phase 3 — quality gate
bun quality-gate:fresh   # first run of a session
bun quality-gate         # resume after a fix wave

# Phase 4 — tests (see table for the full set)
bun run test:db && bun run test:services

# Per-file verification during fixes
bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates

# Single test file
bun run scripts/run-test/run-test.ts <test-path>
```
