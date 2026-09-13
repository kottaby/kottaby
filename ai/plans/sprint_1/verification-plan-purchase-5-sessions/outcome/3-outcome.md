# Task 3 — Shared verification-plan constants — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Environment**: sandbox, `DB_PROVIDER=pglite`

## Summary

The verification plan's catalog identity now has a single shared source of truth:
`shared/constants/verification-plan.constants.ts` exports `VERIFICATION_PLAN_TITLE`
(`"New Teacher Verification & Evaluation Plan"`) and `VERIFICATION_PLAN_SESSION_COUNT` (`5`).
The barrel re-exports both, and the plan-catalog seeder sources its verification-plan row's
`title` and `sessionCount` from the constants — the seed can never drift from what server-side
plan resolution (Task 5) and the UI title match (Task 9) expect. Tests pin the identity at three
levels: the canonical literals, the seeder spec, and the seeded catalog row.

## Files modified

| File | Change |
|---|---|
| `shared/constants/verification-plan.constants.ts` | **CREATE** — module JSDoc (domain context + shared-layer isolation note, matching `free-trial.constants.ts` / `parent-link-request.constants.ts` style) + the two `as const` constants with per-constant JSDoc. Zero imports — no env coupling, no layer deps. |
| `shared/constants/index.ts` | **Barrel registration** — `export * from "./verification-plan.constants";` appended in the barrel's existing alphabetical order (after `session-fees.constants`). |
| `backend/db/seeds/billing/seed-plans.ts` | Verification plan spec entry in `INITIAL_DEMO_PLANS` now uses `title: VERIFICATION_PLAN_TITLE` and `sessionCount: VERIFICATION_PLAN_SESSION_COUNT` (was inline literals). One explanatory comment added; existing review-lane comment kept. No behavioral change — values are identical. |
| `backend/db/test/logic/billing/plan-seed.test.ts` | Header docblock updated; existing DB assertions re-pinned to the constants (lookup by `VERIFICATION_PLAN_TITLE`, `sessionCount === VERIFICATION_PLAN_SESSION_COUNT` **and** literal `5`); NEW spec-level test asserting the `INITIAL_DEMO_PLANS` verification entry carries the constants + `shouldBeActive: true`. Follows the file's existing `runInRollback` + `createTestUser` fixture pattern. |
| `shared/constants/verification-plan.constants.test.ts` | **CREATE** — tiny colocated constants unit test (repo convention: `session-fees.constants.test.ts` / `handshake-code.constants.test.ts`), pinning the canonical literal title string and `sessionCount === 5`. NO DB, NO network, NO env reads. |
| `ai/plans/.../tasks.md` | Task 3 + sub-checkboxes (3.QL/3.TE/3.SEC/3.SR/3.IV) flipped to `[x]`. |

