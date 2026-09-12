# Research 03 — Jobs / Dates / Testing / i18n / env-config (Subscription Validity Window & Expiry)

Verified 2026-09-11 against the live tree. Every citation was grepped/read this session.

## 1. Background-job infrastructure

**Verdict: NO running/registered recurring scheduler exists today in the tree — but a concrete, working cron-route
pattern DOES exist, so the expiry job should be built as a sibling cron route following it, NOT from scratch.**

### Real, working prior art (all verified)

- `app/api/cron/sweep-sessions/route.ts` — the ONE live cron surface: `GET /api/cron/sweep-sessions`.
  - GET-only, `NextRequest` handler starting at route.ts:75.
  - Mode gates fail closed: returns a bare `404` unless `CRON_EXECUTION_MODE === "external"` AND
    `CRON_EXTERNAL_ENABLED === "true"` (route.ts:83-87), read via `getEnv` from `@/backend/lib/env` (route.ts:43).
  - Timing-safe bearer auth vs `CRON_SECRET`: SHA-256 digests + `crypto.timingSafeEqual`, module-local
    `bearerSecretMatches` at route.ts:66-73; 401 `UNAUTHORIZED` via `apiErrorResponse` on mismatch (route.ts:90-94).
  - Delegate + envelope: `SessionLifecycleService.sweepExpiredSessions()` then
    `apiSuccessResponse({ cancelled, refunded }, { requestId })` (route.ts:100-101); thrown errors masked via
    `apiErrorResponse` (route.ts:102-104). Locale is fixed `"en"` — cron routes are locale-free (route.ts:79).
  - Route test exists: `app/api/cron/sweep-sessions/test/sweep-sessions-route.test.ts` (env gymnastics at :66-74).
- Service-side sweep prior art: `SessionLifecycleService.sweepExpiredSessions`
  (`backend/services/classes/session-lifecycle.service.ts:776`, signature `sweepExpiredSessions(outerTx?: DBTransaction):
  Promise<{ cancelled: number; refunded: number }>`). Pattern to mirror: `withTransaction` from
  `@/backend/lib/db/with-transaction` (`backend/lib/db/with-transaction.ts:27`), capture `const now = new Date()`
  once, guarded batch update via repo `sweepExpiredScheduledOnce(now, tx)`-style guards
  (`backend/db/repo/classes/session.repository.ts:473`), notifications committed pre-commit and published
  strictly post-commit, counts-only return (no row ids cross the wire).
- Canonical R1-R11 cron rules are documented in `backend/services/fx/README.md:25`
  (GET-only, timing-safe compare, prod-required secret, no query-string secret, 405/401/500 fail-closed).

### Stale/missing cron artifacts — do NOT cite these as existing

- `package.json` `cron:worker` (`"bun run scripts/cron-worker.ts"`, package.json:63) — **`scripts/cron-worker.ts`
  does not exist** (verified `ls`). Stale script.
- `package.json` `test:cron` (package.json:27) targets `backend/services/cron/test/`,
  `backend/db/test/repo/cron.repository.test.ts`, `backend/lib/cron-auth.test.ts` — **all missing** (verified).
- `backend/services/fx/README.md:25` references `app/api/fx/refresh/route.ts`, `vercel.json`, and
  `backend/lib/cron-auth.ts` — **none exist** (verified; `app/api/` has only `api/cron/…` under cron; no
  `vercel.json` anywhere; no `cron-auth` module). The inline auth in the sweep-sessions route replaced the
  lib module.
- `.env.example:148-166` documents `CRON_EXECUTION_MODE` (`vercel` | `vercel-daily` | `external` | `standalone`),
  CRON schedules (`CRON_FX_REFRESH_SCHEDULE`, `CRON_CLASS_REMINDERS_SCHEDULE`, `CRON_TICKER_SCHEDULE`), and
  `CRON_EXTERNAL_ENABLED/ENDPOINT/SCHEDULE/SECRET` — but the "build-time vercel.json generation" tooling it
  describes is not in the tree. Only `CRON_SECRET` (`.env.example:145`), `CRON_EXECUTION_MODE` (:154) and
  `CRON_EXTERNAL_ENABLED` (:164) are actually consumed by live code (the sweep-sessions route).

### Plan implication

