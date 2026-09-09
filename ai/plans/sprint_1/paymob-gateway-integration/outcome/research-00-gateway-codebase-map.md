# Gateway Codebase Map — Research Digest

**Scope note:** `backend/lib/gateway/`, `backend/services/gateway/`, `backend/types/gateway/` are the **GraphQL API gateway** (route inventory, transport guard, health check) — NOT a payment gateway. `backend/lib/gateway/` contains `route-inventory.ts`, `public-operations.ts`, `transport-guard.ts`, `version.ts` + tests; `backend/services/gateway/` contains only `health-check.service.ts`; `backend/types/gateway/` only `gateway-context.types.ts` + `health-check.types.ts` (barrel). No payment code in any of them.

**Status verdict up front:** DEV1-006 (`ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/`) is **planned but essentially unimplemented**. `tasks.md` shows every implementation checkbox `[ ]`; `outcome/` contains only `plan-review-R1.md`. A grep across `backend/` for `PaymentGatewayPort|PaymentCheckoutInput|PaymentWebhookEvent|verifyWebhookSignature|getPaymentGateway|resetPaymentGateway|creditLaneBalance|findActiveById|markPaidOnce|SubscriptionPurchase|SubscriptionActivation` returns **zero hits**. No Paymob application code exists anywhere in the repo; only the vendor-docs skill bundle at `.agents/skills/paymob-payments/` (reference markdown, not code).

## (a) Gateway port interface

**NOT FOUND.** Planned shape exists only in the plan docs:

- Planned file: `backend/types/billing/payment-gateway.types.ts` (CREATE in task 3.1) with `PaymentGatewayPort`, `PaymentCheckoutInput`, `PaymentCheckoutSession`, `PaymentWebhookEvent` — plan §2.3: `PaymentWebhookEvent` is `{ reference, outcome: "confirmed"|"failed", amount: string, currency: string }` (money as string).
- Planned runtime: `backend/services/billing/payment-gateway/` with port methods `createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutSession>` and `parseWebhookEvent(rawBody: string): PaymentWebhookEvent` (plan.md:199-202).

## (b) Mock adapter registration / factory

**NOT FOUND.** Planned only: `payment-gateway.factory.ts` — `getPaymentGateway()` lazy singleton + `resetPaymentGateway()`; mock adapter emitting `mock_<uuid>` references, `checkoutUrl: null` (tasks.md task 5.1, plan.md:200-201). No mock adapter file, no factory, no `reset*` for payments exists today.

## (c) Checkout descriptor shape

No code. Contract in specs: REQ-017 (`specs.md:77`-area, line 76): descriptor is **`{ provider, providerReference, checkoutUrl (nullable) }`** produced by the active `PaymentGatewayPort`. GraphQL wire shape planned as `type PaymentCheckout { provider: PaymentGateway! providerReference: String! checkoutUrl: String }` (plan.md:105).

## (d) purchaseSubscription / purchase flow

**NOT FOUND.** No `purchaseSubscription` mutation, no `SubscriptionPurchaseService`, no subscription repo. Existing adjacent surface (all read-only catalog):
- `PlanCatalogService` — `backend/services/billing/plan-catalog.service.ts`: `coercePlanId(rawId, locale?)` (line 213, strict `Number()` coercion → `NotFoundError("PLAN", …)`), `createPlan` (229), `updatePlan` (264), `setPlanActiveStatus` (314, guarded), `listActiveCatalog` (358), `listForAdmin` (365), `findById` (376). 23505→`ConflictError`, 23514→`ValidationError` via `isPgErrorWithCode` cause-chain walker (line 33).
- `PlanRepository` — `backend/db/repo/billing/plan.repository.ts`: `insertPlan` (46), `updatePlanFields` (60), `setActiveStatusOnce` (86, guarded `WHERE is_active = !target`), `existsById` (109), `findById` (125 — **no active predicate; planned `findActiveById` is absent**), `listActive` (141), `listAll` (158). Pattern: raw-SQL via `queryDb` for non-tx reads, Drizzle select on tx; frozen `PLAN_READ_COLUMNS` projection string (line 34).
- Planned flow (tasks.md task 6.1, plan.md §4.1): checkout call **outside** tx → `withTransaction`: claim insert (23505 → same-caller `ConflictError("DUPLICATE_REQUEST", …)` / foreign-caller oracle-safe `NotFoundError("PAYMENT", …)`), `insertSubscription(pending, paymentReference = session.providerReference)`, `insertPayment(pending, amount/currency verbatim from plan)`, `student_subscriptions` junction, `updateClaimSubscriptionId`.

## (e) `student_payments` schema — verbatim

`backend/db/schema/billing/student-payments.ts:23-48`, columns (Drizzle → PG):

