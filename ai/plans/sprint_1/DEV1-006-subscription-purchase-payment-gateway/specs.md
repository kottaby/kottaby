# Requirements & Specification: DEV1-006 — Subscription Purchase via Payment Gateway

**Plan directory:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/`
**Specs path:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/specs.md`
**Deferred-items ledger:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/deferred-items.md`
**Outcome directory:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/outcome/`

## Document Information

- **Feature Name**: Subscription Purchase via Payment Gateway
- **Ticket Reference**: `docs/planning/TICKETS.md:449-493` (DEV1-006, Sprint 1, 5 pts, Blocked By DEV1-005 — done in `ai/finished_plans/sprint_1/dev1-005-plan-catalog-crud-admin-only/`)
- **Target Directory**: `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/`
- **Outcome Directory**: `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/outcome/`
- **Companion Plan**: `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/plan.md`
- **Companion Tasks**: `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/tasks.md`
- **Version**: 1.0
- **Date**: 2026-09-06
- **Author**: Spec Plan Generator (swarm)
- **Stakeholders**: Dev 1 stream (owner), Dev 2 (DEV2-005 verification-plan consumer), Planner/PM, QA

## Introduction

### Feature Summary
A student selects an active catalog plan, pays through the platform's payment gateway (Sprint-1: mock provider behind a provider-agnostic port — `docs/planning/SPRINT_PLAN.md:161`), and upon confirmed payment the subscription is activated: dates set from `interval_days` and the full `session_count` credited to the plan's designated balance lane.

### Business Value
Converts the curated plan catalog (DEV1-005) into revenue: monetized subscriptions become purchasable, recorded in the immutable `student_payments` ledger, and activated atomically — unlocking DEV1-007 (segregated crediting rules), DEV1-008 (validity windows), DEV1-009 (admin subscription management), and DEV2-005 (teacher verification purchase).

### Scope
- **IN**: Purchase mutation (student-only), mock payment gateway behind a provider port, payment webhook route (signature-verified), atomic activation (status + validity dates + lane credit + notification), idempotent purchase & webhook replay, renewal semantics, `student_payments` immutability reconciliation, plan→balance-lane encoding on `plans`, minimal admin plan-form extension (lane select).
- **OUT**: Real gateway SDK integration (Sprint 2 per `SPRINT_PLAN.md:161`); segregated crediting refinement & reviews-lane semantics (DEV1-007); expiry job & balance zeroing (DEV1-008); admin extend/renew/cancel (DEV1-009); refund flows; student-facing purchase UI (needs real checkout UX — see REQ-064 ruling); teacher wallet side (existing, untouched).

## 1. Executive Summary & Problem Statement

**Verification-first finding (ground truth, all verified against the tree):**

| Substrate | State | Evidence |
|---|---|---|
| `plans` table + catalog CRUD + admin UI | EXISTS (DEV1-005 shipped) | `backend/db/schema/billing/plans.ts:14-36`; `backend/services/billing/plan-catalog.service.ts:205`; `backend/graphql/mutation/plan-catalog.mutation.ts` |
| `subscriptions` table (`user_id` generic per B.8/C.2, `payment_method`/`payment_reference`/`payment_verified_at` per B.9) | EXISTS, zero consumers | `backend/db/schema/billing/subscriptions.ts:19-42` |
| `student_payments` (append-only; UPDATE/DELETE trigger-blocked) | EXISTS, triggers hard-block UPDATE | `backend/db/schema/billing/student-payments.ts:23-48`; `backend/db/migration/3-immutability-triggers.sql:59-83` |
| `student_subscriptions` junction | EXISTS, zero consumers | `backend/db/schema/billing/student-subscriptions.ts:20-35` |
| Student balance lanes + credit primitives | Columns EXIST; 3-lane debit/refund primitives exist; NO credit-by-amount method | `backend/db/schema/students/students.ts:24-27`; `backend/db/repo/students/student.repository.ts:373,402` |
| Subscription/payment repositories, services, Pothos types, resolvers | NOT FOUND — green-field CREATE | verified by exhaustive grep |
| Any payment gateway code / webhook route | NOT FOUND | no `stripe|paymob|fawry` adapter; no `app/api` webhook route |
| Purchase-time re-validation contract (INV-PC1/REQ-044) | Documented forward contract, unimplemented | `ai/finished_plans/sprint_1/dev1-005-plan-catalog-crud-admin-only/specs.md:83` |
| Plan → balance-lane mapping | MISSING everywhere (no column, enum, parser, or doc decision) | verified across schema, seeds, `docs/specs/`, `docs/billing/plan-catalog.md` |
| Idempotency claim pattern for money-touching creation | EXISTS (session precedent) | `backend/services/classes/session-lifecycle.booking.ts:225-244`; `backend/db/repo/classes/session-request-idempotency.repository.ts` |
| Notification type `payment_confirmation` | EXISTS, no producer yet | `backend/enum/notifications/notification-type.enum.ts:11` |

