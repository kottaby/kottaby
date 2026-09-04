# Phase 6.1 — review-types Wave Outcome

**Task ID:** 6.1
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-04
**Wave scope:** files created/modified by DEV3-017 (git diff vs `origin/main` baseline — working-tree state, all changes uncommitted on branch `feat/dev3-017-account-soft-delete-governance`)
**Reviewer:** Phase 6.1 review-types Wave Subagent
**Baseline reference:** `0-baseline-outcome.md` §Post-Install Re-Baseline (tsgo=0, biome=0, clean tree) — any new violation IS a regression caused by DEV3-017

---

## Changeset reviewed

Captured via `git status --porcelain` (uncommitted working tree on the feature branch — `git diff --name-only origin/main..HEAD` is empty because nothing is committed yet; the porcelain listing is the authoritative changeset).

### Modified files (tracked, unstaged)

- `backend/db/repo/admin/admin-user.repository.ts`
- `backend/graphql/mutation/admin/index.ts`
- `backend/graphql/test/schema-surface.test.ts`
- `backend/graphql/test/sdl-static-assertions.test.ts`
- `backend/lib/auth/server-auth.ts`
- `backend/services/admin/user-management.service.ts`
- `backend/services/auth/auth.service.ts`
- `backend/services/students/student-handshake.helpers.ts`
- `backend/types/admin/admin-user.types.ts`
- `frontend/graphql/generated/gql/graphql.ts`
- `frontend/graphql/generated/schema.graphql`
- `frontend/graphql/sharedDocuments/admin/admin-users.documents.ts`
- `frontend/views/admin/users/detail/AdminUserDetailContainer.tsx`
- `oxlint.config.mts`
- `shared/locale/ar/adminUsers/index.ts`
- `shared/locale/ar/errors/index.ts`
- `shared/locale/en/adminUsers/index.ts`
- `shared/locale/en/errors/index.ts`
- `shared/locale/types/adminUsers/index.ts`
- `shared/locale/types/errors/index.ts`
- `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/deferred-items.md` (ledger — out of scope for review-types)
- `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/tasks.md` (plan — out of scope)

### New files (untracked)

- `backend/db/test/logic/admin/admin-user-governance.repository.test.ts`
- `backend/graphql/mutation/admin/admin-governance.mutation.ts` ← **governance mutation resolver**
- `backend/graphql/test/admin-governance.matrix.test.ts`
- `backend/graphql/test/inv-u4-grep-lock.test.ts`
- `backend/lib/auth/suspension-window.test.ts`
- `backend/lib/auth/suspension-window.ts` ← **shared predicate module**
- `backend/services/admin/admin-guards.helpers.test.ts`
- `backend/services/admin/admin-guards.helpers.ts` ← **shared actor guards**
- `backend/services/admin/user-governance.chaos.test.ts`
- `backend/services/admin/user-governance.service.test.ts`
- `frontend/graphql/sharedDocuments/admin/admin-users.documents.test.ts`
- `frontend/views/admin/users/detail/GovernanceActionsSection.tsx`
- `frontend/views/admin/users/hooks/useGovernanceActions.ts`
- `test/ui/components/admin/users/` (directory)
- `test/workflows/admin/account-governance.journey.test.ts`
- `test/workflows/helpers/admin-governance-cast.ts`
- `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/` (this directory)

**Review-types focus files** (the subset of the changeset whose content is in scope for the five canonical-type-discipline rules):

1. `backend/types/admin/admin-user.types.ts` (canonical type placement)
2. `backend/graphql/mutation/admin/admin-governance.mutation.ts` (resolver discipline — no local types)
3. `backend/services/admin/user-management.service.ts` (enum VALUE import + member usage)
4. `backend/services/admin/admin-guards.helpers.ts` (enum VALUE import + member usage)
5. `backend/db/repo/admin/admin-user.repository.ts` (canonical type import)
6. `backend/lib/auth/suspension-window.ts` (helper-module type discipline)
7. `backend/lib/auth/server-auth.ts` (canonical type imports)
8. `backend/services/auth/auth.service.ts` (canonical type imports)
9. `backend/services/students/student-handshake.helpers.ts` (canonical type imports)

