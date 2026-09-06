# Phase 3 — Pothos + Backend-Leftovers Cluster Outcome (T3.1/T3.2)

**Task IDs:** T3.1/T3.2 (wave 2 — pothos/backend-leftovers cluster)
**Status:** Complete (subagent report lost to Task-tool infra timeout; work verified post-hoc — tsgo 0 errors, knip category emptied, dev server 200)

## What Was Implemented
- **16 `*PothosObject` exports** across `backend/graphql/pothos/**` (AdminUserListItem, Admin*Snapshot, AdminAuditLogEntry, PlatformAnalytics*×11, TeacherTransaction): export keywords dropped per the Pothos side-effect-registration blind-spot rule (symbols kept — they register schema types via builder chaining in-file)
- `DateTimeScalar` + `resolveUserRole` / `resolveNullableUserGender` (userFieldHelpers): export-surface trims per consumer census
- `RAW_ERROR_HOP` (error-masking-readers): own-file-only → export dropped
- `publishAfterCommit` + `NOTIFICATION_INBOX_MAX_PAGE_LIMIT` (notification-engine): dead symbols removed
- `gqlContextFactory.ts`: dead exports trimmed
- ~5 backend/types leftovers + backend/services stragglers resolved
- `shared/i18n/routing.ts`: single-line `AppLocale` type re-export barrel, zero consumers — deleted (second-order finding after shared-cluster cleanup)

## Verification
- tsgo (locked direct): 0 errors · dev server: 200 · knip: exports/types categories → 0 findings

## Carry-Forward
- PothosObject export-drop pattern validated: side-effect registration unaffected (schema builds through pothos entry registration, not the exported names)
