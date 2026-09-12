# Phase 0 — Baseline Outcome

**Date:** 2026-09-12 · **Task:** 0.1 Establish error baseline and confirm the deferred-items ledger
**Requirements:** REQ-001, REQ-002

## Baseline Counts

| Check | Command | Result |
|---|---|---|
| tsgo errors | `bun tsgo 2>&1 \| grep -c "error TS"` | **0** |
| biome warnings | `bun biome:check 2>&1 \| grep -c "warn"` | **0** |
| lint | `bun --env-file=.env.test run scripts/lint-service.ts --json --id baseline` | **success: true, exit 0, zero findings** |

Baseline artifacts: `/tmp/baseline-tsgo.txt` (0), `/tmp/baseline-biome.txt` (0), `/tmp/baseline-lint.json` (clean).

## Environment Note

The lint service requires `DATABASE_URL` (it opens a DB pool for its serialized queue). The worktree had no `.env` / `.env.test`; one was materialized from the CI workflow template (`.github/workflows/ci.yml` "Setup environment files" block) with the local Postgres URL `postgresql://postgres:postgres@127.0.0.1:5432/kottaby` (password-protected local instance, accepting connections). `.env.test` is gitignored (matches `.env*` in `.gitignore:59`, exceptions only for `.env.example` / `.env.test.ci`) — verified via `git check-ignore .env.test`. No secret values were introduced (CI fixture values only).

## Deferred-Items Ledger

`deferred-items.md` exists (created at plan generation, 2026-09-11) with five entries, all `✅ Done`:

- **D1** — nullable balance lanes stay nullable (future schema-hardening pass; defense-in-depth already layered)
- **D2** — stale helper names in `backend/db/test/AGENTS.md` + `tests.instructions.md` (rule files hand-curated; reported to maintainers)
- **D3** — student-facing balance read surface (out of scope, future UX/billing ticket)
- **D4** — reviews-lane consumption path (future review-session booking ticket)
- **D5** — `PRODUCTION_READINESS.md` §5.3.3 expiry invariant stays unchecked (DEV1-008 scope)

Ledger gate command evaluates to **0** blocked/partial rows — plan is not blocked.

## Pre-Existing State to Ignore During Review

- `git diff --name-only` baseline: **0 modified files** (clean worktree — every change after this point belongs to this plan).
- `git stash list`: 1 pre-existing stash (`autofix-journey` on `feat/dev3-005-session-state-machine`) — unrelated, untouched.
- tsgo/biome/lint are all clean, so **any** error surfaced by the quality loop during this plan is new and must be fixed.

## Carry-Forward

- All test runs in this plan must use `--env-file=.env.test` (or the package.json scripts that already do).
- Local Postgres is reachable at `127.0.0.1:5432/kottaby` with `postgres:postgres` credentials.
