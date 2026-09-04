# Phase 1.4 — Localized Error Keys Outcome

**Task ID:** 1.4
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-03
**Branch:** `feat/dev3-017-account-soft-delete-governance`
**Agent:** Phase 1.4 Localized Error Keys Subagent
**Requirements:** REQ-002, REQ-051

---

## What was implemented

Added 7 new localized error keys to the EXISTING `adminUsers` flat-group inside the `errors` translation namespace (`ErrorsLabels.adminUsers`). The type declaration was updated FIRST so the compile-time parity guarantee (`errorsEn: ErrorsLabels` + `errorsAr: ErrorsLabels`) forces both locales to provide the new keys at typed-leaf granularity — `bun tsgo` exit 0 is the proof. Both English and Arabic implementations were authored in the same changeset; Arabic slots carry Arabic script (not transliterated). NO new namespace was created; NO new top-level `ErrorsLabels` group was introduced; the existing flat `accountDeleted`/`accountBlocked`/`accountSuspended` keys are REUSED for actor-governance denials (per REQ-051 + REQ-018 wire-shape constancy — those carry no new keys here).

## Files modified

| File | Operation |
|---|---|
| `shared/locale/types/errors/index.ts` | EDITED — added 7 `readonly …: string;` slots to the existing `adminUsers` flat-group inside the `ErrorsLabels` interface (after the existing `handshakeExhausted` slot, lines 87-105). Each new slot carries a production-grade JSDoc `/** … */` comment matching the existing per-key documentation style. |
| `shared/locale/en/errors/index.ts` | EDITED — added 7 English string implementations inside the existing `adminUsers` object (lines 45-51, after the existing `handshakeExhausted` entry). |
| `shared/locale/ar/errors/index.ts` | EDITED — added 7 Arabic string implementations inside the existing `adminUsers` object (lines 45-51, after the existing `handshakeExhausted` entry). All strings in Arabic script. |

## The 7 keys + machine-code bijection (REQ-051 contract)

| Machine Code | i18n Key | Locale-Leaf Purpose |
|---|---|---|
| `USER_ALREADY_SUSPENDED` | `userAlreadySuspended` | Conflict — target user is already actively suspended. |
| `USER_ALREADY_BLOCKED` | `userAlreadyBlocked` | Conflict — target user is already blocked. |
| `USER_NOT_SUSPENDED` | `userNotSuspended` | Conflict — release-suspension on a user that is not currently suspended. |
| `USER_NOT_BLOCKED` | `userNotBlocked` | Conflict — release-block on a user that is not currently blocked. |
| `USER_SELF_SUSPENSION_FORBIDDEN` | `userSelfSuspensionForbidden` | Self-protection deny — admin attempted to suspend their own account. |
| `USER_SELF_BLOCK_FORBIDDEN` | `userSelfBlockForbidden` | Self-protection deny — admin attempted to block their own account. |
| `SUSPENSION_PERIOD_INVALID` | `suspensionPeriodInvalid` | `ValidationError` — `periodDays` failed the whole-number-in-[1, 3650] validation matrix (named `periodDays` in `fields[]`). |

The bijection holds at the type level (the type declaration enumerates exactly these 7 keys), at the en locale (English strings provide the human copy), and at the ar locale (Arabic strings provide the localized copy). The `ErrorMessageKey` mapped type at lines 121-123 of the types file excludes the new `adminUsers.*` keys from the leaf-string union (because the `adminUsers` slot is an object, not a string) — this is the EXISTING behavior for grouped sub-blocks (same as `planCatalog`); the consumer pattern is `tErrors.adminUsers.<key>` (property access on the sub-block, not the top-level `ErrorMessageKey` union).

## Verbatim diff

