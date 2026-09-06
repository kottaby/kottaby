# Phase 3 — Backend-Misc Cluster Outcome (T3.1/T3.2)

**Task IDs:** T3.1/T3.2 (backend enum/db/services/lib + non-pothos graphql)
**Status:** Complete (executing subagent's report lost to Task-tool infra timeout; work verified post-hoc)

## What Was Implemented

Unused symbol cleanup for knip-flagged exports/types/enum-members/namespace-members in backend/enum, backend/db, backend/services, backend/lib, and non-pothos backend/graphql (~25 findings + the 4 protected enum members + 2 namespace members).

From the diff audit:
- **Protected enums (documented knip ignores, NOT deletions)** — knip.config.ts `ignore` additions with justification comments:
  - `backend/enum/billing/payment-status.enum.ts` — `Refunded` mirrors the live `payment_status` pgEnum ("refunded" in backend/db/schema/enums.ts + drizzle migration 20260904084151)
  - `backend/enum/users/register-public-role.enum.ts` — whole enum registered as GraphQL `RegisterPublicRole` type (pothos/shared/enum.pothos.ts); all three members schema-exposed
  - `backend/enum/shared/surah-juz-ref.enum.ts` — mirrors live `surah_juz_ref` pgEnum
  - `backend/enum/shared/recitation-reading.enum.ts` — documented re-export shim of the canonical shared enum (docs/auth/qiraah-selection-and-c5.md)
- **Deleted:** `isAdminUserGovernanceFilter` guard (zero callers — the loose read path uses service-layer drop-on-unknown without the guard), `AuthService.getMe` method (zero external callers; auth.service.test.ts updated), backend/lib dead exports (env.ts, logger.ts)
- **Export-dropped (symbol kept):** `validateReading` (recitation-catalog.service — own-file use), `INITIAL_DEMO_PLANS` (seeds/billing — own-file), `OPERATION_NAME_MAX_LENGTH` (graphqlErrorsFinalizer), RAW_ERROR_HOP (error-masking-readers), wallet/user-provisioning/admin-user helpers, `getClient` remains (live consumers)
- **Consumer touch-ups:** backend/db/repo + services import sites aligned with trimmed type surface

## Verification Results

- tsgo: **0 errors** (post-hoc, locked direct form)
- knip: enum members 4→0 (documented ignores), namespace members 2→0 (sound deletions), backend-misc exports/types → ~2 leftovers (notification-engine, assigned to pothos/backend-leftovers cluster)
- Dev server: HTTP 200

## Carry-Forward Knowledge

- Namespace-member findings (class methods) CAN be genuinely dead — `AuthService.getMe` had zero callers repo-wide (the `me` GraphQL query uses a different path); deletion verified safe via tsgo
- DB/GraphQL-backed enum protection: grep migrations for pgEnum string values BEFORE touching any flagged member; the ignore must cite the schema evidence (the config comments do)
- `backend/services/AGENTS.md` required a paired pointer edit (getMe reference) — done in-cluster
