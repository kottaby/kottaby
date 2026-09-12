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
| D-413 | Plan §3.4 / REQ-053 / tasks.md 4.1.TE prescribe **413** for over-cap webhook bodies; the landed route (subscription-purchase plan) + its committed exemption row (`docs/graphql/error-handling-contract.md`: "parse/oversize rejections 400 through `apiErrorResponse`") answer a masked **400 `PAYMENT_WEBHOOK_BODY_TOO_LARGE`**, and task 4.1 mandates KEEPING the landed bounded-read/envelope surfaces while plan-review R2/F5 freezes the mock branch's semantics — one shared transport gate cannot split its status per provider, so 400 is kept on BOTH branches | 4.1 | 5.6 (mid-point review) / 9.1 (final gate) — plan-owner adjudication; a literal 413 means rewriting the committed exemption-contract row + both branches' landed tests as a deliberate contract change (future ticket if wanted) | 📅 Forward | `outcome/4.1-outcome.md` §"REQ-053 status matrix — coverage + one deviation ruling" (test-pinned: cap-exact accepted, cap+1 masked 400, mode-gate 404 before size gate) | Same ruling class as §3.4's literal `{"received": false}` bodies vs the landed enveloped acks — committed contract wins; non-blocking by ledger semantics |
| D-514 | The reconciliation sweep's gate is the API key ALONE (REQ-035 wording), but the landed `PaymobHttpClient` constructor demands the full `PaymobResolvedConfig` (all checkout credentials non-null); task 5.1 resolved this WITHOUT widening the 3.3 type (which would force dead fail-closed guards on members the checkout path type-guarantees) by filling the inquiry-unused members with resolved-or-inert values (`""`/`0`) that the inquiry path provably never reads — the suite pins the wire carries ONLY the API key (mint body) and minted token + merchant reference (inquiry body) with `Content-Type`-only headers | 5.1 | 5.6 (mid-point review) / 9.1 (final gate) — adjudication that the inert-member fill is acceptable vs a future `Pick<>`-narrowing refactor of `paymob.http.ts`'s config type (a deliberate 3.3 contract change; the wire-pinning tests make that refactor safe whenever wanted) | 📅 Forward | `outcome/5.1-outcome.md` §"Summary" (inert-member design decision) + §"Semantic review checklist" (fallback arms live, wire pinned) | Non-blocking: no secret ever reaches the network on this path (test-pinned); the alternative refactor touches a landed 3.3 file + its suites for zero behavioral gain |

---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan

---

## Cross-Plan Amendments (A-set — applied to the EXISTING subscription-purchase seams by this plan)

The subscription-purchase backend has landed with a mock-adapter-only shape. This plan amends five EXISTING contracts to fit a real redirect-based gateway. They are blocking coordination items, NOT implementation deferrals:

| ID | Amendment | Detail | Coordinating task |
|---|---|---|---|
| A1 | `PaymentCheckoutInput` += `specialReference: string` + `billing: { firstName; lastName; email; phone: string \| null }` | Paymob intention creation needs correlation + billing fields | Task 2.3 |
| A2 | `PaymentWebhookEvent` += `providerTransactionId?: string` | REQ-031 persistence of Paymob `obj.id` | Task 2.3 |
| A3 | `parseWebhookEvent(input: WebhookParseInput): PaymentWebhookEvent \| null` replaces the planned `parseWebhookEvent(rawBody)` | Paymob's `hmac` is a QUERY param — the parse step needs `query`; `null` = verified-but-ignored | Tasks 2.3, 3.3, 4.1 |
| A4 | `StudentPaymentRepository` += `findStalePendingByGateway(gateway, olderThan, limit)` | Reconciliation sweep query | Task 2.2 |
| A5 | Factory env access via the `backend/lib/env.ts` typed config snapshot (the `getPaymobConfig()` getter added by Task 2.1; `resetEnvironmentCache()` already invalidates it) | Established mechanism in this repo | Task 2.1 |
| A6 | Activation failure path emits `payment_confirmation` on failure too (this plan's REQ-024/REQ-028); the LANDED activation contract (canonical doc `docs/billing/subscription-purchase.md` §7 step 4) currently says "no notification" on `failed` | **AUTHOR RULING (2026-09-07): KEEP the failure notification** — the funnel UX needs a failure signal (result page + notification counterpart); this plan amends the landed activation service's failure branch to persist+publish the failure notification (success semantics unchanged); the canonical doc's §7 step 4 wording is updated in the same change set | Task 4.2 |

---

## Inbound Forward Contracts (resolved BY this plan — NOT deferred items)

| External contract | Source | How this plan resolves it |
|---|---|---|
| "Real payment gateway adapter (Paymob/Stripe) + purchase UI funnel" | `ai/plans/sprint_1/subscription-purchase-payment-gateway/deferred-items.md:45` (Known Cross-Ticket Deferrals) | This plan IS that Sprint-2 gateway ticket: Paymob adapter (Phase 3) + funnel UI (Phase 7) |
| REQ-064 forward ruling ("real-gateway ticket SHALL build the purchase funnel on top of `purchaseSubscription`") | the subscription-purchase plan `specs.md:120` | Phase 7 builds exactly that funnel |
| REQ-017 descriptor consumption for a real provider | the subscription-purchase plan `specs.md:76` | Paymob `createCheckout` returns the descriptor with live `checkoutUrl` (REQ-017 here) |
| "integrate real gateway in Sprint 2" risk mitigation | `docs/planning/SPRINT_PLAN.md:161` | This plan |

## Known Cross-Ticket Deferrals (NOT this plan's ledger entries)

These belong to other tickets and are recorded so their consumers see them — they MUST NOT block this plan's completion gate:

| Item | Owning ticket | Note |
|---|---|---|
| Refund / void / capture adapter methods + admin UI | the admin refund-lane ticket admin lane | callback shapes safely ignored here (REQ-026); Paymob endpoints documented in `.agents/skills/paymob-payments/references/docs/manage-payment-apis/` |
| Saved cards (CIT/MIT/tokenization) | future ticket | TOKEN callbacks are safely ignored (REQ-026); enabling them is an intentional scope change |
| Pixel embedded checkout (in-page) | future UX ticket | D2 chose Unified Checkout redirect; Pixel is a drop-in alternative UX, not a different contract |
| Paymob-native subscription plans | rejected by design | Kottaby subscriptions are one-time purchases; the gateway-side recurring module does not fit the domain model |
| ngrok tunnel envs (`NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, `NGROK_PORT`) | OPTIONAL operator/dev config — never blocking | The callback-channel factory (D14/REQ-090..093) is fully implemented WITHOUT these values (simulation channel is the complete dev default); setting them later upgrades dev (and channel-aware tests) to real ngrok delivery with zero code changes — nothing is deferred waiting on them |
| Sandbox phone-placeholder tolerance validation | manual QA before live rollout | REQ-012 placeholder assumption must be proven against Paymob sandbox (runbook in final doc — task 9.2) |

---

## Enforcement

The **final quality gate task (9.1)** verifies (scoped to the Ledger Table so the Status Values legend's own glyphs do not self-match):

```bash
awk '/^## Ledger Table/,/^## Status Values/' ai/plans/sprint_1/paymob-gateway-integration/deferred-items.md | grep -c "❌\|⚠️"
# Expected: 0
```

**Exit criteria:** Plan cannot be marked complete while any ❌ or ⚠️ status remains in the Ledger Table (the A-set and cross-ticket tables carry no statuses and do not block the gate).
