# Deferred Items Ledger — DEV2-006 5-Session Evaluation Loop Booking

> **Plan directory**: `ai/plans/milestone_1_core_domain_mvp/5_session_evaluation_loop_booking/`
> **Created**: 2026-09-17 (seeded during plan generation; kept live by executing agents)

## Purpose

Single canonical ledger for anything this plan decides NOT to ship here. Every deferred item must be owned by a named downstream ticket or a clearly-scoped future task; otherwise it cannot be deferred. Enforcement: Task 12 requires zero unresolved items (any item kept here MUST be cross-ticket by nature).

## Seeded entries (D = pre-existing out-of-scope assignments)

| ID | Item | Source (spec) | Owner task/ticket | Status | Verification hook |
|----|------|---------------|-------------------|--------|-------------------|
| D1 | `evaluations` rubric submission surface + 80% threshold aggregation + `applicants.status` flip to `passed|failed` | DEV2-006 not in scope (became bigger) | DEV2-007 (Evaluation Rubric Scoring) | ⏳ Externally planned | DEV2-007 owns `evaluations` writes and terminal status flip |
| D2 | Admin re-evaluation ordering + teacher-wallet deduction on re-evaluation | specs C2/contract | DEV2-series re-evaluation ticket (TICKETS: `Admin-Ordered Re-Evaluation (Teacher Wallet Deduction)`) | ⏳ Externally planned | that ticket's wallet-deduction service |
| D3 | Failed applicant → student-record conversion | INV-TV6/B.6/B.7 split | DEV2-009 (Failed Applicant → Student Record Conversion) | ⏳ Externally planned | conversion flow — evaluation sessions rows remain untouched historical audit |
| D4 | Parent link to an APPLICATION loop view | `docs/parents/monitoring-portal.md` scope | future parent-portal iteration | ⏳ Not scheduling | portal read model work |

## Notes

- Items D1–D3 belong to DEV2-007+ onward; their ticket numbers ARE the only valid owners (per `docs/planning/TICKETS.md` chain).
- D4 is deliberately not scheduled; the plan review gate REQUIRES either a target ticket or deletion before final sign-off — keep as a concrete D4 row for the documentation task to decide (Task 13).
- Any new deferral discovered during implementation appends rows here with the same columns; see template comment in the spec-process guide.

## Enforcement checklist (Task 12 reads this)

- [ ] Every row has a defined owner (ticket ID or follow-up task).
- [ ] No ⚠️/❌ rows remain at close (`grep -c "❌\|⚠️" deferred-items.md` must equal 0 — coordination rows are fine because their ⏳ marker is a defined external owner).
- [ ] The cumulative D-row history is archived into the final knowledge-propagation doc.
