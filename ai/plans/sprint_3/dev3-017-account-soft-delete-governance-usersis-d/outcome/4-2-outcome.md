# Phase 4.2 — i18n `AdminUsers.governanceActions` Group + `detail.governanceNote` Copy Fix Outcome

**Task ID:** 4.2
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-04
**Branch:** `main` (working tree carries the cumulative DEV3-017 changeset across all phases per Phase 0.1 outcome note)
**Agent:** Phase 4.2 i18n governanceActions Subagent
**Requirements:** REQ-002, REQ-064

---

## What was implemented

Extended the EXISTING `AdminUsers` namespace with ONE new group `governanceActions` carrying EXACTLY 20 slots (per REQ-064's enumerated slot list), AND updated the now-inaccurate `detail.governanceNote` copy in BOTH `en` and `ar` locales to describe inline management (the prior copy claimed governance was managed in a separate "Governance module" — that is no longer true under DEV3-017's inline GovernanceActionsSection design).

Per Phase 1.4's established typed-leaf parity pattern, the type declaration was updated FIRST so the compile-time parity guarantee (`adminUsersEn: AdminUsersLabels` + `adminUsersAr: AdminUsersLabels`) forces both locale leaves to provide all 20 new slots at typed-leaf granularity — `bun tsgo` exit 0 is the canonical proof. Both English and Arabic implementations were authored in the same changeset; all 20 Arabic slots carry Arabic script (NOT transliterated). NO new namespace was created; NO new top-level `MessageSchema` entry was introduced; NO new view-layer label type was composed.

The 20 new slots mirror the task-spec enumeration 1:1 — `suspendAction`, `unsuspendAction`, `blockAction`, `unblockAction`, `suspendDialogTitle`, `suspendDialogMessage`, `suspendPeriodLabel`, `suspendPeriodHelper`, `unsuspendDialogTitle`, `unsuspendDialogMessage`, `blockDialogTitle`, `blockDialogMessage`, `unblockDialogTitle`, `unblockDialogMessage`, `confirm`, `cancel`, `suspendSuccessToast`, `unsuspendSuccessToast`, `blockSuccessToast`, `unblockSuccessToast`. NO extras, NO omissions.

The stale `detail.governanceNote` copy was updated in BOTH locales (the JSDoc comment on the type slot was updated too):
- EN: `"Governance windows are managed in the Governance module."` → `"Manage suspension and block state directly on this page."`
- AR: `"تُدار نوافذ الحوكمة من وحدة الحوكمة."` → `"إدارة حالة الإيقاف والحظر مباشرةً من هذه الصفحة."`

## Files modified