| TS field | Column | Type | Constraints |
|---|---|---|---|
| `id` | `id` | `integer` | PK `generatedAlwaysAsIdentity()` |
| `studentId` | `student_id` | `integer` | notNull, FK → `students.id`, `onDelete: "restrict"` |
| `subscriptionId` | `subscription_id` | `integer` | nullable, FK → `subscriptions.id`, `onDelete: "set null"` |
| `amount` | `amount` | `decimal(10,2)` | notNull; CHECK `student_payments_amount_check` `amount >= 0` |
| `currency` | `currency` | `char(3)` | notNull, default `"EGP"` |
| `paymentGateway` | `payment_gateway` | `payment_gateway` pgEnum | notNull |
| `status` | `status` | `payment_status` pgEnum | notNull, default `"pending"` |
| `createdAt` | `created_at` | `timestamp` | notNull, `defaultNow()` |
| `updatedAt` | `updated_at` | `timestamp` | notNull, `defaultNow()`, `$onUpdate(new Date())` |

Indexes: `student_payments_student_id_idx`, `student_payments_subscription_id_idx` (lines 45-46). **Type gap for a Paymob adapter:** no gateway-order-id / provider-transaction-id column on `student_payments` or beyond `subscriptions.paymentReference varchar(255)` (`subscriptions.ts:33`).

**Critical:** `student_payments` is fully immutable today — trigger `prevent_student_payments_update` raises `'student_payments is immutable — UPDATE is not permitted'` on ANY update (`backend/db/migration/3-immutability-triggers.sql:59-77` + `-sqlite.sql` pair). DEV1-006 plans to amend it (NEW `backend/db/migration/4-student-payments-status-transition.sql` + SQLite pair) to permit ONLY `pending → paid|failed` with financial columns frozen — that migration does NOT exist yet (`backend/db/migration/` currently has only `1-extensions.sql`, `2-functions.sql`, `3-immutability-triggers{,-sqlite}.sql`, `rollback-down.sql`).

## (f) Callback / webhook consumer

**NOT FOUND.** `app/api/payments/` does not exist. `ROUTE_INVENTORY` (`backend/lib/gateway/route-inventory.ts:47-52`) contains exactly three routes (`/api/graphql` gateway, `/api/set-locale` envelope, `/api/health` envelope); the classification `"provider-ack-exempt"` already exists in the closed `RouteClassification` union (line 33) but no route uses it. Security precedent for a webhook: `bearerSecretMatches` at `app/api/cron/sweep-sessions/route.ts:66-73` (hex-agnostic digest compare — `createHash("sha256").update(...)` both sides then `timingSafeEqual`), envelope helpers `apiSuccessResponse`/`apiErrorResponse`/`resolveRequestId` from `@/backend/lib/api` (barrel `backend/lib/api/index.ts` → `./api-response`).

## (g) Env-config mechanism

- **The file:** `backend/lib/env.ts`. Add a key by: (1) adding a field to `interface EnvironmentConfig` (line 196), (2) parsing it in `readEnvironment()` (line 233, using helpers `trimmedEnvValue`/`parsePortEnv`/etc. or inline), (3) exposing a typed getter (pattern: lines 322-384) that reads through `getEnvironmentConfig()` (cached, line 265; invalidated by `resetEnvironmentCache()`, line 279). Escape hatches: `getEnv(key)` (286), `optionalEnv(key, default)` (293), `requireEnv(key)` (303, throws).
- **`resolveEnvConfig` does NOT exist in the codebase** — grep hits only spec-process templates and the DEV1-006 plan docs themselves. Likewise `resetWhatsappChannel` (cited by the DEV1-006 specs as parity) — **NOT FOUND** (WhatsApp integration is a pending ticket).
- **`PAYMENT_GATEWAY_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_ENABLED` are NOT registered anywhere** (`backend/lib/env.ts` covers DATABASE_URL/DB_*/CACHE_PROVIDER/JWT_*/WS_*/REDIS_URL/NOTIFICATION_FANOUT_TRANSPORT only).

## (h) Payment gateway enum members

TS mirror `backend/enum/billing/payment-gateway.enum.ts:7-15` and pgEnum `backend/db/schema/enums.ts:35-44` (order is contractual):

`Stripe="stripe"`, `Paypal="paypal"`, **`Paymob="paymob"`**, `Fawry="fawry"`, `OfflineCash="offline_cash"`, `BankTransfer="bank_transfer"`, `Scholarship="scholarship"`, `Other="other"`.

