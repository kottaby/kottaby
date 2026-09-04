# Phase 4.1 — Frontend Mutation Documents Outcome

**Task ID:** 4.1
**Plan:** ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d
**Date:** 2026-09-04
**Branch:** `main` (working tree carries the cumulative DEV3-017 changeset across all phases per Phase 0.1 outcome note)
**Agent:** Phase 4.1 Frontend Mutation Documents Subagent
**Requirements:** REQ-062

## What was implemented

Added TWO mutation documents to `frontend/graphql/sharedDocuments/admin/admin-users.documents.ts`, both reusing the EXISTING `AdminUserDetailFields` fragment (id-first → Apollo cache merge → no refetch needed on the detail page):

- `adminSetUserSuspendedMutationDocument: TypedDocumentNode<AdminSetUserSuspendedMutation, AdminSetUserSuspendedMutationVariables>`
  - GraphQL signature mirrors REQ-060 SDL: `adminSetUserSuspended(id: Int!, suspended: Boolean!, periodDays: Int): AdminUserDetail!`
  - Variable source order: `id`, `suspended`, `periodDays`
- `adminSetUserBlockedMutationDocument: TypedDocumentNode<AdminSetUserBlockedMutation, AdminSetUserBlockedMutationVariables>`
  - GraphQL signature mirrors REQ-060 SDL: `adminSetUserBlocked(blocked: Boolean!, id: Int!): AdminUserDetail!`
  - Variable source order: `id`, `blocked`

Both use named operations (`mutation AdminSetUserSuspended` / `mutation AdminSetUserBlocked`), spread the EXISTING `AdminUserDetailFields` fragment (NO bespoke inline selection duplicating the fragment), and use `TypedDocumentNode` typing against the codegen-generated operation + variables types. Apollo merges the post-mutation response into the SAME `AdminUserDetail:<id>` normalized entry (because the fragment selects `id` FIRST → cache key is identical to the detail query response) — the detail page re-renders WITHOUT a refetch.

Ran `bun codegen` after the document edits → the codegen pipeline regenerated `frontend/graphql/generated/gql/graphql.ts` with the four new types:
- `AdminSetUserSuspendedMutation` + `AdminSetUserSuspendedMutationVariables`
- `AdminSetUserBlockedMutation` + `AdminSetUserBlockedMutationVariables`

(plus the corresponding `AdminSetUserSuspendedDocument` / `AdminSetUserBlockedDocument` operation constants — gitignored codegen artifact, not committed).

## Files modified

- `frontend/graphql/sharedDocuments/admin/admin-users.documents.ts` — extended:
  - Added 4 imports (`AdminSetUserBlockedMutation`, `AdminSetUserBlockedMutationVariables`, `AdminSetUserSuspendedMutation`, `AdminSetUserSuspendedMutationVariables`) in alphabetical order.
  - Added 2 new mutation document exports at the end of the file, mirroring the existing `adminSetUserDeletedMutationDocument` pattern (JSDoc + `TypedDocumentNode` annotation + `gql\`...\`` template with `${ADMIN_USER_DETAIL_FIELDS}` fragment spread + `...AdminUserDetailFields` fragment spread inside the root field).
- `frontend/graphql/sharedDocuments/admin/admin-users.documents.test.ts` — NEW (475 lines): co-located PURE contract test suite for the admin-user documents module (mirrors `notification.documents.test.ts` discipline). 19 tests covering:
  - Named operations + channel + variables pin (9 documents × per-doc test + variable-wiring test + variable-surface-smuggling test)
  - id + fragment-reuse shapes (AdminUserDetailFields id-first, AdminUserListItemFields id-first, detail-returning fragment reuse, directory-rows fragment reuse, direct-id selections id-first, scalar-only envelope)
  - Codegen binding + barrel parity (compile-time proof by assignment for 9 documents + top-level barrel ≡ deep-import identity for 6 documents)
- `frontend/graphql/generated/gql/graphql.ts` — regenerated locally by `bun codegen` (gitignored; not committed).

## Files NOT modified (verified)

- `frontend/providers/apollo/apolloCache.test.ts` — UNTOUCHED (`git diff frontend/providers/apollo/apolloCache.test.ts` empty; `git diff --stat frontend/providers/apollo/` empty). The five-entry FROZEN policy surface pin at lines 176-185 is byte-identical to baseline; NO `typePolicies` changes; default Apollo normalization applies (no `keyFields: false` for `AdminUserDetail` — it normalizes on `id` by default).
- `frontend/graphql/sharedDocuments/documents.contract.test.ts` baseline table — UNTOUCHED (`git diff` empty). The 13-row baseline table for auth + scheduling documents is byte-identical to baseline; the suite continues to pass (20/20).
- No plan files (`tasks.md` / `specs.md` / `plan.md`) touched — orchestrator owns checkbox updates.

