# Task 3 — Shared verification-plan constants

- **Date:** 2026-09-14
- **Branch:** `feat/verification-plan-purchase-5-sessions`
- **Requirements:** REQ-1.1-1.4 · **Design:** plan.md §D6 · **Spec:** specs.md REQ-1

## Summary of what was implemented

1. **CREATE `shared/constants/verification-plan.constants.ts`** — exports exactly two symbols:
   - `VERIFICATION_PLAN_TITLE = "New Teacher Verification & Evaluation Plan" as const`
   - `VERIFICATION_PLAN_SESSION_COUNT = 5 as const`
   Production-grade docblock explains the pin: the title is the seeded plan's identity and the **server-side resolution key** for verification purchases (exact-title match against the ACTIVE catalog, per plan §D6 / `docs/billing/plan-catalog.md`), and the session count is part of the product contract (five evaluation sessions). No plan-artifact references in code. Module imports nothing (zero imports by design — sibling `free-trial.constants.ts` / `session-fees.constants.ts` posture).
2. **Seeded-title verbatim check (per dispatch instruction):** grepped `backend/db/seeds/billing/seed-plans.ts` BEFORE writing — the seeded entry carried exactly `title: "New Teacher Verification & Evaluation Plan"`, `sessionCount: 5` (previous :53-54). **Seeded title == dispatch constant, char-for-char — no discrepancy; the dispatch value was used.**
3. **Barrel registration** — `shared/constants/index.ts` gained `export * from "./verification-plan.constants";` appended last, preserving the barrel's existing alphabetical `export * from "./x.constants"` formatting (root AGENTS.md barrel mechanics: `export *` default, relative `./` paths, re-exports only).
4. **UPDATE `backend/db/seeds/billing/seed-plans.ts`** — the verification plan entry in `INITIAL_DEMO_PLANS` now sources `title: VERIFICATION_PLAN_TITLE` and `sessionCount: VERIFICATION_PLAN_SESSION_COUNT` via a deep import (`@/shared/constants/verification-plan.constants` — the barrel is not consumed by the seeder; shared/AGENTS.md prefers deep imports). Import placed last per the repo's `@/backend/**` → `@/shared/**` ordering convention (cf. `audit-trail.service.ts`). The entry's comment was extended by two lines explaining WHY the fields are sourced from shared constants (server-side resolution key). **No other seed semantics changed** — price/currency/intervalDays/lane/active untouched; `seedOrGet` title-matching flow, race recovery, and lane reconciliation untouched.
5. **Tests (3.TE)** — two layers of pinning:
   - **Extended `backend/db/test/logic/billing/plan-seed.test.ts`:** the DB-backed seeding test now finds the verification plan row by `VERIFICATION_PLAN_TITLE` (not a string literal) and pins `title === VERIFICATION_PLAN_TITLE`, `sessionCount === VERIFICATION_PLAN_SESSION_COUNT`, and `sessionCount === 5`; added a dedicated no-DB "drift pin" test asserting `INITIAL_DEMO_PLANS` itself carries the constants (seed-spec-level pin, so spec-vs-persisted drift is caught even without a DB).
   - **Added colocated `shared/constants/verification-plan.constants.test.ts`** (per repo convention — sibling `session-fees.constants.test.ts` / `handshake-code.constants.test.ts`): 11 cases across Tier 1 (exact string "New Teacher Verification & Evaluation Plan", exact 5, primitives only), Tier 2 (title fitness as a resolution key: trimmed, single line, ≤ varchar(100)), Tier 3 (export surface = exactly the two constants, descriptor inspection, barrel `Object.is` identity re-export, purity pins: zero imports / zero `process.env` / `export const` declarations, exactly one additive barrel line), plus the **compile-time pin** using the repo conformance-suite idiom (`type Equals<A, B> = [A, B] extends [B, A] ? true : false` with `const x: Equals<typeof CONST, literal> = true` consumed via an unknown-taking helper) — a widened `string`/`number` declaration now fails tsgo.

