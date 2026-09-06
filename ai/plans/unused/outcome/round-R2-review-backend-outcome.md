# R2 review-backend outcome (fresh iteration 2)

Pin: `feat/clean-unused` (bash /home/z/pin-feat.sh → OK).
Scope: 80 files changed under `backend/` + `scripts/` (1c134db..HEAD). Baseline clean; gates green (tsgo 0, knip 0). Judged independently from the diff only.

## Focus 1 — Semantic dead-code sweep (20 most-modified backend files)

Checked every remaining export in the 20 highest-churn files (platform-analytics.pothos, db/index, types/index, admin-user-governance-filter.enum, auth.types, pglite-pool, admin-user.pothos, gqlContextFactory, recitation-catalog.service, builder, auth.service, scalar.pothos, api-error.types, error-masking/index, error-masking-readers, userFieldHelpers, user.repository, admin-user-row-types, gateway-context.types, notification-engine.service) plus every namespace member of `AuthService` / `UserRepository` / `RecitationCatalogService` / `NotificationEngine`, all Pothos objects/inputs, and all row/error types. All have live external consumers except:

- [MEDIUM] backend/lib/errors/error-masking/error-masking-readers.ts:38 — `export type ReadOutcome` has ZERO external consumers; its only use is as the return annotation of the same file's exported `readProperty`/`readIndex` (repo-wide grep incl. the `error-masking/index.ts` `export *` barrel). knip-blind form (type-only export; knip `includeTypeExports` defaults to off). The diff un-exported the sibling same-file-only symbols (`GraphQLPathSegment`, `RAW_ERROR_HOP`) but missed this one — per the plan's own rule ("only use inside its own file → drop the `export` keyword, keep the symbol") the export keyword should have been dropped.
- [MEDIUM] backend/db/index.ts:288 — `export type { QueryResult, QueryResultRow };` re-export has ZERO external consumers: neither name is imported anywhere else in the repo (repo-wide grep incl. multiline `import {...} from` forms; `pglite-pool.ts` hits are doc comments about `pg`'s types, not imports). Both types are used only inside `db/index.ts` itself (`queryDb` signature + shim result construction). The diff edited this exact line (dropped `PoolClient` from it) but left the remaining zero-consumer re-export in place; the whole line should have been deleted (the `pg` type import on line 21 stays for in-file use).
- Verified NOT findings: `DateTimeScalar` export removal is safe — `scalar.pothos.ts` is side-effect-imported by `gqlSchema.definitions.ts:15`, so the `DateTime` registration still executes; all 10 un-exported `PlatformAnalytics*PothosObject` consts remain in-file referenced (2 refs each); `noUnusedLocals: true` confirms no dead locals were created; `getDrizzleDbPool`, `NOTIFICATION_INBOX_DEFAULT_PAGE_LIMIT`, `NotificationEngineCallOptions` and all pglite-pool types have external consumers.

## Focus 2 — Behavioral regression risk (6 deleted symbols)

- `AuthService.getMe`: 0 findings — zero orphaned callers (only false positives `getMeetingChannel`/`getMessages()`); `me` query (backend/graphql/query/auth.query.ts:44-48) resolves from `ctx.user`, no getMe dependency; auth.service.ts header + user.repository.ts JSDoc + services AGENTS.md pointer line all updated.
- `validateReading` export: 0 orphaned callers (kept as private fn, used by `validateOptionalReading`/`listReadings`); service JSDoc updated to "Private validation primitive".
  - [LOW] docs/auth/qiraah-selection-and-c5.md:293,515,533 — still instructs consumers to use `RecitationCatalogService.validateReading(...)` as the public validation entry (incl. a future `setMyPreferredRecitation` mandate). Stale after the un-export; the live public entry is `validateOptionalReading` — a future implementer following the doc will not compile.
- `INITIAL_DEMO_PLANS` export (barrel re-export `backend/db/seeds/billing/index.ts`): 0 findings — symbol still legitimately exported at seed-plans.ts:18 with live consumer `backend/db/test/logic/billing/plan-seed.test.ts`; no comment block still advertises the barrel re-export.
- `publishAfterCommit`: 0 findings — un-exported (notification-engine.publish.ts:23), in-file consumer line 63; no external references.
- `NOTIFICATION_INBOX_MAX_PAGE_LIMIT`: 0 findings — un-exported const (notification-engine.inbox.ts:7), in-file consumer line 38; service re-export line trimmed correctly; no remaining references anywhere.
- `RAW_ERROR_HOP` export: 0 findings — un-exported (error-masking-readers.ts:104), used in-file by `attachRawErrorHop`/`readRawErrorHop`; the barrel's doc comment (error-masking/index.ts:35) correctly rewritten to "module-private `RAW_ERROR_HOP` symbol"; the two test-file mentions are behavior-describing comments that remain true.

## Focus 3 — Transaction/pool chain

0 findings — `git grep -c withTransaction` summed over `backend/`: baseline 79 = current 79; per-file counts byte-identical (diff of sorted per-file lists = empty). `backend/lib/db/index.ts` barrel deletion left no orphaned importers; deep modules `with-transaction.ts` + `escape-like-wildcards.ts` exist and are consumed; docs already point at the deep paths.

## Focus 4 — Layer boundaries

0 findings — `git diff 1c134db HEAD | grep "^+" | grep -E 'from "@/frontend|from "@/app'` yields exactly one hit: `+import { isSafeRedirect } from "@/frontend/lib/safeRedirect";` which is a markdown code example inside `shared/AGENTS.md`'s "Negative Pattern (PROHIBITED)" block (illustrating a wrong-layer import) — not a code import. No code file added any `@/frontend`/`@/app` import.

## Focus 5 — package.json dependency integrity (112 removed packages)

0 findings on the spec'd surface — 15-name spot check (postcss, tailwindcss, autoprefixer, ts-node, tsconfig-paths, ts-jest, jest, lint-staged, mermaid, nodemailer, qrcode, uuid, validator, moment-hijri, lucide-react) PLUS a full 112-name sweep over `.github/`, all root `*.config.*`/`*.json`/`*.mts`/`*.mjs`/`bunfig.toml`/`codegen.ts`, and the extended surface (`.storybook/`, `.husky/`, `.dependency-cruiser.js`, `.jscpd.json`, `.coderabbit.yaml`, `.devcontainer/`, `.vscode/`, Caddyfile, `.vercelignore`) + a repo-wide `"name"` import sweep: ZERO live references to removed packages. Only false-positive substring hits (`@graphql-codegen/typescript-operations`, `globals`/`globalIgnores`, the `validate:mermaid` script-name alias — that script is self-contained, "NO npm deps"). All 10 `knip.config.ts` `ignoreDependencies` entries are still installed in package.json. CI workflows reference only kept scripts/bins; removed scripts (`prebuild`, `test:live-fx`, `test:live-comm`) have zero remaining references anywhere.
- [LOW] .env.example:276-310 — stale provider block: `EMAIL_PROVIDER=resend`, `SMS_PROVIDER=twilio`, `PUSH_PROVIDER=fcm` + Resend/Twilio/Firebase credential keys, yet zero code reads any of those env vars (all provider packages removed; grep over backend/frontend/app/shared/scripts = 0 hits). Documentation-only staleness (no runtime consumer — not CRITICAL); the block was equally stale at baseline, but the package removals in this diff made it reference removed packages.

## Focus 6 — Scripts integrity

0 diff findings — every file path referenced by every current package.json script was existence-checked (incl. the preloads `test/ui/components/{happydom,translation,next-dynamic}-preload*`, `test/ui/mobile-desktop-isolation.test.ts`, all `scripts/**` and `test/scripts/**` runners, `drizzle.config.sqlite.ts`, `.dependency-cruiser.js`, `codegen.ts`, and the new `check:unused` → `node_modules/knip/bin/knip-bun.js`): all exist. The diff's script changes are: removal of `prebuild`/`test:live-fx`/`test:live-comm` (no remaining references anywhere; the scripts they removed referenced paths that were already absent at baseline) and addition of `check:unused` (valid). `tsgo` chain (`scripts/restore-next-env-dts.ts` → `@/scripts/lib/restore-next-env-dts` deep module → `scripts/lib/run-locked-cmd.ts`) fully resolves.
- [INFO, pre-existing — NOT introduced by this diff] package.json scripts `test:cron`, `cron:worker`, `test:simulate` reference paths that are absent BOTH at baseline 1c134db and HEAD: `backend/db/test/repo/cron.repository.test.ts`, `backend/lib/cron-auth.test.ts`, `backend/services/cron/test/`, `scripts/cron-worker.ts`, `test/simulate/`. The script lines are byte-identical to baseline, so these are baseline issues outside this review's diff filter — reported for orchestrator awareness only.

## Totals

- MEDIUM: 2 (incomplete knip-blind export cleanup: `ReadOutcome`, `QueryResult`/`QueryResultRow` re-export)
- LOW: 2 (stale docs: qiraah `validateReading` public-API references; `.env.example` resend/twilio/fcm provider block)
- HIGH: 0 · CRITICAL: 0
- Categories with 0 findings: F2 orphaned callers (0 across all 6 symbols), F3 (transaction chain identical), F4 (layer boundaries), F6 (script integrity — diff surface).