```diff
--- a/shared/locale/types/errors/index.ts
+++ b/shared/locale/types/errors/index.ts
@@ -84,6 +84,25 @@ export interface ErrorsLabels {
      * MUST NOT appear in the message — only generic copy.
      */
     readonly handshakeExhausted: string;
+    /** Conflict when suspending an account that is already actively suspended. */
+    readonly userAlreadySuspended: string;
+    /** Conflict when blocking an account that is already blocked. */
+    readonly userAlreadyBlocked: string;
+    /** Conflict when releasing a suspension on an account that is not suspended. */
+    readonly userNotSuspended: string;
+    /** Conflict when releasing a block on an account that is not blocked. */
+    readonly userNotBlocked: string;
+    /** Self-protection deny: an admin attempted to suspend their own account. */
+    readonly userSelfSuspensionForbidden: string;
+    /** Self-protection deny: an admin attempted to block their own account. */
+    readonly userSelfBlockForbidden: string;
+    /**
+     * Validation deny: the supplied suspension `periodDays` was not a whole
+     * number within the permitted 1–3650-day window. Surfaced as
+     * `ValidationError("SUSPENSION_PERIOD_INVALID", …)` with `fields[]`
+     * naming `periodDays`.
+     */
+    readonly suspensionPeriodInvalid: string;
   };
   /** Fail-closed deny when a stored notifications.type value is not a known NotificationType member. */
   readonly notificationTypeCorrupt: string;

--- a/shared/locale/en/errors/index.ts
+++ b/shared/locale/en/errors/index.ts
@@ -42,6 +42,13 @@ export const errorsEn: ErrorsLabels = {
     adminRoleCreationForbidden: "Admin accounts cannot be created from this surface.",
     userPatchEmpty: "No updatable fields were supplied.",
     handshakeExhausted: "Could not generate a unique handshake code. Please try again.",
+    userAlreadySuspended: "This user is already suspended.",
+    userAlreadyBlocked: "This user is already blocked.",
+    userNotSuspended: "This user is not suspended.",
+    userNotBlocked: "This user is not blocked.",
+    userSelfSuspensionForbidden: "You cannot suspend your own account.",
+    userSelfBlockForbidden: "You cannot block your own account.",
+    suspensionPeriodInvalid: "Suspension period must be a whole number between 1 and 3650 days.",
   },
   notificationTypeCorrupt: "This notification could not be read. Please contact support.",

--- a/shared/locale/ar/errors/index.ts
+++ b/shared/locale/ar/errors/index.ts
@@ -42,6 +42,13 @@ export const errorsAr: ErrorsLabels = {
     adminRoleCreationForbidden: "لا يمكن إنشاء حسابات المسؤولين من هذه الصفحة.",
     userPatchEmpty: "لم يتم تقديم أي حقول قابلة للتحديث.",
     handshakeExhausted: "تعذّر توليد رمز التحقق الفريد. يرجى المحاولة مرة أخرى.",
+    userAlreadySuspended: "هذا المستخدم موقوف بالفعل.",
+    userAlreadyBlocked: "هذا المستخدم محظور بالفعل.",
+    userNotSuspended: "هذا المستخدم ليس موقوفاً.",
+    userNotBlocked: "هذا المستخدم ليس محظوراً.",
+    userSelfSuspensionForbidden: "لا يمكنك إيقاف حسابك الخاص.",
+    userSelfBlockForbidden: "لا يمكنك حظر حسابك الخاص.",
+    suspensionPeriodInvalid: "يجب أن تكون مدة الإيقاف رقماً صحيحاً بين 1 و3650 يوماً.",
   },
   notificationTypeCorrupt: "تعذر قراءة هذا الإشعار. يرجى التواصل مع فريق الدعم.",
```

## Files NOT modified (and why)

- No consumer files touched — the 7 new keys are DECLARED ONLY at this phase. Grep across `/home/z/my-project` for the 7 key names returns ONLY the three plan files (`tasks.md`, `specs.md`, `plan.md`) and the three locale files I just edited — ZERO service / repo / component / test files reference them yet. This is the "no hardcoded usage yet" semantic-review requirement, evidenced. The consumers (task 2.2 `admin-governance-guard.helpers.ts`, task 2.4 `user-management.service.ts`, task 4.3 `GovernanceActionsSection.tsx`) are forward-owned and will reference the keys via `tErrors.adminUsers.<key>` property access (REQ-002 client/server translation discipline).
- No plan files (`tasks.md` / `specs.md` / `plan.md` / `deferred-items.md`) touched — orchestrator owns checkbox updates.
- No new locale parity test created — the existing `shared/locale/errors-namespace.parity.test.ts` already covers the en/ar leaf parity via `assertEveryLeafNonEmpty` (recursive walk through the `adminUsers` sub-block) + top-level key-set equality; out-of-scope to add a new test for this task (per task description: "If no parity test exists, record this in the outcome but DO NOT create one").
- No new namespace registration performed — `shared/AGENTS.md` §"Namespace Registration (Required for each new namespace)" lists 5 steps for NEW namespaces; this task extends the EXISTING `errors` namespace (no new namespace, no new path mapping, no `MessageSchema` change, no `LocaleProvider` change). The `errors` namespace's `defineNamespace("errors", …)` registration in `shared/locale/namespaces/errors/errors.namespace.ts` is untouched.

