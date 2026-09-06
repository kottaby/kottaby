# R3 review-frontend — Remaining-surface census (fresh iteration 3)

- Pin: `feat/clean-unused` ✓ (HEAD 81f2eee; deletion-only diff vs baseline 1c134db, 53 files, +41/−648)
- Reviewer: review-frontend subagent, fresh context (no prior outcome files read).
- Read-only review; no git mutations; dev server untouched.

## Method

Per-symbol grep census (ripgrep word-boundary, whole repo, defining file excluded) over
every remaining `export` in: `frontend/hooks/**`, `frontend/lib/**`, `frontend/utils/**`,
`frontend/views/**` (non-test `.ts` = 260 export lines; non-story `.tsx` = 364 export lines),
`frontend/providers/theme/**`, `frontend/context/**`, and diff-touched
`frontend/providers/apollo/{error-link.map,utils/link-factories}.ts`. Dead = zero
out-of-file references; in-file-only = referenced only by the defining file.
Corroborated with `check:unused` (knip, exit 0) and `tsgo` (exit 0).

## Findings

**0 findings** — all categories clean.

### 1. hooks / lib / utils remaining exports — 0 findings

- 62 named exports censused; every value/function export has a live cross-file consumer.
- In-file-only (knip-accepted type contracts of exported, externally-consumed functions —
  not dead code, no action): `NotificationMarkActions` (hooks/notifications/use-notification-mark-actions.ts:113),
  `UseNotificationRealtimeResult` (hooks/notifications/use-notification-realtime.ts:53),
  `FieldErrorSink` (lib/mutationFieldErrors.ts:56), `LogMeta` (lib/logger.ts:40),
  `WithPageAuthOptions` / `WithPageAuthResult` (lib/auth/withPageAuth.ts:34,50).
- `EmotionCacheProvider` default export → consumed by MuiProvider.
- All remaining barrels (`hooks/{auth,connectivity,locale,notifications,theme}`, `lib/auth`,
  `lib/i18n` subpaths) have external importers; zero exact-barrel imports of the deleted
  `hooks/index.ts`, `context/index.ts`, `lib/auth/index.ts`, `lib/i18n/index.ts`,
  `components/siteFooter/index.ts`, `views/admin/index.ts`, `views/auth/index.ts`,
  `views/admin/users/index.ts` (grep = 0; tsgo green confirms graph integrity).

### 2. views helper/util exports — 0 findings

- 0 DEAD symbols across all views `.ts` + `.tsx` exports.
- In-file-only items are Props/signature interfaces (e.g. `*Props`, `*Wiring`, `*Arms`
  types) — the allowed "in-file-only status"; knip-green.
- Destructured slot-book re-exports (`addInFlightAction`, `removeInFlightAction`,
  `isInFlight` in teacherSessionSlots.ts:65 and studentSessionInFlightSlots.ts:30) have
  live cross-file consumers; `sessionRowSlotBook.ts` engine exports
  (`createSessionSlotBook`, `InFlightSlotBook`, `isSlotInFlight`) consumed by both roles.

### 3. providers/theme surface — 0 findings

- All 23 theme exports verified live: `MuiThemeLayoutSettings`, `ViewportProvider`,
  `MuiProvider`, `AppThemeProvider`, `createAppCssVarsTheme`, `createAppTheme`,
  `layoutSettings`, all `getMui*` overrides + `AUTOFILL_*_VAR`, `components`,
  `typography`, `lightPalette`, `darkPalette`.
- `appTheme` symbol: zero code references anywhere (deletion fully propagated).
- `createAppTheme` consumed by test harness (`test/ui/components/TestWrapper.tsx`) and
  in-file by `createAppCssVarsTheme` (used by ThemeProvider) — live.
- Deleted `providers/theme/presets/index.ts`: zero path references.
- context/* and apollo error-link.map exports: all live (incl. backend taxonomy test
  consumer of `LEGACY_ERROR_CODE_ALIASES`).

### 4. Runtime sanity — PASS

- `curl http://localhost:3000/` → `<html lang="ar" dir="rtl" …>` ✓
- `/login` → 200 ✓ ; `/dashboard` → 200 ✓

### 5. JSX hygiene — 0 findings

- `rg "LtrScope|VercelObservability|useAuthToken" frontend/ app/` (ts/tsx) → 0 matches.
- Broader sweep of other deleted names (`requireRoleForPage`, `useMutationWrapper`,
  `useLanguageSwitch`, `useLocaleSwitchSuccess`, `getLtrEmotionCache`, `shortNumericDateMask`,
  `hasDirectoryFilters`, `WALLET_TYPE_NAME`, `AuthCredentials`, `RealtimeNotificationToast`,
  `MarkNotificationReadInput`, `getReconnectionDelay`) → only legitimate file-local
  un-exported definitions (the prescribed "drop export, keep symbol" pattern); no string-form
  or dynamic-import references to deleted files.

## Gates (read-only, corroborative)

- `bun run check:unused` → exit 0 (only the pre-documented `.mdx` config hint).
- `bun run tsgo` → exit 0.

## Verdict

Remaining-surface census clean; no further cleanup action required for the frontend scope.
