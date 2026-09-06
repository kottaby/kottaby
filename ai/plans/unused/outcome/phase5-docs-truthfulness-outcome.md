# Phase 5 — Docs Truthfulness Wave Outcome (D2 / D8 / D13 / D14)

**Plan:** `ai/plans/unused/clean_unused.md` (Phase 5 docs wave)
**Branch:** `feat/clean-unused` (pinned via `pin-feat.sh` → `feat/clean-unused`)
**Task:** Deferred items D2, D8, D13, D14 — documentation truthfulness after the code cleanup. Text-only edits; no code behavior changes.
**Gates after edits:** knip `check:unused` **exit 0** · `bun run tsgo` **exit 0** (0 errors) · `bunx @biomejs/biome check .` **exit 0** (1418 files, no fixes applied) · dev server `GET /` **HTTP 200**.

---

## D2 — stale AGENTS.md references to never-existent test surfaces (`test:live-comm` / `test:live-fx` / `test/integration/{preload,fx,communication}`)

**Verification first:** `rg "live-comm|live-fx" package.json` → 0 matches (scripts removed by D1); `ls test/integration/` → only `AGENTS.md` + `redis/` (one live smoke: `redis/redis-fanout-transport.integration.test.ts`); no `preload/`, `communication/`, `fx/`, `db/`, `meeting/`, `helpers/` dirs; `git ls-files test/` confirms none of the dead dirs ever existed in git history.

| File | Edit (pre → post line numbers) | Evidence |
|---|---|---|
| `AGENTS.md` (root) | removed `bun run test:live-comm` / `bun run test:live-fx` command entries (old 47–48; now 45→47 runs `test:integration:sequential` → `test:services` directly) | commands list now matches package.json exactly |
| `test/integration/AGENTS.md` | removed "Communication adapters" + "FX providers" category rows (old 9–10; table now 9–11 = db/redis/meeting) | dirs never existed |
| `test/integration/AGENTS.md` | removed `test:live-comm` / `test:live-fx` command entries (old 35–36; commands block now 31–33) | scripts gone from package.json |
| `test/integration/AGENTS.md:46` | rewrote the env bullet: dead `RESEND_TEST_TO_EMAIL` / `TWILIO_VERIFIED_TEST_RECIPIENT` / `FCM_TEST_DEVICE_TOKEN` examples → live redis keys (`REDIS_CLOUD_TEST_REDIS_URL`, `UPSTASH_TEST_REDIS_REST_*`, documented in `.env.example:57–62`) | FCM key exists nowhere; resend/twilio adapters have 0 code refs |
| `test/integration/AGENTS.md` | removed the "Preload scripts in `preload/`…" bullet (old 51) | preload dir never existed |
| `test/integration/AGENTS.md:50–64` | Gating section rewritten: phantom `describeLiveWhen` helper (`@/test/integration/helpers/describe-live` — file absent) → the LIVE pattern from `test/integration/redis/redis-fanout-transport.integration.test.ts:84` (`describe.skipIf(!redisReachable)` + TCP reachability probe, `@live-redis` tag); "Adding a new provider smoke" step 2 (now :95) updated to `describe.skipIf` | helper file never existed; live test verified |
| `test/integration/AGENTS.md:68,70` | Scope bullets: dead adapter examples (`new ResendEmailAdapter()`, `new FixerAdapter()`, "Resend 429 quota", "FAILED delivery status") → live `IoredisFanoutClient` / `RedisPubSubTransport` round-trip phrasing | adapters have 0 code refs |
| `test/integration/AGENTS.md:79,84–90` | Imports bullet + directory layout: dropped `helpers/`, `preload/` (3 lines), `communication/`, `fx/` layout entries; redis comment now describes the live smoke; kept `db/` + `meeting/` (unnamed aspirational categories — see observations) | layout now matches tree + table |
| `test/integration/AGENTS.md:103` | verification example path `test/integration/communication/resend.integration.test.ts` → live `test/integration/redis/redis-fanout-transport.integration.test.ts` | old path absent |
| `backend/services/AGENTS.md` | removed `bun run test:live-comm` / `test:live-fx` bullets (old 58–59; run list now ends at `:52` with `test:integration`) | scripts gone |
| `backend/services/AGENTS.md:46–48` | integration-placement examples: dropped Resend/Twilio/FCM → `test/integration/communication/` and Fixer → `test/integration/fx/` rows; redis row dropped its now-false "(when added)" qualifier (the redis smoke is live) | dead dirs + dead adapters |

## D8 — stale docs after dependency removals

