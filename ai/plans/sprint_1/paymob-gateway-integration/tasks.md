# `tasks.md` — Paymob Gateway Integration (Real Subscription Payments)

**Plan directory:** `ai/plans/sprint_1/paymob-gateway-integration/`
**Specs:** `specs.md` · **Plan:** `plan.md` · **Ledger:** `deferred-items.md` · **Outcomes:** `outcome/`

> **Source of truth:** `specs.md` (REQ-001..REQ-082 bands) + `plan.md` (D1..D13, amendments A1..A5).
> **Blocking dependency:** the subscription-purchase plan's backend lands first (port, factory, purchase/activation services, repos, resolvers — see `ai/plans/sprint_1/subscription-purchase-payment-gateway/tasks.md`). This plan EXTENDS those seams; the A1–A5 cross-plan amendments are tracked in `deferred-items.md`.

## Document Information

- **Feature**: Paymob gateway integration + student purchase funnel wire-up
- **Ticket**: none in `docs/planning/TICKETS.md` (anchor: `docs/planning/SPRINT_PLAN.md:161` + the subscription-purchase plan forward contract)
- **Version**: 1.0 · **Date**: 2026-09-07

### Numbering & Traceability Conventions

- Task ids `X.Y` follow phases; every implementation task carries the pipeline: `.QL` (quality loop `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`, exit 0), `.TE` (4-tier tests), `.SEC` (BOLA/BOPLA/BFLA audit), `.SR` (semantic review), `.IV` (instruction verification — `sub-loop.ts` auto-discovers applicable AGENTS.md/`.agents/instructions/` files; read ALL printed).
- Outcome files: `outcome/<task-id>-outcome.md` per task (MANDATORY).
- `_Requirements:` lines list REQ ids EXPANDED (no ranges) — grep-verifiable.
- DB/service/route tests run via `bun run test/scripts/run-test.ts`; UI tests via `bun run test:ui:components`; journeys under `test/workflows/` per `docs/testing/workflow-journey-tests.md` (exists).

## Non-Negotiable Execution Protocol

1. **Read `outcome/` first** — before ANY task, read every existing file in this plan's `outcome/` (six `research-*` digests ship with the plan).
2. **Per-file loop** — after each file edit, `sub-loop.ts <file> --lifecycle duplicates` must exit 0 before the next file.
3. **Semantic review before `[x]`** — race conditions, env getters registered, zero dead code, zero cross-layer imports, enum value imports, deferred items logged.
4. **No plan-meta in code** — comments/JSDoc never reference REQ ids, task ids, or plan paths.
5. **Evidence or it didn't happen** — `[x]` only with an outcome file.

---

## Phase 0: Pre-Implementation Baseline (MANDATORY)

- [ ] 0.1 Record tsgo/biome/lint baselines (counts in `outcome/0.1-outcome.md`); confirm the subscription-purchase plan execution state in the working tree (port/factory/purchase symbols present or NOT — the whole plan keying off it); re-confirm every `path:line` cited in `specs.md` §1 still resolves.
  - _Requirements: REQ-001_

## Phase 1.5: Plan Review Gate (MANDATORY — executed at authoring time)

- [x] 1.1 Plan review gate executed; verdict recorded in `outcome/plan-review-R1.md`.

---

## Phase 2: Configuration, Schema & Type Foundations

- [ ] 2.1 Paymob env configuration
  - EXTEND `backend/lib/env.ts`: `EnvironmentConfig.paymob` object + parsing in `readEnvironment()` + `getPaymobConfig()` getter (plan §4.1 — 10 keys incl. defaults for `PAYMOB_API_BASE_URL`/`PAYMOB_CHECKOUT_BASE_URL`/timeout/sweep window).
  - EXTEND `.env.example` with the 10 keys using `<your-…-here>` placeholders; EXTEND `backend/lib/test-ci-env.ts` with harmless test-mode defaults.
  - [ ] 2.1.QL · [ ] 2.1.TE — unit tests: defaults applied, integer coercion for integration IDs, empty-string secret rejected, cache reset parity · [ ] 2.1.SEC — secrets only parsed server-side; nothing logged · [ ] 2.1.SR · [ ] 2.1.IV
  - _Requirements: REQ-002, REQ-040, REQ-042_
