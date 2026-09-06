# R1 review-frontend outcome — unused-code cleanup (feat/clean-unused)

- **Reviewer**: review-frontend subagent (fresh iteration 1)
- **Baseline**: 1c134db · **Head**: HEAD (83c8c0c) · **Pin**: `feat/clean-unused` ✓
- **Scope**: `git diff 1c134db HEAD -- frontend/ app/` → 53 files (41 insertions, 648 deletions; 17 deleted files, 36 modified). `app/` has **zero** diff files.
- **Runtime re-verification**: `bun run tsgo` → exit 0. Scoped `biome check` on all 36 modified frontend files → clean (no diagnostics).

## Findings

**0 findings.** All categories clean. Details per focus area below.

## 1. Component/provider wiring integrity — 0 findings

- `app/layout.tsx` unchanged in the diff; still composes fonts → `InitColorSchemeScript` (modeStorageKey "theme") → `AppClientProviders locale={initialLocale} initialTheme="dark"`, with server-side `<html lang dir>` from the NEXT_LOCALE cookie. No provider gap.
- `frontend/providers/AppClientProviders.tsx` untouched: `LocaleProvider → MuiProvider → ViewportProvider → AppApolloProvider → AuthProvider (+ GraphQLErrorSurfaceHost as last child)`.
- `MuiProvider` → `EmotionCacheProvider` from `frontend/lib/emotion-cache.tsx` (the RTL-aware cache — **not** the deleted `emotion-ltr-cache.ts`) → `AppThemeProvider` (MUI v9 `ThemeProvider` cssVars + `CssBaseline` + `ColorSchemeStateBridge` re-applying `dir`/`lang`). Theme chain fully intact.
- Deleted providers were provably dead at baseline: `VercelObservability` never imported (phase-2 `git log -S` proof, no vercel config refs); `LtrScope`'s only baseline references were the `theme/index.ts` barrel line (removed in the same hunk) and a doc comment in `CodeChip.tsx` (rewritten); `theme/presets/` and `emotion-ltr-cache.ts` had zero consumers.
- Locale wiring intact: `LocaleProvider` reads `LocaleContext` from `@/shared/locale` (still exported there); `frontend/providers/localeContext.ts` still re-exports `useAppLocale` — all three live importers (`ThemeProvider.tsx`, `LocaleSwitcher.tsx` via providers path; `emotion-cache.tsx` via `@/frontend/hooks/locale`) resolve. The three dropped re-exports (`LocaleContext`, `LocaleContextValue`, `useLocaleContext`) have zero frontend/test consumers.

## 2. Apollo link factories — 0 findings

- `frontend/providers/apollo/error-link.map.ts`: only three type aliases (`GraphQLErrorActionKind`, `GraphQLErrorNoticeKind`, `GraphQLErrorActionTone`) lost `export`; declarations kept and still used in-file (`GraphQLErrorAction.kind`/`.tone`/`.noticeKind`, lines 163/175/179). The public mapping surface (`mapGraphQLErrorByCode`, `normalizeGraphQLErrorCode`, `GraphQLErrorAction`, …) is untouched; `GraphQLErrorToastItem`'s `import type { GraphQLErrorAction }` still resolves.
- `frontend/providers/apollo/utils/link-factories.ts`: `createSuccessHandler` un-exported, still consumed in-file as the observer `next:` handler (line 67). `createAuthLink` still exported and used by `AppApolloProvider.tsx:58` inside `ApolloLink.from([...])` — link chain composition unchanged. The structural test `link-factories.test.ts` still imports `createAuthLink` (resolves).
- Deleted errorUtils exports (`getGraphQLErrorMessage`, `isAbortError`, `serializeApolloError`): repo-wide grep → **zero code references** (only immutable `ai/**` history). The now-unneeded `CombinedGraphQLErrors` import was removed cleanly; `isNetworkError` retained and still exported/used.

## 3. MUI v9 compliance (diff + lines) — 0 findings

