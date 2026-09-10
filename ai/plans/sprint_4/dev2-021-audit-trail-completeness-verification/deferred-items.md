# Deferred Items Ledger

**Feature:** `dev2-021-audit-trail-completeness-verification`
**Plan Directory:** `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification`
**Created:** 2026-09-05

---

## Purpose

Tracks every admin audit surface enumerated in the census whose producer is NOT yet shipped, so completeness remains honest. Each deferred item is a Workflow 05 §7.2 category (or enum verb) with a census `deferred` row pointing at the ledger ID. A ❌ row blocks plan completion; 📅 Forward rows name owners and do not block.

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D-001 | Subscription management audit producer (extend/renew/cancel/upgrade — Workflow 05 §7.2 row 3) | 2.1 census authoring | Future admin subscription surface (no ticket yet) | 📅 Forward | DEV3-026 launch checklist review | No admin subscription mutation exists in `backend/graphql/mutation/**` today (verified 2026-09-05). Census row marks `(future) adminExtendSubscription / adminCancelSubscription`. When the surface ships, the anti-drift test forces its census row to become `wired` and emit Update/Suspend rows. |
| D-002 | Financial adjustment producer (manual wallet credit/debit, withdrawal approve/reject — the `Adjust` verb) | 2.1 census authoring | Future financial-adjustment surface (no ticket yet) | 📅 Forward | DEV3-026 launch checklist review | `Adjust` is the only enum verb with no shipped producer. Coverage today: census `deferred` row + Adjust fixture lane in the completeness journey (REQ-042). |
| D-003 | Admin password reset audit (Workflow 05 §7.2 user-management row, "password reset" action) | 2.1 census authoring | Future admin credential surface | 📅 Forward | — | No admin password-reset mutation exists; user-management mutations currently cover create/update/delete/reactivate only. |
| D-004 | Session governance extensions (reschedule, reassign, join-live — Workflow 05 §7.2 row 4) | 2.1 census authoring | DEV3-021 follow-on / future session-governance work | 📅 Forward | — | Only dispute arbitration (resolveSessionDispute) is shipped in session governance; rescheduled/reassign mutations do not exist. Note: DEV3-021 plan dir exists under `ai/plans/sprint_3/dev3-021-admin-session-governance/`. |

## Status Values

- ✅ Done — completed and verified
- ⚠️ Partial — partially resolved
- ❌ Blocked — plan cannot complete until addressed
- 🔄 In Progress — currently being worked
- 📅 Forward — pre-seeded forward item owned by a later surface; non-blocking when an owner is named

## Usage Guidelines

- Add a row when work is discovered that belongs to another task or a not-yet-built surface.
- `📅 Forward` rows must name an owner (surface/ticket or reviewer) and are re-checked at task 6.3's ledger sweep.
- When a deferred surface ships, the drift test fails until its census row flips to `wired` — the ledger row then moves ✅ Done.
