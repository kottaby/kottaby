# Task 5 — `VerificationPurchaseService.purchase` (turns the journey green for purchase)

- **Date:** 2026-09-14
- **Branch:** `feat/verification-plan-purchase-5-sessions`
- **Requirements:** REQ-2.5, REQ-1.2, REQ-3, REQ-4, REQ-8.2 · **Design:** plan.md §4.3 (binding 8-step flow), §5.4 (concurrency table), D5/D9 · **Spec:** specs.md REQ-3/REQ-4/REQ-9

## Summary of what was implemented

1. **Guard extraction FIRST (anti-duplication mandate):**
   - **CREATE `backend/services/billing/purchase-guards.helpers.ts`** — `isPositiveSafeId` and `isCarryableIdempotencyKey` promoted VERBATIM from the module-private copies in `subscription-purchase.service.ts` (logic byte-identical, docblocks carried over; `MAX_IDEMPOTENCY_KEY_LENGTH = 128` moved with the key guard — it had exactly one consumer). Module docblock states the shared-boundary purpose; zero imports.
   - **UPDATE `backend/services/billing/subscription-purchase.service.ts`** — the two private functions + the constant deleted; single new import from the new module (`@/backend/services/billing/purchase-guards.helpers`, placed in the file's alphabetical import block). NOTHING else changed — `PAYMENT_PROCESSING_CONFLICT_MESSAGE`, all mappers, the whole flow untouched (proven by the 21/21 green regression suite). The helpers module follows the `plan-catalog.helpers.ts` precedent: deep-imported by consumers, deliberately NOT added to the billing barrel (keeps the two generic guard names off the public services surface).
2. **CREATE `backend/services/teachers/verification-purchase.service.ts`** per plan.md §4.3 EXACTLY — `export namespace VerificationPurchaseService` with the pinned signature `purchase(applicantUserId: number, idempotencyKey: string | null, locale: string, outerTx?: DBTransaction): Promise<PurchaseSubscriptionReturnType>`. Flow, step-for-step mirror of `subscription-purchase.service.ts`:
   - **1-4 (pre-DB boundary):** `t = getServerTranslations(locale).errorsTranslations` → `isPositiveSafeId` else `ValidationError(t.validation)` → `assertActorGovernanceClean(applicantUserId, t, outerTx)` (same import as DEV1-006: `@/backend/services/classes/session-lifecycle.governance`) → `isCarryableIdempotencyKey` else `logDomainError("Verification purchase rejected: idempotency key required", {code:"VALIDATION", entity:"users", entityId})` + `ValidationError(t.subscriptionPurchase.idempotencyKeyRequired)`. The key is NEVER logged.
   - **5 (plan resolve):** `PlanRepository.listActive(outerTx)` → `find(candidate => candidate.title === VERIFICATION_PLAN_TITLE)` (deep import of `@/shared/constants/verification-plan.constants`); missing → `logDomainError` (`PLAN_NOT_FOUND`, entity `plans`, resolution key as the correlated entityId) + `NotFoundError("PLAN", t.subscriptionPurchase.planNotPurchasable)` — before the gateway call and before any write.
   - **6 (gateway pre-tx):** `getPaymentGateway(locale).createCheckout({ studentId: applicantUserId, planId: plan.id, amount: plan.price, currency: plan.currency })` — identical field mapping to the student service; the applicant's user id rides the generic purchaser slot (`PaymentCheckoutInput.studentId`).
   - **7 (ONE tx via `withTransaction(outerTx, tx => purchaseVerificationInTx(...))`), in the prescribed order:**
     a. authoritative re-read `PlanRepository.findActiveById(plan.id, tx)`; gone → `NotFoundError("PLAN", …)`;
     b. `ApplicantLifecycleService.assertCanPurchaseVerification(applicantUserId, locale, tx)` — BEFORE any write (TOCTOU closure; import is the relative sibling, avoiding a barrel cycle);
     c. `insertClaimOrReplay` — `SubscriptionPurchaseIdempotencyRepository.insertClaim({idempotencyKey, userId}, claimTx)` inside `tx.transaction(...)` (the DEV1-006 savepoint discipline); 23505 → `replayPurchaseOrThrow` (claim lookup: key owned by ANOTHER caller → `logDomainError` + oracle-safe `NotFoundError("PAYMENT", t.notFound)`; same caller/vanished claim → `ConflictError("DUPLICATE_REQUEST", t.duplicateRequest)`), non-23505 rethrown untouched;
     d. `ApplicantRepository.findByUserId(applicantUserId, tx)` — non-null beyond this point (the guard just proved it in the same tx); a null is the internal-invariant breach → correlated `logger.error` + fail-closed `ConflictError` on the client-safe copy (the established unreachable-value posture);
     e. `SubscriptionRepository.insertSubscription({ userId, planId, paymentMethod: checkout.provider, paymentReference: checkout.providerReference }, tx)` — DEV1-006 row-builder shape (status defaults to `pending` at the DB), with the reference-collision translation (23505 → `ConflictError(t.subscriptionPurchase.paymentReferenceConflict)`, raw driver error never escapes);
     f. `StudentPaymentRepository.insertPayment({ studentId: null, subscriptionId, amount: plan.price, currency: plan.currency, paymentGateway: checkout.provider }, tx)` — NULL owner by contract; the student-junction insert deliberately NOT performed;
     g. `if (applicant.status === ApplicantStatus.Failed) await ApplicantLifecycleService.recordReapplication(applicantUserId, locale, tx)` — attempt increment only on re-application from `failed` (D7);
     h. `await ApplicantRepository.transitionToInEvaluation(applicantUserId, tx)` — zero-row ⇒ already `in_evaluation` ⇒ silent no-op (D5/REQ-4.5);
     i. `SubscriptionPurchaseIdempotencyRepository.updateClaimSubscriptionId(claim.id, createdSubscription.id, tx)`.
   - **8 (return):** `{ subscription, payment, checkout }` composed FIELD-BY-FIELD (never spread) with the enum contract made explicit (`status: SubscriptionStatus.Pending`, `paymentMethod: checkout.provider`; `status: PaymentStatus.Pending`, `paymentGateway: checkout.provider`) — the ReturnType conversion rule honored without casts.
   - Disciplines: rejections are uncaught DomainErrors; `logDomainError` exactly-once at each throw site with `{code, entity, entityId}` context (locale added where the flow owns it); enums (`ApplicantStatus`, `PaymentStatus`, `SubscriptionStatus`) are VALUE imports; module state limited to two `const` strings; `logger` from `@/backend/lib/logger` (zero `console.*`); clean domain docblocks — ZERO plan-artifact references anywhere in the code.
3. **Barrel export:** `backend/services/teachers/index.ts` gained `export * from "./verification-purchase.service";` — the top `@/backend/services` barrel already re-exports the teachers directory (verified: no further barrel edit needed). The journey's deep import keeps working unchanged.
4. **5.TE — CREATE `backend/services/teachers/verification-purchase.service.test.ts`** (13 tests, 4-Tier, mirroring `subscription-purchase.service.test.ts` patterns: `runInRollback` + `outerTx` propagation to every service call, entity-setup fixtures only, `expectRepoError` for denials, the `spyOn(MockPaymentGatewayAdapter.prototype, "createCheckout")` seam, a SUITE-LOCAL `expectDomainDenial` helper — not imported from anywhere; `rejectionCode`/`t()`/`purchaseKey()` helpers mirrored):
   - **Tier 1:** happy path (pending pair with `payment.studentId === null`, ZERO junction rows, flip `pending → in_evaluation` with `verificationAttempts === 0` and `lastAttemptAt === null`, claim keyed verbatim + backfilled with the subscription id, mock checkout `mock_`-prefixed reference + `checkoutUrl === null`, amount `"150.00"` decimal-string); cooldown-active → `APPLICANT_COOLDOWN_ACTIVE` (template fully expanded via the sliced-anchor pattern, no `{cooldownUntil}` residue) + zero writes + applicant row untouched; expired cooldown + `failed` → attempts `+1` + flip + `lastAttemptAt` stamped; `passed` → `APPLICANT_ALREADY_CERTIFIED` (byte-equal translated copy) + zero writes; non-applicant (plain user) → `APPLICANT_NOT_FOUND` + zero writes; missing (`null`) AND empty (`""`) keys → `VALIDATION` (`idempotencyKeyRequired`) + zero writes; no active plan with the canonical title (environment-proofed by an in-tx deactivation of any same-title row) → `PLAN_NOT_FOUND` + zero writes; repeat purchase from `in_evaluation` with a fresh key → second pair, flip silent no-op, attempts still 0.
   - **Tier 2:** same-caller replay → `ConflictError` `DUPLICATE_REQUEST` with counts pinned at 1/1/1 and the claim still pointing at the FIRST purchase; key spent by ANOTHER caller → oracle-safe `PAYMENT_NOT_FOUND` (`t().notFound`), no owner-id/email leak, attacker zero-writes, PLUS the logging-contract pin: a recording stub over `logger.logDomainError` proves the denial is logged AND no log line carries the idempotency-key material.
   - **Tier 3:** gateway outage at the pre-transaction boundary (checkout spy throws) → zero rows, raw (non-Domain) error; concurrent double-submit on the SAME key through `Promise.allSettled` on the production transaction path (committed fixtures in `beforeAll` + full FK-safe `afterAll` hard-delete incl. the NULL-owner payment leg under `withImmutabilityTriggersSuspended(["student_payments"])` addressed through the subscription linkage, with zero-residue re-probes) → exactly one success, exactly one `ConflictError` `DUPLICATE_REQUEST`, exactly ONE pair + backfilled claim + single flip — gated by `testOnRealPostgres = isPgliteProvider() ? test.skip : test` exactly like the sibling suite (it RAN here: this environment is real PostgreSQL).
   - **Tier 4:** unicode fuzz — RTL/CJK/emoji-named applicants; cooldown denial asserted in BOTH locales (distinct expansions, prefix/suffix anchors per locale, zero placeholder residue, zero name/id leakage) and the certified denial byte-equal per locale against the typed bundles; zero writes for both.

## Files created/modified

| File | Change |
|---|---|
| `backend/services/billing/purchase-guards.helpers.ts` | **CREATE** — the two shared purchase-boundary guards (verbatim promotion) + key-length constant |
| `backend/services/billing/subscription-purchase.service.ts` | private guard copies + constant removed; import from the new module (behavior-preserving extraction, nothing else touched) |
| `backend/services/teachers/verification-purchase.service.ts` | **CREATE** — the 8-step verification purchase flow per plan §4.3 |
| `backend/services/teachers/index.ts` | + one barrel line (`export * from "./verification-purchase.service";`) |
| `backend/services/teachers/verification-purchase.service.test.ts` | **CREATE** — 13-test 4-Tier suite |

**Files NOT modified (deliberately):** `test/workflows/teachers/verification-plan-purchase.journey.test.ts` (Task 4's file — READ-ONLY here; the compile gate landed purely because the missing module now exists), `backend/services/billing/subscription-activation.service.ts` (Task 6's file — untouched, the journey still fails its activation step by design), `backend/db/repo/**` (every repo fn consumed already exists — `listActive`, `findActiveById`, `findByUserId`, `transitionToInEvaluation`, `recordVerificationAttempt`, `insertSubscription`, `insertPayment`, `insertClaim`, `updateClaimSubscriptionId`, `findByKey`), `backend/services/billing/index.ts` (helpers modules are deep-imported per the `plan-catalog.helpers` precedent — the generic guard names stay off the public barrel), `shared/**`, all GraphQL/frontend files (Task 7/9 surface).

## Verification results

### Sub-loop (`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`) — 6/6 exit 0

| File | Result |
|---|---|
| `backend/services/billing/purchase-guards.helpers.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `backend/services/billing/subscription-purchase.service.ts` | exit 0 — all five stages ✅ (extraction left the student service clean) |
| `backend/services/teachers/verification-purchase.service.ts` | exit 0 — all five stages ✅ (incl. intra-file jscpd: zero clones) |
| `backend/services/teachers/index.ts` | exit 0 — all five stages ✅ |
| `backend/services/teachers/verification-purchase.service.test.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates (auto-skip, `*.test.ts`) ✅ |

Two mid-task tsgo errors on the test file found and fixed (bun's `mock.calls` elements ARE the arg tuples — no `.args`; the chaos helper's return type narrowed to the imported `PurchaseSubscriptionReturnType`). Printed rule files read per run: root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`, `.agents/instructions/backend.instructions.md` (and `tests.instructions.md` for the test file).

### tsgo final count

`bun tsgo` (full project) → **0 errors** (baseline 0 preserved).

### Test runs (exact commands + counts)

| Command | Result |
|---|---|
| `bun run test/scripts/run-test.ts backend/services/teachers/verification-purchase.service.test.ts` | **13 pass / 0 fail** (134 expects) — new suite; the concurrency race test EXECUTED (this environment is real PostgreSQL, not the pglite shim) |
| `bun run test/scripts/run-test.ts backend/services/billing/subscription-purchase.service.test.ts` | **21 pass / 0 fail** (150 expects) — full regression: the guard extraction changed nothing (all pre-existing cases green, incl. the 128/129 key boundary that pins `isCarryableIdempotencyKey`'s behavior) |

### Journey compile gate (Task 4 file — READ-ONLY)

`bun run scripts/health/sub-loop.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts --lifecycle duplicates` → **exit 0** — tsgo ✅ (the single TS2307 `Cannot find module '@/backend/services/teachers/verification-purchase.service'` is gone) → oxlint ✅ → biome ✅ → lint:type-aware ✅ → duplicates (auto-skip) ✅. **4.QL flipped to [x]** in tasks.md per the Task-4 deferral note. The journey may still FAIL at runtime until Task 6's activation credit-skip lands — expected, not touched.

## 5.SEC — Security review conclusion

**BOLA:** identity is the plain `applicantUserId` constructor argument — the Task-7 resolver passes `ctx.user.id`; no other identity source exists and no id-addressed read was added. **BOPLA:** the surface has NO input object at all (zero client-owned fields); plan identity is resolved server-side by the shared title constant, and amount/currency are carried verbatim from the DB plan row — money is never client-derived (pinned by the amount assertions). **BFLA:** the service-level applicant gate (`assertCanPurchaseVerification` in-tx, after the governance gate) rejects every non-applicant role with `APPLICANT_NOT_FOUND` before any write — the surface grants nothing beyond self-purchase; the non-applicant and foreign-replay probes pin both denials through the real path. **No key material in logs:** the key never enters any log call on the service or the guards module; the Tier-2 test mechanically pins it (recording stub over `logDomainError`, every captured call serialized and asserted key-free). The foreign-replay denial is oracle-safe (`PAYMENT_NOT_FOUND` + generic `t.notFound` copy, no owner identifiers — test-pinned). Governance (deleted/blocked/suspended) is denied pre-DB via the shared `assertActorGovernanceClean`.

## 5.SR — Semantic review checklist

- **Atomicity:** every write (claim → subscription → payment → attempt increment → flip → claim backfill) lives in the ONE `withTransaction` body; the lifecycle guard runs inside that transaction BEFORE any write (TOCTOU closed per plan §5.4); a failure at any step rolls the whole purchase — claim included — back (a failed purchase never burns its key).
- **Gateway boundary:** the checkout is strictly pre-transaction (network call never holds a tx open); the pre-checkout plan read only feeds the gateway input — the authoritative re-read happens in-tx (a plan deactivated mid-checkout fails the purchase with zero writes).
- **No module state:** two module-level string constants only; no env additions; no caches.
- **Enums as VALUE imports:** `ApplicantStatus` / `PaymentStatus` / `SubscriptionStatus` compared/applied at runtime through member identity; no string literals for any enum-carried value.
- **No dead branches:** every branch is reachable and test-covered (happy, cooldown, expired+failed, passed, non-applicant, missing key, missing plan, replay same-caller, foreign key, reference collision, in-tx plan-gone, null-applicant fail-closed, failed-only reapplication, silent no-op flip); the null-applicant guard is the documented fail-closed posture for an impossible state, not dead code.
- **Return composition:** field-by-field with explicit enum re-application — never a spread, never a cast.
- **No plan-artifact references in code/JSDoc:** verified — all docblocks describe the domain flow only; no `console.*`, no `oxlint-disable`, no `any`.

## 5.IV — Instruction verification

Rule files read (printed by the sub-loops): root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`, `.agents/instructions/backend.instructions.md`, plus `backend/db/repo/AGENTS.md` (repo contracts consumed) and the test-file print's `tests.instructions.md` conventions. Validation per rule:

- **backend/AGENTS.md:** types from `@/backend/types` for every signature; no service-layer `.types.ts`; `DBTransaction` imported from `@/backend/types`; ReturnType conversion done through an owned field-by-field mapping (no casts); `logger` only (no `console.*`).
- **backend/services/AGENTS.md:** domain service (not monolithic); all user-facing strings via one-arg `getServerTranslations(locale)` + property access; single-writer discipline honored — the composed write accepts the caller's `outerTx` as the FINAL parameter; duplicates arbitrated by the claim table's UNIQUE constraint with the 23505 cause-chain translation (never a pre-check SELECT); shared helpers extracted instead of duplicated (the very purpose of the guards module); service tests use real repos against the test DB with the gateway seam mocked — no external API calls.
- **backend/db/repo/AGENTS.md:** repos consumed through the `@/backend/db/repo` barrel; no repo file touched; guarded-transition zero-row semantics consumed correctly (null = silent no-op, never an error).
- **backend.instructions.md:** 6-layer data flow respected (service orchestrates repos only); business logic and permission gating in the service tier; locale propagated as a parameter; SSR-compatible (no GraphQL context dependency); no nested ternaries.
- **tests.instructions.md / db-test rules:** sanctioned runner only; `runInRollback` + `tx` propagation; `expectRepoError` (zero `.rejects.toThrow()`); entity-setup helpers only; committed fixtures confined to the concurrency block with tracked, zero-residue-probed `afterAll` hard-deletes; environment gate (`isPgliteProvider`) mirrors the sibling suite; bun:test imports only; suite-local `expectDomainDenial` (no cross-file helper import).

## Carry-forward knowledge for future tasks

- **Task 6 (activation credit-skip):** the journey's step 3 still fails at runtime until `subscription-activation.service.ts` (~:393-408) replaces the unconditional `creditLaneBalance` + abort with the students-first probe. Everything UP TO that step now passes at the service layer: the purchase pair exists with `studentId === null`, the claim is backfilled, and the applicant is `in_evaluation`.
- **Task 7 (mutation):** call `VerificationPurchaseService.purchase(ctx.user.id, ctx.idempotencyKey ?? null, ctx.locale)` — NO outerTx (production path); the service export is reachable via `@/backend/services` (barrel) or the deep path the journey uses.
- **The in-tx guard ordering is binding:** plan re-read → lifecycle guard → claim → pair → attempts → flip → backfill. The guard BEFORE the claim insert is what makes a cooldown-active replay burn nothing; the claim BEFORE the pair insert is what makes the replay classification possible.
- **`listActive` ordering caveat (shared with Task 4's journey):** the title match relies on the seeder/journey fixture carrying the canonical title; `plans.title` has no unique constraint, so resolution picks the oldest active same-title row (`created_at ASC`). Both consumers resolve service-identically, so fixture row and charged row always agree.
- **Environment note:** this environment runs REAL PostgreSQL (`kottaby_db`), so `isPgliteProvider()`-gated tests EXECUTE here (the concurrency race ran and passed); on a pglite shim the same test self-skips.
- **Billing barrel posture:** `purchase-guards.helpers.ts` is deliberately NOT re-exported by `backend/services/billing/index.ts` (the `plan-catalog.helpers` precedent) — if a third consumer ever appears, import it deep.

## Cross-file dependencies discovered

- **`backend/services/teachers/verification-purchase.service.ts` ↔ `test/workflows/teachers/verification-plan-purchase.journey.test.ts`:** the journey compiles against the exact export shape pinned in outcome 4 (namespace + signature); compile gate landed this task (4.QL flipped). Runtime green still blocked ONLY by Task 6's activation branch.
- **`backend/services/billing/purchase-guards.helpers.ts` ↔ `subscription-purchase.service.ts` / `verification-purchase.service.ts`:** single source for both boundary guards; the student suite's 128/129 boundary test is the behavioral pin for the shared key guard.
- **`backend/services/teachers/applicant-lifecycle.service.ts` (Task 2 surface):** consumed in-tx for both the guard and the re-application increment; its branch order (cooldown before certified) and its translated keys (`applicantNotFound`, `applicantCooldownActive`, `applicantAlreadyCertified`) are pinned by tests on both sides.
- **`shared/constants/verification-plan.constants.ts` (Task 3 surface):** the server-side resolution key; the compile-time `as const` pin guarantees the service's `find(title === VERIFICATION_PLAN_TITLE)` never drifts from the seeder.
- **None else.** No repo/schema/type file required changes; the top services barrel already surfaced the teachers directory before this task.
