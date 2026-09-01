# Deferred Items Ledger

**Feature:** `dev1-014-parent-child-link-request-workflow-7-day`  
**Plan Directory:** `ai/plans/sprint_3/dev1-014-parent-child-link-request-workflow-7-day`  
**Created:** `2026-08-31`  
**Seeded / baseline-verified:** `2026-09-01` (Task 0.1 — see `outcome/0.1-baseline-outcome.md`)

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Cron expiry sweep + optional expiry reminder notifications | Plan | Future cron-stream ticket | 📅 Forward | — | Resolved-pointer: owned by future cron-stream ticket |
| D2 | Distinct `cancelled` link-status vocabulary | Plan | Future product ticket | 📅 Forward | — | Resolved-pointer: owned by future product ticket |
| D3 | Link revocation / `Unlinked` transition | Plan | Future revoke ticket | 📅 Forward | — | Resolved-pointer: owned by future revoke ticket |
| D4 | Partial-unique index Drizzle expressibility | Plan | Task 1.2 | ✅ Done | Task 1.2 (`outcome/1.2-schema-outcome.md` §3) | RESOLVED NATIVE — zero custom SQL. In bundled drizzle-orm 1.0.0-rc.4 the partial unique IS expressible, but via `uniqueIndex("…").on(…).where(sql`…`)` — the plan-snippet's `unique("…")` constraint-builder (`pg-core/unique-constraint.js`) has NO `.where()` (push errored `(0 , _pgCore.unique)(...).on(...).where is not a function`); unique CONSTRAINTS cannot carry WHERE predicates, unique INDEXES can. Shipped as `parent_link_requests_pending_pair_unique` on `(parent_id, student_id) WHERE status = 'pending'`; verified in BOTH app_db + app_db_test via psql `\d` (predicate visible) AND a live 23505 behavioral proof in the schema smoke test. Fallback (custom SQL + drizzle folder) did NOT fire. Flipped ✅ by Task 1.2 |
| D5 | Plan §0.2 claim "Journey harness DOES NOT EXIST — Task 2.1 must CREATE the harness" is STALE | Task 0.2 verification | Task 2.1 | ✅ Done | Task 0.2 (`outcome/0.2-prereq-outcome.md`) + Task 2.1 (`outcome/2.1-journey-test-outcome.md` §2 — harness REUSED, zero helper files created/modified) | The harness EXISTS at `test/workflows/helpers/` (barrel `index.ts:24-29`; `TrackedFixtures` `tracked-fixtures.ts:173`; `provisionStudentActor` `actor-context.ts:88`; `provisionParentActor` `actor-context.ts:122`; `SpiedFanoutTransport` `spied-transport.ts:49`; plus `createJourneyCast`, `linkStudentToParentFixture`, `setGovernanceFixture`, `journeyCleanup`, `createJourneyFixtures`; self-tests `helpers.self-test.test.ts` + `journey-fixtures.smoke.test.ts`). Task 2.1 must REUSE the barrel — NOT recreate it. Same stale claim also asserted `fanout-transport.test.ts` / `notification-engine.emit.test.ts` "do not exist": both EXIST (`backend/services/notifications/realtime/fanout-transport.test.ts`, `backend/services/notifications/notification-engine.emit.test.ts` — BOPLA smuggled-field precedent at `:421`). Downgrade of the plan step: 2.1's "CREATE harness" → "REUSE harness" (wording FIXED in tasks.md 2.1 by the 0.3 gate). Flipped ✅ by Task 2.1: the journey test imports EVERYTHING from the `@/test/workflows/helpers` barrel — no helper forked, no new helper file, no barrel edit |
| D6 | `scripts/health/sub-loop-checks.ts` `checkOxlint` exits 1 ("No files found to lint") on ANY `.md` target — no extension skip for the JS/TS-only linter | Task 0.1 (root cause) / Task 0.3 (gate re-confirmation) | Future repo-tooling ticket (outside this plan's task list) | 📅 Forward | Task 0.1 (`outcome/0.1-baseline-outcome.md` §6.2), Task 0.3 (`outcome/0.3-plan-review-outcome.md` §5) | Structural inapplicability, NOT a content violation (0 files scanned, 0 diagnostics). Compensating check `bunx jscpd -c .jscpd.json <file>` runs clean (exit 0, 0 clones) on every plan `.md`. Fix = add a non-JS/TS skip in `checkOxlint` — a dedicated tooling change, out of the doc-only boundary of tasks 0.1/0.2/0.3 |
| D7 | `shared/locale/handshakeCode-namespace.parity.test.ts` fails 2 tests on the PRISTINE baseline tree ("format-copy security pin" + "placeholder-name sets agree" — both iterate `Object.keys(errorsAr/errorsEn)` with a flat-string helper `nonEmptyLabelOf` and throw on the pre-existing nested `planCatalog`/`adminUsers` grouped blocks of the `errors` maps) | Task 1.1 (no-regression sweep; pre-existing proven via `git stash` → rerun → same 2 fails → `git stash pop`) | Future repo-hygiene ticket (outside this plan's task list) | 📅 Forward | Task 1.1 (`outcome/1.1-i18n-outcome.md` §5) | NOT caused by 1.1 (failure names `handshakeCode.ar.planCatalog`, a grouped block added before this ticket; 1.1's five errors keys are flat strings and 1.1's prescribed suites — errors/notifications/parentLink parity + navItems — are all GREEN). Fix = make the two sweeps walk nested grouped blocks (mirror `assertEveryLeafNonEmpty` from `errors-namespace.parity.test.ts:87-103`). Out of 1.1's file boundary — reported, not silently ignored |
| D8 | Tasks 4.2.BF / 4.2.BS / 4.3.BF / 4.3.BS agent-browser functional + visual/screenshot self-loops NOT executed — the sandbox dev server on port 3000 was DOWN for the entire 4.2+4.3 dispatch window (mandated: do not kill/restart it), so no browser session, no fixtures, no screenshots | Task 4.2+4.3 (final pass 3) | Orchestrator follow-up dispatch with a running dev server (`bun run dev`) | 🔄 In Progress | Task 4.2+4.3 (`outcome/4.2-4.3-frontend-views-outcome.md` §Carry-forwards) | ALL non-browser gates for 4.2/4.3 are GREEN (tsgo 0 errors; test:ui:components 221/0 across 16 files incl. the three new/updated component suites; navItems 15/0, documents 15/0, apolloCache 10/10 all byte-untouched; QL exit 0 on every touched file) — only the live-browser loops remain. Component-tier coverage already pins the same flows the BF loops drive (render branches, dialog flows, denial waves, refetch) via Apollo MockedProvider; the browser passes add real-session wiring, cross-probe redirects, and RTL/screenshot polish. Flip ✅ when a dev-server-enabled dispatch completes the four loops |

---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan

---

## Seed Verification (Task 0.1, 2026-09-01)

- **Open ❌/⚠️ items in the Ledger Table at seed time: 0.** D1–D3 are 📅 Forward (informational, owned by future tickets, non-blocking for this plan); D4 is 🔄 In Progress (decision point owned by Task 1.2, not blocked/partial).
- **Re-verified at the 0.3 plan-review gate (2026-09-01):** open ❌/⚠️ items in the Ledger Table are STILL **0** (D4/D5 🔄 owned by 1.2/2.1; D1–D3 + D6 📅 Forward).
- **Re-verified at Task 1.2 (2026-09-01):** open ❌/⚠️ items in the Ledger Table remain **0** — D4 flipped 🔄 → ✅ (resolved natively, see the D4 row); D5 stays 🔄 owned by Task 2.1; D1–D3 + D6 📅 Forward.
- **Re-verified after Task 1.1 (2026-09-01):** open ❌/⚠️ items in the Ledger Table remain **0** (D4/D5 🔄 owned by 1.2/2.1; D1–D3 + D6 + D7 📅 Forward — D7 is the pre-existing `handshakeCode` parity-suite defect reported by 1.1, owned by a future repo-hygiene ticket).
- Note for the final quality gate: the ❌/⚠️ glyphs also appear in this legend section as status *definitions* — enforcement counts must be taken over the **Ledger Table rows** (currently zero), not raw whole-file `grep -c`.
- Structure derives from `.agents/spec-process-guide/templates/deferred-items-template.md` (ID / Deferred Item / Source Task / Target Task / Status / Verified By / Notes) with the plan-provided 📅 Forward status added; pre-seeded with the FOUR plan-provided resolved-pointers (D1–D4) per task 0.1 of `tasks.md`.
- Baseline captured 2026-09-01: `tsgo` = 0 errors (exit 0) · `biome:check` = 0 warnings / 0 errors, "No fixes applied" (exit 0) · `lint-service --id baseline` = exit 0, full-repo, empty output (0 findings) · `git diff --name-only` = 0 files, `git stash list` = 0 entries. Full evidence: `outcome/0.1-baseline-outcome.md`.
