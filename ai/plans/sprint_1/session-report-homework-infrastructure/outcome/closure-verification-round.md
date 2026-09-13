# Closure Verification Round — Session Report & Homework Infrastructure

**Plan:** `ai/plans/sprint_1/session-report-homework-infrastructure`
**Date:** 2026-09-12 · **Scope:** independent post-closure verification of the completed plan + resolution of the two real regressions found.

This round was triggered because the plan's final-outcome closure claims had never been re-verified in the live tree after later commits landed on top of the implementation.

## Verification results (live tree)

| Check | Result | Evidence |
|---|---|---|
| Repository/DB layer (`bun run test:db`) | ✅ PASS | 33 files, 623 tests, 0 fail (runner has grown since the plan's 169-pass snapshot; zero failures/skips) |
| Services layer (`bun run test:services`) | ✅ PASS | 53 files, 1151 tests, 0 fail — includes the 3 session-report suites |
| Cross-actor journey | ✅ PASS (after fix below) | 14 pass / 0 fail, run twice (deterministic); zero DB residue after teardown |
| GraphQL SDL pins (schema-surface + session-sdl) | ✅ PASS | 42 + 20 tests, 0 fail (surface count drifted 41→42, all green) |
| GraphQL wire suite | ⏭️ SKIPPED-BY-DESIGN | runner skips all GraphQL suites under `DB_PROVIDER=pglite` (`run-server-tests.ts:630–645`); direct probe reproduces the single-connection WASM bootstrap failure recorded in `outcome/5.1-outcome.md` — identical to sibling wire suites (`parent-link.wire.test.ts`); executes in CI per deferred-items row Wire-Suite-CI |
| Documents contract suite | ✅ PASS | 11 tests, 0 fail |
| Codegen drift | ✅ PASS | `generate:gqlSchema` + `codegen` re-run → zero diff on generated artifacts |
| `bun quality-gate` (full) | ✅ PASS | tsgo 0 errors; oxlint 0-0 (1749 files); biome clean (1777 files); knip clean; lint:type-aware 0 errors; jscpd 0 clones / 1065 files — exit 0, re-run after all closure fixes |
| Deferred-items ledger | ✅ PASS | zero ❌/⚠️ rows in the table (legend lines only); D1–D5 + Wire-Suite-CI all `📅 Forward`, owned by later tickets |
| Checkbox hygiene | ✅ PASS | all 30 top-level tasks `[x]`, zero `[ ]`/`[-]` markers; every task ID maps to an outcome file (6.1–6.5 covered by `6-review-waves.md`) |
| Knowledge docs | ✅ PASS | `docs/sessions/session-report-homework.md` substantial (124 lines, 7 sections, full ruling set); `docs/sessions/session-lifecycle.md` INV-S7/S8 rows cite it as shipped |
| AGENTS.md propagation (7.2) | ✅ PASS (after fix below) | all 7 amendment files verified present in tree |

## Regression 1 — journey notification oracle (FIXED)

**Root cause:** later feature commit `12e0d653` (dual-confirmation handshake) added a student-side "completion prompt" notification emitted by the real lifecycle path (`session-lifecycle.service.ts` → `session-request-notification.service.ts:128-132`). The row shares `type=SessionCompletion`, `relatedEntityType='session'`, and `relatedEntityId=sessionId` with the report-ready wave, so the journey's per-session wave counters were off by exactly one per completed session → 5 pass / 9 fail.

**Fix (test-side only, `test/workflows/classes/session-report-homework.journey.test.ts`):**
- Discriminating predicate: the `title` copy slot differs — wave rows use `eventSessionReportReadyTitle` (EN) / its Arabic recipient-locale equivalent; the handshake prompt uses `eventSessionCompletionPromptTitle`. Verified empirically against a persisted row from the real lifecycle.
- New journey-local `reportWaveCountFor()` helper (wave-scoped inbox counter, title filter exhaustive over the two recipient locales) replaces `countNotificationsForUser` at all wave-assertion call sites (steps 1, 5, 5b, 6, 9, final purity oracle). Counts remain EXACT — nothing loosened to `>=`.
- Shared helper `test/workflows/helpers/journey-fixture-registry.ts` deliberately untouched (6 other journey tests depend on its total-inbox semantics).
- File header documents the handshake-prompt coexistence.

**Verification:** 14/14 ×2 runs; `sub-loop.ts --lifecycle duplicates` exit 0; zero DB residue.

## Regression 2 — missing AGENTS.md propagation (FIXED)

**Root cause:** task 7.2's AGENTS.md edits originally landed (commit `945e2a9c`) but were stripped by cleanup commit `a63c0a7e` (PR #125), which also deleted the Recitation Catalog section in `shared/AGENTS.md` and the whole `## Important References` list in root `AGENTS.md`. The outcome file's "all seven files carry the amendments" verdict had been true at write time and false at verification time.

**Fix:** re-applied all 7 amendments per `outcome/7.1-7.2-outcome.md`, re-anchored to each file's current structure:
1. `AGENTS.md` (root) — restored the `## Important References` section (the anchor the amendment requires) + the `docs/sessions/session-report-homework.md` line immediately after the session-lifecycle entry (+64 lines; 62 are verbatim restorations of the pre-`a63c0a7e` list, 1 is the new line, 1 the heading).
2. `shared/AGENTS.md` (+9) — "Session Report & Homework Locale Keys (existing-namespace additions)" section; all 12 key names verified verbatim against `shared/locale/types/errors/labels.ts:201-217` and `shared/locale/types/notifications/index.ts:185-199`.
3. `backend/db/repo/AGENTS.md` (+1) — Session report & homework repos Rules bullet (verified against actual repo sources).
4. `backend/services/AGENTS.md` (+1) — `SessionReportService` sole-owner bullet.
5. `backend/types/AGENTS.md` (+1) — Report*/HomeWork* types bullet.
6. `backend/graphql/AGENTS.md` (+1) — session-report surface bullet.
7. `backend/db/repo/AGENTS.md` layout-line `classes/` fix — had already landed (untouched).

Zero plan-artifact references in all new content (grep-verified); every bullet cites only `docs/sessions/session-report-homework.md`.

## Recorded observations (non-blocking)

- **Restored reference list staleness (pre-existing):** the restored `## Important References` list is verbatim from `945e2a9c`; ~28 of its doc paths point at files absent from this tree (`docs/frontend/*`, `docs/services/*`, etc.). This is the tree's pre-existing condition — the same list was equally stale at `945e2a9c` and the docs were stripped by the same cleanup commit, not by this plan. Ownership of pruning the list belongs to a docs-governance pass, not this plan.
- **Quality-gate env note:** bare `bun quality-gate` / test runners exit early in this worktree because `.env.test` is gitignored and absent; all runs used inline `DATABASE_URL` (local Postgres `kottaby_test`, SCRAM auth `postgres:postgres`) / `.env.example` placeholders. Environment-only, no files changed.
- **GraphQL wire suite**: unchanged deferral (CI/postgres); the pglite probe failure matches the recorded bootstrap limitation exactly.

## Verdict

**Both regressions fixed and verified. The plan's closure claims now hold in the live tree.** Test-Layer Coverage Gate green (with the sanctioned wire-suite CI deferral), quality gate exit 0, ledger clean, docs and rule files consistent with the shipped implementation.
