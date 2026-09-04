# Phase 0.2 — Reuse Substrate Verification

**Task ID:** 0.2 | **Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-03 | **Branch:** `feat/dev3-017-account-soft-delete-governance`
**Agent:** Phase 0.2 Reuse-Substrate Verification Subagent
**Requirements:** REQ-004, REQ-020, REQ-061 (verify-then-claim against LIVE tree)

---

## Anchor Verification (21 anchors)

### A1: AdminUserRepository.setDeletedOnce
- File: `backend/db/repo/admin/admin-user.repository.ts`
- Exists: **PRESENT** (file is 399 lines — cited `627-647` is OUT OF RANGE; actual location below)
- Cited lines: 627-647 | **Actual: 355-375**
- Snippet:
  ```ts
  export async function setDeletedOnce(id, target, tx?): Promise<AdminUserSafeSelect | null> {
    const [row] = await (tx ?? db).update(users)
      .set({ isDeleted: target, deletedAt: target ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(users.id, id), target ? (or(eq(users.isDeleted, false), isNull(users.isDeleted)) ?? sql`false`) : eq(users.isDeleted, true)) ?? sql`false`)
      .returning(SAFE_USER_SELECT);
    return row ?? null;
  }
  ```
- Verdict: ✅ matches spec claim — NULL-safe guarded UPDATE + RETURNING, returns `null` on zero rows. Companion `existsById` cold-path probe at lines 389-397 disambiguates `USER_NOT_FOUND` vs typed conflict. **Line divergence: cited 627-647 vs actual 355-375 (file is 399 lines, not ~700) — the citation was wrong but the artifact is exactly as described.**

### A2: AuditService.createAuditLog
- File: `backend/services/admin/audit.service.ts`
- Exists: **PRESENT** (file is 92 lines)
- Cited lines: 82-90 | **Actual: 82-90** ✅ (exact match)
- Snippet:
  ```ts
  export async function createAuditLog(input: AuditLogWriteContract, tx: DBTransaction): Promise<void> {
    await tx.insert(auditLogs).values({
      actorId: input.actorId, actionType: input.actionType, entityType: input.entityType,
      entityId: input.entityId, details: truncateDetailsSafely(input.details),
    });
  }
  ```
- Verdict: ✅ matches spec claim — caller-supplied transaction (`tx`), contract composed by caller, writer only persists (after safe truncation). Audit row shares the transaction's commit/rollback fate.

### A3: buildAuditContract (closure location probe)
- File: `backend/services/admin/user-management.helpers.ts`
- Exists: **PRESENT** — but **DIVERGES from spec claim**
- Cited location: "the private `buildAuditContract` closure inside `user-management.service.ts`"
- **Actual: NOT a private closure inside the service — it is an EXPORTED FUNCTION in a separate helpers module** at `user-management.helpers.ts:334-348`, imported into the service at line 68 and consumed at lines 313 (Create), 374 (Update), 438 (Delete/Reactivate).
- Snippet:
  ```ts
  export function buildAuditContract(actorId, actionType, entityId, details): AuditLogWriteContract {
    const detailsJson = truncateSafely(JSON.stringify(details), AUDIT_DETAILS_MAX_LENGTH);
    return { actorId, actionType, entityType: AUDIT_ENTITY_TYPE, entityId, details: detailsJson };
  }
  ```
- Verdict: ✅ function exists and behaves as described (BOPLA: field NAMES only, truncated to `varchar(2000)` ceiling). ❌ **DIVERGENCE: location is a separate helpers module, NOT a private closure inside the service.** Implication for DEV3-017: when adding `Suspend`/`Reactivate`/`Block`/`Unblock` audit contracts, reuse this exported helper — do NOT fork a second contract builder.

### A4: AdminUserManagementService.setUserDeleted (incl. self-protection + getUserDetail)
- File: `backend/services/admin/user-management.service.ts` (file is 446 lines)
- Exists: **PRESENT** — cited line numbers diverge
- Cited `setUserDeleted 972-1028` | **Actual: 388-444**
- Cited self-protection `988-996` | **Actual: 405-412** (inside `setUserDeleted`, before any write)
- Cited `getUserDetail 809-833` | **Actual: 225-249** (function declaration; body extends further)
- Snippet (self-protection):
  ```ts
  // Self-protection FIRST — zero writes, zero audit on denial.
  if (id === actorId) {
    logger.logDomainError("Admin self-deactivation denied", { code: "USER_SELF_DEACTIVATION_FORBIDDEN", entity: "user", entityId: id });
    throw new ConflictError("USER_SELF_DEACTIVATION_FORBIDDEN", tErrors.adminUsers.userSelfDeactivationForbidden);
  }
  ```
