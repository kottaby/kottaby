# Research 02 — Subscription / Expiry Domain Ground Truth

Verified against live code on 2026-09-11. Every citation was grep/read in this session.

## 1. Drizzle schema

### `subscriptions` — `backend/db/schema/billing/subscriptions.ts:28-57`

| Column | Drizzle / SQL type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `integer` identity PK (`subscriptions.ts:31`) | no | identity | |
| `user_id` | `integer` FK → `users.id`, `onDelete: restrict` (`:32-34`) | no | — | generic purchaser (parent/teacher/student) |
| `plan_id` | `integer` FK → `plans.id`, `onDelete: restrict` (`:35-37`) | no | — | |
| `status` | pgEnum `subscription_status` (`:38`) | no | `'pending'` | |
| `start_date` | `timestamp` (`:39`) | **YES (nullable)** | — | stamped on activation |
| `end_date` | `timestamp` (`:40`) | **YES (nullable)** | — | stamped on activation |
| `payment_method` | pgEnum `payment_gateway` (`:41`) | yes | — | |
| `payment_reference` | `varchar(255)` (`:42`) | yes | — | partial unique index `subscriptions_payment_reference_unique … WHERE payment_reference IS NOT NULL` (`:53-55`) |
| `payment_verified_at` | `timestamp` (`:43`) | yes | — | |
| `created_at` / `updated_at` | `timestamp` (`:44-48`) | no | `now()`; updated_at re-stamps via `$onUpdate` | |
| Indexes | `subscriptions_user_id_idx`, `subscriptions_plan_id_idx` (`:51-52`) | | | **no index on `end_date` or `status`** — expiry sweep would seq-scan |

**KEY FACT:** `interval_days` is NOT a column on `subscriptions` — it lives on `plans`.

### `plans` — `backend/db/schema/billing/plans.ts:20-43`

| Column | Type | Nullable | Default / constraint |
|---|---|---|---|
| `id` | integer identity PK (:23) | no | |
| `title` | varchar(255) (:24) | no | |
| `session_count` | integer (:25) | no | CHECK `> 0` (:39) |
| `price` | decimal(10,2) (:26) | no | CHECK `>= 0` (:40) |
| `currency` | char(3) (:27) | no | default `'EGP'` |
| **`interval_days`** | integer (:28) | no | CHECK `> 0` (:41) |
| `balance_lane` | pgEnum `subscription_credit_lane` (:29) | **YES (nullable)** | NULL = unconfigured, purchases fail closed |
| `is_active` | boolean (:30) | no | default true |
| `deactivated_at` / `created_at` / `updated_at` | timestamps (:31-36) | mixed | |

### `students` balance columns — `backend/db/schema/students/students.ts:18-47`

| Column | Line | Nullable | Default | CHECK |
|---|---|---|---|---|
| `balance_hifz` integer | :24 | yes | 0 | `students_balance_hifz_check >= 0` (:42) |
| `balance_reviews` integer | :25 | yes | 0 | :43 |
| `balance_tajweed` integer | :26 | yes | 0 | :44 |
| `balance_trial` integer | :27 | no | 0 | :45 |
| `trial_granted_at` timestamp | :28 | yes | — | |

**KEY FACT:** Balances are **flat per-student lane counters**. There is **NO per-subscription / per-period balance attribution** anywhere in the schema — a student covered by two subscriptions accumulates into the same lane cell with no provenance linkage to which subscription's period funded which unit.

### `student_subscriptions` junction — `backend/db/schema/billing/student-subscriptions.ts:20-35`

| Column | Type | Notes |
|---|---|---|
| `student_id` | integer FK → `students.id`, `onDelete: cascade` (:23-25) | part of composite PK |
| `subscription_id` | integer FK → `subscriptions.id`, `onDelete: cascade` (:26-28) | part of composite PK; indexed (`student_subscriptions_subscription_id_idx` :33) |
| `enrolled_at` | timestamp, default now() (:29) | |

Composite PK `(student_id, subscription_id)` (:32) — **no `id` column** (Apollo cache-relevant). No balance-allocation columns.

### `audit_logs` — `backend/db/schema/audit/audit-logs.ts:30-47`

