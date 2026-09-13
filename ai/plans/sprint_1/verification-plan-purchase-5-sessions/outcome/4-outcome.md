# Task 4 — Journey test: cross-actor verification plan purchase — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Environment**: sandbox, `DB_PROVIDER=pglite` (in-process PG, data dir `./db/pglite`)

## Summary

The cross-actor journey is GREEN: `test/workflows/teachers/verification-plan-purchase.journey.test.ts`
executes the full verification-plan purchase workflow end-to-end through the REAL services on the
REAL test database — 7 pass / 0 fail / 126 expect calls, run TWICE back-to-back (idempotent-teardown
proof, zero residue both runs). The purchase half (Task 5's service) and the activation half (Task
6's credit-skip branch) compose correctly: applicant purchase → pending pair → webhook confirm →
active subscription + paid payment with a NULL owner + `in_evaluation` applicant + NO lane credit +
receipt published to the purchaser only — plus the cooldown-active denial, the expired-cooldown
re-application (attempts +1), the non-applicant denial, and the foreign spent-key denial probe.

## Journey steps covered (specs §6/J1, steps 1–8)

| Step | Actor | Proven |
|---|---|---|
| 1 | System | Fixture cast committed + tracked: the journey's own plan row (`VERIFICATION_PLAN_TITLE`, 5 sessions, reviews lane, `150.00`/EGP/14d), Applicant A (`pending`, attempts 0), Applicant B (`failed`, 1 prior attempt, cooldown strictly future), Applicant C (`failed`, cooldown strictly past), and the foreign cast (student / parent / admin / certified teacher) — all real `users` rows with real role-child rows; precondition assertions pin every lifecycle state |
| 2 | Applicant A | `VerificationPurchaseService.purchase` → pending pair (subscription `pending` + payment `pending`, `studentId: NULL`, plan-row money verbatim) + NO junction row + verbatim-keyed claim backfilled; `pending → in_evaluation`; attempts unchanged; mock checkout descriptor (`mock_` reference, null URL) |
| 3 | System | `processWebhookEvent({ reference, outcome: "confirmed", amount, currency }, "en")` → `{ processed: true }`; subscription `active` with `endDate − startDate = intervalDays × 86_400_000` exactly; payment `paid` with owner STILL NULL; no `students` row exists or was fabricated; no junction row; the student cast member's balance lanes byte-identical; applicant row untouched by activation; ONE persisted `payment_confirmation` notification (EN copy byte-equal, subscription pointer) + `publishReceipts` fired exactly once post-commit with `recipientUserIds = [Applicant A]`; every other cast member's inbox 0 |
| 4 | Applicant B | Cooldown-active purchase → `ValidationError("APPLICANT_COOLDOWN_ACTIVE")` byte-equal to the localized template expanded over the fixture's cooldown instant (formatter-clone with the guard's fixed UTC options); purchase-set deltas zero; applicants row byte-identical (status, attempts, cooldown, stamp) |
| 5 | Applicant C | Expired-cooldown re-application → success; `verification_attempts` incremented by exactly 1 (1 → 2); `failed → in_evaluation`; `last_attempt_at` stamped; `cooldown_until` untouched (the gate is read-only over the cooldown); second pending pair committed |
| 6 | Student | Non-applicant purchase → `NotFoundError("APPLICANT_NOT_FOUND")` with the localized `applicantNotFound` copy; zero purchase rows; students row and balance lanes byte-identical |
| 7 | Applicant C (foreign caller) | Replays Applicant A's SPENT key → oracle-safe `PAYMENT_NOT_FOUND` with the generic localized `notFound` copy, no owner email/prefix leak; foreign caller and owner both write nothing; owner's pair still active + paid with the claim pointing home; owner-scoped visibility BOTH directions (A sees the active row, C sees its own pending row, every other cast member's list empty, foreign pair untouched); denials emitted zero notifications |
| 8 | System | `afterAll`: payment ledger deleted FIRST under `withImmutabilityTriggersSuspended(["student_payments"])` (+ in-leg residue probe) → `tracked.cleanup()` (notifications → claims → subscriptions → journey plan row, reverse registration order + per-row re-probes) → `journeyCleanup(bundle.registry)` (audit logs suspension-wrapped → role-children → users) → `assertZeroResidue()` re-probes EVERY registered id (users, applicants, subscriptions, student_payments, claims, notifications, journey plan row) — any leak fails the suite loudly |

## Files created

| File | Content |
|---|---|
| `test/workflows/teachers/verification-plan-purchase.journey.test.ts` | The journey — 7 actor-attributed steps + fixture/teardown harness. Committed fixtures via `createJourneyFixtures(PREFIX)` (cast includes the `applicant`) + `createTestUser`/`createTestApplicant` rows for the cooldown/expired applicants (tracked via the bundle registry); journey plan row via `createTestPlan` with the canonical verification-plan shape; webhook confirmation via direct `SubscriptionActivationService.processWebhookEvent(event, "en")`; notification assertion via the module-scope `spyOn(NotificationEngine, "publishReceipts")` (restored in `afterAll`); per-run `jrn_teacherverify_<8hex>` prefix on every idempotency key; `catchJourneyError` + `getServerTranslations("en")` assertions only — no `.rejects.toThrow()`, no raw English strings, no `runInRollback`. |

No other file was touched. `git status` for this task = the new journey file (plus plan artifacts).

## Verification results

| Check | Result |
|---|---|
| 4.QL `bun run scripts/health/sub-loop.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts --lifecycle duplicates` | **exit 0** (tsgo → oxlint → biome:check → lint:type-aware → duplicates-skipped-out-of-scope); two fixes during the loop: missing `notifications` schema import + duplicate helpers import (type specifier merged into the value import) |
| 4.TE Run #1: `bun run test/scripts/run-test.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts` | **7 pass / 0 fail** (126 expect calls) |
| Run #2 (back-to-back, idempotent teardown proof) | **7 pass / 0 fail** (126 expect calls) — fresh fixture ids, zero residue from run 1 |
| `bun tsgo` (project-wide) | **0 errors** (baseline 0; includes the parallel agent's committed GraphQL work) |
| `bun biome:check` (project-wide) | **0 warnings** ("No fixes applied") |
| Hygiene greps over the journey file | zero matches for `REQ-*`/`DEV2-`/`tasks.md`/`specs.md`/`plan.md`/`console.*` |

## Design notes (journey-level, no service changes)

- **Foreign-actor probe actor choice (step 7)**: the purchase flow's guard order is lifecycle-guard
  FIRST (in-transaction, before the claim insert) and the claim-table replay arbiter SECOND. A
  NON-applicant foreign caller therefore surfaces `APPLICANT_NOT_FOUND` (the honest, oracle-safe
  non-applicant denial — pinned by step 6), and the `PAYMENT_NOT_FOUND` foreign-KEY denial is
  reachable exactly for a caller holding an applicants row in good standing. Step 7 accordingly
  casts Applicant C (post-re-application: `in_evaluation`, no active cooldown) as the foreign
  caller replaying Applicant A's spent key — the strongest honest probe of the oracle-safety
  contract. Not a service bug: the ordering is the documented fail-closed posture (the
  non-applicant gate must not leak claim existence to callers the surface would reject anyway).
- **Plan-resolution anchoring**: the sandbox data dir carries the SEEDED active verification plan,
  so the journey creates its own same-title plan row (never seed-trusted, tracked, deleted at
  teardown) and re-resolves the plan through the service's own lookup (`PlanRepository.listActive`
  scanned for the canonical title) — every plan-derived assertion (planId, price, currency,
  intervalDays window, notification body) anchors to the row the service actually resolves.
- **Recipient locale**: the journey stamps the purchaser's persisted `users.locale = "en"` (the
  confirmation copy composes in the RECIPIENT's persisted locale; the platform default is `"ar"`),
  mirroring the billing journey convention, so the notification byte-asserts pin the EN bundle.
- **Zero-write proofs for verification purchases** count payments joined through the user's
  subscriptions (the ledger's owner column is NULL, so an owner-column count would read 0 even
  after a successful purchase).

## Carry-forward

1. **Task 10** re-runs this journey twice back-to-back (done here once as proof; the sweep re-runs
   it) plus the full layer suites — the journey is deterministic and teardown-idempotent.
2. **Task 7's GraphQL integration suite** can rely on the journey's honest-actor matrix: the
   wire-level anonymous/UNAUTHORIZED and non-applicant denials compose with the service-level
   denials proven here.
3. **Deferred-items ledger D4** (credit-skip hand-off) is reinforced, not changed: the journey
   proves NO lane credit and NO fabricated `students` row for the verification shape end-to-end.

## Bugs found in services

None. Both service halves (purchase, activation) behaved exactly per contract on every step,
including the exact activation window, the NULL-owner ledger decision, the credit-skip (no abort,
no fabricated rows), the cooldown/template expansion byte-equality, and both denial orders. No
deferred-items rows added (D1–D6 unchanged).

## Cross-file dependencies

- `VerificationPurchaseService.purchase` (`backend/services/teachers/verification-purchase.service.ts`)
  ← steps 2/4/5/6/7 (real service, real transactions, no `outerTx` — the production path).
- `ApplicantLifecycleService.assertCanPurchaseVerification` / `recordReapplication` (Task 2's
  contract) ← the in-tx guard + attempt increment the journey pins.
- `SubscriptionActivationService.processWebhookEvent` (`backend/services/billing/
  subscription-activation.service.ts`) ← step 3 (real webhook confirmation, no `outerTx`).
- `SubscriptionPurchaseService.listOwn` ← the owner-scoped read used for both-direction visibility.
- `createJourneyFixtures` / `journeyCleanup` (`test/workflows/helpers/journey-actor-fixtures.ts`,
  `journey-cleanup.ts`), `TrackedFixtures` (`tracked-fixtures.ts`),
  `withImmutabilityTriggersSuspended` (`test/helpers/db-cleanup.ts`), `catchJourneyError` +
  `journeyPrefix` (`journey-fixtures.ts`, `session-cast.ts`) ← the harness legs.
- `verification-purchase.service.test.ts` / `subscription-activation.service.test.ts` ← Task 10's
  full-sweep runs alongside this journey.
