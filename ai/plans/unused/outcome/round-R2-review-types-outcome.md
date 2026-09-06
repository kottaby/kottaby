# R2 review-types outcome (fresh iteration 2)

**Reviewer:** review-types subagent, independent re-review (no prior outcome files read).
**Scope:** `git diff 1c134db HEAD` — 208 files, +3499/−6806; 48 deleted files, 137 modified; 170 changed paths under backend/frontend/shared/test/scripts/app.
**Pin:** `feat/clean-unused` (pin-feat.sh OK).
**Gates re-verified:** `bun run tsgo` → exit 0; `bun run check:unused` (knip) → exit 0, exactly 1 informational hint (`.mdx` compiled-extension note, not a config dead path).

## Category 1 — String-form type consumers (deleted/trimmed symbol names in live string contracts)

**0 findings.**

Swept 40+ deleted/trimmed symbol names (chosen independently from `git diff 1c134db HEAD | grep "^-.*export"`): `getPool, getClient, getEnums, getTriggers, getDbStats, getForeignKeys, getCheckConstraints, getTableSummaries, getTableColumns, getIndexes, resolveUserRole, resolveNullableUserGender, resolveEnvConfig, truncateSafely, generateHandshakeCode, getReconnectionDelay, getLtrEmotionCache, shortNumericDateMask, findAppearancePreset, getGraphQLErrorMessage, serializeApolloError, alertSeverity, parseUtcDayEndExclusive, evictSessionFromTeacherLists, isAbortError, isPidAlive, WALLET_TYPE_NAME, WITHDRAWAL_AMOUNT_PATTERN, WALLET_LEDGER_PAGE_LIMIT, NOTIFICATION_INBOX_*, TOAST_AUTOHIDE_MS, CANCEL_TOAST_AUTOHIDE_MS, NO_FILTERS, REGISTER_FIELD_PATHS, INITIAL_DEMO_PLANS, seedOrGetPlans, APPEARANCE_PRESETS, requireRoleForPage, withPageAuth, refreshMemoryToken, useAuthToken, useMutationWrapper, useLanguageSwitch, useLocaleSwitchSuccess, publishAfterCommit, LoginSubmitInput, AuthTokensReturnType, AuthUserReturnType, LoginPayloadReturnType, RawUserRole, RawGender, ExpiryReminderClaimRow, GraphQLPathSegment, SeedProfile, EscrowReleaseReason, TeacherMatchingLanguagesInput, SessionEventNotificationEntityRef, GraphQLErrorActionKind, GraphQLErrorNoticeKind, GatewayRequestMetadata, ApiSuccessEnvelopeReturnType, GraphQLErrorExtensionsType, AdminInsertType, WalletInsertType, ParentLinkRequestInsertType, MarkNotificationReadInput, RealtimeNotificationToast, CreateUserDialogInput, AdminUserDeleteTarget, AdminUserEditTarget, AdminEditUserPatchInput, CANONICAL_ENUMS, getLatnLocaleTag, EXCLUDED_UI_COUNTRY*, resolveUiCountryCode, resolveLocalizedString, setLocalizedString, omitEmptyLocalizedString, localeJsonKey, isSafeUrl, useTranslation, Logger, ModeColors/PerModeColors/TonalPalette/appTheme, DateTimeScalar, TeacherTransactionPothosObject, OPERATION_NAME_MAX_LENGTH, RAW_ERROR_HOP, isAdminUserGovernanceFilter, AuthService.getMe, setLocaleCookie, getNamespaceId, useLocaleContext, hasDirectoryFilters, PlanFormErrors, NavLabelKey, DirectoryUserListItem, OutgoingSkeletonList, DashboardGettingStartedTips, createSuccessHandler`.

