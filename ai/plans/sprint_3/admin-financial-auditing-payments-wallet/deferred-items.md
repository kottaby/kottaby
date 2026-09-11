# Deferred Items Ledger

**Feature:** `admin-financial-auditing-payments-wallet`
**Plan:** `ai/plans/sprint_3/admin-financial-auditing-payments-wallet/`
**Created:** `2026-09-11`

---

## Purpose

Tracks all work deferred from one task to another so nothing is lost. Seeded at planning time with the one planning-discovered dependency; implementation-time discoveries append below it.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Verify the duplicate drizzle dirs `20260907182426_custom_4-student-payments-status-transition` / `20260908103411_custom_4-student-payments-status-transition` hold identical payloads before adding `custom_5-teacher-transaction-settlement` | planning | 2.1 | ❌ Blocked | — | Pre-existing repo anomaly; Task 2.1 documents payload comparison in its outcome |

---

## Planning-time scope decisions (NOT deferred work — recorded for greppability)

- Payment-gateway refunds (`PaymentStatus.Refunded` writer) — owned by the payment-gateway lineage; untouched here.
- Real-money payout disbursement after approval — ops concern; `approveWithdrawal` settles the ledger only.
- Teacher/admin notifications on withdrawal decision — ticket ACs do not require them; adding later is a pure additive change (notification engine exists).
- Teacher wallet 50-row ledger cap ("F10") — unchanged; admin surfaces get their own server-paginated queries.

---

## Status Values

- ✅ **Done** — completed and verified (reference recorded)
- ⚠️ **Partial** — partially done, follow-up needed
- ❌ **Blocked** — unresolved; plan cannot complete while any ❌ remains
- 🔄 **In Progress** — being worked on

## Enforcement

Final gate (Task 6.1) runs:

```bash
grep -c "❌\|⚠️" ai/plans/sprint_3/admin-financial-auditing-payments-wallet/deferred-items.md
# Expected: 0 — D1 must be ✅ by Task 2.1's outcome
```