---

## Rule-by-rule verification

### Rule 1 — `GovernanceProbeRowType` placement (canonical home)

**Expected:** `GovernanceProbeRowType` lives in `backend/types/admin/admin-user.types.ts` (the canonical admin-types barrel) — NOT in a service-layer `.types.ts`, NOT in the repository, NOT in the mutation resolver.

**Found:**
- `backend/types/admin/admin-user.types.ts:289-295` — `export interface GovernanceProbeRowType { ... }` with full JSDoc explaining the five governance-column projection shape ✅
- `backend/db/repo/admin/admin-user.repository.ts:60-66` — imports `GovernanceProbeRowType` from `@/backend/types` (canonical barrel) ✅
- `backend/db/repo/admin/admin-user.repository.ts:563, 578` — uses `GovernanceProbeRowType` as the `queryDb<T>` type parameter and `findGovernanceState` return type — consumed, never redeclared ✅
- `backend/db/test/logic/admin/admin-user-governance.repository.test.ts:575, 621` — `GovernanceProbeRowType` appears inside regex patterns (probe assertions verifying the raw-SQL probe read uses the typed shape) — legitimate test references, not a redeclaration ✅

**Verdict:** ✅ PASS — single canonical declaration; all consumers import from the canonical barrel.

### Rule 2 — No local resolver types in `admin-governance.mutation.ts`

**Expected:** `backend/graphql/mutation/admin/admin-governance.mutation.ts` derives its args from Pothos field inference (`t.arg({ type: "Int", required: true })`, etc.) — NO `type X = {...}` or `interface X {...}` declarations in the resolver file.

**Found:** Regex scan `^type\s+\w+\s*=|^interface\s+\w+\s*\{` over the full 101-line mutation file → **zero matches** ✅

The resolver file:
- Imports `UserRole` (VALUE) at line 37 and uses `UserRole.Admin` as authScopes array members at lines 56 and 85 ✅
- Declares both `adminSetUserSuspended` / `adminSetUserBlocked` fields with inline `args: { ... }` objects (Pothos field inference) at lines 48-52 and 78-80 ✅
- No type aliases, no interface declarations, no `type Args = { ... }` constructs ✅

**Verdict:** ✅ PASS — args are inferred from Pothos field declarations; the resolver is genuinely thin.

### Rule 3 — No service-layer `.types.ts` files

**Expected:** No new files matching `backend/services/**/*.types.ts` (or `backend/services/admin/*.types.ts` specifically) — types live in `backend/types/**` only.

**Found:** Glob/regex search across the new files in the changeset for `admin-governance.types|admin-guards.types|user-governance.types|governance.types` → **zero matches** ✅

New backend service-layer files are exclusively:
- `admin-guards.helpers.ts` (helpers, not types)
- `*.test.ts` files (test siblings)

The local `interface SuspensionState` at `backend/lib/auth/suspension-window.ts:29-33` is a **module-private** interface co-located with its single consumer (the `isSuspensionActive` predicate at line 46). This is NOT a service-layer `.types.ts` file — it is the canonical pattern for a pure helper module (predicate + its narrow input shape), mirroring the existing discipline in `backend/lib/auth/jwt.ts` and friends. No violation.

**Verdict:** ✅ PASS — zero service-layer `.types.ts` files created.

### Rule 4 — Canonical imports everywhere (`@/backend/types/...`)

**Expected:** All type imports use `@/backend/types/...` (or the `@/backend/types` barrel re-export). NO relative imports of types from sibling service files (e.g., `from "./admin-governance.types"` or `from "../user-management.types"`).

**Found:** Regex search `from\s+"\.\.\/.*\.types"|from\s+"\./.*\.types"|from\s+"\.\./\.\./.*\.types"` over `backend/services/admin/user-management.service.ts` → **zero matches** ✅

