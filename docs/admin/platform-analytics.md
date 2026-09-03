# Platform Analytics — Canonical Reference

**Domain:** Admin / whole-platform read model (DEV3-022c)
**Plan:** `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/plan.md` (REQ-080)
**Status:** Implemented and verified

This document is the single canonical reference for the admin platform-analytics surface. Every layer (repo, service, GraphQL, frontend, tests) MUST conform to the contracts described here. All claims are anchored to the shipped code by path; illustrative snippets are NON-authoritative.

---

## 1. Overview

The admin platform analytics dashboard is a **read-only, single-snapshot** view of the whole platform — no tenant scoping, no drill-down, no arguments. One GraphQL query (`adminPlatformAnalytics`) returns the entire snapshot; the UI renders it and nothing else.

- **Route:** `app/(dashboard)/admin/analytics/page.tsx` — a server shell that calls `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/analytics" })`. Anonymous callers are redirected to login; non-admins are redirected to their own role dashboard. The server shell performs **zero data fetching** — the client container fetches the snapshot (120s poll + manual refresh).
- **GraphQL entry point:** `backend/graphql/query/admin/platform-analytics.query.ts` — `adminPlatformAnalytics: PlatformAnalytics!` with **zero arguments** (the closed read contract; nothing is steerable). The scope gate is an `$all` conjunction — BOTH `authenticated` AND `role: [UserRole.Admin]` must hold (the default scope semantics are ANY, which would let a student token through either branch alone). A pre-resolver `ctx.user` null check throws the localized `UnauthorizedError`. The resolver is a thin hive: it passes only `ctx.user.id` + `ctx.locale` to the service.
- **Schema projection:** `backend/graphql/pothos/admin/platform-analytics.pothos.ts` — 11 object types, all fields projecting the service-composed snapshot (no resolve-time data access). **No `id` field anywhere in the subtree** (the root is an anonymous whole-platform value object; Apollo cache registration uses `keyFields: false`, not an id). Money fields are `String!`; `generatedAt`/`bucketStart` ride the registered `DateTime` scalar; the ONLY nullable fields in the subtree are the two rating averages (`Float`, nullable).

## 2. Metric definitions

Exact SQL semantics of every exposed field. "Governance chain" = `coalesce(col, false) = false` over `users.isDeleted` / `suspended` / `isBlocked` — NULL-safe under three-valued SQL logic (a legacy NULL-state row reads as "not set"). All window predicates bind the captured `now` as a **parameter** — never SQL `now()`.

### 2.1 Users (`PlatformAnalyticsUsers`)

| Field | Label (`shared/locale/en/analytics/index.ts`) | Semantics | Anchor |
|---|---|---|---|
| `totalCount` | `totalUsersLabel` | `count(*)` over `users` with **no predicate** — soft delete is the boolean `isDeleted`, not `deleted_at`; governed rows are included in the total | `repo.AdminUserRepository.getStats` (reused) |
| `activeCount` | `activeUsersLabel` | `count(*) filter (where coalesce(isDeleted,false)=false and coalesce(suspended,false)=false and coalesce(isBlocked,false)=false)` | `repo.AdminUserRepository.getStats` |
| `suspendedCount` | `suspendedUsersLabel` | `count(*) filter (where suspended = true)` | `repo.AdminUserRepository.getStats` |
| `blockedCount` | `blockedUsersLabel` | `count(*) filter (where isBlocked = true)` | `repo.AdminUserRepository.getStats` |
| `deletedCount` | `deletedUsersLabel` | `count(*) filter (where isDeleted = true)` | `repo.AdminUserRepository.getStats` |
| `adminsCount` / `teachersCount` / `studentsCount` / `parentsCount` | `adminsCountLabel` etc. | `count(*) filter (where role = '<member>')` — role members bound as plain values `admin` / `teacher` / `student` / `parent` | `repo.AdminUserRepository.getStats` |
| `newThisWeekCount` | `newThisWeekUsersLabel` | `count(*) filter (where createdAt > cutoff)` where cutoff = `Date.now() − 7 days`, computed **inside** the reused DEV3-016 repo (the one read that keeps its own rolling clock — REQ-002 reuse, never edited) | `repo.AdminUserRepository.getStats` |
| `recentlyActive24h` | `recentlyActive24hLabel` | `count(*)` over `users` where `lastActiveAt > now − 24h` AND `lastActiveAt < now` (both bounds strict — the open interval `(now − 24h, now)`; future-dated rows excluded) AND the governance chain | `repo.PlatformAnalyticsRepository.countRecentlyActiveUsers` |

