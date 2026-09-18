# Deferred Items Ledger

**Feature:** `Teacher Withdrawal Workflow & Admin Approval` (close-the-loop verification)
**Plan:** `ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/`
**Created:** 2026-09-17

---

## Purpose

This ledger tracks every item deliberately NOT shipped by this plan, so nothing is silently dropped. All five ticket ACs already ship; this plan verifies them, closes ONE journey-coverage hole, and repairs two doc wordings. Everything else that touches the withdrawal surface is a **forward contract with a named owner** — recorded here, never absorbed.

---

## Ledger Table

| ID | Deferred Item | Source | Target Owner | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Withdrawal request/decision notifications to the teacher — no withdrawal `NotificationType` members exist (`backend/enum/notifications/notification-type.enum.ts:10-18`; mirrors the `notification_type` pgEnum); adding them is an engine + schema change | `specs.md` REQ-506, plan.md §9 D1 | Future notifications ticket (consumes `docs/notifications/realtime-engine.md` §3.2 table) | 🔄 Open (forward contract) | Task 4.1 matrix (REQ-506 row) | Journeys today assert ZERO dispatches on every withdrawal leg (`admin-financial-auditing.journey.test.ts:222-228,429-433`). When D1 lands, those assertions must be inverted per-leg, not deleted. |
| D2 | Request-level idempotency keying for `requestWithdrawal` — each request is a NEW financial instruction today (two identical requests = two payouts, honestly) | `wallet.service.ts:198-200` forward note (F11), specs REQ-702 | Financial hardening backlog | 🔄 Open (forward contract) | Task 4.1 matrix | The guarded debit already prevents overdraw races; keying is a UX/retry concern, not a safety hole. |
| D3 | Full teacher-ledger pagination (beyond the 50-row cap) | `wallet.service.ts:47-51` (F10, `WALLET_LEDGER_PAGE_LIMIT = 50`) | Wallet UX backlog | 🔄 Open (forward contract) | Task 4.1 matrix (REQ-801 row) | Admin-side pagination already ships (`adminPendingWithdrawals` page/pageSize); only the teacher's own ledger view is capped. |
| D4 | `WalletInsertType` / `WalletReturnType` four-shape type completion | Fee-escrow plan specs D2 (inherited; `backend/types/billing/wallet.types.ts` holds only Select/View shapes) | First ticket needing wallet write shapes | 🔄 Open (forward contract) | Task 4.1 matrix | This plan adds NO types (verification-scoped). |
| D5 | Runtime adoption of the escrow idempotency-key contract types (`WalletCreditContract` et al.) | Fee-escrow plan D1/D3 (inherited; `backend/types/contracts/session-completion-escrow.contract.types.ts:14-80`) | Financial Safety Verification follow-ups | 🔄 Open (forward contract) | Task 4.1 matrix | Withdrawal settlement runs on the guarded-predicate exactly-once model — re-proven by journey steps 6/7; no key needed on this path. |
| D6 | INV-W8 doc wording: `>= 0` (`docs/specs/state-machine-invariants.md:198`) vs the DB truth `> 0` (`teacher_transaction_amount_check`, `backend/db/schema/billing/teacher-transaction.ts:50`) | specs REQ-602/REQ-701(d) | Invariants-doc owner (`docs/specs/state-machine-invariants.md` is cross-ticket shared state) | 🔄 Open (ruling recorded) | Task 4.1 matrix (REQ-602 row) | This plan repairs the DBML annotation (`db/schema.dbml:372`, task 2.1) and aligns the stricter bound; the invariants table itself is edited only by its owner. |
| D7 | HTTP-status surfacing of `WALLET_INSUFFICIENT_FUNDS` beyond the GraphQL wire (ticket's literal "422" wording) | specs REQ-104 (ruling), plan.md D3 | API-gateway surface owner (only if a REST payout surface ever ships) | 🔄 Open (ruling recorded) | Task 4.1 matrix (REQ-104 row) | GraphQL has no per-error HTTP status; the code taxonomy (`backend/lib/errors/error-code-taxonomy.ts:45-47`) maps CONFLICT→409/VALIDATION→422 for any future REST surface; the client routes on the CODE today (`useTeacherWalletWithdraw.ts:86-91`). |
| D8 | DBML drift on the student-payments surface: `student_payments.amount` check says `>= 0` (`db/schema.dbml:401`) vs Drizzle `student_payments_amount_check` `> 0` (`backend/db/schema/billing/student-payments.ts:74`) | Discovered by task 2.1 execution (same drift class as D6) | Student-payments surface owner (first ticket touching student_payments DBML) | 🔄 Open (forward contract) | Task 4.1 matrix | NOT this ticket's surface; discovered during the teacher_transaction repair; do not absorb silently. |
| D9 | Planning artifacts still citing the stale `>= 0` amount bound: `docs/planning/PRODUCTION_READINESS.md:100,261` (`docs/planning/TICKETS.md:1793` is frozen historical ticket text — not a drift to repair) | Discovered by round-4 review (same drift class as D6/D8) | planning-docs owner | 🔄 Open (forward contract) | Task 4.1 matrix | Frozen planning docs are historical records — repair belongs to the planning-docs owner; recorded so the stale bound is not silently absorbed. |

---

## Status Values

- ✅ **Done** — completed and verified inside this plan (with reference)
- 🔄 **Open (ruling/forward-contract)** — a recorded decision awaiting its owning ticket; NOT a blocker for this plan (every row names its owner)
- ⚠️ **Partial** — needs follow-up within this plan
- ❌ **Blocked** — this plan cannot complete until addressed

---

## Enforcement

The final gate (task 4.2) verifies no **❌ / ⚠️** entries remain:

```bash
grep -cE '^\| D[0-9]+ .*\| (❌|⚠️) ' "ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/deferred-items.md"
# Expected: 0 — the pattern matches only LEDGER-ROW statuses (the legend/prose
# below legitimately name the emoji as vocabulary).
```

All current rows are 🔄 forward-contracts/rulings with named owners — by design: a 5-SP verification ticket must not silently absorb a notifications engine, an idempotency scheme, a pagination surface, or a shared invariants-table edit.

---

## Related Documents

- Requirements: `specs.md` — REQ-506 (notification absence), REQ-702 (this ledger), REQ-104 (422 ruling), REQ-602 (DBML repair), REQ-701 (rulings ratified at review)
- Design: `plan.md` §9 (ledger pointers), D1–D5 (decisions)
- Canonical domain docs: `docs/billing/admin-financial-auditing.md` (settlement model), `docs/billing/escrow-and-wallet-crediting.md` (crediting side)
- Sibling plans that own the shipped surfaces: `ai/finished_plans/milestone_2_matching_notifications_escrow/fee_escrow_and_teacher_wallet_crediting-crediting/` (teacher request half) · `ai/finished_plans/milestone_3_parent_portal_admin_governance/admin-financial-auditing-payments-wallet/` (admin settlement half)
