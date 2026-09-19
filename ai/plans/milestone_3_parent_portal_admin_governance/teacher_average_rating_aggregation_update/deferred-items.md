# Deferred Items Ledger

**Feature:** `Teacher Average Rating Aggregation & Update` (DEV2-017)
**Plan:** `ai/plans/milestone_3_parent_portal_admin_governance/teacher_average_rating_aggregation_update/`
**Created:** 2026-09-17

---

## Purpose

This ledger tracks work deliberately deferred from this ticket to future tickets/decisions, so nothing is silently dropped. Every deferred item here is a **plan-level decision with an owner**, not an implementation TODO.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Ticket's literal `average_rating = 0 (default)` vs the shipped honest-`NULL` ruling — decide whether a 0 default is ever wanted once a product surface reads it as "rated zero" | Plan generation (REQ-006.2.iv, D4) | Product decision; any future surface that must distinguish "unrated" from "zero" consumes the ruling doc | 🔄 Open (ruling recorded) — the plan's Verified-By obligation is FULFILLED by this plan | Fulfilled by this plan: `docs/teachers/teacher-average-rating.md` (task 4.2; verified at final gate 4.3) | The column is nullable with NO default (`teacher.ts:27`); every renderer renders `null` as the localized "—" (`adminTeachersDirectory.helpers.ts:78-80`); a stored 0 would be an impossible rating (min 1★ = 20 ⇒ 1.00). Zero live ratings is unreachable through the submission flow by construction (the just-inserted row is live). This plan implements honest-NULL. |
| D2 | FR-8.2's "rating influences search ranking": the student-facing teacher search/browse/ranking surface does not exist in the codebase — this plan ships the maintained column as its input; consuming it is a future ticket | Plan generation (REQ-008, `plan.md` §4.5) | The teacher-search/matching ticket (not yet planned; student browse query absent — verified `backend/graphql/query/teachers/` holds only `applicant` + `student-evaluation` queries) | 🔄 Open (forward contract) — the plan's Verified-By obligation is FULFILLED by this plan | Fulfilled by this plan: `docs/teachers/teacher-average-rating.md` ranking section (task 4.2; verified at final gate 4.3) | The future surface consumes `teacher.average_rating` READ-ONLY; the submission transaction remains the single writer (single-writer discipline). Do not add a second writer in that ticket. |
| D3 | Recalculation hook for rating soft-delete — no rating soft-delete/moderation mutation surface exists yet, so a deleted rating only leaves the average at the next submission | Plan generation (REQ-005.1 filter, D12) | The rating-moderation ticket (whenever it ships) | 🔄 Open (documented seam) — the plan's Verified-By obligation is FULFILLED by this plan | Fulfilled by this plan: `docs/teachers/teacher-average-rating.md` what-NOT-to-do (task 4.2; verified at final gate 4.3) | The moderation flow MUST call `EvaluationRepository.aggregateLiveRatings` + `TeacherRepository.updateAverageRating` inside its own transaction — the aggregate already excludes soft-deleted rows, so the hook is a two-line composition, never a reimplementation. |
| D4 | Batch backfill of `teacher.average_rating` for historical rating rows | Plan generation (D12) | Not needed — zero production rating rows predate DEV2-016 (the first writer shipped 2026-09-11; verified: `grep` shows no other writer — all `averageRating` usages are reads or test fixtures) | ✅ N/A — condition absent | Task 3.1 outcome records the writer census | If a bulk import of historical ratings ever lands, that import composes the same aggregate+update pair per teacher. Do not write a standalone backfill cron. |
| D5 (cross-ticket, informational) | Teacher-facing / parent-facing rating VISIBILITY surfaces (the rated teacher seeing their own average; parents seeing a teacher's rating) | DEV2-016's ledger, restated here | DEV1-016/017 + teacher-portal tickets | 🔄 Open (owned elsewhere) | `docs/teachers/student-evaluation-submission.md:74` | This ticket ships the data; the read surfaces are explicitly out of scope in both tickets (`specs.md` §1.3). |

---

## Status Values

- ✅ **Done / N/A** — condition absent or completed and verified (with reference)
- 🔄 **Open (ruling/forward-contract)** — a recorded decision awaiting its owning ticket; NOT a blocker for this plan
- ⚠️ **Partial** — needs follow-up within this plan
- ❌ **Blocked** — this plan cannot complete until addressed

---

## Enforcement

The final gate (task 4.3) verifies no **❌ / ⚠️** entries remain:

```bash
grep -c "❌\|⚠️" ai/plans/milestone_3_parent_portal_admin_governance/teacher_average_rating_aggregation_update/deferred-items.md
# Expected: 0
```

All current entries are 🔄 forward-contracts with named owning tickets/docs — by design (a 3-SP aggregation ticket must not silently absorb a product-semantics ruling, a search surface, or a moderation flow).

---

## Related Documents

- Requirements: `specs.md` §1.3 (out-of-scope list), REQ-006.2.iv (honest-null), REQ-008 (surface integrity)
- Design: `plan.md` §4.5 (forward contracts), D4/D12 (decision rationale)
- Origin contract: `docs/teachers/student-evaluation-submission.md:65-74` (DEV2-016's forward block this plan implements)
- Task that finalizes the pointers: `tasks.md` task 4.2 (canonical doc)
