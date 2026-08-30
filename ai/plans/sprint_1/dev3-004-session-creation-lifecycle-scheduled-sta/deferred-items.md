# Deferred Items Ledger

**Feature:** `dev3-004-session-creation-lifecycle-scheduled-sta`  
**Plan Directory:** `ai/plans/sprint_1/dev3-004-session-creation-lifecycle-scheduled-sta/`  
**Created:** `2026-08-30`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Session request/lifecycle event notifications (A.4 consumption; REQ-019 zero-notification rule — this ticket writes zero `notifications` rows) | DEV3-004 (this ticket) | DEV3-010 / DEV3-011 | ⏸ Forward | — | Owner-referenced, non-blocking (per tasks.md 0.1 + specs REQ-001) |
| D2 | Dual-confirmation student confirm + 24h auto-cancel sweeper + wallet credit (confirm flips `fee_held=false` + same-lane credit; sweeper reuses this ticket's same-lane refund primitive; claim age not consulted here — plan.md D6) | DEV3-004 (this ticket) | DEV3-012 / DEV3-013 | ⏸ Forward | — | Owner-referenced, non-blocking |
| D3 | `is_online` availability assertion + teacher directory wiring (this ticket asserts certification only — INV-S5) | DEV3-004 (this ticket) | DEV3-008 / DEV2-011 | ⏸ Forward | — | Owner-referenced, non-blocking per specs reconciliation note #3 |
| D4 | Student-facing booking UI over the directory (the client consumer of `createSession`) | DEV3-004 (this ticket) | DEV3-009 | ⏸ Forward | — | Non-blocking; no session-creation route ships in this ticket — tests/journeys exercise the mutation |
| D5 | INV-S6 / INV-S7 / INV-S8 enforcement + the `disputed` transition surface | DEV3-004 (this ticket) | DEV3-005 / DEV2-013 / DEV3-022 | ⏸ Forward | — | Owner-referenced, non-blocking; `disputed` exists in the enum without a transition surface here |
| D6 | Canonical names `SessionLifecycleService` / `SessionRepository` placed in the `classes` domain, staying clear of the future contract-implied `SessionService` (codework happens IN this ticket) | DEV3-004 (this ticket) | DEV3-004 (this ticket) | ✅ Done | — | Renumbered from the template's original "D1" slot to free D1 for the notifications item (tasks.md 0.1 / specs REQ-001 define D1 = notifications; plan.md §Knowledge-Propagation had listed the naming item under "D1"). Resolved in-plan by the naming decision (§1.5) + REQ-004 verify-absence gate — absence verified by task 0.2 (`outcome/0.2-outcome.md` §5: zero code hits). Kept for traceability per the ledger contract |
| D7 | Teacher-with-`students`-row session-creation carve-out (INV-TV6 extension): allow a `role=teacher` caller holding a `students` row to invoke `createSession` as the student side (failed-applicant conversion path) — requires a dedicated custom authScope (e.g. `studentActor` checking the `students` row) + a REQ-032 scope amendment | 0.3-fix ruling (B3, 2026-08-30) — REQ-011 "MAY" carve-out struck; REQ-064 certified-teacher cell amended to unconditional `FORBIDDEN` | Future ticket (owner TBD) | ⏸ Forward | — | Non-blocking; THIS slice keeps teachers unconditionally FORBIDDEN on `createSession` (REQ-032 static `role:[Student]` scope stands — `pothos/builder.ts:127` membership-only scopes cannot express the carve-out); INV-TV6's honest-denial intent for applicant teachers and its student-privileges clause on the normal role-flip conversion path are preserved in-slice. Asserted in tasks 3.3 / 5.2 (Ruling 2026-08-30 cells) |

**Seeding note (task 0.1, 2026-08-30):** D1–D5 seeded per tasks.md task 0.1 / specs REQ-001 (orchestrator directive) as neutral ⏸ Forward items — each owner-referenced and non-blocking. The pre-populated template's "D1" row (naming decision, resolved in-plan) is preserved as D6 to avoid losing ledger traceability while freeing the D1 ID for the notifications item. Forward items deliberately use the neutral ⏸ marker (never blocked/partial markers) so the REQ-083 gate reads zero on item statuses. Discrepancy recorded in `outcome/0.1-outcome.md` for the 0.3 plan-review gate. (Grep note: residual blocked/partial glyph matches in this file come ONLY from the Status Values legend definitions below — carried over verbatim from the original template — never from item statuses.)

**Ruling addendum (0.3-fix, 2026-08-30):** D7 added per the 0.3 gate's BLOCKING finding B3 (orchestrator ruling: teachers unconditionally FORBIDDEN on `createSession` in this slice; the REQ-011/REQ-064 carve-out wording struck and deferred). D7 uses the neutral ⏸ Forward marker — it joins D6 as a ledger row that contributes nothing to the REQ-083 `grep -c "❌\|⚠️"` gate (which stays 0).

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- ⏸ **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan (neutral marker — deliberately never blocked/partial markers, keeping the REQ-083 item-status gate clean)
