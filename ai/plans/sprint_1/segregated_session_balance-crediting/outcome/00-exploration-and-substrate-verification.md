# 00 — Exploration & Substrate Verification (plan generation)

**Date:** 2026-09-11 · **Source:** 5-agent read-only exploration swarm + orchestrator spot-check verification of every load-bearing claim.

## Headline

The ticket's four acceptance criteria are **already implemented** in this tree (shipped via DEV1-006 purchase/activation, DEV3-004 session lifecycle, DEV3-012 dual confirmation). This plan's residual work = verify-with-evidence, close 4 gaps, ratify 4 semantic divergences. Do NOT re-implement any primitive below.

## Verified substrate (all re-read by the plan generator, not just agents)

| Fact | Evidence |
|---|---|
| 4 balance lanes + 4 `>= 0` CHECKs + trial columns | `backend/db/schema/students/students.ts:24-28,42-45` |
| `plans.balance_lane` nullable pgEnum `subscription_credit_lane` (hifz/tajweed/reviews) | `backend/db/schema/billing/plans.ts:29`; `backend/db/schema/enums.ts:65`; enum `backend/enum/billing/subscription-credit-lane.enum.ts:9-13` |
| Activation credit call, in activation tx | `backend/services/billing/subscription-activation.service.ts:393-400` |
| Fail-closed lane mapper | `subscription-activation.service.ts:224-242` (constants :209-211) |
| Credit primitive (single guarded statement, COALESCE) | `backend/db/repo/students/student.repository.credit-lane.helpers.ts:108-120`; wrapper `student.repository.ts:531-538` |
| Guarded debit `balance > 0` + refund `+1` | `student.repository.ts:478-493, 507-516` |
| Trial-first ladder + INSUFFICIENT_BALANCE throw | `backend/services/classes/session-lifecycle.booking.ts:95-116` |
| `createSession` public entry (tx seam) | `backend/services/classes/session-lifecycle.service.ts:196-215` |
| Hold consume (no second debit) / same-lane refund | `session-lifecycle.confirmation.ts:112-138` / `session-lifecycle.transitions.ts:222-237` |
| 422 taxonomy anchor (`VALIDATION → 422`) | `backend/lib/errors/error-code-taxonomy.ts:41-51` |
| i18n key `insufficientBalance` | type `shared/locale/types/errors/labels.ts:174`; en `shared/locale/en/errors/index.ts:85`; ar `shared/locale/ar/errors/index.ts:84` |
| Purchase NULL-lane fail-closed (`PLAN_LANE_UNCONFIGURED`) | `backend/services/billing/subscription-purchase.service.ts:272-278` |
| Invariants INV-B1..B8 (decision refs) | `docs/specs/state-machine-invariants.md:145-152` |
| FR-2.4/FR-2.5 text | `docs/specs/functional-requirements.md:62-70` |
| PRODUCTION_READINESS §5.3 boxes (unchecked) | `docs/planning/PRODUCTION_READINESS.md:243-248` |

## The four gaps this plan closes

1. **G1** No service-level Tajweed-lane credit test (author note claims hifz/tajweed byte-identical — `subscription-activation.service.test.ts:39`) → Task 2.1.
2. **G2** No Tajweed leg in the purchase journey (`test/workflows/billing/subscription-purchase.journey.test.ts` covers hifz :506-545 + reviews :765-813) → Task 2.2.
3. **G3** No GraphQL-transport pin for `INSUFFICIENT_BALANCE` (zero hits in `backend/graphql/test/`) → Task 2.3.
4. **G4** `db/schema.dbml` drift: students table (:218-231) lacks `balance_trial`/`trial_granted_at`/4 CHECKs; `plans` (:277-288) lacks `balance_lane`; `subscriptions_payment_reference_unique` index not shown → Task 3.1.

## The four ratified divergences (details: plan.md §1.3)

- **D1** debit timing: hold-as-debit at request = ticket's "decrement on attendance" (net −1 identical).
- **D2** reviews lane credit-only (never funds holds; `held-balance-lane.enum.ts:17-31`).
- **D3** "422" = VALIDATION family; GraphQL clients read `extensions.code`.
- **D4** eligibility = `(intent lane > 0) OR (trial > 0)` (INV-B4/B8).

## Test-infra facts (verified)

- `runInRollback` at `backend/db/test/test-utils.ts:34`; `expectRepoError` :77; `constraintNameOf` :111.
- Entity helpers: `createTestUser(:72)`, `createTestStudent(:102, lanes default 0)`, `createTestPlan(:178, balanceLane override)`, `createTestSubscription(:220)`, `createTestStudentPayment(:262)`, `createTestSession(:301)`, `createTestTeacherRow(:522)` — all in `backend/db/test/entity-setup.ts`.
- Workflows layer rules: `test/workflows/AGENTS.md` (no runInRollback; tracked cleanup; `jrn_<domain>_<8hex>` prefixes; cast helpers incl. per-lane funding profiles).
- **Stale-doc warning (deferred item D2):** `backend/db/test/AGENTS.md` and `.agents/instructions/tests.instructions.md` mention helpers `setupStudent`/`createTestTeacher` that DO NOT exist — trust `entity-setup.ts` itself.
- `backend/db/repo/students/__tests__/student-lane-debit.test.ts` sits outside `backend/db/test/` — runs via global test/run-test.ts, NOT `test:db`.

## Carry-over for executors

- Do not "fix" debit timing, trial-first order, or reviews-credit-only behavior — ratified (D1/D2/D4). Deviation = plan violation.
- The `/subscriptions` nav entry is an intentional ComingSoon stub; no student balance UI is part of this ticket.
- `docs/sessions/session-lifecycle.md` and `docs/billing/subscription-purchase.md` are the canonical neighbors; read both before touching tests for Tasks 2.2/2.3.
