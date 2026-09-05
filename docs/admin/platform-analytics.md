# Platform Analytics — Canonical Reference

**Domain:** Admin / whole-platform observation surface (read-only aggregate snapshot: users, sessions, revenue, subscriptions, teacher presence, ratings, operational health, 30-day daily trends)
**Specs:** `docs/specs/functional-requirements.md` (FR-10.6), `docs/workflows/05-admin-governance-override.md` (§1 read-visibility half), `docs/specs/state-machine-invariants.md` (INV-S*/B*/W*/E*/PAY* — read-only consumption), `docs/specs/open-decisions-and-gaps.md` (B.9, B.15, B.6/B.7)
**Status:** Implemented and verified

This document is the single canonical reference for the `adminPlatformAnalytics` surface — the admin-only, zero-argument whole-platform snapshot. All layers (types, repos, service, GraphQL, frontend, tests) MUST conform to the contracts described here. Code blocks are **illustrative and NON-authoritative** — the authoritative implementations are cited by path (and line where the wording depends on it) in each section.

The surface observes state created by OTHER actors (students pay, teachers serve sessions, parents subscribe); the admin is a pure OBSERVER. It reads eight existing tables (`users`, `session`, `student_payments`, `subscriptions`, `teacher`, `reports`, `evaluations`, `teacher_transaction`) and writes nothing.

---

## 1. Why

FR-10.6 (`docs/specs/functional-requirements.md`) defines the platform-analytics dashboard: one admin page answering "how is the whole platform doing right now" — population, activity, revenue shape, subscription posture, teacher presence, quality signals, and operational backlog — without exposing any per-entity row.

The governing design constraints, each of which has a dedicated section below:

- **One snapshot per request, captured at one instant** (§3) — no counter may disagree with another about "now".
- **Money never crosses a JS `number`** and **currencies are never merged** (§4).
- **Offline-activated subscriptions are revenue-honest**: counted separately, never folded into gateway revenue (§4.2).
- **Read purity**: the surface performs ZERO writes, ZERO audit rows, ZERO notifications on every path (§6).
- **Governed admins are denied at the service tier**, past the GraphQL role scope (§5) — the documented non-fail-closed GraphQL context window is closed here.

---

## 2. Read-Surface Contract

One GraphQL query backs the whole surface:

```text
// ILLUSTRATIVE — NON-AUTHORITATIVE. Canonical:
//   - query:   backend/graphql/query/admin/platform-analytics.query.ts:48-70
//   - objects: backend/graphql/pothos/admin/platform-analytics.pothos.ts:57-236
//   - wire:    frontend/graphql/generated/schema.graphql:502-590
adminPlatformAnalytics: PlatformAnalytics!

PlatformAnalytics:      generatedAt: DateTime!, users, sessions, revenue, subscriptions,
                        teachers, ratings, health (section objects, all non-null),
                        sessionTrendDaily: [PlatformAnalyticsSessionTrendPoint!]! (30 buckets),
                        revenueTrendDaily: [PlatformAnalyticsRevenueTrendPoint!]!
```

- **Zero arguments.** There is no `id`, no date input, no section selector, no filter — nothing client-steerable. Any argument in a client document dies as `GRAPHQL_VALIDATION_FAILED` pre-resolver (closed input surface; the strongest mass-assignment posture for a read).
- **Aggregate anonymity.** None of the eleven `PlatformAnalytics*` types carries an `id` field; only counts, sums, averages, and bucket stamps are exposed — no per-row identity can leak through the aggregate. Selecting `id` anywhere in the subtree fails validation.
- **authScopes (the `$all` conjunction is load-bearing):** `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` (`backend/graphql/query/admin/platform-analytics.query.ts:53-58`). Anonymous → `UNAUTHORIZED` (401) and authenticated non-admin → `FORBIDDEN` (403), both BEFORE the resolver body runs. A plain `{ authenticated: true, role: [...] }` map is WRONG: Pothos combines scope keys with ANY semantics unless `$all` makes the conjunction explicit.
- **Thin resolver.** The resolver body is the `ctx.user` TypeScript-narrowing belt plus ONE service call passing only `(ctx.user.id, ctx.locale)` — no try/catch, no logic, no repository access (`platform-analytics.query.ts:59-68`).
- **NOT public.** `adminPlatformAnalytics` is absent from the public-operations allowlist (`backend/lib/gateway/public-operations.ts` — the frozen six stay frozen).
- **Timestamps ride the `DateTime` scalar.** `generatedAt` and both `bucketStart` fields are registered-scalar instants; the legacy `toISOString()`→`String` workaround is PROHIBITED on this surface. The only `String` leaves in the entire subtree are the money/currency fields (`currency`, `totalAmount`, `last30DaysAmount`, `amount`).
- **The only nullable fields on the whole surface** are `ratings.averageSessionRating: Float` and `ratings.averageEvaluationScore: Float` (honest absence — §4.3). Everything else is non-null.

