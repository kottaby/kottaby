# Wave B (review-backend) — Round 1

**Reviewer**: independent agent | **Date**: 2026-08-29 | **Scope**: backend service & infra rules

Branch: `feat/dev3-010-real-time-notification-engine-websocket` @ `79f2900`. All evidence below was read directly from the working tree on this branch; no code was changed.

## Findings

### F1 — MAJOR (latent) — Caller-tx idempotency claims are consumed but the receipt is never stored, so keyed emits on the tx path can never dedupe

- **Location**: `backend/services/notifications/notification-engine.service.ts:341-344` (`emitForUser` tx path), `:400-403` (`emitForUsers` tx path), `:442-448` (`publishReceipts`), `backend/services/notifications/emit-idempotency.ts:90-97`
- **Evidence (control flow)**:
  - `claimOrPriorReceipt` runs BEFORE the insert on BOTH paths (engine `:331`, `:391`) — the SET-NX-EX claim is consumed even when `tx` is supplied.
  - The tx branches (`:341-344`, `:400-403`) return the receipt immediately with NO `storeEmitReceiptQuietly` call; `storeEmitReceiptQuietly` appears only on the own-commit branches (`:351-355`, `:412-417`).
  - The caller's sanctioned post-commit step, `publishReceipts` (`:442-448` → `publishReceiptsFromIndex` `:579-594`), only publishes — it has no receipt-store step, and no other exported API stores a tx-path receipt.
  - Consequence on replay (same key/cohort/type within the 24h TTL): `attemptEmitClaim` (`emit-idempotency.ts:90-97`) gets `claim → false`, `get(key) → null`, logs `"claim held, but no replayable receipt was readable"` and returns `unavailable` → fail-open → **duplicate insert**.
- **Rule violated**: REQ-016 contract "duplicate claim → return the PRIOR receipt" is systematically unsatisfiable for tx-owning emitters; the engine docblock at `:373-375` ("The idempotency receipt is only ever STORED after a durable commit…") implies a post-commit store exists for the tx path, but none does. Plan D3/§4.1 (`plan.md:95`, `:325-326`, `:343`) defines `publishReceipts` as publish-only and never specifies a tx-path store — the gap is unplanned, not documented as a deviation.
- **Impact today**: inert — no production claim-cache adapter exists (see F5) and no production emitter calls the emit surface yet; behavior equals the documented D5 fail-open worst case. **Impact once an adapter + tx-owning emitters ship**: `idempotencyKey` on the tx path silently provides zero dedupe (plus a warn log per replay) while the claim is still consumed.
- **Suggested disposition**: either (a) extend `publishReceipts` (or a sibling post-commit step) to also `storeEmitReceiptQuietly` for receipts carrying a claim, or (b) document explicitly that `idempotencyKey` is own-commit-path-only (reject or ignore it when `tx` is supplied).

### F2 — MINOR — Plain `new Error(` in `backend/services/notifications/realtime/**` (checklist item 7 literal violation)

- **Location**: `backend/services/notifications/realtime/fanout-transport.factory.ts:79-81`
- **Evidence**: `throw new Error('NOTIFICATION_FANOUT_TRANSPORT="redis" requires REDIS_URL to be set — add it to .env (see .env.example).')` — the only non-test `new Error(` in `backend/services/notifications/**` (`rg -n "new Error\(" backend/services/notifications --glob '!**/*.test.ts'` → 1 hit).
- **Rule violated**: checklist item 7 as written ("zero plain `new Error(` in `backend/services/notifications/** + `backend/ws/**` outside test files").
- **Calibration**: this is a boot-time misconfiguration fail-fast (never a request-path domain condition); it matches the plan's own carve-out ruling (outcome `3.1-outcome.md` D-7: "The DomainError-subclass rule governs resolver-level domain conditions… not these mapping guards") and the `registration.service.ts:335,426` exhaustive-guard precedent. Surfaced because the Wave-B rule text has no written carve-out for the notifications surface.

### F3 — MINOR — Plain `new Error(` in `backend/ws/**` (checklist item 7 literal violation)

- **Location**: `backend/ws/notification-ws-server.ts:494`
- **Evidence**: `throw new Error("Notification WS sidecar started without a TCP port (unix-socket mode is not supported).")` — the only non-test `new Error(` in `backend/ws/**` (`rg -n "new Error\(" backend/ws` → production hits: line 494 only; remainder are `.test.ts` harness guards).
- **Rule violated**: checklist item 7 as written (same class as F2 — a boot invariant thrown before the sidecar serves anything; the GraphQL boundary finalizer would mask it to `INTERNAL_SERVER_ERROR` anyway, and the sidecar is not a GraphQL surface at all).

### F4 — INFO — Plain `new Error(` in the repository layer (outside item 7's grep scope, noted for taxonomy completeness)