The expiry job = **new route** `app/api/cron/<something>-subscriptions/route.ts` (copy the sweep-sessions
pattern line-for-line: gates, bearer compare, envelope, `locale = "en"`) + **new service method** modeled on
`sweepExpiredSessions` (own-transaction, `now` captured once, guarded repo updates, counts-only return) +
**new repo guard** in `backend/db/repo/billing/subscription.repository.ts`. Single-instance/locking strategy is
the repo-level guarded-UPDATE (`...Once` predicate => idempotent second run returns zero rows) — that is the
established "lock" mechanism; there is no distributed-claim table for jobs today.

## 2. Time/date conventions — "now"

- **Native `Date` only.** No dayjs/date-fns/moment anywhere in `backend/services` (grep for `dayjs|date-fns`
  = zero hits). `new Date()` is the sanctioned "now" — there is **no injected clock**.
- "Now" is captured exactly once per flow and passed down: `const now = new Date();` in
  `SessionLifecycleService.sweepExpiredSessions` (`session-lifecycle.service.ts:780`) and in the activation flow
  (`backend/services/billing/subscription-activation.service.ts:360`).
- Day arithmetic is millisecond math against a module constant `MS_PER_DAY = 86_400_000`
  (duplicated per-module, e.g. `subscription-activation.service.ts:96`, `backend/lib/auth/suspension-window.ts:26`).
  Activation window already computed as `endDate: new Date(now.getTime() + plan.intervalDays * MS_PER_DAY)`
  (subscription-activation.service.ts:368) — **AC1's arithmetic already exists in production code; see the
  table below.**
- Timezone: timestamps are `drizzle timestamp` columns in UTC; the `scripts/iana-timezone-generator` /
  `shared/lib/timezone/excluded-iana-timezones.ts` machinery is for user-profile timezones, NOT for expiry math.
  The plan should do the expiry comparison as `endDate <= now` in the repo's guarded UPDATE (SQL-side), not via
  tz-aware strings.
- Journey-test time comparisons: `secondPrecisionMs(instant: Date | number): number`
  (`test/workflows/helpers/second-precision.ts:21`) — use it when comparing a computed `endDate` to a DB
  timestamp (second-level precision of PG timestamps).

## 3. Existing schema/behavior the plan must hook (verified)

| Fact | Where |
|---|---|
| `plans.intervalDays integer NOT NULL`, CHECK `interval_days > 0` | `backend/db/schema/billing/plans.ts:28,41` |
| `subscriptions.start_date` / `end_date` (`timestamp`, nullable) | `backend/db/schema/billing/subscriptions.ts:39-40` |
| `subscription_status` pgEnum already includes `"expired"` | `backend/db/schema/enums.ts:47-53` |
| `SubscriptionStatus` TS enum (`Expired = "expired"`) | `backend/enum/billing/subscription-status.enum.ts:5-14` |
| Activation already writes start/end (pending→active, guarded, idempotent) | `subscription-activation.service.ts:360-368` via `SubscriptionRepository.activatePendingOnce` |
| `SubscriptionRepository` methods (extend here): `insertSubscription:61`, `findById:78`, `findByPaymentReference:100`, `activatePendingOnce:131`, `listByUserId:161` | `backend/db/repo/billing/subscription.repository.ts` |
| Student lane balances: `balanceHifz / balanceTajweed / balanceReviews` on `students` (no per-period column — expiry "zeroes the period balance" must map onto the lane model; the lane repo op precedent is `StudentRepository.decrementLaneIfAvailable`) | factory fixture `entity-setup.ts:102-126`; `session-lifecycle.booking.ts:100-114` |
| **NO existing `SUBSCRIPTION_EXPIRED` code or "Subscription expired" copy anywhere** (verified grep) — AC3's reject is a NEW domain code + NEW errors-namespace key. AC3's 422 = `ValidationError` class (code→status table `VALIDATION: 422`, `backend/lib/errors/error-code-taxonomy.ts:47`). |

## 4. Test infrastructure (exact signatures, verified)

### 4.1 DB / service-layer tests

- `runInRollback` — `backend/db/test/test-utils.ts:34`:
  `export async function runInRollback<T>(fn: (tx: DBTransaction) => Promise<T>): Promise<T | undefined>`.
  Forced rollback via sentinel throw; `expect(...).rejects.toThrow()` inside it deadlocks — use `expectRepoError`
  (re-exported from same file) or try/catch. **Same wrapper is used by service-layer tests** (e.g.
  `backend/services/billing/subscription-activation.service.test.ts:72,227`).