### 2.1 Metric Definitions Table (every field → exact SQL semantics)

All predicates below are executed as parameterized, set-oriented aggregate reads (`count(*)::int` / `count(*) filter (where …)::int` / `sum(amount)::text`); enum members arrive as bound parameters from the TypeScript enum mirrors (VALUE imports — never string literals in SQL). Repository: `backend/db/repo/admin/platform-analytics.repository.ts` + `backend/db/repo/admin/platform-analytics-query-helpers.ts`. Canonical types: `backend/types/admin/platform-analytics.types.ts`.

**Users section** — `PlatformAnalyticsUsers` (11 counters): the ten directory counters of `AdminUserRepository.getStats` (`backend/db/repo/admin/admin-user.repository.ts:178-213`) consumed VERBATIM (never re-declared, never forked) plus one analytics-native counter:

| Field | Semantics |
|---|---|
| `totalCount` | `count(*)` over `users`. |
| `activeCount` | Filtered count with NULL-safe governance exclusion: `coalesce(is_deleted,false)=false AND coalesce(suspended,false)=false AND coalesce(is_blocked,false)=false`. A legacy NULL state column reads as "not set" (only an explicit `true` excludes). |
| `suspendedCount` / `blockedCount` / `deletedCount` | Filtered counts `suspended = true` / `is_blocked = true` / `is_deleted = true`. MAY overlap (a suspended-and-deleted user increments both buckets). |
| `adminsCount` / `teachersCount` / `studentsCount` / `parentsCount` | Role counts (`role = 'admin'` etc.); partition `totalCount` exactly. |
| `newThisWeekCount` | `created_at > cutoff` where the cutoff (`Date.now() − 7 days`) is computed in JS and bound as a parameter (never SQL `now() - interval`). See the skew waiver in §3.3. |
| `recentlyActive24h` | Analytics-native (`countRecentlyActiveUsers`, `platform-analytics.repository.ts:117-143`): non-governed users with `last_active_at > now − 24h` (strictly after the window start). Governance exclusion is NULL-safe in both directions (`coalesce(column,false)=false` per flag) — deleted, suspended, and blocked users never count as recently active. This is the intended analytics consumer of the `last_active_at` column (decision B.15). |

**Sessions section** — `PlatformAnalyticsSessions` (10 counters), ONE bare aggregate over `session` (`getSessionStatsImpl`, `platform-analytics-query-helpers.ts:240-306`; always exactly one row — zeros on an empty table). The five `SessionStatus` members are `scheduled / started / completed / cancelled / disputed`; the status counters partition `total` exactly (one status per row):

| Field | Semantics |
|---|---|
| `total` | `count(*)` over `session`. |
| `today` | `count(*) filter (created_at >= midnight-UTC-of-now's-day AND created_at <= now)` — closed range `[dayStart, now]`. |
| `thisWeek` | Closed range `[ISO-week start (Monday 00:00 UTC), now]`. |
| `thisMonth` | Closed range `[first of month 00:00 UTC, now]`. |
| `scheduled` / `started` / `completed` / `cancelled` / `disputed` | Filtered counts per `SessionStatus` member (all five present even when zero). |
| `awaitingConfirmation` | Lifecycle-derived, NOT an enum member: `status = 'completed' AND confirmed_by_student_at IS NULL`. Confirming the student flips a session out of this counter without changing its status — completed-and-confirmed is NOT awaiting. |

