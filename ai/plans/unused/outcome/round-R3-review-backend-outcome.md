# R3 review-backend — Deep Invariant Verification (fresh iteration 3)

- **Pin**: `feat/clean-unused` (via `/home/z/pin-feat.sh`)
- **Scope**: `git diff 1c134db HEAD -- backend/ scripts/` (~80 files, +116/−1022) — deletion-only unused-code cleanup
- **Method**: baseline-vs-HEAD diff analysis only; every check below re-derived from the current tree (no reliance on prior round outcomes)
- **Baseline-clean filter applied**: pre-existing issues identical at `1c134db` are not reported.

## Focus 1 — Service-layer invariants (most-deleted-in `backend/services/`): **0 findings**

All 8 code files touched in the service layer were enumerated (AGENTS.md is the 9th, doc-only) and every remaining public symbol was grep-verified to have ≥1 caller:

- `backend/services/auth/auth.service.ts` (−25): `AuthService.getMe` deleted — 0 orphaned callers repo-wide (only historical plan/archival mentions). Remaining `login` (7 files) / `refreshToken` (2) / `updateMyLocale` (2) all called; all imports still live (`UserRepository.findById` keeps 8+ other callers — no second-order orphan).
- `backend/services/shared/recitation-catalog.service.ts`: `validateReading` export-dropped, in-file consumer line 76 (`validateOptionalReading`); `RecitationCatalogService.listReadings` / `validateOptionalReading` each have external callers.
- `backend/services/notifications/*` (engine.service / publish / inbox): `publishAfterCommit`, `NOTIFICATION_INBOX_MAX_PAGE_LIMIT` un-exported with in-file consumers (publish.ts:63, inbox.ts:38); engine re-export line trimmed in lockstep. All 7 `NotificationEngine.*` methods have 4–11 caller files; all 3 inbox helpers consumed by `notification-engine.service.ts`.
- `backend/services/billing/wallet.service.ts`: `WALLET_LEDGER_PAGE_LIMIT` un-exported, in-file consumer line 117; `WalletService.getMyWallet` / `requestWithdrawal` each have 2 external caller files.
- `backend/services/admin/user-management.helpers.ts`: `truncateSafely` un-exported, in-file consumer line 340; all 10 remaining exports have ≥1 external caller.
- `backend/services/shared/user-provisioning.helpers.ts`: `generateHandshakeCode` un-exported, in-file consumer line 139; `isUniqueViolation` (8 files), `createRoleChild` (4), `createStudentWithHandshakeRetry` (2) all called; `registration.service.ts:50` docblock ("primitives live in `@/backend/services/shared`") remains truthful — registration imports 3 of them via that barrel.
- `backend/services/AGENTS.md` paired doc edits verified truthful: `backend/services/cron/` does not exist at HEAD **nor at baseline** (stale section correctly dropped); `NotificationEmitInput` / `NotificationDeliveryReceipt` (backend/types/notifications/notification.types.ts:47,81), `RedisPubSubTransport` / `IoredisFanoutClient` (backend/services/notifications/realtime/), and `NotificationRepository.createManyReturning` (notification.repository.ts:148) are all live symbols.

## Focus 2 — DB schema/repo coherence: **0 findings**

- Extracted all 88 symbols deleted/un-exported from the diff (`export type/interface/const/function/class` minus-lines) and swept them repo-wide (`app/ frontend/ shared/ backend/ scripts/ test/`): every remaining mention is either the kept module-private declaration, an in-file consumer, or a string literal inside the `contracts.static-assertions.test.ts` EXEMPT_TYPES whitelist (string-based file scanner, no type import). Zero dangling references.
- Deleted type aliases with zero references include `ApiSuccessEnvelopeReturnType`, `GraphQLErrorExtensionsType`, `GatewayRequestMetadata`, all `*InsertType`/`*SelectType` pairs removed from `backend/types/**` (e.g. `WalletInsertType`, `AdminInsertType`, `ParentLinkRequestInsertType`, `Lesson/Progress/Recitation/HomeWork*`, `TeacherVerification*`, …).
- Repos still type rows via `$inferSelect`-derived aliases: `UserSelectType` / `ParentLinkRequestSelectType` / `StudentSelectType` live (`typeof x.$inferSelect`), row interfaces use indexed access (`UserSelectType["role"]`) and `queryDb<RowType>` generics; 3 repo files use `$inferSelect` directly. Zero `as any` / `as unknown as` in `backend/db/repo/`; no `as`-cast or JSDoc reference to any deleted type alias.
- Deleted `backend/lib/db/index.ts` barrel: zero remaining `@/backend/lib/db` (barrel) imports — only deep `@/backend/lib/db/with-transaction` imports remain (module exists, exports `withTransaction`). `backend/lib/db/` now = `with-transaction.ts` + `escape-like-wildcards.ts`, both deep-imported only.
- Deleted `backend/db/introspection/` dir (5 files, 9 interfaces + 9 functions): zero references to any symbol anywhere in backend/scripts/test.
- Deleted Pothos barrels (`pothos/billing/index.ts`, `pothos/parents/index.ts`) were re-export-only; leaf modules (`plan.pothos`, `wallet.pothos`, `parent-link-request.pothos`) register via direct resolver imports (query/mutation leaf files) — registration chain intact; `parent-link.static-locks.test.ts:157` path pair points at the still-existing `pothos/parents` directory.

