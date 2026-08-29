# Wave B (review-backend) — Round 4 (confirmation round)

**Reviewer**: independent agent (Round 4) | **Date**: 2026-08-29 | **Scope**: R3-fix verification (`9d25fcc` — WS shutdown drain-window race) + 10-item checklist spot re-check at HEAD + fresh runtime angle (three notification suite runs)

Branch: `feat/dev3-010-real-time-notification-engine-websocket` @ `9d25fcc` (HEAD; clean working tree — `git status --porcelain` empty). No code was changed by the reviewer. Backend delta since Round 3's verified tree (`0e264bd`): exactly `backend/ws/notification-ws-server.ts` (+helper +two re-checks) and `backend/ws/notification-ws-server.test.ts` (+1 test, helper scan fix) — every other backend file (engine, repo, resolvers, transports, idempotency, validation) is byte-identical to the R3-verified state, so R3's full-checklist evidence carries forward; this round re-spot-checked all 10 items with fresh greps anyway.

## R3-Fix Verification (Wave D R3 F1r3 — shutdown drain-window race)

**Verdict: CORRECT and COMPLETE.** All four required properties confirmed at HEAD:

### (a) Re-check placement — PASS

- **Fetch path (4b), post-await**: `notification-ws-server.ts:471` — `const payload = await verifyAccessToken(token);` → null-check (`:472-480`) → **`if (shuttingDown)` re-check at `:488-496`** → userId assertion (`:500-509`) → successful upgrade (`:512`). The re-check is strictly AFTER the only suspension point in the pipeline and BEFORE any upgrade/registration, so a handshake whose verify crossed the shutdown flip can never reach the happy-path upgrade. It routes through `upgradeRejectedHandshake(..., "server shutting down", NOTIFICATION_WS_CLOSE_CODES.shutdown, new Response("Service Unavailable", { status: 503 }))` — upgrade + policy-close `1001` so the client observes the graceful code on the wire (503 plain HTTP only if the listener already refuses upgrades).
- **open() backstop, pre-registration**: `:390-398` — fires BEFORE `evictOldestForUser` / `registry.set` / `indexRegister` (`:399-401`), closing with `NOTIFICATION_WS_CLOSE_CODES.shutdown` ("server shutting down"). This covers the residual window between the fetch-side re-check and `open()` dispatch (e.g., shutdown flipping after fetch's check but before open runs). It sits after the global-cap check (`:379-388`), which is correct priority: during the drain window the registry is already swept + cleared (`registry.clear()` `:606`), so the cap check passes and the backstop is what fires; the backstop's silent close (no log) is consistent with the shutdown sweep's own per-socket close (`:599-605`), which is also unlogged.
- **Flag flip timing makes the window sound**: `shutdown()` sets `shuttingDown = true` synchronously (`:589`) and the IIFE body runs synchronously through the sweep + `registry.clear()` + `connectionsByUser.clear()` (`:599-607`) before its first `await` (`:612`) — so any handshake resuming post-verify after the flag flip observes an already-drained registry, exactly as the (4b) comment claims.

### (b) Helper extraction preserves EXACT rejection semantics — PASS

`upgradeRejectedHandshake(request, server, reason, code, fallback)` (`:647-655`) is `server.upgrade(request, { data: rejectedSocket(reason, code) }) ? undefined : fallback` — token-for-token the pre-extraction inline shape (`if (server.upgrade(...)) return undefined; return fallback`). Compared against the `9d25fcc` diff, all 5 call sites preserve their prior arguments and positions in the pipeline:

| Site (current lines) | reason | close code | HTTP fallback | vs. pre-extraction |
|---|---|---|---|---|
| throttle `:446-454` | `"throttled"` | `throttled` (4429) | 429 "Too Many Requests" | identical |
| no cookie `:459-467` | `"unauthenticated"` | `unauthenticated` (4401) | 401 "Unauthorized" | identical |
| verify null `:472-480` | `"unauthenticated"` | `unauthenticated` (4401) | 401 "Unauthorized" | identical |
| **(4b) shutdown `:488-496`** | `"server shutting down"` | `shutdown` (1001) | 503 "Service Unavailable" | **NEW site** (not a refactor) |
| bad userId `:501-509` | `"unauthenticated"` | `unauthenticated` (4401) | 401 "Unauthorized" | identical |

Pipeline order is untouched (Origin-first CSWSH 403 → throttle → cookie → verify → **(4b)** → userId → upgrade); the Origin rejection (`:434-441`) correctly remains a plain-HTTP 403 outside the helper (socket never upgraded). The rejected-socket path through `open()` (`:362-372` — log `NOTIFICATION_WS_HANDSHAKE_REJECTED` + `ws.close(reject.code, reject.reason)`) is unchanged, so the on-wire behavior of all four legacy sites is bit-identical.

### (c) No new state introduced — PASS

The commit adds zero new module/closure state: the helper is a pure module-level function (parameters only, no captures beyond its arguments); `rejectedSocket` pre-existed (`:637-639`); both new checks read the pre-existing `shuttingDown` flag (`:281`). No new Maps, timers, counters, or config fields.

### (d) New test pins the drain-window 1001 — PASS

`notification-ws-server.test.ts` — "a handshake completing inside the shutdown drain window policy-closes 1001 and never registers": boots with a 600ms drain window (production floor is 500ms; the 120ms harness default would race scheduling), calls `shutdown()` without awaiting, waits 50ms, then connects a raw peer with a fully valid origin + cookie + token and asserts **`closeFrame() === { code: 1001, reason: "server shutting down" }`**, **`connectionCount === 0`**, **`connectionCountForUser(131) === 0`**, then awaits shutdown completion. Confirmed RUNNING and GREEN in this round's suite run (1203ms; the run's log shows the reject path firing: `NOTIFICATION_WS_HANDSHAKE_REJECTED … reason: "server shutting down"`, userId null — i.e., the fetch-side (4b) check is the one exercised; the open() backstop is defense-in-depth for the narrower race). The accompanying test-helper fix in `connectRawPeer` (`:381-390`) is correct: the old code `return`ed unconditionally after searching for the header terminator, so a close frame coalesced into the same TCP segment as the 101 response was never scanned; the fix only returns while the terminator is still absent (`:384` re-check) and falls through to the frame scan otherwise — a pure test-harness correctness fix with no production impact.

