# Task 6 — Activation credit-skip branch

- **Date:** 2026-09-14
- **Branch:** `feat/verification-plan-purchase-5-sessions`
- **Requirements:** REQ-5.1-5.6, REQ-8.3 · **Design:** plan.md §4.4 (binding probe-order pseudocode), D4

## Summary of what was implemented

1. **The students-first probe (plan §4.4 EXACTLY) in `backend/services/billing/subscription-activation.service.ts`:** the confirmed branch's unconditional `creditLaneBalance` + abort (formerly :393-408, after `markPaidOnce`) is replaced by a purchaser-owner credit decision, probed **students-FIRST** via the file's existing student read helper `StudentRepository.findById(subscription.userId, tx)` (`students.id` is shared with `users.id`; signature verified at `student.repository.ts:360`):
   - **students row present** → `StudentRepository.creditLaneBalance(subscription.userId, subscriptionCreditLaneOf(plan.balanceLane, …), plan.sessionCount, tx)` exactly as before (the existing fail-closed lane resolution and the `credited === null` abort are carried over VERBATIM — same abort reason string `"student row vanished before the lane credit"`, same context `{reference, subscriptionId, studentId}`);
   - **students row absent** → `ApplicantRepository.findByUserId(subscription.userId, tx)`; a row present = the **verification purchase — the lane credit is intentionally skipped**, the purchased session grant being enforced by the booking flow off the active subscription; **`null` (neither row)** → the EXISTING corruption abort, **byte-identical** to the student-path abort (same detail string, same client-safe `ConflictError` copy — zero message drift, per plan §4.4's own pseudocode which reuses the identical abort for the corruption case);
   - the probe reads run inside the SAME `tx` the credit used (the helper receives the confirmed-path transaction).
2. **Decomposition forced by lint, semantics untouched:** the inline `if/else` grew `confirmPayment` past the oxlint `max-lines-per-function` ceiling (87 > 75). Fix at root cause within the same file (no `oxlint-disable`): the decision block was extracted into a module-scope helper `applyActivationCredit(subscription, plan, reference, tx)` — the file's established decomposition pattern (`readActivationPlan`, `emitConfirmationNotification` are its siblings). `confirmPayment` now calls `await applyActivationCredit(...)` at the exact position the inline block occupied: AFTER `activatePendingOnce` + `markPaidOnce`, BEFORE the notification persist. Probe order, abort strings, and the skip are byte-equivalent to the §4.4 pseudocode.
3. **Notification emission UNCHANGED:** the recipient-locale read (`UserRepository.findById` → `defaultLocale` fallback), the in-tx `emitConfirmationNotification(subscription, plan.title, recipientLocale, tx)`, and the post-commit `NotificationEngine.publishReceipts([composed.receipt], locale)` are untouched — recipient remains `subscription.userId`, persisted-first + published-after-commit.
4. **Docblocks kept truthful:** the module-header stage-3 narrative and `confirmPayment`'s write-order line now describe the owner-scoped credit decision; the helper carries the full three-branch contract. Comments describe domain behavior only — zero plan-artifact references (grep-verified: no `DEV2-006`/`REQ-`/`§`/task ids in either edited file).
5. **6.TE — `backend/services/billing/subscription-activation.service.test.ts` extended** with a dedicated describe ("purchaser-owner credit decision (students-first probe)", 4 tests mirroring the suite's fixture/spy patterns — `runInRollback` + `outerTx` propagation, `spyNotificationSeams`, `trackSpy`/`afterEach` restore, `expectRepoError`, entity-setup helpers only):
   - **applicant-owned confirmation:** `provisionApplicantOwnedPair` (teacher-role user + `createTestApplicant` + Reviews/5-session/14-day plan + pending subscription + NULL-owner pending payment via `StudentPaymentRepository.insertPayment({studentId: null, …})` — Task 1's widened contract) → confirmed event: `{ processed: true }`; `creditLaneBalance` NOT called; `ApplicantRepository.findByUserId` called exactly ONCE (the probe fell through the absent students row — `spyOn` keeps the original reads running); NO `logger.error`/`logDomainError` (no abort, no quarantine); subscription active with the exact `intervalDays` window + `paymentVerifiedAt` stamp; payment paid; the students surface stays ABSENT before AND after (absence, not a zeroed balance — no students row conjured); ONE persisted receipt at the seam addressed to the purchaser (`userId = user.id`, EN composed copy, `relatedEntityType "subscription"`, `relatedEntityId`) and ONE post-commit publish with `recipientUserIds [user.id]`.
   - **student regression (explicit routing pin — the assertion that was missing):** the pre-existing suite pins the credited OUTCOME; the new pin proves the ROUTING — `spyOn(StudentRepository, "creditLaneBalance")` (call-through) records exactly ONE call with `(student.id, SubscriptionCreditLane.Hifz, plan.sessionCount)` and the lane balance equals the session count.
   - **corrupt purchaser (neither row):** degenerate pair (owner user with NO students row and NO applicants row) → `expectRepoError` catches the abort: `ConflictError` with the byte-identical client-safe copy `"Payment could not be processed."`; ONE `logger.error` containing the unchanged detail `"student row vanished before the lane credit"` with correlation context `{reference, subscriptionId, studentId}`; the savepoint rollback leaves the pair pending/pending with zero credit calls and zero notification seam calls.
   - **failed webhook unchanged for verification subscriptions:** `failedEvent` on the applicant-owned pair → `{ processed: true }`; payment failed, subscription stays pending with null dates, students surface still absent, no credit probe, no notification — the failed branch is owner-agnostic (untouched code, now pinned).
   - Header coverage map extended with the new block; all 23 pre-existing tests untouched and green.

## Files modified

| File | Change |
|---|---|
| `backend/services/billing/subscription-activation.service.ts` | + `ApplicantRepository` barrel import; students-first probe replacing the unconditional credit (+ `applyActivationCredit` helper extracted under the max-lines ceiling); module + function docblocks updated; aborts byte-identical; notification emission untouched |
| `backend/services/billing/subscription-activation.service.test.ts` | + applicant/student/corrupt/failed describe (4 tests) + `provisionApplicantOwnedPair`/`studentsRowCount` suite-local fixtures + imports (`createTestApplicant`, `StudentPaymentRepository`, `StudentRepository`, `ApplicantRepository`, `ConflictError`, `ApplicantSelectType`) + coverage-map bullet |

**Files NOT modified (deliberately):** `test/workflows/teachers/verification-plan-purchase.journey.test.ts` (Task 4's file — READ-ONLY per mandate; its step 3 now passes), `backend/services/teachers/verification-purchase.service.ts` + `backend/services/billing/subscription-purchase.service.ts` + `purchase-guards.helpers.ts` (Tasks 5/7 own the purchase services), `backend/db/repo/**` (both repo fns consumed as-is — `StudentRepository.findById/creditLaneBalance`, `ApplicantRepository.findByUserId`; no repo change needed), all GraphQL/frontend files (Task 7/9), `shared/**`, notification engine/repo (the emit seam is consumed unchanged).

## Verification results

### Sub-loop (per edited file, `--lifecycle duplicates`) — 2/2 exit 0

| File | Result |
|---|---|
| `backend/services/billing/subscription-activation.service.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ (one mid-task oxlint `max-lines-per-function` 87>75 on `confirmPayment` found and fixed at root cause via the helper extraction; re-run green) |
| `backend/services/billing/subscription-activation.service.test.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates (auto-skip, `*.test.ts`) ✅ (one mid-task tsgo TS6133 unused-import found and fixed by wiring `ApplicantRepository` into the probe-order assertion) |

Printed rule files read per run: root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`, `.agents/instructions/backend.instructions.md` (all read in full before validation).

### tsgo final count

`bun tsgo` (full project) → **0 errors** (baseline 0 preserved).

### Test runs (exact commands + counts)

| Command | Result |
|---|---|
| `bun run test/scripts/run-test.ts backend/services/billing/subscription-activation.service.test.ts` | **27 pass / 0 fail** (235 expects) — 23 pre-existing (all green, incl. the full quarantine/replay/window matrix) + 4 new credit-skip tests |
| `bun run test/scripts/run-test.ts backend/services/teachers/verification-purchase.service.test.ts` | **13 pass / 0 fail** (134 expects) — Task 5 regression: no cross-effect from the activation change |
| `bun run test/scripts/run-test.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts` | **6 pass / 1 fail** (91 expects) — see below |

### Journey status (exact)

- **Task 6's gate is GREEN:** step 3 — "confirmed webhook → paid + active window; NO lane credit for the applicant purchaser; ONE receipt published to Applicant A ONLY" — **PASSES** on the real service + real DB (committed fixtures). Steps 1-6 all pass.
- **Step 7 FAILS — NOT an activation issue, and outside this task's edit rights.** A STUDENT replaying Applicant A's SPENT key expects `PAYMENT_NOT_FOUND` but receives `APPLICANT_NOT_FOUND`. Root cause (diagnosed, no code touched): plan §4.3's BINDING order runs `assertCanPurchaseVerification` inside the transaction BEFORE the claim write/classification — so a non-applicant foreign caller is denied at the gate and never reaches the claim's 23505 → `PAYMENT_NOT_FOUND` classification. The implemented order is plan-conformant and test-pinned on both sides (Task 2's guard tests; Task 5's foreign-key case, whose attacker IS an applicant and therefore reaches the claim classification and gets the oracle-safe `PAYMENT_NOT_FOUND`). The journey's step-7 expectation (authored before Task 5's order landed) is the drifted side. `APPLICANT_NOT_FOUND` is equally oracle-safe: it discloses nothing about the key's owner (the step's substantive security assertion — no owner-email leakage, zero writes, owner pair byte-identical — would still hold). **Resolution belongs to Task 4/5 owners or the Task 10 gate:** either re-aim step 7's probe at an applicant foreign actor (keeps `PAYMENT_NOT_FOUND`) or update its expected code to the gate denial. Recorded as **deferred-item D7**; the journey file and the purchase services are both outside Task 6's edit rights.
- **The journey is therefore NOT fully green yet** — 6/7 — with the single remaining failure owned by the step-7 contract reconciliation above, not by any activation behavior.

## 6.SEC — Security review conclusion

**The credit-skip is unreachable for student purchasers — the probe is students-FIRST.** A purchaser with a `students` row always enters the credit branch (`creditLaneBalance` with the plan's lane + full `sessionCount`), pinned by the new routing test (exactly one primitive call with the plan's lane and session count); the skip branch requires the students read to MISS first. The skip writes nothing itself — it is the absence of a write, not a new write path; no lane, balance, or payment value is client-influenced (the decision reads only server rows inside the activation transaction). **No notification fan-out change:** the emit (recipient = `subscription.userId`, persist in-tx, publish post-commit) and its seam are byte-untouched; the applicant-owned test pins the same single-persist/single-publish shape the student path has, addressed to the purchaser only. The corruption abort keeps the fail-closed posture with the identical client-safe copy and bounded correlated log (no financial values, no owner PII in the log context). No new read surface, no parameter change, no permission logic moved.

## 6.SR — Semantic review checklist

- **`ApplicantRepository` import via the repo barrel:** yes — added to the file's existing `@/backend/db/repo` import block (the exact sibling-consumer pattern: `applicant-lifecycle.service.ts`, `cold-start-certification.service.ts`).
- **No business logic drift into the repo:** both repo functions are consumed as-is; the decision (probe order, skip, abort) lives entirely in the service — repo files untouched.
- **No module state:** the helper is a pure async function over its parameters; no new module-level mutable state, no caches, no env reads.
- **Enums as values:** no new enum usage added (`SubscriptionCreditLane` remains a value import flowing through the existing mapper; the test compares the enum member identity via `toEqual`).
- **No dead branches:** every branch is reachable and test-covered — students-present (credit; pre-existing suite + new routing pin), students-absent + applicants-present (skip; new applicant test proves the probe fell through via the `findByUserId` call pin), neither (abort; new corrupt test), and the unreachable-in-practice `credited === null` vanished-row abort is carried over unchanged with its original rationale.
- **No plan-artifact references in code/JSDoc:** grep-verified on both files (`DEV2|REQ-|Task|§|plan.md` → zero matches); comments describe the domain contract only.
- **Abort/message drift:** both abort sites call `abortActivation` with the byte-identical detail string and identical context shape; the client-safe `ConflictError` copy is the same module constant — pinned byte-equal by the corrupt test.
- **Same-tx guarantee:** the probe reads and the credit share the confirmed-path transaction handle (helper receives `tx`); the notification persist remains in that transaction; the publish remains strictly post-commit.
- **No `console.*`, no `oxlint-disable`, no `any`, no unrelated refactors** — the diff touches exactly the credit decision + its tests.

## 6.IV — Instruction verification

Rule files printed by the sub-loops and read in full: root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`, `.agents/instructions/backend.instructions.md` (test file additionally covered by the tests conventions the suite already follows; backend/AGENTS.md + backend.instructions.md validated per layer):

- **backend/AGENTS.md:** service signature types come from `@/backend/types` (`SubscriptionSelectType`/`PlanSelectType`/`DBTransaction` — no new local types); no service-layer `.types.ts`; no `oxlint-disable` (the lint finding was fixed at root cause by extraction); error handling unchanged (DomainError family via `abortActivation`).
- **backend/services/AGENTS.md:** domain-service posture preserved (no new service, no monolith); no user-facing strings added (the abort copy is the pre-existing constant); single-writer discipline untouched (the credit is still the only lane writer in the flow); the shared decision extracted into a helper instead of duplicated.
- **backend.instructions.md:** 6-layer flow respected (service orchestrates repos; no repo-tier business logic); SSR-compatible (no GraphQL context dependency); no nested ternaries; no `console.*`.
- **Test rules honored:** `runInRollback` + `tx` propagated as `outerTx`; `expectRepoError` (zero `.rejects.toThrow()`); entity-setup helpers only (the NULL-owner ledger row is written through the real `StudentPaymentRepository.insertPayment` — the Task-1-widened contract — not seed data); spies tracked + restored via the suite's own `afterEach` mechanism; suite-local fixture helpers (no cross-file helper imports); bun:test imports only.

## Carry-forward knowledge for future tasks

- **Task 7 (mutation):** nothing to wire — the activation branch is behavior behind the existing `processWebhookEvent` contract; the webhook route (`/api/payments/webhook/`) is unchanged.
- **Task 10 (journey green):** after the D7 step-7 reconciliation, the journey should run fully green — steps 1-6 already pass on the current code (including the previously red step 3). Run it twice back-to-back for the idempotent-teardown proof. No activation-side changes are expected to be needed.
- **`applyActivationCredit` is the single choke point for the credit decision:** any future writer to the confirmed path (e.g., the DEV2-009 conversion era re-application purchases by a user who NOW has a students row) is automatically routed by the students-first probe — a converted applicant re-purchasing gets credited like any student without further changes.
- **Lane-resolution ordering note:** `subscriptionCreditLaneOf` now runs only inside the students-present branch; a verification purchase with an unconfigured plan lane commits (skip) where a student purchase would abort — semantically correct (nothing is credited), and the NULL-lane quarantine still fires EARLIER for both purchaser shapes (plan read precedes the writes).
- **Test fixture reuse:** `provisionApplicantOwnedPair` (suite-local) is the activation-side mirror of Task 5's purchase fixtures; if another suite needs an applicant-owned pending pair, follow the same shape (repo-inserted NULL-owner payment, `createTestApplicant`, no students row) rather than importing across suites.
- **Environment:** D6 carry-forward honored — no DB repairs needed; the immutability triggers and migration journal were already in place.

## Cross-file dependencies discovered

- **`test/workflows/teachers/verification-plan-purchase.journey.test.ts` step 7 ↔ `backend/services/teachers/verification-purchase.service.ts` guard order (D7):** the journey's foreign-replay probe uses a student actor; the plan §4.3 binding order (lifecycle guard before claim classification) answers `APPLICANT_NOT_FOUND`. Task 10's green gate needs the step-7 expectation reconciled (journey edit) — the service is plan-conformant and double-pinned; see the deferred-items ledger (D7).
- **None else.** No repo/schema/type/locale file required changes; the credit decision is fully contained in the activation service + its suite.
