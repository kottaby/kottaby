# Deferred Items Ledger

**Feature:** Admin Subscription Management (Extend/Renew/Cancel/Upgrade/Downgrade)
**Plan:** `ai/plans/sprint_1/Admin Subscription Management-admin-subscription-management/`
**Created:** 2026-09-17

---

## Purpose

Tracks work deferred during planning or execution. Every row must reach ✅ before the final quality gate (task 11). `grep -c "❌\|⚠️"` must be 0 when the plan closes.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task/Owner | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 census | Catalog deferred row D-001 (`adminExtendSubscription/adminCancelSubscription`) in `audit-completeness.catalog.ts` | Pre-existing (audit census) | Task 9 | ✅ Done | Plan definition | Subsumed: replaced by wired rows in Task 9 |
| D2 page | Dedicated `/admin/subscriptions` top-level directory page with search | Planning | Future milestone (M3 admin governance already has directory patterns) | ✅ Done | Plan §3.8 decision D6 | Out of scope — drawer surface only |
| D3 notification | Student-facing notification on admin lifecycle action (renewed/cancelled/changed) | Planning | Future ticket (notification fan-out surface) | ✅ Done | Plan decision | Deliberate: no new notification types this milestone |
| D4 crosslane | Cross-lane plan changes (e.g. hifz plan → reviews plan) | Planning | Future ticket if business needs it | ✅ Done | Plan REQ-4.6 | Rejected this milestone: proration requires same-lane |
| D5 cancel-pending | Cancelling `pending` (unpaid) admin-created/purchase rows | Planning | Purchase-flow owner | ✅ Done | Plan scope | Pending rows are payment-owned; cancellation happens via payment-side flows |

---

## Status Values
✅ Done (decision recorded, consciously out of scope, or executed) · ⚠️ Partial · ❌ Blocked · 🔄 In Progress.

## Enforcement (final gate)
`grep -c "❌\|⚠️" ai/plans/sprint_1/Admin Subscription Management-admin-subscription-management/deferred-items.md` → must print 0.