- Factories — `backend/db/test/entity-setup.ts` (all take `tx: DBTransaction` first):
  - `createTestUser(tx, overrides?: Partial<UserSelectType>): Promise<UserSelectType>` — :72
  - `createTestStudent(tx, userId: number, overrides?: Partial<StudentSelectType>): Promise<StudentSelectType>`
    — :102 (defaults `balanceHifz/Tajweed/Reviews = 0`)
  - `createTestPlan(tx, overrides?: Partial<PlanSelectType>): Promise<PlanSelectType>` — :178
    (defaults `sessionCount: 8, price: "200.00", intervalDays: 30, isActive: true`)
  - `createTestSubscription(tx, userId: number, planId: number, overrides?: Partial<SubscriptionSelectType>):
    Promise<SubscriptionSelectType>` — :220. Defaults a LIVE sub (`status: Active, startDate: new Date(),
    endDate: null`); its docblock (:208-218) shows the expired fixture: pass
    `{ status: SubscriptionStatus.Expired, startDate: past, endDate: past }`. **Note: this factory was added
    with an expired-row example already — the "expiry state" test shape is anticipated.**
  - `createTestStudentPayment(...)`:262, `createTestWallet(tx, teacherId, ...)`:450.
- Runner for a single DB/service test file (AI-optimized log capture):
  `bun run test/scripts/run-test.ts <path>`; view last: `bun run test/scripts/run-test.ts --last <path>`.
  Batch lanes: `bun run test:db` / `bun run test:services` (parallel runners,
  `test/scripts/run-services-tests-parallel.ts:14` — pattern `**/*.test.ts` under `backend/services`,
  8 workers, `sequentialTailPatterns` for shared-state suites; add a sweep test to a tail pattern only if it
  commits fixtures).

### 4.2 Journey tests (`test/workflows/`)

Rules: `test/workflows/AGENTS.md` — **NO `runInRollback`** (rule 1); fixtures committed in ONE
`db.transaction` in `beforeAll`, all ids tracked and hard-deleted in `afterAll` with post-teardown existence
re-probes (rule 2); per-run `jrn_<domain>_<8hex>` prefix (rule 3); spy external effects at the publish seam
(rule 5); `catchJourneyError` + translated substrings, never `.rejects.toThrow()` (rule 6).

Verified helper signatures (barrel `test/workflows/helpers/index.ts`, import via `@/test/workflows/helpers`):

- `provisionStudentActor(tx, options?: ActorProvisionOptions): Promise<JourneyActor>` —
  `test/workflows/helpers/actor-context.ts:88`; `JourneyActor = { userId, locale, role }` (:43-48),
  `ActorProvisionOptions = { locale?: AppLocale; tracked?: TrackedFixtures }` (:50-57). Siblings:
  `provisionCertifiedTeacherActor`:105, `provisionParentActor`:122, `provisionAdminActor`:136.
- `journeyPrefix(domain: string): string` — `test/workflows/helpers/session-cast.ts:314` (spelling:
  `jrn_<domain>_<8hex>`; CANONICAL example `journeyPrefix("billing")`).
- `catchJourneyError(fn: () => Promise<unknown>): Promise<Error>` —
  `test/workflows/helpers/journey-fixtures.ts:226`.
- `class TrackedFixtures { register(table: PgTable, id: number, options?): void; get records; get size;
  exists(record); cleanup() }` — `test/workflows/helpers/tracked-fixtures.ts:173`. Register order =
  FK-safe reverse delete; `cleanup()` re-probes every row.
- `createSessionFixtureRegistry(): SessionFixtureRegistry { track, trackAll, ids, trackedCount, cleanup }` —
  `test/workflows/helpers/journey-fixture-registry.ts:122` — sessions-layer variant; for a billing journey
  prefer `TrackedFixtures` (what the billing journey uses).
- `class SpiedFanoutTransport implements FanoutTransportLike` — `test/workflows/helpers/spied-transport.ts:49`;
  `publishFanout(userIds, payload)` records; assert via `calls / publishCount / lastCall / publishedUserIds`;
  `clear()` re-arms. Use ONLY where a service takes an injected transport; the existing billing journey instead
  spies the namespace seam: `spyOn(NotificationEngine, "publishReceipts").mockImplementation(async () => {})`
  (`test/workflows/billing/subscription-purchase.journey.test.ts:142`).