- Snippet (consumption of setDeletedOnce + zero-row disambiguation):
  ```ts
  const updated = await AdminUserRepository.setDeletedOnce(id, deleted, tx);
  if (updated === null) {
    const exists = await AdminUserRepository.existsById(id, tx);
    if (!exists) throw new NotFoundError(USER_ENTITY, tErrors.adminUsers.userNotFound);
    const code = deleted ? "USER_ALREADY_DELETED" : "USER_NOT_DELETED";
    throw new ConflictError(code, deleted ? tErrors.adminUsers.userAlreadyDeleted : tErrors.adminUsers.userNotDeleted);
  }
  ```
- Verdict: ✅ matches spec claim — single guarded UPDATE → zero-row classifier → audit → return `getUserDetail`. Self-protection is placed FIRST inside the transaction (zero writes, zero audit on denial). `withTransaction` import at line **62** (cited 67 — off by 5). **Line divergences are cosmetic; the behavioral contract is exactly as claimed.**

### A5: AuthService.assertUserActive + login/refresh call sites + SSR gate
- File: `backend/services/auth/auth.service.ts` (file is 315 lines)
- Exists: **PRESENT** — cited lines match exactly
- Cited `assertUserActive 91-98` | **Actual: 91-98** ✅
- Cited login call site ~156 | **Actual: 156** ✅
- Cited refresh call site ~244 | **Actual: 244** ✅
- Snippet:
  ```ts
  function assertUserActive(user: { isDeleted: boolean | null; isBlocked: boolean | null; suspended: boolean | null }, message: string): void {
    if (user.isDeleted || user.isBlocked || user.suspended) {
      throw new ForbiddenError(message);
    }
  }
  // login (line 156):  assertUserActive(user, t.accountBlocked);
  // refreshToken (line 244):  assertUserActive(user, t.accountBlocked);
  ```
- SSR gate: `backend/lib/auth/server-auth.ts` (file is 129 lines)
- Cited `99-106` | **Actual: 99-106** ✅
- Snippet:
  ```ts
  // Governance: fail-closed for deleted / blocked / suspended accounts.
  if (fetched.isDeleted || fetched.isBlocked || fetched.suspended) {
    logger.logDomainError("SSR auth: governed account denied", { code: "SSR_GOVERNED_ACCOUNT", entity: "users", entityId: fetched.id });
    return { userId: null, user: null, role: null };
  }
  ```
- Verdict: ✅ matches spec claim EXACTLY — `assertUserActive` is the single predicate (checks `isDeleted || isBlocked || suspended` as plain flags), called at both login + refresh; SSR gate mirrors it fail-closed. **Implication for DEV3-017: these three sites currently treat `suspended` as a plain boolean flag (NOT a window predicate) — task 2.2 must decide whether to UPGRADE these to window-aware evaluation or keep them as plain flags (the SSR/login path may intentionally use a plain flag because session issuance is instantaneous, not windowed).**

### A6: isGovernanceExcludedFromDiscovery (predicate source of truth)
- File: `backend/services/students/student-handshake.helpers.ts`
- Exists: **PRESENT** (file is 59 lines — predicate-only module)
- Cited `39-59` | **Actual: 39-59** ✅ (exact match)
- Snippet (suspended-branch math):
  ```ts
  if (governance.isDeleted || governance.isBlocked) return true;
  if (!governance.suspended) return false;
  // Fail-closed: non-positive suspendedPeriodDays is corrupt data.
  if (!governance.suspendedAt || governance.suspendedPeriodDays === null || governance.suspendedPeriodDays <= 0) return true;
  const endsAt = new Date(governance.suspendedAt.getTime() + governance.suspendedPeriodDays * MS_PER_DAY);
  return endsAt.getTime() > now.getTime();  // strict: window end exactly at `now` has lapsed
  ```
- Verdict: ✅ matches spec claim — this IS the canonical extraction source of truth for the window predicate. `MS_PER_DAY = 86_400_000` (line 17). **Implication for DEV3-017: the `setUserSuspended` service MUST mirror this exact window math (strict `>` comparison, fail-closed on null/non-positive duration) so the write-side and read-side stay byte-aligned. This is the INV-U2 invariant.**