**Problem:** Students cannot convert catalog plans into usable session balances; no purchase, payment-recording, confirmation, or activation machinery exists.

**Actors:** Student (purchaser), Payment Gateway (system emitter via webhook), Parent (denied), Administrator (configures plans incl. lane), second Student (foreign-observer probe).

**Non-goals:** real gateway SDKs, refunds, expiry sweeps (DEV1-008), reviews-lane hold/debit semantics (DEV1-007), teacher wallet, invoicing.

## 2. Requirements (EARS)

### 2.0 Execution Protocol & Engineering Discipline

- **REQ-001 (Baseline & Outcome Protocol)**: WHEN implementation begins THEN the executor SHALL record the error baseline (`bun tsgo`, `bun biome:check`, lint JSON) in `outcome/0.1-outcome.md`, SHALL read ALL existing files under `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/outcome/` before ANY task, SHALL write `<task-id>-outcome.md` after each task, and SHALL flip task checkboxes `[ ]` → `[x]` in `tasks.md` only with verification evidence.
- **REQ-002 (Per-File Quality Loop)**: WHEN any file is created or modified THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL pass with exit code 0 (progressive tsgo → oxlint → biome → lint → duplicates, short-circuit on first failure) before the next file is touched.
- **REQ-003 (i18n Compile-Time Discipline)**: WHEN any user-facing string is authored THEN services SHALL use `getServerTranslations(locale)` from `@/shared/locale/server-graphql` with property access ONLY (single argument — verified signature `shared/locale/server-graphql.ts`; two-arg `getTranslations`, `Translation.*` enums, `next-intl`, and hardcoded strings are PROHIBITED), resolvers SHALL use `ctx.t("errors")`, and every new key SHALL exist in the types group + `en` + `ar` leaves so the namespace parity suites pass (`shared/locale/*-namespace.parity.test.ts`).
- **REQ-004 (Test Runner Discipline)**: WHEN DB, service, GraphQL, or journey tests run THEN execution SHALL go through `bun run test/scripts/run-test.ts <path>` (log capture); raw `bun test` is PROHIBITED for DB/journey surfaces.
- **REQ-005 (Enum Discipline)**: WHEN a backend enum is used in a runtime expression (conditional, cast, object literal) THEN it SHALL be imported as a **value import** (never `import type`); GraphQL exposure SHALL register the canonical `backend/enum/` enum object in `backend/graphql/pothos/shared/enum.pothos.ts` (no literal `values: [...]` arrays).

### 2.1 Purchase Flow