- [ ] 2.2 Schema delta + migration 5
  - EXTEND `backend/db/schema/billing/student-payments.ts` (+`providerTransactionId`); CREATE `backend/db/migration/5-student-payments-provider-transaction.sql` + `-sqlite.sql` pair (trigger allowance for NULL→value during the guarded transition; schema via push, trigger via migration); EXTEND `backend/db/repo/billing/student-payment.repository.ts` with `findStalePendingByGateway(gateway, olderThan, limit)` (amendment A4 — verify the subscription-purchase plan landed it first; else ledger).
  - [ ] 2.2.QL · [ ] 2.2.TE — EXTEND `backend/db/test/logic/billing/student-payment.repository.test.ts` (the subscription-purchase plan's planned suite location, `tasks.md:87`): `runInRollback` + `tx` everywhere; allow set-on-transition; forbid second update; forbid financial-column mutation · [ ] 2.2.SEC — freeze proofs · [ ] 2.2.SR · [ ] 2.2.IV
  - _Requirements: REQ-004, REQ-031, REQ-073_
- [ ] 2.3 Canonical vendor types + port amendments
  - CREATE `backend/types/billing/paymob.types.ts` (vendor DTOs per plan §2.3); EXTEND `backend/types/billing/payment-gateway.types.ts` per amendments A1–A3 (coordinate with the subscription-purchase plan executor if concurrent — ledger A-set).
  - [ ] 2.3.QL · [ ] 2.3.TE — type-level assertions compile; enum value imports · [ ] 2.3.SEC · [ ] 2.3.SR — types-only file (no runtime in types dir) · [ ] 2.3.IV
  - _Requirements: REQ-005, REQ-014, REQ-017, REQ-031_

---

## Phase 3: Paymob Port Implementation

- [ ] 3.1 HMAC verification module
  - CREATE `backend/services/billing/payment-gateway/paymob/paymob.constants.ts` (POST/GET/token key lists verbatim from mirror `hmac/hmac-transaction-callback.md:27-48` + `hmac/hmac-for-card-tokens.md:23-32`) and `paymob.hmac.ts` (builders + `verifyPaymobHmac` with digest-based `timingSafeEqual`).
  - [ ] 3.1.QL · [ ] 3.1.TE — golden vectors (valid POST success/declined, valid GET) + tamper vectors (flipped `success`, altered `amount_cents`, missing key, wrong secret, GET `order` vs `order_id` fallback, token-list vector) in colocated `__tests__/paymob.hmac.test.ts` · [ ] 3.1.SEC — constant-time behavior · [ ] 3.1.SR · [ ] 3.1.IV
  - _Requirements: REQ-004, REQ-022, REQ-070_

- [ ] 3.2 Paymob mappers
  - CREATE `backend/services/billing/payment-gateway/paymob/paymob.mapper.ts`: `buildIntentionRequest` (cents conversion w/ 2dp guard, billing placeholders, integer method IDs, `special_reference`), `toCheckoutDescriptor` (validates `id`/`client_secret`; URL assembly from config), `mapCallbackToEvent` (incl. `providerTransactionId`, cents→decimal string).
  - [ ] 3.2.QL · [ ] 3.2.TE — field-by-field request body assertions; boundary cents cases; descriptor URL assembly; callback mapping incl. declined/PENDING flags · [ ] 3.2.SEC — no client-derived money fields · [ ] 3.2.SR · [ ] 3.2.IV
  - _Requirements: REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-016, REQ-017, REQ-044_
- [ ] 3.3 HTTP client + adapter
  - CREATE `…/paymob/paymob.http.ts` (injectable `fetch` boundary; `AbortSignal.timeout`; `retryTransient` only on transport/5xx; typed minimal validation) and `…/paymob/paymob.adapter.ts` — `class PaymobPaymentGateway implements PaymentGatewayPort` with `requirePaymobConfig()` fail-closed guard, `createCheckout`, `parseWebhookEvent(input)` (returns `null` for verified-but-ignored variants; throws typed errors the route maps to 400/401).
  - [ ] 3.3.QL · [ ] 3.3.TE — mocked-fetch suite incl. no-retry-on-unknown-state, timeout aborts, 404/400 upstream mapping, config guard throws · [ ] 3.3.SEC — no upstream body leaks to caller · [ ] 3.3.SR — zero module-level mutable state · [ ] 3.3.IV
  - _Requirements: REQ-004, REQ-010, REQ-013, REQ-015, REQ-032, REQ-033, REQ-040, REQ-042, REQ-050, REQ-051, REQ-072_

---

## Phase 4: Webhook Receiver

- [ ] 4.1 Provider-dispatched webhook route
  - CREATE/EXTEND `app/api/payments/webhook/route.ts` (if the subscription-purchase plan's route exists, extend with the paymob branch; else create the full provider-dispatched route): paymob-branch 404 gate when `PAYMENT_GATEWAY_PROVIDER ≠ paymob` → 64 KiB bounded raw read → parse+verify via the active port (`WebhookParseInput` incl. query) → dispatch `PaymentWebhookEvent` to the subscription-purchase plan's `SubscriptionActivationService.processWebhookEvent` → 200 ack per plan §3.4 matrix.
  - REGISTER: `ROUTE_INVENTORY` += `{ path: "/api/payments/webhook", classification: "provider-ack-exempt" }` (same change set; A4 static assertion) + exemption row in `docs/graphql/error-handling-contract.md` §Exemptions.
  - [ ] 4.1.QL · [ ] 4.1.TE — full REQ-053 status matrix; replay; TOKEN/refund/void no-ops; unknown `merchant_order_id` 200; oversized 413; paymob-branch 404 when `PAYMENT_GATEWAY_PROVIDER ≠ paymob` · [ ] 4.1.SEC — forged/malformed probes green; logs redacted + minimal · [ ] 4.1.SR · [ ] 4.1.IV
  - _Requirements: REQ-004, REQ-020, REQ-021, REQ-022, REQ-023, REQ-024, REQ-025, REQ-026, REQ-041, REQ-043, REQ-053, REQ-071_
- [ ] 4.2 Fulfillment integration (activation + notification)
  - Verify/wire the subscription-purchase plan's `SubscriptionActivationService.processWebhookEvent`: guarded transition resolves reference→pending pair, applies `providerTransactionId` when present (REQ-031 amendment), credits lanes, and emits `payment_confirmation` via `NotificationEngine.emitForUser` in-tx with `publishReceipts` post-commit; idempotency key `payment:<providerTransactionId>:confirmation`.
  - [ ] 4.2.QL · [ ] 4.2.TE — duplicate-event no-op; failure-path emission; notification persists-before-publish · [ ] 4.2.SEC — cross-student reference cannot reach another student's subscription · [ ] 4.2.SR · [ ] 4.2.IV
  - _Requirements: REQ-023, REQ-028, REQ-030, REQ-034_

---

## Phase 5: Reconciliation Backstop

- [ ] 5.1 Reconcile service
  - CREATE `backend/services/billing/payment-gateway/paymob/paymob.reconcile.ts` — `reconcilePendingPaymobPayments({ now, batchLimit })`: provider/API-key gating; stale-pending query via A4 repo method; per row: `mintAuthToken` → `transactionInquiryByMerchantRef`; PAID/UNPAID outcomes funneled through `SubscriptionActivationService.processWebhookEvent` (no bespoke update); bounded batch; per-row summary log.
  - [ ] 5.1.QL · [ ] 5.1.TE — gating (returns zero-count when unconfigured), inquiry mapping, handoff identity with webhook path, batch cap honored · [ ] 5.1.SEC — inquiry token never logged · [ ] 5.1.SR — no token caching (D7) · [ ] 5.1.IV
  - _Requirements: REQ-004, REQ-033, REQ-035, REQ-036_
- [ ] 5.2 Cron route
  - CREATE `app/api/cron/reconcile-paymob-payments/route.ts` following `app/api/cron/sweep-sessions/route.ts` (GET-only, `CRON_SECRET` timing-safe compare, 404 when inactive, `apiSuccessResponse`/`apiErrorResponse`, `resolveRequestId`); register in `ROUTE_INVENTORY` (A4 assertion green).
  - [ ] 5.2.QL · [ ] 5.2.TE — bearer ok/missing/wrong; mode gate; happy path delegates · [ ] 5.2.SEC · [ ] 5.2.SR · [ ] 5.2.IV
  - _Requirements: REQ-041, REQ-043, REQ-035_
- [ ] 5.3 Mid-point backend review gate (Phase 2.5 pattern)
  - Dispatch backend-scoped review over Phase 2–5 outputs (types/repo/service/route files); aggregate + fix findings per file with sub-loop re-verification; repeat until zero backend-specific findings; write `outcome/midpoint-review-R1.md`.
  - _Requirements: REQ-002, REQ-082_

---

## Phase 6: i18n

- [ ] 6.1 `checkout` locale namespace
  - CREATE `shared/locale/types/checkout/index.ts`, `shared/locale/en/checkout/index.ts`, `shared/locale/ar/checkout/index.ts`, `shared/locale/namespaces/checkout/checkout.namespace.ts`; register `checkoutTranslations` in `shared/locale/types/message.ts` (`Translations`) + `shared/locale/{en,ar}/messages.ts` + the namespace barrel; CREATE `shared/locale/checkout-namespace.parity.test.ts` (wallet/plans namespaces as templates).
  - [ ] 6.1.QL · [ ] 6.1.TE — parity + interpolation-type tests · [ ] 6.1.SEC · [ ] 6.1.SR · [ ] 6.1.IV
  - _Requirements: REQ-003, REQ-052, REQ-066_

---

## Phase 7: Student Purchase Funnel

- [ ] 7.1 GraphQL documents + codegen
  - CREATE `frontend/graphql/sharedDocuments/billing/subscription-purchase.documents.ts` (`purchaseSubscriptionMutationDocument`, `mySubscriptionsQueryDocument`; `TypedDocumentNode`; `id` in every selection set); export through `frontend/graphql/sharedDocuments/billing/index.ts`; run `bun run generate:gqlSchema && bun codegen` (requires the subscription-purchase plan resolvers present).
  - [ ] 7.1.QL · [ ] 7.1.TE — document snapshot/type compile checks · [ ] 7.1.SEC · [ ] 7.1.SR · [ ] 7.1.IV
  - _Requirements: REQ-060, REQ-075_

- [ ] 7.2 Student plan catalog + checkout initiation
  - CREATE `app/(dashboard)/student/plans/page.tsx` + `frontend/views/student/plans/` (`PlansCatalogContainer`, card/table tiers, `PlanPurchaseConfirmDialog`, `usePurchaseSubscription` with idempotency-key ref + redirect per plan §5); nav entry per navItems conventions; Storybook arm set.
  - [ ] 7.2.QL · [ ] 7.2.TE — buy CTA → mutation vars; redirect on `checkoutUrl`; mock-provider branch refetches; dialog cancel keeps key · [ ] 7.2.SEC — no plan price sent from client; student-only page guard · [ ] 7.2.SR · [ ] 7.2.IV
  - _Requirements: REQ-003, REQ-044, REQ-045, REQ-054, REQ-060, REQ-061, REQ-062, REQ-065_
- [ ] 7.3 Payment result page
  - CREATE `app/(dashboard)/student/checkout/result/page.tsx` + `frontend/views/student/checkout/result/PaymentResultContainer.tsx` (searchParams hints; authoritative `mySubscriptions` re-query; success/failed/pending branches; retry CTA); stories.
  - [ ] 7.3.QL · [ ] 7.3.TE — forged `success=true` query renders nothing positive without server truth · [ ] 7.3.SEC — student-scoped; no param trust · [ ] 7.3.SR · [ ] 7.3.IV
  - _Requirements: REQ-027, REQ-045, REQ-054, REQ-063, REQ-065_
- [ ] 7.4 My subscriptions page
  - CREATE `app/(dashboard)/subscriptions/page.tsx` + `frontend/views/student/subscriptions/MySubscriptionsContainer.tsx` (status chips active/pending/failed, empty state, failed-guidance copy); the existing `/subscriptions` nav link goes live.
  - [ ] 7.4.QL · [ ] 7.4.TE — all four state arms · [ ] 7.4.SEC — tenancy: only own rows · [ ] 7.4.SR · [ ] 7.4.IV
  - _Requirements: REQ-045, REQ-054, REQ-064, REQ-065_
- [ ] 7.5 Funnel component tests (Happy DOM)
  - CREATE suites under `test/ui/components/` per `test/ui/AGENTS.md` for the three containers (mocked Apollo).
  - [ ] 7.5.QL · [ ] 7.5.TE · [ ] 7.5.SEC · [ ] 7.5.SR · [ ] 7.5.IV
  - _Requirements: REQ-004, REQ-075_

---

## Phase 8: Journey Validation

- [ ] 8.1 Purchase→webhook→activation journey
  - CREATE `test/workflows/billing/paymob-purchase-journey.test.ts` per `docs/testing/workflow-journey-tests.md`: real services + real DB; Paymob HTTP mocked at the injected fetch boundary; drives purchase → synthetic HMAC-signed callback → asserts activation + lane credit + persisted notification; replay + tamper + failure journeys green.
  - [ ] 8.1.QL · [ ] 8.1.TE · [ ] 8.1.SEC — denial probes from specs §3 · [ ] 8.1.SR · [ ] 8.1.IV
  - _Requirements: REQ-004, REQ-023, REQ-025, REQ-028, REQ-034, REQ-074_

---

## Phase 9: Final Gate & Knowledge Propagation

- [ ] 9.1 Final quality gate
  - `bun quality-gate` green; baseline counts vs `outcome/0.1-outcome.md`; ledger gate `awk '/^## Ledger Table/,/^## Status Values/' deferred-items.md | grep -c "❌\|⚠️"` == 0; traceability loop (`for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo MISSING: $r; done`) zero misses; `outcome/9.1-outcome.md` written.
  - _Requirements: REQ-001, REQ-002, REQ-082_
- [ ] 9.2 Knowledge propagation
  - CREATE `docs/billing/paymob-gateway.md` (endpoints, HMAC, env matrix, flows, dashboard setup, test-credential runbook, troubleshooting); root `AGENTS.md` Important References one-liner; `backend/services/AGENTS.md` minimal rule line(s) + doc pointer; mark cross-plan amendments A1–A5 consumed/orphaned in the subscription-purchase plan's ledger coordination.
  - [ ] 9.2.QL · [ ] 9.2.SR · [ ] 9.2.IV
  - _Requirements: REQ-080, REQ-081_

---

## Traceability Map (REQ → tasks)

| REQ | Tasks |
|---|---|
| REQ-001 | 0.1, 9.1 |
| REQ-002 | 2.1 (pattern applied to all), 5.3, 9.1 |
| REQ-003 | 6.1, 7.2 |
| REQ-004 | 2.2, 3.1, 3.3, 4.1, 5.1, 7.5, 8.1 |
| REQ-005 | 2.3 |
| REQ-010 | 3.3 |
| REQ-011 | 3.2 |
| REQ-012 | 3.2 |
| REQ-013 | 3.2, 3.3 |
| REQ-014 | 2.3, 3.2 |
| REQ-015 | 3.2, 3.3 |
| REQ-016 | 3.2 |
| REQ-017 | 2.3, 3.2 |
| REQ-020 | 4.1 |
| REQ-021 | 4.1 |
| REQ-022 | 3.1, 4.1 |
| REQ-023 | 4.1, 4.2, 8.1 |
| REQ-024 | 4.1 |
| REQ-025 | 4.1, 8.1 |
| REQ-026 | 4.1 |
| REQ-027 | 7.3 |
| REQ-028 | 4.2, 8.1 |
| REQ-030 | 4.2 |
| REQ-031 | 2.2, 2.3 |
| REQ-032 | 3.3 |
| REQ-033 | 3.3, 5.1 |
| REQ-034 | 4.2, 8.1 |
| REQ-035 | 5.1, 5.2 |
| REQ-036 | 5.1 |
| REQ-040 | 2.1, 3.3 |
| REQ-041 | 4.1, 5.2 |
| REQ-042 | 2.1, 3.3 |
| REQ-043 | 4.1, 5.2 |
| REQ-044 | 3.2, 7.2 |
| REQ-045 | 7.2, 7.3, 7.4 |
| REQ-050 | 3.3 |
| REQ-051 | 3.3 |
| REQ-052 | 6.1 |
| REQ-053 | 4.1 |
| REQ-054 | 7.2, 7.3, 7.4 |
| REQ-060 | 7.1, 7.2 |
| REQ-061, REQ-062 | 7.2 |
| REQ-063 | 7.3 |
| REQ-064 | 7.4 |
| REQ-065 | 7.2, 7.3, 7.4 |
| REQ-066 | 6.1 |
| REQ-070 | 3.1 |
| REQ-071 | 4.1 |
| REQ-072 | 3.3 |
| REQ-073 | 2.2 |
| REQ-074 | 8.1 |
| REQ-075 | 7.1, 7.5 |
| REQ-080, REQ-081 | 9.2 |
| REQ-082 | 5.3, 9.1 |