### 2.2 Sessions (`PlatformAnalyticsSessions`)

One single-row aggregate over `session` — `repo.PlatformAnalyticsRepository.getSessionStats`.

| Field | Label | Semantics |
|---|---|---|
| `total` | `totalSessionsLabel` | `count(*)` over `session`, no predicate |
| `today` | `sessionsTodayLabel` | `count(*) filter (where createdAt >= utcDayStart(now))` — UTC-midnight day start |
| `thisWeek` | `sessionsThisWeekLabel` | `count(*) filter (where createdAt >= isoWeekStart(now))` — Monday 00:00 UTC |
| `thisMonth` | `sessionsThisMonthLabel` | `count(*) filter (where createdAt >= utcMonthStart(now))` — UTC 1st of month |
| `scheduled` / `started` / `completed` / `cancelled` / `disputed` | `scheduledSessionsLabel` … | `count(*) filter (where status = <member>)` — `SessionStatus` members: `scheduled`, `started`, `completed`, `cancelled`, `disputed` |
| `awaitingConfirmation` | `awaitingConfirmationLabel` | `count(*) filter (where status = 'completed' AND confirmedByStudentAt IS NULL)` — completed sessions the student has not yet confirmed |

### 2.3 Revenue (`PlatformAnalyticsRevenue`)

| Field | Label | Semantics | Anchor |
|---|---|---|---|
| `gatewayRevenueByCurrency[]` | `currencyHeader` table | One row per `student_payments.currency`: `totalAmount` = `coalesce(sum(amount),0)::text`, `last30DaysAmount` = `coalesce(sum(amount) filter (where createdAt >= now − 30d),0)::text`, `paidPaymentsCount` = `count(*)` — all over rows with `status = 'paid'` (`PaymentStatus.Paid`), `GROUP BY currency`, ordered by currency ascending. Money is an exact decimal string, never a JS number. `paidPaymentsCount` is a per-row COUNT (currency-independent); the UI's aggregate "Paid payments" figure reduces these counts — a count, not a money sum | `repo.PlatformAnalyticsRepository.getRevenueStats` |
| `offlineActivationsCount` | `offlineActivationsLabel` | `count(*)` over `subscriptions` where `payment_method ∈ {offline_cash, bank_transfer, scholarship}` (`PaymentGateway.OfflineCash/BankTransfer/Scholarship`). These activations bypass `student_payments` entirely | `repo.PlatformAnalyticsRepository.countOfflineActivations` |

### 2.4 Subscriptions (`PlatformAnalyticsSubscriptions`)

One single-row aggregate over `subscriptions` — `repo.PlatformAnalyticsRepository.getSubscriptionStats`.

| Field | Label | Semantics |
|---|---|---|
| `total` | `totalSubscriptionsLabel` | `count(*)` over `subscriptions`, no predicate |
| `active` / `pending` / `expired` / `cancelled` / `suspended` | `activeSubscriptionsLabel` … | `count(*) filter (where status = <member>)` — `SubscriptionStatus` members: `active`, `pending`, `expired`, `cancelled`, `suspended` |
| `activeInWindowNow` | `activeInWindowNowLabel` | `count(*) filter (where status = 'active' AND coalesce(startDate, now) <= now AND (endDate IS NULL OR now < endDate))` — a still-`active`-status row whose `end_date` already passed is EXCLUDED (expiry oracle); open-ended subscriptions (`end_date IS NULL`) count when started |

### 2.5 Teachers (`PlatformAnalyticsTeachers`)

One single-row aggregate over the `teacher` role-child table — `repo.PlatformAnalyticsRepository.getTeacherPresenceStats`. Applicants never appear (no `teacher` row); `= true` predicates never match NULL.