| File | Operation |
|---|---|
| `shared/locale/types/adminUsers/index.ts` | EDITED — added ONE new group `governanceActions` (20 `readonly …: string;` slots with per-slot JSDoc comments matching the existing per-key documentation style) inserted AFTER `reactivateConfirm` and BEFORE `detail` (the natural grouping: this places the four confirm-dialog groups `deleteConfirm` / `reactivateConfirm` / `governanceActions` together; the `governanceActions` group is also a sibling of `detail` because it supplies the inline-action copy consumed by the detail-page `GovernanceActionsSection` component in task 4.3). UPDATED the JSDoc on `detail.governanceNote` from "windows live in the Governance module" to "suspension/block state is managed inline on this page". |
| `shared/locale/en/adminUsers/index.ts` | EDITED — added the `governanceActions` object literal with all 20 English string implementations (after `reactivateConfirm`, mirroring the type declaration's group order). UPDATED `detail.governanceNote` copy from `"Governance windows are managed in the Governance module."` to `"Manage suspension and block state directly on this page."` |
| `shared/locale/ar/adminUsers/index.ts` | EDITED — added the `governanceActions` object literal with all 20 Arabic string implementations (Arabic script, matching project tone — `إيقاف` / `إلغاء الإيقاف` / `حظر` / `إلغاء الحظر` for the four action labels, the four dialog title/message pairs, `مدة الإيقاف (أيام)` + `أدخل رقماً صحيحاً بين 1 و3650.` for the period field + helper, `تأكيد` / `إلغاء` for confirm/cancel, and the four `تم … بنجاح` toasts). UPDATED `detail.governanceNote` copy from `"تُدار نوافذ الحوكمة من وحدة الحوكمة."` to `"إدارة حالة الإيقاف والحظر مباشرةً من هذه الصفحة."` |

## Files NOT modified (verified)

- `shared/locale/namespaces/adminUsers/adminUsers.namespace.ts` — UNTOUCHED (the `AdminUsers` namespace handle was already registered in a prior phase via `defineNamespace<AdminUsersLabels>("adminUsers.adminUsers", …)`; the type parameter picks up the new slots automatically since `AdminUsersLabels` is the canonical source of truth — `git diff` empty).
- `shared/locale/types/message.ts` — UNTOUCHED (the existing `adminUsersTranslations: AdminUsersLabels;` slot in `MessageSchema` references `AdminUsersLabels` by type alias; both locale leaves continue to satisfy it).
- `shared/locale/namespaces/registry.ts` — UNTOUCHED (the `AdminUsers` handle was already registered; no new namespace added).
- `frontend/views/admin/users/detail/GovernanceCard.tsx` — UNTOUCHED (it reads `labels.detail.governanceNote` via PROPERTY ACCESS — line 161 `<DetailInfoStrip note={labels.detail.governanceNote} />` — so the new copy flows through with NO source change; verified by `git diff frontend/views/admin/users/detail/GovernanceCard.tsx` empty).
- No component test files were touched — a grep across `frontend/` + `test/` for `managed in the Governance module`, `Governance windows are managed`, and `governanceNote` returned ZERO test assertions pinning the old copy (the only consumer is the runtime component, which reads via property access).
- No plan files (`tasks.md` / `specs.md` / `plan.md`) touched — orchestrator owns checkbox updates.

## Verification evidence

### 4.2.QL Quality Loop

- **sub-loop on `shared/locale/types/adminUsers/index.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo (project-wide, filtered): PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates (jscpd, intra-file): PASS ✅
- **sub-loop on `shared/locale/en/adminUsers/index.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo: PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅
- **sub-loop on `shared/locale/ar/adminUsers/index.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo: PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅
- **tsgo (project-wide)**: exit **0** ✅ — typed-leaf parity intact (both locale leaves satisfy the extended `AdminUsersLabels` interface at compile time)

### 4.2.TE Test Engineering

- The DEV3-017 plan does NOT have a dedicated `adminUsers-namespace.parity.test.ts` suite (verified via `find shared/locale -name "*adminUsers*test*"` returning zero matches). The canonical parity gate for the `AdminUsers` namespace is the typed-leaf discipline (`adminUsersEn: AdminUsersLabels` + `adminUsersAr: AdminUsersLabels`) enforced by `bun tsgo` — exit 0 is the proof.
- The neighboring namespace parity suites all stay green (with one PRE-EXISTING failure unrelated to Phase 4.2 — see Hazards below):
  - `plans-namespace.parity.test.ts`: **4 pass / 0 fail** ✅
  - `errors-namespace.parity.test.ts`: **8 pass / 0 fail** ✅
  - `notifications-namespace.parity.test.ts`: **64 pass / 0 fail** ✅
  - `applicant-namespace.parity.test.ts`: **11 pass / 0 fail** ✅
  - `wallet-namespace.parity.test.ts`: **35 pass / 0 fail** ✅
  - `sessions-namespace.parity.test.ts`: **19 pass / 1 fail** (PRE-EXISTING — see Hazards)
  - `handshakeCode-namespace.parity.test.ts`: **8 pass / 2 fail** (PRE-EXISTING — see Hazards)
- Compile-time proof the `AdminUsers` handle exposes the new group: `tsgo` exit 0 is the canonical proof — the `defineNamespace<AdminUsersLabels>("adminUsers.adminUsers", …)` handle inherits the `governanceActions` group via the `AdminUsersLabels` type parameter. A test that does `AdminUsers.getLabels(t).governanceActions.suspendAction` will type-check (component-tier assertion reserved for task 4.3).
- Property-access only — `frontend/views/admin/users/detail/GovernanceCard.tsx:161` already reads `labels.detail.governanceNote` via property access (no string-literal `t("key")` introduced).

### 4.2.SEC Security & Tenancy Audit

- **N/A per `tasks.md`** (copy-only changes; no transport surface, no auth checks, no tenancy filters). The 20 new slots are pure UI chrome strings; the four success toasts are surfaced ONLY after a successful mutation (the wire-tier authorizations — `USER_SELF_SUSPENSION_FORBIDDEN` / `USER_SELF_BLOCK_FORBIDDEN` / role-escalation guards — are owned by the backend services in Phase 3.x and surfaced via the `errors.adminUsers` flat group added in Phase 1.4).

### 4.2.SR Semantic Review

- **EXACTLY 20 slots in `governanceActions`** ✅ (verified by enumeration + count):
  1. `suspendAction`
  2. `unsuspendAction`
  3. `blockAction`
  4. `unblockAction`
  5. `suspendDialogTitle`
  6. `suspendDialogMessage`
  7. `suspendPeriodLabel`
  8. `suspendPeriodHelper`
  9. `unsuspendDialogTitle`
  10. `unsuspendDialogMessage`
  11. `blockDialogTitle`
  12. `blockDialogMessage`
  13. `unblockDialogTitle`
  14. `unblockDialogMessage`
  15. `confirm`
  16. `cancel`
  17. `suspendSuccessToast`
  18. `unsuspendSuccessToast`
  19. `blockSuccessToast`
  20. `unblockSuccessToast`
- **No extras, no missing** ✅ — the type declaration group + both locale object literals have the SAME 20 keys (verified by tsgo exit 0; the `adminUsersEn: AdminUsersLabels` + `adminUsersAr: AdminUsersLabels` typed-leaf annotations force both leaves to provide ALL 20 slots).
- **No hardcoded copy consumers introduced** ✅ — the 20 strings are DECLARED ONLY (no component imports `governanceActions` yet; consumers come in task 4.3). Verified by grep:
  ```
  $ rg -n 'governanceActions' frontend/ test/ app/ backend/
  (no matches — exit 1)
  ```
- **`detail.governanceNote` updated in BOTH locales** ✅ — EN line 167 + AR line 166 both carry the new inline-management copy; the type slot's JSDoc was updated to match.
- **Both locales have identical key sets** ✅ — typed-leaf parity via `AdminUsersLabels` (tsgo exit 0).
- **Arabic slots carry Arabic script (NOT transliterated)** ✅ — verified by visual inspection of all 20 AR slots (e.g. `suspendAction: "إيقاف"`, `blockSuccessToast: "تم حظر المستخدم بنجاح"`).
- **Property-access discipline intact** ✅ — no `t("key")` introduced anywhere (the only existing consumer `GovernanceCard.tsx` reads `labels.detail.governanceNote` via property access; the new `governanceActions` group has no consumers yet).

### 4.2.IV Instruction Verification

- **`.agents/instructions/frontend.instructions.md` §i18n** ✅:
  - "All user-facing strings via the compile-time TypeScript i18n system in `@/shared/locale` - never hardcode error messages or UI text" — the 20 new slots ship as i18n strings, NOT hardcoded. ✅
  - "Client components: `useAppTranslation('<namespace>')` from `@/shared/locale/client`" — task 4.3 will consume via `useAppTranslation(AdminUsers)` handle + property access (`t.governanceActions.suspendAction`). ✅ (deferred to 4.3 per the task spec; 4.2 declares the strings only).
- **`shared/AGENTS.md` §Translation System** ✅ (existing-namespace extension checklist):
  1. "Add interface to `shared/locale/types/<namespace>/index.ts`" — DONE (added `governanceActions` group + 20 `readonly …: string;` slots; updated `detail.governanceNote` JSDoc). ✅
  2. "Add implementations to `shared/locale/ar/<namespace>/index.ts` and `shared/locale/en/<namespace>/index.ts`" — DONE (both leaves carry the 20-slot object literal; updated `detail.governanceNote` copy in both). ✅
  3. "Export in `shared/locale/types/message.ts` (add to `MessageSchema`)" — N/A (existing namespace; `adminUsersTranslations: AdminUsersLabels` was already registered in a prior phase; the type alias picks up the new slots automatically). ✅
  4. "Add path mapping in `shared/locale/serverLegacy.ts`" — N/A (existing namespace; mapping already registered). ✅
  5. "If used in layout SSR, add to `LocaleProvider` translations in `app/[locale]/layout.tsx`" — N/A (the `AdminUsers` namespace is admin-surface only, NOT used in the global layout SSR). ✅
- **`shared/AGENTS.md` §Translation System / Rules for All Layers / Client Components** ✅ — property access (`t.x.y`) only, never `t("key")`. No new view-layer label type composed (the existing `GovernanceCard.tsx` consumes `AdminUsersLabels.detail.governanceNote` directly). ✅
- **Clean comments (no plan-artifact references)** ✅ — verified by grep:
  ```
  $ rg -n 'REQ-002|REQ-064|Task 4\.2|Phase 4|DEV3-017|tasks\.md|specs\.md|plan\.md|\.ai/plans' shared/locale/types/adminUsers/index.ts shared/locale/en/adminUsers/index.ts shared/locale/ar/adminUsers/index.ts
  (no matches — exit 1)
  ```
- **REQ-002 (Type-Safe i18n & Enum Value Imports Compliance)** ✅:
  - "Client components MUST use `useAppTranslation(<NamespaceHandle>)` with `defineNamespace` handle consts (e.g. `AdminUsers`) and property access (`t.governanceActions.suspend`) — never string literals, never a `Translation` enum (it does not exist), never `t('key')`" — the new `governanceActions` group is accessed via property access (`t.governanceActions.suspendAction`); no string literals, no `Translation` enum, no `t('key')` calls introduced. ✅
- **REQ-064 (i18n Extension, Not Duplication)** ✅:
  - "the EXISTING `AdminUsers` namespace handle SHALL gain ONE new group `governanceActions` (exact slots enumerated in the plan)" — DONE (20 slots, exact enumeration). ✅
  - "in `shared/locale/types/adminUsers/index.ts` + BOTH `en`/`ar` implementations (Arabic slots carry Arabic script)" — DONE (all 20 AR slots in Arabic script). ✅
  - "AND the now-inaccurate `detail.governanceNote` copy ('managed in the Governance module') SHALL be updated in BOTH locales to describe inline management (existing component assertions referencing it are updated in the same changeset)" — DONE (EN + AR copy updated; NO component assertions pin the old copy — verified by grep; the existing `GovernanceCard.tsx` consumer reads via property access so it picks up the new copy with NO source change). ✅
  - "the typed-leaf parity is free via `AdminUsersLabels`" — DONE (`tsgo` exit 0 enforces both leaves provide all 20 slots). ✅
  - "NO hardcoded copy anywhere" — DONE (verified by grep — no `governanceActions` consumers in `frontend/` / `test/` / `app/` / `backend/`). ✅

## Hazards discovered

- **`sessions-namespace.parity.test.ts`** is RED on this sandbox (1 fail / 19 pass — PRE-EXISTING, NOT caused by task 4.2). The failing test asserts "placeholder-name sets agree across ar/en for EVERY errors key (no locale-local drift)" — specifically it fails on `ar.planCatalog` (a sub-block of the `errors` namespace added by another lane — likely DEV3-016 admin CRUD plan catalog). Verified pre-existing by stashing the three Phase 4.2 files and re-running — the 1 fail persists identically:
  ```
  $ git stash push -- shared/locale/types/adminUsers/index.ts shared/locale/en/adminUsers/index.ts shared/locale/ar/adminUsers/index.ts
  $ bun run test/scripts/run-test.ts shared/locale/sessions-namespace.parity.test.ts
  (still 1 fail / 19 pass — IDENTICAL)
  $ git stash pop
  ```
  This is a baseline-test reconciliation debt OUTSIDE my task scope — Phase 4.2's hard rules forbid touching `shared/locale/{types,en,ar}/errors/` (those are owned by Phase 1.4 / DEV3-016). The pre-existing RED state is unchanged by my work (`git diff shared/locale/{types,en,ar}/errors/` shows the Phase 1.4 + DEV3-016 cumulative changes, NONE attributable to 4.2). My task's parity gate is `bun tsgo` exit 0, which PASSES.
- **`handshakeCode-namespace.parity.test.ts`** is similarly RED on this sandbox (2 fail / 8 pass — PRE-EXISTING). Same root cause — the test enumerates `errors.planCatalog` placeholders and the `errors.ar.planCatalog` block is empty / placeholder-drifting across ar/en. Verified pre-existing by the same stash-then-re-run procedure. OUTSIDE Phase 4.2 scope.
- **No other hazards** — clean execution; the typed-leaf parity discipline (Phase 1.4's established pattern) made the locale leaves trivially correct on the first tsgo run; the sub-loop quality gate passed on all three files on the first attempt; the existing `GovernanceCard.tsx` consumer reads the new `governanceNote` copy via property access so NO source change was needed in the component tier (component-tier assertions reserved for task 4.3).

## Carry-forward for task 4.3 (UI view)

- The 20 `governanceActions` slots are READY for consumption via the EXISTING `AdminUsers` namespace handle in the `GovernanceActionsSection` component (task 4.3):
  ```tsx
  import { useAppTranslation } from "@/shared/locale/client";
  import { AdminUsers } from "@/shared/locale/namespaces/adminUsers";
  // …inside the component:
  const t = useAppTranslation(AdminUsers);
  // then: t.governanceActions.suspendAction / t.governanceActions.suspendDialogTitle / t.governanceActions.suspendSuccessToast / etc.
  ```
- The four dialog chrome groups (`deleteConfirm`, `reactivateConfirm`, `governanceActions`) all use the SAME `confirm` / `cancel` button labels — but per REQ-064's exact slot enumeration, `governanceActions` carries its OWN `confirm` / `cancel` slots (NOT a reuse of the `deleteConfirm.confirm` slot). This keeps each dialog self-contained and avoids cross-group coupling (a future dialog copy change to one group won't ripple to the others).
- The success toasts (`suspendSuccessToast`, `unsuspendSuccessToast`, `blockSuccessToast`, `unblockSuccessToast`) are the canonical snackbar copy for the four `useMutation` `onCompleted` callbacks in task 4.3. The existing `snackbars.created` / `snackbars.updated` / `snackbars.deleted` / `snackbars.reactivated` slots stay untouched (different concerns — CRUD vs governance).
- The `detail.governanceNote` copy now describes INLINE management; the existing `GovernanceCard.tsx` consumer (line 161 `<DetailInfoStrip note={labels.detail.governanceNote} />`) picks up the new copy with NO source change. The component tier (task 4.3) will add the NEW `GovernanceActionsSection` component that renders the four action buttons + their confirm dialogs — the existing `GovernanceCard` continues to render the read-only timestamps (`deletedAt` / `suspendedAt` / `blockedAt`) and the info strip.
- Apollo cache + `useMutation` wiring is already in place from task 4.1 (`adminSetUserSuspendedMutationDocument` + `adminSetUserBlockedMutationDocument`) — task 4.3 consumes those documents + the new `governanceActions` slots in the same `GovernanceActionsSection` component.

## Pre-existing sandbox state

The working tree carries the cumulative DEV3-017 changeset from prior phases (1.x, 2.x, 3.x, 4.1). The three locale files edited in this task (`shared/locale/types/adminUsers/index.ts`, `shared/locale/en/adminUsers/index.ts`, `shared/locale/ar/adminUsers/index.ts`) are the ONLY changes attributable to task 4.2. `git diff --name-only` filtered for 4.2-owned files:
- `shared/locale/types/adminUsers/index.ts` (MODIFIED — +1 group with 20 typed slots; +1 JSDoc update on `detail.governanceNote`)
- `shared/locale/en/adminUsers/index.ts` (MODIFIED — +1 group with 20 English strings; +1 line update to `detail.governanceNote`)
- `shared/locale/ar/adminUsers/index.ts` (MODIFIED — +1 group with 20 Arabic strings; +1 line update to `detail.governanceNote`)

`git diff --stat` for the three files: `98 insertions(+), 3 deletions(-)`.
