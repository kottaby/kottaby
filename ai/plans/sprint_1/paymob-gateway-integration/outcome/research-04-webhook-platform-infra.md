# Research Digest — Paymob Webhook & Platform Infra

## 1. Is a new `app/api/paymob/webhook/route.ts` sanctioned?

**YES.** The classification slot for it already exists: `"provider-ack-exempt"` is a live member of `RouteClassification` at `backend/lib/gateway/route-inventory.ts:33`, with docblock intent: *"`provider-ack-exempt` → future webhook acks (reply-with-provider-contract, correlated logs); registered when such a route lands"* (`route-inventory.ts:18-19`). `docs/graphql/api-gateway-and-routing.md:152` (Rule 9) states: *"provider webhooks land later under the `provider-ack-exempt` classification"*, and `docs/graphql/error-handling-contract.md:100` holds the exemptions-inventory row: *"Future provider webhooks (e.g. WhatsApp `GET verification` / POST ack) — Reply-200-with-provider-contract bodies exempt from the envelope shape while still emitting correlated logs; registering the ack contract becomes an explicit exemption row when the route lands"* — with *"New exemptions must be registered here before shipping"* (`:102`).

### Exact registration/compliance steps

| Step | Requirement | Source |
|---|---|---|
| 1 | Create `app/api/paymob/webhook/route.ts`; append `{ path: "/api/paymob/webhook", classification: "provider-ack-exempt" }` to `ROUTE_INVENTORY` (`backend/lib/gateway/route-inventory.ts:47`) **in the same change set** — static assertion **A4** (`backend/lib/gateway/static-assertions.test.ts:238`) walks disk↔registry bidirectionally and fails CI otherwise | `route-inventory.ts:5-29`, `api-gateway-and-routing.md:93`, `app/AGENTS.md:65` |
| 2 | Register the ack-contract **exemption row** in `docs/graphql/error-handling-contract.md` §Exemptions inventory (`:94-102`) | `error-handling-contract.md:102` |
| 3 | Request correlation: single `resolveRequestId(request.headers)` call from `@/backend/lib/api` (`backend/lib/api/api-response.ts:135`); inbound `X-Request-Id` honored only if ≤128 chars, comma-free, control-char-free, else fresh UUIDv4 | `api-response.ts:57-149` |
| 4 | **Rate limit: NO production limiter exists.** `backend/lib/ratelimit.ts` is a fail-open stub (`checkRateLimit` always returns `success: true`, `:83-91`); only the GraphQL route uses `withRateLimit` (`app/api/graphql/rate-limit.ts`). The cron precedent adds no rate limiter. The only real token-bucket in-repo is the WS sidecar handshake throttle (per-IP, capacity 5 / 1 per 2s — `docs/notifications/realtime-engine.md:121`), not reusable as an HTTP helper | — |
| 5 | **Body cap: `MAX_GRAPHQL_BODY_BYTES = 2_000_000` exists exactly once at `backend/lib/gateway/transport-guard.ts:54` and is gateway-owned.** "Reading the body, parsing JSON, or measuring sizes anywhere OTHER than `guardTransport`" is prohibited **for `/api/graphql`** (`api-gateway-and-routing.md:173`). No shared non-GraphQL body-cap helper exists — a webhook route must define its own bounded drain (Paymob HMAC verification needs the raw body anyway, which excludes all JSON-envelope helpers) | — |
| 6 | **Public-route allowlist analog: N/A.** `PUBLIC_OPERATION_NAMES` / `isPublicOperation` (`backend/lib/gateway/public-operations.ts:37`) governs **GraphQL operations only** (default-deny, `api-gateway-and-routing.md:97-110`); REST routes carry their own auth mechanism. Precedent auth for external callers: timing-safe bearer compare with SHA-256-digested `timingSafeEqual` in `bearerSecretMatches` (`app/api/cron/sweep-sessions/route.ts:66-73`). Paymob's equivalent is HMAC signature verification over the callback body | — |
| 7 | NEVER a third health probe; never let the webhook become a health surface (`api-gateway-and-routing.md:112-119`) | — |

**Precedent non-GraphQL route (strongest template):** `app/api/cron/sweep-sessions/route.ts` — GET-only, mode-gate bare **404** (`ENDPOINT_GONE_STATUS = 404`, `:53`; disabled surface leaks no envelope), timing-safe `CRON_SECRET` check via `getEnv("CRON_SECRET")` (`:84-94`), success via `apiSuccessResponse` / failure masked via `apiErrorResponse(..., { requestId, locale: "en" })` (`:100-104`). Its test: `app/api/cron/sweep-sessions/test/sweep-sessions-route.test.ts`.