| Field | Label | Semantics |
|---|---|---|
| `certifiedCount` | `certifiedTeachersLabel` | `count(*) filter (where isApproved = true)` |
| `evaluatorCount` | `evaluatorTeachersLabel` | `count(*) filter (where isEvaluator = true)` |
| `onlineNowCount` | `teachersOnlineNowLabel` | `count(*) filter (where isApproved = true AND isOnline = true)` — certified AND online |

### 2.6 Ratings (`PlatformAnalyticsRatings`) — honest nulls

`repo.PlatformAnalyticsRepository.getRatingStats` — two families, resolved separately.

| Field | Label | Semantics |
|---|---|---|
| `averageSessionRating` | `averageSessionRatingLabel` | `round(avg(studentRatingByTeacher)::numeric, 2)::float8` over `reports` — **`number \| null`**: `null` when zero non-null ratings exist (0–5 CHECK band) |
| `sessionRatingsCount` | `sessionRatingsCountLabel` | `count(studentRatingByTeacher)` — counts non-null values only |
| `averageEvaluationScore` | `averageEvaluationScoreLabel` | `round(avg(score)::numeric, 2)::float8` over `evaluations` where `coalesce(isDeleted, false) = false` — **`number \| null`** when the family is empty (0–100 CHECK band) |
| `evaluationScoresCount` | `evaluationScoresCountLabel` | `count(score)` — non-null values only |

### 2.7 Operational health (`PlatformAnalyticsHealth`)

| Field | Label | Semantics | Anchor |
|---|---|---|---|
| `pendingDisputes` | `pendingDisputesLabel` | `count(*)` over `session` where `status = 'disputed'` (`SessionStatus.Disputed`) | `repo.PlatformAnalyticsRepository.getHealthIndicators` |
| `pendingWithdrawals` | `pendingWithdrawalsLabel` | `count(*)` over `teacherTransaction` where `type = 'withdrawal'` (`TransactionType.Withdrawal`) AND `status = 'pending'` (`TransactionStatus.Pending`) | `repo.PlatformAnalyticsRepository.getHealthIndicators` |

### 2.8 Trends

