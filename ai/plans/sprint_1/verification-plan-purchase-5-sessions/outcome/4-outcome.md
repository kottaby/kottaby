# Task 4 — Journey test FIRST (red)

- **Date:** 2026-09-14
- **Branch:** `feat/verification-plan-purchase-5-sessions`
- **Requirements:** REQ-8.5, REQ-9.2, REQ-4, REQ-5 · **Design:** plan.md §5.5 · **Spec:** specs.md §6 (J1 steps 1-8)

## Summary of what was implemented

1. **CREATE `test/workflows/teachers/verification-plan-purchase.journey.test.ts`** (699 lines) — the TDD-authoring of the cross-actor journey per specs §6 J1 steps 1-8. Sequential, actor-attributed steps through the REAL service layer on the REAL test database:
   - **Step 1 (System):** fixture sanity + catalog resolution pins — the purchase target is resolved EXACTLY the way Task 5's service will resolve it (`PlanRepository.listActive()` → `find(title === VERIFICATION_PLAN_TITLE)`), so every money/window/lane assertion is grounded in the row the service will charge; applicant A `pending`/attempts 0, B `failed` + future cooldown, C `failed` + expired cooldown; the lane-credit surface probe pins ABSENCE (applicants own NO `students` row — the credit-skip baseline is absence, not a zeroed balance).
   - **Step 2 (Applicant A):** `VerificationPurchaseService.purchase(A.userId, KEY_PURCHASE_A, "en")` → pending pair (`subscriptions` + `student_payments` with **`studentId === null`** — the REQ-3.2 owner-shape assertion), verbatim-keyed claim backfilled with `subscriptionId`, ZERO student-junction rows, `applicants.status` flips `pending → in_evaluation` with `verification_attempts` untouched (first purchase ≠ re-application), no inbox row, no publish.
   - **Step 3 (System):** direct `SubscriptionActivationService.processWebhookEvent({reference, outcome: "confirmed", amount, currency}, "en")` → payment `paid`, subscription `active`, `paymentVerifiedAt` stamped, `endDate − startDate === planRow.intervalDays × 86400000`; **credit-skip contract**: the applicant still owns NO `students` row and no junction row — the committed activation itself proves no abort/rollback on the missing credit surface (the exact runtime shape Task 6 implements); ONE persisted `payment_confirmation` notification in the purchaser's persisted locale (`users.locale = "en"` seeded in the fixture) with `NOTIFS_EN.eventPaymentConfirmedTitle` / `eventPaymentConfirmedBody(planRow.title)`; publish spy asserts ONE post-commit `publishReceipts` call whose receipt targets `[A.userId]` ONLY; six bystander inboxes all 0; the intended observer sees the flip through the REAL self-profile read (`ApplicantLifecycleService.getMyApplicantProfile`).
   - **Step 4 (Applicant B, cooldown ACTIVE):** denial via `catchJourneyError` → `ValidationError` with `code === "APPLICANT_COOLDOWN_ACTIVE"`, message contains the translated template prefix (derived by slicing `ERRORS_EN.applicantCooldownActive` at the `{cooldownUntil}` placeholder) and contains NO placeholder residue; zero writes — pair/claim counts unchanged and the applicant row byte-identical (status, attempts, `cooldownUntil`, `lastAttemptAt`).
   - **Step 5 (Applicant C, cooldown EXPIRED):** re-purchase succeeds; `verification_attempts === before + 1`, `failed → in_evaluation`, `lastAttemptAt` stamped; pair/claim +1; NULL payment owner.
   - **Step 6 (Student, non-applicant):** denial through the REAL applicant gate → `NotFoundError` `APPLICANT_NOT_FOUND` with `ERRORS_EN.applicantNotFound`; zero side effects for the student (subs/claims/payments/inbox unchanged).
   - **Step 7 (Student replays A's SPENT key):** oracle-safe `NotFoundError` `PAYMENT_NOT_FOUND` with `ERRORS_EN.notFound` and NO owner-email leakage; A's decided pair byte-identical (`status` + `updatedAt` snapshots), foreign caller writes nothing.
   - **Step 8 (System, afterAll):** tracked hard-deletes + zero-residue re-probes (see below).
2. **Fixture strategy (real helper signatures — see carry-forward):** cast via `createJourneyFixtures(PREFIX)` (its own committing transaction; provides applicant A `pending`, the foreign-actor `student`, plus admin/parent/certified-teacher bystanders used for the cross-actor fan-out assertions); phase-2 ONE committing `db.transaction` for the persisted EN locale of the whole cast, applicants B/C via `createTestUser(tx, { role: "teacher", locale: "en" })` + `createTestApplicant(tx, userId, { status: ApplicantStatus.Failed, cooldownUntil })`, and the plan via `createTestPlan(tx, { title: VERIFICATION_PLAN_TITLE, sessionCount: VERIFICATION_PLAN_SESSION_COUNT, price: "150.00", currency: "EGP", intervalDays: 14, balanceLane: SubscriptionCreditLane.Reviews, isActive: true })`. Prefix: `journeyPrefix("teacherverify")` → `jrn_teacherverify_<8hex>` (the sanctioned helper produces exactly the mandated shape). Idempotency keys `${PREFIX}-key-purchase-a|-cooldown|-purchase-c|-student`.
3. **Teardown choreography (afterAll, in order):** publish-spy restore → `student_payments` ledger leg FIRST under `withImmutabilityTriggersSuspended(["student_payments"])` + re-probe to zero → defensive student-junction sweep by subscription id + re-probe → `tracked.cleanup()` (TrackedFixtures: reverse-registration-order hard-deletes + zero-residue existence probes for notifications/claims/subscriptions/plan/extra-applicant rows) → `journeyCleanup(bundle.registry)` (audit-log sweep under suspended triggers, role-children, cast users) → explicit post-teardown existence probes for EVERY cast row across `users`/`applicants`/`students`/`teacher`/`parents`/`admin`/`notifications` (a leaking `afterAll` fails the suite loudly).
4. **Dispatch-line adaptations (verified against the real helpers, as mandated):**
   - **Plan fixture**: created via `createTestPlan` as instructed. Additionally, the journey re-resolves the purchase target through the service-identical lookup (`listActive` → title find) instead of assuming the fixture row is the one the service charges: `plans.title` has no unique constraint, the plan-catalog seeder may already hold a row with the same canonical title (seeded environments), and `listActive` orders deterministically (`created_at ASC`) — so fixture row, seeded row, journey resolution, and service resolution always agree, and in THIS environment (test DB currently has an EMPTY `plans` table; `bun run db seed` not yet run here) the fixture row IS the resolution target.
   - **`publishReceipts` spy**: `NotificationEngine` import path is `@/backend/services/notifications`; the spy is installed at module scope (`spyOn(NotificationEngine, "publishReceipts").mockImplementation(async () => {})`) and restored in `afterAll` — same seam the billing journey uses.
   - **Prefix**: `journeyPrefix("teacherverify")` used instead of hand-rolling `jrn_teacherverify_${randomUUID().slice(0,8)}` — identical output, sanctioned source.
   - **Honest-authorization denials are service-level**: the mutation boundary does not exist yet (Task 7), and per plan §5.2 the `purchaseVerificationPlan` surface is `authenticated`-scope only with the applicant gate at the SERVICE level — so the foreign-actor probe (student) and the foreign-replay probe run through the real service path, exactly the denials REQ-9.2/REQ-9.3 pin. No monkey-patching anywhere; the only spy is the external-effect boundary (`publishReceipts`).
5. **Throwaway validation (deleted after use, not part of the suite):** a temporary probe file replicating the journey's `beforeAll`/`afterAll` choreography (without the not-yet-existing service import) ran GREEN TWICE consecutively via the sanctioned runner — proving provisioning, the enum-typed fixture overrides, the catalog resolution, the persisted-locale write, and the full teardown zero-residue chain before the red file was finalized. The probe was deleted; `test/workflows/teachers/` contains ONLY the journey file.

## Files created/modified

| File | Change |
|---|---|
| `test/workflows/teachers/verification-plan-purchase.journey.test.ts` | **CREATE** — the J1 journey (red) |

**Files NOT modified (deliberately):** everything else. No stub implementation of `VerificationPurchaseService` was created (TDD gate honored); no skips/only/todo; no runInRollback; no other test file, helper, or source file touched.

## Verification results

### 4.QL sub-loop — `bun run scripts/health/sub-loop.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts --lifecycle duplicates`

**Exit code 1 — tsgo FAILED (expected TDD red), with EXACTLY ONE diagnostic, attributable solely to the missing Task-5 module:**

```
ℹ  Running tsgo (project-wide, filtering for test/workflows/teachers/verification-plan-purchase.journey.test.ts)...
❌  tsgo FAILED — stopping here. Fix type errors before proceeding.

test/workflows/teachers/verification-plan-purchase.journey.test.ts(98,45): error TS2307: Cannot find module '@/backend/services/teachers/verification-purchase.service' or its corresponding type declarations.
```

No other tsgo error exists (the failed import types the symbol as error-any, so usages produce no follow-on diagnostics). Because the progressive lifecycle stops at tsgo, the remaining stages were verified individually on the final file:

| Stage | Command (as the sub-loop runs it) | Result on the final file |
|---|---|---|
| oxlint | `bunx oxlint --deny-warnings --ignore-path .gitignore <file>` | **0 warnings**, 1 error — the SAME TS2307 surfaced by oxlint's TS parser (zero lint-rule findings of its own; one pre-fix `no-await-in-loop` warning was found and fixed by converting the observer-inbox loop to `Promise.all(...map(...))`) |
| biome:check | `bunx @biomejs/biome check --write --unsafe --error-on-warnings <file>` | **PASS** — "No fixes applied" on the final pass |
| lint:type-aware | lint service (`scripts/lint-service.ts --files <file>`) | **1 error** — `98:45 import-x/no-unresolved` on the SAME missing-module import (nothing else; one pre-fix `import-x/no-duplicates` on the helpers import was found and fixed by merging the type into the single value import) |
| check:duplicates | jscpd (intra-file) | **auto-skip by design** — `scripts/health/sub-loop-checks.ts` `shouldSkipJscpd` returns true for `*.test.ts` files |

**⏸ 4.QL DEFERRAL (checkbox intentionally left UNCHECKED):** compile-clean is unachievable until Task 5 lands `backend/services/teachers/verification-purchase.service.ts`. The moment it lands, this file's only diagnostic disappears (it is the sole tsgo/oxlint/eslint finding), and the full sub-loop (tsgo → oxlint → biome → lint:type-aware → duplicates) is expected to exit 0. The orchestrator/Task 5 should re-run the sub-loop on this file and flip 4.QL then. Everything OTHER than the missing-module diagnostic is already proven clean today.

### Red run — `bun run test/scripts/run-test.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts`

**Exit code 1 (RED as mandated — nothing silenced):**

```
[run-test] Running: bun test /home/z/my-project/kottaby-repo/test/workflows/teachers/verification-plan-purchase.journey.test.ts
bun test v1.3.14 (0d9b296a)

test/workflows/teachers/verification-plan-purchase.journey.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '@/backend/services/teachers/verification-purchase.service' from '/home/z/my-project/kottaby-repo/test/workflows/teachers/verification-plan-purchase.journey.test.ts'
-------------------------------

 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [66.00ms]
```

The failure mode is the mandated module-not-found: the suite cannot even load until Task 5's module exists. No skips, no `.only`, no `.todo`, no stubs.

### Throwaway probe (deleted; evidence for fixture/teardown correctness)

`bun run test/scripts/run-test.ts <tmp probe>` — **run 1: 1 pass / 0 fail (13 expects); run 2: 1 pass / 0 fail** — two consecutive green runs prove both the provisioning choreography AND teardown totality (zero residue; run 2 observed none of run 1's rows). The probe file was removed; only the journey file remains in `test/workflows/teachers/`.

## REAL helper signatures used (carry-forward for Tasks 5/10)

All signatures verified by reading the sources before use:

- `journeyPrefix(domain: string): string` — `test/workflows/helpers/session-cast.ts:314`; returns `jrn_<domain>_<8hex>` (uses `randomUUID().slice(0, 8)` internally).
- `createJourneyFixtures(prefix: string): Promise<JourneyFixtureBundle>` — `test/workflows/helpers/journey-actor-fixtures.ts:141`; opens its OWN committing `db.transaction` (callers do NOT pass a tx) and provisions admin + student + parent + **applicant (users.role = "teacher" + applicants row `pending`/attempts 0/NULL cooldowns)** + certified teacher. Returns `{ cast, registry }`; `cast.<member>` = `{ user: UserSelectType; child: <role-child row> }` (NOT exported as `JourneyActorFixture` — type via `JourneyFixtureBundle["cast"]["applicant"]` etc.); `registry` = `JourneyFixtureRegistry` `{ prefix, userIds: number[], trackUserId(id) }`.
- `journeyCleanup(registry: JourneyFixtureRegistry): Promise<void>` — `test/workflows/helpers/journey-cleanup.ts:62`; deletes audit_logs (under `withAuditDeleteTriggersSuspended`) → role-children (`teacher`, `applicants`, `students`, `parents`, `admin`) → `users`, reverse-insertion order; NO re-probing (suites must probe themselves — this journey does).
- `TrackedFixtures` (class) — `test/workflows/helpers/tracked-fixtures.ts:173`; `register(table: PgTable, id: number, options?): void` (requires a primary-key `id` column; same (table,id) re-register is a no-op; non-positive ids throw); `cleanup(): Promise<TrackedFixtureCleanupReport>` — reverse-registration-order DELETEs + re-probes EVERY row + empties the registry; `verifyAllAbsent()`, `exists(record)`, `records`, `size`.
- `catchJourneyError(fn: () => Promise<unknown>): Promise<Error>` — `test/workflows/helpers/journey-fixtures.ts:226` (AGENTS rule 6 try/catch helper; throws if the call resolved).
- `createTestUser(tx: DBTransaction, overrides?: Partial<UserSelectType>): Promise<UserSelectType>` — role/locale/governance overrides accepted; unique random email.
- `createTestApplicant(tx: DBTransaction, userId: number, overrides?: Partial<ApplicantSelectType>): Promise<ApplicantSelectType>` — defaults `status: "pending"`, `verificationAttempts: 0`, `lastAttemptAt: null`, `cooldownUntil: null`; shared PK (`id = users.id`).
- `createTestPlan(tx: DBTransaction, overrides?: Partial<PlanSelectType>): Promise<PlanSelectType>` — NOTE: ONE overrides object (not positional fields); defaults `sessionCount: 8, price: "200.00", currency: "EGP", intervalDays: 30, isActive: true`; `balanceLane` nullable on the table, overrideable.
- `withImmutabilityTriggersSuspended(tables: readonly string[], fn: () => Promise<T>): Promise<T>` — `test/helpers/db-cleanup.ts:229` (tables first, callback second; discovers/disables/restores per-trigger `tgenabled`).
- `ApplicantLifecycleService.assertCanPurchaseVerification(userId: number, locale: string, tx?: DBTransaction): Promise<void>` — throws `NotFoundError("APPLICANT")` → `code "APPLICANT_NOT_FOUND"`; `ValidationError("APPLICANT_COOLDOWN_ACTIVE", <template expanded via Intl, fixed UTC>)`; `ValidationError("APPLICANT_ALREADY_CERTIFIED", ...)`. Branch order pinned: cooldown BEFORE certified.
- `ApplicantLifecycleService.getMyApplicantProfile(userId: number, locale: string, tx?: DBTransaction)` — used as the honest self-visibility read; returns `null` for no-row, normalizes `verificationAttempts ?? 0`.
- `SubscriptionActivationService.processWebhookEvent(event: PaymentWebhookEvent, locale: string, outerTx?: DBTransaction)` — `PaymentWebhookEvent = { reference: string; outcome: "confirmed" | "failed"; amount: string; currency: string }` (`@/backend/types/billing/payment-gateway.types.ts:41`); returns `{ processed: true }` / `{ processed: true, replayed: true }` / `{ processed: false }`; notification copy composes in the RECIPIENT's persisted `users.locale` (falls back to `defaultLocale = "ar"` — the journey therefore seeds `locale: "en"` on every cast user) and `publishReceipts([receipt], locale)` fires strictly post-commit.
- `NotificationEngine` import path: `@/backend/services/notifications` (barrel), spy seam `NotificationEngine.publishReceipts`.
- Error classes: `DomainError extends GraphQLError` with `public readonly code: string`; `NotFoundError(entity, message)` → `code = ${entity}_NOT_FOUND`; `ValidationError(codeOrMessage, message?)`.
- Current activation credit branch (pre-Task-6, for Task 6's awareness): `backend/services/billing/subscription-activation.service.ts:393-408` calls `StudentRepository.creditLaneBalance(subscription.userId, ...)` UNCONDITIONALLY and `abortActivation(...)` on the null return — for an applicant purchaser (no students row) today's code would roll the activation back; Task 6's students-first probe turns the journey's step-3 assertions true.

## Expected service export shape (binding for Task 5 — the journey compiles against it verbatim)

```ts
// backend/services/teachers/verification-purchase.service.ts  (plan.md §4.3, byte-pinned by the journey's import + call sites)
export namespace VerificationPurchaseService {
  export async function purchase(
    applicantUserId: number,
    idempotencyKey: string | null,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<PurchaseSubscriptionReturnType>;  // { subscription: SubscriptionReturnType; payment: StudentPaymentReturnType; checkout: PaymentCheckoutSession }
}
```

The journey imports the module DEEP (`@/backend/services/teachers/verification-purchase.service`) so the TDD-red diagnostic is precisely attributable (TS2307 / `import-x/no-unresolved`, both naming exactly that module). When Task 5 registers the export in `backend/services/teachers/index.ts` (already surfaced by the `@/backend/services` top barrel), the deep import keeps working as-is; switching the journey to the barrel import is an optional one-line follow-up if the reviewers prefer barrel discipline.

Behavioral pins the journey makes on Task 5/6 (all derived from plan §4.3/§4.4 + DEV1-006's proven contracts):
- Gateway checkout is the mock (`PaymentGateway.Mock`, `checkoutUrl === null`, `providerReference` starting with the adapter's prefix) with `PaymentCheckoutInput.studentId` carrying the applicant's user id verbatim.
- Purchase order: governance → key-format check (`VALIDATION` if malformed — the journey's denial legs therefore always pass well-formed keys) → plan resolve → gateway pre-tx → ONE tx [plan re-read → `assertCanPurchaseVerification` → claim insert (23505 → same-caller `DUPLICATE_REQUEST` / foreign-key replay → `NotFoundError("PAYMENT")` = `PAYMENT_NOT_FOUND`, oracle-safe) → pair insert with `studentId: null` + NO junction → `recordReapplication` ONLY when `status === failed` → `transitionToInEvaluation` (null = silent no-op) → claim backfill]. Nothing is written on any denial leg (tx rollback) and the checkout is a pure in-memory mock (no external call, no row).
- Activation credit-skip (Task 6): confirmed webhook on an applicant-owned subscription must commit (active + paid) with NO lane credit and NO abort; notification still persisted + published to the purchaser.

## 4.SEC — Security review conclusion

**Honest authorization end-to-end; every denial flows through the real gate.** Actors are real `users` rows + real role-children provisioned by the sanctioned factory — no role/permission resolution is monkey-patched anywhere; the only spy is the external-effect boundary (`NotificationEngine.publishReceipts`, installed over the same namespace-bound seam the billing journey documents). The foreign-actor probe (student purchasing) and the foreign-replay probe (student replaying A's spent key) exercise the REAL service-level authorization paths and pin oracle-safety (`PAYMENT_NOT_FOUND` message must NOT contain the owner's email). Identity is a plain constructor argument exactly as the plan's resolver will pass it (`ctx.user.id`); the wire-level 401/403 matrix stays owned by Task 7's GraphQL suite. Fixture rows are self-created (never seeded/demo data); teardown hard-deletes everything with zero-residue proof, and unique per-run prefixes make any crash residue greppable and collision-free.

## 4.SR — Semantic review checklist

- **No `runInRollback` anywhere** — the journey layer's documented exception posture; fixtures commit in `beforeAll` (cast transaction + one phase-2 transaction, each commit-or-nothing).
- **Translated-string assertions only** — every denial/notification assertion derives from `getServerTranslations("en").errorsTranslations` / `.notificationsTranslations` (the cooldown prefix is SLICED from the template at the placeholder; the test asserts NO `{cooldownUntil}` residue). Zero hardcoded English expectations; harness-failure messages are distinct from domain assertions.
- **No fake data / no seeded rows** — all fixtures via entity-setup helpers + the journey cast factory; the plan fixture carries the canonical product (title from the shared constant, 5 sessions, Reviews lane, "150.00"/EGP/14) and the money/window/lane assertions read the SERVICE-resolved catalog row, never a client value or a fixture assumption.
- **No `console.*`, no `any`, no `expect(...).rejects.toThrow()`** — bun:test imports only; try/catch via `catchJourneyError`; `no-await-in-loop` pattern honored (`Promise.all` + `map`).
- **No plan-artifact references in code/JSDoc** — the header describes the workflow in domain terms only.
- **No unrelated files touched; no skips/only/todo; red left loud.**

## 4.IV — Instruction verification

Rule files read: `test/workflows/AGENTS.md` (BINDING) and `.agents/instructions/tests.instructions.md`, plus root `AGENTS.md` (printed by the sub-loop) and — for cross-checking helper contracts — the helper sources + sibling journeys (`billing/subscription-purchase.journey.test.ts` primary template). Validation per rule:

1. No `runInRollback` — ✓ (none; committed fixtures).
2. Committed fixtures + tracked cleanup, ONE committing transaction per setup phase, registration-order FK-safe deletes, re-probes mandatory — ✓ (TrackedFixtures cleanup + explicit cast probes; a throwing `beforeAll` leaves nothing).
3. Unique UUID prefix `jrn_teacherverify_<8hex>` — ✓ via `journeyPrefix`.
4. Honest authorization only — ✓ (real roles; denials through the real gate; no monkey-patching).
5. External effects intercepted — ✓ (`publishReceipts` spied at module scope, restored in `afterAll`; publish targeting asserted; the gateway is the platform's mock adapter — the sanctioned in-process gateway, no external call).
6. Never `.rejects.toThrow()` — ✓ (`catchJourneyError` + translated substrings/codes).
7. `bun:test` only; no `console.*`; no `any` — ✓.
8. `@/` aliases only — ✓.
9. Never demo/seeded rows — ✓ (all rows self-created; the seeded-plan contingency is handled by the service-identical resolution, and in this environment the fixture row IS the catalog member).
10. One journey file per workflow in the domain subdir — ✓ (`test/workflows/teachers/` created).
11. Sequential actor-attributed steps — ✓ (each test names its actor; later steps observe earlier commits).
12. Cross-actor visibility + denial probes both directions — ✓ (owner sees the flip via the real profile read; six bystander inboxes pinned at 0; three denial probes with owner-row byte-identity).
- tests.instructions.md: run via the sanctioned runner (never raw `bun test`); PGlite single-instance respected (all runs through the process-lock runner; no live-server harness concurrent); `.test.ts` jscpd skip honored; unique prefixes for crash residue; no `oxlint-disable` comments (two real findings fixed at root cause: `no-await-in-loop`, `import-x/no-duplicates`).

## Carry-forward knowledge for future tasks

- **Task 5:** land `backend/services/teachers/verification-purchase.service.ts` with the exact export shape above; re-run this file's sub-loop (the single TS2307 disappears) and flip 4.QL. The journey's step 2/5 assertions pin `payment.studentId === null`, verbatim claim keys, claim backfill, zero junction rows, purchase-time flip, attempts semantics (0 on first purchase, +1 on re-application from `failed`).
- **Task 6:** the journey's step 3 will only pass once the activation credit-skip ships — today's activation (`subscription-activation.service.ts:393-408`) would abort (rollback) for an applicant-owned subscription because `creditLaneBalance` returns null without a students row. The journey asserts the SKIP via ABSENCE (no students row before/after, no junction, committed active+paid) rather than balance deltas, which is the correct shape for a purchaser that never had a balance row.
- **Task 10 (journey green):** run the file TWICE back-to-back (idempotent-teardown proof); the fixture choreography is already probe-validated. If the environment's `plans` table is empty (as here), the journey self-provisions the catalog member via `createTestPlan`; if a seeder runs later, the service-identical resolution keeps the journey deterministic without edits.
- **Test DB note:** `kottaby_db` currently has an EMPTY `plans` table (`bun run db seed` not yet run in this environment). The journey does not depend on the seeder; the billing journey's step 11/12 DO (documented fail-fast there) — environment provisioning (`bun run db seed`) is worth doing once before Task 10's full-layer sweeps.
- The two lint findings fixed mid-task (`no-await-in-loop` on the observer-inbox loop; `import-x/no-duplicates` on the helpers import) are the patterns to avoid in this layer's files: use `Promise.all(...map(...))` and a single merged import with inline `type` modifiers.

## Cross-file dependencies discovered

- **`backend/services/teachers/verification-purchase.service.ts` (Task 5, DOES NOT EXIST YET)** — the journey's ONLY unresolvable import; exact namespace/function/return shape pinned above. Task 5 must also register it in `backend/services/teachers/index.ts` (the teachers barrel currently exports only `applicant-lifecycle.service`; the top `@/backend/services` barrel already re-exports the teachers dir, so no further barrel edits are needed).
- **`backend/services/billing/subscription-activation.service.ts` (Task 6)** — the journey's step 3 pins the credit-skip behavior; the current unconditional `creditLaneBalance` + abort is the exact branch Task 6 replaces (students-first probe → credit + existing abort; applicants-row probe → skip; neither → existing abort).
- **None else.** All helpers/schema/entity-setup constants the journey consumes already exist and were verified at their sources; no helper changes were needed; no shared/locale surface is consumed beyond the existing pinned keys.