`id` identity PK; `actor_id` integer NOT NULL FK→users (restrict); `action_type` pgEnum `audit_action_type` NOT NULL; `entity_type` varchar(100) NOT NULL; `entity_id` integer nullable; `details` varchar(2000) (JSON-encoded); `created_at` timestamp default now(). **Append-only**, UPDATE/DELETE blocked by trigger (docblock :17-21). Suitable for recording expiry sweeps; note there is no SYSTEM actor precedent in this file — `actor_id` is NOT NULL, so an autonomous cron sweep would need an actor convention.

## 2. Enums — status enum exists, DB + TS aligned

- DB: `subscriptionStatus = pgEnum("subscription_status", ["active","pending","expired","cancelled","suspended"])` — `backend/db/schema/enums.ts:47-53`.
- TS: `export enum SubscriptionStatus { Active="active", Pending="pending", Expired="expired", Cancelled="cancelled", Suspended="suspended" }` — `backend/enum/billing/subscription-status.enum.ts:6-12`. Docblock states it mirrors the pgEnum: aligned 1:1.
- Docs A.9 reconciliation: `docs/specs/state-machine-invariants.md:124-135` defines "Active = within validity window (`start_date <= now < end_date`)", "Expired = past window", "Pending = not yet active"; cancelled via `subscriptions.status = 'cancelled'` (A.9 RESOLVED). INV-B3 (expiry, trial-lane exclusion) at `:147`; INV-B6 (admin end-date extension) at `:150` — sibling ticket's scope.
- Current writers of non-pending statuses: **only `activatePendingOnce` writes `active`** (`backend/db/repo/billing/subscription.repository.ts:131-149`). NO code anywhere writes `expired`/`cancelled`/`suspended` as a state transition — verified: `SubscriptionStatus.Expired/Cancelled/Suspended` only appear as constants for row-projection re-typing in `subscription-purchase.service.ts:133-151`, in analytics count queries (`backend/db/repo/admin/platform-analytics.repository.ts:251-289`) and test fixtures (`backend/db/test/entity-setup.ts:215`). **The expired-transition writer does not exist yet.** The activation service's replay comment at `subscription-activation.service.ts:354-359` even flags: "When a non-activation status writer (suspension/cancellation/expiry) lands, revisit this branch to distinguish replay from terminal-state suppression."

## 3. Types — `backend/types/billing/`

Barcode of `backend/types/billing/`: `plan.types.ts`, `student-payment.types.ts`, `subscription-purchase-idempotency.types.ts`, `subscription.types.ts`, `teacher-transaction.types.ts`, `wallet.types.ts`, `payment-gateway.types.ts`.

`subscription.types.ts` (55 lines) exports:
- `SubscriptionSelectType = typeof subscriptions.$inferSelect` (:7)
- `SubscriptionInsertType = typeof subscriptions.$inferInsert` (:8)
- `SubscriptionReturnType = Omit<SubscriptionSelectType,"status"|"paymentMethod"> & { status: SubscriptionStatus; paymentMethod: PaymentGateway | null }` (:22-25)
- `PurchaseSubscriptionSubmitInput { readonly planId: number }` (:41-43)
- `PurchaseSubscriptionReturnType { subscription; payment; checkout }` (:51-55)

**No expiry-related types exist** (no `ExpireSubscriptionsResult`, no sweep input type). All new types must live here, never in service `.types.ts` files (rooms have a hard prohibition).

## 4. Services + Repositories

### Activation (already sets the validity window — AC1 is partially DONE)

`backend/services/billing/subscription-activation.service.ts` — `SubscriptionActivationService.processWebhookEvent(event, locale, outerTx?)` (:486-533) handles the webhook.

The activation write is `confirmPayment` → `SubscriptionRepository.activatePendingOnce` at **`:360-372`**:

```ts
const now = new Date();
const activated = await SubscriptionRepository.activatePendingOnce(
  subscription.id,
  { startDate: now, endDate: new Date(now.getTime() + plan.intervalDays * MS_PER_DAY), paymentVerifiedAt: now },
  tx);
```