Type imports across the review-types focus files:

- `user-management.service.ts:98-107` — `import type { AdminCreateUserSubmitInput, AdminUpdateUserPatchInput, AdminUserActivityEntryReturnType, AdminUserDetailReturnType, AdminUserFiltersSubmitInput, AdminUserPageReturnType, AdminUserStatsReturnType, DBTransaction } from "@/backend/types";` ✅
- `admin-user.repository.ts:60-66` — `import type { AdminUserSafeSelect, AdminUserUpdateDbPatch, DBQueryExecutor, DBTransaction, GovernanceProbeRowType } from "@/backend/types";` ✅
- `admin-guards.helpers.ts:29` — `import type { DBTransaction } from "@/backend/types";` ✅
- `server-auth.ts:39` — `import type { RegistrationReturnType, UserSelectType } from "@/backend/types";` ✅
- `student-handshake.helpers.ts:15` — `import type { HandshakeDiscoveryRowType } from "@/backend/types";` ✅
- `auth.service.ts:51-57` — `import type { ... } from "@/backend/types";` ✅
- `admin-user.types.ts:1-7` — imports from `@/backend/enum/*` and `@/backend/types/*` ✅
- `admin-governance.mutation.ts:37-42` — value imports only (no type imports needed; the resolver is thin and uses Pothos inference) ✅

**Verdict:** ✅ PASS — every type import uses the canonical `@/backend/types` barrel or canonical `@/backend/enum/*` / `@/backend/types/*` paths.

### Rule 5 — Enum VALUE imports with MEMBERS (`AuditActionType`, `UserRole`)

**Expected:**
- `AuditActionType` imported as a VALUE (`import { AuditActionType }` — NOT `import type`) and used as `AuditActionType.Suspend` etc. (NOT as `"Suspend"` string literals) — in `user-management.service.ts` `setUserSuspended` / `setUserBlocked`.
- `UserRole` imported as a VALUE in `admin-governance.mutation.ts` and used as `[UserRole.Admin]` (NOT `["Admin"]`).
- `UserRole` may be mixed `import { toUserRole, type UserRole }` when both the value (`toUserRole`) and the type-only reference are needed (e.g., `server-auth.ts`) — this is the canonical pattern for an enum whose TS-side members are consumed only as types in some call sites.

**Found:**

#### `AuditActionType` (value import + member usage)

- `user-management.service.ts:73` — `import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";` (VALUE import, NOT `import type`) ✅
- `user-management.service.ts:332` — `AuditActionType.Create` (member) ✅
- `user-management.service.ts:393` — `AuditActionType.Update` (member) ✅
- `user-management.service.ts:457` — `deleted ? AuditActionType.Delete : AuditActionType.Reactivate` (members) ✅
- `user-management.service.ts:566` — `suspended ? AuditActionType.Suspend : AuditActionType.Reactivate` (members) ✅
- `user-management.service.ts:650` — `blocked ? AuditActionType.Suspend : AuditActionType.Reactivate` (members) ✅

Regex search for string-literal enum values `"Suspend"|"Block"|"Reactivate"|"Admin"|'Suspend'|'Block'|'Admin'` across `backend/` → **zero matches** ✅

> **Note on block → `AuditActionType.Suspend` (not `.Block`):** The service intentionally reuses `AuditActionType.Suspend` for the block direction because the dedicated `block` / `unblock` members are deferred per ledger row **D6** (`audit_action_type` vocabulary widening). The outcome of Phase 6.5 will re-confirm D6 stays `📅 Forward`. This is the planned behavior, NOT a violation — the value-import rule is satisfied (enum member used, not string literal).

#### `UserRole` (value import + member usage in the governance mutation)