| Field | Semantics | Anchor |
|---|---|---|
| `sessionTrendDaily[]` (30 × `{bucketStart: DateTime!, sessionCount: Int!}`) | Sparse daily counts from `repo.PlatformAnalyticsRepository.getSessionDailyTrend` (`createdAt >= trendSkeletonCutoff(now)` = midnight UTC of `now`'s day − 29d, the OLDEST skeleton bucket; `date_trunc('day', createdAt)`, `GROUP BY` day) merged over the service-built 30-bucket skeleton — the cutoff alignment means every selected row maps 1:1 into a bucket (the merge can never drop a row), and a day with no sessions is an honest `0`, never a missing bucket | `repo.getSessionDailyTrend` + `PlatformAnalyticsService.buildDailySkeleton` / `mergeSessionTrend` |
| `revenueTrendDaily[]` (`{bucketStart: DateTime!, currency: String!, amount: String!}`) | Sparse (day, currency) paid rows from `repo.PlatformAnalyticsRepository.getRevenueDailyTrend` expanded per (day, currency) over the currency set discovered IN the window, `amount: "0"` for absent pairs, ascending byte order per bucket | `repo.getRevenueDailyTrend` + `PlatformAnalyticsService.expandRevenueTrend` |

## 3. Snapshot contract (single `now`, one transaction)

- `now` is captured **exactly once** per request (`const now = new Date()` inside `composePlatformAnalyticsSnapshot`) and shared by every window predicate AND `generatedAt` (REQ-011). The repositories stay clock-free — the service owns time and binds it in as a parameter (D2/REQ-026).
- **Scope of the guarantee (Fix-C):** the single-`now` contract covers the ten platform-analytics reads, the trend skeleton, and `generatedAt`. The ONE documented exception is `AdminUserRepository.getStats`'s internal `newThisWeekCutoff` (`Date.now() − 7 days`, §2 first row): the DEV3-016 repository keeps its own rolling clock inside that counter because editing it was plan-prohibitive (REQ-002 reuse-not-rebuild / protected path). The divergence is bounded to the instant a week boundary is crossed — a request that starts milliseconds before/after a Monday boundary may classify `newThisWeekCount` against a cutoff up to those milliseconds apart from the snapshot's `now`. Every OTHER window predicate in the snapshot shares the one captured `now`.
- All **11 reads** compose in ONE transaction via `withTransaction(outerTx, tx => …)` and a single `Promise.all` over the SAME `tx`: `AdminUserRepository.getStats(tx)` (verbatim REQ-002 reuse) + the ten `PlatformAnalyticsRepository` methods (REQ-040 — mixed `tx`/`db` access is prohibited). Repo methods branch on `tx ?? db`, so the transaction executor flows through unchanged.
- Trend skeletons (`buildDailySkeleton`) are derived from the same captured `now`, so the counters, the trends, and `generatedAt` describe one coherent instant.

## 4. UTC boundary rulings (REQ-024)

- **Day** = midnight UTC: `repo.utcDayStart` = `Date.UTC(y, m, d)` of the captured instant.
- **ISO week** starts Monday 00:00 UTC: `repo.isoWeekStart` = day start minus `(getUTCDay() + 6) % 7` days (Sunday maps back 6 days).
- **Month** = UTC 1st 00:00: `repo.utcMonthStart` = `Date.UTC(y, m, 1)`.
- **24h window** = the open interval `(now − 24h, now)` with BOTH bounds strict (`lastActiveAt > cutoff AND lastActiveAt < now`) — future-dated rows are excluded, and a row stamped exactly at either bound never counts.
- **30-day trend** = `createdAt >= trendSkeletonCutoff(now)` (midnight UTC of `now`'s day − 29 days — the OLDEST skeleton bucket; bound cutoff), bucketed by `date_trunc('day', …)` into 30 consecutive UTC-midnight buckets, the LAST being `now`'s own day — built by the service's `buildDailySkeleton` and zero-filled/expanded there (D6: the repo stays a dumb read). The cutoff is aligned to the skeleton so every selected row maps 1:1 into an output bucket — no partial-oldest-bucket row can be silently dropped. (`getRevenueStats.last30DaysAmount` keeps its trailing-30-day FILTER sum semantics — a scalar, not bucketed.)
- **Decoding:** pg delivers `timestamp without time zone` as raw text; `UTC_TIMESTAMP_DECODER` (attached to both `date_trunc` projections) normalizes BOTH driver behaviors at the single decoder point — raw text is reassembled through `Date.UTC` (the exact inverse of the truncation), and a driver `Date` payload is re-projected through its LOCAL wall-clock day onto the same UTC-midnight epoch — so buckets are UTC instants regardless of driver behavior or server-clock drift, and the service's skeleton join is a pure epoch identity.

## 5. Money & currency rules

- **Money-as-string:** every amount is `coalesce(sum(amount),0)::text` / `sum(amount)::text` — an exact decimal string end-to-end (REQ-014). The backend never parses amounts to `number`; the single documented exception is the presentation boundary, where chart rendering parses the string for a y-axis point (the string remains the system of record).
- **Currency containment:** every revenue aggregation `GROUP BY currency` (and `(day, currency)` for the trend). Cross-currency sums are structurally impossible — no total field exists in the schema (REQ-023). The per-currency `paidPaymentsCount` is a COUNT; the only cross-row reduction the UI performs on it is a count of payments, not money.
- **Honest-empty array:** when no paid payment exists in the 30-day window, `gatewayRevenueByCurrency` is `[]` and `revenueTrendDaily` is `[]`; the UI renders `noRevenueYet` — never a fabricated zero row.
- **VERBATIM (REQ-015 / B.9 / INV-PAY5):** `gatewayRevenueByCurrency` EXCLUDES offline activations (offline cash, bank transfer, scholarship) because offline direct-onboarding payments bypass `student_payments` entirely; `offlineActivationsCount` is a separate honest counter. Mixing the two into one number is PROHIBITED.

## 6. Honest nulls (REQ-018/060)

Rating averages are `number \| null` at every layer (repo → types → GraphQL nullable `Float`). An empty rating family renders the `noRatingsYet` / `—` states from the `analytics` namespace — never a fabricated `0.00`. Counts (`sessionRatingsCount`, `evaluationScoresCount`) are always present `Int`s counting non-null values only.

## 7. Read purity (REQ-022)

The surface writes NOTHING. The service contains no write call by construction: no audit rows, no notifications, no domain logs on the happy path (a successful snapshot emits ZERO `logDomainError`). The only log emission on the entire surface is the single bounded denial log per denied reader (§8). Behavioral proof: `test/workflows/admin/platform-analytics.journey.test.ts` Journey D asserts whole-suite byte-identity — table deltas of zero across `audit_logs` and `notifications` around every read.

## 8. Governed-admin divergence (D8 / REQ-032)

The service re-verifies the actor at the SERVICE tier even when the GraphQL scope gate passed. `assertPlatformAnalyticsReader` re-fetches the row via `UserRepository.findById` and resolves denials in the deterministic pre-DB order (REQ-054): anonymous/malformed actor id → absent row (`UNAUTHORIZED`), then non-admin → deleted → blocked → suspended (`FORBIDDEN`, localized `accountDeleted`/`accountBlocked`/`accountSuspended`). Each denial emits exactly ONE `logger.logDomainError` with `{ code, entity: "users", entityId, locale }` — ids and codes only, never metric payloads — and performs zero aggregate reads and zero writes.

**Rationale:** `createGraphQLContext` applies NO governance filter at request time (the documented non-fail-closed GraphQL context window), so a live-token admin deleted/blocked/suspended mid-session would otherwise keep reading whole-platform aggregates. The service-tier re-check is the deliberate divergence from the role-only `assertActorAdmin` gate, accepted at D8.

## 9. Snapshot-consistency ruling (D11 / REQ-041)

**Statement-level consistency is accepted.** A row committed between two aggregate statements of one request may surface in one counter and not another; for a read-only monitoring surface this is never a correctness violation. `REPEATABLE READ` is REJECTED: raising isolation conflicts with the connection-pool + `drizzle-transaction` composition and buys a longer snapshot a dashboard does not need — a dashboard is not a ledger. The ruling is documented here rather than hidden in configuration.

## 10. What NOT to do

- **No caching layer.** Reads are fresh per request; any cache variant is the forward-owned D-1 item, not an ad-hoc addition.
- **No new error codes.** Denials reuse the existing localized `unauthorized` / `forbidden` / `accountDeleted` / `accountBlocked` / `accountSuspended` messages.
- **No per-entity drill-downs or CSV export on this surface** (D-2 — forward-owned UX ticket).
- **No cross-currency sums**, anywhere, ever (REQ-023); no merging of `offlineActivationsCount` into revenue (REQ-015).
- **No `id` field on any of the 11 value objects** (D10 — the root is an anonymous aggregate; cache identity is `keyFields: false`).
- **No `now()` re-sampling** — no SQL `now()`, no second `new Date()` per window; ONE captured `now` per request (REQ-011).
- **No `.toISOString()` hand-serialization in the backend** — timestamps ride the `DateTime` scalar (REQ-068).
- **No LIKE/ILIKE surfaces** — the repo binds parameters only; there is no search input and no `escapeLikeWildcards` obligation (REQ-035).
- **No public exposure** — `backend/lib/gateway/public-operations.ts` (the frozen six) is untouched; `adminPlatformAnalytics` stays behind the admin gate.

## 11. Behavioral contract

`test/workflows/admin/platform-analytics.journey.test.ts` is the behavioral contract — four journeys:

- **Journey A** — cold platform honesty (baseline + 0 counts).
- **Journey B** — full cast observation (exact per-metric deltas against independently computed SQL oracles).
- **Journey C** — freshness evolution (anti-cache proof: successive reads change with the data).
- **Journey D** — denial & purity matrix (service-tier governance denials in order, one bounded log per denial, byte-identity purity finale).

Companion suites: repository specs (real PostgreSQL, zero mocks, delta oracles), service specs, the GraphQL wire matrix (`backend/graphql/test/platform-analytics.query.test.ts`), and the SDL/schema-surface pins (`sdl-static-assertions.test.ts`, `schema-surface.test.ts`).

## 12. Forward-owned items

`ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/deferred-items.md` tracks the four forward-owned entries — D-1 caching variant, D-2 drill-down/CSV, D-3 bespoke analytics rate limiter, D-4 trend covering index. None is debt in this plan; none may be pulled into this surface without reopening the plan.