**⚠ Tree inconsistency for the plan author:** `app/api/cron/sweep-sessions/route.ts` is committed (last touched by `b01d21db`) but **NOT present** in `ROUTE_INVENTORY` (still lists exactly 3 routes, `route-inventory.ts:47-52` / docblock `route-inventory.ts:23-29` calls `/api/cron/*` a "phantom"). Either the static assertion's disk walk doesn't cover nested paths or another agent has an in-flight inventory update. Verify before planning.

**Other routes on disk:** `app/api/graphql/route.ts` (gateway; seven-step pipeline, thin composition over colocated `apollo-server.ts`, `rate-limit.ts`, `space-z-cors.ts`, `transport-rejection.ts` — `route.ts:1-19`), `app/api/health/route.ts` (GET-only probe), `app/api/set-locale/route.ts` (envelope + GET-redirect exemption).

## 2. Idempotency / dedup machinery available for webhooks

- **`special_reference`: NOT FOUND** anywhere in `backend/`, `shared/`, `app/`, `frontend/`, `docs/` (exact grep, zero hits). The plan must mint its own natural key (e.g. Paymob transaction id).
- **Canonical durable claim-table pattern** (recommended template): `backend/db/schema/classes/session-request-idempotency.ts` — table `session_request_idempotency`, unique constraint `session_request_idempotency_key_unique` on `idempotency_key varchar(128)`, insert **in-phase with the domain insert inside one transaction**; PG 23505 unique violation → `ConflictError("DUPLICATE_REQUEST", …)` (example at `backend/lib/errors.ts:168`); `DUPLICATE_REQUEST` is a taxonomy alias code (`backend/types/errors/api-error.types.ts:43`). Claim rows outlive their entity (`session_id` set-null) so replays still answer duplicate-conflict.
- **`docs/IDEMPOTENCY.md`**: fail-closed posture for booking/billing-class mutations — first request records, same key within 24 h → `409 DUPLICATE_REQUEST`, expired after 24 h, 5xx releases the key. Mandated at DB level for Students/Invoices/ClassInstances/**Payments** (`:33-39`).
- **Fail-open deviation (notifications only, already adjudicated):** Redis `SET NX EX` claim `notif:emit:<sha256(...)>` with `NOTIFICATION_EMIT_CLAIM_TTL_SECONDS = 86_400` (`docs/notifications/realtime-engine.md:147-151`, §3.6) — proceed-with-warn on cache outage. Do not copy this for payment bookkeeping.
- **`ctx.idempotencyKey`** is GraphQL-only (`backend/graphql/gqlContextFactory.ts:191`) and irrelevant to webhooks.
- **Schema gaps the plan must own:** `student_payments` (`backend/db/schema/billing/student-payments.ts`) has **no idempotency-key or provider transaction-reference column and no unique index** (only `student_id`/`subscription_id` indexes, `:46-49`) — and is **append-only via immutability trigger** (`3-immutability-triggers.sql`, `:10-14`); `subscriptions.payment_reference varchar(255)` exists (`backend/db/schema/billing/subscriptions.ts:33`). `PaymentGateway.Paymob = "paymob"` already in `backend/enum/billing/payment-gateway.enum.ts:10` (pgEnum row at `backend/db/schema/enums.ts:38`); `PaymentStatus` = `pending|paid|failed|refunded` (`backend/enum/billing/payment-status.enum.ts:5-10`).
- **No gateway adapter/port exists in shipped code.** `PaymentGatewayPort`, checkout descriptors, mock adapter: **NOT FOUND** in `backend/` (only in the unimplemented-ish plan `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/specs.md:76` — that directory has no `outcome` for implementation, only `plan-review-R1.md`). `backend/services/billing/` contains only `plan-catalog.service.ts` + `wallet.service.ts` + barrel. DEV1-006's `specs.md:45` itself records "no `stripe|paymob|fawry` adapter; no `app/api` webhook route".

## 3. Notification-emission API (exact symbols)

Import from the barrel `@/backend/services/notifications` (`backend/services/notifications/index.ts:1`):

- `NotificationEngine.emitForUser(input: NotificationEmitInput, locale: string, tx?: DBTransaction, options?: NotificationEngineCallOptions)` — `backend/services/notifications/notification-engine.service.ts:42`
- `NotificationEngine.emitForUsers(input: NotificationEmitBatchInput, locale, tx?, options?)` — `:79`
- `NotificationEngine.publishReceipts(receipts: readonly NotificationDeliveryReceipt[], locale: string, options?)` — `:116`
- Type member: `NotificationType.PaymentConfirmation = "payment_confirmation"` — `backend/enum/notifications/notification-type.enum.ts:11`

Contract (hard rules from `docs/notifications/realtime-engine.md` §3.1/3.2): persist-first/push-second; with a caller-owned tx the engine joins as SAVEPOINT and returns a `NotificationDeliveryReceipt` **without publishing** — caller calls `publishReceipts` **after commit**; `title`/`body` stored verbatim (emitter localizes; engine never translates, §3.3); `idempotencyKey` optional ≤128, e.g. `payment:<paymobTxnId>:confirmation`; push failures degrade to one `logger.logDomainError` `{code: "NOTIFICATION_DELIVERY_DEGRADED", entity: "notifications"}` (§3.1); engine is single writer of `notifications` rows (REQ-010). Scheduled ownership note: DEV3-012/DEV3-013 are registered as the `session_cancellation` / `payment_confirmation` emitter tickets (realtime-engine.md:106).

Per-recipient locale: read via `UserRepository.findLocalesByIds` (realtime-engine.md:113, deferred item D2).

## 4. Env-key registration for `PAYMOB_SECRET_KEY` / `PAYMOB_PUBLIC_KEY` / `PAYMOB_HMAC_SECRET` / `PAYMOB_INTEGRATION_ID_*`

File: `backend/lib/env.ts`. Two consumption patterns, both live:

| Pattern | When | Symbol |
|---|---|---|
| Ad-hoc single-read (cron precedent: `getEnv("CRON_SECRET")` at `app/api/cron/sweep-sessions/route.ts:90`) | optional/feature-gated secrets | `getEnv(key): string \| undefined` (`env.ts:286`), `optionalEnv(key, default)` (`:293`), `requireEnv(key)` — throws on missing (`:303`) |
| Typed cached config | first-class config | add field to `EnvironmentConfig` (`env.ts:196-227`), populate in `readEnvironment()` (`:233-258`) with a pure parser (`parsePositiveIntegerEnv`, `parseOriginAllowlistEnv` models), export a typed getter (e.g. `getWebSocketPort()`, `:322`). Cache invalidated by `resetEnvironmentCache()` (`:279`) |

Also: register each key in `.env.example` with the `<your-…-here>` placeholder convention (e.g. `CRON_SECRET=<your-cron-secret-here>` at `.env.example:145`, `OPENEXCHANGERATES_APP_ID=<your-openexchangerates-app-id>` at `:177`); CI is self-contained (`No external GitHub secrets` — `.github/workflows/ci.yml:17`), see `backend/lib/test-ci-env.ts`. `ensureEnvironmentValidated()` (`env.ts:396`) currently throws only for DATABASE_URL / DATABASE_ENCRYPTION_KEY / JWT secrets in production — decide whether Paymob keys belong in startup validation or fail-at-request (cron route uses fail-at-request).

**Cold-start rules** (relevant to webhook handlers): `docs/backend/serverless-cold-start-optimization.md` is **NOT FOUND** (only `cross-stream-contracts.md` in `docs/backend/`; the root AGENTS.md reference and `backend/graphql/AGENTS.md:142` hyperlink are dead). The live rules are `backend/graphql/AGENTS.md:140-146`: pass `UserPermissionContext` through (avoid re-fetch), rate-limiter/cold-start paths fail-OPEN via try/catch, critical reads via `retryTransient()` from `@/backend/lib`, transient exhaustion → `SERVICE_UNAVAILABLE`. General posture: no module-level mutable state (realtime-engine.md §3.9), no blocking domain flows on cache/push outages.

Logging: `logger` from `@/backend/lib/logger` (never `console.*`); redaction of `token`/`password`/`secret`/`key` families is automatic via `redactLogContext` (`error-handling-contract.md:68`) — note `PAYMOB_SECRET_KEY`-shaped names hit the redactor by design.

## 5. Server-side translation entry points for API routes

- `getServerTranslations(locale: string)` from `@/shared/locale/server-graphql` — thin passthrough (`server-graphql.ts:1-5`) to `getTranslations(locale)` in `@/shared/locale/server` (`server.ts:15-17`), **synchronous**, returns the full `Translations` object; property access, e.g. `getServerTranslations(locale).errorsTranslations.badRequest` (used at `app/api/graphql/transport-rejection.ts:66`, `app/api/graphql/route.ts:195`).
- Request-locale resolution: `extractLocale(request, parsedCookies?)` from `@/backend/graphql/gqlContextFactory` (exported at `gqlContextFactory.ts:121`, consumed by transport-rejection.ts:14,66).
- The `errors` namespace is canonical for transport copy; its 18 fixed keys include `duplicateRequest`, `conflict`, `unauthorized`, `rateLimitExceeded`, `serviceUnavailable`, `internalServerError` (`shared/AGENTS.md:264`).
- Precedent: external-caller routes may skip localization — cron route hardcodes `const envelopeLocale = "en"` (`app/api/cron/sweep-sessions/route.ts:78-79`).
- New namespace (if the plan adds user-facing payment copy — e.g. for the result page): per `shared/AGENTS.md:235-240` — type in `shared/locale/types/<ns>/index.ts`, implementations in `shared/locale/{ar,en}/<ns>/index.ts`, export in `shared/locale/types/message.ts` (`MessageSchema`); the current tree additionally uses `shared/locale/namespaces/**/*.namespace.ts` with `defineNamespace("<stable-id>", config)` plus a `<ns>-namespace.parity.test.ts` at `shared/locale/` root (e.g. `wallet-namespace.parity.test.ts`) — follow the wallet namespace as the newest template.

## 6. `/[locale]/payment/result` page placement

**There is NO `[locale]` URL segment in this app tree** — `find app -name "*locale*"` finds only `app/api/set-locale`. Layout: `app/page.tsx` (public landing, exports `LandingPage` view), `app/(auth)/{login,register}`, `app/(dashboard)/{dashboard,wallet,profile,notifications,audit,disputes,admin,parent,student,teacher,[feature]}`. **Doc drift warning:** `shared/AGENTS.md:91` (":91 "Next.js native `[locale]` segments") and `:239` (`app/[locale]/layout.tsx`) and root AGENTS.md ("`[locale]` routing preserved") are stale; `app/AGENTS.md:60` explicitly states *"there is no `[locale]` URL segment under (dashboard)"*, and `redirect(\`/${locale}/login\`)` appears only in `app/AGENTS.md:117` as legacy sample.

Locale instead flows from the `NEXT_LOCALE` cookie: `getLocale()` / `getLocaleFromCookie()` from `@/shared/locale/server-cookies` (app/AGENTS.md:60; `wallet/page.tsx:6,25-28`), written by `GET /api/set-locale`.

Conventions for the result page (modeled on `app/(dashboard)/wallet/page.tsx` — closest existing "payment-ish" page):
- Location: `app/(dashboard)/payment/result/page.tsx` (route group affects nothing in the URL; path would be `/payment/result`).
- Auth: `await withPageAuth({ roles: [...], redirectTo: "/payment/result" })` — wallet imports it from `@/frontend/lib/auth/withPageAuth` (`wallet/page.tsx:3`); note `app/AGENTS.md:14` documents the same wrapper at `app/(dashboard)/shared/withPageAuth.ts` — two paths exist, resolve before planning. Anonymous callers → login redirect (`/login?redirect=/wallet` pattern, wallet docblock).
- Metadata: `generateMetadata()` reading locale cookie + `getTranslations(locale).<ns>Translations` (wallet pattern, `:23-30`).
- Render body is a client container view under `frontend/views/...` (wallet → `@/frontend/views/teacher/wallet/TeacherWalletContainer`).
- Permission-gated variant if needed: `requirePermissionForPage(userId, [AppPermission.…], locale, context)` (app/AGENTS.md:39-56).
- **No precedent for an anonymous non-auth content page** (Paymob browser-redirect returns land unauthenticated) — if the result page must render for logged-out users, that's a net-new posture (only `/` landing, `/login`, `/register` are public today).

## Open items / negative findings for the plan author

1. `special_reference` — NOT FOUND; webhook dedup needs a new durable claim table (use `session_request_idempotency` as the template) or schema columns on `student_payments`.
2. No `PaymentGatewayPort` / mock adapter / purchase service shipped — Paymob is the first real adapter; DEV1-006 plan dir exists but has no implementation outcome.
3. `student_payments` is append-only (immutability trigger) and lacks provider-reference/idempotency columns — schema migration required for webhook-driven status matches.
4. ROUTE_INVENTORY is stale vs the committed cron route — A4 interaction should be confirmed before adding the webhook row.
5. `docs/backend/serverless-cold-start-optimization.md` NOT FOUND (2 inbound dead links); rules live in `backend/graphql/AGENTS.md` §Serverless Cold-Start Optimization.
6. No shared REST body-size/rate-limit machinery for webhooks; `guardTransport`/`MAX_GRAPHQL_BODY_BYTES` are gateway-only and must not be coopted.
