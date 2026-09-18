# Plan Review Report — Tajweed Curriculum Lessons CRUD

## Review Round: R1
## Date: 2026-09-17
## Reviewer: plan-generation session (Phase 1.5 gate, spec-driven-development skill)
## Subagents Dispatched: 4 explore agents (fact verification) + orchestrator self-audit

---

## Summary

- **Total issues found:** 3 (all fixed during generation, before this file was written)
- **Blocking (CRITICAL/HIGH):** 0
- **Medium:** 0 (one chunk-overwrite incident caught and fully remediated — see Finding 2)
- **Low/Notes:** 3

**Verdict: Plan passes all AGENTS.md rules for affected layers.**

---

## Review Method

Every citation in this plan was produced under verify-then-claim discipline: a 4-agent exploration wave verified the
ground-truth anchors (schema, clone-lineage stack, i18n, test harness, frontend, seeds) with line-accurate excerpts
BEFORE any artifact was written, and the orchestrator re-read the highest-risk files directly. The post-generation audit
then ran the four mandatory checks on the finished trio + ledger:

1. **Truncation check** — last line of each artifact is a complete row/sentence: PASS (specs.md 168 lines,
   plan.md 351 lines, tasks.md 293 lines, deferred-items.md 43 lines).
2. **Structure check** — `plan.md` contains every mandated section: §1 Overview+decisions D1–D11, §2 UX/Nav, §3 Data
   Models, §4 Services/Repo signatures + concurrency assessment, §5 API Contracts+SDL+permission matrix, §6 Security/Tenancy
   mitigations, §7 Journey Design (explicit single-actor ruling), §8 i18n, §9 Testing, §10 Outcome protocol: PASS.
3. **Traceability check** — `for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo
   MISSING: $r; done` → **zero misses** (36/36 REQs: REQ-001..004, 010..018, 030..035, 040..044, 050..053, 060..063,
   070..071, 080..081; the tasks.md traceability table lists each individually so range tokens never mask a gap).
4. **Anti-pattern sweep** — no `Translation.` enum (the repo has none — namespace handles are used throughout),
   no two-arg `getTranslations`, no `@/frontend/utils/logger` (plan cites no frontend logger; the repo logger paths
   are `@/backend/lib/logger` for backend), no raw `bun test` on workflows (all suites route through
   `bun run test/scripts/run-test.ts`), no bottom-nav (the only mentions are explicit negative rulings), no invented
   paths (every cited path:line came from the verified fact pack or an orchestrator re-read): PASS.

---

## Dimension Findings (plan-review skill checklist)

| Dimension | Status | Evidence |
|---|---|---|
| Paths existence | ✅ PASS | All cited anchors from the 4-agent fact pack + orchestrator re-reads (`backend/db/schema/classes/lessons.ts:17-30`, clone-lineage files, locale files, barrels, test helpers, seeds tree). |
| i18n compliance | ✅ PASS | `useAppTranslation(Lessons)` handle pattern, single-arg `getTranslations(locale)`, `getServerTranslations(locale)` (`shared/locale/server-graphql.ts:3`), `lessonCatalog` error group mirrors `PlanCatalogErrorsLabels` (`:8-19`/`:71`). |
| GraphQL accuracy | ✅ PASS | `authScopes` semantics verified (`backend/graphql/pothos/builder.ts:28-42`); barrel side-effect import rules followed (`mutation`/`query` AGENTS.md); documents naming + `id` rule per `sharedDocuments/AGENTS.md`. |
| Component props | ✅ PASS | UI clones the shipped `frontend/views/admin/plans/**` stack; no `AppDataGrid` (does not exist), no `RequirePermission` (does not exist) — `withPageAuth` is the gate. |
| Permissions/enums | ✅ PASS | `UserRole` value imports; `AuditActionType.Delete` confirmed at `backend/enum/audit/audit-action-type.enum.ts:10`. |
| Architecture (three-tier) | ✅ PASS | repo→service→GraphQL layering; client components use Apollo hooks; server page uses `withPageAuth` + container hand-off. |
| Cross-reference consistency | ✅ PASS | Zero REQ misses; ledger D1–D5 match `plan.md` §10 pointers; every task cites its files; the four ticket test scenarios map to named suites (tasks.md oracle map). |

---

## Detailed Findings & Fixes Applied (all during generation)

1. **[LOW][i18n]** `specs.md` REQ-063 contained a casing typo (`LESSonsLabels`).
   - **Fix Applied:** corrected to `` `LessonsLabels` interface `` via exact-match edit; re-grepped — zero occurrences of the typo remain.
2. **[MED][chunking-discipline] `plan.md` chunks 1–6 were briefly lost** when the final checklist chunk was written without `mode: "append"`, overwriting the file.
   - **Fix Applied:** all seven chunks were re-written from preserved context (chunks 2–7 with explicit `mode: "append"`); integrity re-verified — 351 lines, all 13 section headers present, tail complete. Root cause noted for future generation runs: EVERY non-first Write call must carry `mode: "append"`.
3. **[LOW][paths]** The exploration fact pack reported `backend/db/seeds/classes/` as existing (derived from AGENTS.md layout text); the orchestrator's own `ls` showed the on-disk seeds tree has only `billing/`, `lib/`, `students/`, `users/`.
   - **Fix Applied:** plan.md §4.4 and tasks.md 2.3 record `backend/db/seeds/classes/` as a NEW sub-directory (CREATE, not UPDATE). Also refined dashboard-label anchors by direct grep (`shared/locale/types/dashboard/index.ts:39`, `en/ar/dashboard/index.ts:15`) rather than trusting the agent's approximated lines.

## Post-Fix Verification

- [x] Truncation check — all four artifacts end on complete lines
- [x] Structure check — all mandated plan.md sections present (13 headers verified)
- [x] Traceability — 36/36 REQ tokens present in tasks.md (grep oracle, zero misses)
- [x] Anti-pattern sweep — clean (only negative rulings for bottom-nav; zero `Translation.` enum usage, zero two-arg `getTranslations`, zero raw workflow-test invocations)
- [x] Ledger — D1–D5 all ✅ recorded pointers; row-scoped ❌/⚠️ grep = 0
- [x] Verdict recorded: **"Plan passes all AGENTS.md rules for affected layers."**

## Carry-Over Notes for Implementation

- The zero-schema-delta gate (`git diff backend/db/schema/** backend/drizzle/**` = empty at completion) is task 5.2's check — any temptation to "fix" the nullable `title`/`plan_id` columns mid-flight is a ledger entry, never a migration.
- `createTestLesson(tx, planId, overrides)` uses a POSITIONAL required `planId` (entity-setup has no natural default for it) — verify against `createTestPlan` (`backend/db/test/entity-setup.ts:178-198`) before use.
- The concurrency model needs NO locks: all guards are single-statement conditional writes; prove with `Promise.allSettled` (tasks 2.1/2.2).
- When the Student Progress ticket starts, its agent MUST read this outcome directory first (REQ-071 contract: `listByPlanId` id ASC + `findById` + `createTestLesson` + NULL-lesson tolerance).
