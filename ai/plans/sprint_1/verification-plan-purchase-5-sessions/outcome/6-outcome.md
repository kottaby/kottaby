# Task 6 — Activation credit-skip branch — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Environment**: sandbox, `DB_PROVIDER=pglite` (in-process PG, data dir `./db/pglite`)

## Summary

The webhook-confirmed activation path now discriminates the purchaser by row shape
(students-row-FIRST probe, exactly per plan.md §4.4) inside the confirmed transaction,
after `activatePendingOnce` + `markPaidOnce` and before the notification persist:

1. **`students` row exists** → existing behavior byte-preserved: the full `sessionCount`
   is credited to the plan's designated lane (fail-closed lane resolution unchanged);
   a zero-row credit still aborts with the SAME detail, context, and client-safe
   `ConflictError` as before.
2. **NO `students` row but an `applicants` row** → the verification-purchase shape:
   the lane credit is intentionally SKIPPED (no lane is ever credited for a verification
   subscription — its session grant is owned by the booking flow over the active
   subscription), the unit does NOT abort, and activation completes (subscription
   `active` with the full window, payment `paid` on its NULL owner). The notification
   emission is UNCHANGED — the receipt is still composed in the recipient's persisted
   locale and published post-commit to the purchaser (`subscription.userId`).
3. **NEITHER row** → corrupt purchaser: the existing fail-closed abort fires with the
   identical detail + context + client-safe copy; the throw rolls the whole activation
   unit back (pair stays pending).

Implementation detail: the probe lives in a new module-private helper
`applyPurchaserLaneCredit(subscription, plan, reference, tx)` — the inline placement
grew `confirmPayment` past the oxlint `max-lines-per-function` ceiling (87 > 75), so
the branch was extracted (root-cause fix; no lint suppression). The branch semantics
match plan §4.4 exactly; the students-first order is what makes the skip unreachable
for student purchasers (pinned by a dedicated both-rows test).

## Files modified