**Import-alias decision**: the task suggested `@/shared/constants`; the printed rule files
(`shared/AGENTS.md` "Prefer deep imports over barrel files", root `AGENTS.md` "Deep imports are
the default") and the seed file's own all-deep import style point to the deep path
`@/shared/constants/verification-plan.constants` — that is what both consumers use (same
convention as `session.repository.ts` → `session-fees.constants`). The barrel export exists for
consumers that import the barrel (e.g. Task 4/5 may import either; both resolve identically).

## Files NOT modified (and why)

- `deferred-items.md` — no out-of-scope discoveries in this task; no new ledger row.
- Parallel-agent files (`applicant.repository.ts`, `applicant-lifecycle.service.ts`, `shared/locale/**`) — untouched per coordination protocol.
- `shared/constants/*` other neighbors — no changes needed; the barrel had no stale entries.

## Verification results

| Check | Result |
|---|---|
| 3.QL sub-loop `shared/constants/verification-plan.constants.ts` `--lifecycle duplicates` | **exit 0** (tsgo → oxlint → biome → lint:type-aware → intra-file duplicates all pass) |
| 3.QL sub-loop `shared/constants/index.ts` | **exit 0** |
| 3.QL sub-loop `backend/db/seeds/billing/seed-plans.ts` | **exit 0** (duplicates stage skipped by the tool — file outside jscpd scan scope) |
| 3.QL sub-loop `backend/db/test/logic/billing/plan-seed.test.ts` | **exit 0** (duplicates stage skipped — outside jscpd scope) |
| 3.QL sub-loop `shared/constants/verification-plan.constants.test.ts` | **exit 0** (duplicates stage skipped — outside jscpd scope) |
| 3.TE `bun run test/scripts/run-test.ts backend/db/test/logic/billing/plan-seed.test.ts` | **2 pass / 0 fail** (22 expect calls): idempotent-seed test (now constant-pinned) + new spec-pin test |
| 3.TE `bun run test/scripts/run-test.ts shared/constants/verification-plan.constants.test.ts` | **2 pass / 0 fail** (4 expect calls) |
| `bun tsgo` (project-wide) | **0 errors** (baseline 0) |
| `bun biome:check` (project-wide) | **0 warnings** (baseline 0) |

## 3.SEC — read-only data, no env coupling

- The constants module is pure data: zero imports, zero `process.env` reads, no functions, no
  mutable state. Grep-verified: no `process.env`, no `@/frontend`, no `@/app`, no `@/backend`
  anywhere in the file.
- Seeding behavior is unchanged (same title string, same session count) — the change is
  provenance-only, so no authorization/read-scope surface is affected.

## 3.SR — semantic review

- **Import graph**: the new shared module imports nothing (not even relative paths) — trivially
  satisfies "shared/ imports nothing from frontend/backend". Consumers (seed + tests) import
  shared → backend direction, which is the legal direction.
- **Barrel conventions honored**: relative `./` path, `export *` mechanics, alphabetical order,
  re-export-statements-only file preserved.
- **No plan-artifact references**: grep across all touched source files for `REQ-|Task|DEV2-|plan.md|specs.md`
  → zero matches (comments describe domain behavior only).
- **No dead branches**: no conditional logic added anywhere (constants are data; seed/test changes
  are data + assertions).
- **`git diff --name-only`** matches intended files: my edits (`seed-plans.ts`,
  `plan-seed.test.ts`, `shared/constants/index.ts`) + 2 untracked new files (constants + its
  test) + pre-existing Task 1 working-tree changes (`student-payments` schema/repo/test,
  tasks.md, deferred-items.md, `outcome/1-outcome.md`) + this outcome file. No stray files.

## 3.IV — rule files read and honored

Printed by the sub-loops and read in full: root `AGENTS.md`, `shared/AGENTS.md`,
`backend/AGENTS.md`, `backend/db/seeds/AGENTS.md`, `backend/db/test/AGENTS.md`,
`.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`.
Compliance highlights: shared-layer isolation kept; deep-import preference followed; seeder
stays service-mediated (no DB imports added; `@/shared` is in the seeders' allowed-import
spirit — it is a pure-data module, not a repo/schema import); DB test extended inside the
existing `runInRollback` fixture with `tx` propagation (no `expect(...).rejects.toThrow()`, no
seed-data queries — the seeder runs through its own service path against fixture-created rows);
`bun:test` utilities only; no `console.*`.

## Carry-forward for future subtasks

1. **Task 5 (`VerificationPurchaseService.purchase`)** resolves the plan server-side:
   `PlanRepository.listActive(outerTx)` → `find(p => p.title === VERIFICATION_PLAN_TITLE)`;
   missing → `logDomainError` + `NotFoundError("PLAN", t.subscriptionPurchase.planNotPurchasable)`
   BEFORE any gateway call or DB write. Import from
   `@/shared/constants/verification-plan.constants` (deep-import convention).
2. **Task 4 (journey test)** plan fixture: `createTestPlan(tx, { title: VERIFICATION_PLAN_TITLE,
   sessionCount: VERIFICATION_PLAN_SESSION_COUNT, balanceLane: SubscriptionCreditLane.Reviews,
   price: "150.00", intervalDays: 14, isActive: true })` — never query seeded rows.
3. **Task 9 (purchase dialog)** title-matches the `planCatalog` query on
   `VERIFICATION_PLAN_TITLE` (client-side use of the same constant is safe — pure data).
4. The seeded row and the constants are now locked together by `plan-seed.test.ts` at both the
   spec level and the DB-row level; any attempt to change one without the other fails the suite.
   The canonical literals themselves are pinned by the colocated constants test — changing the
   title/session count deliberately requires touching (and re-pinning) exactly:
   constants file → constants test → (automatically) seed → (automatically) plan-seed test.

## Cross-file dependencies discovered

- `INITIAL_DEMO_PLANS` is `as const`-asserted and typed `readonly DemoPlanSpec[]`; identifier
  references (`VERIFICATION_PLAN_TITLE` as a string-literal-typed const) drop in without any
  type friction — no `PlanSubmitInput` change needed.
- `seedOrGet`'s idempotency is title-matched (`existingByTitle` map) — sourcing the title from
  the constant keeps seed-or-get and any future service resolution on the SAME key.
- The barrel is consumed by at least one existing test (`parent-link-request.repository.test.ts`
  imports `@/shared/constants`), so the new export must not collide — names are unique
  (`VERIFICATION_PLAN_*` prefix), tsgo/lint confirm no TS2308 ambiguity.
