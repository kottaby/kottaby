# Deferred Items Ledger

**Feature:** `dev3-007-recitation-record-per-session-11`  
**Plan Directory:** `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11`  
**Created:** `2026-09-05`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Write-once → future audited update/correction surface for recitation records | specs non-goal 1 / plan Decision 10 | Future ticket (separately designed, audited) | 📅 Forward | Task 0.1 | Deliberately out of scope; retention rule Workflow 05 §8 |
| D2 | Parent-portal read consumer of session recitation (DEV1-016) | specs non-goal 5 / REQ-065 | DEV1-016 | 📅 Forward | Task 0.1 | Consumer must import-by-reference this ticket's service, never touch the table |
| D3 | Admin review read consumer of session recitation (DEV3-021) | specs non-goal 5 / REQ-065 | DEV3-021 | 📅 Forward | Task 0.1 | Consumer must import-by-reference this ticket's service, never touch the table |
| J1 | Journey test quality-loop (sub-loop --lifecycle duplicates) deferred until RecitationRecordService exists | 2.2 | 2.3 | ✅ Done | Task 2.3 | QL exit 0 + journey green (8/8 pass, 140 expect(), two consecutive runs; layer-wide run's 1 failure is a pre-existing admin-governance drift outside DEV3-007 — see 2.3-outcome.md) |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
