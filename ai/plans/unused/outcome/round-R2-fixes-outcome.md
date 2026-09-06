# R2 fixes — findings cluster disposition

Agent: fix subagent (R2 findings cluster) · Branch pin: `feat/clean-unused` (`/home/z/pin-feat.sh` OK)
Scope: the 5 findings from `round-R2-review-backend-outcome.md` (+ the INFO from `round-R2-review-types-outcome.md`).

## Per-finding disposition

### 1. [MEDIUM] `error-masking-readers.ts:38` — `export type ReadOutcome` → **FIXED (export dropped, type kept)**

- Grep `ReadOutcome` repo-wide: only in-file uses (return annotations of `readProperty`/`readIndex`, lines 40/48). The sole external hit (`backend/graphql/test/handshake-code-surface.test.ts:207`) is the local variable name `selfReadOutcome`, not the type. The `error-masking/index.ts` barrel (`export *`) re-exports it transitively but has zero downstream consumers of the name.
- Verdict per plan rule (in-file-only use → drop `export`, keep symbol): removed the `export` keyword on line 38. Mirrors the already-landed sibling un-exports (`GraphQLPathSegment`, `RAW_ERROR_HOP`) in the same file.
- tsgo gate proves no consumer broke (an exported function returning a non-exported same-file type is valid; `GraphQLPathSegment`→`GraphQLResponsePath` is the existing proof-by-precedent in this very file).

### 2. [MEDIUM] `backend/db/index.ts:288` — `export type { QueryResult, QueryResultRow }` → **FIXED (re-export line deleted)**

- Grep `from "@/backend/db"` repo-wide (89 import sites): consumers import only `db`, `queryDb`, `getDrizzleDbPool`, `closePool` — never `QueryResult`/`QueryResultRow`. All other repo hits for those names are `import type { ... } from "pg"` (other files — don't count) or doc comments in `pglite-pool.ts`.
- In-file use is satisfied by the direct `pg` import on line 21 (`queryDb<T extends QueryResultRow = QueryResultRow>` signature + `QueryResult<T>` shim construction) — both names still used in-file, so no unused-import fallout.
- Deleted line 288 (`export type { QueryResult, QueryResultRow };`) + its separating blank. No restore needed — tsgo exit 0.

### 3. [LOW] `docs/auth/qiraah-selection-and-c5.md:293/515/533` — stale `validateReading` public-API framing → **FIXED (doc rewritten to internal-concern framing)**

- Current code ground truth (`recitation-catalog.service.ts`): `validateReading` is a non-exported (namespace-private) function; the live public entry is `validateOptionalReading`.
- §5.3 (line 293 + code block): rewritten — states enum validation is an internal concern of the catalog service, shows the private primitive's actual (non-`export`) signature, and adds the public `validateOptionalReading` wrapper so a future implementer compiles against the real surface.
- Line 515 (`setMyPreferredRecitation` mandate): `MUST validate via RecitationCatalogService.validateReading` → `validateOptionalReading` (public entry), with the internal-primitive note.
- Line 533 (session-lifecycle hand-off list): points consumers at `validateOptionalReading` (public entry) with the internal-primitive note.

### 4. [LOW] `.env.example:276-310` — stale resend/twilio/fcm block → **FIXED (dead block removed)**

- Consumer verification: `RESEND_API_KEY|RESEND_FROM_EMAIL|TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_FROM_NUMBER|FIREBASE_PROJECT_ID|FIREBASE_PRIVATE_KEY|FIREBASE_CLIENT_EMAIL` and `EMAIL_PROVIDER|SMS_PROVIDER|PUSH_PROVIDER` → hits ONLY in `.env.example` (plus review-artifact mds under `ai/plans/`, which are not consumers). `resend|twilio|firebase-admin|fcm` over backend/frontend/app/shared/scripts code: 0 matches; `package.json`/`bun.lock`: 0 comm packages (one bun.lock hit is a base64-hash substring, not a dependency).
- Removed the whole "Communication Channels Configuration" section (header lines 271–273 + block 275–310): `EMAIL_PROVIDER`, Resend keys, `SMS_PROVIDER`, Twilio keys, `PUSH_PROVIDER`, Firebase service-account keys.
- Scope note (same finding class, same target file): also removed the adjacent "Live-comm integration test recipients" mini-block (`RESEND_TEST_TO_EMAIL` / `TWILIO_VERIFIED_TEST_RECIPIENT` / `FCM_TEST_DEVICE_TOKEN`, old lines 292–295) — identical phantom-class resend/twilio/fcm vars, zero code consumers (grep-verified; phase5 had already proven the adapters phantom and rewritten the `test/integration/AGENTS.md:46` counterpart). The pre-existing empty "Development Tools" header (baseline state, not named by the finding, not emptied by this branch per `git diff 1c134db HEAD -- .env.example`) was left untouched.

### 5. [INFO] `docs/graphql/api-gateway-and-routing.md:130` — stale `GatewayRequestMetadata` pointer → **FIXED (reference removed)**

- `git grep`-equivalent repo-wide: `GatewayRequestMetadata` exists in ZERO code files (only this doc + `ai/finished_plans` history + review artifacts). `backend/types/gateway/gateway-context.types.ts` currently contains only `TransportErrorKind` / `TransportGuardResult`.
- Dropped `GatewayRequestMetadata` from the "documentary carrier" sentence; the surviving types + file path remain cited (both verified live).

## Verification gates (after all fixes)

| Gate | Command | Result |
|---|---|---|
| Types | `timeout 240 bun run tsgo` | **exit 0 — no errors** (no consumer of the dropped type-exports broke) |
| Unused-code | `bun run check:unused` (knip) | **exit 0** (1 pre-existing `.mdx` compiled-extension hint, unchanged) |
| Lint/format | `bunx @biomejs/biome check .` | **clean** — 1417 files checked, no fixes needed |
| Dev server | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` | **200** |

No restores via `git checkout` were needed (tsgo stayed green after both type-export removals).

## Files changed (5 / 5 findings fixed, 0 false positives)

```
 .env.example                                       | 46 ----------------------
 backend/db/index.ts                                |  2 -
 backend/lib/errors/error-masking/error-masking-readers.ts |  2 +-
 docs/auth/qiraah-selection-and-c5.md               | 17 ++++++--
 docs/graphql/api-gateway-and-routing.md            |  2 +-
 5 files changed, 15 insertions(+), 54 deletions(-)
```