- `withImmutabilityTriggersSuspended` from `@/test/helpers/db-cleanup` — needed in `afterAll` if teardown must
  delete append-only (BEFORE-DELETE-triggered) ledgers (used by the billing journey, import at
  `subscription-purchase.journey.test.ts:108`).

Canonical example to crib from: `test/workflows/billing/subscription-purchase.journey.test.ts` — one committing
`beforeAll` transaction, `TrackedFixtures`, GraphQL-scope-gate denial harness (`expectSingleDenial` at
  :248 asserts one error with `extensions.code` === expected), direct-Drizzle read-back oracles
  (`db.$count(...)` at :262-272), per-file `MS_PER_DAY` constant (:127), `PLAN_INTERVAL_DAYS = 30` (:132), and
  the exact-window assertion `active.endDate - active.startDate === PLAN_INTERVAL_DAYS * MS_PER_DAY` (:539) —
  AC1's "end_date = start_date + interval_days" is already journey-tested there.

Runners: single file/layer via `bun run test/scripts/run-test.ts test/workflows/<domain>/<file>.test.ts` or
`bun run test/scripts/run-test.ts test/workflows` (test/workflows/AGENTS.md:91-97). **There is no
`package.json` script for test/workflows** (verified) — raw `bun test` is prohibited for this layer.

## 5. i18n — adding the "subscription expired" error key

### Reality (all verified)

- Runtime entry points: `getServerTranslations(locale: string): Translations` —
  `shared/locale/server-graphql.ts:3`; alias `getTranslations(locale: string): Translations` —
  `shared/locale/server.ts:15`. **One-arg calls returning the whole `Translations` bundle**; namespaces are
  PROPERTIES (`t.errorsTranslations`, `t.notificationsTranslations` — `shared/locale/types/message.ts:21-24`).
  There is **NO two-arg `getTranslations(locale, namespace)`** and **no `Translation.` enum / codegen object**
  (verified absent).
- Service-layer pattern (the one to copy): services take `locale: string` and do
  `const t = getServerTranslations(locale).errorsTranslations;`
  (`backend/services/classes/session-lifecycle.service.ts:203,255,386,466,529`); resolvers pass
  `ctx.locale` (`backend/graphql/mutation/classes/session-lifecycle.mutation.ts:138`); helpers receive
  `t: ReturnType<typeof getServerTranslations>["errorsTranslations"]`
  (`backend/services/classes/session-lifecycle.booking.ts:60,73`).
- Throwing: `throw new ValidationError("INSUFFICIENT_BALANCE", t.insufficientBalance)` —
  `session-lifecycle.booking.ts:113`. `ValidationError` overloaded ctor at `backend/lib/errors.ts:65`
  (`("CODE", message, options?)`); `DomainError` sets `extensions.code` (errors.ts:19-30).
  422 comes from `VALIDATION: 422` (`error-code-taxonomy.ts:47`) — a custom SCREAMING_SNAKE code like
  `SUBSCRIPTION_EXPIRED` is NOT in the 9-code `ErrorCode` union and normalizes to `null`
  (`normalizeErrorCode`, error-code-taxonomy.ts:113); check how `INSUFFICIENT_BALANCE` reaches 422 at the
  boundary before inventing a new custom code — the safe default the plan should cite is the SAME class
  (`ValidationError`) with a new domain code, mirroring `INSUFFICIENT_BALANCE`'s wiring.
  **No `SUBSCRIPTION_EXPIRED` key/code exists today** (verified grep).