### A7: AuditActionType enum
- File: `backend/enum/audit/audit-action-type.enum.ts`
- Exists: **PRESENT** (file is 15 lines)
- Cited `Suspend/Reactivate members at 12-13` | **Actual: 12-13** ✅
- Snippet:
  ```ts
  export enum AuditActionType {
    Create = "create", Update = "update", Delete = "delete",
    Override = "override", Adjust = "adjust",
    Suspend = "suspend", Reactivate = "reactivate",
  }
  ```
- Verdict: ✅ matches spec claim. **Note: the enum currently has NO `Block`/`Unblock` members — D6 in deferred-items is the forward pointer for that vocabulary widening. DEV3-017's `Block`/`Unblock` audit rows will need to either (a) reuse `Override` (semantically loose) or (b) follow D6's forward pointer and defer. Per plan.md D6, the decision is to DEFER block/unblock enum members to a future governed schema decision.**

### A8: audit_action_type pgEnum
- File: `backend/db/schema/enums.ts`
- Exists: **PRESENT**
- Cited `66-74` | **Actual: 66-74** ✅
- Snippet:
  ```ts
  export const auditActionType = pgEnum("audit_action_type", [
    "create", "update", "delete", "override", "adjust", "suspend", "reactivate",
  ]);
  ```
- Verdict: ✅ matches spec claim — pgEnum mirrors the TS enum exactly (7 members, identical string values). Single source of truth pairing confirmed.

### A9: withTransaction
- File: `backend/lib/db/with-transaction.ts`
- Exists: **PRESENT** (file is 36 lines)
- Cited "anchor via its import at `user-management.service.ts:67`" | **Actual import at line 62** (off by 5)
- Snippet:
  ```ts
  export async function withTransaction<T>(outerTx: DBTransaction | undefined, fn: (tx: DBTransaction) => Promise<T>): Promise<T> {
    if (outerTx) { return outerTx.transaction(fn); }
    return db.transaction(fn);
  }
  ```
- Verdict: ✅ matches spec claim — canonical SAVEPOINT-vs-top-level branch. Generic `<T>` so any service composes through it. Single substrate confirmed — DEV3-017's `setUserSuspended`/`setUserBlocked` MUST reuse this (no second transaction helper).

### A10: withAuditDeleteTriggersSuspended
- File: `test/helpers/db-cleanup.ts`
- Exists: **PRESENT**
- Cited `83-109` | **Actual: 83-109** ✅
- Snippet:
  ```ts
  export async function withAuditDeleteTriggersSuspended<T>(fn: () => Promise<T>): Promise<T> {
    const discovered = await db.execute<{ tgname: string; tgenabled: string }>(
      sql`SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal`
    );
    // ... disable each, run fn, restore prior state in finally ...
  }
  ```
- Verdict: ✅ matches spec claim — exported for cross-suite reuse; `test/workflows/helpers/journey-cleanup.ts` wraps its audit-log deletes in this same suspension wrapper (single source of truth, confirmed via the doc comment at lines 79-81).

### A11: test/workflows/AGENTS.md (journey harness rules)
- File: `test/workflows/AGENTS.md`
- Exists: **PRESENT** (file is 145 lines — comprehensive)
- Cited: full file | **Actual: 145 lines, 12 hard rules + shared-helpers catalog**
- Snippet (key rules): rule 1 NO `runInRollback`; rule 2 committed fixtures + tracked cleanup via `TrackedFixtures`; rule 4 honest authorization only (real `users` rows + role-child rows, never permission stubs); rule 5 external effects always intercepted (spy the dispatch boundary); rule 6 NO `expect(...).rejects.toThrow()` — use try/catch + translated substrings.
- Verdict: ✅ matches spec claim — journey harness presence confirmed. **Implication for DEV3-017 task 2.5 (chaos tier): the journey tests for suspend/block MUST follow these 12 rules — real `users` rows, real role-child rows, tracked cleanup, dispatch spies, no `runInRollback`.**

### A12: test/workflows/helpers/ directory
- LS result — 11 files PRESENT:
  - `index.ts` (barrel — pure `export *`)
  - `tracked-fixtures.ts`, `journey-fixtures.ts`, `journey-fixture-registry.ts` (registry + FK-order-aware cleanup)
  - `actor-context.ts`, `journey-actor-fixtures.ts`, `session-cast.ts` (cast builders over `entity-setup.ts`)
  - `spied-transport.ts` (fan-out transport spy)
  - `journey-cleanup.ts` (audit-trigger-suspension wrapper consumer)
  - `journey-fixtures.smoke.test.ts`, `helpers.self-test.test.ts` (harness self-tests)
