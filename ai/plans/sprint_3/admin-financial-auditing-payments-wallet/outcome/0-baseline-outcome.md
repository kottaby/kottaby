# Task 0 — Pre-Implementation Baseline Outcome

**Date:** 2026-09-12
**Executor:** Orchestrator (spec-implementation)

## Purpose

Establishes the error baseline for `admin-financial-auditing-payments-wallet` so post-implementation
review can distinguish NEW issues from pre-existing ones.

## Baseline Captures

| Check | Command | Result |
|---|---|---|
| tsgo errors | `bun tsgo 2>&1 \| grep "error TS" \| wc -l` | **0** (`/tmp/baseline-tsgo.txt`) |
| biome warnings | `bun biome:check 2>&1 \| grep -c "warn"` | **0** (`/tmp/baseline-biome.txt`) |
| lint (full-repo, JSON) | `bun --env-file=.env.test run scripts/lint-service.ts --json --id baseline` | **success: true, exit 0** (`/tmp/baseline-lint.json`); durationMs ≈ 85s; empty output = zero findings |
| git modified files | `git diff --name-only` | **0 files** (`/tmp/baseline-files.txt`) |
| git stash list | `git stash list` | **empty** (`/tmp/baseline-stash.txt`) |

## Deferred-Items Ledger

Confirmed present at `ai/plans/sprint_3/admin-financial-auditing-payments-wallet/deferred-items.md`
(seeded at planning time). One entry:

- **D1 (❌ Blocked → target Task 2.1):** formally verify the two
  `custom_4-student-payments-status-transition` drizzle dirs
  (`20260907182426_…` / `20260908103411_…`) hold payload-identical SQL before adding
  `custom_5-teacher-transaction-settlement`. Task 2.1 records the comparison in its outcome and
  flips D1 to ✅.

## Environment Bootstrap (sandbox-specific, NOT plan work)

The sandbox had NO PostgreSQL server and no `.env.test`. Environment set up before baseline
(or environment-only, zero repo-file changes):

1. `postgresql-14` installed via apt; cluster `14/main` started (TCP 127.0.0.1:5432, socket auth
   peer; host auth scram-sha-256).
2. Role `kottaby` (LOGIN SUPERUSER) + databases `kottaby` (dev) and `kottaby_test` (test) created.
3. `.env.test` created locally from the `.env.example` "Test environment" section
   (gitignored — verified `git check-ignore .env.test` passes):
   `DB_PROVIDER=postgres`, `DATABASE_URL=postgresql://kottaby:***@127.0.0.1:5432/kottaby_test`,
   `DATABASE_ENCRYPTION_KEY=<generated>`, `TEST_CI=false`.
4. Migrations applied to `kottaby_test` via `bun --env-file=.env.test run backend/db/scripts/migrate.ts`
   (all 8 drizzle folders applied — including both `custom_4-student-payments-status-transition`
   dirs — proving the duplicate-dir pair is idempotency-safe on a fresh DB).
5. Seed applied via `bun --env-file=.env.test run backend/db/scripts/drizzleSeed.ts`
   (standard profile: demo users, plan catalog, trial reconcile — all steps green).
6. Sanity: existing suite `backend/db/test/repo/students/student.repository.test.ts` green
   (23 pass / 0 fail / 100 expect() calls) against the migrated `kottaby_test`.

## Known sandbox quirk (affects future task commands)

`scripts/lib/index.ts` barrel transitively imports `@/backend/db` (via
`resolve-notification-recipients.ts`), so ANY script that imports `@/scripts/lib` requires env
present BEFORE module load. Affected invocations in this plan:

- Lint: use `bun --env-file=.env.test run scripts/lint-service.ts …` (the `.env.test` file must
  exist; plain `bun run lint` works only once `.env` exists).
- DB CLI: `bun --no-env-file run scripts/dbActions/cli-entry.ts --env-file=<file> …` crashes at
  import time (envFile.ts pulls `@/scripts/lib` → backend/db → eager pool). Use
  `bun --env-file=<file> run backend/db/scripts/migrate.ts` / `drizzleSeed.ts` directly instead.
- Test runners are unaffected (`run-test.ts` spawns `bun --env-file=.env.test test …` itself).

## Pre-existing issues to ignore during review

- None blocking found. The duplicate `custom_4-…` drizzle dirs are the known ledger D1 anomaly
  (resolved in Task 2.1's outcome).
- Zero new errors/warnings across tsgo / biome / lint at baseline → every finding reported during
  post-implementation review is attributable to this plan.

## Carry-forward knowledge

- Repo policy: migrations run via the custom-migration path (`bun db migrate` equivalent →
  `backend/db/scripts/migrate.ts`); `db push` is for schema-shape only; `db reset` /
  `db cleanGenerate` permanently disabled.
- pglite (`DB_PROVIDER=pglite`) initializes a WASM PG at `PGLITE_DATA_DIR` (default `./db/pglite`)
  and supports PL/pgSQL — verified by direct probe (function create/drop OK) on PGlite 0.5.8.
- The plan's Test-Layer Coverage Gate commands must all use the sanctioned runners
  (`run-test.ts` / `bun run test:*`); direct `bun test` is blocked by `test-runner-guard.ts`.
