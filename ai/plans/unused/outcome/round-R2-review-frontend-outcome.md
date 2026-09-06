# R2 review-frontend outcome (fresh iteration 2)

Pin: `feat/clean-unused` (via `/home/z/pin-feat.sh`). Scope: 53 diff-touched files under `frontend/` + `app/` (base 1c134db → HEAD, deletion-only cleanup).

## Focus 1 — Hook/context contract integrity: 0 findings

Swept every exported symbol from the current `frontend/hooks/**`, `frontend/context/**`, `frontend/providers/**` (excluding `.test.ts`), grepping repo-wide for live consumers (barrel re-exports excluded; `ai/**` history excluded).

All remaining hooks/contexts/providers have ≥1 live consumer:
- `useAuth` → 10+ consumers (`app/(auth)/layout.tsx`, dashboard views, `LocaleSwitcher`, `useLoginForm`)
- `useAppLocale` → live via BOTH re-export paths: `@/frontend/providers/localeContext` (`ThemeProvider`, `LocaleSwitcher`) and `@/frontend/hooks/locale` (`emotion-cache.tsx`, `useAdminUserDetail`)
- `useNetworkConnectivity` → `AuthProvider`; `useApolloConnectivity` → `AppApolloProvider`; `useThemeMode` → `ThemeProvider` + `DashboardAppBar`
- `useNotificationMarkActions` → `useNotificationDrawerActions` + `useNotificationsFeedActions`; `useNotificationRealtime` → `NotificationRealtimeToastHost` + `useNotificationsFeedState`
- Contexts: `AuthContext` (15 importers), `NetworkConnectivityContext`, `ThemeContext`, `ViewportContext` — all consumed by their provider/hooks/stories
- Providers: `AppClientProviders` (root layout), `AppApolloProvider`, `AuthProvider`, `LocaleProvider`, `MuiProvider`/`AppThemeProvider`/`ViewportProvider` (via `AppClientProviders`) — all live
- Deleted symbols (`useAuthToken`, `useMutationWrapper`, `useLanguageSwitch`, `useLocaleSwitchSuccess`, `LtrScope`, `VercelObservability`, `APPEARANCE_PRESETS`, `findAppearancePreset`, `AppearancePresetId`, `getLtrEmotionCache`, `getReconnectionDelay`, `requireRoleForPage`) — zero code references repo-wide (only immutable `ai/**` records)

Zero-EXTERNAL-consumer exports found are 15 type-only exports (`NotificationMarkActions`, `UseNotificationRealtimeResult`, `LocaleProviderProps`, `WireFieldError`, `AuthRecoveryApi`, `ErrorRoutingDeps`, `GraphQLErrorActionListener`, `ObserverLike`, `LogMeta`, `UsePlanFormOptions`, `DirectoryGovernanceFlags`, `RegisterFieldPath`, `SlotBookHelpers`, `LifecycleMutationErrorWiring`, `TeacherActionsWiring`) — every one (a) was already exported identically at baseline 1c134db (verified via `git show`), and (b) is used in-file as a props/return type. Baseline → not diff issues per filtering rule. No surviving hook has zero callers.

## Focus 2 — i18n symmetry: 0 findings

- `git diff 1c134db HEAD -- shared/locale/ar shared/locale/en | wc -l` → **0**: ar/en translation data completely untouched.
- `git diff -- shared/locale/` deletions are orchestration/typing only: dead `client/use-translation.ts` (+ barrel line), `namespaces/translation.ts` (+ barrel line), `server-cookies.setLocaleCookie`, `define-namespace`'s `InferNamespaceLabels`/`getNamespaceId`, `useLocaleContext` privatized (still consumed in-file by `useAppLocale`), `DashboardGettingStartedTips`/`PlanCatalogErrorsLabels` export-key drops (both still referenced in-file).
- `shared/i18n/` fully deleted (4 files, 91 lines): zero remaining `@/shared/i18n*` importers; `AppLocale`/`defaultLocale`/`locales` canonical home `@/shared/locale/AppLocale` untouched (20+ live importers incl. `codegen.ts`).
- ar/en key-symmetry guards (`*-namespace.parity.test.ts`) untouched; no next-intl remnants outside parity-test guards/doc comments.

