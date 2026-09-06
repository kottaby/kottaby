# R1 review-backend — Backend Review Outcome (fresh iteration 1)

**Reviewer:** review-backend subagent · **Pin:** `feat/clean-unused` ✓ · **Baseline:** `1c134db` → HEAD (`83c8c0c`)
**Scope:** `git diff 1c134db HEAD -- backend/ scripts/` — 78 files, +109/−1013 (11 deleted files, 4 deleted barrels, 16 `*PothosObject` export-drops, `AuthService.getMe` deletion, `getClient` deletion, introspection dir deletion, seeds export-drop).

**Verification commands run (read-only):**
- `timeout 240 bun run tsgo` → **EXIT 0** (0 errors; chain completes, incl. restore-next-env-dts step)
- `bun run check:unused` (knip) → **EXIT 0**; 1 remaining config hint (`.mdx` — documented in phase6 outcome)
- `bunx @biomejs/biome check backend/graphql/pothos/ backend/graphql/query/ backend/graphql/mutation/ backend/services/ backend/db/` → clean (272 files, no findings)
- No test runs, no dev-server touch, no lint suppression, no git ops beyond pin.

---

## Findings

### Architecture compliance — ZERO code findings
- Diff-introduced import lines grepped for `@/frontend|frontend/|@/views|@/hooks|@/stores|@/components` → **zero matches**.
- Current `backend/` tree grepped for frontend-layer imports → **zero matches** (layering intact).
- Deleted barrels (`backend/lib/db/index.ts`, `pothos/billing/index.ts`, `pothos/parents/index.ts`, types-domain barrels) all had zero barrel-path importers at deletion time (proof in `phase2-t21-files-proof-outcome.md`; re-verified by grep — all survivors import deep: `@/backend/lib/db/with-transaction` ×9, `@/backend/lib/db/escape-like-wildcards` ×2, pothos leaves imported directly by root-field modules). No layering break.

### Race conditions / TOCTOU — ZERO findings
- `backend/lib/db/with-transaction.ts` untouched; `withTransaction` → `db.transaction` (Drizzle) path intact with 9 direct service consumers + notification-engine's own helper.
- `getClient` deletion (commit `affb113`): repo-wide word-boundary grep shows **zero remaining consumers** (only stale comments — see LOW findings below). No consumer was left mid-chain.
- Pool surface intact: `backend/db/index.ts` still exports `db` (Drizzle via `getPoolForDrizzle`+`assertPoolLike`), `queryDb`, `closePool`, `getDrizzleDbPool` (live consumer: `backend/db/scripts/migrate.ts`). `getPool` correctly de-exported as duplicate-export canonicalization (consumers use the `getDrizzleDbPool` alias).
- PGlite shim `connect()` + `PoolClientLike` retained — still required by Drizzle's `NodePgSession` transaction path (`db.transaction` → `pool.connect()`); deleting `getClient` did not orphan the shim's connect surface.
- No lock-related code touched: diff contains zero matches for `SKIP LOCKED|FOR UPDATE|advisory|withLock`; live locking surface (teacher.repository, session-lifecycle.*) unchanged.

### Seeds integrity — ZERO findings
- Runner chain intact: `backend/db/scripts/drizzleSeed.ts` → `runAllSeeds` (`backend/db/seeds/index.ts`) → `@/backend/db/seeds/billing` barrel (retained, now exporting only `seedOrGetPlans`) → `seed-plans.ts`.
- `INITIAL_DEMO_PLANS` export-drop was the **barrel re-export only**; the leaf `backend/db/seeds/billing/seed-plans.ts` still exports it with a live consumer (`backend/db/test/logic/billing/plan-seed.test.ts` imports from the leaf).
- `SeedProfile` de-export is own-file-only (used by `parseSeedConfig`/`loadSeedConfig` in-file); `SeedConfig` remains exported with live consumers (`seeds/index.ts`, `seed-users.ts`, `drizzleSeed.ts` via lib barrel).
- Path-invocation surface registered as knip **entries** (`backend/db/scripts/**/*.ts`, `backend/db/seeds/index.ts`) — retained, not silently ignored.

### GraphQL / Pothos — ZERO findings
- All 16 `*PothosObject` export-drops verified: each const is still constructed in-file via `gqlSchemaBuilder.objectRef(...).implement({...})` (registration side effect preserved) and still referenced in-file as a field `type:` (e.g. `admin-user.pothos.ts:275/280/285`, `platform-analytics.pothos.ts:240`, `wallet.pothos.ts:143`, `audit-trail.pothos.ts:61`, `admin-user.pothos.ts:116`).
- Registration chain intact: `gqlSchema.ts` → `gqlSchema.definitions.ts` → `pothos/index.ts` (notifications) + `scalar.pothos` + `enum.pothos` + `mutation/index.ts` + `query/index.ts`; parents/billing/admin leaves register via direct leaf imports in `query|mutation/{parents,billing,admin}/*` (grep-verified) — the deleted `pothos/parents/index.ts` and `pothos/billing/index.ts` barrels had no other importers.
- `DateTimeScalar` export-drop safe: zero remaining symbol importers (tsgo confirms); the module is still loaded by side effect from `gqlSchema.definitions.ts:15`, **before** the mutation/query field-registration imports (lines 17–18) and before `toSchema()` in `gqlSchema.ts` — name-based `type: "DateTime"` references resolve. All other `scalar.pothos` mentions in the tree are comments.
- Static-scanner safety: `parent-link.static-locks.test.ts` corpus guards scan the `backend/graphql/pothos/parents` **directory** (≥1 source required — leaf survives) — barrel deletion does not break the lock suite.