**Revenue section** — `PlatformAnalyticsRevenue`:

| Field | Semantics |
|---|---|
| `gatewayRevenueByCurrency` | One row per currency with at least one SETTLED payment: `student_payments WHERE status = 'paid' GROUP BY currency ORDER BY currency ASC` (`getRevenueStatsImpl`, `platform-analytics-query-helpers.ts:370-404`). Per row: `totalAmount` = `coalesce(sum(amount),0)::text` ALL-TIME; `last30DaysAmount` = same sum filtered to the closed 30-day window `[now − 30d, now]`; `paidPaymentsCount` = all-time settled count behind the row. No gateway column participates in the revenue predicate — see the honesty note in §4.2 for why offline methods are structurally absent. |
| `offlineActivationsCount` | `count(*)` over `subscriptions WHERE payment_method IN ('offline_cash','bank_transfer','scholarship')` (`countOfflineActivationsImpl`, `platform-analytics-query-helpers.ts:467-482`; members bound from `OFFLINE_ACTIVATION_GATEWAYS`, `:112-116`). |

**Subscriptions section** — `PlatformAnalyticsSubscriptions` (7 counters), ONE bare aggregate over `subscriptions` (`getSubscriptionStats`, `platform-analytics.repository.ts:237-294`). The five `SubscriptionStatus` members are `active / pending / expired / cancelled / suspended` (partition `total` exactly):

