# Task 0 Outcome — Pre-Implementation Baseline

**Plan:** `ai/plans/sprint_4/financial-safety-verification/`
**Date:** 2026-09-12
**Status:** COMPLETE

## Baseline Counts (recorded BEFORE any test authorship)

| Check | Count/State | Source file |
|---|---|---|
| `bun tsgo` error count | **0** | `/tmp/baseline-tsgo.txt` |
| `bun biome:check` warning count | **0** | `/tmp/baseline-biome.txt` |
| `scripts/lint-service.ts --json` | **success: true, exitCode: 0** (0 problems) | `/tmp/baseline-lint.json` |
| `git stash list` | **empty** (no stashes) | — |
| `git diff --name-only` | **empty** (clean working tree at implementation start) | — |

## Baseline Suite Snapshots (current green state as reference)

| Suite | Result |
|---|---|
| `test/workflows/billing` (subscription-purchase journey) | **11 pass / 0 fail** (107 expects) |
| `backend/services/billing/wallet.service.test.ts` | **9 pass / 0 fail** (92 expects) |

## Environment Preparation (local sandbox)

The sandbox had no running PostgreSQL and no `dockerd`. Environment was provisioned to make the
baseline suite snapshot meaningful:

1. Installed `postgresql-14` (server binaries); started cluster `14/main` on port 5432.
2. Set `postgres` user password (`postgres`) via peer auth; verified TCP scram auth works.
3. Created empty database `kottaby_test` (matching the repo's committed `.env.test.ci` template).
4. Created the gitignored runtime `.env.test` (mirroring `.env.test.ci`): `DB_PROVIDER=postgres`,
   `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/kottaby_test`, `TEST_SERVER=1`,
   `TEST_CI=true`, plus local fixture values for encryption/secret keys.
5. Applied all 8 drizzle migration folders via the project's own `runMigrations(true)`
   (`backend/db/scripts/migrate.ts`) — verified 25 public tables and the immutability trigger tier
   (`prevent_teacher_transaction_update/delete_trigger`,
   `prevent_student_payments_update/delete_trigger`, `prevent_audit_logs_update/delete_trigger`).
6. Seeded the demo catalog via `bun run scripts/dbActions/cli-entry.ts seed --env-file=.env.test`
   (needed by the `subscription-purchase` journey's Reviews-lane plan fixture).

**Environment gotcha (carry-forward for Tasks 2–5):** the db CLI's `envFile.ts` has a top-level
`import "@/scripts/lib"` chain that pulls `@/backend/db` (via
`resolve-notification-recipients.ts`) BEFORE `applyEnvFile()` runs. With no project `.env` present,
any `bun run db …` invocation dies at import with `Required environment variable "DATABASE_URL" is
not set`. Workaround for this sandbox: pass `DATABASE_URL` (and `DB_PROVIDER`) as OS-env inline for
db CLI commands only. The test runners (`run-test.ts`, parallel runners) are unaffected — they load
`.env.test` before test modules import `@/backend/db`.

## Pre-Existing Issues to Ignore During Post-Implementation Review

- None found at baseline: tsgo 0 errors, biome 0 warnings, lint exit 0, working tree clean.
- The db-CLI env bootstrap-order issue above is **pre-existing environment tooling** (db CLI path
  only), not part of this plan's diff. It is recorded here so review waves do not attribute it to
  the plan.

## Deferred-Items Ledger

`ai/plans/sprint_4/financial-safety-verification/deferred-items.md` exists (created with the plan;
template-conformant with D1–D4 pre-ledgered re-route rows). Confirmed present — REQ-0 AC#2 satisfied.

## Carry-Forward Knowledge for Future Tasks

- All repo-tier probes can run against the real PostgreSQL `kottaby_test` — the trigger tier is
  INSTALLED AND ENABLED (`tgenabled ≠ 'D'`), so Task 3's `describeTriggerTier` block will RUN (not
  skip) in this environment.
- `bun run test/scripts/run-test.ts <path>` is the mandated runner; it pins `DATABASE_URL` from
  `.env.test` via `loadTestEnvFile()` and sets `KOTTABY_TEST_RUNNER_OK=1` (bunfig's
  `test-runner-guard` preload otherwise blocks direct `bun test`).
- Full-suite commands (`test:db`, `test:services`) spawn 8 parallel workers × pool 3 — fine for the
  local cluster. `TEST_CI=true` in `.env.test` keeps `isTestCi()` honest for the parallel runners.
- Journey files must NOT use `runInRollback`; repo/logic files MUST. See
  `test/workflows/AGENTS.md` vs `backend/db/test/AGENTS.md`.