## Findings

**ZERO new findings (0 MAJOR, 0 MINOR, 0 INFO).** Confirmation round: the single R3 follow-up commit is verified correct, the checklist holds at HEAD, and all three suites are green. Round 3's three INFO items (F1 receipt cache-value sizing, F2 `evictOldestForUser` O(registry) scan, F3 pothos-layer guard) remain documented in `wave-B-round3.md` and are NOT re-reported; their dispositions (emitter-integration-wave carry-forwards) are unchanged.

## Checklist Evidence (spot re-checks at HEAD `9d25fcc`)

| # | Item | Verdict | Fresh evidence (this round) |
|---|---|---|---|
| 1 | Single-writer rule | **PASS** | `rg -l "schema/notifications/notifications"` non-test backend: only `notification.repository.ts` + `notification.types.ts` (type-only). Engine/repo/resolvers byte-identical to R3's verified tree. |
| 2 | Publish-after-commit | **PASS** | Caller-tx branches (`:352-357`, `:417-422`) return receipts with NO publish; own-commit paths call `publishAfterCommit` strictly after `withTransaction(undefined, …)` ≡ commit (`:367`, `:437`, `:630`); the only `publishFanout` invocation is inside `publishAfterCommit` (`:181`). |
| 3 | tx propagation | **PASS** | All 7 repo methods take `tx?: DBTransaction` last (`:129,150,171,198,232,272,298`); engine threads `txArg` everywhere; only `db.transaction(fn)` opener at the tx helper. |
| 4 | Guarded self-scope updates | **PASS** | `markReadOnce` `.where(and(eq(id), eq(userId)))` returning row-or-null (`:277-279`); `markAllReadForUser` guarded set-UPDATE (`:300-302`). Unchanged since R1. |
| 5 | Bounded sidecar state (incl. registry + index + the NEW helper) | **PASS** | Registry capped (global `1013` / per-user oldest-eviction `4009`, both pre-registration); per-user index maintained at all 5 mutation sites (open `:399-401`, close `:416-419`, eviction `:533-534`, missed-pong `:561-562`, shutdown clear `:606-607`); ONE ping interval (`:553`, cleared on shutdown `:591-593`); throttle 10k drop-oldest; frame cap via `maxPayloadLength`; **the new `upgradeRejectedHandshake` helper is stateless (see (c))** — no growth vector added. |
| 6 | Transports/env-registry parity | **PASS** | `rg "process\.env"` in `backend/services/notifications/**`, `backend/ws/**`, notifications GraphQL (non-test): **0 hits**. |
| 7 | Error taxonomy (D7 carve-out) | **PASS** | Non-test `new Error(` in scope: exactly the 3 dispositioned guards — `fanout-transport.factory.ts:79` (boot/config), `notification-ws-server.ts:579` (boot invariant; line moved 553→579 from the added code), repo `:134` (unreachable). Engine throws only `ValidationError`/`NotFoundError`; idempotency layer throws nothing. |
| 8 | Logging hygiene | **PASS** | `rg "console.(log|warn|error|info|debug)"` in `backend/services/notifications` + `backend/ws` (incl. tests): **0 hits**. All logging via `logger.logDomainError`/`logger.info`; contexts carry codes/ids/connId/userId/reason only. |
| 9 | Resolver thinness | **PASS** | Resolvers absent from `0e264bd..HEAD` diff (unchanged since R3). `rg "emitForUser(s)?\(|publishReceipts\("` outside the engine service: **0 hits** in graphql/app surfaces — no emit-surface reachability (BFLA holds). |
| 10 | Idempotency hashing | **PASS** | `buildEmitClaimKey` (`emit-idempotency.ts:62-70`): sorted-recipient-ids + type + key → `notif:emit:<sha256-hex>`; raw key validated ≤128 chars and never stored/logged; digest stripped on revive. Unchanged since R3. |