| Field | Semantics |
|---|---|
| `total` | `count(*)` over `subscriptions`. |
| `active` / `pending` / `expired` / `cancelled` / `suspended` | Filtered counts per `SubscriptionStatus` member (all five present even when zero). |
| `activeInWindowNow` | The ACTIVE-window predicate evaluated at the captured instant (reusing the directory's proven shape with `now` bound as a parameter instead of SQL `now()`): `status = 'active' AND coalesce(start_date, now) <= now AND (end_date IS NULL OR now < end_date)`. A NULL start date reads as "starting now"; an open-ended or NULL end date qualifies; an end date exactly at `now` does NOT (strict `<`). An expired `end_date` with a stale `status='active'` is excluded. |

**Teachers section** — `PlatformAnalyticsTeachers` (3 counters), ONE bare aggregate over the `teacher` table (`getTeacherPresenceStats`, `platform-analytics.repository.ts:320-351`):

| Field | Semantics |
|---|---|
| `certifiedCount` | `count(*) filter (is_approved = true)`. |
| `evaluatorCount` | `count(*) filter (is_evaluator = true)`. |
| `onlineNowCount` | `count(*) filter (is_approved = true AND is_online = true)` — an uncertified row is never "online now" (`onlineNowCount ⊆ certifiedCount`). |

Applicants (verification pending) are structurally excluded — they have no `teacher` row by table selection (decisions B.6/B.7); no governance filter is applied on top.

**Ratings section** — `PlatformAnalyticsRatings` (4 fields, two honest families; `getRatingStats`, `platform-analytics.repository.ts:366-414`):

| Field | Semantics |
|---|---|
| `averageSessionRating` | `round(avg(student_rating_by_teacher)::numeric, 2)::float8` over `reports` (0–5 band, CHECK-constrained at the schema). Averages over NON-NULL values only — an unrated report is absent from both the average and the count. Rounds to exactly 2 decimal places server-side. |
| `sessionRatingsCount` | `count(student_rating_by_teacher)::int` — the sample size behind the average (non-null count). |
| `averageEvaluationScore` | `round(avg(score)::numeric, 2)::float8` over `evaluations` excluding soft-deleted rows NULL-safely (`coalesce(is_deleted,false) = false` bound as a parameter). 0–100 band. |
| `evaluationScoresCount` | `count(score)::int` over the same live-row predicate. |

**Health section** — `PlatformAnalyticsHealth` (2 counters; `getHealthIndicators`, `platform-analytics.repository.ts:424-460`). No other indicator may be added silently (the frozen SDL inventory is the contract):

| Field | Semantics |
|---|---|
| `pendingDisputes` | `count(*)` over `session WHERE status = 'disputed'`. |
| `pendingWithdrawals` | `count(*)` over `teacher_transaction WHERE type = 'withdrawal' AND status = 'pending'`. |

**Trend points** — `PlatformAnalyticsSessionTrendPoint` (`bucketStart: Date` midnight-UTC instant + `sessionCount`) and `PlatformAnalyticsRevenueTrendPoint` (`bucketStart` + `currency` + `amount` decimal string): SPARSE per-day reads over the closed 30-day window (`getSessionDailyTrendImpl` / `getRevenueDailyTrendImpl`, `platform-analytics-query-helpers.ts:323-357, 416-455`), grouped by `date_trunc('day', …)` and ordered by day (then currency). The repository never fabricates empty buckets — zero-filling/expansion is the service's assembly duty (§3). Sessions trend buckets count rows by `created_at`; revenue trend buckets sum settled (`paid`) payment amounts per (day, currency).

---

## 3. Temporal Contract — Single Snapshot, UTC Boundaries

### 3.1 The one captured instant

The service captures **exactly ONE `now = new Date()` per request** and derives EVERYTHING from it: `generatedAt` is that instant, every windowed repository method receives that same `Date` reference, and both trend skeletons are cut from it (`backend/services/admin/platform-analytics.service.ts:137-179`). Wall clock is never re-sampled mid-request — a snapshot can never disagree with itself across methods. All eleven repository reads compose in ONE `Promise.all` over the SAME transaction handle; the service test pins the identical-`now` reference, the identical-`tx` reference, and `generatedAt` reference-equality.

**Contract:** `generatedAt` is the one captured instant of the snapshot. Two reads that bracket a committed fixture produce strictly increasing `generatedAt` values and a whole-snapshot diff of exactly the committed delta — a cached answer fails the freshness journey by design (§7).

### 3.2 UTC boundary rulings

All calendar math is pure UTC (`Date.UTC(...)` helpers — never SQL `now()`, never client-local time; `platform-analytics-query-helpers.ts:129-142`):

| Boundary | Ruling |
|---|---|
| Day | `today` and the trend skeleton cut at **midnight UTC of `now`'s day** (`utcDayStart`). |
| ISO week | `thisWeek` cuts at **Monday 00:00 UTC** of `now`'s ISO week (`(getUTCDay() + 6) % 7` days back — `isoWeekStart`). |
| Month | `thisMonth` cuts at **00:00 UTC of the first of `now`'s month** (`utcMonthStart`). |
| 24h | `recentlyActive24h` is the trailing window **strictly after `now − 24h`** (strict `>`). |
| 30-day | Trends and `last30DaysAmount` use the **closed window `[now − 30d, now]`** (`TREND_WINDOW_MS`, `:105`) — a row stamped exactly at a boundary counts (inclusive `>=` at the start, `<=` at `now`). |

Window counters are closed ranges `[boundary, now]`: a row stamped after the captured instant counts in none of them, and a row stamped exactly at a boundary counts.

**The 31-day-touch vs 30-bucket skeleton note (documented contract, not a bug):** the rolling window `[now − 30d, now]` spans exactly 30×24 hours but **touches 31 UTC calendar days** whenever `now` is not exactly midnight — the boundary-day sliver `[now − 30d, first-displayed-bucket-midnight)`. Consequence: a currency's scalar `last30DaysAmount` (computed over the full window) may legitimately **exceed the sum of its 30 displayed trend buckets** (whose earliest bucket starts at the boundary day's midnight). The service's `mergeSessionTrend`/`expandRevenueTrend` ignore sparse rows dated before the skeleton on purpose — the sliver contributes to the scalar and to nothing displayed. Mixing the two figures (or "fixing" either to match the other) is a contract change, not a bug fix.

### 3.3 Clock sources — the two sanctioned exceptions to "one `now`"