- **Location**: `backend/db/repo/notifications/notification.repository.ts:134`
- **Evidence**: unreachable-guard `throw new Error("NotificationRepository.createReturning: insert returned no rows")`. The repo's own AGENTS contract (file header `:18-20`) says raw errors propagate for the service layer to translate; consistent with the F2/F3 precedent class. No action requested.

### F5 — INFO — Emit surface + idempotency cache have zero production consumers today

- **Evidence**: `rg -n "emitForUser|emitForUsers|publishReceipts|NotificationIdempotencyClaimCache" backend --glob '!**/*.test.ts'` → matches only inside `notification-engine.service.ts` and `emit-idempotency.ts` (definitions/uses); no domain service, workflow, or resolver calls them. No production implementation of `NotificationIdempotencyClaimCache` exists (`backend/services/redis/` is README-only per plan A1). Consequence: keyed emits currently run fail-open with a warn by construction, and F1 cannot yet manifest. Consistent with the plan's phasing, but later waves adding emitters must revisit.

### F6 — INFO — Idempotency cache VALUES carry notification copy (title/body) for 24h

- **Location**: `backend/services/notifications/emit-idempotency.ts:112-135` (`storeEmitReceiptQuietly` → `serializeEmitReceipt` = `JSON.stringify(receipt)` of full rows incl. `title`/`body`).
- **Evidence**: the checklist rule (item 10) governs the KEY only — and the key rule holds (see checklist row 10). Storing the receipt value is required by REQ-016's "duplicate → return the PRIOR receipt". Noting only that once a Redis adapter ships, notification copy will live in Redis values for the claim TTL; if that is ever a data-residency concern it needs its own ruling (out of Wave-B scope).

