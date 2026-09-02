# Deferred Items Ledger

**Feature:** `dev3-022d-broadcast-notifications-system-wide-targ`  
**Plan Directory:** `ai/plans/sprint_3/dev3-022d-broadcast-notifications-system-wide-targ`  
**Created:** `2026-08-31`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| DF-1 | TE flow tier (7 mutation-flow component tests) green on a runtime without the bun 1.3.14 + Happy-DOM mutation-render defect; suite + scoping NOTE already committed | 4.3.TE | Phase 6 review / post-plan | ❌ Blocked (environment) | 4.3 outcome §TE | e2e spec covers the same loop over real Chromium |
| DF-2 | 4.3.BF/BS browser self-loops executed via test/ui/e2e/admin-broadcasts.e2e.test.ts once the app UI-serving tier renders pages again | 4.3.BF/.BS | Phase 6 review / post-plan | ❌ Blocked (pre-existing) | 4.3 outcome §BF | 48 pre-existing build errors + dev-mode dashboard compile stall on latest main |
| D1 | Chunked mega-broadcast (>5000 recipients) | 0.1 | future scale ticket | 📅 Forward | phase 0 | per DB-4: recipient cap 5000 fail-closed; chunking deferred |
| D2 | Crash-between-commit-and-publishReceipts double-insert residual | 0.1 | engine hardening stream | 📅 Forward | phase 0 | engine §3.6 document-locked posture; owned by engine team |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