- **REQ-010 (Purchase Mutation Surface)**: WHEN a client calls `purchaseSubscription(input: PurchaseSubscriptionInput!)` THEN the mutation SHALL be gated by `authScopes: { $all: { authenticated: true, role: [UserRole.Student] } }` (explicit `$all` conjunction — verified precedent `backend/graphql/mutation/classes/session-lifecycle.mutation.ts:98-103`), and the resolver SHALL derive `studentId` from `ctx.user.id` (shared-PK `students.id ≡ users.id`), never from input.
- **REQ-011 (Purchase-Time Activation Re-validation — fulfills DEV1-005 REQ-044/D2)**: WHEN a purchase executes THEN the plan SHALL be re-fetched INSIDE the transaction via an active-only predicate (`WHERE id = ? AND is_active = true`); a missing/inactive plan SHALL raise `PLAN_NOT_PURCHASABLE` (`NotFoundError("PLAN", …)` channel), rolling back the whole transaction.
- **REQ-012 (Pending Pair Creation)**: WHEN a valid purchase executes THEN the system SHALL create, inside ONE transaction: (a) a `subscriptions` row with `status = 'pending'` (default), `userId = caller`, `planId`, `paymentMethod = <gateway>`, `paymentReference = <gateway client reference>`; (b) a `student_payments` row with `status = 'pending'` (default), `studentId = caller`, `subscriptionId` linking (a), `amount`/`currency` copied verbatim (decimal strings) from the plan; (c) a `student_subscriptions` junction row `(studentId, subscriptionId)`.
- **REQ-013 (No Price Re-derivation)**: WHEN the payment row is written THEN `amount`/`currency` SHALL be copied from the freshly-read plan row with NO arithmetic and NO client-supplied amounts (BOPLA defense; money-as-string discipline per `WalletService` precedent).
- **REQ-014 (Mandatory Payment Idempotency)**: WHEN the purchase mutation is called THEN `ctx.idempotencyKey` (captured at `backend/graphql/gqlContextFactory.ts:181`, propagation-only) SHALL be non-empty — a missing key SHALL raise a localized `ValidationError` — AND the key SHALL be claimed via an INSERT into a dedicated `subscription_purchase_idempotency` table inside the same transaction (fate-sharing); a 23505 unique violation on replay SHALL map to `ConflictError("DUPLICATE_REQUEST", …)` for the SAME caller (409 — client treats as already-received per `docs/IDEMPOTENCY.md`) and to an oracle-safe `NotFoundError("PAYMENT", …)` for a foreign caller (sessions precedent `session-lifecycle.booking.ts:168-181`).
- **REQ-015 (Renewal Semantics)**: WHEN a student with an ACTIVE subscription to a plan purchases that same plan (or any plan) again THEN the system SHALL create a NEW `pending` subscription + payment pair (renewal = new period); existing subscriptions SHALL NOT be mutated at purchase time (INV-PC2), and overlapping validity is deferred to DEV1-008 expiry mechanics.
- **REQ-016 (Governance Gate)**: WHEN a suspended/deleted/block-gated caller attempts purchase THEN the service SHALL reject with the localized governance-domain error via the shared governance predicate (precedent: `assertActorGovernanceClean` in `backend/services/classes/session-lifecycle.service.ts:167`); governance callers do not proceed to seat/billing writes.
- **REQ-017 (Checkout Payload)**: WHEN the purchase pair is committed THEN the response SHALL include the gateway checkout descriptor `{ provider, providerReference, checkoutUrl (nullable) }` produced by the active `PaymentGatewayPort` adapter — Sprint-1 this is the mock adapter (decision per `docs/planning/SPRINT_PLAN.md:161`); the adapter port SHALL be provider-agnostic so a real adapter (Paymob/Stripe) is a configuration swap.

### 2.2 Payment Webhook & Activation

- **REQ-020 (Webhook Route)**: WHEN the payment gateway calls back THEN the system SHALL expose `POST /api/payments/webhook` (`app/api/payments/webhook/route.ts`) following the envelope/auth precedent of `app/api/cron/sweep-sessions/route.ts` (`apiSuccessResponse` / `apiErrorResponse` / `resolveRequestId` from `@/backend/lib/api`), and WHEN the surface is not explicitly enabled (`PAYMENT_WEBHOOK_ENABLED !== "true"`) THEN it SHALL answer a bare 404 with NO envelope (no existence oracle).
- **REQ-021 (Signature Verification)**: WHEN a webhook request arrives THEN the raw body SHALL be read ONCE with a bounded cap (`MAX_PAYMENT_WEBHOOK_BODY_BYTES = 64_000`) and the request SHALL be rejected with the error envelope (401 channel) unless the HMAC-SHA256 signature of the raw body matches `PAYMENT_WEBHOOK_SECRET`, compared via the constant-time digest idiom (`createHash` both sides → `timingSafeEqual`) copied from `bearerSecretMatches` at `app/api/cron/sweep-sessions/route.ts:66-73`; the service layer SHALL receive only the ALREADY-VERIFIED event.
- **REQ-022 (Confirmation Transition — atomic)**: WHEN a verified `confirmed` event arrives for a known reference THEN inside ONE transaction the system SHALL: (a) flip `student_payments.status: pending → paid`; (b) flip `subscriptions.status: pending → active` setting `startDate = now()`, `endDate = now() + plan.intervalDays`, `paymentVerifiedAt = now()`; (c) credit the full `plan.sessionCount` to the plan's designated balance lane on `students`; (d) persist the `payment_confirmation` notification (`NotificationEngine.emitForUser(…, locale, tx)` — persist-first inside the tx, publish-after-commit via returned receipt, per `docs/notifications/realtime-engine.md`).
- **REQ-023 (Failure Transition)**: WHEN a verified `failed` event arrives THEN `student_payments.status` SHALL become `failed` and the subscription SHALL REMAIN `pending` (ticket AC); no credit, no notification; DEV1-009 owns operator follow-up on stuck pendings.
- **REQ-024 (Webhook Idempotent Replay)**: WHEN the same confirmation event is delivered twice THEN both subscription and payment guarded transitions SHALL hit zero rows (replay), NO second credit SHALL occur, and the route SHALL still ack 200 (gateways retry on non-2xx).
- **REQ-025 (Reference Correlation)**: WHEN an event's gateway reference is unknown THEN the route SHALL ack 200 with `{ processed: false }`, log a warning (never an error storm), and mutate NOTHING.
- **REQ-026 (Amount/Currency Mismatch Quarantine)**: WHEN a verified event's amount/currency disagrees with the stored payment row THEN the system SHALL mutate NOTHING, SHALL log `logger.error` with correlation ids (never raw payloads), and SHALL ack 200 — settlement integrity beats liveness.
- **REQ-027 (Immutability Reconciliation — INV-PAY2 Addendum)**: WHEN the activation flow flips payment status THEN the `prevent_student_payments_update` trigger SHALL have been amended (new custom migration `backend/db/migration/4-student-payments-status-transition.sql` + SQLite parity file) to permit ONLY `status: pending → paid|failed` with ALL financial/identity columns frozen (`studentId`, `subscriptionId`, `amount`, `currency`, `paymentGateway`, `createdAt`); every other UPDATE SHALL still raise — INV-PAY2's correction-ban is preserved, status lifecycle is an explicit guarded exception (addendum recorded in `docs/specs/state-machine-invariants.md`).
- **REQ-028 (Subscription Status=Pending Semantics)**: WHEN this ticket uses `status='pending'` on `subscriptions` for payment-unconfirmed rows THEN it SHALL be recorded as an addendum to `docs/specs/state-machine-invariants.md` §4.1 (where "Pending" was pre-A.9 defined as `start_date > now`): pending-until-paid is the A.9 enum meaning; the date-based reading is superseded for A.9-compliant writers.

