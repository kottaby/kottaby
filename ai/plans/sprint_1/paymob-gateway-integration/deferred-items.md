# Deferred Items Ledger

**Feature:** `paymob-gateway-integration`
**Plan:** `ai/plans/sprint_1/paymob-gateway-integration/`
**Created:** `2026-09-07`

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
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan

---

## Cross-Plan Amendments (A-set — consumed or applied by DEV1-006's executor / this plan, per landing order)

This plan refines five DEV1-006 *planned-but-unwritten* contracts. They are blocking coordination items, NOT implementation deferrals:

| ID | Amendment | Detail | Coordinating task |
|---|---|---|---|
| A1 | `PaymentCheckoutInput` += `specialReference: string` + `billing: { firstName; lastName; email; phone: string \| null }` | Paymob intention creation needs correlation + billing fields | Task 2.3 |
| A2 | `PaymentWebhookEvent` += `providerTransactionId?: string` | REQ-031 persistence of Paymob `obj.id` | Task 2.3 |
| A3 | `parseWebhookEvent(input: WebhookParseInput): PaymentWebhookEvent \| null` replaces the planned `parseWebhookEvent(rawBody)` | Paymob's `hmac` is a QUERY param — the parse step needs `query`; `null` = verified-but-ignored | Tasks 2.3, 3.3, 4.1 |
| A4 | `StudentPaymentRepository` += `findStalePendingByGateway(gateway, olderThan, limit)` | Reconciliation sweep query | Task 2.2 |
| A5 | Factory env access via `backend/lib/env.ts` typed config (NOT the `resolveEnvConfig` helper DEV1-006's plan references — that helper does not exist in this tree, verified 2026-09-07) | Mechanism correction | Task 2.1 |
| A6 | Activation failure path emits `payment_confirmation` on failure too (this plan's REQ-024/REQ-028); DEV1-006's planned contract said "no notification" on `failed` (DEV1-006 `specs.md:83` REQ-023) | **AUTHOR RULING (2026-09-07): KEEP the failure notification** — the funnel UX needs a failure signal (result page + notification counterpart); DEV1-006 REQ-023's no-notification rule is superseded for the failure branch when this plan wires it into the activation surface (success semantics unchanged) | Task 4.2 |

---

## Inbound Forward Contracts (resolved BY this plan — NOT deferred items)

| External contract | Source | How this plan resolves it |
|---|---|---|
| "Real payment gateway adapter (Paymob/Stripe) + purchase UI funnel" | `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/deferred-items.md:45` (Known Cross-Ticket Deferrals) | This plan IS that Sprint-2 gateway ticket: Paymob adapter (Phase 3) + funnel UI (Phase 7) |
| REQ-064 forward ruling ("real-gateway ticket SHALL build the purchase funnel on top of `purchaseSubscription`") | DEV1-006 `specs.md:120` | Phase 7 builds exactly that funnel |
| REQ-017 descriptor consumption for a real provider | DEV1-006 `specs.md:76` | Paymob `createCheckout` returns the descriptor with live `checkoutUrl` (REQ-017 here) |
| "integrate real gateway in Sprint 2" risk mitigation | `docs/planning/SPRINT_PLAN.md:161` | This plan |

## Known Cross-Ticket Deferrals (NOT this plan's ledger entries)

These belong to other tickets and are recorded so their consumers see them — they MUST NOT block this plan's completion gate:

| Item | Owning ticket | Note |
|---|---|---|
| Refund / void / capture adapter methods + admin UI | DEV1-009 admin lane | callback shapes safely ignored here (REQ-026); Paymob endpoints documented in `.agents/skills/paymob-payments/references/docs/manage-payment-apis/` |
| Saved cards (CIT/MIT/tokenization) | future ticket | TOKEN callbacks are safely ignored (REQ-026); enabling them is an intentional scope change |
| Pixel embedded checkout (in-page) | future UX ticket | D2 chose Unified Checkout redirect; Pixel is a drop-in alternative UX, not a different contract |
| Paymob-native subscription plans | rejected by design | Kottaby subscriptions are one-time purchases; the gateway-side recurring module does not fit the domain model |
| Sandbox phone-placeholder tolerance validation | manual QA before live rollout | REQ-012 placeholder assumption must be proven against Paymob sandbox (runbook in final doc — task 9.2) |

---

## Enforcement

The **final quality gate task (9.1)** verifies (scoped to the Ledger Table so the Status Values legend's own glyphs do not self-match):

```bash
awk '/^## Ledger Table/,/^## Status Values/' ai/plans/sprint_1/paymob-gateway-integration/deferred-items.md | grep -c "❌\|⚠️"
# Expected: 0
```

**Exit criteria:** Plan cannot be marked complete while any ❌ or ⚠️ status remains in the Ledger Table (the A-set and cross-ticket tables carry no statuses and do not block the gate).
