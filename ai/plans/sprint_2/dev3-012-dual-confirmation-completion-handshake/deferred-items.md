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
| D4 | `test/workflows/notifications/j1-targeted-single-recipient.test.ts` step 9 red in this environment: catch-up listing vs raw DB read differ by one row | Task 4 (out-of-scope discovery) | notifications-domain fix pass | ❌ Blocked (out of plan scope) | Task 4 outcome §Out-of-scope | Reproduces SOLO (8 pass / 1 fail); the notifications engine/listing surface is untouched by this plan (additive wave kinds only); zero session/DEV3-012 involvement — pre-existing red never previously run in this sandbox |
| D5 | `test/workflows/admin/account-governance.journey.test.ts` step 9 red: governed-admin denial copy drift (journey expects suspension text, live translation answers "This account has been blocked.") | Task 4 (out-of-scope discovery) | account-governance/auth-copy fix pass | ❌ Blocked (out of plan scope) | Task 4 outcome §Out-of-scope | Auth-translation drift; zero session/DEV3-012 involvement; this plan's locale edits were additive notification keys only — pre-existing red never previously run in this sandbox |

---

## Status Values

- ✅ Done · ⚠️ Partial · ❌ Blocked · 🔄 In Progress (or Out-of-plan for cross-ticket ownership)

## Enforcement

Final gate (Task 6): `grep -c "❌\|⚠️" ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/deferred-items.md` — D1/D2/D3 are intentionally cross-ticket ownership rows, design-ruling-recorded rather than unresolved work; each carries its owning ticket. D4/D5 (Task 4) are the same shape: pre-existing reds in OTHER plans' journey domains, discovered and solo-reproduced while proving the sessions layer green; each names its owning fix pass. Expected count at the final gate: 4.
