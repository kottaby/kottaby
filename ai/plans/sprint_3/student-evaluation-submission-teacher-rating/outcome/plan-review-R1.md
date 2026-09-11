# Plan Review Gate — Round 1 (R1)

> **Plan:** `ai/plans/sprint_3/student-evaluation-submission-teacher-rating/` · **Gate:** Phase 1.5 (pre-implementation) · **Date:** 2026-09-11
> **Method:** `plan-review` skill dimensions executed by 4 parallel read-only review subagents against `specs.md`, `plan.md`, `tasks.md`, `deferred-items.md`, each re-reading the layer `AGENTS.md` files and re-verifying cited `path:line` evidence against the live codebase.

## Verdict: PASS after fixes (3 blocking violations found + fixed; ~8 advisories dispositioned)

Reviewers independently re-verified the evidence base: **all sampled path:line citations verified** (10/10 sampled = 100%), traceability grep clean (zero missing REQ ids), anti-pattern sweep clean (no `Translation` enum, no two-arg `getTranslations`, no string-literal `useAppTranslation`, no raw `bun test` on `test/workflows`, no bottom-nav additions, no invented paths).

## Violations Found → Fixes Applied

| # | Finding (dimension) | Fix |
|---|---|---|
| V1 | **Dead-type risk**: `EvaluationInsertType` was declared but `insertOnce` took an anonymous payload → knip would flag it (backend data layer) | `insertOnce` payload now `Pick<EvaluationInsertType, "evaluatedId" \| "evaluatorId" \| "sessionId" \| "score">` (precedent `report.repository.ts:54`); applied in `specs.md` REQ-005, `plan.md` §4.2, `tasks.md` 2.1 |
| V2 | **Journey registry gap**: `JourneyTrackedTable`/`JOURNEY_TRACKED_TABLE_DELETE_ORDER` lack `evaluations`; `track("evaluations", …)` would throw and teardown would strand rows (FK RESTRICT on `evaluator_id`) (testing) | `tasks.md` 2.2 now mandates extending the registry (insert `evaluations` before `users`) + extending `helpers.self-test.test.ts` |
| V3 | **Line-ref drift**: evaluations.ts table span cited as `:21-47` (real `:21-48`), doc-comment as `:6-19` (real `:6-20`) | Corrected in `specs.md` (inventory rows 1 & 4, REQ-003 AC1/AC4), `plan.md` (D1, §2.2), `tasks.md` 1.1 |

## Advisories — Disposition

| Advisory | Disposition |
|---|---|
| Non-tx repo reads must use `queryDb` (backend/AGENTS.md read rule) | **Adopted** — added to `specs.md` REQ-005.2, `plan.md` §4.2, `tasks.md` 2.1 (precedent `report.repository.ts:63-72`) |
| `unique` missing from drizzle-orm/pg-core import | **Adopted** — `tasks.md` 1.1 now calls it out |
| `assertPositiveSafeSessionId` is 2-arg `(id, t)`; `ApiFieldErrorType` requires `code` on field entries | **Adopted** — `plan.md` §4.1 step 2 corrected |
| `tasks.md` 3.4.IV cited frontend test AGENTS for a backend wire test | **Adopted** — corrected |
| `/student/sessions` has no route constant today | **Adopted** — `STUDENT_SESSIONS_ROUTE` creation per `STUDENT_LINK_REQUESTS_ROUTE` precedent folded into `specs.md` REQ-010 / `plan.md` §5.2 / `tasks.md` 4.3 (nav literal migrated in the same task) |
| `translation-preload.ts` does not warm `Sessions` yet | **Adopted** — `tasks.md` 4.4 now names the handles to warm (`Sessions`, `Errors`) |
| Conflicting reviewer claim that `teacher.ts` refs drifted | **Rejected** — re-verified live: `averageRating` at `teacher.ts:27`, CHECK at `:37` (original citations stand) |
| `docs/testing/workflow-journey-tests.md` naming drift (`*.test.ts` vs live `*.journey.test.ts`) | **Noted, not fixed** — live-file convention wins; the stale doc is hand-curated and out of scope |
| Stale `sharedDocuments/AGENTS.md` layout table (lists absent dirs) | **Noted, not fixed** — pre-existing doc drift, hand-curated file |

## Dimension Verdicts (post-fix)

1. Backend data layer (schema/types/repo): **PASS**
2. Services + GraphQL (service flow, barrels, authScopes, error contract): **PASS** (zero violations found)
3. Frontend + client GraphQL + i18n (seams, dialogs, deep links, parity tests): **PASS** (zero violations found)
4. Testing + traceability + anti-patterns: **PASS** (after V2 fix)

**Gate status: CLEARED.** R2 is required only if implementation reveals spec↔code drift (task 0.2).
