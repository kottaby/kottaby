# Task 0 — Phase-0 Baseline & Evidence Pack

> **Plan:** `ai/plans/sprint_3/student-evaluation-submission-teacher-rating/` · **Date:** 2026-09-11 · **Author:** plan-generation swarm
> **Extended 2026-09-12** with the Task 0.1 implementation-time baseline re-verification (§5–§9 below).

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

---

# Task 0.1 — Implementation-Time Baseline Re-Verification

> **Date:** 2026-09-12 18:2x UTC · **Executor:** Phase 0 Baseline Subagent · **Branch:** `feat/student-evaluation-submission-teacher-rating` @ `2bdea32` (== `main`; no implementation commits exist yet)

## 5. Fresh Baseline Runs (raw output, this session)

| Check | Command (as run from repo root) | Raw result | Evidence file(s) |
|---|---|---|---|
| TypeScript | `bun run tsgo 2>&1 \| grep "error TS" \| wc -l` | **`0`** (tsgo pipeline exit 0) | `/tmp/baseline-tsgo.txt` (count) · `/tmp/baseline-tsgo-full.txt` (full output) |
| Biome | `bun run biome:check 2>&1 \| grep -c "warn"` | **`0`** (script exit 0; tail: `Checked 1777 files in 13s. No fixes applied.`) | `/tmp/baseline-biome.txt` · `/tmp/baseline-biome-full.txt` |
| ESLint | `bun run scripts/lint-service.ts --json --id baseline-dev2-016 > /tmp/baseline-lint.json 2>&1` | **`exit=0`**; JSON: `"success": true`, `"exitCode": 0`, `"output": ""`, `"scope": "full-repo"`, `"durationMs": 106967` (~107 s) | `/tmp/baseline-lint.json` |
| Git | `git stash list` · `git diff --name-only` | stash: **0 entries** · diff: **0 files** (clean tree) | `/tmp/baseline-stash.txt` · `/tmp/baseline-files.txt` |

**Delta vs planning-time baseline (§1): none** — tsgo 0 = 0 · biome clean = clean · lint exit 0 = exit 0. Non-quality deltas only: biome file count 1775 → 1777 (repo grew; still zero fixes applied); lint duration ~14 s → ~107 s (sandbox slowness, not a quality signal).

## 6. Environment Verification

- `.env` intact — **no restore was needed**: `DB_PROVIDER=postgres`, `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/app_db`, `DATABASE_ENCRYPTION_KEY`/`CRON_SECRET`/`GRAPHQL_ENCRYPTION_KEY` (base64 values present), `ADMIN_EMAIL=admin@app.local`, `ADMIN_PASSWORD=adminpassword123`, `CACHE_PROVIDER=postgres`, `REDIS_PROVIDER=local`.
- **PostgreSQL 17.11** live at `127.0.0.1:5432/app_db` (`select version()` → `PostgreSQL 17.11 (Debian 17.11-0+deb13u1)…`; server PID 1855, binaries `/tmp/pg-extracted/usr/lib/postgresql/17/bin/`, data `/tmp/pgdata`).
- Phase-1-relevant DB facts (inputs to task 1.1): `select count(*) from evaluations` → **0** (zero writer rows → no data-loss risk on `db push`); `pg_constraint` count for `evaluations_session_evaluator_unique` → **0** (constraint not yet applied).

## 7. Sandbox Environment Notes — pre-existing issues to IGNORE during review

1. **lint-service ran CLEAN this session** — the sandbox OOM/SIGABRT documented in `worklog.md` (Phase 7 wave) did **not** reproduce here. Keep the historical 4 GB-RAM caveat, but do not treat lint OOM as a current failure.
2. **Branch flip quirk:** the sandbox silently reset `HEAD` back to `main` mid-session (matches the "sandbox git-restore warfare" note in `worklog.md`). Re-checked-out `feat/student-evaluation-submission-teacher-rating`; both branches sit at `2bdea32`, so every baseline number above is valid for that commit.
3. Untracked `postgresql_17+278_all.deb` at repo root — sandbox Postgres installer artifact, pre-existing, **not** part of the plan's diff baseline (`git diff --name-only` is empty).
4. `bun run biome:check` auto-fixes (`--write --unsafe`, repo convention) — it applied **no changes** this session (`No fixes applied`).

