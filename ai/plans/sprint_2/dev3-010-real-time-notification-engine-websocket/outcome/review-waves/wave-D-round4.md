# Wave D (pentester) — Round 4 (confirmation round)

**Reviewer**: independent adversarial agent | **Date**: 2026-08-29 | **Scope**: security — final confirmation sweep on the R3 shutdown fix

Branch: `feat/dev3-010-real-time-notification-engine-websocket` @ `9d25fcc` (HEAD **is** the fix commit — `git diff 9d25fcc..HEAD` empty). Static analysis + reasoning only (no live attacks, no code changes, no commits). `wave-D-round3.md` read first; documented residuals are **not re-reported**: D8 (`jwt.ts` `Number.parseInt` `sub` — re-verified unchanged this round, ~`jwt.ts:157`), D9 posture items, unbounded-envelope/trusted-bus INFO residuals (F1r2/F2r2), and F1r3 itself (now fixed — attacked below).

**Tree delta since the R3-verified tree (`0e264bd`)** (verified via `git show 9d25fcc --stat`): `backend/ws/notification-ws-server.ts` + its test (the F1r3 fix), five frontend view files (focus-visible `focusVisibleRingSx` style spreads only — diff inspected line-by-line: zero new handlers/DOM APIs/content sinks), and the four R3 review docs. **`backend/services/**`, `backend/graphql/**`, `backend/db/**`, `backend/lib/**` are bit-identical to the R3-verified tree**, so the R3 checklist grounding carries forward; every item below was additionally spot-grepped fresh at HEAD.

## Part 1 — Attacking the shutdown fix (F1r3 → `9d25fcc`)

Full re-read of `notification-ws-server.ts` at HEAD + hunk-by-hunk diff scrutiny. Four mandated sub-attacks:

### (a) Can a socket STILL register post-`registry.clear()`? — **NO (fix holds)**

Two independent gates, and the second one is airtight:

1. **fetch (4b) re-check** (`:482-496`): the only suspension point in the pipeline is `await verifyAccessToken(token)` (`:471`); the new re-check runs immediately after it. A handshake completing while `shuttingDown === true` is diverted into `upgradeRejectedHandshake(…, NOTIFICATION_WS_CLOSE_CODES.shutdown, 503-fallback)` → `open()` sees `reject ≠ null` and policy-closes — it never reaches the register path.
2. **`open()` backstop** (`:390-398`): the decisive property — from `if (shuttingDown)` through `registry.set(connId, …)` (`:400`) and `indexRegister` (`:401`) the code is **fully synchronous (zero `await`)**. On a single-threaded runtime, once `open()` passes the check, registration completes atomically; nothing can interleave. Combined with `shuttingDown = true` executing **strictly before** the sweep/close/`clear()` sequence (`:589` → `:599-607`), every ordering is covered:
   - `open()` runs **before** the flag flips → registers → is swept by the `1001` close loop (`:599-605`).
   - `open()` runs **after** the flag flips → sees the backstop → closes `1001`, registers nothing.
   - fetch passes (4b) with flag false, flag flips before `open()` fires → backstop catches it.
   - `open()` never fires (reaped by `stop(true)`) → nothing registered.

   **No code path exists that registers into the drained registry.** Residual micro-window between (4b) and `open()` is closed by the backstop itself (verified by reading, not testable deterministically — noted in (d), not a finding).

### (b) Close-code vocabulary match — **CONFIRMED `1001`**

`NOTIFICATION_WS_CLOSE_CODES.shutdown = 1001` (`:93-103`), matching the documented contract verbatim (header `:23-25`: `1001` server shutting down). Used consistently at all three shutdown-close sites: sweep (`:601`), `open()` backstop (`:396`), (4b) rejection (`:493`). The reason string `"server shutting down"` is identical at all three. An exact-vocabulary test pins the whole map (`notification-ws-server.test.ts:477-484`: `4401/4429/4009/1013/1001`).

### (c) `upgradeRejectedHandshake` extraction — **NO reordering; Origin still FIRST**