So **AC1 (end_date = start_date + interval_days) is already implemented** and unit-tested in `backend/services/billing/subscription-activation.service.test.ts`. `MS_PER_DAY = 86_400_000` const at `:96`. Guard rails: `MAX_INTERVAL_DAYS` / `MAX_SESSION_COUNT` ceiling checks in `readActivationPlan` (`:143-194`, constants in `backend/services/billing/plan-catalog.helpers.ts`).

### `SubscriptionRepository` — `backend/db/repo/billing/subscription.repository.ts`

| Method | Line | Signature |
|---|---|---|
| `insertSubscription` | :61 | `(insert: SubscriptionInsertType, tx?: DBTransaction) → Promise<SubscriptionSelectType>` |
| `findById` | :78 | `(id: number, tx?: DBQueryExecutor) → Promise<SubscriptionSelectType \| null>` |
| `findByPaymentReference` | :100 | `(reference: string, tx?: DBQueryExecutor) → Promise<... \| null>` |
| `activatePendingOnce` | :131 | `(id, patch: { startDate: Date; endDate: Date; paymentVerifiedAt: Date }, tx?) → Promise<SubscriptionSelectType \| null>` — guarded `WHERE id AND status='pending'` UPDATE |
| `listByUserId` | :161 | `(userId, tx?) → Promise<SubscriptionSelectType[]>` (created_at DESC) |

**NO expiry/batch-sweep method exists** — no `findExpiredActive`, no `expireMany`. Raw-read pattern (Neon HTTP via `queryDb`, tx via Drizzle executor, `isDBTransaction` guard :33-35) is the house style to follow; `SUBSCRIPTION_READ_COLUMNS` aliased projection at :38-44.

### Purchase — `backend/services/billing/subscription-purchase.service.ts`

`SubscriptionPurchaseService.purchase(...)` (:529) and `listOwn(userId, locale)` (:608). Status re-mapping helpers at :133-151 (`STATUS_EXPIRED` etc., string-widening for the stored pg-enum union).

### Balance crediting (the Blocked-By ticket — SHIPPED)

Fully implemented:
- `StudentRepository.creditLaneBalance(studentId, lane, amount, tx?)` — `backend/db/repo/students/student.repository.ts:531-537`, impl in `student.repository.credit-lane.helpers.ts:108`. Called from activation at `subscription-activation.service.ts:393-400` (full `sessionCount`, relative increment).
- `StudentRepository.decrementLaneIfAvailable(studentId, lane, tx?)` — `backend/db/repo/students/student.repository.ts:478`; `incrementLane` at :507; plan doc: `ai/plans/sprint_1/Segregated Session Balance-crediting/`.

## 5. Session-request eligibility choke point

Booking flow: GraphQL mutation → `SessionLifecycleService.createSession(studentId, input, idempotencyKey, locale, outerTx?)` — `backend/services/classes/session-lifecycle.service.ts:196-215`. Order inside:

1. `assertBookingBoundary(...)` (`session-lifecycle.booking.ts:69-87`) — shape-only `ValidationError` checks.
2. `assertActorGovernanceClean(studentId, t, outerTx)` (`session-lifecycle.service.ts:209`).
3. `withTransaction(... bookSessionInTx ...)` (`session-lifecycle.service.ts:214`) → `backend/services/classes/session-lifecycle.booking.ts:192`.

`bookSessionInTx` internals: certification lock + debit ladder `debitBookingLadder` (`:95-116`): trial lane first (`:101`), intent lane second (`:106`); both miss ⇒ `logger.logDomainError` + `throw new ValidationError("INSUFFICIENT_BALANCE", t.insufficientBalance)` (`:108-114`), then idempotency claim + insert (`:132-146`).

**Verified negative: the booking path NEVER reads `subscriptions` or any expiry state.** The trial-first ladder of INV-B3's exclusion means a 422 "Subscription expired" check must be INSERTED — natural slot: before/inside the debit ladder (subscription eligibility gate prior to `decrementLaneIfAvailable`), with locale `t` already in scope. Note interplay: trial-lane units must remain spendable even with an expired subscription (INV-B3).

## 6. Error classes & 422 mechanics