## Checklist Evidence

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Engine single-writer rule | **PASS** | Table `pgTable("notifications", …)` at `backend/db/schema/notifications/notifications.ts:27-28`. Production importers of the table: `rg -n "schema/notifications/notifications" backend` → only `notification.repository.ts:25` (+ type-only import in `types/notifications/notification.types.ts:1`; all other hits are `*.test.ts`). Raw-SQL writes: `rg -in "insert into notifications\|update notifications set\|delete from notifications" backend --glob '!**/*.test.ts'` → 0 hits. Drizzle-builder writes outside repo/engine: `rg -n "\.insert\(notifications\)\|\.update\(notifications\)\|\.delete\(notifications\)" backend` (excluding repo/services/tests) → 0 hits. `NotificationRepository` consumers in production code: only `notification-engine.service.ts` (lines 342, 348, 401, 407, 483, 484, 501, 534, 574). No seed script references the table. |
| 2 | Publish-after-commit ordering | **PASS** | The ONLY `publishFanout` invocation in the engine is `notification-engine.service.ts:179` inside `publishAfterCommit` (`:171-188`). Its call sites: `:357` and `:421` — both strictly AFTER `await withTransaction(undefined, …)` (`:348`, `:407`), where `withTransaction(undefined, fn)` = `db.transaction(fn)` (`:108-116`) which resolves only on COMMIT (drizzle/pg semantics); and `:591` inside `publishReceiptsFromIndex`, reachable only via `publishReceipts` (`:442-448`) — the caller-invoked post-commit publisher. Caller-tx branches (`:341-344`, `:400-403`) `return` the receipt with no publish call on any path. The interleaved `storeEmitReceiptQuietly` (`:351-355`, `:412-417`) is also post-commit and precedes the publish — ordering intact. |
| 3 | tx propagation | **PASS** | All 7 repo methods take `tx?: DBTransaction` LAST: `createReturning` (`notification.repository.ts:127-130`), `createManyReturning` (`:148-151`), `countUnread` (`:171`), `countForUser` (`:195-199`), `listForUser` (`:227-233`), `markReadOnce` (`:269-273`), `markAllReadForUser` (`:295-299`). Engine threads `tx`/`txArg` into every repo call (see row-1 line list) and into every inbox read; the engine's only `db` handle use is `db.transaction(fn)` at `:115` (opening the own-commit unit) — no direct table access bypassing the repo. |
| 4 | Guarded self-scope updates | **PASS** | `markReadOnce`: single guarded UPDATE `.where(and(eq(notifications.id, id), eq(notifications.userId, userId)))` returning row-or-null (`notification.repository.ts:274-279`). `markAllReadForUser`: `.where(and(eq(notifications.userId, userId), eq(notifications.isRead, false) [, eq(type)]))`, affected-row count, no RETURNING (`:300-309`). Foreign ≡ nonexistent (zero rows → `NotFoundError("NOTIFICATION")` at engine `:534-543`). |
| 5 | Bounded sidecar state | **PASS** | `notification-ws-server.ts`: registry `Map` capped by global cap in `open()` (`:325-334`, close `1013`) + per-user cap with OLDEST-connection eviction (`evictOldestForUser` `:437-457`, close `4009`) BEFORE `registry.set` (`:336-337`); ping cadence `WS_PING_INTERVAL_MS = 30_000` (`:61`) with `WS_MISSED_PONG_LIMIT = 2` (`:64`) and Bun auto-ping disabled (`sendPings: false` `:298`); ONE `setInterval` timer (`:469-488`); `HandshakeThrottle.buckets` bounded by `WS_THROTTLE_MAX_TRACKED_IPS = 10_000` with drop-oldest eviction (`:73`, `:203-208`); per-tick `terminated` array bounded by registry size (`:470-483`); `allowedOrigins` Set from static config (`:260`). No other array/map growth vectors in the file (full read). |
| 6 | Transports/env-registry parity | **PASS** | Factory imports ONLY `getNotificationFanoutTransport` + `getRedisUrl` from `@/backend/lib/env` (`fanout-transport.factory.ts:16`, used at `:68`, `:77`); WS server imports only the five `getWebSocket*` getters (`notification-ws-server.ts:43-49`, used at `:139-143`). `rg -n "process\.env" backend/ws backend/services/notifications/realtime` → hits ONLY in `notification-ws-server.test.ts` and `fanout-transport.factory.test.ts` (env-manipulating test fixtures); zero in production files. `ioredis-fanout-client.ts` receives its URL via constructor injection (`:26`). |
| 7 | Error-taxonomy compliance | **PASS with findings (F2, F3)** | The engine proper throws ONLY `DomainError` subclasses: `ValidationError` (engine `:226/:236/:254/:265/:269/:531`, emit-validation `:56` `fail()`) and `NotFoundError` (`:542`); `emit-idempotency.ts` throws nothing (fail-open). Non-test `new Error(` in scope: exactly 2 — `fanout-transport.factory.ts:79` (F2) and `notification-ws-server.ts:494` (F3), both boot/config guards per the codebase's D-7 precedent (`3.1-outcome.md`), outside the request path. |
| 8 | Logging hygiene | **PASS** | `rg -n "console\.(log\|warn\|error\|info\|debug)" backend/services/notifications backend/ws` → 0 hits (services grep also excluded tests: 0). All production logging is `logger` from `@/backend/lib/logger`. `logDomainError` contexts spot-checked: engine `:181-186` `{code, entity, locale, errorName}`, `:536-541` `{code, entity, entityId, locale}`; idempotency `:126-129`, `:248-252` `{code, entity[, errorName]}`; redis transport `:75-78`, `:84-88` `{code, entity[, errorName]}`; ioredis client `:38-42`; ws server `:280-286`, `:309-315`, `:326-332` `{code, entity, reason, connId, userId}` where `reason` is fixed vocabulary ("origin"/"throttled"/"unauthenticated"/"overloaded"). No titles, bodies, recipient lists, or raw idempotency keys in any log context. |
| 9 | Resolver thinness | **PASS** | `notification.query.ts` imports: builder, 2 pothos types, `UnauthorizedError`, `NotificationEngine` + default-limit constant (`:43-50`); both resolves are single delegations (`:77-86`, `:106`). `notification.mutation.ts` imports: builder, 2 pothos types, `UnauthorizedError`, `isPositiveSafeInt`, `NotificationEngine` (`:50-55`); bodies delegate to `markRead`/`markAllRead` (`:118`, `:144`). No repository imports, no emit-surface imports (`emitForUser`/`emitForUsers`/`publishReceipts` unreachable from GraphQL — BFLA holds); the only logic is the documented ID wire-form coercion (`parseNotificationIdArg` `:81-90`), which rejects to the engine's ValidationError. |
| 10 | Idempotency hashing | **PASS** | `buildEmitClaimKey` (`emit-idempotency.ts:67-71`): sorts recipient ids, builds `"<ids>:<type>:<key>"`, returns `notif:emit:<sha256-hex>` — only the digest is passed to `claim`/`store`/`get`. Raw `idempotencyKey` never appears in any log context (row-8 evidence) and is never persisted; cache VALUES are serialized receipts (F6 notes they carry copy — by design for REQ-016 replay). |

## Verdict

**6 new findings: 1 MAJOR (latent, F1), 2 MINOR (F2, F3), 3 INFO (F4, F5, F6).**

Checklist: 9/10 PASS clean; item 7 PASS only with the two literal-scope MINORs noted (F2/F3 — boot/config guards dispositioned by the plan's own D-7 precedent but not carved out in the Wave-B rule text).

Recommended next actions: (1) disposition F1 before any emitter adopts `tx` + `idempotencyKey` (extend `publishReceipts` to store receipts, or document keys as own-commit-only); (2) either add an infra-error carve-out to the Wave-B taxonomy rule or convert F2/F3 to a `DomainError`-adjacent config-error class; (3) carry F5 forward to the emitter-integration wave as a re-check trigger.
