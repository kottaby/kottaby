# Wave D (pentester) — Round 2

**Reviewer**: independent adversarial agent | **Date**: 2026-08-29 | **Scope**: security — Round-1 fix verification + fresh attack of the new code

Branch: `feat/dev3-010-real-time-notification-engine-websocket` @ `45a0c9e` (one commit past Round 1's `79f2900`). Static analysis + reasoning only (no live attacks, no code changes, no commits). Round 1 context (`wave-D-round1.md`) read first; this round's mandate: (1) attack the three fix surfaces, (2) re-verify the 12-item defense checklist on the current tree, (3) hunt new defects in the full `45a0c9e` diff. Files changed since Round 1 (verified via `git diff 79f2900..45a0c9e --name-only`): engine service, notification types, WS server + its test, emit test, `NotificationRow.tsx`, plan docs — resolvers/repo/jwt/env/transport are bit-identical to the Round-1-verified tree.

## Part 1 — Attack the new code (the three fix surfaces)

### 1a. Per-user Set index (`connectionsByUser`) — **HELD, no consistency exploit found**

Probed every registry-mutation site for index/registry divergence:

- **Phantom delivery (stale index entry after termination)?** Not reachable. All four registry-deletion sites pair synchronously with index removal on the same single-threaded turn: `close()` handler (`notification-ws-server.ts:404-412`, index removal guarded by `registry.delete()` returning true AND `userId !== null`), `evictOldestForUser` (`:507-508`), the missed-pong termination sweep (`:534-536`), and shutdown (`registry.clear()` + `connectionsByUser.clear()` back-to-back, `:580-581`). `indexRegister` exists at exactly ONE site — immediately after the single `registry.set` in `open()` (`:390-391`) — with no `await` or throwing statement between them, so there is no interleaving window.
- **Eviction races?** Eviction removes the oldest conn from BOTH structures *before* calling `oldest.ws.close(...)` (`:507-514`); the victim's close event fires later and `registry.delete(connId)` returns false → no double-unregister. connIds are fresh `randomUUID()` per upgrade, so no ABA/aliasing between an evicted connId and its successor. Even a hypothetically stale index entry is **inert**: `sendFrameToConnection` (`:310-326`) re-resolves via `registry.get(connId)` and no-ops on miss — a frame can never be delivered off a stale index entry. Delivering to the *wrong* socket would require a connId collision (UUIDv4, ~2⁻¹²²) — not a realistic attack.
- **Reverse divergence (registry entry missing from the index)?** Would cost a missed push (availability), never a cross-user leak — and critically, **per-user cap enforcement does NOT trust the index**: `evictOldestForUser` counts by scanning `registry.values()` (`:497-503`), so cap integrity is registry-grounded while the index only accelerates delivery/counts. Good layering.
- **Does shutdown clear BOTH?** Yes — `registry.clear(); connectionsByUser.clear();` (`:580-581`), with `shuttingDown = true` making `deliverFanout` a no-op (`:330-332`) so no frame is built after drain begins.
- **Test pinning:** routing isolation and multi-socket fan-out (test `:505-549`), per-user counts after eviction (`:836`, `:847`), over-cap-close drain of BOTH structures — `connectionCountForUser(202) → 0` while the sibling keeps receiving (`:873-897`), and full churn drain to zero (`:899-926`).

### 1b. 4 KiB frame cap — **HELD, memory bounded; one residual note (F2r2)**

- **Many SMALL frames → memory/CPU exhaustion?** Memory: bounded. `message()` is empty (REQ-034 push-only), so there is no application-level frame queue; per-socket inbound buffering is capped by Bun's `maxPayloadLength` (4096B, `:86`, `:352`) including fragmentation, and backpressure beyond that parks in bounded kernel socket buffers. 1000 sockets × 4 KiB ≈ 4 MiB worst-case app-side. CPU: an *authenticated* client can send ≤4 KiB frames at line rate and burn event-loop cycles on parse+dispatch with no per-connection message-rate limit — see **F2r2** (INFO, same trusted-auth posture as accepted D9(b)). Unauthenticated sockets never reach `message()` (rejected pre-registration).
- **Does the runtime's over-cap close leak registry/index entries?** No. The runtime-initiated close fires the `close()` handler, which drains registry + index; pinned by test `:873-897` (offender's count drains to 0, sibling's push loop provably intact). Even in the degenerate case of a close callback never firing, `idleTimeout` (95s) and the ping sweep re-assert termination — and the global cap (1000) bounds any leak's size, degrading to `1013` not to unbounded growth.
- **Config hygiene:** `maxInboundFrameBytes` is a module constant overridable only via the test seam (`:160`) — NOT env-configurable, so an operator cannot accidentally re-widen it; the constant is pinned by test (`WS_MAX_INBOUND_FRAME_BYTES === 4096`, test `:478-483`).

### 1c. `publishReceipts` store path + `emitClaimKey` — **HELD, digest-only everywhere**

- **Is the claim key always the digest?** Yes. `buildEmitClaimKey` (`emit-idempotency.ts:67-71`) is the single construction site and returns `notif:emit:<sha256-hex>`; the raw `idempotencyKey` is never stored, logged, or attached to anything. The receipt field `emitClaimKey` (`notification.types.ts:94`) carries only that digest. Cache values are `JSON.stringify(receipt)` — digest included, raw key structurally absent.
- **Raw-key logging / digest exposure?** Grepped every `logger.*` call in `backend/services/notifications/**`: the engine has exactly two `logDomainError` sites (`notification-engine.service.ts:183`, `:560`) and the idempotency warns carry fixed detail strings + `errorName` only (`emit-idempotency.ts:126-129`, `:247-253`). No log carries `idempotencyKey` or a claim key. User-visibility: `emitClaimKey` appears in zero frontend files (grep) and `emitForUser|emitForUsers|publishReceipts` appear in zero `backend/graphql/**` files (grep) — the receipt never crosses a client boundary.
- **Cache-compromise disclosure?** The stored value contains the notification rows (id, userId, type, title, body, refs, createdAt) + recipient ids + the digest. A read-compromised cache therefore learns notification *content* — equivalent in sensitivity to reading the `notifications` table it mirrors; no token, session, or credential material rides the receipt. The raw key is sha256-preimage-protected (a cache reader with a low-entropy key *guess* could confirm it offline, but the adjacent value already discloses the content — no incremental leak). A write-compromised cache could plant forged receipts under existing digest keys, returning fabricated rows to *internal backend callers* on replay — but that requires pre-knowledge of the raw key plus Redis write access, an already-critical infrastructure compromise; consistent with the trusted-bus posture Round 1 applied to the same boundary.
- **Store-timing correctness (the Wave B F1 fix):** the tx branches return the receipt with `emitClaimKey` and store NOTHING (`:356`, `:421`); the ONLY store happens post-commit — own-commit path after `withTransaction` resolves (`:364-365`, `:432-433`) or `publishReceiptsFromIndex` at the caller's sanctioned post-commit hook, store-before-publish (`:613-617`). A rolled-back emit can never ghost a future replay. Pinned end-to-end by the new test (`notification-engine.emit.test.ts:1103-1141`): emit-inside-committed-tx → `cache.stored.size === 0` and zero publishes until `publishReceipts`; same-key replay inside a fresh tx returns the PRIOR receipt with ZERO new rows. Revived receipts drop `emitClaimKey` (parser ignores unknown fields), so replays never re-store — no unbounded store churn.

**Wave B F1 cross-reference: FIXED at HEAD** (was the open MINOR-latent item Round 1 carried). The duplicate-frame-on-replay nuance (a replayed prior receipt passed through `publishReceipts` re-publishes one realtime frame for an id the client has likely already merged) is unchanged pre-fix behavior, id-keyed and benign — noted, not a finding.

### Full-diff defect hunt (`git show 45a0c9e`)

- **emitClaimKey plumbing:** reviewed line-by-line above — digest-only, no log surface, no client surface, parser drops it on revive. No defect.
- **a11y change (`NotificationRow.tsx`):** clean — no security angle. Content still renders exclusively as React text nodes via `Typography`/`Chip`; the new visually-hidden unread text and `aria-label` interpolations (`markReadAriaLabel(notification.title)`) are React-escaped attribute/text renders; no `dangerouslySetInnerHTML`/`href`/`document`/`window` usage added (diff-scanned). Skipped per mandate.
- **Engine restructure:** `claimOrPriorReceipt` return-shape change audited — the "unavailable" (fail-open) path deliberately returns a defined `claimKey` so the post-commit store can still arm replay protection after a transient claim error (matches pre-fix own-commit semantics; no ghosting possible since the store remains post-commit-only). No new object spreads (BOPLA-clean); `parseStoredNotificationRow` remains field-by-field with exact-key structural guards.

## Part 2 — 12-item defense checklist re-verification (current tree)

| # | Attack vector | Verdict | Evidence (re-verified this round) |
|---|---|---|---|
| 1 | BOLA self-scope | **HOLDS** | Resolvers unchanged since R1 (outside the fix commit); re-grepped: `ctx.user.id` is the sole identity at `notification.query.ts:78,:106` and `notification.mutation.ts:118,:144`; canonical-id regex `/^[1-9]\d*$/` still guards the mutation arg (`:62`). New engine code adds no identity-bearing parameter. |
| 2 | markRead oracle constancy | **HOLDS** | Unchanged single `NotFoundError` path; the one denial log site (`:560`) carries code/entity/id/locale only. |
| 3 | BOPLA spread-scan | **HOLDS** | Fix commit adds zero object spreads: index helpers mutate `Set`/`Map` primitives; `parseStoredNotificationRow` maps field-by-field; receipts are explicit object literals; only array spread remains read-side (`[...input.userIds]`). |
| 4 | BFLA (notification CUD via GraphQL) | **HOLDS** | Re-ran grep `emitForUser\|emitForUsers\|publishReceipts` over `backend/graphql/**` → zero matches. |
| 5 | CSWSH Origin-first | **HOLDS** | Order intact at HEAD: upgrade check (`:415-418`) → Origin exact-match Set, HTTP 403 (`:423-431`) → throttle (`:434-441`) → cookie read (`:444-445`). Tests pinned (`:730-761`). |
| 6 | Query-token refusal | **HOLDS** | `fetch` still reads exactly upgrade/origin/cookie headers + `requestIP`; zero `URL`/`searchParams`/subprotocol reads. Pinned (`:763-772`). |
| 7 | Throttle fail-closed | **HOLDS** | `:434-441`: unknown peer → shared `"unknown"` bucket, exhausted → `4429`; bucket-map bound 10k drop-oldest. Refill/recovery pinned (`:774-796`). |
| 8 | Payload allowlist (no PII on wire) | **HOLDS** | `deliverFanout` re-projects via `projectFanoutPayload` before `JSON.stringify` (`:333`), the transport re-projects pre-publish, and `parseFanoutEnvelope` enforces exact key sets (`redis-pubsub-transport.ts:173-208`). Egress smuggling test (planted `userId: 999` + extra key never reach the frame) still pinned (`:578-602`). |
| 9 | Wildcard/LIKE | **N/A — confirmed** | Re-ran grep `LIKE\|ILIKE\|sql\`` over `backend/db/repo/notifications/**` → zero matches. |
| 10 | Token/session handling | **HOLDS (D8 unchanged)** | `jwt.ts:157` still `Number.parseInt` on `sub` (non-canonical spellings coerce) — unchanged, ruled D8 (pre-existing auth-domain scope, ticketed). Frontend re-grep: only theme-persistence `localStorage`/`document.cookie` matches; no token storage; no `dangerouslySetInnerHTML` anywhere. |
| 11 | Injection surfaces | **HOLDS** | `NotificationRow.tsx` (the one changed frontend file) is text-node-only with escaped aria-labels; SQL is parameterized (row 9); envelope/bus guards are structural. |
| 12 | Log hygiene | **HOLDS** | New logs added by the fix carry only connId/userId/numeric codes/fixed vocabulary: eviction log `{connId, userId, supersededBy}` (a connId), degraded-delivery `{connId, userId, errorName}`. No payloads, origins, keys, or recipient lists. |

## Findings

### F1r2 — INFO — Residual envelope-amplification surface on the trusted bus (Round 1 F1 aftermath)

- **Severity**: INFO (residual; the exploitable amplification is gone)
- **Location**: `backend/services/notifications/realtime/redis-pubsub-transport.ts:166-183` (`parseFanoutEnvelope` — still no upper bound on `userIds.length` or on the raw message size fed to `JSON.parse`)
- **Assessment**: Round 1's MINOR (O(recipients × registry) per envelope) is **FIXED and closed** — delivery is now O(recipients + delivered connections) via the index (`notification-ws-server.ts:329-343`), so a 50k-recipient broadcast costs 50k O(1) map lookups instead of 5×10⁷ iterations. What remains is the linear cost of `JSON.parse` on an arbitrarily large envelope plus one lookup per id — reachable only by a compromised/misbehaving Redis or a runaway in-process emitter, i.e. the trusted-internal-bus boundary Round 1 already accepted. A `userIds.length` bound (drop-and-warn, mirroring the guard's posture) would still be free hardening.