Pipeline at HEAD, verified by full read: upgrade-header (`:425`) → **(1) Origin allowlist FIRST (`:430-441`)** → (2) throttle (`:443-454`) → (3) cookie (`:456-467`) → (4) verify (`:469-480`) → **(4b) post-await shutdown re-check (`:482-496`)** → (5) userId (`:498-509`) → (6) upgrade (`:511-515`). The helper (`:647-655`) replaced the five previously-inline rejection blocks with **identical** `(reason, code, fallback)` triples — checked against the pre-fix diff hunk-by-hunk: `throttled/4429/429`, `unauthenticated/4401/401` (×3), new `server shutting down/1001/503`. Critically, the **Origin rejection does NOT use the helper** — it keeps the plain HTTP 403 path (socket never upgraded), the strongest CSWSH posture, unchanged. The (4b) insertion sits exactly at the correct position (immediately after the suspension point), not before it. No reorder, no semantic drift; the helper itself only calls `server.upgrade` + `rejectedSocket` (randomUUID connId, fixed-vocab reason) — no new surface.

### (d) Drain-window test wire-level pin — **GENUINE**

`notification-ws-server.test.ts` (new Tier-2 test): boots with `shutdownDrainTimeoutMs: 600` (production floor 500ms widened for determinism), calls `server.handle.shutdown()` **without awaiting** (flag flips synchronously; sweep + clear run immediately; listener still accepting through the window), sleeps 50 ms (deterministically mid-drain), then a **raw-TCP peer** (`connectRawPeer`, `:355-412`) performs a real hand-written HTTP upgrade with valid `Origin` + `Cookie: access_token=<minted token>` and **parses the close frame from wire bytes** (scan for opcode `0x88` after the 101 header terminator, `readUInt16BE` code, utf8 reason). This is genuinely wire-level — the harness comment (`:349-353`) explains why it must be: *Bun's native WS client surfaces 1001 as 1000*, so wire bytes are the ground truth. Assertions: `closeFrame() === { code: 1001, reason: "server shutting down" }`, `connectionCount === 0`, `connectionCountForUser(131) === 0`, then `await shutdownPromise` (clean completion). The accompanying harness fix (`:384-390` — fall-through when the `\r\n\r\n` terminator and the coalesced close frame land in the same TCP chunk) repaired a real parsing bug that would have made the assertion miss on segment coalescing — evidence the pin is load-bearing, not vacuous. *Observation (not a finding):* the test deterministically exercises the (4b) fetch-path rejection (flag already set at handshake arrival); the `open()`-backstop micro-window (flag flipping between (4b) and `open()`) is not deterministically reachable in a test and rests on the source-level sync proof in (a).

## Part 2 — Last fresh angles

### (a) Committed secrets in notification test files — **CLEAN**

Greps run across all notification-path files: API-key/private-key/token-literal patterns (`sk-…`, `AKIA…`, `-----BEGIN PRIVATE KEY`, `xox…`, `ghp_…`, long `eyJ…` JWT literals) → **zero matches**; `password`/`api[_-]?key`/long token literals in `backend/services/notifications/**/*.test.ts` → **zero matches**. The only secret-adjacent fixture is `deriveTestAccessSecret` (`notification-ws-server.test.ts:133-138`), which mirrors the **documented dev fallback** (`getEnv("DATABASE_ENCRYPTION_KEY") ?? "dev-only-insecure-fallback-secret"`, same derivation as `backend/lib/auth/jwt`) — an explicitly-labeled dev-only value matching the seeded-demo-credential carve-out, not a real secret. All test tokens are **minted at runtime** via real `signAccessToken` — no committed token literals anywhere.

### (b) `emitClaimKey` digest — **sha256 CONFIRMED**

`buildEmitClaimKey` (`emit-idempotency.ts:67-70`): `notif:emit:${createHash("sha256").update(identity).digest("hex")}` — `node:crypto` **sha256**, hex digest. Repo-wide hash-algorithm grep over `backend/**`: only `sha256` usages (notification emit path + migration manifest); **zero md5/sha1 anywhere in the notification path**. Raw idempotency key still never leaves the digest boundary.

### (c) Redis channel name — **FIXED CONSTANT, not attacker-influenced**