| File | Change |
|---|---|
| `backend/services/billing/subscription-activation.service.ts` | Barrel import gained `ApplicantRepository` (alphabetical, same `@/backend/db/repo` barrel the file already used). New module-private `applyPurchaserLaneCredit` helper (JSDoc documents the three-way contract + why students-first dominates); `confirmPayment`'s credit block replaced by one probe call; module header + `confirmPayment` docblock write-order updated to stay truthful. Notification emission statements untouched. |
| `backend/services/billing/subscription-activation.service.test.ts` | New suite-local fixture `provisionVerificationPair` (applicant-shaped pending pair: teacher user + `applicants` row, NO `students` row, `student_payments.studentId = NULL`, reviews-lane/5-session/14-day plan mirroring the verification plan's catalog shape) + new describe `purchaser discrimination probe (verification credit-skip)` with 4 tests; header coverage map extended. |

No other production or test files were touched. Files modified by the parallel Task 5
agent appeared in the shared working tree during this task (`subscription-purchase.service.ts`,
`purchase-guards.helpers.ts`, `verification-purchase.service.ts`, `teachers/index.ts`) —
not part of this task's diff.

## Files NOT modified (and why)

- `backend/db/repo/teachers/applicant.repository.ts` — the probe is a plain read through
  the EXISTING `ApplicantRepository.findByUserId(userId, tx?)` (raw-row select, `null` on
  miss); zero repository changes, zero business logic drifted into the repo.
- `backend/db/repo/students/student.repository.ts` — the students-first probe reads the
  EXISTING `StudentRepository.findById(studentId, tx?)`.
- `backend/services/teachers/**` + `subscription-purchase.service.ts` +
  `purchase-guards.helpers.ts` — parallel agent's files, untouched per coordination protocol.
- `test/scripts/run-test.ts`, `entity-setup.ts` — the NULL-owner payment fixture needs no
  factory signature change: `createTestStudentPayment(tx, user.id, subscription.id, { …,
  studentId: null })` overrides the widened `StudentPaymentSelectType.studentId`
  (`number | null` since the Task 1 schema change) with `NULL` at the values-spread.

## Verification results

| Check | Result |
|---|---|
| 6.QL sub-loop `--lifecycle duplicates` — `subscription-activation.service.ts` | **exit 0** (tsgo → oxlint → biome → lint:type-aware → duplicates; printed rule files read: root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`, `backend.instructions.md`) |
| 6.QL sub-loop `--lifecycle duplicates` — `subscription-activation.service.test.ts` | **exit 0** (after one TS6133 fix: unused `applicant` destructure removed — the test asserts the applicants table directly) |
| 6.TE `bun run test/scripts/run-test.ts backend/services/billing/subscription-activation.service.test.ts` | **26 pass / 0 fail / 1 skip** (229 expect calls) = **22 pre-existing + 1 pre-existing pglite-gated skip** (true-concurrency chaos case, unchanged) + **4 new**. Whole file re-run — student regression suites (Tier 1 happy path, exact-delta, reviews/tajweed lanes, replay proofs) all stayed green. |
| `bun tsgo` (project-wide) | **0 errors** |
| `bun biome:check` (project-wide) | **0 warnings** (one run applied a one-time safe fix; immediate re-run: "No fixes applied") |

### 6.TE — the 4 new tests (all inside `runInRollback`, `tx` propagated, `expectRepoError` for the abort, spies tracked+restored by the file's `afterEach`)

1. **Applicant-owned confirmation** (Tier 1): teacher user + `applicants` row, NO
   `students` row, NULL ledger owner → `{ processed: true }`; `spyOn(StudentRepository,
   "creditLaneBalance")` proves the credit primitive NEVER fired; `logger.error` spy
   proves no abort; subscription `active` with the exact `intervalDays × 86_400_000`
   window; payment `paid` with owner still `NULL`; no `students` row was fabricated;
   `applicants` row untouched (status `pending`, attempts 0 — activation owns money
   finality + notification only); notification inserted exactly once with the purchaser
   as `userId`, composed copy, subscription pointer — and `publishReceipts` fired once
   post-commit with `recipientUserIds = [purchaser]`.
2. **Probe order pin** (6.SEC): a purchaser holding BOTH a `students` row and an
   `applicants` row is STILL credited (`balanceHifz` = `sessionCount`, active + paid) —
   the students-first order makes the credit-skip unreachable for student purchasers
   even in the degenerate both-rows state.
3. **Corrupt purchaser** (Tier 4): user with NEITHER row → `expectRepoError` catches the
   abort: `ConflictError` with the client-safe copy `"Payment could not be processed."`,
   one `logger.error` carrying the preserved detail + `{ reference, subscriptionId,
   studentId }` correlation; the savepoint rollback leaves the pending pair byte-intact
   and zero notification calls.
4. **Failed branch unchanged**: `failed` delivery on a verification pair → `{ processed:
   true }`, payment `failed`, subscription stays `pending` with NULL dates, no credit
   spy call, no notification — the existing failed posture verbatim for verification
   subscriptions.

## 6.SEC — security review

- **Credit-skip unreachable for student purchasers**: guaranteed structurally by the
  students-first probe order (`if (purchaserStudent !== null) credit… else probe
  applicants`), and PINNED by the both-rows test (a `students` row always wins the
  credit regardless of any `applicants` row).
- **No notification fan-out change**: the recipient remains `subscription.userId`; the
  persist-first + post-commit-publish statements and the receipt contract are untouched
  (both new happy-path tests assert the exact recipient ids and call counts).
- **No new read surfaces beyond the probe**: two single-row equality reads through
  existing repo methods (`students` by PK, `applicants` by PK), both on the activation
  transaction — no new queries, no cross-tenant scope (the purchaser id comes from the
  correlated subscription row, never from the webhook payload).
- **Fail-closed posture preserved**: the corrupt-purchaser case throws inside the
  transaction → whole unit rolls back → the gateway sees the error and retries against
  the settled state (unchanged posture for unreachable invariant breaches).

## 6.SR — semantic checklist

- `ApplicantRepository` imported via the established barrel `@/backend/db/repo` (same
  import statement the service already used) — no deep-import drift.
- No business logic in the repository; the probe is two plain reads + branch.
- No module state, no env-config keys, no new types (helper uses existing
  `SubscriptionSelectType` / `PlanSelectType` shapes).
- No enums added; existing enums remain value imports; no dead branches (all three
  probe outcomes are reachable and tested; the credit `null` abort remains reachable
  through the same invariant-breach channel as before).
- No `console.*`; comments describe domain behavior only — grep for
  `REQ-[0-9]|Task [0-9]|tasks\.md|specs\.md|plan\.md|DEV2` over both files → zero matches.
- `git diff` for this task = exactly the two files in the table above (plus plan
  artifacts: tasks.md, this outcome file, worklog).

## 6.IV — rule files read and honored

Root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`,
`.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`.
Highlights: services own all business logic (repo stays data-access-only); test rules —
`runInRollback` + `tx` everywhere, `expectRepoError` instead of `expect(...).rejects`,
entity-setup factories only (never seed data), spies tracked and restored (bun reuses
one mock per object+method pair), `bun run test/scripts/run-test.ts` as the only runner,
no `oxlint-disable` anywhere (the max-lines violation was fixed by extraction).

## Carry-forward for Task 4 (journey test — webhook confirmation step)

- **Exact event shape** the confirmed path expects (`PaymentWebhookEvent`,
  `backend/types/billing/payment-gateway.types.ts:41`):
  `{ reference: string; outcome: "confirmed" | "failed"; amount: string; currency: string }`.
  For the journey's step 3: `await SubscriptionActivationService.processWebhookEvent(
  { reference: subscription.paymentReference ?? "", outcome: "confirmed",
  amount: payment.amount, currency: payment.currency }, "en")` — the reference is the
  pending pair's `subscriptions.paymentReference` (the gateway correlation key), and
  `amount`/`currency` MUST equal the stored `student_payments` row verbatim (any
  disagreement quarantines with `{ processed: false }`). Production callers omit
  `outerTx`; the journey may pass the caller tx or omit it (both are supported seams —
  with `outerTx` the flow runs as a SAVEPOINT).
- **How the applicant-owned skip manifests** (journey step 3 assertions): outcome
  `{ processed: true }` (NOT `replayed`, NOT `{ processed: false }`); subscription row
  `active` with `startDate`/`endDate`/`paymentVerifiedAt` stamped (window delta =
  plan.intervalDays × 86_400_000); payment row `paid` with `student_id` still NULL;
  every `students`-lane balance untouched — there IS no students row for the purchaser
  and none is created; the `applicants` row retains its purchase-time `in_evaluation`
  status and `verification_attempts`; notification asserted via
  `spyOn(NotificationEngine, "publishReceipts")` — one call, post-commit, receipt
  `recipientUserIds = [applicant user id]`.
- **Journey fixture ordering caveat**: the purchaser must have an `applicants` row and
  NO `students` row at webhook time; `createTestStudentPayment`'s first parameter is
  still typed `number` — pass the user id and override `studentId: null` (as
  `provisionVerificationPair` does).
- **Replay posture**: a second confirmed delivery for the same reference returns
  `{ processed: true, replayed: true }` with zero new credit/notification — the
  `activatePendingOnce` zero-row arbiter fires BEFORE the probe, so replays never even
  reach the purchaser discrimination (existing Tier-1 test still green).

## Cross-file dependencies

- `ApplicantRepository.findByUserId` (existing, `backend/db/repo/teachers/applicant.repository.ts:170`)
  ← activation probe; also consumed by Task 5's purchase flow (step 7d) — same read, no
  signature expectations beyond the existing contract (`ApplicantSelectType | null`).
- `StudentRepository.findById` (existing, `backend/db/repo/students/student.repository.ts:360`)
  ← activation probe (students-first leg).
- `StudentPaymentSelectType.studentId: number | null` (Task 1) ← the probe's premises:
  activation keys off `subscription.userId` and never reads `payment.studentId`; NULL
  owners flow through `markPaidOnce`/`markFailedOnce` unchanged (proven by the new
  NULL-owner tests + pre-existing repo tests).
- `PaymentWebhookEvent` (`backend/types/billing/payment-gateway.types.ts:41`) ← Task 4's
  journey webhook step; shape unchanged.
- DEV2-006 hand-off (ledger D4, unchanged): the 5-session grant is enforced by the
  booking flow against the ACTIVE subscription — the activation credit-skip is the
  mechanism that keeps verification purchases from leaking lane balance.

## Deferred items

None added — no out-of-scope discoveries this task (ledger D1–D6 unchanged; D4's
cross-ticket note already covers the credit-skip hand-off).
