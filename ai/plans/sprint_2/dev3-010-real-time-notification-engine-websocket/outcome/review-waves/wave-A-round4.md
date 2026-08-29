# Wave A (review-types) — Round 4 (confirmation round)

**Reviewer**: independent agent | **Date**: 2026-08-29 | **Scope**: types & enum discipline — `9d25fcc` regression check + checklist confirmation + full-branch delta audit

Branch: `feat/dev3-010-real-time-notification-engine-websocket` (HEAD `9d25fcc`, 23 commits ahead of origin; working tree clean). Rounds 1–3 reported ZERO findings (Round 3 recorded 2 INFO observations — **INFO-R3-1** cache-row derivation hardening, **INFO-R3-2** unpinned pre-existing `CANONICAL_ENUMS` edge — both stand as previously ruled; NOT re-reported here). Since Round 3 exactly one commit (`9d25fcc`) landed, touching 6 frontend files + `notification-ws-server.ts` + its test + 4 round-3 review reports — **no `backend/types/` or `backend/enum/` file was touched**.

## Findings

**ZERO new findings** (0 BLOCKER / 0 MAJOR / 0 MINOR / 0 new INFO).

## `9d25fcc` Diff Scrutiny (type-discipline regressions: NONE)

| File(s) | Change | Type-discipline assessment |
|---|---|---|
| `backend/ws/notification-ws-server.ts` (+100/−41) | (a) extracted `upgradeRejectedHandshake(request, server, reason, code, fallback)` helper replacing 4 duplicated upgrade/fallback blocks; (b) two `shuttingDown` re-checks (post-cap-check registration path + post-`await verifyAccessToken` handshake path) closing the drain-window race; (c) doc-comment updates | (a) The helper is a plain **function** — no new type/interface/enum declaration. Its signature composes only pre-existing types: DOM `Request`/`Response`, `Bun.Server<NotificationWsSocketData>` (interface at :169), `string`, `number`; return `Response \| undefined` matches the handler's pre-existing return type; body delegates to pre-existing `rejectedSocket` (:637). (b) Both re-checks are pure control flow over the pre-existing `shuttingDown` boolean and the pre-existing `NOTIFICATION_WS_CLOSE_CODES.shutdown` member of the `as const` object (nothing added to it in this commit). (c) comments only. |
| 6 frontend files (`NotificationRealtimeToastHost`, `MarkAllButton`, `NotificationFeedError`, `NotificationFilterChips`, `NotificationRow`, `NotificationsFeedContainer`) | `focusVisibleRingSx` spread into existing `sx` props on 14 controls + `import` of the shared const | `focusVisibleRingSx` is a **runtime constant** (`frontend/components/ui/focusRing.ts:16-22`: object literal `satisfies CSSObject` with `import type { CSSObject }` — type-only import, no type declaration exported). `git diff origin/main --numstat -- frontend/components/ui/focusRing.ts` → **empty**: the module predates this branch (auth audit-R4), so it is outside the blast radius entirely. The sx spreads mutate runtime style objects only; zero type-level surface changed. |
| `backend/ws/notification-ws-server.test.ts` (+38/−2) | test coverage for the shutdown race | Added lines contain **zero** type/interface/enum declarations and zero typed-const definitions (pattern scan over `+` lines) — assertions over existing shapes only. |

**Named declarations in `notification-ws-server.ts` at HEAD remain exactly the Round-3 set** (verified by declaration scan): `NotificationWsServerConfig` (:109), `NotificationWsServerConfigOverrides` (:137), `NotificationWsSocketData` (:169), `NotificationWsConnState` (:176), `NotificationWsServerOptions` (:228), `NotificationWsServerHandle` (:236) — the helper added in `9d25fcc` is a function, not a type.

