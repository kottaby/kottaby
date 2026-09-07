# Deferred Items Ledger

**Feature:** `dev1-015-student-confirmation-of-parent-link`  
**Plan Directory:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link`  
**Created:** `2026-09-05`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| DI-0.2-01 | tasks.md item 14 names `backend/services/parents/parent-link-request.static-locks.test.ts`; that file is ABSENT in code. The real static-scan lock is `backend/services/parents/parent-link.static-locks.test.ts` (826 lines; name matches plan.md §6). Later tasks must run/extend the correct file. | 0.2 | 2.2, 5.1 | 📅 Forward | 0.2-outcome.md §1 item 14 | Filename typo in tasks.md only; plan.md already carries the correct name. No code change needed. |
| DI-0.2-02 | Dashboard-home slot component-test suite does not exist: `test/ui/components/dashboard/` contains only `profile-view.test.tsx`; there is no `RoleDashboardPage`/status-slot test. Tasks 4.3.TE / 5.1 assumed "extending" existing dashboard-home tests. | 0.2 | 4.3 (5.1 battery) | 📅 Forward | 0.2-outcome.md §1 additional-checks table | 4.3.TE must CREATE the slot suite (student renders both cards; other roles unchanged; slot ordering) rather than extend one. |
| DI-0.2-03 | `shared/locale/parentLink-namespace.parity.test.ts` pins an EXHAUSTIVE key inventory (`MANDATED_KEYS`, "no silent key minting" test). Task 1.1's label additions fail parity unless `MANDATED_KEYS` (+ inventory count) are extended in the same change-set. | 0.2 | 1.1 | ✅ Done | 0.2-outcome.md §1 item 15, §4.5 | Resolved by 1.1: MANDATED_KEYS 33→39, FUNCTION_KEYS 4→6 extended in the same change-set; parity suite 68/68 green. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
