# R3 review-types — Exhaustive export-census re-review (fresh context, iteration 3)

- Pin: `feat/clean-unused` (bash /home/z/pin-feat.sh → `feat/clean-unused`)
- Diff base: `git diff 1c134db HEAD --stat` → 215 files changed, 3845 insertions(+), 6859 deletions(-)
- Universe: 167 surviving + 48 deleted files. Surviving TS-family files: 115; of those 110 are export-bearing (census scope). Non-TS touched files (md/sql/json/yml/sh/css/snap/png) are not export-bearing.
- Method: scripted export extraction (declaration, brace-list, default, `export *`) per touched file → word-boundary `rg` consumer search across `app/ backend/ frontend/ shared/ scripts/ test/` + md/doc sweep (`docs/`, `AGENTS.md` trees) + `git grep` at baseline 1c134db for orphan-vs-preexisting discrimination. Gates (tsgo 0, knip 0) reported green by orchestrator; not re-run (read-only review).
- ~510 exported symbols audited (backend 184 / frontend 123 / test 70 / shared 13 / scripts 22 / root configs).

## Category 1 — Remaining-export census (knip-blind forms: type-only exports, `export type {}` re-exports, namespace members, class methods)

**Diff-caused orphaned exports: 0 findings.** Every zero-consumer candidate was cross-checked at baseline 1c134db — none had importers there either (nothing the diff deleted left an export orphaned).

`export type {}` re-exports / `export * as ns from` / `export { type X } from` forms: 0 occurrences in touched files.
Namespace members (7 touched `export namespace` modules — UserRepository, ParentLinkRepository, ParentLinkRequestReminderRepository, AuthService, WalletService, NotificationEngine, RecitationCatalogService): all exported members have live `Ns.member` call sites; all zero-hit names were namespace-internal (non-exported) helpers → 0 findings.
Class methods (5 touched class files — RedisClaimCache, IoredisFanoutClient, InProcessTransport, RedisPubSubTransport, DomainError tree): all public methods have production call sites (`emit-idempotency.ts:89/118` claim/store; `notification-engine.publish.ts:31` publishFanout; `backend/ws/notification-ws-server.ts:131` subscribeFanout) → 0 findings.
Barrel re-exports: all 16 touched barrels resolve to live files; spot-verified named re-exports all consumed (`seedOrGetPlans` → `backend/db/seeds/index.ts:1,24`; `setupTestServerLifecycle` → 6+ frontend/graphql tests; `MuiProvider` → `AppClientProviders.tsx`; `useAppLocale` shim → 27 consumers) → 0 findings.
Default exports: all non-`app/` defaults are tool entry configs (`knip.config.ts`, `eslint.config.mjs`, `codegen.ts`); all touched `app/` files are framework entries (page/layout/route/not-found) → 0 findings.

**Pre-existing (baseline-identical) knip-blind zero-consumer type exports remaining in diff-touched files: 26 symbols / 17 files — [LOW], not diff regressions, listed for the record.** These are type-only exports used exclusively inside their own file (return-type/param positions in exported signatures — the form knip counts as "used", hence knip exit 0). Grep evidence for each: `rg -w <NAME>` over `app/ backend/ frontend/ shared/ scripts/ test/` = 0 files outside the defining file; `git grep -w <NAME> 1c134db -- '*.ts' '*.tsx'` = 0 importers at baseline. Per plan Phase 3 the remedy is dropping the `export` keyword (keep the symbol), not deletion:

- [LOW] backend/lib/auth/server-auth.ts:45 — `export interface ServerUserContext`: zero external consumers (only `getServerUserContext()` return type, in-file); baseline-identical.
- [LOW] backend/lib/env.ts:196 — `export interface EnvironmentConfig`: zero external consumers (in-file `cachedConfig`/`readEnvironment`/`getEnvironmentConfig` only); baseline-identical.
- [LOW] shared/locale/localeContext.tsx:6 — `export interface LocaleContextValue`: zero external consumers (in-file `createContext`/`useLocaleContext` only); baseline-identical.
- [LOW] scripts/lib/process-lock-helpers.ts:16 — `export interface ActiveLockInfo`: zero external consumers (in-file `getActiveLock`/`claimActiveLock` only); baseline-identical.
- [LOW] frontend/hooks/notifications/use-notification-mark-actions.ts:113 — `export interface NotificationMarkActions`: zero external consumers (return type of `useNotificationMarkActions` only); baseline-identical.
- [LOW] frontend/hooks/notifications/use-notification-realtime.ts:53 — `export interface UseNotificationRealtimeResult`: zero external consumers (return type of `useNotificationRealtime` only); baseline-identical.
- [LOW] frontend/lib/logger.ts:40 — `export interface LogMeta`: zero external consumers (in-file `prefix`/`logger.info/warn` params only); baseline-identical.
- [LOW] frontend/providers/apollo/utils/link-factories.ts:12 — `export type ObserverLike<T>`: zero external consumers (in-file observer params only); baseline-identical.
- [LOW] frontend/views/admin/plans/hooks/usePlanForm.ts:31 — `export interface UsePlanFormOptions`: zero external consumers (param type of `usePlanForm` only); baseline-identical.
- [LOW] frontend/views/admin/users/utils/adminUsersDirectory.helpers.ts:36 — `export interface DirectoryGovernanceFlags`: zero external consumers (param type of `directoryGovernanceOf` only); baseline-identical.
- [LOW] frontend/views/auth/register/registerFormUtils.ts:41 — `export type RegisterFieldPath`: zero external consumers (return of `isRegisterFieldPath` narrowing only); baseline-identical.
- [LOW] frontend/views/student/sessions/sessionRowSlotBook.ts:50 — `export interface SlotBookHelpers<K>`: zero external consumers (return type of `createSessionSlotBook` only); baseline-identical.
- [LOW] frontend/views/teacher/sessions/teacherSessionCacheArms.ts:54 — `export interface LifecycleMutationErrorWiring`: zero external consumers (param type of `handleLifecycleMutationError` only); baseline-identical.
- [LOW] frontend/views/teacher/sessions/teacherSessionCacheArms.ts:108 — `export interface TeacherActionsWiring`: zero external consumers (in-file wiring param only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:138 — `export interface SessionSuiteLabels`: zero external consumers (in-file `sessionSuiteLabels` return only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:182 — `export interface SessionWireRow`: zero external consumers (in-file wire-row factory only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:207 — `export interface SessionWireRowDefaults`: zero external consumers (in-file only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:249 — `export type SessionRowWireValues`: zero external consumers (in-file only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:252 — `export type SessionRowMetaLabels`: zero external consumers (in-file only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:284 — `export type StatusFilterToolbarLabels`: zero external consumers (in-file `expectStatusFilterToolbar` only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:348 — `export type CancelDialogShellLabels`: zero external consumers (in-file only); baseline-identical.
- [LOW] test/ui/components/helpers/containerSuiteScaffold.tsx:371 — `export type DisputeDialogGateLabels`: zero external consumers (in-file only); baseline-identical.
- [LOW] test/workflows/helpers/journey-actor-fixtures.ts:114 — `export interface JourneyFixtureBundle`: zero external consumers (return type of `createJourneyFixtures` only); baseline-identical.
- [LOW] test/workflows/helpers/journey-fixtures.ts:67 — `export interface GovernanceFixtureInput`: zero external consumers (in-field type of the fixture input only); baseline-identical.
- [LOW] test/workflows/helpers/journey-fixtures.ts:76 — `export type GovernanceStateType`: zero external consumers (in-file `applyGovernanceState` return only); baseline-identical.
- [LOW] test/workflows/helpers/session-cast.ts:131 — `export interface SessionJourneyCastOptions`: zero external consumers (param type of `createSessionJourneyCast` only); baseline-identical.

Excluded after verification: `frontend/providers/apollo/error-link.map.ts:39 export interface WireFieldError` — zero TS consumers BUT documented as an intentional layer-isolation wire shape in `docs/graphql/error-handling-contract.md:123` ("Structurally mirrored wire shapes (`WireFieldError`…) are intentional layer-isolation copies… keep all three in sync") → documented in-file-only status, not a finding.

## Category 2 — Deletion-completeness (diff-ADDED imports pointing at near-deletion targets)

**0 findings.**

- Diff-ADDED import specifiers (full `+`-line scan of the TS diff, incl. re-export forms): exactly 5 module refs — `./seed-plans` (→ live `backend/db/seeds/billing/seed-plans.ts`), `./skip-when-pglite` (→ live `test/helpers/skip-when-pglite.ts`), `@/scripts/lib/restore-next-env-dts` (→ live), `@/shared/locale` (→ live barrel), `pg` (→ `package.json:107` dependency). All resolve; none points at a deleted or near-deleted file.
- Near-deleted survivors: `frontend/utils/errorUtils.ts` (99→16 lines, pure deletions) retains only `isNetworkError`, consumed by `frontend/providers/apollo/utils/error-routing.ts`. Clean.
- Stale references to the 48 deleted module paths (string-path sweep across `app/ backend/ frontend/ shared/ scripts/ test/` + root configs): 4 textual matches, all benign — `siteFooter` (imports target live section files; only the barrel was deleted), `student-subscription(s)` / `teacher-verification` (live `backend/db/schema/**` files, distinct from the deleted `backend/types/**` files), `locale-tag` in `frontend/lib/i18n/format-date.ts:10` (comment about its own `resolveLocaleTag` + live `shared/locale/server.ts`, not the deleted `shared/lib/locale-tag.ts`).
- Deleted `.storybook/shims/node-process.ts`: zero remaining references in `.storybook/` or configs.

## Category 3 — Config-file type integrity

**0 findings** (1 INFO, pre-existing).

- `knip.config.ts`: all 13 `entry` paths exist and match ≥1 file (incl. `backend/db/scripts/` with 5+ ts files, all `backend/graphql/**` + `test/**` preload/runner entries); all 5 `ignore` path entries exist (`frontend/stories/`, `shared/constants/iana-timezone*.ts` ×3+, `backend/enum/**` ×4). No dead entry/ignore globs.
- `codegen.ts`: `schema` `./frontend/graphql/generated/schema.graphql` live; output `./frontend/graphql/generated/gql/graphql.ts` live; documents glob `./frontend/graphql/sharedDocuments/**/*.ts` matches 17 files (set byte-identical to baseline 1c134db — 17 in, 17 out, `diff` of listings empty); scalar `IanaTimezone` → `export enum IanaTimezone` live at `shared/constants/iana-timezone.enum.ts:4`.
- `apollo.config.json`: `localSchemaFile` schema path live.
- `graphql.config.yml`: schema path live; `documents` glob matches the live sharedDocuments set.
- [INFO] codegen.ts:35 — documents glob `./frontend/views/**/*.documents.ts` matches 0 files (repo-wide `.documents.ts` count = 17, all under `frontend/graphql/sharedDocuments/`). Pre-existing: the identical glob matched 0 files at baseline 1c134db too, and `ignoreNoDocuments: true` covers it — NOT a diff issue, recorded for a future config-tightening pass only.

## Verdict

0 MEDIUM/HIGH findings. 26 LOW (pre-existing, baseline-identical, knip-blind type-only zero-consumer exports in diff-touched files — missed `export`-keyword cleanup opportunities, symbols alive in-file) + 1 INFO (pre-existing codegen dead glob). The deletion-only cleanup diff itself is deletion-complete and type-integral: no orphaned exports, no fragile imports, no dangling config paths/types.
