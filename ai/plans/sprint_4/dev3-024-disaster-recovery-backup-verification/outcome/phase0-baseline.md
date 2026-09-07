# Outcome Phase 0 — Baseline Capture (DEV3-024, Tasks 0.1 + 0.2)

- **Agent:** Phase-0 Baseline Subagent
- **Date:** 2026-09-07 (execution date)
- **Branch:** `feat/dev3-024-disaster-recovery-backup-verification` @ `ffce457` (HEAD = `main` tip; plan files tracked in git on this branch)
- **Requirements:** REQ-000 (baseline + ledger), skill Phase-0; anchors G-01..G-12 cross-checked where probed (full detail in `outcome/0.2-toolchain-anchors-outcome.md`).
- **Nature:** probe/baseline only — zero source files created, modified, or fixed. Only `outcome/` artifacts were written.

---

## 1. Headline baseline numbers

| Gate | Command | Result | Raw artifact |
|---|---|---|---|
| Type check | `bun tsgo` | **0 `error TS` lines**, exit 0 | `/tmp/baseline-tsgo.txt` |
| Biome | `bun biome:check` | **0 `warn` matches**, exit 0, "Checked 1419 files in 10s. No fixes applied." | `/tmp/baseline-biome.txt` |
| Lint | `bun run scripts/lint-service.ts --json --id baseline-dev3-024` | **success: true, exitCode: 0** (full-repo scope, 78.6 s) | `/tmp/baseline-lint.json` (copy: `/tmp/baseline-lint.txt`) |
| Git | `git stash list` / `git diff --name-only` / `git status --porcelain` | **all empty** — clean tree, no stash, no untracked files | `/tmp/baseline-stash.txt`, `/tmp/baseline-files.txt`, `/tmp/baseline-status.txt` |

**The tree is fully green at baseline** (consistent with HEAD commit message "…quality gate to full green"). Every post-implementation finding is therefore attributable to DEV3-024 work — there are zero pre-existing issues to waive.

---

## 2. Task 0.1 — what was run (verbatim evidence)

### 2.1 tsgo

```
$ bun tsgo > /tmp/baseline-tsgo.txt 2>&1     # full output captured (first, cold run)
$ grep -c "error TS" /tmp/baseline-tsgo.txt
0
$ bun tsgo 2>&1 | grep "error TS" | wc -l    # exact plan command (repeat)
0
```

- First (cold) invocation performs the real full-repo typecheck and (re)writes `tsconfig.tsbuildinfo` (2.2 MB); subsequent invocations are fast (~0.3 s) incremental no-ops of `tsgo -b --noEmit` — package.json line 15: `"tsgo": "bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit"`.
- Inner command is wrapped by `scripts/lib/run-locked-cmd.ts` (process lock + 5-minute timeout; it does NOT cache or skip — verified by reading the script).
- Result: **0 type errors, exit 0**, reproducible across three invocations.

### 2.2 biome

```
$ bun biome:check 2>&1 | grep -c "warn"
0
$ bun biome:check 2>&1 | tail -30
$ bun run scripts/lib/run-locked-cmd.ts biome:check bunx @biomejs/biome check --write --unsafe .
[process-lock] Enqueued request for "biome:check" (PID: 2320)
[process-lock] Acquired lock for "biome:check" (PID: 2320). Executing...
Checked 1419 files in 10s. No fixes applied.
[process-lock] Released lock for "biome:check" (PID: 2320)
```

- Exit code 0; **0 warnings**; full output at `/tmp/baseline-biome.txt`.

### 2.3 lint

- **`scripts/lint-service.ts` EXISTS** (12,231 bytes, executable) — the plan-authored command ran **exactly as written, no substitution needed**.

```
$ bun run scripts/lint-service.ts --json --id baseline-dev3-024
[process-lock] Enqueued request for "lint-service: baseline-dev3-024" (PID: 2354)
[process-lock] Acquired lock for "lint-service: baseline-dev3-024" (PID: 2354). Executing...
[process-lock] Released lock for "lint-service: baseline-dev3-024" (PID: 2354)
{
  "success": true,
  "output": "",
  "exitCode": 0,
  "metrics": {
    "id": "baseline-dev3-024",
    "scope": "full-repo",
    "fileCount": 0,
    "durationMs": 78563,
    ...
  }
}
```

- `fileCount: 0` = empty files array = **full-repo** scope (per root AGENTS.md lint-service contract). Duration ≈ 78.6 s, cold (warm `.eslintcache` preserved, never cleared per repo rule).
- JSON saved to `/tmp/baseline-lint.json`; mirrored to `/tmp/baseline-lint.txt`. `bun run lint` was NOT needed as a substitute (it is the same full-repo path via the service).

### 2.4 git baseline

```
$ git stash list        → (empty)
$ git diff --name-only  → (empty)
$ git status --porcelain → (empty)
```

- **Baseline file set is EMPTY.** Notably, even `.env` and a root `Caddyfile` do NOT appear: `.env` is gitignored (`.gitignore:59` → `.env*`), and no `Caddyfile` exists inside the repo root (the sandbox Caddyfile lives outside the repo), so the tree is porcelain-clean. No stash entries.

### 2.5 Deferred-items ledger (REQ-000.2)