`backend/lib/errors.ts`:
- `DomainError extends GraphQLError` — `constructor(code: string, message: string, options?)`, sets `extensions.code` (:19-25).
- `NotFoundError(entity, message, options?)`, code `<ENTITY>_NOT_FOUND` (:37-43).
- `ValidationError` (:65-127): overloaded — `(message)` ⇒ code `"VALIDATION"`; `(code, message, options?)` ⇒ custom code. THIS is the 422 family.
- `ConflictError` (:171-183): `(message)` ⇒ `"CONFLICT"`; `(code, message, options?)` custom.
- `UnauthorizedError`/:44, `ForbiddenError`/:51, `RateLimitExceededError`/:186.
- PG unique-violation helpers: `hasPgCode` (:216), unique-violation detector (:248+).

**422 mechanics:** `VALIDATION → 422` in `backend/lib/errors/error-code-taxonomy.ts:47` (`ERROR_CODE_HTTP_STATUS`, sole source of truth). That status literal applies to **REST envelopes only**; over GraphQL the transport is HTTP 200 + `errors[].extensions.code` (see `docs/graphql/error-handling-contract.md` and the precedent set by sprint_3 plan: `ai/plans/sprint_3/student-evaluation-submission-teacher-rating/specs.md:169-174` — "no HTTP-422 exists on the GraphQL error path"). Ticket AC3's "422" should therefore be modeled as a typed `ValidationError("SUBSCRIPTION_EXPIRED", t.<key>)` (or similar custom code) — matching the `INSUFFICIENT_BALANCE` precedent at `session-lifecycle.booking.ts:113`.

**Verified negative:** no `subscriptionExpired` translation key exists. `shared/locale/types/errors/labels.ts` has `insufficientBalance` (:174), `tokenExpired` (:64), `parentLinkRequestExpired` (:148), and a `subscriptionPurchase` sub-namespace (:29,69) — a new key (en + ar + type) must be added. Only `subscriptionsExpiredLabel` exists, in the **analytics** namespace (`shared/locale/en/analytics/index.ts:47`) — not an error message.

## 7. GraphQL surface

- Object type: `SubscriptionPothosObject` (`StudentSubscription`) — `backend/graphql/pothos/billing/subscription.pothos.ts:40-86`; `startDate`/`endDate` exposed nullable ISO (`:59,:64`).
- Query: `mySubscriptions` — `backend/graphql/query/subscription.query.ts:42-64`, `authScopes { $all: { authenticated: true, role: [UserRole.Student] } }`, zero args, owner-scoped via `ctx.user`, calls `SubscriptionPurchaseService.listOwn(ctx.user.id, ctx.locale)`.
- Mutation: `purchaseSubscription` — `backend/graphql/mutation/subscription-purchase.mutation.ts:51-86`, same authScopes shape; resolver unwraps `ctx.user` → `UnauthorizedError` (:68-69), delegates locale via `ctx.locale`.
- Error pattern: services throw `DomainError` with localized message (`t.<key>` from `getServerTranslations(locale).errorsTranslations`); resolvers stay thin (`ctx.locale` propagation). No `ctx.t(...)` literal — services build `t` themselves.
- Billing pothos siblings: `plan.pothos.ts`, `wallet.pothos.ts`, `student-payment.pothos.ts`, `purchase-checkout.pothos.ts` (payload wrappers).

## 8. Expiry-job infrastructure (the cron template)

**Externally-triggered cron DOES exist as a pattern:** `app/api/cron/sweep-sessions/route.ts` (GET-only, `Authorization: Bearer ${CRON_SECRET}` with `timingSafeEqual` over SHA-256 digests, mode gates `CRON_EXECUTION_MODE=external` + `CRON_EXTERNAL_ENABLED=true` ⇒ bare 404 when off, envelope via `apiSuccessResponse`/`apiErrorResponse`). Registered in `backend/lib/gateway/route-inventory.ts:61` (`{ path: "/api/cron/sweep-sessions", classification: "envelope" }`). Documented cron rules R1-R11 referenced at `backend/services/fx/README.md`.

