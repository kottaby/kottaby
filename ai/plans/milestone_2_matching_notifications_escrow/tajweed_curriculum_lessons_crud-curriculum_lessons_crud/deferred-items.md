# Deferred Items Ledger

**Feature:** `Tajweed Curriculum Lessons CRUD`
**Plan (verbatim):** `ai/plans/milestone_2_matching_notifications_escrow/tajweed_curriculum_lessons_crud-curriculum_lessons_crud/`
**Created:** 2026-09-17

---

## Purpose

This ledger tracks work deliberately routed to OTHER tickets plus ratified out-of-scope rulings, so nothing is silently dropped. Per this plan's discipline, every row lands as a ✅ resolved pointer (recorded decision + named owner); the final gate greps ledger table rows for ❌/⚠️ only and must find zero.

## Ledger Table

| ID | Deferred Item | Source | Target Owner | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Curriculum `position` column + reordering surface (drag-reorder, gap compaction) — the schema has NO ordering column and this ticket mints none; the sequence contract is `ORDER BY id ASC` per plan (`plan.md` D1, REQ-015) | `specs.md` REQ-010/REQ-015 · `plan.md` D1 | Future curriculum-sequencing enhancement ticket | ✅ Recorded pointer | Plan review R1 | The progress ticket consumes `id ASC` as a STABLE contract — introducing `position` later must keep `id ASC` as tie-breaker or re-coordinate both tickets. |
| D2 | Student/teacher progress-consuming surfaces + the domain's first cross-actor journey (session completes → progress increments → teacher observes, FR-6.2/FR-6.3, INV-PR2) | `specs.md` REQ-070/REQ-071 · `plan.md` §7 | Student Progress Tracking & Increment ticket (blocked by this one) | ✅ Recorded pointer | Plan review R1 | This ticket ships the contract it consumes: `LessonRepository.listByPlanId` (id ASC) + `findById` + `createTestLesson` fixture helper + NULL-lesson tolerance (REQ-043). |
| D3 | Lesson audit assertions in the admin audit-completeness journey catalog (`test/workflows/admin/audit-completeness.catalog.ts`) | `plan.md` §10 pointer D3 | Follow-up wiring after catalog-structure review | ✅ Recorded pointer | Plan review R1 | Needs the existing catalog's structure read before extending; audit rows themselves ship with this ticket (REQ-018). |
| D4 | Lesson content enrichment (description, media, surah/juz references, duration) — no such columns exist in `backend/db/schema/classes/lessons.ts:17-30` | `specs.md` non-goal 3 | Future curriculum-content ticket | ✅ Recorded pointer | Plan review R1 | Any enrichment is a schema delta requiring its own authorization; FR-6.1 names only `(plan_id, title)`. |
| D5 | Anonymous (unauthenticated) curriculum browsing | `specs.md` REQ-033 · `plan.md` D4 | Ruled out (mirrors the `planCatalog` authenticated posture) | ✅ Ratified ruling | Plan review R1 | Revisit only if a public-marketing curriculum page is ever requested. |

---

## Status Values

- ✅ **Recorded pointer** — a deliberate forward contract with a NAMED owning ticket/owner; NOT a blocker for this plan (the item is complete as a decision, the work belongs elsewhere).
- ⚠️ **Partial** — needs follow-up work INSIDE this plan.
- ❌ **Blocked** — this plan cannot complete until addressed.
- 🔄 **In Progress** — currently being worked on inside this plan.

## Enforcement

The final quality gate (task 5.2) runs the row-scoped check:

```bash
grep -cE '^\s*\| D[0-9]+ .*(❌|⚠️)' \
  "ai/plans/milestone_2_matching_notifications_escrow/tajweed_curriculum_lessons_crud-curriculum_lessons_crud/deferred-items.md"
# Expected: 0 — every ledger row is a ✅ recorded pointer or ratified ruling.
```

## Related Documents

- Specs: `specs.md` (REQ-001..REQ-081) — non-goals §1 + journey ruling §3 feed this ledger.
- Design: `plan.md` D1–D11 + §10 ledger pointers.
- Sibling precedent (ledger discipline): `ai/finished_plans/milestone_2_matching_notifications_escrow/session-request-notification-to-teacher/deferred-items.md`.