`PaymentStatus` (`backend/enum/billing/payment-status.enum.ts:5-10` / enums.ts:29): `Pending="pending"`, `Paid="paid"`, `Failed="failed"`, `Refunded="refunded"`. **No `"mock"` member anywhere** (planned D5 not implemented). `backend/graphql/pothos/shared/enum.pothos.ts` has **no** `PaymentGatewayPothosEnum`/`PaymentStatusPothosEnum`/`SubscriptionStatusPothosEnum` registered (plan line 141 confirms "verified absent today").

## (i) Consumers of payment outcomes

- **Platform analytics (read-only, the only revenue consumer):** `backend/db/repo/admin/platform-analytics-query-helpers.ts` — `getRevenueStatsImpl` (line 370, sums `student_payments` where `status = PaymentStatus.Paid` grouped by currency), `getRevenueDailyTrendImpl` (416), `countOfflineActivationsImpl` (467, counts `subscriptions.payment_method IN (offline_cash, bank_transfer, scholarship)` via frozen `OFFLINE_ACTIVATION_GATEWAYS` at line 112).
- **Broadcast audience repo** joins `subscriptions` (`backend/db/repo/notifications/broadcast-audience.repository.ts:53`).
- **No subscription-activation or balance-crediting consumer exists.** The crediting machinery that DOES exist: `StudentRepository.decrementLaneIfAvailable` / `incrementLane` (`backend/db/repo/students/student.repository.ts:373,402`) keyed on frozen `LANE_BALANCE_COLUMNS` (line 57) over `HeldBalanceLane` (`backend/enum/scheduling/held-balance-lane.enum.ts:17` — members `Trial/Hifz/Tajweed`; **reviews deliberately excluded** from hold vocabulary). Students' balances live in `backend/db/schema/students/students.ts:24-28` (`balanceHifz`, `balanceReviews`, `balanceTajweed` nullable default 0; `balanceTrial` notNull default 0; all CHECK ≥ 0). Planned `creditLaneBalance` + `CREDIT_LANE_BALANCE_COLUMNS` map (all three paid lanes incl. reviews) — **NOT implemented**.
- **Notifications:** `NotificationType.PaymentConfirmation = "payment_confirmation"` exists (`backend/enum/notifications/notification-type.enum.ts:11`); `NotificationEngine.emitForUser(input, locale, tx?)` (persist-first in-tx, receipt out) and `publishReceipts(receipts, locale)` (post-commit) at `backend/services/notifications/notification-engine.service.ts:42,116`.
- Freestanding idempotency precedent to mirror: `session_request_idempotency` table (`backend/db/schema/classes/session-request-idempotency.ts:24-39` — `idempotencyKey varchar(128) UNIQUE`, `userId` cascade, nullable FK set-null) + `SessionRequestIdempotencyRepository.insertClaim/findByKey/updateClaimSessionId` (`backend/db/repo/classes/session-request-idempotency.repository.ts`, insertClaim deliberately lets 23505 escape).

## (j) Gaps a Paymob plan/adapter must fill (cross-file blockers)

1. **The entire port is unimplemented** — DEV1-006 must land first (or this plan must subsume it): port types, factory, purchase service, activation service, webhook route `app/api/payments/webhook/route.ts`, trigger amendment (`4-student-payments-status-transition.sql` + sqlite), `subscription_purchase_idempotency` table, `plans.balanceLane` + `subscription_credit_lane` pgEnum, repos (`SubscriptionRepository`, `StudentPaymentRepository`, `SubscriptionPurchaseIdempotencyRepository`), GraphQL surface (`purchaseSubscription`, `mySubscriptions`).
2. **Env pattern mismatch to resolve:** DEV1-006's spec references a non-existent `resolveEnvConfig`; a Paymob plan must register keys via the actual `backend/lib/env.ts` mechanism described in (g). Paymob would add e.g. `PAYMOB_*` keys; also per plan, real adapters mean `checkoutUrl` becomes non-null and webhook verification is Paymob-shaped (HMAC key order per Paymob docs, not the mock's header — HMAC approach per `.agents/skills/paymob-payments/references/docs/webhook-callbacks-and-hmac/`).
3. **Doc gap:** `docs/billing/quota-system.md` referenced by root AGENTS.md and your brief is **NOT FOUND** — `docs/billing/` contains only `plan-catalog.md`. Quota/lane semantics live in `docs/specs/state-machine-invariants.md` (INV-PAY1..PAY5 at lines 243-247; INV-W6 :165) and `docs/sessions/session-lifecycle.md`.
4. **Enum registration for GraphQL** of the four billing enums is absent (plan line 141).
5. **Paymob vendor material** is already vendored at `.agents/skills/paymob-payments/` (Intention API, checkout experiences, webhook/HMAC, refunds/Void/Capture reference docs) — usable by the plan author without network.

**Verification basis:** all findings via direct file reads and repo-wide greps on this working tree as of 2026-09-07; no files were modified.