## Files created/modified

| File | Change |
|---|---|
| `shared/constants/verification-plan.constants.ts` | **CREATE** — the two `as const` constants + docblock |
| `shared/constants/index.ts` | One additive barrel line (alphabetical position) |
| `backend/db/seeds/billing/seed-plans.ts` | Verification entry sources `title`/`sessionCount` from the shared constants (+2 comment lines, +1 import) |
| `shared/constants/verification-plan.constants.test.ts` | **CREATE** — 11-case pure-unit constants suite incl. compile-time literal pin |
| `backend/db/test/logic/billing/plan-seed.test.ts` | Constant-based verification-plan pins (DB row + seed spec) + drift-pin test; header docblock updated |

**Files NOT modified (deliberately):** `shared/constants/free-trial.constants.ts` / `session-fees.constants.ts` / `handshake-code.constants.ts` (their colocated suites are additive-tolerant — re-ran both to prove it: 15/15 and 59/59 green), `backend/services/billing/plan-catalog.service.ts` (no signature/behavior change), `backend/db/seeds/billing/index.ts` / `backend/db/seeds/index.ts` (barrels unaffected), `frontend/**` (no consumer yet — Tasks 4/5/9/10 wire the constants per plan), and **all Task 2 files** (`backend/db/repo/teachers/applicant.repository.ts`, `backend/services/teachers/applicant-lifecycle.service.ts`, `shared/locale/**`) — owned by the parallel subagent, untouched.

## Verification results

### Sub-loop (per edited file, `--lifecycle duplicates`) — all exit 0