Business engine: `SessionLifecycleService.sweepExpiredSessions(outerTx?)` — `backend/services/classes/session-lifecycle.service.ts:776-808`: one `withTransaction`, guarded batch updates (`SessionRepository.sweepExpiredScheduledOnce/sweepExpiredCompletedOnce`), per-row refunds, notifications persisted in-tx + `NotificationEngine.publishReceipts` strictly post-commit; returns honest counts `{ cancelled, refunded }`. **This is the exact architectural template the subscription expiry job should mirror** (a new `app/api/cron/expire-subscriptions/route.ts`-style envelope + a service sweep + repo batch methods, all of which are missing today).

**Verified negatives:** no cron entry for subscription expiry; `app/api/cron/` contains only `sweep-sessions/`; no node-cron/pg_cron usage (grep hits are WS ping timers and comments about "future cron-stream job" in `backend/services/parents/parent-link-request.service.ts:31,403,436,440`).

## 9. Biggest design unknowns / open decisions

1. **AC2's "zeroes any remaining session balance for that subscription period" is unimplementable as literally written.** Balances are flat per-student lane counters (`students.balance_hifz/tajweed/reviews`) fed by relative increments (`creditLaneBalance`, `+sessionCount`) from **every** subscription covering that student; neither `subscriptions`, `student_subscriptions`, nor `students` carries per-subscription period attribution. Zeroing "that period's" remainder cannot identify which units belong to the expiring subscription vs an overlapping active subscription or an earlier credit. The plan MUST resolve this: either (a) add a per-period ledger/allocation table (new schema + migration + subtraction accounting), or (b) ratify a weaker semantic (e.g. zero the credited lane only when no other active subscription covers the same lane, or no-op when lane shared). INV-B3 (`docs/specs/state-machine-invariants.md:147`) demands zeroing; the blocked-by ticket (Segregated Session Balance) already shipped the flat-lane model and its plan (`ai/plans/sprint_1/Segregated Session Balance-crediting/`) recorded trial-first + credit-only divergences — this ticket inherits that tension.
2. **Eligibility check semantics (AC4):** today booking never consults subscriptions ("balance is the only gate"). Adding a "subscription expired → 422" check conflicts with INV-B3's trial-lane exemption: a student with only `balance_trial > 0` and an expired subscription must still be able to book (trial is not subscription-bound). The gate needs lane-aware scoping: block when the funding lane is a subscription lane AND no in-window subscription covers that student-lane pair.
3. **Timing window vs status:** `state-machine-invariants.md:129-132` defines Active/Expired via the date window, meaning a subscription can be `status='active'` with `end_date` already past until the sweep runs — decides whether eligibility reads the date window (liveness) or only the status column (stale between sweeps), and whether sweep cadence affects correctness.
4. **Expiry job triggering:** the only sanctioned pattern is an external-scheduler envelope (`/api/cron/sweep-sessions`); there is no in-process scheduler, no Vercel config file observed (check `vercel.json` if deployment wiring is in scope), and route registration in `backend/lib/gateway/route-inventory.ts` + its static-assertions test must be extended.
5. **`audit_logs.actor_id` NOT NULL** means an autonomous sweep needs a system-actor convention or the audit write must be deferred (admin-extension writes audit rows in the SIBLING ticket).
6. DB migration needed at minimum: index on `subscriptions.status, end_date` for sweep efficiency (neither index exists today — `subscription.repository.ts` covers `user_id`, `plan_id`, partial `payment_reference` only).

## 10. Quick AC mapping (verified)

| AC | Status today |
|---|---|
| AC1 end_date = start + interval_days | **DONE** — set in `activatePendingOnce` call (`subscription-activation.service.ts:360-372`) |
| AC2 expiry job sets status=expired + zeroes balance | **MISSING** — no sweep, no repo methods, attribution problem (§9.1) |
| AC3 expired ⇒ 422 at session request | **MISSING** — no subscription check in booking path; insert at `session-lifecycle.booking.ts` booking ladder / `bookSessionInTx` (:192); `ValidationError("SUBSCRIPTION_EXPIRED", …)` pattern exists; locale key does not |
| AC4 within window ⇒ balance reflects remaining | Partially — lane balances are queryable (`mySubscriptions` + student balances); "current period" attribution does not exist |
