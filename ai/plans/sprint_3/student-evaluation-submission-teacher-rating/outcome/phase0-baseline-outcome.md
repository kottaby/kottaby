# Task 0 (Planning) — Phase-0 Baseline & Evidence Pack

> **Plan:** `ai/plans/sprint_3/student-evaluation-submission-teacher-rating/` · **Date:** 2026-09-11 · **Author:** plan-generation swarm

## 1. Baseline Measurements (recorded at plan-generation time)

| Check | Command | Result |
|---|---|---|
| TypeScript | `bun tsgo 2>&1 \| grep -c "error TS"` | **0 errors** |
| Biome | `bun run biome:check` | **clean** ("Checked 1775 files … No fixes applied") |
| ESLint (full repo, JSON) | `bun run scripts/lint-service.ts --json --id baseline-dev2-016` | **exit 0, success: true, 0 diagnostics** (~14s) |

Executor duty (task 0.1): re-run all three at implementation start; attribute any delta to other in-flight work before touching it.

## 2. Verified Evidence Pack (what this plan was built on)

Eight read-only explorer subagents verified the following; every `path:line` in `specs.md`/`plan.md` traces to one of these checks:

1. **Evaluations table EXISTS** at `backend/db/schema/teachers/evaluations.ts:21-47` with the C.3 shape (evaluated_id/evaluator_id → users.id; nullable session_id → session.id SET NULL; `score` int + CHECK 0–100 :43; soft-delete pair :34-35; per-FK indexes :44-46) — and **no unique constraint**.
2. **`teacher.average_rating` EXISTS** (decimal(3,2), CHECK 0–5, nullable, no default): `backend/db/schema/teachers/teacher.ts:27,37` — untouched by this plan (DEV2-017).
3. **No evaluation repo/service/GraphQL surface exists** — verified zero writers outside the test fixture `createTestEvaluation` (`backend/db/test/entity-setup.ts:412-418`).
4. **Session gating inputs exist**: `status` + `confirmedByTeacherAt`/`confirmedByStudentAt` (`backend/db/schema/classes/session.ts:54-70`); DEV2-016 consumption rule at `docs/sessions/session-lifecycle.md:163`; oracle-collapse rule at :131.
5. **Reference implementations verified**: `submitSessionReport` service/mutation pair (authScopes `$all`, `withTransaction`, 23505→ConflictError mapping), `confirmSessionCompletion` participant-gate idiom, `subscription-purchase.mutation.ts:60-65` student-role scope.
6. **Error contract**: `VALIDATION`=422 is shape-only; domain states use custom ConflictError codes that never map to HTTP statuses (`docs/graphql/error-handling-contract.md:42-56`).
7. **i18n reality**: `useAppTranslation(handle)` object (not string/enum), `getTranslations(locale)` ONE arg, `ctx.t("errorsTranslations")` awaited — verified signatures; several doc/template references are stale (recorded in plan-review outcome).
8. **Frontend seams**: CTA seam `useStudentSessionConfirm.ts:152-175`; dialog pattern `CancelSessionConfirmDialog`; deep-link map `frontend/lib/notification-route-resolution.ts:35-50`; no rating UI exists anywhere (greenfield).
9. **Test infrastructure**: entity-setup factories (:72/:102/:301/:412/:522), `runInRollback` + `expectRepoError` + `constraintNameOf` (`backend/db/test/test-utils.ts:34/77/111`), journey harness (`test/workflows/` — no runInRollback, committed fixtures, registry cleanup), wire tests (`setupTestServerLifecycle` + `testClient`), component tests (`renderWithWrapper`, translation preload).
10. **Plan-file conventions**: new plans live at `ai/plans/sprint_N/<kebab-title>/`; trio specs/plan/tasks + deferred-items + outcome/; QL/TE/SEC/SR/IV subtask pipeline.

## 3. Decisions Taken During Planning (also D1–D13 in plan.md)

Directory naming: `ai/plans/sprint_3/student-evaluation-submission-teacher-rating/` (kebab-case of the ticket title, no ticket-id prefix — matches current convention after the finished-plans prefix-stripping rename observed 2026-09-11).

## 4. Carry-Over Points for Executors

- The evaluations table doc-comment still says sheikh-only — task 1.1 fixes it.
- If the student's sessions documents lack `confirmedByTeacherAt`/`confirmedByStudentAt`, task 4.1 adds them (verified present at planning; recheck after codegen).
- `errors.sessionRatingRange` ("0 and 5") is the REPORT flow's key — do not touch (REQ-007.2).
