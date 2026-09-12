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
| D-515 | The new cron route answers TWO bare-404 fail-closed gates (disabled cron mode; unconfigured paymob provider/API key) under classification `envelope`, and the error-handling contract's exemptions inventory (`docs/graphql/error-handling-contract.md`:94-102) carries NO row for cron-route 404 gates — the sweep-sessions precedent documents that exemption ON THE ROUTE, with the contract reserving inventory rows for the provider-ack webhook surface whose classification IS the exemption vehicle; task 5.2 followed the precedent exactly (no doc change) | 5.2 | 5.6 (mid-point review) / 9.1 (final gate) — adjudication only if the review wants the exemptions inventory exhaustive over every envelope route's bare-404 gates (a doc-only change: one row naming both cron routes) | 📅 Forward | `outcome/5.2-outcome.md` §"Files NOT modified + why" (third bullet) | Non-blocking: both cron routes behave identically and the routes' own docblocks carry the exemption rationale; the registry row + A4 pin the classification |
| D-711 | The purchase-funnel documents (task 7.1) surface two NEW embedded value-object GraphQL types with no `id` — `PurchaseSubscriptionPayload` and `PaymentCheckout` (backend design: the normalizable entities are the nested `StudentSubscription`/`StudentPayment` rows); `frontend/graphql/AGENTS.md`'s embedded-type normalization policy requires `keyFields: false` typePolicies entries in `frontend/providers/apollo/apolloCache.ts` for such types, but that file is OUTSIDE 7.1's scoped file contract (documents + barrel + codegen outputs + snapshot tests only) | 7.1 | 7.2 (the first mutation consumer — add both typePolicies entries when wiring `usePurchaseSubscription`) / 5.6 (mid-point review) / 9.1 (final gate) | 📅 Forward | `outcome/7.1-outcome.md` §"Cross-file dependencies / forward item" | Non-blocking: without the entries Apollo may emit "cache data may be lost" warnings on REPEATED purchase-mutation writes (ROOT_MUTATION field overwrite); the `HealthCheck` precedent shows the repo adds these proactively — 7.2 lands them with the first real consumer |
| D-611 | `shared/AGENTS.md`'s "Namespace Registration" steps 3–5 still prescribe the REMOVED legacy loader's wiring (`MessageSchema` in a `types/message.ts` map, `namespacePaths` in `serverLegacy.ts`, `LocaleProvider` translations in `app/[locale]/layout.tsx` — none of those files/concepts exist in the live compile-time system); task 6.1 followed the LIVE convention instead (wallet/plans templates: `types/<ns>` interface + `en`/`ar` leaves + `namespaces/<ns>/<ns>.namespace.ts` handle + barrel/registry + `Translations`/messages registration + parity test) | 6.1 | 5.6 (mid-point review) / 9.1 (final gate) — or a future docs-hygiene ticket rewriting `shared/AGENTS.md`'s Translation System section to the live handle architecture (the stale `useAppTranslation("auth")` string-call examples are the same drift class, already flagged by research-05 §2) | 📅 Forward | `outcome/6.1-outcome.md` §"Instruction verification (6.1.IV)" | Non-blocking: every landed namespace (wallet, plans, sessions, …, checkout) already follows the live convention; only the prose in `shared/AGENTS.md` lags — no consumer reads the stale steps as code |

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