## Focus 3 — Component prop-type integrity: 0 findings

- `CodeChip.tsx`: comment-only diff (stale `LtrScope.tsx` doc reference rewritten); `CodeChip` export consumed by `HandshakeCodeCard.tsx`; no test imports of its private surface.
- `GraphQLErrorToastItem.tsx`: `TOAST_AUTOHIDE_MS` privatized (in-file use at L41); remaining exports `GraphQLErrorToastItem` + `SurfaceToast` exactly match `GraphQLErrorSurfaceHost.tsx` imports; sibling files' local `*_TOAST_AUTOHIDE_MS` constants are independent by design.
- `TestWrapper.tsx`: `TestWrapper` component privatized; public surface `renderWithWrapper` matches ALL 25+ test-file imports (static + deliberate dynamic `await import(...)` in admin suites); in-file usage intact.
- `containerSuiteScaffold.tsx`: `expectSnackbar` + `EM_DASH_PLACEHOLDER` privatized (in-file only, L267/272/278/455); all remaining exports consumed by suite files via `helpers/index.ts` barrel.
- Full `bun run tsgo` executed by this reviewer: **clean, zero diagnostics** — static proof of import/prop symmetry across all diff-touched frontend/test files.

## Focus 4 — Runtime sanity: 0 findings (1 INFO observation)

- `curl http://localhost:3000/` → `<html lang="ar" dir="rtl" ...>` ✓; no `Application error`/`error-digest` markers (the "500" string hits in HTML are CSS tokens, e.g. `--mui-font-labelMd:500`).
- `/login` → 200 ✓ (`<title>أكاديمية درافت — تسجيل الدخول</title>`, dir="rtl" present).
- `/api/health` → 200.
- [INFO] `/nonexistent` → **200, not 404**. Root cause: pre-existing catch-all `app/(dashboard)/[feature]/page.tsx` (ComingSoon placeholder; exists at baseline — `git log` shows commit 53b11d0, untouched by this cleanup) intentionally renders any single-segment unknown path. Multi-segment unknown path `/nonexistent/deeper/path` → **404** ✓ (Next 404 mechanism + `app/not-found.tsx` intact, both untouched by the diff). Baseline route design, not a diff regression — recorded for accuracy, not filed as a finding.

## Focus 5 — Dead React patterns: 0 findings

- tsgo clean → no `useEffect` cleanup / import references to deleted symbols (skipped per protocol).
- JSX/string sweep: zero `<LtrScope`, `<VercelObservability`, string-form `"LtrScope"`/`"VercelObservability"`, or any deleted symbol name in JSX position repo-wide (only `ai/**` records).
- Deleted barrels (`frontend/hooks/index.ts`, `frontend/context/index.ts`, `frontend/components/siteFooter/index.ts`, `frontend/lib/auth/index.ts`, `frontend/lib/i18n/index.ts`, `frontend/views/admin/index.ts`, `frontend/views/admin/users/index.ts`, `frontend/views/auth/index.ts`, `shared/i18n/index.ts`): zero bare-path imports remain; surviving members (`withPageAuth`, `refreshMemoryToken` getters/setters, `formatApplicantDate`/`formatDayMonth`, siteFooter subcomponents) all consumed via deep imports.

## Summary

| Category | Findings |
|---|---|
| Hook/context contract integrity | 0 |
| i18n symmetry | 0 |
| Component prop-type integrity | 0 |
| Runtime sanity | 0 (1 INFO observation: /nonexistent 200 via baseline catch-all; deep-path 404 works) |
| Dead React patterns | 0 |

**Total: 0 findings.** Frontend surface of the deletion-only cleanup is contract-complete, i18n-symmetric, prop-type-safe, and runtime-healthy.