## 8. Deferred-Items Ledger Verification (D1..D4 + cross-ticket)

All four rows present; **Status column values (quoted):** D1 `📅 Deferred` · D2 `📅 Deferred` · D3 `📅 Deferred` · D4 `📅 Deferred` (each "Verified By: plan author"). Citation spot-checks against the live tree:

- D1 → `backend/db/schema/teachers/evaluations.ts:33` = `notes: text("notes"),` ✅ exact.
- D2 → `backend/enum/notifications/notification-type.enum.ts:12` = `EvaluationResult = "evaluation_result",` ✅ exact.

Cross-ticket section `## Known Cross-Ticket Deferrals (NOT this plan's ledger entries)` present with all 4 rows (teacher.average_rating → DEV2-017; parent-portal display → DEV1-016/DEV1-017; admin CRUD → DEV3-016 family; search-ranking → matching engine). **No new deferments discovered** (verification-only phase; ledger left untouched).

## 9. Task 0.2 — Plan-Review Gate: NOT cleanly cleared (drift found)

`outcome/plan-review-R1.md` exists; verdict "PASS after fixes" / "**Gate status: CLEARED.**". Light re-verification of the three R1 fixes:

| Fix | Target artifact | Status |
|---|---|---|
| V1 typed payload | `tasks.md` 2.1: `insertOnce(values: Pick<EvaluationInsertType, "evaluatedId" \| "evaluatorId" \| "sessionId" \| "score">, tx)` + `report.repository.ts:54` precedent | ✅ present |
| V2 registry mandate | `tasks.md` 2.2: "**Registry extension (required first)**" (add `evaluations` to tracked-table union + delete order before `users`) + `helpers.self-test.test.ts` extension | ✅ present |
| V3 corrected line refs | `specs.md` inventory rows 1/4 → `:21-48` / `:6-20`, REQ-003 AC4 → `:6-20`; `plan.md` D1 → `:21-48`, §2.2 → `:6-20` | ✅ present — **except `tasks.md` 1.1** |

**Drift found:** `tasks.md:58` (task 1.1) still cites the header doc-comment as `(:6-19)` — the exact pre-fix value R1 flagged. Real span is `:6-20` (doc-comment closes with `*/` on line 20 of the live `backend/db/schema/teachers/evaluations.ts`; re-verified this session), and every other V3 target carries `:6-20`. The stale ref is present in the only commit that ever touched `tasks.md` (`7afd194`), i.e. the R1 fix never landed there.

Per the 0.2 protocol this subagent **STOPPED**: no "R1 confirmed" section was appended to `plan-review-R1.md`, the `0.2` checkboxes remain unchecked, and R2 was NOT authored. **Orchestrator action needed:** apply the one-character correction (`:6-19` → `:6-20` at `tasks.md:58`), then re-run this light check (or adjudicate) and flip 0.2. Note this is a stale plan-internal citation, **not** spec↔code drift — the specs/plan refs are correct and match the live file.

> **✅ Resolution (2026-09-12, later the same session):** the orchestrator applied the one-character fix (`tasks.md:58` now reads `(:6-20)`). Re-verification confirmed all three R1 fixes present (V1 `tasks.md:95`, V2 `tasks.md:110`, V3 clean — zero `:6-19`/`:21-47` refs remain in `tasks.md`; `:21-48`/`:6-20` stand in `specs.md`+`plan.md`; `tasks.md` 1.1's `(:42-47)` constraint ref verified accurate against the live file). **Gate CLEARED** — recorded as "Implementation-time re-verification (R2 — drift resolved)" at the end of `outcome/plan-review-R1.md`; the `0.2` checkboxes are now flipped `[x]`.