## Focus 3 — JSDoc/comment integrity (`@link|@see|@typedef` on added lines): **0 findings**

`git diff 1c134db HEAD -- backend/ | grep "^+" | grep -E "@link|@see|@typedef"` yields exactly one added doc-tag line:

- `backend/lib/errors/error-masking/index.ts` — `{@link attachRawErrorHop}` → target is a live export (`error-masking-readers.ts:111`); the co-mentioned module-private `RAW_ERROR_HOP` symbol also still exists (`error-masking-readers.ts:104`). LIVE reference — no finding.

Kept doc lines in modified files were cross-checked against the deleted-symbol sweep (Focus 2): no kept `@link`/`@see`/`@typedef` references a deleted symbol.

## Focus 4 — Seed script chain (static trace): **0 findings (diff-scoped)**

`backend/db/scripts/drizzleSeed.ts` (knip `entry: backend/db/scripts/**/*.ts` + `backend/db/seeds/index.ts`) → `runAllSeeds` → all three steps resolve to live functions:

- `seedOrGetUsers` ← `users/index.ts` re-export of `seed-users.ts:51 seedOrGet` ✓
- `seedOrGetPlans` ← `billing/index.ts` re-export of `seed-plans.ts:62 seedOrGet` (`INITIAL_DEMO_PLANS` trim from the barrel has 0 external references) ✓
- `seedOrGetStudents` ← `students/index.ts` re-export of `seed-students.ts:38 seedOrGet`; its `INITIAL_DEMO_USERS` import still resolves (still exported) ✓
- lib helpers `loadSeedConfig` / `runSeedStep` / `logFailedSeedSteps` + `SeedConfig` / `SeedStepResult` all resolve through `seeds/lib/index.ts` (`export *` → run-seed-step.ts:13, seed-config.ts:3/31) ✓
- Service dependencies live: `RegistrationService`, `PlanCatalogService`, `StudentTrialService`, `logger` ✓
- Seeds AGENTS.md enums-pointer edit (`shared/lib/enum.ts` → `backend/db/schema/enums.ts`) verified: `shared/lib/enum.ts` does not exist, `backend/db/schema/enums.ts` does.

*Non-diff observation (baseline-stale, not counted per filtering rule):* `orchestrateSeedMany` referenced in `backend/db/seeds/AGENTS.md` (lines 14/56/65/124) has never existed in code — identical phantom references exist at baseline `1c134db`, so this is a pre-existing doc issue, not introduced by this changeset.

## Focus 5 — `pglite-pool` + `db/index` surface after R2 fixes: **0 findings**

- R2 fix (81f2eee) removed `export type { QueryResult, QueryResultRow }` from `backend/db/index.ts`; `db/index.ts` still imports both types directly from `pg` (line 21) for the `queryDb<T extends QueryResultRow>` signature — no consumer anywhere imports them from `@/backend/db` (repo-wide grep clean).
- `pglite-pool.ts` surface fully consumed: `Row` / `QueryResultLike` / `PgQueryConfig` / `PoolClientLike` / `PglitePoolLike` / `getPglitePool` / `closePglite` — sole consumer `backend/db/index.ts`, which bridges `QueryResultLike` → full `pg.QueryResult` (constructs the 7-property `FieldDef` with documented defaults; grep confirms no repo/service reads `fields` of a query result).
- `db` / `queryDb` / `closePool` / `getDrizzleDbPool` all exported with live consumers (`migrate.ts`, `drizzleSeed.ts`, `scripts/ops/*`, services, journey tests). The PGlite lazy-thenable satisfies `AnyPool` without `as` casts (type-guard + `assertPoolLike` assertion function).
- R2's `ReadOutcome` export-drop verified: kept module-private in `error-masking-readers.ts:38`, used by `readProperty`/`readIndex` in-file.

## Suppression check (hard-rule invariant)

Zero added `*-disable` / `biome-ignore` / knip blanket-ignore lines in the backend+scripts diff. `knip.config.ts` additions are `entry:` registrations (path-invoked scripts/test runners) with one-line justification comments — the plan-sanctioned mechanism, not suppressions.

## Verdict

**0 findings** across all five focus categories (2 non-diff observations noted inline: pre-existing `orchestrateSeedMany` doc phantom; pre-existing baseline-stale doc references are out of diff scope). The deletion-only cleanup preserves service-layer, DB/repo-type, doc-tag, seed-chain, and DB-client-pool invariants.