### Dead code / knip blind spots — ZERO findings
- knip EXIT 0; scoped biome clean over all touched dirs (no unused imports/locals left behind by the deletions).
- Entry-file blind spots checked manually: `scripts/lib/index.ts` barrel has 10+ live consumers; `NOTIFICATION_INBOX_DEFAULT_PAGE_LIMIT` re-export in `notification-engine.service.ts` has a live consumer (`notification.query.ts`); `GraphQLResponsePath` consumed by `error-masking-item.ts`; `getDrizzleDbPool` consumed by `migrate.ts`. `pothos/index.ts` `export * from "./notifications"` is the documented registration entry (AGENTS/knip entry), not dead surface.
- Export-dropped symbols verified own-file-used or genuinely dead via repo-wide grep (truncateSafely, generateHandshakeCode, publishAfterCommit, WALLET_LEDGER_PAGE_LIMIT, NOTIFICATION_INBOX_MAX_PAGE_LIMIT, OPERATION_NAME_MAX_LENGTH, validateReading, Raw* types, ExpiryReminderClaimRow, RAW_ERROR_HOP, GraphQLPathSegment, resolveUserRole/resolveNullableUserGender, SeedProfile, isPidAlive, resolveEnvConfig, Logger).

### Restoration risks (dynamic / string-form references) — ZERO code findings
- No `await import(...)` or string literals reference any deleted module path (`db/introspection`, `lib/db` barrel, `pothos/parents|billing` barrels, deleted `*.types.ts` files) in code/configs/workflows — grep-verified (only historical `ai/plans/**` and `ai/finished_plans/**` docs mention them, which is expected).
- `contracts.static-assertions.test.ts` allowlist was updated in-step with the `ContractErrorCode` deletion.
- String-form scanner tests (`handshake-code-immutability-scan.test.ts`, `session-lifecycle.service.test.ts` import-assertion `@/backend/lib/db/with-transaction`) all reference surviving symbols/files.
- The two deleted-symbol doc remnants that DID survive are logged as LOW findings below.

### knip.config.ts ignores — compliant (with one INFO observation)
- All newly added ignore entries carry grep-verified justification comments: `payment-status` (live `payment_status` pgEnum + migration 20260904084151), `register-public-role` (Pothos-registered enum), `surah-juz-ref` (live pgEnum, Pothos pending), `recitation-reading` (documented re-export shim), IANA glob (codegen output, `Object.values()` consumption). No silent suppressions.
- Net improvement: legacy blanket ignores (country/permission enums, i18n namespaces barrel, meeting barrel, whatsapp cloud-api barrel, payment-method catalog, `storage/**`, `**/*.d.ts`) were **removed**, and path-invoked surfaces were registered as **entries** (not ignores). Remaining `.mdx` config hint is documented in phase6 outcome.

---

## Issue list (stale-reference / documentation only — no code defects)

- **[LOW] docs/auth/user-registration.md:287** — stale symbol pointer: "`query me` → `AuthService.getMe(ctx)`". `AuthService.getMe` was deleted in this changeset (commit `affb113`); the `me` query (`backend/graphql/query/auth.query.ts:32`) resolves the user from the GraphQL context (identity materialized by `gqlContextFactory`), matching the doc's behavioral description but not the symbol. The Phase 5 docs-truthfulness wave updated `backend/services/AGENTS.md` and the auth.service docblocks but missed this docs file. Evidence: grep repo-wide → only this doc line references `getMe` in shipped docs.
- **[LOW] backend/db/pglite-pool.ts:7** — stale docblock: module header still advertises "keeps the same `db`/`pool`/`queryDb`/`getClient` API" — `getClient` was deleted (only `assertPoolClientLike`'s sibling comment at line 57 was updated; this line was missed). Misleads future maintainers about the shim's contract surface.
- **[INFO] backend/db/index.ts:218** — `queryDb` docblock says "Preferred for read-only introspection dashboards"; the only introspection consumer (`backend/db/introspection/**`) was deleted in this changeset. Phrasing is generic enough to be harmless, but the named consumer class no longer exists.
- **[INFO] shared/schemas/appearance.schema.json:5** — description still claims "Source of truth mirrored from `backend/types/appearance.types.ts`" (file deleted this changeset). Ledger D13 explicitly tracks the surviving unreferenced file as a follow-up, but the stale mirror-pointer text remains.
- **[INFO] ai/plans/unused/outcome/phase3-backend-misc-cluster-outcome.md** — states "`getClient` remains (live consumers)" while commit `affb113` (same wave) deleted it; internal plan-artifact inaccuracy only (final code state is consistent and verified safe).
- **[INFO] knip.config.ts:100-104** — `ignoreDependencies` for `@pothos/plugin-dataloader` + `dataloader` is documented ("canonical batching pattern… no static registration yet by design") and the builder docblock was truthfully updated, but these are genuinely-unused-at-runtime deps kept by docs mandate rather than knip-invisible constructs. Within the plan's documented-config-entry rule; noted for awareness in future dependency waves.

**Per-category code-defect count: ZERO** (architecture, races/TOCTOU, seeds, pothos, dead code, restoration risks, knip compliance). Two LOW stale-doc references + four INFO notes above.