- Verdict: ✅ matches spec claim — shared scaffolding home confirmed. **DEV3-017 journey tests will register sessions/students/admins via `journey-fixtures.ts` and cleanup via the registry; no new harness scaffolding needed.**

### A13: AdminUserDetailPothosObject governance fields
- File: `backend/graphql/pothos/admin/admin-user.pothos.ts` (file is 342 lines)
- Exists: **PRESENT**
- Cited `235-300` | **Actual: 235-300** ✅
- Snippet (governance fields, lines 247-265):
  ```ts
  isDeleted: t.field({ type: "Boolean", nullable: true, resolve: parent => parent.isDeleted ?? false }),
  deletedAt: t.field({ type: "String", nullable: true, resolve: parent => parent.deletedAt ? parent.deletedAt.toISOString() : null }),
  suspended: t.field({ type: "Boolean", nullable: true, resolve: parent => parent.suspended ?? false }),
  suspendedAt: t.field({ type: "String", nullable: true, resolve: parent => parent.suspendedAt ? parent.suspendedAt.toISOString() : null }),
  suspendedPeriodDays: t.exposeInt("suspendedPeriodDays", { nullable: true }),
  isBlocked: t.field({ type: "Boolean", nullable: true, resolve: parent => parent.isBlocked ?? false }),
  blockedAt: t.field({ type: "String", nullable: true, resolve: parent => parent.blockedAt ? parent.blockedAt.toISOString() : null }),
  ```
- Verdict: ✅ matches spec claim — ALL governance fields already exposed: `isDeleted`/`deletedAt`/`suspended`/`suspendedAt`/`suspendedPeriodDays`/`isBlocked`/`blockedAt`. **Implication for DEV3-017 task 3.x: the pothos object needs ZERO new governance fields — they're all already there. DEV3-017 only adds the `adminSetUserSuspended`/`adminSetUserBlocked` mutations (which return the same `AdminUserDetail` type).**

### A14: AdminUserDetailFields fragment
- File: `frontend/graphql/sharedDocuments/admin/admin-users.documents.ts` (file is 203 lines)
- Exists: **PRESENT**
- Cited `50-103` | **Actual: 51-103** ✅ (off by 1 — fragment starts at line 51)
- Snippet (id-first + governance fields, lines 52-67):
  ```graphql
  fragment AdminUserDetailFields on AdminUserDetail {
    id
    fullName
    email
    ...
    isDeleted
    deletedAt
    suspended
    suspendedAt
    suspendedPeriodDays
    isBlocked
    blockedAt
    ...
  }
  ```
- Verdict: ✅ matches spec claim — `id`-first (line 53), all 7 governance fields present at lines 61-67. **Implication for DEV3-017 task 4.x: the frontend fragment needs ZERO new fields — the mutations will reuse this exact fragment for post-write refetch/cache merge.**

### A15: shared/locale/en/errors/index.ts (error keys)
- File: `shared/locale/en/errors/index.ts` (file is 61 lines)
- Exists: **PRESENT**
- Cited `17-19` for `accountDeleted/accountBlocked/accountSuspended` | **Actual: 17-19** ✅
- Snippet:
  ```ts
  accountDeleted: "This account has been deleted.",
  accountBlocked: "This account has been blocked.",
  accountSuspended: "This account is suspended.",
  ```
- Verdict: ✅ matches spec claim — all three governance error keys already exist in EN. **Implication for DEV3-017: the auth SSR gate + login + refresh paths already localize denials via these keys. NO new locale keys needed for the deny path.**

### A16: shared/locale/ar/errors/index.ts (ar twin)
- File: `shared/locale/ar/errors/index.ts` (file is 61 lines)
- Exists: **PRESENT**
- Cited `17-19` twin | **Actual: 17-19** ✅
- Snippet:
  ```ts
  accountDeleted: "تم حذف هذا الحساب.",
  accountBlocked: "تم حظر هذا الحساب.",
  accountSuspended: "هذا الحساب موقوف.",
  ```
- Verdict: ✅ matches spec claim — AR twin present at identical line numbers. Both locales symmetric.

