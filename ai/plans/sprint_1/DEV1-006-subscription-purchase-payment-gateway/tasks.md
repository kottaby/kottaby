# `tasks.md` — DEV1-006: Subscription Purchase via Payment Gateway

**Plan directory:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/`
**Specs:** `specs.md` · **Plan:** `plan.md` · **Ledger:** `deferred-items.md` · **Outcomes:** `outcome/`

**Nature of this ticket:** buys-side money flow — green-field creation on top of an EXISTING catalog (DEV1-005), with a deliberate, documented amendment to the `student_payments` immutability trigger and a mock gateway behind a provider-agnostic port.

## Document Information

- **Feature**: Subscription Purchase via Payment Gateway · **Ticket**: DEV1-006 (Sprint 1, 5 pts)
- **Version**: 1.0 · **Date**: 2026-09-06

### Numbering & Traceability Conventions

- Task ids `X.Y` follow phases below; every implementation task carries the standard pipeline suffixes: `.QL` (quality loop `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`, exit 0), `.TE` (4-tier tests), `.SEC` (BOLA/BOPLA/BFLA audit), `.SR` (semantic review checklist), `.IV` (instruction verification — read ALL AGENTS.md + `.github/instructions/*.instructions.md` files printed by `sub-loop.ts`).
- Outcome files: `outcome/<task-id>-outcome.md` per completed task (MANDATORY).
- Every task declares `_Requirements: REQ-…_` with EXPANDED id lists (no ranges) so traceability is grep-verifiable.
- Tests run via `bun run test/scripts/run-test.ts <path>` ONLY (REQ-004); NEVER raw `bun test`.

## Non-Negotiable Execution Protocol

1. **Read `outcome/` first** — before ANY task, read every existing file in this plan's `outcome/`.
2. **Per-file loop** — after each file edit, `sub-loop.ts <file> --lifecycle duplicates` must exit 0 before the next file.
3. **Semantic review before `[x]`** — race conditions, env-config registration, dead code, cross-layer imports, enum value imports, deferred items (skill checklist).
4. **No plan-meta in code** — comments/JSDoc never reference REQ ids, task ids, or plan paths.
5. **Evidence or it didn't happen** — checkboxes flip only with outcome-file evidence.

## Phase 0: Pre-Implementation Baseline (MANDATORY)

- [ ] 0.1 Record baseline & initialize ledger
  - Run `bun tsgo 2>&1 | grep "error TS" | wc -l`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline`; store counts.
  - Confirm `deferred-items.md` exists (authored at planning time, empty ledger).
  - Write `outcome/0.1-outcome.md` with counts + environment notes.
  - _Requirements: REQ-001_

## Phase 1.5: Plan Review Gate (MANDATORY — executed at planning time)

- [x] 1.1 Plan review via `@plan-review` skill
  - Executed against `specs.md` + `plan.md` + `tasks.md`; verdict + fixes recorded in `outcome/plan-review-R1.md` BEFORE any implementation task starts.
  - _Requirements: REQ-001_

## Phase 2: Schema, Enums & Types (Foundation)

- [ ] 2.1 Schema deltas + regeneration
  - EXTEND `backend/db/schema/enums.ts` (`subscriptionCreditLane`, `paymentGateway` + `"mock"`).
  - EXTEND `backend/db/schema/billing/plans.ts` (`balanceLane`, nullable).
  - CREATE `backend/db/schema/billing/subscription-purchase-idempotency.ts` + barrel re-export in `backend/db/schema/billing/index.ts`.
  - EXTEND `backend/db/schema/billing/subscriptions.ts` (partial unique index on `payment_reference`).
  - Apply via `bun run db` (push for schema; generate migration set); verify drift-free.
  - [ ] 2.1.QL / 2.1.TE / 2.1.SEC / 2.1.SR / 2.1.IV (standard pipeline; TE = schema-shape compile + push verification)
  - _Requirements: REQ-003, REQ-005, REQ-030, REQ-033, REQ-034_

- [ ] 2.2 Trigger amendment migration (INV-PAY2 reconciliation)
  - CREATE `backend/db/migration/4-student-payments-status-transition.sql` and `…-sqlite.sql` mirroring the 3-immutability pairing; `CREATE OR REPLACE FUNCTION prevent_student_payments_update()` enforcing: allow iff `OLD.status='pending' AND NEW.status IN ('paid','failed')` AND `student_id, subscription_id, amount, currency, payment_gateway, created_at` all unchanged; else RAISE.
  - NO inline `--` comments inside `sql` templates rule N/A here (raw .sql files; keep statements migration-safe, idempotent `CREATE OR REPLACE`, no `CONCURRENTLY`).
  - [ ] 2.2.QL / 2.2.TE / 2.2.SEC / 2.2.SR / 2.2.IV (TE here = wire the DB trigger test harness task 4.2 — the allowed/blocked matrix)
  - _Requirements: REQ-027, REQ-030, REQ-031, REQ-052_

- [ ] 2.3 Seed lane backfill
  - EXTEND `backend/db/seeds/billing/seed-plans.ts` each plan entry with its lane (Hifz-family → `Hifz`, Tajweed → `Tajweed`, review-style plans → `Reviews`); verify seeds re-run idempotently.
  - [ ] 2.3.QL / 2.3.TE / 2.3.SEC / 2.3.SR / 2.3.IV
  - _Requirements: REQ-034, REQ-062_

- [ ] 3.1 Billing types (new + extensions)
  - EXTEND `backend/types/billing/subscription.types.ts` (`SubscriptionReturnType`, `PurchaseSubscriptionInput`, `PurchaseSubscriptionReturnType`), `backend/types/billing/student-payment.types.ts` (`StudentPaymentReturnType`).
  - CREATE `backend/types/billing/subscription-purchase-idempotency.types.ts`.
  - CREATE `backend/types/billing/payment-gateway.types.ts` (`PaymentGatewayPort`, `PaymentCheckoutInput`, `PaymentCheckoutSession`, `PaymentWebhookEvent`).
  - Barrels only via `export *` (`backend/types/billing/index.ts`); NO service-layer type files anywhere.
  - [ ] 3.1.QL / 3.1.TE / 3.1.SEC / 3.1.SR / 3.1.IV
  - _Requirements: REQ-003, REQ-005, REQ-042, REQ-060_

- [ ] 3.2 Enum layer
  - CREATE `backend/enum/billing/subscription-credit-lane.enum.ts` + barrel; EXTEND `backend/enum/billing/payment-gateway.enum.ts` (`Mock = "mock"`).
  - Value imports only in runtime use (REQ-005).
  - [ ] 3.2.QL / 3.2.TE / 3.2.SEC / 3.2.SR / 3.2.IV
  - _Requirements: REQ-005, REQ-034, REQ-061_

## Phase 3: Repositories (interleaved 100%-coverage tests)

- [ ] 4.1 `SubscriptionRepository` (CREATE `backend/db/repo/billing/subscription.repository.ts` + barrel)
  - Methods per plan §4.1 (`insertSubscription`, `findById`, `findByPaymentReference`, `activatePendingOnce`, `listByUserId`); non-tx reads via `queryDb(tx)`; guarded update never SELECT-then-UPDATE.
  - [ ] 4.1.QL · [ ] 4.1.TE — `backend/db/test/logic/billing/subscription.repository.test.ts` (runInRollback, tx everywhere, zero-row guarded path proven; 100% coverage per `backend/db/test/AGENTS.md` rule 14) · [ ] 4.1.SEC · [ ] 4.1.SR · [ ] 4.1.IV
  - _Requirements: REQ-002, REQ-004, REQ-030, REQ-031, REQ-070_

- [ ] 4.2 `StudentPaymentRepository` (CREATE `backend/db/repo/billing/student-payment.repository.ts` + barrel)
  - `insertPayment`, `findBySubscriptionId`, `markPaidOnce`, `markFailedOnce` (guarded `status='pending'` predicate; relies on amended trigger).
  - [ ] 4.2.QL · [ ] 4.2.TE — `backend/db/test/logic/billing/student-payment.repository.test.ts` INCLUDING the trigger matrix: `pending→paid` ✅, `pending→failed` ✅, `paid→anything` ❌, amount tamper ❌, DELETE ❌ (single violated expectation = trigger raised, verified via try/catch — never `rejects` in rollback)  · [ ] 4.2.SEC · [ ] 4.2.SR · [ ] 4.2.IV
  - _Requirements: REQ-004, REQ-027, REQ-030, REQ-031, REQ-052, REQ-070_

- [ ] 4.3 `SubscriptionPurchaseIdempotencyRepository` (CREATE `…/subscription-purchase-idempotency.repository.ts` + barrel)
  - `insertClaim` / `findByKey` / `updateClaimSubscriptionId` mirroring `SessionRequestIdempotencyRepository` (`insertClaim` lets 23505 escape).
  - [ ] 4.3.QL · [ ] 4.3.TE — `backend/db/test/logic/billing/subscription-purchase-idempotency.repository.test.ts` (claim insert, duplicate-23505, update link, read)  · [ ] 4.3.SEC · [ ] 4.3.SR · [ ] 4.3.IV
  - _Requirements: REQ-004, REQ-014, REQ-030, REQ-070_

- [ ] 4.4 Repo extensions: `PlanRepository.findActiveById` + `StudentRepository.creditLaneBalance`
  - EXTEND `backend/db/repo/billing/plan.repository.ts` (active-only read predicate — DEV1-005 REQ-044 fulfillment); EXTEND `backend/db/repo/students/student.repository.ts` with `creditLaneBalance` (frozen `CREDIT_LANE_BALANCE_COLUMNS` map: Hifz→`balanceHifz`, Tajweed→`balanceTajweed`, Reviews→`balanceReviews`; do NOT touch `LANE_BALANCE_COLUMNS`).
  - [ ] 4.4.QL · [ ] 4.4.TE — extend existing suites (`backend/db/test/logic/billing/plan-catalog.repository.test.ts` for the plan predicate; the students test suite for the credit method; lane credit proves +N mutation + CHECK floor intact + unchanged-other-lanes) · [ ] 4.4.SEC · [ ] 4.4.SR · [ ] 4.4.IV
  - _Requirements: REQ-004, REQ-011, REQ-032, REQ-070_

## Phase 4: Payment Gateway Port (mock provider)

- [ ] 5.1 Port runtime + factory + env keys
  - CREATE `backend/services/billing/payment-gateway/payment-gateway.factory.ts` (lazy singleton keyed on `resolveEnvConfig("PAYMENT_GATEWAY_PROVIDER")`, default `"mock"`, `resetPaymentGateway()` clearing ALL resolved keys) + `mock-payment-gateway.adapter.ts` (deterministic `mock_<uuid>` references, `checkoutUrl: null`, `parseWebhookEvent(rawBody)`).
  - Register `PAYMENT_GATEWAY_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_ENABLED` in the env registry (`backend/lib/env.ts`).
  - Adapter throws NOTHING on checkout in mock mode; unknown provider key → fail-closed localized `DomainError`.
  - [ ] 5.1.QL · [ ] 5.1.TE — provider swap, unknown provider, env defaulting, adapter determinism, `resetPaymentGateway` completeness · [ ] 5.1.SEC · [ ] 5.1.SR · [ ] 5.1.IV
  - _Requirements: REQ-002, REQ-004, REQ-016, REQ-034, REQ-045_

- [ ] 5.2 Signature verification helper
  - CREATE `backend/services/billing/payment-gateway/webhook-signature.helpers.ts`: `verifyWebhookSignature(rawBody, signatureHeader, secret): boolean` — HMAC-SHA256 hex compare through the digest/timingSafeEqual idiom (copy `bearerSecretMatches` at `app/api/cron/sweep-sessions/route.ts:66-73` shape). Empty/missing signature/missing secret ⇒ false (fail-closed, never throw).
  - [ ] 5.2.QL · [ ] 5.2.TE — boundary (empty body, 64_000-byte body, wrong-length signature, binary-safe body) + fuzz wrong secrets · [ ] 5.2.SEC — forged signature probe · [ ] 5.2.SR · [ ] 5.2.IV
  - _Requirements: REQ-002, REQ-004, REQ-021, REQ-043, REQ-044, REQ-072_

## Phase 5: Purchase Service

- [ ] 6.1 `SubscriptionPurchaseService.purchase`
  - CREATE `backend/services/billing/subscription-purchase.service.ts` (+ `backend/services/billing/index.ts` barrel). Flow: governance-clean assert → require idempotency key (localized `ValidationError`) → `PlanRepository.findActiveById` → lane NULL → `PLAN_LANE_UNCONFIGURED` → adapter `createCheckout` (outside tx) → `withTransaction`: claim insert (23505 → same-caller `DUPLICATE_REQUEST` / foreign oracle-safe `NotFoundError("PAYMENT", …)`), `insertSubscription` (pending, `paymentReference = session.providerReference`, `paymentMethod = provider gateway enum`), `insertPayment` (amount/currency verbatim from plan; default `pending`), junction insert, `updateClaimSubscriptionId`.
  - i18n: `getServerTranslations(locale).errorsTranslations` property access; new `subscriptionPurchase` error group keys (types + en + ar).
  - [ ] 6.1.QL · [ ] 6.1.TE — 4-tier: happy path, inactive/missing plan, NULL lane, missing key, replay/foreign-key, renewal allowed, BOPLA field rejection, concurrent double-submit chaos · [ ] 6.1.SEC — BOLA/BOPLA/BFLA probes · [ ] 6.1.SR · [ ] 6.1.IV
  - _Requirements: REQ-002, REQ-003, REQ-004, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-016, REQ-017, REQ-030, REQ-031, REQ-040, REQ-042, REQ-050, REQ-051, REQ-052, REQ-053, REQ-071_

- [ ] 6.2 `SubscriptionPurchaseService.listOwn`
  - Owner-scoped list (`listByUserId`), `createdAt DESC`, locale tolerated param; NO id-addressed read added anywhere.
  - [ ] 6.2.QL · [ ] 6.2.TE — ownership isolation: caller A never sees caller B rows; empty state · [ ] 6.2.SEC · [ ] 6.2.SR · [ ] 6.2.IV
  - _Requirements: REQ-004, REQ-041, REQ-063, REQ-071_

## Phase 2.5: Mid-Point Backend Review Gate (MANDATORY — plan has >15 tasks)

- [ ] 6.5 Backend review checkpoint (after 6.2, before webhook/GraphQL)
  - Dispatch backend-scoped review subagents (`review-backend`, `review-types`, `review-config`) over all `backend/` files created/modified in Phases 2–5; aggregate backend-only findings; fix-per-file with `sub-loop.ts`; re-review until zero backend-specific findings.
  - Write `outcome/midpoint-review-R1.md`.
  - _Requirements: REQ-001, REQ-002_

## Phase 6: Activation Service & Webhook

- [ ] 7.1 `SubscriptionActivationService`
  - CREATE `backend/services/billing/subscription-activation.service.ts` (+barrel). `processWebhookEvent`: locate subscription by reference (unknown → `{ processed: false }`, warn-log only); verify amount/currency vs stored payment (mismatch → quarantine, `logger.error`, `{ processed: false }`); confirmed → `withTransaction`: `activatePendingOnce` (zero-row → replay path `{ processed: true, replayed: true }`), `markPaidOnce`, `creditLaneBalance`, `emitForUser` (`NotificationType.PaymentConfirmation`, purchaser locale, tx) then `publishReceipts` post-commit; failed → `markFailedOnce`, subscription untouched.
  - Late `confirmed` after `failed` → reject & log (payment guard excludes `failed`).
  - [ ] 7.1.QL · [ ] 7.1.TE — 4-tier incl. duplicate-confirmed single-credit proof, out-of-order delivery, quarantines, notification row content + receipt publish · [ ] 7.1.SEC · [ ] 7.1.SR · [ ] 7.1.IV
  - _Requirements: REQ-004, REQ-022, REQ-023, REQ-024, REQ-025, REQ-026, REQ-028, REQ-030, REQ-031, REQ-032, REQ-044, REQ-052, REQ-053, REQ-071_

- [ ] 8.1 Webhook route `app/api/payments/webhook/route.ts`
  - POST only; disabled → bare 404 (`PAYMENT_WEBHOOK_ENABLED !== "true"`); read body once with 64 KB cap; `verifyWebhookSignature` against `PAYMENT_WEBHOOK_SECRET`; parse via adapter `parseWebhookEvent`; delegate to `SubscriptionActivationService.processWebhookEvent` with envelope `apiSuccessResponse({ processed, replayed? }, { requestId })`; `apiErrorResponse` masked on throw; locale `"en"` envelope (cron-route parity); NO session reads.
  - **ROUTE_INVENTORY registration (MANDATORY, same task):** add `{ path: "/api/payments/webhook", classification: "provider-ack-exempt" }` to `backend/lib/gateway/route-inventory.ts` (static completeness assertion fails otherwise; verify whether the pre-existing cron route entry is present and report as CROSS-FILE finding if the assertion probes it); add the exemptions-register row to `docs/graphql/error-handling-contract.md`.
  - [ ] 8.1.QL · [ ] 8.1.TE — disabled→404, over-cap body, forged signature, malformed body, happy path with injected fake adapter · [ ] 8.1.SEC — spoofing probes · [ ] 8.1.SR · [ ] 8.1.IV
  - _Requirements: REQ-002, REQ-004, REQ-020, REQ-021, REQ-022, REQ-043, REQ-044, REQ-045, REQ-072_

## Phase 7: GraphQL Surface

- [ ] 9.1 Pothos objects + enum registration
  - CREATE `backend/graphql/pothos/billing/subscription.pothos.ts`, `student-payment.pothos.ts`, `purchase-checkout.pothos.ts` (wrapper, exception-policy); register `PaymentGatewayPothosEnum`, `PaymentStatusPothosEnum`, `SubscriptionStatusPothosEnum`, `SubscriptionCreditLanePothosEnum` in `backend/graphql/pothos/shared/enum.pothos.ts` (value-object form); EXTEND `plan.pothos.ts` with `balanceLane` + inputs; `bun run generate:gqlSchema && bun codegen`.
  - [ ] 9.1.QL · [ ] 9.1.TE — SDL snapshot: emitted schema contains the new fields/types · [ ] 9.1.SEC · [ ] 9.1.SR · [ ] 9.1.IV
  - _Requirements: REQ-002, REQ-005, REQ-060, REQ-061_

- [ ] 9.2 Mutations + query resolvers
  - CREATE `backend/graphql/mutation/subscription-purchase.mutation.ts` (`purchaseSubscription`, `$all` conjunction, `PlanCatalogService.coercePlanId`, key from `ctx.idempotencyKey`) and `backend/graphql/query/subscription.query.ts` (`mySubscriptions`); register via the existing side-effect index wiring.
  - [ ] 9.2.QL · [ ] 9.2.TE — covered by 9.3 suites · [ ] 9.2.SEC · [ ] 9.2.SR · [ ] 9.2.IV
  - _Requirements: REQ-010, REQ-041, REQ-050, REQ-063_

- [ ] 9.3 GraphQL contract tests
  - CREATE `backend/graphql/test/subscription-purchase.schema.test.ts`, `.roles.test.ts`, `.replay.test.ts`: 401 anonymous / 403 parent+teacher+admin / student happy path / missing-key 422 / replay 409 `DUPLICATE_REQUEST` / foreign-key oracle / `mySubscriptions` isolation; run via `bun run test/scripts/run-test.ts`.
  - [ ] 9.3.QL · [ ] 9.3.TE (the suites themselves) · [ ] 9.3.SEC · [ ] 9.3.SR · [ ] 9.3.IV
  - _Requirements: REQ-004, REQ-010, REQ-040, REQ-041, REQ-050, REQ-063, REQ-074_

## Phase 8: Catalog Lane Propagation + Admin Form Delta

- [ ] 10.1 Catalog service lane support
  - EXTEND `backend/types/billing/plan.types.ts` (`PlanSubmitInput`/`PlanUpdateInput` + `balanceLane?: SubscriptionCreditLane | null`), `PlanCatalogService` create/update validation + `PlanRepository` write mapping.
  - [ ] 10.1.QL · [ ] 10.1.TE — lane roundtrip, invalid member rejected, NULL tolerated (purchase remains fail-closed) · [ ] 10.1.SEC · [ ] 10.1.SR · [ ] 10.1.IV
  - _Requirements: REQ-004, REQ-050, REQ-051, REQ-062, REQ-071_

- [ ] 10.2 Admin form lane select (UI delta only)
  - EXTEND `frontend/views/admin/plans/` form + dialogs with a required-on-create lane select; extend `plans` namespace (types + en + ar + parity suite) with lane labels; MUI v9 / React 19 / theme discipline per frontend AGENTS.md; regen already done in 9.1 (codegen consumed directly).
  - [ ] 10.2.QL · [ ] 10.2.TE — component test: select renders options, create payload carries lane, existing catalog suites stay green (REQ-075) · [ ] 10.2.SEC · [ ] 10.2.SR · [ ] 10.2.IV
  - _Requirements: REQ-003, REQ-004, REQ-062, REQ-064, REQ-065, REQ-075_

## Phase 9: Cross-Actor Journey Tests

- [ ] 11.1 Journey suite (test-first within the task)
  - CREATE `test/workflows/billing/subscription-purchase.journey.test.ts` encoding specs §3 steps 1–10 exactly: purchase → key-replay rejection → confirmed activation (+balance delta + notification published ONLY to purchaser via spied transport) → idempotent gateway replay (no double credit) → failed-event terminality → parent/teacher/admin denial → second-student isolation.
  - Rules: committed fixtures in `beforeAll`, tracked cleanup in `afterAll` via `TrackedFixtures`, unique `jrn_billing_<8hex>` prefix, actor factories (`provisionStudentActor` / `provisionParentActor` / `provisionAdminActor`), NO `runInRollback`, spied fan-out transport.
  - [ ] 11.1.QL · [ ] 11.1.TE (the journey IS the 4-tier capstone) · [ ] 11.1.SEC (denial probes inside) · [ ] 11.1.SR · [ ] 11.1.IV
  - _Requirements: REQ-004, REQ-022, REQ-023, REQ-024, REQ-040, REQ-041, REQ-073_

## Phase 10: Final Gate & Knowledge Propagation

- [ ] 12.1 Baseline comparison + deferred enforcement
  - Re-run baseline trio; confirm zero NEW errors; `grep -c "❌\|⚠️" deferred-items.md` MUST be 0; re-run `bun quality-gate` clean.
  - [ ] 12.1.IV (instructions re-verified against every touched file)
  - _Requirements: REQ-001, REQ-002_

- [ ] 13.1 Knowledge propagation
  - CREATE `docs/billing/subscription-purchase.md` (canonical: port + mock provider, purchase contract, webhook security, guarded activation + credit, idempotency, trigger amendment, consumer guidance for DEV1-007/008/009 + DEV2-005).
  - Add addenda: `docs/specs/state-machine-invariants.md` (INV-PAY2 addendum, new INV-PAY6/INV-PAY7, §4.1 reconciliation), `docs/specs/open-decisions-and-gaps.md` (lane encoding D4, `mock` member D5, no-UI D8).
  - ≤2-line AGENTS cross-refs + root `AGENTS.md` Important References line; `sub-loop.ts` per modified doc/AGENTS file.
  - Write `outcome/13.1-outcome.md`.
  - _Requirements: REQ-080, REQ-081, REQ-082_

## Traceability Map (REQ → tasks)

| REQ | Tasks |
|---|---|
| REQ-001 | 0.1, 1.1, 6.5, 12.1 |
| REQ-002 | 4.1, 5.1, 5.2, 6.1, 8.1, 9.1, 12.1 |
| REQ-003 | 2.1, 3.1, 6.1, 10.2 |
| REQ-004 | 4.1–4.4, 5.1, 5.2, 6.1, 6.2, 7.1, 8.1, 9.3, 10.1, 10.2, 11.1 |
| REQ-005 | 2.1, 3.1, 3.2, 9.1 |
| REQ-010, REQ-011, REQ-012, REQ-013, REQ-015, REQ-016, REQ-017 | 6.1 (REQ-010 also 9.2, 9.3) |
| REQ-014 | 4.3, 6.1, 9.3 |
| REQ-020, REQ-021, REQ-043 | 5.2 (021/043), 8.1 |
| REQ-022, REQ-023, REQ-024, REQ-025, REQ-026, REQ-028 | 7.1 (022–024 also 11.1) |
| REQ-027 | 2.2, 4.2 |
| REQ-030, REQ-031 | 2.1, 2.2, 4.1–4.3, 6.1, 7.1 |
| REQ-032 | 4.4, 7.1 |
| REQ-033 | 2.1 |
| REQ-034 | 2.1, 3.2, 5.1 |
| REQ-040 | 6.1, 9.3, 11.1 |
| REQ-041 | 6.2, 9.3, 11.1 |
| REQ-042 | 3.1, 6.1 |
| REQ-044 | 5.2, 7.1, 8.1 |
| REQ-045 | 5.1, 8.1 |
| REQ-050, REQ-051, REQ-052, REQ-053 | 6.1 (050–053), 7.1 (052, 053), 8.1 (052 via envelope), 10.1 (050–051) |
| REQ-060, REQ-061 | 3.1 (060 types), 9.1 |
| REQ-062 | 2.3, 10.1, 10.2 |
| REQ-063 | 6.2, 9.2, 9.3 |
| REQ-064 | 10.2 (ruling conservancy), specs anchor only |
| REQ-065 | 10.2 |
| REQ-070 | 4.1–4.4 |
| REQ-071 | 6.1, 6.2, 7.1, 10.1 |
| REQ-072 | 5.2, 8.1 |
| REQ-073 | 11.1 |
| REQ-074 | 9.3 |
| REQ-075 | 10.2 |
| REQ-080, REQ-081, REQ-082 | 13.1 |
