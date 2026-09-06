# Phase 3 — Frontend Cluster Outcome (T3.1/T3.2)

**Task IDs:** T3.1/T3.2 (wave 2 — frontend cluster)
**Status:** Complete (subagent report lost to Task-tool infra timeout; work verified post-hoc — tsgo 0 errors, all deleted symbols grep-clean, dev server 200)

## What Was Implemented
- **Deleted dead hook files** (zero component callers repo-wide): `useAuthToken.ts`, `useMutationWrapper.ts` (+ its `getReconnectionDelay`), `useLanguageSwitch.ts`, `useLocaleSwitchSuccess.ts` — with their barrel lines in `frontend/hooks/{auth,connectivity,locale}/index.ts`
- **Deleted dead components/utils**: `LtrScope.tsx` (theme), `frontend/lib/emotion-ltr-cache.ts`, errorUtils dead exports (`getGraphQLErrorMessage`, `isAbortError`, `serializeApolloError` — error-link.map consumer updated), `TOAST_AUTOHIDE_MS` export-drop, format-date `shortNumericDateMask`
- **Providers**: localeContext surface trimmed (context + hook exports where consumers absent), apollo link-factories `createSuccessHandler` export-drop
- **Views** (~18 files): audit-trail filters (`NO_FILTERS`, `parseUtcDayEndExclusive`), admin-users governance helpers (`alertSeverity`, `hasDirectoryFilters`) — dead exports removed, live ones untouched

## Verification
- tsgo (locked direct): 0 errors · dev server: HTTP 200 (HMR picked up edits, no breakage) · all deleted symbol names grep-clean repo-wide

## Carry-Forward
- React hook deletion rule validated: hook with zero JSX/caller references is safely deletable; barrel lines must go in the same changeset (orphaned barrels become knip unused-file findings)