---

## Verification evidence

### 1.4.QL Quality Loop

#### Sub-loop on types file (`shared/locale/types/errors/index.ts`)
- Command: `bun run scripts/health/sub-loop.ts shared/locale/types/errors/index.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed: tsgo (project-wide, filtered), oxlint, biome:check, lint:type-aware, check:duplicates.
- Output tail (verbatim):
  ```
  ℹ  Running tsgo (project-wide, filtering for shared/locale/types/errors/index.ts)...
  ✅ tsgo passed (no errors for shared/locale/types/errors/index.ts)
  ℹ  Running oxlint on shared/locale/types/errors/index.ts...
  ✅ oxlint passed
  ℹ  Running biome:check on shared/locale/types/errors/index.ts...
  ✅ biome:check passed
  ℹ  Submitting lint:type-aware via in-process service for shared/locale/types/errors/index.ts...
  ✅ lint:type-aware passed
  ℹ  Running check:duplicates (jscpd, intra-file only) on shared/locale/types/errors/index.ts...
  ✅ check:duplicates passed

  ✅ All checks for lifecycle "duplicates" passed for shared/locale/types/errors/index.ts
  EXIT_TYPES=0
  ```

#### Sub-loop on English locale (`shared/locale/en/errors/index.ts`)
- Command: `bun run scripts/health/sub-loop.ts shared/locale/en/errors/index.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed.
- Output tail (verbatim):
  ```
  ℹ  Running tsgo (project-wide, filtering for shared/locale/en/errors/index.ts)...
  ✅ tsgo passed (no errors for shared/locale/en/errors/index.ts)
  ℹ  Running oxlint on shared/locale/en/errors/index.ts...
  ✅ oxlint passed
  ℹ  Running biome:check on shared/locale/en/errors/index.ts...
  ✅ biome:check passed
  ℹ  Submitting lint:type-aware via in-process service for shared/locale/en/errors/index.ts...
  ✅ lint:type-aware passed
  ℹ  Running check:duplicates (jscpd, intra-file only) on shared/locale/en/errors/index.ts...
  ✅ check:duplicates passed

  ✅ All checks for lifecycle "duplicates" passed for shared/locale/en/errors/index.ts
  EXIT_EN=0
  ```

#### Sub-loop on Arabic locale (`shared/locale/ar/errors/index.ts`)
- Command: `bun run scripts/health/sub-loop.ts shared/locale/ar/errors/index.ts --lifecycle duplicates`
- Exit code: **0** ✅
- All five sub-loop gates passed.
- Output tail (verbatim):
  ```
  ℹ  Running tsgo (project-wide, filtering for shared/locale/ar/errors/index.ts)...
  ✅ tsgo passed (no errors for shared/locale/ar/errors/index.ts)
  ℹ  Running oxlint on shared/locale/ar/errors/index.ts...
  ✅ oxlint passed
  ℹ  Running biome:check on shared/locale/ar/errors/index.ts...
  ✅ biome:check passed
  ℹ  Submitting lint:type-aware via in-process service for shared/locale/ar/errors/index.ts...
  ✅ lint:type-aware passed
  ℹ  Running check:duplicates (jscpd, intra-file only) on shared/locale/ar/errors/index.ts...
  ✅ check:duplicates passed

  ✅ All checks for lifecycle "duplicates" passed for shared/locale/ar/errors/index.ts
  EXIT_AR=0
  ```

#### Project-wide tsgo (typed-leaf parity gate)
- Command: `bun tsgo`
- Exit code: **0** ✅
- The `ErrorsLabels` interface now declares the 7 new keys on the `adminUsers` sub-block. Both `errorsEn: ErrorsLabels` and `errorsAr: ErrorsLabels` consts are typed-leaf — TypeScript would have errored (e.g. `Object literal may only specify known properties`) if either locale omitted even one of the 7 new keys. Exit 0 PROVES typed-leaf parity: both locales have all 7 new keys present and correctly typed.
- Output tail (verbatim):
  ```
  $ bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit
  [process-lock] Enqueued request for "tsgo" (PID: 7250)
  [process-lock] Acquired lock for "tsgo" (PID: 7250). Executing...
  [process-lock] Released lock for "tsgo" (PID: 7250)
  EXIT_TSGO=0
  ```