| File | Result |
|---|---|
| `shared/constants/verification-plan.constants.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `shared/constants/index.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `shared/constants/verification-plan.constants.test.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ (1 mid-task tsgo error TS2769 + 2 sonarjs/no-trivial-assertions found and fixed; re-run green) |
| `backend/db/seeds/billing/seed-plans.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `backend/db/test/logic/billing/plan-seed.test.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |

### tsgo final count

`bun tsgo` (full project) → **0 errors** (baseline 0, still 0).

### Test runs (exact commands + counts)

| Command | Result |
|---|---|
| `bun run test/scripts/run-test.ts shared/constants/verification-plan.constants.test.ts` | **11 pass / 0 fail** (39 expects) — new suite |
| `bun run test/scripts/run-test.ts backend/db/test/logic/billing/plan-seed.test.ts` | **2 pass / 0 fail** (22 expects) — 1 pre-existing idempotency test (now constant-pinned) + 1 new drift-pin test |
| `bun run test/scripts/run-test.ts shared/constants/session-fees.constants.test.ts` | **15 pass / 0 fail** (85 expects) — barrel regression proof |
| `bun run test/scripts/run-test.ts shared/constants/handshake-code.constants.test.ts` | **59 pass / 0 fail** (358 expects) — barrel regression proof |

## 3.SEC — Security review conclusion

**Constants are read-only data — no env coupling, no secrets, no surface change.** The module contains zero imports, zero `process.env` reads (purity-pinned by test), and two immutable primitive exports; nothing is configurable at runtime, so no env key needed registering. The seed change alters WHICH EXPRESSION the plan spec reads its title/count from (constant vs duplicated literal) — the resulting data is byte-identical, so no DB mutation, no permission change, no read/write scope change anywhere. Resolution-by-title remains server-side-only (REQ-1.2): the client still never sends a plan id; the constant merely names what the server resolves.

## 3.SR — Semantic review checklist

- **`shared/` imports nothing from frontend/backend/app:** verified — zero import statements in the constants module (test-pinned).
- **Barrel conventions honored:** `export * from "./verification-plan.constants";` appended in alphabetical position; relative `./` path; re-exports only (root AGENTS.md "Barrel mechanics" + shared/AGENTS.md).
- **Deep import over barrel in the seeder:** the seed imports `@/shared/constants/verification-plan.constants` directly (shared/AGENTS.md "Prefer deep imports"); no new barrel consumer created.
- **No seed-semantics change:** price/currency/intervalDays/balanceLane/shouldBeActive untouched; `seedOrGet` matching/recovery/reconciliation logic untouched; idempotency behavior re-proven by the still-green seeding test.
- **No module state, no `console.*`, no env reads:** two immutable exports only.
- **No plan-artifact references in code/JSDoc:** verified — comments describe the domain contract only.
- **Enums:** none used (no enum surface in this change).
- **No unrelated refactors:** the diff touches exactly the pinned surface.

## 3.IV — Instruction verification

Rule files printed by sub-loop.ts and read before/while validating: root `AGENTS.md`, `shared/AGENTS.md` (shared layer, read pre-task), `backend/AGENTS.md`, `backend/db/seeds/AGENTS.md` (read pre-task per dispatch), `backend/db/test/AGENTS.md`, `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`. Validation per file:

- **Constants module:** complies with `shared/AGENTS.md` (layer isolation — zero cross-layer imports; `shared/constants/` is the designated home for "stable domain constants"; safe-to-import-from-any-layer posture matches sibling constants).
- **Barrel:** complies with root `AGENTS.md` barrel mechanics and `shared/AGENTS.md` import convention (barrels may use relative `./` re-exports; deep import preferred for the consumer).
- **Seed file:** complies with `backend/db/seeds/AGENTS.md` + `backend.instructions.md` Seeds section — no `@/backend/db/**` import introduced (ESLint seed restriction untouched and passing), still consumes `PlanCatalogService` exclusively, still idempotent, still one-seeder-per-table; the shared import is data-only (constants), matching the allowed-imports spirit (domain seed data sourcing its canonical identity from shared).
- **Test files:** `plan-seed.test.ts` complies with `backend/db/test/AGENTS.md` + `tests.instructions.md` (`runInRollback` + `tx` everywhere, entity-setup helpers only, no seed-data queries — the seeder writes its own rows in-tx, no `any`, no `console.*`); the constants suite is pure unit (NO DB/network/env), mirroring the sanctioned sibling pattern (`session-fees.constants.test.ts`), uses the repo conformance-suite `Equals` idiom for the compile-time pin, and asserts translated-data contracts only.

## Carry-forward knowledge for future tasks

- **Consumers may import from `@/shared/constants/verification-plan.constants` (deep) or the `@/shared/constants` barrel — both are pinned by identity tests.** Task 5 (`VerificationPurchaseService`) resolves the plan via `find(p => p.title === VERIFICATION_PLAN_TITLE)`; Task 4's journey + Task 9's dialog title-match the same constant; Task 4 fixtures use `createTestPlan(tx, { title: VERIFICATION_PLAN_TITLE, sessionCount: VERIFICATION_PLAN_SESSION_COUNT, … })`.
- **The compile-time pin makes the constants non-widenable**: if anyone drops `as const` or changes the literal, `bun tsgo` fails in `shared/constants/verification-plan.constants.test.ts` BEFORE the runtime suite runs. Changing the title is therefore a two-file edit (constants module + this pin's literal) by design.
- **Seed convergence note:** the seeder reconciles EXISTING rows only on balanceLane and active-flag — title/sessionCount are insert-time-only (title is the lookup key). Any pre-existing DB already holding the old literal is unaffected by this refactor (values are identical).
- **The verification entry's price/currency/intervalDays remain seed-local literals** ("150.00"/"EGP"/14) — the plan (§D6) deliberately pins ONLY identity (title) + contract (session count) to shared constants; a future ticket wanting shared price constants should extend this module rather than re-literalizing.

## Cross-file dependencies discovered

- **None blocking.** The constants module is a leaf dependency: Task 5's service, Task 4's journey, and Task 9's dialog will import it; no file outside this task's scope required changes now. The parallel Task 2 surface (applicant repo/service, locale errors) is fully disjoint from these files — zero merge friction (verified: my only shared-layer touch is a new module + one additive barrel line).