### 2.3 Concurrency, Atomicity & Integrity

- **REQ-030 (Guarded Transitions Only)**: WHEN any subscription/payment state changes THEN it SHALL be a single guarded `UPDATE … WHERE <state predicate> … RETURNING` (zero-row = conflict/replay branch) — NO SELECT-then-UPDATE, NO `SELECT FOR UPDATE`, NO advisory locks (house doctrine).
- **REQ-031 (One Transaction per Phase)**: WHEN purchase or activation executes THEN ALL its row writes SHALL share one `withTransaction` scope (`backend/lib/db/with-transaction.ts:27`); the checkout-session creation call to the gateway SHALL happen BEFORE the transaction opens (network calls never inside DB transactions).
- **REQ-032 (Lane Credit Integrity)**: WHEN activation credits balance THEN the update SHALL be a single `balance_x = balance_x + sessionCount` on the resolved lane column via a new `StudentRepository.creditLaneBalance` method; existing `CHECK >= 0` constraints (`students.ts:42-45`) remain the floor guard; INV-B1 non-negativity preserved.
- **REQ-033 (Payment Reference Uniqueness)**: WHEN a gateway reference exists THEN a partial unique index `subscriptions_payment_reference_unique … WHERE payment_reference IS NOT NULL` SHALL prevent two subscriptions from ever claiming the same reference (cross-purchase correlation safety).
- **REQ-034 (Enum Completeness for the Dev Gateway)**: WHEN the mock provider processes payments THEN `payment_gateway` rows SHALL record a new enum member `mock` (pgEnum ALTER + TS enum member, two-phase-aware; INV-PAY4 addendum) — masking mock payments as `other` is PROHIBITED (audit honesty).

### 2.4 Security, Authorization & Tenancy