String-contract surfaces checked:
- **zod `.describe()`**: zero zod usage repo-wide — nothing to orphan.
- **GraphQL descriptions / SDL**: `frontend/graphql/generated/` (incl. `schema.graphql`) is **byte-identical to baseline** (`git diff 1c134db HEAD -- frontend/graphql/generated/` → empty) — no Pothos-registered type/scalar was orphaned (`DateTime` registration converted to side-effect call, name string `"DateTime"` intact; `pothos/index.ts`, `gqlSchema.definitions.ts` chain unchanged).
- **i18n keys**: locale system is compile-time typed (`defineNamespace` + label interfaces), not string-keyed; de-exported label types (`PlanCatalogErrorsLabels`, `DashboardGettingStartedTips`) remain live in-file.
- **Enum value maps / static-assertion whitelists**: `backend/types/contracts/contracts.static-assertions.test.ts:194-202` EXEMPT_TYPES strings (`EscrowReleaseReason`, `TeacherMatchingLanguagesInput`, `SessionEventNotificationEntityRef`) reference types that **still exist** (export dropped, declaration kept in the same files the test scans). The `"Wallet"` `__typename` literals in `TeacherWalletContainer.suite.tsx:105,115` are independent literals of the still-registered GraphQL type, not references to the deleted `WALLET_TYPE_NAME` const.
- **File-content scan tests**: `handshake-code-immutability-scan.test.ts:241` scans for the string `generateHandshakeCode();` — the symbol is kept (module-private) in `user-provisioning.helpers.ts`.
- **Symbol-key contracts**: `RAW_ERROR_HOP` export dropped but `Symbol.for("dev3-002.graphqlBoundary.rawError")` key preserved module-locally; the only cross-module use of the key is a negative-assertion string literal (`error-finalizer.test.ts:317`) that is key-name-based and unaffected.
- Residual name matches live only in `ai/**` history records, in-file-private re-declarations, or comments/docstrings about kept symbols. No deleted name is a live string contract.

## Category 2 — Barrel consistency (remaining index.ts barrels in touched dirs)

**0 findings.**

Spot-checked 15+ barrels (beyond the required 10) with file-existence verification of every `export *` target and consumer grep of each barrel's exported surface:
- `backend/types/index.ts` (14 targets), `billing/`, `classes/`, `teachers/` domain barrels — all targets exist; trimmed type files (`home-work/lesson/progress/recitation/student-subscription/teacher-verification.types.ts`, `student-payment` barrel line) correctly removed from barrels.
- `backend/db/seeds/billing/index.ts` — exports `seedOrGetPlans`; live consumer `backend/db/seeds/index.ts:1,24`.
- `shared/locale/client/index.ts` (`use-app-translation` — 20+ live consumers), `shared/locale/namespaces/index.ts` (18 targets, all exist; deleted `translation.ts` line removed).
- `frontend/hooks/{auth,connectivity,locale}/index.ts` — deleted hook lines removed; all re-exported leaves have live deep-path importers (`useAuth`, `useApolloConnectivity*`, `useNetworkConnectivity`, `useAppLocale`).
- `frontend/providers/theme/index.ts` — `MuiProvider`/`ThemeProvider`/`theme` all consumed (`AppClientProviders.tsx`).
- `test/helpers/index.ts` (dropped `port-helpers` + `isPgliteProvider` re-exports — all remaining consumers import from leaves `@/test/helpers/port-helpers`, `@/test/helpers/skip-when-pglite`), `test/workflows/helpers/index.ts` (8 targets, all exist).
- `scripts/lib/index.ts` — all re-exports still consumed (incl. `restoreCanonicalNextEnvDts` via `test/scripts/build-test.ts:2`).
- All **deleted** barrels (`frontend/{hooks,context,lib/auth,lib/i18n,components/siteFooter,views/admin,views/admin/users,views/auth}/index.ts`, `shared/{i18n,types,lib/timezone}/index.ts`, `backend/{lib/db,graphql/pothos/billing,graphql/pothos/parents,db/introspection}/index.ts`) have **zero remaining importers** repo-wide (static and dynamic — the only dynamic imports into those trees use deep paths that exist: `@/frontend/views/parent/handshake` → live barrel exporting `HandshakeDiscoveryContainer`; `@/frontend/views/admin/broadcasts/BroadcastComposeContainer` → live leaf).
- tsgo (include `**/*.ts(x)` incl. `test/**`) + knip exit 0 corroborate: no unresolved barrel target, no dead re-export surface.

## Category 3 — Type-flow integrity at edit boundaries (trimmed files vs importers, dynamic forms)

**0 findings.**