**Verification first:** `bun pm ls` → only `@pothos/{core,plugin-dataloader,plugin-scope-auth,plugin-with-input}` installed; `rg "bullmq|pg-boss|cron-parser"` in code → 0 matches; `queue-adapter.factory.ts`, `backend/services/cron/`, `CronService`, `cronRunTrigger`, resend/twilio/FCM/Fixer adapters, `CommunicationService`, `dispatchWithPreferences`, `notification-dispatch.helpers`, `emailChannel`/`smsChannel`/`pushChannel`, `cacheService`/`ICacheService`, `PermissionsService.getUserIdsWithPermission` → all 0 code refs; `backend/services/cron/` has no git history at all (never existed).

| File | Edit | Evidence |
|---|---|---|
| `backend/graphql/pothos/builder.ts:15–18` | comment trimmed: "Other installed plugins (errors, dataloader, drizzle, directives, simple-objects, tracing, add-graphql)" → "Only one other Pothos plugin is installed: `@pothos/plugin-dataloader` (kept for the documented batching pattern — see `docs/graphql/dataloader-batching.md`); it is intentionally NOT loaded in this builder." (doc exists; the other 6 plugin packages were removed in phase 1b) | `bun pm ls`; dataloader is a knip-ignoreDependencies keep (knip.config.ts:100–104) and is NOT registered in any builder |
| `README.md:99` | "- **Auth & Jobs** — JWT sessions, RBAC, BullMQ / pg-boss, cron workers" → "- …, secret-gated cron endpoints" | BullMQ/pg-boss deps removed; the real jobs surface is the CRON_SECRET-gated GET route `app/api/cron/sweep-sessions` |
| `backend/AGENTS.md` | removed the "Cron Service … pluggable queue backends (pg-boss, custom-sql, bullmq) … docs/services/cron-service.md" bullet (old :35) | deps removed; service/doc never existed |
| `backend/services/AGENTS.md:39–40` | "No real external APIs" mock list: 5 dead-symbol bullets (CommunicationService/dispatchMulti/dispatchWithPreferences; Resend/Twilio/FCM; Fixer/OpenExchangeRates; cacheService/ICacheService; PermissionsService.getUserIdsWithPermission) → 2 live-seam bullets (NotificationRepository.createManyReturning spy — the actual pattern in `admin-broadcast.service.test.ts:1027`; RedisPubSubTransport/IoredisFanoutClient transport mocks) | every removed symbol grep-verified 0 refs |
| `backend/services/AGENTS.md:22` | type-pattern example types `FixerLatestResponse`/`ZoomTokenResponse` (phantom) → live `NotificationEmitInput`/`NotificationDeliveryReceipt` from `backend/types/notifications/` | live exports verified |
| `backend/services/AGENTS.md` | removed the entire "## Cron Service (`backend/services/cron/`)" section (old :99–106 — queue-adapter.factory.ts, CRON_QUEUE_BACKEND, cron-worker.runtime.ts, job-handler-registry.ts, CronService.dispatchDueSchedules, CronJobKind) | zero of these exist in code or git history |
| `.env.example:157` | removed "# Validated at build time with cron-parser" | cron-parser package removed (0 code refs); build-time validation surface never existed |

## D13 — phantom references

**Verification first:** `rg "APPEARANCE|AppearanceFields|readAppearanceFromEnv|APP_BRANDING"` in backend/frontend/shared/app code → 0 matches (zero consumers); `backend/services/appearance/` absent; `shared/types/`, `shared/messages/`, `shared/utils/` absent (only `constants/ i18n/ lib/ locale/ schemas/` remain); `frontend/types/` contains only `apollo-client.d.ts`; `docs/backend/types-consolidation.md`, `docs/architecture/import-export-conventions.md`, `docs/graphql/pothos-field-factories.md`, `docs/backend/shared-types-pattern.md`, `docs/services/cron-service.md`, `ai/plans/reexport-elimination/outcome/collisions-registry.md` all absent; `scripts/oxlint-categorize.ts` absent; `.github/copilot-instructions.md` + `.github/instructions/` absent.

