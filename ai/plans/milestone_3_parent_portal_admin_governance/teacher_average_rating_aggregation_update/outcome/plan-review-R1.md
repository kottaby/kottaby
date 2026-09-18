# Plan Review Report — Teacher Average Rating Aggregation & Update

**Round:** R1 (generation-time Phase 1.5 gate)
**Date:** 2026-09-17
**Plan:** `ai/plans/milestone_3_parent_portal_admin_governance/teacher_average_rating_aggregation_update/`
**Subagents dispatched:** 2 explore-scope reviewers, parallel — (1) path/citation veracity over all four plan artifacts, (2) rule compliance (anti-patterns, template skeletons, EARS, i18n, task checkboxes, semantic soundness, quality-gate realism).

---

## Summary

The plan is structurally complete and compliant; the review found **0 CRITICAL**, **2 HIGH**, **0 MEDIUM**, **3 LOW** findings. Both HIGH findings and the one substantive citation error were **fixed in the plan files in the same session** (fixes listed below). The LOW findings were either fixed (naming alignment) or accepted as-is (one AC carries an inline rationale note after restructuring). Verdict after fixes: **Plan passes all AGENTS.md rules** — zero feature-specific findings remain.

## Findings by Dimension

| Dimension | Verdict | Findings |
|---|---|---|
| Path & citation veracity (reviewer 1) | 1 real error + 6 line drifts | Locale-key line range wrong; the rest 1–4 line drifts |
| Anti-pattern sweep | Clean | No `Translation.` enum, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test`, no bottom-nav additions, no invented paths, no `expect().rejects` in rollback, zero-schema-change honored |
| Template compliance (specs/plan/tasks skeletons) | Clean | All mandatory sections present in all three artifacts |
| EARS format | Clean after fix | REQ-007.2 rationale restructured into a sub-bullet |
| i18n rules | Clean | Zero-new-keys ruling holds; one-arg signatures cited correctly; internal-error non-localization justified |
| Task-template compliance | Clean | All 5 mandatory subtask checkboxes on every implementation task; traceability grep run — **zero missing REQs** |
| Semantic soundness | 2 HIGH (fixed) | numeric→string cast; overstated READ COMMITTED convergence |
| Quality-gate realism | Clean | `scripts/health/sub-loop.ts --lifecycle duplicates` verified to exist and accept the stage |

## Detailed Findings

### HIGH-1 — `avg(...)::numeric` returns a JS string (type lie) — FIXED
- **Where:** `plan.md` §4.2 code block + D6, `specs.md` REQ-005.1, `tasks.md` 2.1.
- **Problem:** Drizzle `sql` templates bypass column mappers; pg returns bare `numeric` as a JS **string**, so `averageScore` would arrive as `"65.[…]"` contradicting `number | null` — and the service's `/ SCORE_POINTS_PER_STAR` would work only by implicit coercion.
- **Fix applied:** `avg(${evaluations.score})::float8` everywhere, with the load-bearing rationale added (mirrors the repo's own precedent at `platform-analytics.repository.ts:366-403`, which casts to float "so the values arrive as floats"); repo-test boundary wording updated to assert exact JS numbers.

### HIGH-2 — Overstated READ COMMITTED convergence claim — FIXED
- **Where:** `plan.md` §4.3 row 1, `specs.md` REQ-010.2 + REQ-J3.
- **Problem:** "the last commit converges to the true mean" is false in general — the later-committing transaction may have aggregated BEFORE the earlier one committed, leaving a committed subset average (safe, but not the full mean).
- **Fix applied:** all three passages weakened to the honest invariant: every committed value is an average over a valid subset family (never double-counted, never CHECK-violating); exact-mean convergence is asserted for sequential submissions; a concurrent subset average heals at the NEXT submission (recompute-from-source is the self-healing property).

### Citation error — DEV2-016 locale-key line range — FIXED
- **Where:** `specs.md` §1.4 row 18 + REQ-002.1, `plan.md` §5.5.
- **Problem:** cited `shared/locale/en/errors/index.ts:105-108` for the three rating keys; they actually live at `:118-121` (105-108 are homework/reschedule strings).
- **Fix applied:** `:118-121` in all three places.

### Line drifts (1–4 lines) — FIXED
- INV-E1 `:311`→`:314`, INV-E2 `:312`→`:315` (`specs.md` §7); `logDenial` JSDoc `:80-86`→`:79-86` (`plan.md` §4.1, `tasks.md` 2.3); `parseAverageRating` `:36-45`→`:38-44` (`specs.md` §1.4 row 11); `getRatingStats` `:370-403`→`:366-403` (row 10 + REQ-008.2); `createTestTeacherRow` `:524-542`→`:522-542` (row 13); journey steps `:441-724`→`:442-724` (row 14).

### LOW (fixed) — helper naming inconsistency
- `specs.md` REQ-006.2.iv / `plan.md` §3.3 said `logger.logDomainError(...)` while `plan.md` §4.1 / `tasks.md` use the file's real `logDenial` helper. Aligned to `logDenial` (which internally emits the one bounded `logDomainError` entry).

### LOW (accepted) — REQ-007.2 inline rationale
- Restructured the trailing "Rationale:" prose into a sub-bullet so the EARS clause stands alone; reviewer had marked it acceptable either way.

## Verified-correct clusters (reviewer 1, no action)
Schema lines (teacher.ts:27/:37, evaluations.ts:56/57/60), service pipeline lines (`submitWithinTransaction :122-175`, insert `:165-173`, `SCORE_POINTS_PER_STAR=20 :74`, purity `:35-37`, 23505 map `:251-259`), both repo method inventories, all admin read-surface citations, types + barrels (`export *` claims), entity-setup/test-utils lines, journey harness claims — **including the load-bearing one**: `buildSessionJourneyCast` really creates AND registry-tracks a `teacher` table row (`test/workflows/helpers/session-cast.ts:184-197`), so journey assertions on `teacher.averageRating` have a real row to read and no registry extension is needed. The "no student-facing teacher browse surface" claim verified (only `applicant.query.ts` + `student-evaluation.query.ts` under `backend/graphql/query/teachers/`; only admin `admin-teachers.query.ts` anywhere). `avg(score)/20` confirmed as the exact inverse of `rating × 20`. `TeacherRepository.findById` cold branch confirmed to return `TeacherSelectType` (`averageRating: string | null`) — the journey-side cold read is type-correct.

## Post-Fix Verification
- All fixes were applied via incremental edits to `specs.md`, `plan.md`, `tasks.md` only; `deferred-items.md` needed no change.
- Traceability re-run after edits: every `REQ-001..012` + `REQ-J1..J3` still appears in `tasks.md` (zero missing).
- Ledger check: zero row-level ❌/⚠️ entries (flags appear only in the legend/enforcement prose, as designed).
- No code files were touched by this review round (plan-only).

## Lessons for Future Plans
- **Never cite a Drizzle SQL-template aggregate without deciding the pg type mapping** — `numeric` arrives as a string; the repo precedent (`::float8`) exists precisely for this. Type claims about SQL values must state the cast.
- **READ COMMITTED claims must be worded as subset-safety + next-write healing**, never "last commit converges" — the last committer may have read first.
- **Line-range citations for locale keys drift as keys are appended** — cite from a live grep at review time, not from memory of the writing session.

## Traceability
- All findings mapped to fixing edits in the plan directory; every REQ remains covered by ≥1 task; `plan.md` §7 verification anchors unchanged.

## Next Steps
- Implementation may begin at `tasks.md` Phase 0 (0.1 baseline re-verification → 0.2 confirms this verdict → 1.1 → 2.1 → 2.2 RED → 2.3 GREEN → 3.1 → 4.x).
