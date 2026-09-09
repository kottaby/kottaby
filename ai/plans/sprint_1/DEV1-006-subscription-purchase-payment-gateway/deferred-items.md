# Deferred Items Ledger

**Feature:** `DEV1-006-subscription-purchase-payment-gateway`
**Plan:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/`
**Created:** `2026-09-06`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| — | *(none at plan-authoring time)* | — | — | — | — | Ledger initialized empty per protocol; every in-flight deferral during implementation MUST land here the moment it is identified. |

---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on

---

## Inbound Forward Contracts (resolved BY this plan — NOT deferred items)

| External contract | Source | How this plan resolves it |
|---|---|---|
| REQ-044 purchase-time `is_active` re-validation | `ai/finished_plans/sprint_1/dev1-005-plan-catalog-crud-admin-only/specs.md:83` (its deferred item D2) | Task 4.4 `PlanRepository.findActiveById` + Task 6.1 in-tx re-validation |
| B.9 offline-payment audit fields consumption | `docs/workflows/05-admin-governance-override.md` | Read-only usage of `payment_method`/`payment_reference`/`payment_verified_at`; new rows write these columns honestly |

## Known Cross-Ticket Deferrals (NOT this plan's ledger entries)

These belong to downstream tickets and are recorded here so their consumers see them — they MUST NOT block this plan's completion gate:

| Item | Owning ticket | Note |
|---|---|---|
| Real payment gateway adapter (Paymob/Stripe) + purchase UI funnel | Sprint-2 gateway ticket (`docs/planning/SPRINT_PLAN.md:161`) — planned 2026-09-07 at `ai/plans/sprint_1/paymob-gateway-integration/` | Mock adapter is the sanctioned Sprint-1 state (REQ-064 ruling) |
| Segregated crediting refinement + reviews-lane hold semantics | DEV1-007 | This plan credits the three real lanes; hold/debit vocabulary (`HeldBalanceLane`) untouched by design (plan D7) |
| Expiry job + balance zeroing at window end | DEV1-008 | Activation sets dates here; expiry sweep lands there |
| Admin extend/renew/cancel + foreign-observer subscription reads | DEV1-009 | Reads beyond `mySubscriptions` are deliberately absent (BOLA minimization) |

---

## Enforcement

The **final quality gate task (12.1)** verifies:

```bash
grep -c "❌\|⚠️" ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/deferred-items.md
# Expected: 0
```

**Exit criteria:** Plan cannot be marked complete if any ❌ or ⚠️ status remains.