### A17: app/(dashboard)/admin/users/[id]/page.tsx
- File: `app/(dashboard)/admin/users/[id]/page.tsx` (file is 37 lines)
- Exists: **PRESENT**
- Snippet:
  ```tsx
  export default async function AdminUserDetailPage({ params }): Promise<React.ReactElement> {
    await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" });
    const { id } = await params;
    const locale = await getLocaleFromCookie();
    const t = getTranslations(locale).adminUsersTranslations;
    return <AdminUserDetailContainer labels={t} userId={Number(id)} />;
  }
  ```
- Verdict: ✅ matches spec claim — Server Component, `withPageAuth` admin-gated, renders `<AdminUserDetailContainer labels={t} userId={Number(id)} />`. **Note: page.tsx imports the container from `@/frontend/views/admin/users/detail` (subdirectory `detail/`), NOT from `@/frontend/views/admin/users` directly — see A18 divergence.**

### A18: frontend/views/admin/users/AdminUserDetailContainer.tsx (cited path)
- Cited path: `frontend/views/admin/users/AdminUserDetailContainer.tsx`
- Exists at cited path: **ABSENT** ❌
- **Actual location:** `frontend/views/admin/users/detail/AdminUserDetailContainer.tsx` (subdirectory `detail/`)
- Snippet (orchestration pattern, lines 58-67):
  ```tsx
  export function AdminUserDetailContainer({ labels, userId }: AdminUserDetailContainerProps) {
    const detail = useAdminUserDetail(userId);
    if (detail.loading && !detail.data) return <UserDetailLoading />;
    if (detail.errorCode || !detail.data?.adminUserDetail) return <UserDetailNotFound labels={labels} />;
    const user = detail.data.adminUserDetail;
    // ... renders UserDetailHero + GovernanceCard + role cards + RecentActivityCard ...
  }
  ```
- Verdict: ⚠️ **PATH DIVERGENCE (not a missing artifact)** — the container EXISTS but at `detail/AdminUserDetailContainer.tsx`, not the cited root path. The container is orchestration-only: `useAdminUserDetail(userId)` hook owns queries/mutations; inline dialogs (`UserDetailInlineDialogs`) own the suspend/block/delete-reactivate surfaces. **Implication for DEV3-017 task 4.3: UPDATE-IN-PLACE — the container needs NO new card; `GovernanceCard` (already imported at line 38, rendered at line 113) is where the suspend/block UI lands. The hook `useAdminUserDetail` (in `@/frontend/views/admin/users/hooks`) is where the new mutation docs are wired.**