`NOTIFICATIONS_FANOUT_CHANNEL = "kottaby:notifications:fanout"` (`redis-pubsub-transport.ts:27`) — a module-level **string literal** exported const; used **by reference** at every publish/subscribe site (engine transport, sidecar subscriber, all tests). Template-interpolation grep (`…${…}…`) across `backend/services/notifications/realtime/**` → **zero matches** — no construction, no env, no user input ever flows into the channel name; multiple tests assert the exact constant (`redis-pubsub-transport.test.ts:192`, `fanout-degradation.test.ts:188`, `ioredis-fanout-client.test.ts:424`…). No channel-name injection or cross-tenant channel squatting surface.

## Findings

**ZERO findings (0 BLOCKER / 0 MAJOR / 0 MINOR / 0 INFO).** All four sub-attacks on the shutdown fix failed to break it; all three fresh angles resolved clean.

## Defense Evidence — 12-item checklist spot re-verification @ `9d25fcc`

| # | Vector | Verdict | Fresh evidence (this round) |
|---|---|---|---|
| 1 | BOLA self-scope | **HOLDS** | Resolvers unchanged: `ctx.user.id` sole identity (`notification.query.ts:78,:106`, `notification.mutation.ts:118,:144`). |
| 2 | Oracle-safe denial | **HOLDS** | Engine/repo bit-identical to R3 verification (untouched by `9d25fcc`). |
| 3 | BOPLA spread-scan | **HOLDS** | Same — no spreads added; `9d25fcc` backend delta is WS server + test only. |
| 4 | BFLA emit-via-GraphQL | **HOLDS** | Fresh grep `emitForUser\|emitForUsers\|publishReceipts` under `backend/graphql/` → **0 files**. |
| 5 | CSWSH Origin-first | **HOLDS** | Full re-read: Origin `:430-441` FIRST, plain 403, exact-match Set, never upgraded; extraction did not touch it (Part 1c). |
| 6 | Query-token refusal | **HOLDS** | Full re-read of `fetch`: reads exactly `upgrade`/`origin`/`cookie` + `requestIP`; no URL/searchParams. |
| 7 | Throttle fail-closed | **HOLDS** | `:446-453` → `4429`; `peer?.address ?? "unknown"` shared bucket. |
| 8 | Payload allowlist | **HOLDS** | `parseFanoutEnvelope` `hasExactKeys` ×3 levels (`redis-pubsub-transport.ts:166-191`); sidecar re-projects before stringify (`:334`). |
| 9 | Wildcard/LIKE | **N/A** | Fresh grep `LIKE\|ILIKE\|sql\`` in `backend/db/repo/notifications/` → **0 matches**. |
| 10 | Token/session | **HOLDS (D8 parked)** | `jwt.ts` re-read: `Number.parseInt(userIdRaw, 10)` unchanged (D8, owning workstream). |
| 11 | Injection surfaces | **HOLDS** | Fresh grep `dangerouslySetInnerHTML` across `frontend/` → **0 matches**; SQL parameterized; frame guards unchanged. |
| 12 | Log hygiene | **HOLDS** | New shutdown paths log only fixed-vocab `reason` (`"server shutting down"`) + connId/userId/code; Origin value never logged. |

## Verdict

**0 new findings.** The Round-3 F1r3 shutdown race is **confirmed FIXED and attack-resistant** at `9d25fcc`: the post-await re-check sits exactly at the pipeline's only suspension point, the `open()` backstop is provably synchronous with registration (no interleaving possible), `shuttingDown` flips strictly before the sweep+clear (so every execution ordering terminates in either a swept registration or a refused one), and the close code is the documented `1001` at all three sites with the vocabulary pinned by test. The `upgradeRejectedHandshake` extraction is semantics-preserving — Origin remains FIRST and still never upgrades. The drain-window test pins the **wire-level** `1001` via a raw-TCP byte-level close-frame parse (with a genuine coalescing-bug repair in the harness), plus zero-registration assertions. All three last fresh angles (no committed secrets — runtime-minted tokens + documented dev fallback only; sha256 `emitClaimKey`; fixed literal `kottaby:notifications:fanout` channel with zero interpolation) are clean. All 12 checklist defenses re-verified **HOLDING** at HEAD.

**Recommended next actions**: none required by security — the notification surface is confirmed ready to leave review waves. Outstanding items remain correctly parked with their owning workstreams: D8 (canonical-`sub` regex in `jwt.ts`), D9 (deployment posture: proxy/NAT throttle aggregation, global-cap exhaustion, frame-frequency budget), and the optional `userIds.length` envelope bound.