All 41 added lines are type aliases, local constants, function signatures, or comments — no JSX style props were added anywhere. The only component file with changed code-adjacent lines (`CodeChip.tsx`) is a comment-only edit; its styling already goes through `sx` (theme-callback + object). `GraphQLErrorToastItem.tsx` (the other touched component) styles via `sx` only. No `style=` props, no `styled()`/`makeStyles` regressions in the diff.

## 4. Deleted hook/component consumers — 0 findings

Repo-wide grep (frontend/, app/, test/, shared/, scripts/, backend/) for every deleted name — `useAuthToken`, `useMutationWrapper`, `useLanguageSwitch`, `useLocaleSwitchSuccess`, `LtrScope`, `emotion-ltr-cache`, `VercelObservability`, `requireRoleForPage`, `getGraphQLErrorMessage`, `isAbortError`, `serializeApolloError`, `shortNumericDateMask`, `hasDirectoryFilters`, `WALLET_TYPE_NAME`, `appTheme`, `TonalPalette` → **zero code references**. Remaining mentions live only in `ai/**` plan/outcome records (immutable history).

Deleted barrel paths (`@/frontend/hooks`, `@/frontend/context`, `@/frontend/lib/auth`, `@/frontend/lib/i18n`, `@/frontend/components/siteFooter`, `@/frontend/views/admin`, `@/frontend/views/admin/users`, `@/frontend/views/auth`, `theme/presets`) → zero importers anywhere; all live imports use deep module paths that still exist (`withPageAuth`, `roleDashboardRoute`, `views/auth/login`, `views/admin/users/directory`, …). Sub-path barrels (`hooks/{auth,connectivity,locale,notifications,theme}`) remain and resolve.

Every un-exported-but-kept symbol is proven used in-file: `tsconfig` has `noUnusedLocals`/`noUnusedParameters: true` and tsgo exits 0 (spot-greps confirm: `OutgoingSkeletonList`, `NO_FILTERS`, `parseUtcDayEndExclusive`, `alertSeverity`, `DirectoryUserListItem`, `TOAST_AUTOHIDE_MS`, `getReconnectionDelay`).

### Informational (already flagged by review-types R1 — not re-counted)

- `docs/auth/REDIRECT_LOOP_FIX.md:139` still has a live table row for deleted `frontend/hooks/useAuthToken.ts`. This is a docs-surface leftover (D11 incomplete), recorded in round-R1-review-types-outcome.md. No frontend wiring impact.

## 5. State/store patterns — 0 findings

No Zustand/store files exist in the repo at all (`from "zustand"|createStore` → zero matches). The frontend diff contains zero store-adjacent changes. App state flows through React contexts (`AuthContext`, `ThemeContext`, `ViewportContext`, `NetworkConnectivityContext`) — all context modules intact; only the dead `frontend/context/index.ts` barrel was deleted (zero consumers).

## 6. Visual sanity — PASS

- `curl -s http://localhost:3000/` → HTML renders, `<html lang="ar" dir="rtl"` ✓ (Arabic RTL), full MUI CSS-variable theme in the SSR shell (theme provider chain works server-side).
- `/login` → 200 · `/dashboard` → 200 · `/student/sessions` → 200.
- The literal "500" occurrences in the homepage HTML are benign (5000s autofill transition, `--mui-zIndex-*: 1300/1400/1500`, font-weight 500) — no error markers.
- No agent-browser tool available in this environment; curl checks used per instructions.

## Summary

| Category | Findings |
| --- | --- |
| Component/provider wiring integrity | 0 |
| Apollo link factories (error-link.map + link-factories) | 0 |
| MUI v9 compliance of changed code | 0 |
| Deleted hook/component consumers (code) | 0 |
| State/store patterns | 0 |
| Visual sanity | PASS |

**Total: 0 findings.** The cleanup is surgical in the frontend layer: pure deletions of proven-dead files/exports and export-keyword drops with in-file usage retained. Provider composition, locale/theme/Apollo chains, and all live import paths are intact.