## Runtime Confirmation (fresh angle — three suites, run once each this round)

| Suite | Command | Result |
|---|---|---|
| Notifications service (9 files: engine emit/inbox/chaos + 6 realtime) | `bun run test/scripts/run-test.ts backend/services/notifications` | **96 pass / 0 fail** (1218 expect calls, 887ms) — matches expectation |
| WS sidecar (Tiers 1-4) | `bun run test/scripts/run-test.ts backend/ws/notification-ws-server.test.ts` | **25 pass / 0 fail** (84 expect calls, 7.67s) — matches expectation; includes the new drain-window test (pass, 1203ms) |
| DB/repo (3 files) | `bun run test/scripts/run-test.ts backend/db/test` | **56 pass / 0 fail** (222 expect calls, 5.36s) — matches expectation |

Also re-confirmed: TODO/FIXME sweep over non-test backend code — **0 matches**.

## Verdict

**0 new findings.** The Round-3 shutdown-race fix (`9d25fcc`) is verified correct and complete on all four required properties (post-await + pre-registration re-checks, semantics-preserving helper extraction with the 5 sites matching the pre-extraction diff token-for-token, zero new state, and a runtime-green test pinning the drain-window `1001` + never-registers assertions). The 10-item checklist holds 10/10 at HEAD. All three notification suites pass with the expected counts (96/0, 25/0, 56/0).

**Wave B recommendation: CONFIRM closure — the backend review remains closed at Round 4; no blocking defects, no new carry-forwards.** The R3 carry-forward register (R1 F5, R2 F3, R1 F6 + R3 F1, R3 F2, options.cache threading reminder) stands unchanged for the emitter-integration wave.
