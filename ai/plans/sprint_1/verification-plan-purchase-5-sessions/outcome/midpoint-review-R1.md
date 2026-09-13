# Mid-Point Backend Review Gate — Round 1 (Task 8)

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions` (baseline `96078b8` → HEAD `da0805b` + review fixes)
**Scope reviewed**: `git diff 96078b8..HEAD` minus `ai/plans/**` — 29 files (schema, repos, services, activation, mutation, barrels, shared constants/locale, and the Tasks 1-7 test files including the journey test).
**Method**: three sequential review lenses (review-backend, review-types, error/i18n spot-check) over the full diff, each checked against the printed rule files (`AGENTS.md` root/backend/services/repo/graphql), `specs.md` REQ-1..REQ-9, and `plan.md` §4.3/§4.4/§4.5 + §5.3/§5.4.

## Lens A — review-backend (architecture, TOCTOU, error semantics)

| # | Severity | Location | Finding | Status |
|---|----------|----------|---------|--------|
| A1 | MEDIUM | `backend/services/teachers/verification-purchase.service.ts` (`purchaseInTx`) | Missing IN-TRANSACTION governance re-assertion. The mirrored sibling flow re-asserts `assertActorGovernanceClean` inside the purchase transaction (`subscription-purchase.service.ts:419-423`, pinned by its "a caller suspended during checkout → forbidden denial, zero writes" test) because the pre-checkout check read the actor BEFORE the gateway round-trip. The verification flow asserted governance only pre-checkout, so a suspension/block landing during checkout committed the pending pair (the student spine rolls the same caller's pair back). | **FIXED** — `await assertActorGovernanceClean(applicantUserId, t, tx)` added inside `purchaseInTx` after the checkout-value re-comparison, before the claim insert; docblocks updated; mirrored test added. |
| A2 | MEDIUM | `backend/services/teachers/verification-purchase.service.ts` (`purchaseInTx` plan re-validation) | Missing checkout-value re-comparison. The sibling flow re-compares the fresh in-transaction plan row against the price/currency the checkout was minted with (`assertPlanUnchangedSinceCheckout`) — committing a mismatched pair is "a settlement guaranteed to quarantine" (webhook amount ≠ stored amount → permanent activation quarantine, burned claim key, applicant stuck `in_evaluation` with a pending pair). The verification flow re-validated only the ACTIVE state, so a mid-checkout price/currency change committed the quarantined pair. | **FIXED** — pre-checkout `plan.price`/`plan.currency` are now captured and re-compared in-transaction by a mirrored `assertPlanUnchangedSinceCheckout` helper (`PLAN_PRICE_CHANGED` field payload, thrown before ANY row write); docblocks updated; mirrored test added. |
| A3 | LOW | `backend/services/billing/subscription-activation.service.ts` (`applyPurchaserLaneCredit` neither-row branch) | The corrupt-purchaser abort reuses the vanished-student detail string ("student row vanished before the lane credit"). | **FILTERED** — plan §4.4 prescribes exactly this detail for BOTH branches (verbatim); the detail is internal-only (the client receives the generic `ConflictError` copy), and the correlated log context (`studentId`) disambiguates. |
| A4 | LOW | `verification-purchase.service.ts` (log contexts) | Two `logDomainError` calls omit `locale` while a third includes it. | **FILTERED** — byte-for-byte mirror of the sibling service's identical omissions (same sites, same context shape); consistency with the mirrored contract, not a defect. |
| A5 | LOW | `verification-purchase.service.ts` (no lane/ceiling gates in-tx) | The student flow's `assertPurchasablePlan` lane/interval/session-count ceilings are absent from the verification flow. | **FILTERED** — plan §4.3 specifies the lighter check for verification; the lane credit never fires for verification purchases (activation skips it), so the overflow/quarantine exposure those gates close is not reachable on this surface. |
| A6 | LOW | journey step 7 | A non-applicant foreign caller replaying a spent key surfaces `APPLICANT_NOT_FOUND` (guard order) rather than `PAYMENT_NOT_FOUND`. | **FILTERED** — documented fail-closed ordering (guard runs in-tx before the claim arbiter); the honest non-applicant denial must not leak claim existence; `PAYMENT_NOT_FOUND` is reachable for the applicant-shaped foreign caller, which is exactly the journey's cast. |

Structural checks that passed (no findings): purchase write order matches plan §4.3 a-i exactly (plan re-read → guards → claim → applicant read → subscription → payment → attempt increment → guarded flip → backfill); gateway checkout strictly pre-tx; 23505 savepoint discipline (only `isPgUniqueViolation` caught, replay-by-throwing, foreign key oracle-safe `PAYMENT_NOT_FOUND`); guarded single-statement `transitionToInEvaluation` (state folded into WHERE + RETURNING, zero-row = null signal); activation probe order students-first with the both-rows pin; error codes consistent with the student spine (`APPLICANT_NOT_FOUND`, `PLAN_NOT_FOUND`, `DUPLICATE_REQUEST`, `PAYMENT_NOT_FOUND`, `VALIDATION`, `APPLICANT_COOLDOWN_ACTIVE`, `APPLICANT_ALREADY_CERTIFIED`); single-writer discipline (repos via the canonical barrel; lifecycle service remains the sole applicant writer); no cross-layer imports (shared → backend direction only; no `@/frontend`/`@/app` in any backend/shared file); no `console.*`; no module state; no dead branches; no plan-artifact references in code (grep-verified over the whole diff scope).

## Lens B — review-types (canonical types, imports, enums, schema/type alignment)

| # | Severity | Location | Finding | Status |
|---|----------|----------|---------|--------|
| B1 | — | — | No findings. | — |

Verified clean: zero duplicate type definitions (payment types remain pure `$inferSelect`/`$inferInsert` derivations; `StudentPaymentReturnType` composes via `Omit` + enum re-typing); no local types in the mutation (payload object reused, zero type declarations in the resolver file); `@/` alias discipline everywhere (deep import for the shared constants matches the root/shared AGENTS deep-import preference; repos/services reached through canonical barrels; `DBTransaction` from `@/backend/types` only); enums as VALUE imports at every runtime site (`ApplicantStatus`, `PaymentStatus`, `SubscriptionStatus`, `UserRole`, `RegisterPublicRole` from the generated module); schema/type alignment for the nullable owner (`StudentPaymentInsertType.studentId?: number | null` auto-widened; `insertPayment` contract unchanged; the service return mapping carries `studentId: createdPayment.studentId` so the `number | null` flows through `PurchaseSubscriptionReturnType`); no `StudentPaymentSelectType` consumer assumes non-null (Pothos object does not expose `studentId`; admin analytics projects no owner column).

## Lens C — error/i18n spot-check

| # | Severity | Location | Finding | Status |
|---|----------|----------|---------|--------|
| C1 | — | — | No findings. | — |

Verified clean: `errors.applicantAlreadyCertified` present in `shared/locale/types/errors/labels.ts` (typed slot, no-placeholder JSDoc) + `shared/locale/en/errors/index.ts` + `shared/locale/ar/errors/index.ts` + the `errors-namespace.parity.test.ts` pin (the `ErrorMessageKey` annotation is the compile-time flatness proof); every new domain rejection resolves a localized message (`t.applicantAlreadyCertified`, `t.applicantNotFound`, `t.applicantCooldownActive` template expansion, `t.subscriptionPurchase.idempotencyKeyRequired`/`planNotPurchasable`/`paymentReferenceConflict`, `t.notFound`, `t.duplicateRequest`, `t.validation`); invariant breaches throw client-safe generic copy (`"Purchase could not be processed."`, `"Payment could not be processed."`) with the breach detail on the correlated log line only; the mutation rethrows every DomainError UNCAUGHT (no try/catch — masking boundary intact); idempotency-key material never logged; no raw server messages leaking beyond the already-localized server copies (the mutation's `UnauthorizedError("Authentication required.")` mirrors the `authenticated` scope's own denial verbatim — established sibling pattern, 401-channel parity).

## Fix summary

- `backend/services/teachers/verification-purchase.service.ts`:
  1. Added the in-transaction governance re-assertion (A1).
  2. Added `assertPlanUnchangedSinceCheckout` + checkout price/currency capture/threading (A2).
  3. Extracted the payload composition into `toPurchasePayload` (root-cause fix for the oxlint `max-lines-per-function` ceiling the new in-tx checks pushed past — no lint suppression; mirrors the student flow's row-mapping discipline).
  4. Module header stage 4, `purchaseInTx` docblock, and `purchase` JSDoc updated to narrate the two added in-transaction gates truthfully.
- `backend/services/teachers/verification-purchase.service.test.ts`:
  1. NEW "a plan price changed during checkout → PLAN_PRICE_CHANGED validation denial, zero writes" (asserts the `planId` field payload, zero pair/claim rows — key not burned).
  2. NEW "a caller suspended during checkout → forbidden denial, zero writes" (suspension flips during the checkout seam; FORBIDDEN + zero rows).
  3. `ForbiddenError`/`ValidationError` added to the errors import.

**Totals**: 6 findings raised — 2 MEDIUM fixed, 4 LOW filtered (each plan-conformant or a documented sibling-mirror posture); Lens B and Lens C returned zero findings.

## Re-verification results

| Check | Result |
|---|---|
| Sub-loop `--lifecycle duplicates` — `verification-purchase.service.ts` | **exit 0** (tsgo → oxlint → biome → lint:type-aware → duplicates; one intermediate oxlint `max-lines-per-function` failure fixed by the `toPurchasePayload` extraction, then re-run clean) |
| Sub-loop `--lifecycle duplicates` — `verification-purchase.service.test.ts` | **exit 0** |
| `bun run test/scripts/run-test.ts backend/services/teachers/verification-purchase.service.test.ts` | **17 pass / 0 fail / 1 skip** (127 expect calls; the skip is the pglite-gated concurrency case; +2 new tests over Task 5's 15) |
| `bun run test/scripts/run-test.ts backend/db/test/repo/teachers/applicant.repository.transition.test.ts` | **13 pass / 0 fail** (69 expect calls) |
| `bun run test/scripts/run-test.ts backend/services/billing/subscription-activation.service.test.ts` | **26 pass / 0 fail / 1 skip** (229 expect calls) |
| `bun run test/scripts/run-test.ts backend/db/test/logic/billing/student-payment.repository.test.ts` | **10 pass / 0 fail** (77 expect calls) |
| `bun run test/scripts/run-test.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts` (regression — the journey exercises the edited service) | **7 pass / 0 fail** (126 expect calls) |
| `bun tsgo` (project-wide) | **0 errors** (baseline 0) |
| `bun biome:check` (project-wide) | **0 warnings** ("Checked 1799 files … No fixes applied") |

## Final verdict

**ZERO unfixed findings remain.** Both MEDIUM TOCTOU gaps in the verification purchase transaction are closed with mirrored tests; the four LOW observations are filtered with recorded rationale (plan-prescribed wording / sibling-mirror consistency / documented denial ordering). The Tasks 1-7 backend surface is architecture-compliant per the AGENTS rule files, satisfies plan §4.3/§4.4/§4.5 and the REQ error contracts, and the full scoped verification stays green. Backend review gate: **PASSED**.