Audited 15+ trimmed files against all their importers:
- `backend/types/auth/auth.types.ts` (4 login-era interfaces deleted): sole remaining consumers import `LogoutPayloadReturnType`/`AuthSession`/`RefreshResult` — all live.
- `backend/types/errors/api-error.types.ts` (`ApiSuccessEnvelopeReturnType`, `GraphQLErrorExtensionsType` deleted): importers use `ErrorCode`/`ApiErrorEnvelopeReturnType`/`ApiFieldErrorType` — live.
- `backend/types/gateway/gateway-context.types.ts` (`GatewayRequestMetadata` deleted): importers use `TransportErrorKind`/`TransportGuardResult` — live.
- `backend/types/{users/admin,billing/wallet,parents/parent-link-request}.types.ts` (`AdminInsertType`, `WalletInsertType`, `ParentLinkRequestInsertType` deleted): all `*InsertType` importers use surviving names (`NotificationInsertType`, `AuditLogInsertType`, `SessionInsertType`, `UserInsertType`, `PlanInsertType` — verified live).
- `backend/db/index.ts` (`PoolClient` re-export dropped; `getPool` de-exported): all `PoolClient` consumers import from `pg` directly; `closePool`/`db`/`queryDb`/`getDrizzleDbPool` intact for the dynamic `await import("@/backend/db")` sites.
- `backend/lib/env.ts` (`resolveEnvConfig` deleted), both `logger.ts` (`Logger` deleted), `frontend/utils/errorUtils.ts` (3 fns deleted), `frontend/providers/apollo/error-link.map.ts` (3 type aliases de-exported), `link-factories.ts` (`createSuccessHandler` de-exported), `frontend/lib/i18n/format-date.ts` (`shortNumericDateMask` deleted), `frontend/views/teacher/wallet/teacherWalletShared.ts` (`WALLET_TYPE_NAME` deleted, pattern de-exported), `frontend/views/student/sessions/*` trio, `frontend/views/dashboard/nav/navItems.ts`, dialogs/hooks type de-exports, `theme/types.ts` (MUI augmentation types de-exported, `TonalPalette` deleted), `scalar.pothos.ts`/`wallet.pothos.ts` — every importer (grep-verified) references only surviving exports.
- **Dynamic-import census** (all `await import(...)` sites, 30+): every destructured member resolves — `renderWithWrapper` (TestWrapper kept exporting it while `TestWrapper` itself was de-exported), `ParentLinkRequestService` (namespace intact, `mod.ParentLinkRequestService` check in journey test), `closePool`, `main` (dbActions cli), `HandshakeDiscoveryContainer`, `BroadcastComposeContainer`, page default+`generateMetadata`, `IoredisFanoutClient`, `DELETE/GET/PATCH/POST/PUT`, test preloads/suites. The variable-path import `await import(SERVICE_PATH)` resolves to a live export surface.
- Deleted `.storybook/shims/node-process.ts`: zero references in baseline AND current tree (its vite alias was removed in a prior commit; `.storybook/main.ts` never mentions it) — no config-string orphan.
- `frontend/graphql/generated/` (excluded from tsgo): byte-identical to baseline; no deleted type names appear.

## Category 4 — knip/tsconfig config type-safety

**0 findings.**

- Every concrete `entry` path in knip.config.ts exists (15 paths verified: seeds index, 4 graphql registration roots, 3 bun preloads, 3 test runners). All `ignore` paths/globs exist (`frontend/stories/**`, `shared/constants/iana-timezone*.ts`, 4 enum files). `project` globs cover the trees. No pattern matches nothing.
- The single knip hint is the `.mdx` compiled-extension informational note (project-wide extension policy), NOT a dead config path — matches the expected gate state.
- `ignoreDependencies` entries all have documented functional references (newrelic, jscpd, cspell dict, pothos dataloader, tsgo/ts6 bins, cldr JSONs) — none reference deleted code.
- tsconfig include/exclude unchanged in this diff (only `.next*` type dirs listed; `frontend/graphql/generated` exclusion pre-existing and immaterial — dir byte-identical).

## Category 5 — Ambient/global type declarations

**0 findings.**

Repo `.d.ts` inventory: `next-env.d.ts` (auto), `frontend/styles.d.ts` (css wildcards), `frontend/types/apollo-client.d.ts` (`@apollo/client` DeclareDefaultOptions). In-code `declare module` sites: `frontend/providers/theme/types.ts:94,246` (`@mui/material/styles`, `@mui/material/Typography`) — npm modules, unaffected by deletions; the file's trimmed type aliases do not participate in the augmentations' referenced shapes (tsgo 0). No `.d.ts` or augmentation references any deleted module (`shared/types`, `shared/lib/*`, `backend/lib/db`, `backend/types/appearance`, etc.).

## Findings

- **[INFO] docs/graphql/api-gateway-and-routing.md:130** — stale symbol pointer: names `GatewayRequestMetadata` as the "documentary carrier" in `backend/types/gateway/gateway-context.types.ts`, but that interface was deleted in this changeset (the paired comment edits landed in `gqlContextFactory.ts` and `context-keys.test.ts`; this doc file was not in the updated set). Docs-only; zero code/string-contract impact (`TransportErrorKind`/`TransportGuardResult` named alongside it still exist). Repo-wide scan of docs/AGENTS/README for 90+ deleted symbol names found this as the only remaining stale reference.

**Net: 1 INFO (docs-only) — 0 code/type-safety findings across all five categories.**