## Checklist Evidence (10 items confirmed at HEAD `9d25fcc`; spot-greps varied from Round 3)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Additive-only types/enum layer | **PASS** | `git diff origin/main --numstat -- backend/types/ backend/enum/` → 4 files, **0 deletions each** (669 insertions; byte-identical to Round 2/3 — `9d25fcc` touched none of them): `notification-type.enum.test.ts` +268, `notification-type.enum.ts` +10, `notification.types.test-d.ts` +253, `notification.types.ts` +138. |
| 2 | Zero service-layer `*.types.ts` | **PASS** | Glob `backend/{services,ws}/**/*.types.ts` → empty. |
| 3 | Zero local Pothos types; objectRefs backed by canonical ReturnType types | **PASS** | Declaration scan `^\s*(export\s+)?(type\|interface\|enum)\s+\w+` over `backend/graphql/pothos/notifications/` → **no matches**. |
| 4 | Enum value-import discipline | **PASS** | Full re-classification of all TS import sites of `notification-type.enum` (23 code files): production **`import type`** — `notification.types.ts:9`, `session-notification.contract.types.ts:13`, `notification.repository.ts:30` (compiler-enforced type-only); production **value/mixed with runtime uses** — `enum.pothos.ts:24` (enumType registration), `notification.pothos.ts:28` + `emit-validation.ts:29` (`isNotificationType` guard), `notification-engine.service.ts:41` + `emit-idempotency.ts:24` (guard + `type NotificationType`); every test file value-imports for member access. Identical set to Round 3 — `9d25fcc` added no import sites. Zero misclassifications. |
| 5 | `DBTransaction` sourced from canonical layer | **PASS** | Repo-wide `(type\|interface) DBTransaction` → single definition `backend/types/db.types.ts:23`. |
| 6 | Enum-parity — 7 members everywhere | **PASS** | TS enum 7 members (snake_case values); pgEnum `enums.ts:46-54` 7 members **byte-identical, same order**; SDL `schema.graphql:103-111` = 7; codegen `graphql.ts:26-34` = 7 (same member set). Parity tests unchanged since Round 3 (order-sensitive pgEnum pin + schema-surface TS-enum↔SDL comparison). |
| 7 | `RealtimeNotificationPayload` defined once | **PASS** | Declaration scan → sole definition `notification.types.ts:135` (receipt at :81); all other hits are `import type` consumers, test literals, or plan/report docs. |
| 8 | Codegen-only consumption in frontend | **PASS** | `notification.documents.ts:1-2` (`frontend/graphql/sharedDocuments/notifications/`) imports `TypedDocumentNode` + `import type` operation types from codegen. Pattern scan `from ["']@/backend` over `frontend/` → **zero hits in any notification/realtime file**; all hits are the pre-existing non-notification surfaces already recorded in Round 3 hunt notes (`RoleDashboardPage`, theme presets, auth helpers, gateway/teacher tests — untouched by this branch). |
| 9 | ws inline types unchanged | **PASS** | See declaration list above — `9d25fcc` added a function, no types; per-user index remains inline `Map<number, Set<string>>`; runtime consts (`NOTIFICATION_WS_CLOSE_CODES` `as const`, `WS_MAX_INBOUND_FRAME_BYTES`) unchanged in membership. |
| 10 | sx constants are runtime constants, not type declarations | **PASS** | `VISUALLY_HIDDEN_TEXT_SX` (`NotificationRow.tsx`) still an `as const` runtime object; the `9d25fcc` addition spreads `focusVisibleRingSx` — a pre-existing runtime const (`satisfies CSSObject`, type-only import) from a module **outside the branch diff**. Full-tree typecheck clean (gate below). |

**Final gate**: `bunx tsgo -b --noEmit` → **exit 0** on the full tree at HEAD `9d25fcc`.

## Fresh angle — full-branch delta audit (`git diff origin/main --stat`)

- **Totals**: 181 files, +26,077 / −152. Composition by area: `ai/plans` 74 (plan/outcome/review docs — this repo's documented workflow), `backend/services` 19, `backend/graphql` 18, `shared/locale` 16, `frontend/views` 11, `test/workflows` 8, `frontend/graphql` 7 (codegen output), `test/ui` 5, `backend/ws` 4, `backend/db` 4, `frontend/components` 2, `backend/types` 2, `backend/lib` 2, `backend/enum` 2, `test/integration` 1, `scripts/start-notification-ws.ts` 1, `package.json` 1, `frontend/providers` 1, `frontend/hooks` 1, `app/(dashboard)` 1, `.env.example` 1. **Every area is an expected notification-engine surface — no unexpected files leaked.**
- **Types/enum layer delta remains additive-only and numerically unchanged since Round 2** (4 files, 0 deletions, 669 insertions — see #1).
- **All 9 files carrying deletions were inspected** (the branch's only non-additive lines): `ai/plans/.../tasks.md` (plan checkboxes), `backend/graphql/gqlSchema.ts` (comment renumbering + one added side-effect import `@/backend/graphql/pothos`), `mutation/index.ts` + `query/index.ts` (comment wording + one added `import "./notifications"` each), `schema-surface.test.ts` (test additions rewriting an expectation block), `apolloCache.ts` (doc comment: adds `NotificationListPage` to the `keyFields: false` list), `DashboardAppBar.tsx` + `navItems.ts` (nav entry + badge wiring), `test/workflows/AGENTS.md` (docs). **Every deletion is comment text, list renumbering, or superseded test expectations — zero type/interface/enum declarations or exported type shapes were removed or altered.**
- `package.json` delta = one script (`"ws": "bun run scripts/start-notification-ws.ts"`); `.env.example` delta = commented-out optional WS/fanout env keys with fail-closed documentation. Both are additive and expected for the sidecar entrypoint.

## Verdict

**0 new findings** (0 BLOCKER / 0 MAJOR / 0 MINOR / 0 new INFO; Round-3's 2 INFO observations stand as previously ruled and are not re-opened).

`9d25fcc` introduced **zero type-discipline regressions**: the `upgradeRejectedHandshake` extraction is a plain function over pre-existing types, and the focus-visible sx spreads consume a pre-existing runtime constant from a module outside the branch diff. All 10 checklist items PASS at HEAD, the full-tree typecheck gate is clean, and the full-branch delta audit confirms the types/enum layer remains strictly additive with no leaked or unexpected files.

**Four consecutive clean rounds (R1: 0, R2: 0, R3: 0 + 2 INFO, R4: 0). Types & enum discipline in Wave A is confirmed clean; nothing blocks merge.**
