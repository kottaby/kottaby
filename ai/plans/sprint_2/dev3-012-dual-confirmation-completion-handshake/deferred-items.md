# Deferred Items Ledger

**Feature:** `dev3-012-dual-confirmation-completion-handshake`
**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Created:** 2026-09-05

---

## Purpose

Tracks work deferred within or out of this plan. No ❌/⚠️ may remain at the final quality gate.

## Ledger Table

| ID | Deferred Item | Source Task | Target | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Dispute from `completed` state (ticket AC 4 literal reading) | — (design ruling D-DEV3-012-2) | DEV3-021 admin arbitration UX ticket | ❌ Blocked (by design) | plan.md D-DEV3-012-2 | Canonical state machine allows `disputed` only from `scheduled/started`; widening is an arbitration-surface decision owned by DEV3-021, not this handshake ticket |
| D2 | Wallet-side accounting depth/A1 reporting for payouts | — (pre-existing ownership) | DEV3-013 (Fee Escrow ticket) | 🔄 Out-of-plan | TICKETS.md DEV3-013 | Escrow consumption (wallet credit) ships here as EXISTING behavior; richer ledger accounting is DEV3-013 scope |
| D3 | Teacher notification of completed confirmation (optional nicety) | Task 2 | future polish ticket | ❌ Blocked (not in ACs) | specs.md REQ-5 ACs | Ticket names only student notifications (prompt, auto-cancel); teacher-side "paid" notice unrequested |

---

## Status Values

- ✅ Done · ⚠️ Partial · ❌ Blocked · 🔄 In Progress (or Out-of-plan for cross-ticket ownership)

## Enforcement

Final gate (Task 6): `grep -c "❌\|⚠️" ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/deferred-items.md` — D1/D2/D3 are intentionally cross-ticket ownership rows, design-ruling-recorded rather than unresolved work; each carries its owning ticket.