- **REQ-040 (Role Boundary)**: WHEN a non-student role (Parent, Teacher, Admin) calls `purchaseSubscription` THEN the scope gate SHALL answer 403 `FORBIDDEN`; parents cannot purchase (per `docs/workflows/04-parent-supervision-handshake.md:121`).
- **REQ-041 (BOLA / Ownership)**: WHEN subscription/payment reads execute (`mySubscriptions`) THEN queries SHALL be caller-scoped (`where user_id = ctx.user.id`); there is NO id-addressed read in this ticket, so no oracle surface is introduced; `payment_reference` values SHALL NOT be exposed to non-owner queries.
- **REQ-042 (BOPLA / Mass Assignment)**: WHEN inputs map to rows THEN strict DTO mapping SHALL be used (only `planId` accepted from the client; `amount`, `currency`, `userId` are server-derived); NO `{ ...input }` spread into any Drizzle write.
- **REQ-043 (Webhook Trust Boundary)**: WHEN the webhook executes THEN it SHALL carry NO user session context (server-to-server only); authorization is the signature check alone; payload contents SHALL never influence which subscription is touched beyond reference lookup.
- **REQ-044 (Secret & Payload Hygiene)**: WHEN errors/logs are produced THEN `PAYMENT_WEBHOOK_SECRET` and raw webhook bodies SHALL never be logged; logs carry reference + outcome enum only; `logger.logDomainError` for expected rejections, `logger.error` for quarantine/mismatch.
- **REQ-045 (Env Config Registration)**: WHEN gateway config is read THEN it SHALL go through `resolveEnvConfig` / `getEnv` from `@/backend/lib/env` (`backend/lib/env.ts:286,316`), keys `PAYMENT_GATEWAY_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_ENABLED` SHALL be registered in the env-config registry with `resetPaymentGateway()` invalidating ALL resolved keys (factory-parity with `resetWhatsappChannel`).

### 2.5 Validation, Errors & Localization

- **REQ-050 (DomainError Discipline & Code Map)**: WHEN any purchase/activation error surfaces THEN it SHALL be a `DomainError` subclass (`backend/lib/errors.ts`) mapped per `docs/graphql/error-handling-contract.md`: unauthenticated → `UNAUTHORIZED`; wrong role → `FORBIDDEN`; missing/inactive plan → `PLAN_NOT_PURCHASABLE`; unconfigured lane → `PLAN_LANE_UNCONFIGURED`; missing idempotency key → `VALIDATION`; replay → `DUPLICATE_REQUEST`; reference collision on insert → `CONFLICT`. Plain `new Error(...)` PROHIBITED.
- **REQ-051 (Localized Strings)**: WHEN new domain strings exist THEN keys SHALL be added to the `errors` namespace (new `subscriptionPurchase` grouping: `planNotPurchasable`, `planLaneUnconfigured`, `idempotencyKeyRequired`, `paymentReferenceConflict`, `paymentAmountMismatch`) in `shared/locale/types/errors/` + `shared/locale/en/errors/` + `shared/locale/ar/errors/`, and notification copy to the existing notifications namespace pattern (producer-side localized title/body, both locales) — parity suites gate the shape.
- **REQ-052 (DB Violation Translation)**: WHEN a PostgreSQL violation escapes service validation THEN it SHALL be translated via the cycle-safe `Error.cause` traversal (`23505` → `ConflictError`, `23514` → `ValidationError`, `2F003`/trigger raise → `ConflictError`) — precedent `plan-catalog.service.ts:248-258`; raw SQL text SHALL never reach the client.
- **REQ-053 (Warnings Policy)**: WHEN `subscriptions.status` semantics or trigger behavior surprise (e.g., failed-then-confirmed ordering) THEN the service SHALL prefer explicit guard outcomes: late `confirmed` after `failed` SHALL be rejected as replay-incompatible (payment row is `failed`, not `pending`) and logged — no silent upgrades.

### 2.6 GraphQL, Catalog Extension & UX

