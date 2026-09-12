# Deferred Items Ledger

**Feature:** Fee Escrow & Teacher Wallet Crediting (Close-the-Loop Verification)
**Plan:** `ai/plans/sprint_2/Fee Escrow & Teacher Wallet Crediting-crediting/`
**Created:** 2026-09-11

---

## Ledger

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Runtime adoption of the escrow idempotency-key contract (`EscrowTriggerContract` / `WalletCreditContract`, `backend/types/contracts/session-completion-escrow.contract.types.ts:14-80`) — exactly-once currently rests on the `fee_held = true` guard predicate alone | Plan design D3 (plan.md) | **Financial Safety Verification ticket** (`docs/planning/TICKETS.md:2985-3026`, Sprint 4) | ❌ Blocked | — | External-ticket ownership: adopting a runtime key now would touch the race-proven money path; the Sprint 4 escrow-integrity ticket is the correct place to decide (its double-spend matrix is the acceptance surface). Exempt from this plan's in-plan ❌ gate per Note rule below. |
| D2 | `WalletInsertType` / `WalletReturnType` / `TeacherTransactionInsertType` / `TeacherTransactionReturnType` — only Select/View types exist (`backend/types/billing/wallet.types.ts:4-16`, `backend/types/billing/teacher-transaction.types.ts:3`) | Code-state verification (REQ-8) | **First consumer ticket** (expected: Teacher Withdrawal Workflow, `docs/planning/TICKETS.md:1799-1845`) | ❌ Blocked | — | No current consumer; adding unused type exports would trip knip `check:unused`. Exempt from this plan's in-plan ❌ gate per Note rule. |

## Status Legend

- ✅ Done · ⚠️ Partial · ❌ Blocked · 🔄 In Progress

## Gate Rule (this plan)

`grep -c "❌\|⚠️" deferred-items.md` counts **only rows whose Target Task is inside this plan**. Rows D1/D2 are owned by named external tickets (their ❌ denotes "not done anywhere yet", not "owed by this plan") and are exempt from the gate; both must be re-verified as landed or re-scoped when their target tickets execute. Recorded in tasks.md Task 4.3.