### 1.4.TE Test Engineering — translation parity

#### `shared/locale/errors-namespace.parity.test.ts` (primary parity suite)
- Command: `bun run test/scripts/run-test.ts shared/locale/errors-namespace.parity.test.ts`
- Exit code: **0** ✅
- Result: **8 pass / 0 fail / 94 expect() calls / 8 tests across 1 file (68ms)**.
- Notable rows that lock the new keys:
  - `compile-time parity mirror — ar/en key sets agree > identical sorted key sets across BOTH locale sources` ✅ — `Object.keys(errorsAr)` and `Object.keys(errorsEn)` produce identical sorted arrays. The `adminUsers` top-level group key exists in both.
  - `compile-time parity mirror — ar/en key sets agree > every leaf value on BOTH maps is a non-empty localized string (zero dead keys)` ✅ — `assertEveryLeafNonEmpty` recursively walks both `errorsAr` and `errorsEn` including the nested `adminUsers` sub-block. All 7 new keys (in each locale) MUST have non-empty string values for this assertion to pass. Confirmed pass → all 14 new locale-leaf strings (7 en + 7 ar) are non-empty localized strings.
- Output tail (verbatim):
  ```
  shared/locale/errors-namespace.parity.test.ts:
  (pass) compile-time parity mirror — ar/en key sets agree > identical sorted key sets across BOTH locale sources [0.46ms]
  (pass) compile-time parity mirror — ar/en key sets agree > every leaf value on BOTH maps is a non-empty localized string (zero dead keys) [0.37ms]
  (pass) route emitters — every transport key exists in BOTH locales > discovery actually found the known pipeline emitters (suite cannot rot green) [0.04ms]
  (pass) route emitters — every transport key exists in BOTH locales > emitted key `badRequest` resolves in BOTH ar and en maps [0.11ms]
  (pass) route emitters — every transport key exists in BOTH locales > emitted key `internalServerError` resolves in BOTH ar and en maps
  (pass) route emitters — every transport key exists in BOTH locales > emitted key `rateLimitExceeded` resolves in BOTH ar and en maps
  (pass) machine-constant exemption — `_health` payload constants stay OUT of locale files > ZERO health-flavored keys exist in either locale's errors map [0.06ms]
  (pass) touched-surface import hygiene (route.ts) > gateway route references ONLY the compile-time system — zero next-intl/getBackendTranslations/shared/messages [0.09ms]

   8 pass
   0 fail
   94 expect() calls
  Ran 8 tests across 1 file. [68.00ms]
  EXIT_PARITY=0
  ```
- Log saved at: `logs/2026-09-03T20-54-48/shared/locale/errors-namespace.parity.test.ts.log` (per `[run-test] Log saved to:` line).

#### Other locale parity tests (not relevant)
- `applicant-namespace.parity.test.ts`, `handshakeCode-namespace.parity.test.ts`, `notifications-namespace.parity.test.ts`, `plans-namespace.parity.test.ts`, `sessions-namespace.parity.test.ts`, `wallet-namespace.parity.test.ts` — these test OTHER namespaces; the `errors` namespace (which contains the `adminUsers` flat-group I extended) is exercised ONLY by `errors-namespace.parity.test.ts`. The other 6 parity tests are not affected by this task and were not re-run.
- `adminUsers-namespace.parity.test.ts` — does NOT exist (the view-layer `adminUsers` namespace has no parity test today). The `errors.adminUsers` flat-group I extended is NOT the same as the view-layer `adminUsers` translation namespace (`shared/locale/types/adminUsers/` + `shared/locale/en/adminUsers/` + `shared/locale/ar/adminUsers/`); they share the "adminUsers" name but live in different namespaces (`errorsTranslations.adminUsers.<key>` vs. `adminUsers.<key>`). The view-layer `adminUsers` namespace is untouched by this task.

### 1.4.SEC Security & Tenancy Audit