- **REQ-060 (Canonical Wire Types)**: WHEN GraphQL exposes the domain THEN exactly ONE canonical object type SHALL exist per entity — `Subscription` (from `SubscriptionReturnType`), `StudentPayment` (from `StudentPaymentReturnType`), plus wrapper types `PurchaseSubscriptionPayload` / `PaymentCheckout` (wrapper exception per `backend/graphql/AGENTS.md` §Exception Policy); every object SHALL expose `id` for Apollo normalization; types SHALL be imported from `@/backend/types` (no Pothos-local definitions).
- **REQ-061 (Enum Registration)**: WHEN enums reach the GraphQL schema THEN `PaymentGateway`, `PaymentStatus`, `SubscriptionStatus`, and the new `SubscriptionCreditLane` SHALL be registered ONCE in `backend/graphql/pothos/shared/enum.pothos.ts` from their `backend/enum/billing/*` definitions (currently UNREGISTERED — verified); `bun run generate:gqlSchema` + `bun codegen` SHALL run after registration.
- **REQ-062 (Plan Lane Extension — catalog)**: WHEN admins manage plans THEN `plans` SHALL gain a nullable `balance_lane subscription_credit_lane` column, the `plans` GraphQL type + `CreatePlanInput`/`UpdatePlanInput` SHALL expose it, `PlanCatalogService` validation SHALL accept a valid lane or `null` only, seeded plans (`backend/db/seeds/billing/seed-plans.ts:18-51`) SHALL carry lanes (Hifz-family → hifz, Tajweed → tajweed, Muraja'ah-style review plans → reviews), and the admin plan form SHALL gain a required-on-create lane select (EXTEND `frontend/views/admin/plans/`, not rewrite).
- **REQ-063 (Owner List Query)**: WHEN a student needs post-payment state THEN `mySubscriptions: [Subscription!]!` SHALL return the caller's subscriptions (all statuses, `created DESC`) with NO other-tenant rows — the only read surface added by this ticket.
- **REQ-064 (No Purchase UI Ruling — Explicit)**: This ticket ships NO student-facing purchase UI. Rationale: checkout UX without a real gateway is placeholder work; Sprint 2 ("integrate real gateway", `SPRINT_PLAN.md:161`) re-does it. The mutation is the contract; the admin plan-form lane select (REQ-062) is the ONLY UI delta. When the real-gateway ticket lands it SHALL build the purchase funnel on top of `purchaseSubscription`.
- **REQ-065 (Frontend Discipline for the Lane Delta)**: WHEN the admin form is touched THEN MUI v9 (sx-only styling, `*Outlined` icons), React 19 (`React.SubmitEvent`, no `FormEvent`), theme-palette-only colors, and the existing `plans` namespace (`useAppTranslation(Plans)` handle import — verified `frontend/views/admin/plans/catalog/PlanCatalogContainer.tsx:30`) SHALL hold; new label keys extend the existing namespace (types + en + ar + parity).

### 2.7 Testing Obligations

- **REQ-070 (Repository Tests)**: WHEN repositories ship THEN `backend/db/test/logic/billing/` suites (DEV1-005 home for billing DB tests; `backend/db/test/AGENTS.md` rules) SHALL reach 100% branch coverage under `runInRollback` with `tx` propagation everywhere (never `expect(...).rejects` inside rollback; try/catch helper), INCLUDING trigger tests proving: `pending→paid` allowed, `pending→failed` allowed, `paid→anything` blocked, amount tamper blocked, DELETE blocked.
- **REQ-071 (Service Tests)**: WHEN services ship THEN 4-tier suites SHALL run with the gateway adapter replaced by a programmatic fake (Tier 1 branch coverage; Tier 2 boundaries: zero-boundary amounts cannot occur but empty/oversized references and boundary interval days SHALL be probed; Tier 3 chaos: concurrent double-webhook via `Promise.allSettled` proving single credit, out-of-order failed→confirmed delivery; Tier 4 abuse: forged signature, tampered amounts, missing keys).
- **REQ-072 (Webhook Shell Tests)**: WHEN the route ships THEN the extracted pure verifier (`webhook-signature` helper) SHALL be unit-tested exhaustively (wrong secret, empty signature, digest-length mismatch, boundary-byte body), the route's disabled-404, bounded-body, and envelope behavior SHALL be covered by a route-level test module, and handler-level heavy logic SHALL remain covered at the service layer.
- **REQ-073 (Journey Tests)**: WHEN the workflow is implemented THEN `test/workflows/billing/subscription-purchase.journey.test.ts` SHALL exist TEST-FIRST-per-journey rules (`test/workflows/AGENTS.md`: committed fixtures + tracked cleanup, NO `runInRollback`, honest roles via the actor factories, spied fan-out transport), encoding every cross-actor step of §3 below including denial probes and the no-double-credit replay; run via `bun run test/scripts/run-test.ts test/workflows/billing/subscription-purchase.journey.test.ts`.
- **REQ-074 (GraphQL Contract Tests)**: WHEN resolvers ship THEN `backend/graphql/test/` suites (pattern after `plan-catalog.schema.test.ts` / `plan-catalog.roles.test.ts`) SHALL pin: scope matrix (anonymous 401, parent/teacher/admin 403, student 200), payload shape, missing idempotency-key 422, replay 409 `DUPLICATE_REQUEST`, and oracle-safety of foreign-key replay.
- **REQ-075 (Regression Pin)**: WHEN the plan form/namespace changes land THEN existing plan-catalog suites SHALL still pass unchanged (DEV1-005 shipped green tests must stay green).

### 2.8 Knowledge Propagation & Spec Hygiene

- **REQ-080 (Canonical Doc)**: WHEN the plan completes THEN `docs/billing/subscription-purchase.md` SHALL be created as the canonical reference (adapter port + mock provider, purchase flow, webhook security contract, guarded activation, idempotency, lane crediting, trigger amendment, consumer guidance for DEV1-007/008/009 + DEV2-005).
- **REQ-081 (Invariant & Decision Addenda)**: WHEN knowledge propagation runs THEN `docs/specs/state-machine-invariants.md` SHALL gain: INV-PAY2 addendum (guarded status transitions exception), new **INV-PAY6** (exactly one `pending→paid` activation ever; replays zero-row), **INV-PAY7** (amount/currency mismatch quarantines), §4.1 pending-semantics reconciliation (REQ-028), and `docs/specs/open-decisions-and-gaps.md` SHALL gain resolved addenda for: lane-encoding decision, `mock` gateway member, no-purchase-UI ruling.
- **REQ-082 (AGENTS/Doc Cross-Refs)**: WHEN propagation runs THEN `backend/AGENTS.md` / `backend/services/AGENTS.md` SHALL gain ≤2-line rule references to the new canonical doc; root `AGENTS.md` Important References SHALL gain one line.

## 3. Cross-Actor Workflow Scenarios (Journeys)

### Actor Table

| Actor | Role / identity | Can do | Cannot do |
|---|---|---|---|
| Student A | `UserRole.Student` with `students` row | purchase plan, view own subscriptions/payments | touch others' rows; purchase as anybody else |
| Payment Gateway (mock) | server-to-server emitter | post verified `confirmed`/`failed` events | read anything; act unverified |
| Parent / Teacher / Admin | non-student roles | — (nothing new in this ticket) | purchase (`FORBIDDEN`) |
| Student B | second student | own purchases only | observe or affect Student A's rows |

### Ordered Step List (Happy Path)

1. Student A → `purchaseSubscription({ planId })` + `X-Idempotency-Key` → pending subscription + pending payment + junction + checkout descriptor committed in one tx.
2. Student A → (same key retry, client-side retry simulation) → `DUPLICATE_REQUEST` 409, no new rows.
3. Gateway (Emitter) → verified `confirmed` event for the reference → in one tx: payment `paid`, subscription `active` + dates, lane credited by `sessionCount`, `payment_confirmation` notification persisted → receipt published post-commit.
4. Student A → `mySubscriptions` → sees the active subscription with dates; balance NOW includes the credited sessions.
5. Gateway (Emitter) → replays the SAME confirmation event → zero-row guard: no second credit, no second notification; ack `{ processed: true, replayed: true }`-shaped 200.
6. Gateway (Emitter) → `failed` event for a NEW purchase (fresh key) → payment `failed`, subscription stays `pending`, zero credit.

### Denial / Probe Steps

7. Parent → `purchaseSubscription` → 403 `FORBIDDEN` at scope; zero rows.
8. Student B → references of Student A → no read surface exists (BOLA dead by construction); foreign idempotency key reuse → oracle-safe `PAYMENT_NOT_FOUND`.
9. Unauthenticated → `purchaseSubscription` → 401 `UNAUTHORIZED`.
10. Gateway with WRONG signature → masked 401 envelope; zero rows; nothing logged beyond the attempt metadata.

### Cross-Actor EARS Criteria (observer-perspective)

- WHEN Student A purchases THEN the system SHALL commit the pending triple AND Student A's subsequent `mySubscriptions` SHALL show the pending subscription while Student B's SHALL remain untouched.
- WHEN the gateway confirms THEN the system SHALL activate the subscription AND the notification SHALL target ONLY Student A (asserted via the spied fan-out transport `publishedUserIds`).
- WHEN the gateway fails payment THEN Student A SHALL observe `pending` subscription + `failed` payment and NO balance change.
- IF a non-student role attempts purchase THEN the system SHALL reject at the scope gate with zero DB writes.

## 4. UX/Navigation Requirements

### New Routes & Role-Based Access

| Route | Purpose | Permission | Roles with access |
|---|---|---|---|
| `POST /api/payments/webhook` | gateway confirmation callback | **HMAC signature** (no session) | Payment Gateway (server-to-server) |
| `/[locale]/admin/plans` (EXISTING, extended) | plan form gains lane select | existing admin gate (unchanged) | SUPER_ADMIN / ACADEMY_ADMIN (unchanged) |

**No new page routes.** GraphQL operations: `purchaseSubscription` (Student role), `mySubscriptions` (Student role).

### Sidebar/Navigation Integration
UNCHANGED — no new nav items, no bottom-nav deltas (purchase UI explicitly ruled out, REQ-064).

### Role-Based Access Matrix

| Role | GraphQL ops | Webhook | UI delta |
|---|---|---|---|
| SUPER_ADMIN / ACADEMY_ADMIN | none new | — | lane select on plan form |
| TEACHER / SUPERVISOR / PARENT | DENIED purchase | — | none |
| STUDENT | `purchaseSubscription`, `mySubscriptions` | — | none this ticket |
| Payment gateway | — | verified POST | — |

## 5. Non-Functional Requirements

### Performance
- WHEN the webhook is hit THEN the handoff SHALL complete within a single short DB transaction (< 500ms p99 locally); no outbox polling, no N+1 reads (single-statement guarded writes only).
- WHEN the purchase mutation executes THEN the gateway adapter call SHALL happen outside the DB transaction (network never inside tx).

### Security
- WHEN a signature fails THEN the response SHALL be timing-indifferent (digest compare) and content-indifferent (masked envelope).
- WHEN config is missing (`PAYMENT_WEBHOOK_SECRET` unset while enabled) THEN the route SHALL fail closed (masked error), NEVER verify-bypass.

### Reliability
- WHEN a webhook handler throws after partial work THEN the transaction SHALL roll back ALL writes (all-or-nothing activation).
- WHEN the notification publish fails post-commit THEN the domain state SHALL remain committed (persist-first; publish failure is log-only — engine contract).

### Usability / Localization
- WHEN any client-visible message is produced THEN en + ar parity SHALL hold and RTL safety of new admin-form labels SHALL be respected.

## 6. Constraints & Assumptions

### Technical Constraints
- Provider-agnostic port mandated by `SPRINT_PLAN.md:161` (mock now, real gateway Sprint 2).
- `student_payments` trigger amendment must keep postgres + sqlite files in lockstep (local dev parity — `3-immutability-triggers-sqlite.sql` convention).
- Drizzle enum ALTER requires regeneration via `bun run db` (generate); `db reset`/`cleanGenerate` are repo-policy disabled.
- No new Pothos enum literal arrays; no Pothos-local type definitions.

### Business Constraints
- Purchase is student-self only in this ticket (parent-on-behalf purchasing is not sanctioned by any decision ref).
- Renewal = new subscription period (`TICKETS.md:483-484`); no pro-rating, no stacking rules in scope.
- Money values are decimal strings end-to-end; zero free plans (`price = 0`) remain purchasable (mock provider confirms neutrally — flagged for DEV1-009 review, not blocked here).

### Assumptions
- One gateway active at a time (`PAYMENT_GATEWAY_PROVIDER` single-valued).
- The mock gateway is acceptable in CI/dev test environments and never enabled in production config.
- `students.id ≡ users.id` shared-PK convention holds for all student actors (verified).

## 7. Success Criteria

### Definition of Done
- [ ] All REQ-0xx acceptance criteria met; `tasks.md` fully checked with evidence outcomes
- [ ] `bun quality-gate` green; zero new errors vs baseline (`outcome/0.1-outcome.md`)
- [ ] Journey + trigger tests green via `run-test.ts`; replay/no-double-credit proven
- [ ] `deferred-items.md` has zero ❌/⚠️ at Phase 7 gate
- [ ] Canonical doc + invariant addenda + AGENTS cross-refs landed (REQ-080..082)

### Acceptance Metrics
- Double-confirmation produces exactly ONE credit (observed via balance delta assertion).
- Forged webhook produces ZERO writes.
- Purchase replay (same key) produces exactly ONE pending pair.

## 8. Glossary

| Term | Definition |
|---|---|
| Lane | One of the segregated student balance columns (`balance_hifz` / `balance_tajweed` / `balance_reviews`) targeted by a plan's credit |
| Lane encoding | The new `plans.balance_lane` column: which lane a plan credits on activation |
| Gateway port | `PaymentGatewayPort` provider-agnostic interface (checkout creation + webhook parsing) |
| Guarded transition | Single-statement `UPDATE … WHERE <predicate> … RETURNING` whose zero-row case is the conflict/replay branch |
| Quarantine | Mismatch handling: no mutation + error log + 200 ack |
| Mock provider | Sprint-1 stand-in implementing the port with deterministic references (`mock_*`) and no network |