- **`getStats.newThisWeekCount` uses its own `Date.now()` cutoff** (`admin-user.repository.ts:179`). The directory counter is REUSED verbatim (reuse-not-rebuild forbids modifying the shared substrate to accept a caller-supplied `now`), so its 7-day cutoff is captured milliseconds apart from the snapshot instant. This ms-scale skew is WAIVED and documented: it cannot move a 7-day window counter by a meaningful amount, and the alternative (forking `getStats`) would create a second source of truth for the ten directory counters.
- **Everything else derives from the captured `now`.** No other method samples the clock; the repositories are pure functions of `(now, tx)`.

### 3.4 Snapshot consistency ruling (statement-level)

Cross-metric drift between two statements of the same request is **ACCEPTED and documented**: each statement sees its own statement-level snapshot under the default isolation level, so a write committed between two of the eleven reads can be visible to the later read and not the earlier one. A monitoring dashboard is not a ledger — no correctness requirement here needs a frozen cross-statement view, and the whole snapshot is re-captured on the next poll (120 s client cadence). A `REPEATABLE READ` upgrade was considered and **REJECTED**: it locks nothing relevant for a read-only surface, costs a longer-lived transaction snapshot on the shared database, and solves no requirement this surface owns.

---

## 4. Money, Currencies, and Honesty

### 4.1 Money as exact decimal strings; currency containment

