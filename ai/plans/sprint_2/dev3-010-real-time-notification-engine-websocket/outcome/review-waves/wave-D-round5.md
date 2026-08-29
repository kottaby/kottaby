# Wave D — Round 5 (FINAL confirmation)

- **Reviewer:** Review-Wave-D-Round5 (security, read-only)
- **Branch:** `feat/dev3-010-real-time-notification-engine-websocket` @ `479cdfb`
- **Tree state:** clean (`git status --short` empty); HEAD = round-4 closure commit "all four waves zero findings (first clean round)".
- **Scope:** 2-consecutive-clean confirmation (R4 clean + this round). Spot-verification of the 6 core defenses with fresh greps + one last fresh-angle sweep of the full branch diff's non-obvious files.

## Findings

**ZERO findings.** Round 5 is clean → **2-consecutive-clean achieved (R4 + R5)**.

## Defense Evidence (fresh greps at `479cdfb`)

1. **BFLA — emit surface unreachable from GraphQL.** Zero emit-surface calls under `backend/graphql`. Resolvers invoke only the user-scoped surface: `NotificationEngine.markRead` (mutation.ts:118), `markAllRead` (:144), `listMyNotifications` (query.ts:77), `getMyUnreadCount` (:106). The only "emit" string matches are: an import of the pure `isPositiveSafeInt` validation helper, test comments, and `sdl-static-assertions.test.ts:74` (REQ-032 static assertion that emit operations never exist in SDL).
2. **BOPLA — no spreads into Drizzle.** No `{ ...input }`-into-Drizzle anywhere on the branch. Spread matches are benign: `[...input.userIds]` (array copy in a return value, engine service :421/:429), `[...values]` fixture seeding in test files, and pre-existing untouched files (`graphqlErrorsFinalizer.ts`, `registration.service.ts` — the latter spreads into `validateInput`, a validator, not an insert). `contracts.static-assertions.test.ts:144` guards the pattern.
3. **CSWSH — Origin-first handshake.** `notification-ws-server.ts` `fetch()` (line 424) order verified in code: upgrade-header 426 check → **(1) Origin allowlist** (lines 433–441, missing/non-allowlisted → 403, explicitly "before any identity material is read") → (2) per-IP token bucket (`4429`) → **(3) `access_token` httpOnly cookie read** (lines 456–458) → (4) `verifyAccessToken` (fail-closed `4401`) → (4b) post-await shutdown re-check (`1001`) → (5) `sub`-claim positive-int coerce → (6) upgrade with caps enforced atomically in `open()`.
4. **Query-token refusal.** Zero `URL` / `searchParams` / query-string parsing in the ws server (grep hits are doc comments only). The cookie is the only identity source; the client hook confirms "NO token is ever read, stored, or sent by JavaScript" (use-notification-realtime.ts:25).
5. **Payload allowlist (egress projection).** `projectFanoutPayload` (redis-pubsub-transport.ts:126–140) is an explicit field-by-field projection (`v`, `kind`, `data:{id,type,title,body,relatedEntityType,relatedEntityId,createdAt}`); the ws egress path sends `JSON.stringify(projectFanoutPayload(payload))` for **every** outbound frame (ws server :334). No recipient ids/PII cross the socket.
6. **Log hygiene.** ws-server logger calls carry only `connId`, `userId`, `code` (+ `host`/`port` at server lifecycle — config, not user data). Zero logger calls in the realtime transport module. Domain-error log at handshake rejection carries a reason enum, no identity material.

## Fresh-angle sweep (non-obvious files in the full branch diff)

- **`.env.example` (+37):** all commented-out placeholders (`WS_PORT`, `WS_HOST`, `WS_ALLOWED_ORIGINS` — with fail-closed wildcard handling documented, `NOTIFICATION_FANOUT_TRANSPORT`, `WS_MAX_CONNECTIONS(_PER_USER)`, `NEXT_PUBLIC_NOTIFICATION_WS_URL`). No real secrets; the `redis://default:password@...` string is pre-existing context with an obviously fake placeholder host.
- **`package.json` (+1):** only a `"ws": "bun run scripts/start-notification-ws.ts"` script. **No dependency additions — lockfiles have ZERO diff vs `origin/main`** (sanctioned new-dep set is empty; sidecar is Bun-native `Bun.serve`, ioredis fanout client rides the pre-existing dependency).
- **Docs:** all under `ai/plans/...` (outcome docs, review waves, screenshots). Secret-pattern scan (tokens, JWTs, private keys, AKIA/sk_live/ghp_, passwords) over the plan tree: **zero matches**.
- **CI (`.github/`):** `git diff origin/main -- .github/` is empty → **byte-identical**.
- **Changed-file inventory outside plan docs (77 files):** entirely notification feature surface (backend repo / graphql / services / ws, frontend views / hooks / components, locales, tests, `scripts/start-notification-ws.ts`) — nothing unexpected.

## Verdict

**CLEAN — ZERO findings. 2-consecutive-clean confirmed (Round 4 + Round 5).**
All six core defenses verified present and correctly ordered at HEAD `479cdfb`; the final full-diff sweep of non-obvious files (env example, package/lockfiles, docs, CI) surfaced nothing security-relevant. Wave D security review is complete; the branch is confirmed ready from a security standpoint.