- **N/A (copy only)** per `tasks.md:119` — this task adds localized error copy; no security boundary, no tenancy scope, no auth check, no DB mutation introduced. The 7 new strings are pure-data (string literals); they carry no admin-authored identifiers (no email, no user id, no role values) per the `adminUsers` group's existing JSDoc discipline ("Admin-authored identifiers (email, user id, role values) MUST NOT appear in these strings — only generic, user-facing copy"). All 7 new strings verified to contain ONLY generic copy (e.g. "This user is already suspended." / "هذا المستخدم موقوف بالفعل." — no identifiers).
- The Arabic `suspensionPeriodInvalid` copy is parameter-free (no ICU `{var}` placeholder) — the suspension-window validation emits a STATIC message (no runtime value interpolation), matching the existing `userPatchEmpty` / `handshakeExhausted` style in the same group. (The validation `fields[]` carries `periodDays` in the GraphQL `extensions`, not in the user-facing message.)

### 1.4.SR Semantic Review

- **Flat-group discipline** ✅: the 7 new keys were added to the EXISTING `adminUsers` flat-group inside `ErrorsLabels` (the type declaration's `readonly adminUsers: { … }` block). They sit alongside the existing 7 keys (`userNotFound`, `userAlreadyDeleted`, `userNotDeleted`, `userSelfDeactivationForbidden`, `adminRoleCreationForbidden`, `userPatchEmpty`, `handshakeExhausted`) — appended in the same group, NOT in a new nested sub-block. The `adminUsers` group's total cardinality is now 14 (was 7).
- **No nested restructure** ✅: the `adminUsers` group remains a single-level flat object of `string` leaves (matching `planCatalog`'s shape). No new sub-group, no `ErrorsLabels` top-level addition, no namespace split. Verified by inspecting the diff: every new line inside the `adminUsers` block is `readonly <key>: string;` (types file) or `<key>: "<value>",` (locale files) — no `{ … }` block delimiters introduced.
- **No hardcoded usage yet** ✅: verified by grep across `/home/z/my-project` for the 7 key names (`userAlreadySuspended|userAlreadyBlocked|userNotSuspended|userNotBlocked|userSelfSuspensionForbidden|userSelfBlockForbidden|suspensionPeriodInvalid`) — the 7 keys appear in ONLY:
  1. The three plan files (`tasks.md`, `specs.md`, `plan.md`) — plan-trio references (allowed).
  2. The three locale files I just edited (`shared/locale/{types,en,ar}/errors/index.ts`) — declarations (this task).
  
  ZERO service / repo / component / test files reference them. The consumers are forward-owned by:
  - Task 2.2 `backend/services/admin/admin-governance-guard.helpers.ts` — for `userSelfSuspensionForbidden`, `userSelfBlockForbidden` (self-protection denials).
  - Task 2.4 `backend/services/admin/user-management.service.ts` `setUserSuspended` / `setUserBlocked` — for all 7 codes (4 directional conflicts + 2 self-protection conflicts + 1 validation reject).
  - Task 4.3 `frontend/views/admin/users/components/GovernanceActionsSection.tsx` — for inline conflict alert copy (`tErrors.adminUsers.*` property access per REQ-002 client discipline).
- **Both locales have identical 7 new keys** ✅: en file lines 45-51 add exactly `userAlreadySuspended`, `userAlreadyBlocked`, `userNotSuspended`, `userNotBlocked`, `userSelfSuspensionForbidden`, `userSelfBlockForbidden`, `suspensionPeriodInvalid`. ar file lines 45-51 add the same 7 keys in the same order. No orphan in either locale. The `assertEveryLeafNonEmpty` parity test recursively walks both maps and would fail if any of the 14 new strings (7 en + 7 ar) were missing or empty — passed clean.
- **Ordering convention** ✅: the 7 new keys were appended in the bijection order (the order they appear in `tasks.md:114` and `specs.md:101`), preserving the existing group's topical ordering convention (existing keys are NOT alphabetical; they're ordered by domain concept: lookup-miss → already/not-deleted conflicts → self-deactivation deny → admin-role deny → patch-empty validation → handshake-exhausted deny → NEW governance conflicts → NEW self-protection denies → NEW governance validation). The bijection order makes the mapping to machine codes (`USER_ALREADY_SUSPENDED` ↔ `userAlreadySuspended`, etc.) visually traceable in the source.

### 1.4.IV Instruction Verification

- Read `shared/AGENTS.md` (287 lines, the shared-layer rules) and `.agents/instructions/backend.instructions.md` (i18n section lines 82-87).
- **EXISTING-namespace extension** ✅: per `shared/AGENTS.md` §"Namespace Registration (Required for each new namespace)" — that section applies ONLY when a NEW namespace is created. The `errors` namespace already exists (registered in `shared/locale/namespaces/errors/errors.namespace.ts`); the `adminUsers` flat-group already exists inside `ErrorsLabels` (added by DEV3-016 per the baseline). This task EXTENDS the existing group with 7 new keys — no new namespace, no path mapping, no `MessageSchema` change, no `LocaleProvider` change.
- **Both locales updated in the same changeset** ✅: the type declaration + en + ar were all edited in this single task. tsgo's exit-0 proves both locale consts satisfy the type declaration (which now requires the 7 new keys).
- **Type declaration updated FIRST** ✅: the types file edit was performed before the locale edits (sequentially). This is the canonical i18n discipline: type-first → both locales typed-leaf against the type → tsgo enforces both locales have all keys. If the locale edits had been performed first, the typed-leaf check would have errored on the missing type slots (until the type file was updated); the type-first ordering ensures the typed-leaf parity is the gate from the first locale edit onward.
- **No hardcoded English text in components** ✅: verified by the "no hardcoded usage yet" grep above — ZERO consumer files reference the 7 new keys. The consumer pattern (per `shared/AGENTS.md` §"GraphQL Resolvers" + §"API Routes / Scripts / Tests") is `tErrors.adminUsers.<key>` (property access on the `errorsTranslations.adminUsers` sub-block returned by `getServerTranslations(locale, "errors")` from `@/shared/locale/server-graphql`), per REQ-002. NO `t('userAlreadySuspended')` string-literal access; NO hardcoded English string in any resolver / service / component.
- **Backend instructions §i18n / Localized Errors** ✅: the rule "All error messages via `getServerTranslations(locale, "<namespace>")` from `@/shared/locale/server-graphql`" + "Never hardcode error strings, messages, or warnings - in any layer" — this task ADDS the localized error strings so future consumers CAN use them via the canonical pattern; nothing in this task introduces a hardcoded string.
- **`shared/locale/AGENTS.md` leaf-module rules** ✅: the en/ar files remain "plain string/object literals" with "no logic" — the 7 new entries are pure string literals, no interpolation functions, no ICU placeholders (the `suspensionPeriodInvalid` message is parameter-free because the validation emits a static message; the `periodDays` field name is carried in `extensions.fields[]`, not in the user-facing message). Path alias discipline: both locale files import the `ErrorsLabels` type via `@/shared/locale/types/errors` (line 1 of each file) — no relative `../../types/` traversals, matching `shared/locale/AGENTS.md` §"Path alias discipline".

---

## Carry-forward knowledge for future subtasks

- **The 7 new keys are AVAILABLE for consumer consumption** starting now (Phase 1.4 done). The forward-owned consumers:
  - **Task 2.2** (`backend/services/admin/admin-governance-guard.helpers.ts`) — should reference `tErrors.adminUsers.userSelfSuspensionForbidden` and `tErrors.adminUsers.userSelfBlockForbidden` for the self-protection deny arms. The guard helper resolves the localized message via `getServerTranslations(locale, "errors")` then accesses `.adminUsers.<key>` per the canonical pattern.
  - **Task 2.4** (`backend/services/admin/user-management.service.ts`) — should reference all 7 keys: the 4 directional conflicts (`userAlreadySuspended`, `userAlreadyBlocked`, `userNotSuspended`, `userNotBlocked`), the 2 self-protection denies (`userSelfSuspensionForbidden`, `userSelfBlockForbidden`), and the 1 validation reject (`suspensionPeriodInvalid` — emitted via `ValidationError("SUSPENSION_PERIOD_INVALID", …)` with `fields[] = ["periodDays"]`). The service accepts `locale?: string` (per backend.instructions.md §i18n) and resolves via `getServerTranslations(locale, "errors")`.
  - **Task 4.3** (`frontend/views/admin/users/components/GovernanceActionsSection.tsx`) — should reference the keys via the client-side `useAppTranslation("errors")` hook (per REQ-002 client discipline) for inline conflict alert copy when the GraphQL `extensions.code` matches one of the 7 machine codes. The map is `USER_ALREADY_SUSPENDED` → `tErrors.adminUsers.userAlreadySuspended`, etc.
- **Actor-governance denials REUSE the existing flat keys** (NOT new ones) per REQ-051 + REQ-018 wire-shape constancy:
  - `USER_DELETED` (actor is a deleted user) → `errorsTranslations.accountDeleted` (existing key, line 37 of types file / line 17 of en / line 17 of ar).
  - `USER_BLOCKED` (actor is a blocked user) → `errorsTranslations.accountBlocked` (existing key, line 39 / line 18 / line 18).
  - `USER_SUSPENDED` (actor is an actively-suspended user) → `errorsTranslations.accountSuspended` (existing key, line 41 / line 19 / line 19).
  - The 7 NEW keys are for the TARGET-side state conflicts + self-protection denies + periodDays validation — they are NOT for actor-side governance denials. This distinction is locked by REQ-051's exact key set + REQ-018's wire-shape constancy (the actor-denial envelope shape is the same as DEV3-016's existing accountDeleted/accountBlocked/accountSuspended).
- **Arabic copy is concise and touch-target-safe** — all 7 new Arabic strings are < 80 characters; the longest is `suspensionPeriodInvalid` (Arabic: 51 chars). They fit comfortably in a 44px-height UI element without truncation; the existing Arabic copy style in the file is preserved (e.g. the existing `userSelfDeactivationForbidden: "لا يمكنك حذف حسابك الخاص."` is the template the new `userSelfSuspensionForbidden` and `userSelfBlockForbidden` mirror verbatim — `لا يمكنك إيقاف حسابك الخاص.` / `لا يمكنك حظر حسابك الخاص.`).
- **The `ErrorMessageKey` mapped type (types file lines 121-123) does NOT include the new keys** — that union (`{[K in keyof ErrorsLabels]: ErrorsLabels[K] extends string ? K : never}[keyof ErrorsLabels]`) excludes any `ErrorsLabels` slot whose value is NOT a string (e.g. `planCatalog: PlanCatalogErrorsLabels`, `adminUsers: { … }`). This is the EXISTING behavior for grouped sub-blocks; the consumer pattern is `tErrors.adminUsers.<key>` (property access on the sub-block, not the top-level `ErrorMessageKey` union). No change to that pattern is needed.
- **`bun tsgo` is the typed-leaf parity guarantee** — the 1.4.QL gate's `bun tsgo` exit 0 IS the parity test. The runtime `errors-namespace.parity.test.ts` is the BELT-AND-SUSPENDERS gate (in case someone loosens the typed-leaf discipline later). Both gates green → both locales have all 7 new keys.

---

## Hazards discovered

- (none) — clean execution. No plan-artifact references introduced in source files (verified by grep — the 7 new keys appear in source only in their canonical locale positions, not in any JSDoc/comment referencing `tasks.md`/`specs.md`/`plan.md`/`REQ-002`/`REQ-051`/`Task 1.4`/`Phase 1.4`/`DEV3-017`). The JSDoc comments on the 7 new type slots use production-grade language only ("Conflict when suspending…", "Self-protection deny…", "Validation deny…") — no plan-trio references.
- No cross-file dependencies surfaced — the 7 new keys are pure additions; they do not affect any existing consumer (no consumer references them yet; existing consumers of `errorsEn` / `errorsAr` only touch keys they already own).

## Ledger updates

- (none) — D1-D7 stay as `📅 Forward` (per `0-baseline-outcome.md` §"Deferred-Items Ledger Initialization"). This task did not resolve, advance, or block any deferred item.

---

## Verification Summary

| Verification | Expected | Actual | Status |
|---|---|---|---|
| Read all 6 pre-existing outcome files | 6 files read | 0-baseline, 0-2-reuse, plan-review-R1, 1-1, 1-2, 1-3 all read | ✅ |
| Re-read tasks.md:111-121 + specs.md REQ-002/REQ-051 + backend.instructions.md + shared/AGENTS.md | grep-then-read (cited line numbers may drift per plan-review-R1 F5/F6) | tasks.md:111-121 verbatim; specs.md REQ-002 at L55-58 + REQ-051 at L101; backend.instructions.md §i18n at L82-87; shared/AGENTS.md full file (287 lines) | ✅ |
| Grep `adminUsers` in types file (cited L36-44 was OFF — actual L67-87 per plan-review-R1 F5/F6) | found existing flat-group shape at L67-87 (NOT L36-44) | `adminUsers` group found at L67-87 (interface block); L36-44 in the citation refers to a different anchor (the `accountDeleted`/`accountBlocked`/`accountSuspended` flat keys at L36-44 of the types file — also referenced in the task description). Both groups coexist in the same `ErrorsLabels` interface. | ✅ |
| Add 7 type slots to `adminUsers` group | appended after `handshakeExhausted` (was L86) | added at L87-105 of types file (19 new lines: 7 JSDoc + 7 type slots + spacing) | ✅ |
| Add 7 English strings to `adminUsers` group | appended after `handshakeExhausted` (was L44 of en file) | added at L45-51 of en file (7 new lines) | ✅ |
| Add 7 Arabic strings to `adminUsers` group | appended after `handshakeExhausted` (was L44 of ar file) | added at L45-51 of ar file (7 new lines, all Arabic script) | ✅ |
| 1.4.QL sub-loop types | exit 0 (5/5 gates) | exit 0 (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates) | ✅ |
| 1.4.QL sub-loop en | exit 0 (5/5 gates) | exit 0 (all five gates) | ✅ |
| 1.4.QL sub-loop ar | exit 0 (5/5 gates) | exit 0 (all five gates) | ✅ |
| 1.4.QL `bun tsgo` project-wide | exit 0 (typed-leaf parity intact) | exit 0 | ✅ |
| 1.4.TE errors-namespace parity test | exit 0; ar/en leaf parity + zero dead keys | 8 pass / 0 fail / 94 expect() calls / 8 tests (68ms); both `ar/en key sets agree` AND `every leaf non-empty` rows green | ✅ |
| 1.4.SEC | N/A (copy only) | N/A — verified the 7 strings carry no admin-authored identifiers; purely generic copy | ✅ N/A |
| 1.4.SR flat-group discipline | added to existing flat group, no nested restructure | verified by diff inspection — 7 single-line additions inside the `adminUsers` block; no `{ … }` block delimiters introduced | ✅ |
| 1.4.SR no hardcoded usage yet | grep returns 0 matches in source consumers | 6 file matches: 3 plan files (allowed) + 3 locale files (declarations); ZERO consumer files | ✅ |
| 1.4.SR both locales identical 7 new keys | en and ar have same 7 new keys, no orphans | en L45-51 == ar L45-51 (same key names, same order); `assertEveryLeafNonEmpty` parity test green | ✅ |
| 1.4.IV EXISTING-namespace extension | no new namespace registration | `errors` namespace's `defineNamespace` registration untouched; `MessageSchema` unchanged; `LocaleProvider` unchanged | ✅ |
| 1.4.IV both locales updated in same changeset | en + ar both edited in this task | both edited; tsgo proves both satisfy type declaration | ✅ |
| 1.4.IV type declaration updated FIRST | types file edited before locale files | types edited first (step 2); en edited second (step 3); ar edited third (step 4) | ✅ |
| 1.4.IV no hardcoded English in components | grep returns 0 matches in `frontend/`/`backend/`/`app/` | 0 matches in consumer layers (only plan files + locale declarations) | ✅ |
| Outcome file written | `1-4-outcome.md` exists, well-formed | this file | ✅ |
| Source code untouched outside scope | only 3 locale files modified | verified by `git diff --name-only` — only `shared/locale/{types,en,ar}/errors/index.ts` modified by this task (other diffs in the working tree are from prior tasks 1.1 / 1.2 / 1.3 + the baseline's deferred-items.md) | ✅ |

---

## Files Touched by This Task

| File | Operation |
|---|---|
| `shared/locale/types/errors/index.ts` | EDITED — added 7 `readonly <key>: string;` slots to the `adminUsers` flat-group inside `ErrorsLabels` (lines 87-105). Each new slot carries a production-grade JSDoc `/** … */` comment matching the existing per-key documentation style. Type declaration updated FIRST. |
| `shared/locale/en/errors/index.ts` | EDITED — added 7 English string literals to the `adminUsers` object (lines 45-51). |
| `shared/locale/ar/errors/index.ts` | EDITED — added 7 Arabic string literals to the `adminUsers` object (lines 45-51). All strings in Arabic script (not transliterated). |
| `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/1-4-outcome.md` | CREATED — this file |

No source files outside `shared/locale/{types,en,ar}/errors/index.ts` were touched by this task. No plan files (`tasks.md` / `specs.md` / `plan.md` / `deferred-items.md`) were modified. The `tasks.md` checkbox `[ ] 1.4` remains unticked — the orchestrator owns the toggle to `[x]` upon accepting this outcome.