### F2r2 — INFO — No per-connection inbound message-rate limit (small-frame CPU churn)

- **Severity**: INFO (residual; same accepted trusted-auth posture as D9(b))
- **Location**: `backend/ws/notification-ws-server.ts:394-397` (`message()` no-op), `:86`/`:352` (4 KiB `maxPayloadLength`); the handshake throttle (`:434-441`) does not extend to post-upgrade frames
- **Assessment**: the frame-cap fix bounds *memory* per socket at 4 KiB (no app-level queue; `message()` discards), but nothing bounds *frame frequency*. An authenticated client can stream legal-size frames at line rate indefinitely, consuming event-loop CPU (parse + no-op dispatch) and degrading push/handshake latency for every user of that sidecar instance. Material impact needs the same mass-credential scale as the accepted D9(b) global-cap residual (≥200 authenticated live accounts to saturate; a single bad client is noise), and memory stays bounded regardless. Suggested disposition: fold into the D9 deployment-workstream checklist (optional cheap knob: terminate on a small inbound application-frame count budget per connection, since a spec-conforming client sends ZERO application frames).

No BLOCKER, MAJOR, or MINOR findings this round. No regression in any Round 1 defense.

## Verdict

**2 new findings, both INFO (F1r2, F2r2) — 0 BLOCKER / 0 MAJOR / 0 MINOR.**

All three Round-1 fixes were attacked at source and **HELD**: the per-user index is a correctly-maintained derived view with inert stale-entry semantics and registry-grounded cap enforcement; the 4 KiB frame cap bounds memory and drains cleanly on runtime closes; the `publishReceipts` store path is digest-only, post-commit-only, and client-invisible. All 12 Round 1 checklist defenses re-verified HOLDING on the current tree (BFLA/LIKE/token/log greps re-executed fresh). **Wave B F1 (tx-path idempotency receipt store) is confirmed FIXED** with pinned end-to-end coverage. Wave D round 1 findings disposition: F1 fixed+closed (residual noted as F1r2), F5 fixed (verified + regression-pinned), F2/F3/F4 remain correctly parked as D8/D9.

**Recommended next actions**:
1. Fold F2r2 (inbound frame-frequency budget, or at least a deployment-checklist note) into the D9 deployment workstream.
2. Optionally bound `userIds.length` in `parseFanoutEnvelope` (F1r2) the next time the transport is touched.
3. No code changes required by security this round.