- Every monetary value is an **exact decimal STRING end-to-end**: PostgreSQL computes `sum(amount)` (numeric) and casts `::text`; the repository returns `string`; the service passes strings through verbatim; the GraphQL leaf is `String!`; the frontend renders strings. Conversion through JS `number` for money is PROHIBITED (float drift).
- **Currency containment:** currencies are NEVER merged. Every revenue row carries exactly one 3-character code (`student_payments.currency` is `char(3)`, not an enum — a plain string is the honest type); no day ever sums across codes in the trend (separate (day, currency) points); the frontend revenue table keeps one row per code. Cross-currency totals do not exist on this surface.
- **Honest EMPTY array:** a payment history with no settled (paid) rows yields `gatewayRevenueByCurrency: []` — never a phantom zero-currency row. `revenueTrendDaily` stays honestly EMPTY (`[]`) when no currency exists in the trailing window (the currency set is derived ONLY from the window's sparse trend rows — an all-time-only currency never fabricates trend points); otherwise it expands day-major, currency-ascending, with the exact decimal string `"0"` filling absent (day, currency) pairs. Sessions trends are always fully populated (30 zero-filled buckets) — the chart never receives gaps.

### 4.2 Offline-activation honesty note (verbatim)

> **`gatewayRevenueByCurrency` excludes offline activations.** Subscriptions activated through the offline payment methods (`offline_cash`, `bank_transfer`, `scholarship`) bypass the `student_payments` ledger entirely (offline direct-onboarding payments never produce a payment row — INV-PAY5), so they are structurally absent from every revenue figure. They are reported as their OWN metric — `offlineActivationsCount` (`subscriptions.payment_method IN ('offline_cash','bank_transfer','scholarship')`) — and **mixing the two into one number is prohibited.** "Revenue" on this surface means gateway-settled payments only; "offline activations" is a count of subscriptions, not money.

The excluded trio is the module constant `OFFLINE_ACTIVATION_GATEWAYS = [PaymentGateway.OfflineCash, PaymentGateway.BankTransfer, PaymentGateway.Scholarship]` (`platform-analytics-query-helpers.ts:112-116`); both executor branches bind the identical member set.

### 4.3 Honest-null rating averages

A rating family with zero rated rows reports `null` for its average — **"no ratings yet" is not "rated zero"**. `averageSessionRating` is `null` iff `sessionRatingsCount = 0`; same for the evaluation family. The paired counts expose the sample size. The frontend renders `—` (`NULL_METRIC_PLACEHOLDER`) for a `null` average, never a fabricated `0.00`, and shows the "no ratings recorded yet" empty state.

### 4.4 The one sanctioned numeric conversion (display-only chart pivot)

The recharts bar chart needs numeric plot coordinates. The **single blessed exception** to "money never becomes a number" is `pivotRevenueTrend` (`frontend/views/admin/analytics/platform-analytics-display.ts:94-114`): `Number(amount)` is applied **for plot geometry ONLY** — the numeric value is consumed by recharts' axis scaling/bar height and nothing else. No aggregation, comparison, arithmetic, or rounding ever touches the converted number; the revenue table and every non-geometry consumer keep the wire strings verbatim (`formatMoneyAmount` groups digits by character loop, never constructing a number). Extending this exception to any new consumer requires a documented contract change.

---

## 5. Authorization — the Governed-Admin Service-Tier Divergence

The GraphQL scope tier cannot see governance state (the GraphQL context boundary is documented as NOT fail-closed for governed users — `createGraphQLContext` applies no governance filter at request time). A suspended admin holding a live token would otherwise pass the role scope and read whole-platform aggregates. The surface therefore **diverges from `assertActorAdmin`'s role-only check** and gates via the shared helper **`assertActorAdminActive`** (`backend/services/admin/admin-gate.helpers.ts:107-148`) as the service's FIRST statement (`platform-analytics.service.ts:134-135`), before any transaction opens and before any aggregate read.

**Rationale (the documented amendment):** `assertActorAdmin` (`:59-90`) checks role only — anonymous (`actorId = 0`) → `UnauthorizedError`; absent row → `ForbiddenError`; non-admin → `ForbiddenError`. `assertActorAdminActive` delegates to it verbatim, then RE-reads the actor row and denies governed accounts in the deterministic order **deleted → blocked → suspended** with the existing localized messages (`accountDeleted` / `accountBlocked` / `accountSuspended`), fail-closed on a vanished re-read. Reusing the shared gate (the "single source of gate truth" helper, already consumed by the cold-start service as its first statement) rather than hand-rolling a second ladder keeps the role-check semantics un-forked; the deliberate observable deltas (absent-actor → `FORBIDDEN` not `UNAUTHORIZED`; two pre-transaction actor reads; gate log lines carrying `entity: "user"`) are sanctioned.

Because the resolver passes only `(ctx.user.id, ctx.locale)`, the wire behavior is layered: anonymous/non-admin are denied pre-resolver by the scope (service spy count 0); governed admins pass the scope, the resolver DOES run, and the service gate denies with `FORBIDDEN` + the exact canonical copy — no partial disclosure of aggregate contents on any denial path (`data` is fully nulled; the error item carries exactly `{ extensions, locations, message, path }` with `extensions = { code: "FORBIDDEN" }`).

---

## 6. Read Purity — the No-Write / No-Audit Rule

The surface performs **zero writes on every path**: no `insert`/`update`/`delete`, no `audit_logs` row, no `notifications` row, no cache invalidation, no state mutation of any kind — on the happy path AND on every denial path (denials are logged once via the gate's own bounded `logDomainError` `{ code, entity: "user", entityId[, locale] }` and write nothing). The happy path is structurally silent — the service logs nothing and throws nothing. Freshness comes from reading the database on EVERY request (no server cache, no memoized module state, no shared mutable state); the UI freshens via its 120 s poll. Reading the analytics surface never audits, never notifies, never mutates.

**Proof obligation (locked by tests):** every observed table is byte-identical before/after a read (content digests, not just row counts), with zero audit delta and zero notification delta — see the journey suite (§7) and the service suite's digest-purity tier.

---

## 7. Behavioral Contract — the Journey Suite

The authoritative behavioral contract is the journey suite:

**`test/workflows/admin/platform-analytics.journey.test.ts`** (four journeys A–D):

- **Journey A (cold platform honesty):** no journey fixtures → every metric differs from its direct-DB baseline by exactly zero; both trend series fully populated (30 zero-filled session buckets; skeleton-consistent or honestly-empty revenue); both rating averages honestly `null`.
- **Journey B (full cast observation):** exact baseline-plus-delta per metric across student/teacher/parent activity — currency rows never merge, the governed student is excluded from the active counters, the `awaitingConfirmation` flip is pinned by completed-twin sessions (confirmed vs unconfirmed).
- **Journey C (freshness / anti-cache):** two reads bracket one committed payment + session — the second read exposes exactly the delta and `generatedAt` strictly advances.
- **Journey D (denial & purity matrix):** anonymous → `UnauthorizedError`; absent actor → `ForbiddenError`; non-admin → `ForbiddenError`; governed admins resolve deleted → blocked → suspended (multi-flagged surfaces the deleted message first); every denial and both happy reads leave every observed table byte-identical with zero audit and zero notification residue.

Any change to this surface that breaks a journey assertion is a contract change and must update this document and the suite in the same change set.

---

## 8. What NOT to Do

- **DO NOT add a caching layer.** Fresh read per request is the freshness contract (Journey C fails a cached answer by design). Server-side metric caching is a separately-owned forward item, not an optimization to bolt on here.
- **DO NOT add error codes.** The denial surface is exactly `UNAUTHORIZED` / `FORBIDDEN` with the existing localized messages; the happy path throws nothing.
- **DO NOT add per-entity drill-downs, arguments, filters, or exports to this surface.** The zero-argument closed contract is the BOLA/BOPLA posture; drill-down/detail/CSV are separately-owned forward items. (There is likewise NO LIKE/ILIKE predicate on this surface — so no `escapeLikeWildcards` obligation arises; a future drill-down ticket must re-evaluate that.)
- **DO NOT sum across currencies.** Every currency keeps its own row/point; there is no whole-platform monetary total.
- **DO NOT add `id` to any of the eleven value types.** Aggregate anonymity and the `keyFields: false` embedded-cache posture depend on it.
- **DO NOT re-sample the clock.** One `new Date()` per request; windowed repos take `now` as a parameter — never SQL `now()` inside the predicates, never a second capture mid-request.
- **DO NOT expose timestamps as `String`/`toISOString()`.** `generatedAt` and `bucketStart` ride the registered `DateTime` scalar; the pre-scalar workaround is prohibited on this surface.
- **DO NOT introduce LIKE/ILIKE surfaces or string-interpolated SQL.** Parameterized equality/aggregate predicates only; every `now`-derived bound is a bound parameter; no inline `--` comments inside SQL text; no prepared statements for these dynamic aggregate reads; the one `IN` predicate passes a plain member array.
- **DO NOT mix offline activations into gateway revenue** (§4.2) or a currency's `last30DaysAmount` into another currency's row.
- **DO NOT convert money to `number` for math** — the recharts plot-geometry pivot (§4.4) is the one blessed exception.
- **DO NOT "fix" the 31-day-touch vs 30-bucket skeleton divergence** (§3.2) — it is the documented contract.

---

## 9. Trend Day-Bucket Decoder Contract

`decodeTrendDayBucket` (`backend/db/repo/admin/platform-analytics-query-helpers.ts:179-186`) normalizes a `date_trunc('day', …)` result into the exact midnight-UTC instant its stored wall-clock names. Input is driver-dependent (NOT always a string): on the wired providers (node-postgres via Drizzle, PGlite shim) the pg parser already delivers a `Date` (naive text read CLIENT-LOCALLY for a `timestamp without time zone` source column); pass-through drivers may deliver raw timestamp text. The decoder recovers the wall-clock digits explicitly and rebuilds the instant by **strict ISO parsing** (`…Z`). **An unparseable value THROWS a domain error — never a silent `Invalid Date`** whose `NaN` epoch would collapse a trend into all-zero buckets. The raw (non-tx) executor branches normalize server-side with `AT TIME ZONE 'UTC'` so both branches yield the identical instant under any client timezone. This decoder is shared by both trend readers and exported test-only for its contract tests.

---

## 10. Rollout Summary

DEV3-022c ships:

- `backend/types/admin/platform-analytics.types.ts` — the eleven canonical shapes (root + 10 section/point types), every member `readonly`, no `id`, money as `string`.
- `backend/db/repo/admin/platform-analytics.repository.ts` + `platform-analytics-query-helpers.ts` — ten dumb-reader aggregate methods; dual-branch executor (tx → Drizzle builder; no-tx → raw parameterized `queryDb`; the global `db` is never imported); UTC-only calendar helpers; the trend decoder.
- `backend/services/admin/platform-analytics.service.ts` — gate-first snapshot composition: `assertActorAdminActive` → one `withTransaction` → one captured `now` → eleven reads in one `Promise.all` → trend skeleton assembly (sessions zero-filled; revenue day-major/currency-ascending with `"0"` fills or honestly EMPTY).
- `backend/graphql/pothos/admin/platform-analytics.pothos.ts` — eleven embedded value objects (`t.exposeInt` counters, `t.exposeString` money/currency, `DateTime` by name, the two nullable `Float` averages); `backend/graphql/query/admin/platform-analytics.query.ts` — the zero-argument root field with the `$all` scope conjunction.
- `frontend/graphql/sharedDocuments/admin/platform-analytics.documents.ts` — the closed named-operation document (no `id` selected anywhere); eleven `keyFields: false` cache registrations in `frontend/providers/apollo/apolloCache.ts`.
- `frontend/views/admin/analytics/**` + `app/(dashboard)/admin/analytics/page.tsx` — the guarded admin page and the polling container (120 s, stale-retention, honest `—`/empty states, display-only money formatting).

Tests: repo suite (`backend/db/test/logic/admin/platform-analytics.repository.test.ts`, 32 tests — dual-branch parity, boundary matrix incl. 1ms-before-today exclusion / ISO-Monday / month-start / 24h boundary / 30-day edges, currency split, zero-fill hooks, empty-table honesty), service suite (16 tests — denial matrix with pre-DB repo-spy zero-call proof, single-`now`/single-`tx` pins, digest purity), wire matrix (14 tests — 401/403/`GRAPHQL_VALIDATION_FAILED` + closed-shape pins), and the journey suite (§7). Schema/migration drift = empty (read-only surface).

---

## 11. Related Documents

- Substrate reuse: `docs/admin/user-management.md` — the analytics users section reuses `AdminUserRepository.getStats` verbatim (the ten directory counters; this surface adds only `recentlyActive24h`). The shared governance gate (`assertActorAdminActive`) is the cold-start/user-management "single source of gate truth" helper.
- Error contract: `docs/graphql/error-handling-contract.md`, `docs/graphql/domain-error-extensions-code.md` (`UNAUTHORIZED` ≠ `FORBIDDEN`; boundary masking).
- Gateway & scope rules: `docs/graphql/api-gateway-and-routing.md` (public-operations default-deny), `docs/teachers/applicant-lifecycle.md` §3 (`$all` conjunction hazard).
- SQL conventions: `docs/drizzle/prepared-statements.md` (no prepared statements for dynamic aggregate reads), `docs/drizzle/neon-http-client.md` (dual-branch executor rule).
- Invariants (read-only consumption): `docs/specs/state-machine-invariants.md`; offline-payment bypass: `docs/specs/open-decisions-and-gaps.md` (B.9 / INV-PAY5; B.15 `last_active_at`; B.6/B.7 applicants).
- Journey harness rules: `docs/testing/workflow-journey-tests.md`, `test/workflows/AGENTS.md`.
- Authoritative implementations: `backend/types/admin/platform-analytics.types.ts`, `backend/db/repo/admin/platform-analytics.repository.ts`, `backend/db/repo/admin/platform-analytics-query-helpers.ts`, `backend/services/admin/platform-analytics.service.ts`, `backend/graphql/pothos/admin/platform-analytics.pothos.ts`, `backend/graphql/query/admin/platform-analytics.query.ts`, `frontend/graphql/sharedDocuments/admin/platform-analytics.documents.ts`, `frontend/views/admin/analytics/platform-analytics-display.ts`, `app/(dashboard)/admin/analytics/page.tsx`.
- Behavioral contract: `test/workflows/admin/platform-analytics.journey.test.ts`.