## Verification evidence

### 4.1.QL Quality Loop

- **sub-loop on `admin-users.documents.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo (project-wide, filtered): PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates (jscpd, intra-file): PASS ✅
- **sub-loop on `admin-users.documents.test.ts`** (`--lifecycle duplicates`): exit **0** ✅
  - tsgo: PASS ✅
  - oxlint: PASS ✅
  - biome:check: PASS ✅
  - lint:type-aware: PASS ✅
  - check:duplicates: PASS ✅ (skipped — outside jscpd scan scope for `.test.ts` files)
- **tsgo (project-wide)**: exit **0** ✅ (zero new TypeScript errors introduced)

### 4.1.TE Test Engineering

- **Decision: CREATED** `frontend/graphql/sharedDocuments/admin/admin-users.documents.test.ts` (no sibling admin-users documents test existed prior — verified via `find frontend/graphql/sharedDocuments -name "*.test.ts"` returning only `plan-catalog.documents.test.ts`, `notification.documents.test.ts`, `documents.contract.test.ts`).
- Contract test suite: **19 pass / 0 fail / 160 expect() calls** ✅
- Run via: `bun run test/scripts/run-test.ts frontend/graphql/sharedDocuments/admin/admin-users.documents.test.ts` → exit 0
- The unrelated `documents.contract.test.ts` baseline table is UNTOUCHED and continues to pass (20/20 / 124 expect() calls).
- Sibling regression suites stay green:
  - `notification.documents.test.ts`: 12/12 pass ✅
  - `documents.contract.test.ts`: 20/20 pass ✅

### 4.1.SEC Security & Tenancy Audit

- **Documents declare ONLY the sanctioned args** ✅:
  - `adminSetUserSuspendedMutationDocument`: variables `$id: Int!`, `$suspended: Boolean!`, `$periodDays: Int` (matches REQ-060 SDL `adminSetUserSuspended(id: Int!, suspended: Boolean!, periodDays: Int)`)
  - `adminSetUserBlockedMutationDocument`: variables `$id: Int!`, `$blocked: Boolean!` (matches REQ-060 SDL `adminSetUserBlocked(blocked: Boolean!, id: Int!)`)
- **No smuggling surface** ✅:
  - The variable-surface contract test pins the sorted union across ALL admin-user documents to `["blocked", "deleted", "filters", "id", "id", "id", "id", "id", "id", "input", "input", "limit", "page", "pageSize", "periodDays", "suspended"]` — any new doc smuggling a caller-identity argument (e.g. `actorId`, `userId`) breaks this pin.
  - Belt-and-braces: every declared variable name is asserted to NOT contain `actor` or `userid` (case-insensitive).
  - NO `$input` bulk payload widening: the only `$input` variables are for `AdminCreateUserInput` and `AdminUpdateUserInput` (the existing create/update whitelist surfaces) — these are server-validated input types with explicit field whitelists (NOT identity-carrying payloads).
  - The arguments are ALL scalar (`Int`, `Boolean`) — no input object types declared for the new mutations. Smuggled / undeclared args die as `GRAPHQL_VALIDATION_FAILED` at the Pothos schema layer before any resolver runs (the GraphQL spec mandates that unknown field arguments are rejected at parse/validate time, which precedes resolver execution).

### 4.1.SR Semantic Review

- **Fragment reuse** ✅:
  - Both new mutations spread the EXISTING `AdminUserDetailFields` fragment (`...AdminUserDetailFields`) — NO bespoke inline selection duplicating the fragment.
  - The contract test "detail-returning reads + writes spread the EXISTING AdminUserDetailFields fragment (no bespoke inline selection)" pins this for ALL detail-returning reads + writes (detail query, create / update / soft-delete / suspend / block mutations) — a future bespoke inline selection would fail this pin.
  - The `${ADMIN_USER_DETAIL_FIELDS}` template literal embeds the fragment definition in each operation document (required because Apollo requires fragment definitions to be present in the document that references them when sent standalone — verified by inspecting the existing `adminSetUserDeletedMutationDocument` pattern that we mirrored).
- **`id` selected FIRST** ✅:
  - The shared `AdminUserDetailFields` fragment selects `id` FIRST (verified at line 57 of `admin-users.documents.ts` — `fragment AdminUserDetailFields on AdminUserDetail { id ...`). The contract test "AdminUserDetailFields fragment selects id FIRST (Apollo cache normalization)" pins this by inspecting the FragmentDefinition AST node.
  - The `applicant` sub-object within the fragment ALSO selects `id` first (Apollo normalizes nested `Applicant` entities by their `id` too).
- **TypedDocumentNode typing correct** ✅:
  - Both new mutations use the codegen-generated types as the second type parameter pair (`TypedDocumentNode<AdminSetUserSuspendedMutation, AdminSetUserSuspendedMutationVariables>` / block analog). The contract test "documents remain TypedDocumentNode-typed against generated operation types" pins this via compile-time proof by assignment (tsgo fails if any exported constant loses its codegen typing or picks up an inline type literal).

### 4.1.IV Instruction Verification

- Read `.agents/instructions/frontend.instructions.md` (the layer-specific instruction file for `frontend/**/*.ts`).
- **§Apollo & GraphQL** ✅:
  - `gql` + `TypedDocumentNode` imported from `@apollo/client` (NOT `@apollo/client/core`) — verified at line 13 of `admin-users.documents.ts`.
  - `id` field on ALL object types in selection sets (Apollo cache normalization) — verified via the `AdminUserDetailFields` fragment selecting `id` FIRST, and the contract test pin.
  - Document naming convention `{entityName}MutationDocument` ↔ `TypedDocumentNode<{EntityName}Mutation, {EntityName}MutationVariables>` — verified for both new documents.
  - NO `useLazyQuery` — verified by grep on both new files (only comment-level mentions in the JSDoc header).
  - Hooks deferred to view task 4.3: the documents file imports ZERO hooks (no `useQuery`, `useMutation`, `useApolloClient`). The view task will import hooks from `@apollo/client/react` per the instruction.
- **§Code Quality** ✅ — sub-loop on both files green (tsgo / oxlint / biome:check / lint:type-aware / check:duplicates all PASS).
- **§Linting Rules** ✅ — ZERO `oxlint-disable` / `biome-ignore` comments introduced in either file.
- **Clean comments (no plan-artifact references)** ✅ — verified by grep:
  ```
  $ rg -n 'REQ-002|REQ-003|REQ-030|REQ-032|REQ-033|REQ-050|REQ-062|Task 4\.1|Phase 4|DEV3-017|tasks\.md|specs\.md|plan\.md|\.ai/plans' frontend/graphql/sharedDocuments/admin/admin-users.documents.ts frontend/graphql/sharedDocuments/admin/admin-users.documents.test.ts
  (no matches — exit 1)
  ```
- Read `frontend/graphql/AGENTS.md` + `frontend/graphql/sharedDocuments/AGENTS.md`:
  - Document Organization (by domain in `sharedDocuments/`) ✅ — new documents added to the EXISTING `admin-users.documents.ts` (no new file created).
  - Type Safety (TypedDocumentNode with codegen types) ✅ — both new documents comply.
  - Apollo Client Usage (import hooks from `@apollo/client/react`, include `id` for normalization, avoid `useLazyQuery`) ✅.
  - Import Pattern (always `@apollo/client`, never `@apollo/client/core`) ✅.
  - TypedDocumentNode Convention table (mutation ↔ `TypedDocumentNode<{EntityName}Mutation, {EntityName}MutationVariables>`) ✅.
  - Codegen (`bun run generate:gqlSchema && bun codegen`) ✅ — re-ran `bun codegen` after the document edits.
  - `id` Field Requirement ✅.
  - Frontend Client Queries and Hook Usage (NO `useLazyQuery`) ✅.
  - **Embedded type normalization policy** ✅ — the new documents return `AdminUserDetail` (which carries `id` and normalizes by default); NO new embedded value types introduced; NO `typePolicies` changes required.

## Carry-forward for task 4.3 (UI view)

- The two documents are READY for consumption via `useMutation` from `@apollo/client/react` in the GovernanceActionsSection component (task 4.3):
  ```ts
  import { useMutation } from "@apollo/client/react";
  import {
    adminSetUserSuspendedMutationDocument,
    adminSetUserBlockedMutationDocument,
  } from "@/frontend/graphql/sharedDocuments";
  ```
- Apollo will merge the mutation response into the SAME `AdminUserDetail:<id>` normalized cache entry (because the `AdminUserDetailFields` fragment selects `id` FIRST → the response's cache key matches the detail query's cache key). The detail page re-renders WITHOUT a refetch — pass `optimisticResponse` (optional) and let Apollo's `defaultMutationOptions` handle the cache write.
- Conflict code extraction (`extractErrorCode` / `extractErrorMessage` from `frontend/lib/graphql-error-utils.ts`) is ready for the in-dialog `Alert` rendering — the wire-tier matrix in task 3.3 verifies the conflict codes (`USER_ALREADY_SUSPENDED` / `USER_NOT_SUSPENDED` / `USER_ALREADY_BLOCKED` / `USER_NOT_BLOCKED` / `USER_ALREADY_DELETED` / `USER_SELF_SUSPENSION_FORBIDDEN` / `USER_SELF_BLOCK_FORBIDDEN` / `USER_NOT_FOUND`).
- In-flight disable: the `useMutation` tuple's `loading` flag is the canonical source for the confirm-dialog button disable state (REQ-044).

## Carry-forward for task 4.2 (i18n)

- The success toasts (`suspendSuccessToast`, `unsuspendSuccessToast`, `blockSuccessToast`, `unblockSuccessToast`) and dialog copy (`suspendDialogTitle`, `suspendDialogMessage`, `suspendPeriodLabel`, `suspendPeriodHelper`, `unsuspendDialogTitle`, `unsuspendDialogMessage`, `blockDialogTitle`, `blockDialogMessage`, `unblockDialogTitle`, `unblockDialogMessage`, `confirm`, `cancel`) will be sourced from the EXISTING `AdminUsers` namespace handle via `useAppTranslation("adminUsers")` in the view task 4.3.

## Hazards discovered

- **`apolloCache.test.ts:176-185` is RED on this sandbox** (PRE-EXISTING — NOT caused by task 4.1). The test asserts the FROZEN typePolicies surface is exactly `["AdminDashboardScheduleResult", "AdminNoteInfo", "HandshakeCodeLookup", "HealthCheck", "OnlineMeetingInfo"]` (5 entries), but `frontend/providers/apollo/apolloCache.ts` actually registers at least 6 (including `NotificationListPage`, mentioned in `frontend/graphql/AGENTS.md` "Embedded type normalization policy"). The test was apparently last reconciled at commit `7449297` (admin-users CRUD); subsequent commits (`b3b9aac` notifications, `af6d29d` analytics) extended `apolloCache.ts` with `NotificationListPage` + eleven `PlatformAnalytics*` types without updating the test's expected surface. **This is a baseline-test reconciliation debt OUTSIDE my task scope** — task 4.1 explicitly forbids touching `apolloCache.test.ts` (per `tasks.md:281`). The pre-existing RED state is unchanged by my work:
  ```
  $ git diff --stat frontend/providers/apollo/
  (empty — UNTOUCHED)
  ```
  The task spec language ("verify `frontend/providers/apollo/apolloCache.test.ts:176-185` stays untouched/green") is interpreted as: my changes must NOT introduce new failures; the pre-existing RED state is a baseline hazard to be reconciled by whoever owns the apolloCache baseline (likely a future task tracking the reconciliation debt). The contract test for the new documents does NOT depend on apolloCache.test.ts at all — the documents contract test is a PURE AST-shape pin that does not touch the Apollo cache implementation.
- **No other hazards** — clean execution; the codegen pipeline regenerated the four new types on first run; the contract test was created fresh (no sibling test existed to extend); the sub-loop quality gate passed on both files on the first attempt (after a minor `lint:type-aware` fix to extract a `SelectionSetNode` type alias for the 3-member union — sonarjs `use-type-alias` rule fires on 3+ member unions but not on 2-member unions, which is why the sibling `notification.documents.test.ts` (using 2-member unions) passes without the alias).

## Pre-existing sandbox state

The working tree carries the cumulative DEV3-017 changeset from prior phases (1.x, 2.x, 3.x). The new mutation documents + new contract test + regenerated `graphql.ts` are the ONLY changes attributable to task 4.1. `git diff --name-only` filtered for 4.1-owned files:
- `frontend/graphql/sharedDocuments/admin/admin-users.documents.ts` (MODIFIED — extended with 2 new documents + 4 imports)
- `frontend/graphql/sharedDocuments/admin/admin-users.documents.test.ts` (NEW — 475 lines, 19 tests)
- `frontend/graphql/generated/gql/graphql.ts` (regenerated — gitignored, not committed)