| File | Edit | Evidence |
|---|---|---|
| `.env.example` (old 418–441) | removed the whole "Site Appearance — ENV Branding Override (Tier 3 fallback)" block (`NEXT_PUBLIC_APP_BRANDING` + `DEFAULT_APPEARANCE_FIELDS` + `readAppearanceFromEnv` + `appearance-settings.service.ts` + `AppearanceFields`/schema pointer); file now ends at the New Relic section (:416) | zero code consumers; service file never existed |
| `AGENTS.md` (root, old :448–450) | removed dead doc-reference rows: `docs/backend/types-consolidation.md`, `docs/graphql/pothos-field-factories.md`, `docs/architecture/import-export-conventions.md` | all 3 files verified absent |
| `AGENTS.md` (root, old :429 + :436) | removed paired dead doc rows: `docs/services/cron-service.md` (pairs with the D8 cron-section removal) and `docs/backend/shared-types-pattern.md` (pairs with the D13 shared/types row removal) | both files absent; leaving them would contradict the D8/D13 removals in the same changeset |
| `codegen.ts:4–6` | comment rewritten: dropped both phantom pointers (`@/shared/types/localized-string` — deleted in phase 2 as file #35; `@/frontend/types/localized-string.types` — never existed); now points at the LIVE `AppLocale` union from `@/shared/locale/AppLocale` and keeps the true self-contained rationale | phase2-t21 proof rows #31/#35; `AppLocale` verified at `shared/locale/AppLocale.ts:2` |
| `shared/AGENTS.md:39–43` | File Organization table: removed `shared/types/` (deleted dir), `shared/messages/` (deleted dir — the doc itself says so at :253), `shared/utils/` (deleted dir) rows; fixed `shared/constants/` examples to live files (`recitation-reading.enum.ts`, `iana-timezone.enum.ts`, `free-trial.constants.ts` — old examples `class-instance-detail.enum.ts`/`billing-months.ts`/`permission-group.enum.ts` are all phantom); added the live `shared/locale/` row | `ls shared/` verified |
| `shared/AGENTS.md:70,80–82,266–273` | adjacent prose made consistent with the table fix: "Extracting" step 1 subdirs now `lib/`/`constants/`; i18n Message Types bullets now point at live `shared/locale/types/` + `@/shared/constants/handshake-code.constants` (old examples BillingMonthId/AdminInvoiceStatus phantom); "Cross-Layer Shared Types Pattern" section rewritten — `shared/types/` mandate → canonical types live in `backend/types/` with type-only frontend consumption (live example: `RegistrationReturnType` in `frontend/lib/auth/withPageAuth.ts:30`), absent doc pointer dropped | all old symbols grep-verified 0 refs |
| `eslint.config.mjs` (old :237) | removed `"scripts/oxlint-categorize.ts"` from the no-console/sonar relaxation `files[]` (the `scripts/**/*.ts` glob stays, so lint behavior is unchanged — the removed entry matched no file) | file absent |
| `opencode.json` (old :3) | removed the `"instructions"` key (both entries — `.github/copilot-instructions.md` + `.github/instructions/**/*.instructions.md` — pointed at absent paths; an empty array key would be noise) | both paths absent |

## D14 — barrel-convention documentation refresh

| File | Edit | Evidence |
|---|---|---|
| `AGENTS.md:123–127` (root, old :125–136) | replaced "Barrel Files (`index.ts`) Conventions" (12-bullet barrel MANDATE: "always import from the highest available barrel", "every nested subdirectory MUST have its own index.ts", "max one `/` per path", collision-registry pointer) with a concise 4-bullet "Import & Barrel Conventions" section describing the ACTUAL convention: deep imports are the default (citing `shared/AGENTS.md` "prefer deep imports"); barrels only while genuinely consumed (knip flags unused barrels; 15 dead barrels removed in this wave); live examples cited — `@/backend/types` (~184 import sites), `@/backend/db/repo` (~62), `@/shared/locale` (~123), `@/shared/constants` (~13), `@/backend/services` (~20), plus the GraphQL side-effect barrels registered as knip entries; barrel mechanics (`export *` default, collision-only named re-exports, `./`-only paths, no imports except GraphQL side-effect layers, explicit `export type {}`) and the no-re-export-shims rule retained; dead pointers removed (`ai/plans/reexport-elimination/outcome/collisions-registry.md` + `docs/architecture/import-export-conventions.md` — both absent) | consumer counts grep-verified; `gqlSchema.definitions.ts:14` does `import "@/backend/graphql/pothos"`; knip.config.ts:22–26 registers the side-effect barrels |
| `AGENTS.md:120` (root) | Path Aliases example `import { logger } "@/backend/lib"` → `"@/backend/lib/logger"` (no `backend/lib` barrel exists — zero `from "@/backend/lib"` imports; deep import is the real pattern, already documented at :106) | `ls backend/lib/index.ts` → absent |

---

## References that turned out LIVE (kept, per instructions)

- `test/integration/AGENTS.md` redis surface — the `redis/` dir + smoke + `.env.example` redis keys (`REDIS_URL`, `UPSTASH_TEST_*`, `REDIS_CLOUD_TEST_REDIS_URL`) are live; redis rows/examples kept and used as the live replacement example everywhere.
- `docs/graphql/dataloader-batching.md` — exists; kept as the new builder.ts comment's pointer (also referenced from `backend/AGENTS.md`, `backend/services/AGENTS.md`, root `AGENTS.md:421`).
- `docs/notifications/realtime-engine.md` — exists; `backend/services/AGENTS.md:13` NotificationEngine row kept (emit contracts `emitForUser`/`emitForUsers`/`publishReceipts` are live exports).
- `NotificationRepository`, `RedisPubSubTransport`, `IoredisFanoutClient`, `getRedisUrl()` — live; used as the truthful replacement examples in the mock-guidance and gating sections.
- `app/api/cron/sweep-sessions` + `CRON_SECRET` — live; basis for the reworded README "Auth & Jobs" bullet.
- root `AGENTS.md` doc-reference list: ~26 further absent doc files (e.g. `docs/frontend/duplication-elimination-patterns.md`, `docs/services/meeting-providers.md` + whatsapp/zoom refs, `.github/CODE_REVIEW_CHECKLIST.md`) were verified absent but are NOT part of D2/D8/D13/D14 — pre-existing aspirational references, several explicitly annotated "(doc file absent — pending ticket)". Left untouched; orchestrator decision needed for any wholesale doc-registry pass.

## Observations / follow-ups (out of this wave's scope — flagged for the orchestrator)

1. `package.json` `test:cron` script targets `backend/services/cron/test/` + `backend/lib/cron-auth.test.ts` — both absent (pre-existing broken script; same never-existed cron surface as D8, but package.json is outside this docs wave's boundary).
2. `shared/schemas/appearance.schema.json` survives but is now fully unreferenced after the `.env.example` appearance-block removal (the ledger's D13 row also notes its :5 "mirrored from backend/types/appearance.types.ts" comment is stale). File deletion is outside this wave's text-only boundary — recommend a paired deletion in a future wave.
3. `.env.example` keeps phantom env keys with zero code consumers: `PUSH_PROVIDER=fcm`, `RESEND_*`, `TWILIO_*`, `SIGNED_URL_CLEANUP_CRON_SCHEDULE`, `CRON_FX_REFRESH_SCHEDULE`, `CRON_TICKER_SCHEDULE`, `CRON_EXTERNAL_*` (only `CRON_SECRET`/`CRON_EXECUTION_MODE` are consumed — by `app/api/cron/sweep-sessions`). Outside D8/D13's named `.env.example` scope (cron-parser comment + appearance block only).
4. `test/integration/AGENTS.md:45,96` still tells agents to document new env keys in `environment.d.ts` — that file does not exist anywhere.
5. `backend/services/AGENTS.md` "Seed services (`backend/services/seed/`)" section + "Hot-resolver & Read Caching (`EntityCacheService`)" section + the WhatsApp/meeting sections describe code with no current implementation (the latter two are explicitly annotated as pending-ticket docs); `backend/AGENTS.md:34` cachedRead bullet likewise. All kept — outside the named D-items.
6. `README.md:100` "Integrations — Zoom, Google Meet, WhatsApp, Twilio, Stripe-style billing, email providers": no Zoom/Meet/WhatsApp/Twilio/email adapter code exists (only billing + redis are real). Twilio was not in D8's README scope (BullMQ/pg-boss only); left as-is for the orchestrator.
7. Root `AGENTS.md:339–344` "Instruction files (`.github/instructions/*.instructions.md`)" table: the directory does not exist (same phantom as the opencode.json entry); the sub-loop discovery machinery handles absence gracefully. Not in the named D-items; left untouched.
8. `backend/lib/api/index.ts:4` comment still says "Consumers import from the highest available barrel" — code file, outside this wave's boundary; contradicts the new D14 policy text only in tone (the api barrel itself IS live and consumed).

## Verification gates (post-edit)

```
bun run check:unused   → exit 0   (1 informational config hint: .mdx compiled-extension exclusion — pre-existing, documented no-action)
timeout 240 bun run tsgo → exit 0 (0 errors; codegen.ts + eslint.config.mjs are in the graph)
bunx @biomejs/biome check . → exit 0 (1418 files checked, no fixes applied — non-mutating)
curl http://localhost:3000/  → HTTP 200
```

Text-only edits confirmed: no source-code logic touched; the only non-docs files edited are the explicitly-allowed comment block (`builder.ts:15–18`), `codegen.ts` comment, `eslint.config.mjs` files[] entry (dead glob removal — zero lint-behavior change), and `opencode.json` dead instructions key. No linter silenced, no tests run, no build, no git mutations.