`deferred-items.md` EXISTS with D-001..D-003 pre-seeded — all rows **📅 Forward** (non-blocking; re-checked at 7.2):

| ID | Item | Status | Verified By |
|---|---|---|---|
| D-001 | Neon managed-backup (PITR) console configuration & screenshot evidence | 📅 Forward | DEV3-026 launch-checklist gate |
| D-002 | CI workflow job running `restore-verify` on a schedule against anonymized staging dump | 📅 Forward | — (post-launch CI) |
| D-003 | Off-site (second-region / object-storage) upload of backup artifacts | 📅 Forward | — (post-launch infra) |

Zero ❌/⚠️/🔄 rows. Ledger is clean.

---

## 3. Environment facts (key names only — no secret values)

- **Postgres:** 17.11 (server AND client), user-space cluster at `/home/z/pgdata`, log `/home/z/pglog/pg.log`, listening `127.0.0.1:5432`, accepting connections. Client binaries (`pg_dump`, `pg_restore`, `psql`, `pg_isready`, `createdb`, `dropdb`, `pg_ctl`, `initdb`) all on PATH at `/usr/local/bin`. `PGHOST=127.0.0.1`, `PGUSER=postgres` exported in `~/.bashrc`.
- **Databases:** `app_db` exists (schema pushed + seeded at provisioning).
- **.env** (gitignored): key names only — `DB_PROVIDER`, `DATABASE_URL`, `DATABASE_ENCRYPTION_KEY`, `CRON_SECRET`, `GRAPHQL_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CACHE_PROVIDER`, `REDIS_PROVIDER`. `DB_PROVIDER=postgres`.
- **Runtimes:** Bun 1.3.14, Node v24.19.0.
- **Repo hygiene tools verified present:** `scripts/lint-service.ts`, `scripts/health/sub-loop.ts` (+ sub-loop-* modules), `scripts/lib/run-locked-cmd.ts`, `.eslintcache` (512 KB, preserved).

---

## 4. Pre-existing issues to ignore during post-implementation review

**None.** tsgo 0 errors · biome 0 warnings · full-repo lint clean · git tree clean. Any error/warning appearing in later phases is introduced by DEV3-024 work and must be fixed (Fix-Or-Report), not waived against this baseline.

---

## 5. Procedural notes / honest deviations

1. **Branch state on arrival:** the shell was checked out on `main` (identical commit `ffce457`) when the subagent started, despite provisioning notes saying the feature branch was current. Fixed immediately by `git checkout feat/dev3-024-disaster-recovery-backup-verification` (same commit; zero working-tree change) BEFORE any baseline capture. All numbers above were captured on the mandated branch. Flagged to orchestrator.
2. **Background tsgo attempt killed:** an initial attempt to run tsgo in the sandbox background was reaped when the shell call ended (empty output file). Re-run in the foreground — the captured numbers above are from real, completed runs.
3. **tsgo incrementality:** the cold run did the real full check; later `bun tsgo` invocations are incremental no-ops via `tsconfig.tsbuildinfo`. Baseline recorded from the cold run (0 errors). Caches were never cleared (repo rule).
4. **⚠ ENVIRONMENT ANOMALY — HEAD flapping back to `main`:** an external sandbox process rewrites `.git/HEAD` back to `refs/heads/main` between shell calls (reflog shows feat→main→feat→main flips after the subagent's explicit checkout; no git process runs in-session). **Zero content impact** — both branches point at identical commit `ffce457`, and all Phase-0 products are working-tree changes (tasks.md checkbox flips, `outcome/` files, gitignored worklog) that survive the flips. **Action for orchestrator:** during implementation phases, re-run `git checkout feat/dev3-024-disaster-recovery-backup-verification` (and verify `git branch --show-current`) immediately BEFORE every `git commit`, or commits may land on the wrong branch.
5. **Anchor probe results** (guard exports, `applyEnvFile`, `bootstrapEnv.ts`, `ops:*` lines, `.gitignore` `/backups/`): recorded verbatim in `outcome/0.2-toolchain-anchors-outcome.md`. One cosmetic deviation found (G-06 `ops:*` block is at package.json lines **63–64**, not 66–67) — flagged there, nothing fixed.

## 6. Carry-forward for later tasks

- **Task 4.1:** insert `ops:db-backup` / `ops:db-restore-verify` immediately after package.json line 64 (below the existing `ops:sweep-link-requests` / `ops:remind-link-requests` pair).
- **Task 4.2:** `.gitignore` currently lacks `/backups/` (grep exit 1) — add it, then the 4.1.TE assertion will hold.
- **Task 6.1 (runbook prerequisites):** record the client-vs-server major rule (client ≥ server; upgrade in lockstep) and the current host fact (17.11 / 17.11 → satisfied).
- **Tasks 2.1/3.1:** `envFile.ts` additionally exports `parseDbCliArgs`/`ParsedDbCliArgs`, `isValidDatabaseUrl`, `resolveEffectiveDatabaseUrl`, `isSqliteEnvFile` — reusable for arg parsing and DSN validation; guard module's `DestructiveDbSafetyAssessment` interface (L34) is the assess function's return type.
- **Task 8.1:** review scope = `git diff --name-only` vs the (empty) baseline captured here; baseline artifacts live under `/tmp/baseline-*.txt|json` on this host.