### A19: backend/services/admin/admin-guards.helpers.ts (CONDITIONAL)
- Cited path: `backend/services/admin/admin-guards.helpers.ts` (plural "guards")
- Exists: **ABSENT** ❌ (no file by that name)
- **Sibling present:** `backend/services/admin/admin-gate.helpers.ts` (singular "gate") EXISTS at the same directory — but its content is the BFLA actor gate (`assertActorAdmin`) + audit-enum coercion (`toAuditActionType`). It contains **NO `suspended`/`blocked` evaluation** — no strict guard for governance state.
- Verdict: ❌ **ABSENT — task 2.2 must BUILD a new strict governance guard from scratch.** Branch decision: **B-upgrade** — there is no existing strict variant to consume; the new guard must (a) evaluate `suspended` as a window predicate (mirroring `isGovernanceExcludedFromDiscovery` math from A6) for the GraphQL CONTEXT boundary (D5's documented window), and (b) evaluate `isDeleted`/`isBlocked` as plain fail-closed flags. The plain-flag variants at `assertUserActive` (A5) and the SSR gate (A5) stay as-is for the login/session-issuance path (instantaneous, not windowed).

### A20: schema-surface.test.ts admin mutations probe
- File: `backend/graphql/test/schema-surface.test.ts`
- Exists: **PRESENT** (file is 925 lines)
- Probe: searched for `adminSetUser|adminCreate|adminUpdate|adminDelete` → **NO MATCHES**
- Mutation inventory arrays found:
  - `PRE_3_1_MUTATION_FIELDS` (lines 90-101): 10 ops — `createPlan`, `login`, `logout`, `markAllNotificationsRead`, `markNotificationRead`, `refreshToken`, `registerUser`, `setPlanActiveStatus`, `updateMyLocale`, `updatePlan`
  - `DEV3_004_MUTATION_FIELDS` (line 123): `cancelSession`, `completeSession`, `createSession`, `startSession`
  - `DEV3_005_MUTATION_FIELDS` (line 125): `openSessionDispute`, `resolveSessionDispute`
  - `DEV3_012_MUTATION_FIELDS` (line 127): `confirmSessionCompletion`
  - `DEV3_013_MUTATION_FIELDS` (line 131): `requestWithdrawal`
  - **NO `adminCreateUser` / `adminUpdateUser` / `adminSetUserDeleted` entries in any inventory array**
- Verdict: ❌ **STALE — admin-user mutations (`adminCreateUser`, `adminUpdateUser`, `adminSetUserDeleted`) are LIVE in the schema (see schema-surface freshness check below) but NOT inventoried in this test file.** This test would fail its "pinned additions vs baseline" surface-freeze check if it strictly asserts the Mutation root set. **Drives task 3.4: RECONCILE-then-EXTEND — task 3.4 must add the three existing admin-user mutations to the inventory BEFORE pinning the new DEV3-017 mutations (`adminSetUserSuspended`, `adminSetUserBlocked`).**

### A21: sdl-static-assertions.test.ts admin mutations probe
- File: `backend/graphql/test/sdl-static-assertions.test.ts`
- Exists: **PRESENT** (file is 352 lines)
- Probe: searched for `adminSetUser|adminCreate|adminUpdate|adminDelete|adminUser|adminUsers` → **NO MATCHES**
- Mutation inventory: `FROZEN_MUTATION_FIELDS` (lines 67-75) — exactly 7 ops:
  ```ts
  const FROZEN_MUTATION_FIELDS = [
    "login", "logout", "markAllNotificationsRead", "markNotificationRead",
    "refreshToken", "registerUser", "updateMyLocale",
  ] as const;
  ```
- Test at line 220-223: `test("Mutation root is EXACTLY the refreshed frozen 7-op baseline ...", () => { const names = fieldSurfaces("Mutation").map(s => s.name); expect(names.toSorted(...)).toEqual([...FROZEN_MUTATION_FIELDS]); });`
- Verdict: ❌ **DEFINITELY STALE — uses `toEqual` (EXACT match) against a 7-op baseline, but the LIVE Mutation root has 20+ ops (including `adminCreateUser`, `adminSetUserDeleted`, `adminUpdateUser`, all DEV3-004/005/012/013 mutations, plan-catalog CRUD). This test WILL FAIL when run.** Either the test is currently broken/skipped in CI, or the test was last refreshed before the admin-user + session + plan-catalog mutations landed. **Drives task 3.4: this file needs a wholesale refresh of `FROZEN_MUTATION_FIELDS` to mirror the live Mutation root before DEV3-017 adds its 2 new mutations.**

---

## Schema-Surface Freshness Check

### Live schema build
- Command: `bun run generate:gqlSchema 2>&1 | tail -30`
- Result: **SUCCESS** — `[generate:gqlSchema] wrote /home/z/my-project/frontend/graphql/generated/schema.graphql (15932 bytes)`
- (Note: contrary to the Phase 0.1 baseline outcome's "missing node_modules" hazard, the schema generator script ran successfully — `bun install` appears to have populated enough of `node_modules` for the generator's dependency closure. The Phase 0.1 hazard stands for `tsgo`/`biome`/`lint-service` but does NOT block schema generation.)

### Live Mutation root inventory (from `frontend/graphql/generated/schema.graphql` lines 236-239+)
```
type Mutation {
  adminCreateUser(input: AdminCreateUserInput!): AdminUserDetail!
  adminSetUserDeleted(deleted: Boolean!, id: Int!): AdminUserDetail!
  adminUpdateUser(id: Int!, input: AdminUpdateUserInput!): AdminUserDetail!
  cancelSession(id: ID!, reason: String): Session!
  completeSession(id: ID!): Session!
  confirmSessionCompletion(id: ID!): Session!
  createPlan(input: CreatePlanInput!): Plan!
  createSession(input: CreateSessionInput!): Session!
  login(...): LoginPayload!
  logout: LogoutPayload!
  markAllNotificationsRead: NotificationListPage!
  markNotificationRead(id: ID!): Notification!
  openSessionDispute(id: ID!, reason: String!): Session!
  refreshToken(token: String!): RefreshTokenPayload!
  registerUser(...): RegisterPayload!
  requestWithdrawal(input: WithdrawalRequestInput!): WithdrawalRequest!
  resolveSessionDispute(id: ID!, note: String): Session!
  setPlanActiveStatus(id: Int!, isActive: Boolean!): Plan!
  startSession(id: ID!): Session!
  updateMyLocale(locale: AppLocale!): AppLocale!
  updatePlan(id: Int!, input: UpdatePlanInput!): Plan!
}
```
(Live Mutation root = 21 ops, including the 3 admin-user mutations.)

### Test inventory comparison
- **schema-surface.test.ts** inventory (PRE_3_1 + DEV3-004 + DEV3-005 + DEV3-012 + DEV3-013): 18 ops — **MISSING the 3 admin-user mutations** (`adminCreateUser`, `adminSetUserDeleted`, `adminUpdateUser`). STALE.
- **sdl-static-assertions.test.ts** `FROZEN_MUTATION_FIELDS`: 7 ops only (auth quartet + notification read-latch pair + `updateMyLocale`). Uses `toEqual` exact-match. **MISSING 14 ops** (3 admin-user + 3 plan-catalog + 4 session + 2 dispute + 1 confirm + 1 withdrawal). DEFINITELY STALE.

### Verdict: **STALE**
- Live schema build: SUCCESS
- Both schema-surface test inventories are BEHIND the live schema — admin-user mutations are absent from BOTH files.
- **Drives task 3.4 branch: RECONCILE-then-EXTEND.** Task 3.4 must:
  1. Add the 3 existing admin-user mutations (`adminCreateUser`, `adminSetUserDeleted`, `adminUpdateUser`) to both test inventories FIRST (reconcile with live schema).
  2. THEN pin the 2 new DEV3-017 mutations (`adminSetUserSuspended`, `adminSetUserBlocked`) as sanctioned additions.
  3. For `sdl-static-assertions.test.ts`: the `FROZEN_MUTATION_FIELDS` array needs wholesale refresh from 7 ops → 21 ops (current live) → 23 ops (after DEV3-017 lands). Consider renaming the test from "7-op baseline" to reflect the refreshed count.

---

## Conditional Verdicts

### admin-guards.helpers.ts (task 2.2 branch decision)
- **ABSENT** (no file by that exact name; sibling `admin-gate.helpers.ts` exists but is a BFLA actor gate, not a governance-state guard).
- → **task 2.2 Branch B-upgrade**: BUILD a new strict governance guard from scratch. The new guard MUST:
  - Evaluate `suspended` as a window predicate (mirror `isGovernanceExcludedFromDiscovery` math from A6: `suspendedAt + suspendedPeriodDays * MS_PER_DAY > now`, fail-closed on null/non-positive duration).
  - Evaluate `isDeleted` / `isBlocked` as plain fail-closed flags (no windowing — these are indefinite states).
  - Land at a new file (recommend `backend/services/admin/admin-governance-guard.helpers.ts` to avoid colliding with the existing `admin-gate.helpers.ts` BFLA gate).
  - Be consumed at the GraphQL CONTEXT boundary (D5's documented window — request-time governance gate).

### Frontend container shape (task 4.3 update-in-place)
- Container at `frontend/views/admin/users/detail/AdminUserDetailContainer.tsx` (NOT the cited root path).
- Pattern: **orchestration-only** — `useAdminUserDetail(userId)` hook owns queries + mutation dispatch; `GovernanceCard` (already imported + rendered at line 113) is the suspend/block UI surface; `UserDetailInlineDialogs` (rendered at line 142) owns the dialog state.
- → **task 4.3: UPDATE-IN-PLACE** — zero new cards needed. The new `adminSetUserSuspended` / `adminSetUserBlocked` mutations wire into the existing `useAdminUserDetail` hook (new mutation docs + dispatch entry points), and the existing `GovernanceCard` surface gains suspend/block action buttons (mirroring the existing Delete/Reactivate pattern in `DeleteConfirmDialog`). Post-write detail fragments merge into the Apollo cache (`AdminUserDetail:<id>`, id-first) — no explicit refetch needed.

---

## Reuse-Not-Rebuild Gate

**ALL reuse artifacts PRESENT: YES** (with caveats)

- A1–A18: **18/18 PRESENT** (A18 at a divergent subdirectory path; A1/A3/A4/A9/A14 with cited-line divergences but artifacts behave as described).
- A19 (conditional `admin-guards.helpers.ts`): **ABSENT** — but this is a CONDITIONAL anchor (the spec explicitly said "may not exist; if absent, that itself is the verdict"). The sibling `admin-gate.helpers.ts` covers a DIFFERENT concern (BFLA actor gate, not governance-state). The absence of a strict governance guard is the EXPECTED state — DEV3-017 task 2.2 is the ticket that BUILDS it. This is NOT a missing reuse artifact; it is a NEW artifact this plan owes.
- A20/A21 (schema-surface test inventories): PRESENT as files but STALE in content — admin-user mutations absent from both inventories. This is a RECONCILE debt, not a missing artifact.

**Ledger entries added: 0** — no genuinely missing reuse artifact found. The A19 absence is the planned greenfield for task 2.2 (not a missing dependency). The A20/A21 staleness is the planned reconcile-then-extend work for task 3.4 (not a missing dependency). Per the hard rule "If any reuse artifact is missing → record a ❌ ledger entry," the threshold is NOT crossed: every substrate the implementation tasks intend to CONSUME is present. The substrates the plan intends to BUILD (new guard, extended test inventory) are this plan's own deliverables, not external dependencies.

---

## Carry-Forward Knowledge

1. **Cited line numbers in tasks.md are systematically inflated** for the admin-user-management substrate (A1: cited 627-647 vs actual 355-375; A4: cited 972-1028 vs actual 388-444; A4 getUserDetail: cited 809-833 vs actual 225-249). The cited line numbers appear to come from an older revision of these files (perhaps pre-extraction of helpers). **Implementation subagents MUST grep for the symbol name, not trust the cited line number** — the artifacts behave as described, they just live at different lines now.
2. **`buildAuditContract` is NOT a private closure inside `user-management.service.ts`** (as the spec phrased it) — it is an EXPORTED FUNCTION in `user-management.helpers.ts:334-348`, imported into the service at line 68. DEV3-017 task 2.x MUST reuse this exported helper (no second contract builder) and extend its `AuditActionType` parameter to accept the new `Suspend`/`Reactivate` (already in enum) and `Block`/`Unblock` (deferred per D6 — reuse `Override` for now).
3. **`assertUserActive` (A5) treats `suspended` as a PLAIN BOOLEAN FLAG** (not a window predicate). The SSR gate (A5) mirrors this. This is intentional for the login/session-issuance path (instantaneous decision). The window predicate lives ONLY in `isGovernanceExcludedFromDiscovery` (A6) for the discovery read path. **DEV3-017 task 2.2 must NOT upgrade `assertUserActive`/SSR gate to window evaluation** — that would change the contract for login (a suspended user with a lapsed window could log in, which may be desired OR not — this is a DESIGN DECISION the plan must make explicit). Recommend: keep `assertUserActive` as plain flag (matches current behavior — any `suspended=true` denies login regardless of window); put the window predicate ONLY in the new strict governance guard consumed at the GraphQL CONTEXT boundary (D5).
4. **The pothos `AdminUserDetailPothosObject` (A13) and the frontend `AdminUserDetailFields` fragment (A14) already expose ALL 7 governance fields.** DEV3-017 task 3.x (pothos) and task 4.x (frontend) need ZERO new fields on the detail type — only NEW MUTATIONS (`adminSetUserSuspended`, `adminSetUserBlocked`) returning the existing `AdminUserDetail` type. This is a major reuse win — the entire governance read surface is already wired end-to-end.
5. **Schema-surface tests are STALE** (A20/A21). `sdl-static-assertions.test.ts` uses `toEqual` exact-match against a 7-op Mutation baseline, but the live Mutation root has 21 ops. This test WILL FAIL when run. Either CI is currently red on this test, or the test is being skipped somehow (not via `test.skip` — verified it's a plain `test()` call). **Task 3.4 MUST reconcile the `FROZEN_MUTATION_FIELDS` array to mirror the live 21-op Mutation root BEFORE pinning the 2 new DEV3-017 mutations.** The orchestrator should flag this as a pre-existing test debt that DEV3-017 inherits (not causes).

---

## Files Touched by This Task

| File | Operation |
|---|---|
| `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/0-2-reuse-substrate-outcome.md` | CREATED — this file |
| `frontend/graphql/generated/schema.graphql` | REGENERATED (by `bun run generate:gqlSchema` during the freshness check — verbatim same content as the committed file, 15932 bytes; no semantic change to the working tree) |

No source files under `backend/`, `frontend/` (excluding the regenerated schema.graphql artifact), `app/`, `shared/`, `test/` were EDITED. No `db:*` commands run. The `tasks.md` checkbox `[ ] 0.2` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome. The `deferred-items.md` ledger is UNTOUCHED (D1-D7 rows stay as seeded; zero ❌ entries added — no genuinely missing reuse artifact found).