- New error key recipe (3 files, plus parity safety):
  1. Type: `shared/locale/types/errors/labels.ts` — add to interface `ErrorsLabels` (top-level pattern:
     `insufficientBalance` at labels.ts:174) or a new group like `subscriptionPurchase`
     (labels.ts:30/69). Docblock rule from `SubscriptionPurchaseErrorsLabels` (:22-29): self-contained
     sentence, no identifiers.
  2. English: `shared/locale/en/errors/index.ts` — e.g. existing verbatim example at :85:
     `insufficientBalance: "Your balance is insufficient for this request."`
     and subscription example :34-40 (`subscriptionPurchase: { planNotPurchasable: "This subscription plan is
     not available for purchase.", … }`).
  3. Arabic: `shared/locale/ar/errors/index.ts` (mirrors every key; `subscriptionPurchase` block at :34).
  4. Parity test auto-covers errors: `shared/locale/errors-namespace.parity.test.ts` — en/ar keys must match
     exactly or the parity gate fails.
  The errors namespace needs NO `namespacePaths`/message.ts registration (already wired:
  `errorsTranslations: ErrorsLabels`, message.ts:24) — **only add keys to the 3 files**; the shared/AGENTS.md
  "Namespace Registration 5-step" list applies only to brand-new namespaces and is partly stale
  (it references non-existent `serverLegacy.ts`; real files are `server.ts`/`server-graphql.ts`).

### Anti-patterns the plan must avoid (verified against reality)

- No `Translation.SOMETHING` enum references (no such symbol).
- No two-arg `getServerTranslations(locale, "errors")` / `getTranslations(locale, "errors")`.
- No `next-intl`, no `getBackendTranslations`, no `shared/messages/`.
- Logger import per layer: backend `@/backend/lib/logger` (`logger.logDomainError(msg, { code, entity, entityId })`
  — used in `session-lifecycle.booking.ts:107-112` right before the reject); frontend `@/frontend/utils/logger`.

## 6. env-config — registering new cron config keys

- **There is NO `env-config-keys.ts`** (verified: `find -name 'env-config-keys*'` = 0). Two mechanisms exist:
  1. **Raw env reads** via `getEnv(key: string): string | undefined` — `backend/lib/env.ts:308`; this is what
     cron routes use today (`getEnv("CRON_EXECUTION_MODE")`, `getEnv("CRON_EXTERNAL_ENABLED")`,
     `getEnv("CRON_SECRET")`, sweep-sessions route.ts:83-90). Cron secrets live OUTSIDE the typed snapshot.
  2. **Typed snapshot** for long-lived service config: extend the `EnvironmentConfig` interface in
     `backend/lib/env.ts` (~:195-243) + add parsing in `readEnvironment()` (~:247-276). Precedent to copy:
     payment webhook keys — `paymentWebhookSecret: trimmedEnvValue(process.env.PAYMENT_WEBHOOK_SECRET)` and
     `paymentWebhookEnabled: trimmedEnvValue(...) === "true"` (:272-273). Cache invalidation:
     `resetEnvironmentCache()` (env.ts:299).
- Documentation duty: append any new key to `.env.example` (cron block at `.env.example:141-166`) **and** set
  sane local defaults in `.env`/`.env.test` if tests need them (cron route tests set env vars in-process —
  `sweep-sessions-route.test.ts:66-74` — so a subscription-expiry route test can do the same without
  touching env files).
- **Recommendation for the plan**: a second subscription-expiry cron needs NO new env keys if it reuses
  `CRON_SECRET` + the `CRON_EXECUTION_MODE=external && CRON_EXTERNAL_ENABLED=true` gate — the sweep-sessions
  route already pays the registration cost, and the `.env.example` mode/schedule keys are the only planned
  (but unimplemented) scheduler plumbing. If the plan wants a dedicated toggle, the recipe is: raw `getEnv` in
  the route (no env.ts change) + `.env.example` doc line — exactly the cron-secret precedent.

## 7. Negative verification summary (things the plan must NOT assume)

| Assumed artifact | Reality |
|---|---|
| `scripts/cron-worker.ts` | **Missing** — stale `cron:worker` script in package.json:63 |
| `backend/lib/cron-auth.ts` | **Missing** — auth logic is inline in the sweep-sessions route |
| `vercel.json` / build-time cron codegen | **Missing** — `.env.example:153` describes tooling not in the repo |
| `app/api/fx/refresh/route.ts` | **Missing** (fx README describes it; not in tree) |
| `Translation` key enum, two-arg `getTranslations` | **Never existed** — one-arg bundle access only |
| Existing `SUBSCRIPTION_EXPIRED` code / "Subscription expired" copy | **None** — new code + new en+ar keys required |
| Per-subscription "remaining sessions" column | **None** — student balance lives on 3 lane counters; "zero the period balance" must be designed against lanes, not a per-period column |
