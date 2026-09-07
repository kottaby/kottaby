# Deferred Items — DEV3-021 Admin Session Governance

> Working ledger. Updated during implementation; reviewed at final gate.

## ❌ Blocking debt (MUST be zero before completion)
- _(none at plan time)_

## ⚠️ Risks & watch items
- The residency of the canonical `DateTime` scalar registration: verify registry vs each new Pothos file's imports during 4.x tasks.
- No idempotency-claim decorator position verified for mutations at plan time — reuse the same mechanism the participant mutations use (chained inside `withTransaction` or outer claim wrapper; record finding in 4.3 outcome).

## Forward-owned items (tracked elsewhere)
- **D-03** Bespoke rate-limit for admin mutations — platform-wide hardening stream (not this ticket).
- **D-04** Real-time admin dashboards over governance surfaces — DEV3 analytics family.
- **D-05** Meeting-bridge integration for admin `join` (full join access vs observation) — depends on meeting services ticket (BLT-03).
- **D-01, D-02** reclassified: reused-enumeration & audit-shape decisions now live IN-PLAN (see plan §0/D-07); NOT deferred.

---

## Ledger Table (template alignment — appended by Task 0.2; prose above remains canonical, nothing removed)

> Mirrors the entries above into the `.agents/spec-process-guide/templates/deferred-items-template.md` table structure. This plan's genuinely-deferred work is registered here when discovered mid-task; the in-plan and forward-owned rows below are bookkeeping anchors, NOT open debt.

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D-01 | Reuse-first enumeration (assertActorAdmin, AuditService.createAuditLog, refundHeldLaneToProvenance, withTransaction, session Pothos objects, barrels) | plan intake (REQ-002) | 0.3 verify-then-claim sweep | 🔄 In Plan | — | Reclassified IN-PLAN (plan §1 D-01/D-07) — owned by Task 0.3 anchors, NOT deferred |
| D-02 | Pothos registration & audit-shape decisions (one service module, side-effect barrel imports) | plan intake (REQ-060/061) | 3.1 / 4.2 / 4.3 | 🔄 In Plan | — | Reclassified IN-PLAN (plan §1 D-02) — NOT deferred |
| D-03 | Bespoke rate-limit for admin mutations | specs REQ-033 / plan §6 | forward stream (platform hardening) | ⏭ Forward-owned | — | Intentionally out of ticket scope; never blocks this plan's gate |
| D-04 | Real-time admin dashboards over governance surfaces | plan intake (specs §1 non-goals) | forward stream (DEV3 analytics family) | ⏭ Forward-owned | — | WebSocket fan-out explicitly non-goal |
| D-05 | Meeting-bridge integration for admin `join` (full join vs observation) | specs §1 non-goals | forward stream (BLT-03 dependency) | ⏭ Forward-owned | — | No meetingUrl column exists; observation-only per REQ-026 |
| D-06 | Zod-input-schema precedent absent: plan §2's "`zodToResult`-style per existing precedent" has zero `from "zod"` imports anywhere in the tree (`zod@^4.5.4` declared in package.json, unused) — Task 1.1 establishes the first usage or falls back to the pure-guard + `ValidationError(t.<key>)` pattern (`session-lifecycle.guards.ts`), with localized copy from the `errors` tree | 1.2 (discovery) | 1.1 (schemas; + 1.3 code registration) | 🔄 In Plan | 1.2 outcome §7 | Schema-side messages must not embed literal English — reschedule rejects surface `t.sessionRescheduleWindowInvalid` / `t.sessionRescheduleStartInPast` |

### Status conventions (template alignment for this ledger)
- Template statuses ❌ Blocked / ⚠️ Partial / 🔄 In Progress / ✅ Done apply to items genuinely deferred BETWEEN tasks of this plan (registered in ❌ Blocking debt or added to this table mid-implementation); the completion gate requires ❌/⚠️ item count == 0.
- `🔄 In Plan` (D-01, D-02) — owned by an in-plan task; resolves when that task completes; excluded from the ❌/⚠️ blocking count.
- `⏭ Forward-owned` (D-03, D-04, D-05) — intentionally out of ticket scope, tracked by a future stream/ticket; excluded from this plan's completion enforcement.