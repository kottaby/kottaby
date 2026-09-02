# Deferred Items Ledger

**Feature:** `dev3-022c-platform-analytics-dashboard`  
**Plan Directory:** `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard`  
**Created:** `2026-08-31`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D-1 | Server-side metric caching variant of the analytics read model | 0.1 | Future performance ticket | 📅 Forward | plan.md §7 item 4 | Service stays fresh-per-request (never cached) in this ticket; caching variant is a FORWARD-OWNED follow-up, not debt |
| D-2 | Drill-down/detail pages + CSV export for the analytics dashboard | 0.1 | Future UX ticket | 📅 Forward | plan.md §7 item 4 | Explicitly out of scope by plan design ("no per-entity drill-downs here"); FORWARD-OWNED, not debt |
| D-3 | Bespoke analytics rate limiter | 0.1 | Rate-limiting hardening stream (REQ-038) | 📅 Forward | plan.md §7 item 4 | Existing global rate limiting unchanged; bespoke limiter owned by the hardening stream, not this plan |
| D-4 | Trend covering index for 30-day trend scans | 0.1 | Deferred until production telemetry demands it | 📅 Forward | plan.md §7 item 4; tasks.md 1.2 | Read-purity ticket: no index/DDL changes; scans are window-bounded and existing indexes cover all predicate columns |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