- `admin-governance.mutation.ts:37` — `import { UserRole } from "@/backend/enum/users/user-role.enum";` (VALUE import, NOT `import type`) ✅
- `admin-governance.mutation.ts:56` — `role: [UserRole.Admin]` (member, not string literal `["Admin"]`) ✅
- `admin-governance.mutation.ts:85` — `role: [UserRole.Admin]` (member, not string literal `["Admin"]`) ✅

#### `UserRole` (value import + member usage in admin-guards)

- `admin-guards.helpers.ts:25` — `import { toUserRole, UserRole } from "@/backend/enum/users/user-role.enum";` (VALUE import) ✅
- `admin-guards.helpers.ts:95` — `if (role !== UserRole.Admin)` (member comparison) ✅

#### `UserRole` and `AuditActionType` in the canonical types file

- `admin-user.types.ts:1` — `import type { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";` — `import type` is CORRECT here because `AuditActionType` appears only as a type annotation (`readonly actionType: AuditActionType;` at line 131), never as a runtime value (no `AuditActionType.Foo` member access in this file) ✅
- `admin-user.types.ts:4` — `import type { UserRole } from "@/backend/enum/users/user-role.enum";` — same rationale; `UserRole` appears only as a type annotation (`readonly role: UserRole;` at line 41, `readonly role?: UserRole | null;` at line 252) ✅

#### `UserRole` in `server-auth.ts` (mixed value + type)

- `server-auth.ts:34` — `import { toUserRole, type UserRole } from "@/backend/enum/users/user-role.enum";` — mixed VALUE (`toUserRole`) + inline-type (`type UserRole`) — canonical pattern when only the converter is needed as a value and the enum is used as a type annotation (`readonly role: UserRole | null;` at line 51). The converter `toUserRole(...)` is invoked as a runtime value at line 120 ✅

**Verdict:** ✅ PASS — both enums are imported as values wherever their members are consumed at runtime; the rule is consistently applied across the changeset.

---

## Findings

**ZERO findings — Plan passes all review-types rules ✅**

No CRITICAL, HIGH, MEDIUM, or LOW findings. Every review dimension passes:

| Rule | Result |
|---|---|
| 1. `GovernanceProbeRowType` placement | ✅ canonical home (`backend/types/admin/admin-user.types.ts:289-295`) |
| 2. No local resolver types in `admin-governance.mutation.ts` | ✅ zero `type X = {...}` / `interface X {...}` declarations |
| 3. No service-layer `.types.ts` files | ✅ zero new `*.types.ts` files under `backend/services/**` |
| 4. Canonical imports everywhere | ✅ all type imports use `@/backend/types` barrel; zero relative sibling `.types` imports |
| 5. Enum VALUE imports with MEMBERS | ✅ `AuditActionType` and `UserRole` value-imported and used as members; zero string-literal enum values across `backend/` |

---

## Verdict

**PASS** — the DEV3-017 changeset is fully compliant with the canonical-type discipline specified in tasks.md §6.1. No fixes required; no ledger entries created; no follow-up work for the review-types dimension.

---

## Carry-forward for orchestrator

- **No ledger entries created** — zero findings, zero D-row additions to `deferred-items.md`.
- **No follow-up work needed** from the review-types wave — the implementation is byte-clean against the five rules.
- **Note for Phase 6.5 (deferred-items cross-check):** D6 (`audit_action_type` vocabulary widening — dedicated `block` / `unblock` enum members) remains `📅 Forward`. The current code correctly reuses `AuditActionType.Suspend` for the block direction under the documented vocabulary-deferral contract. Phase 6.5 should confirm D6 is still `📅 Forward` and that the reuse is documented in the canonical doc (Phase 7.1) under "audit-vocabulary mapping for block/unblock".
- **No conflicts with sibling review waves:** review-types rules are orthogonal to review-backend (atomicity / classifier / DomainError), review-frontend (MUI/i18n), and pentester (BFLA/BOLA/BOPLA). The shared predicate module `suspension-window.ts` and the actor-guards module `admin-guards.helpers.ts` are reviewed here ONLY for type-discipline — their behavioral contracts are owned by review-backend and pentester waves.
