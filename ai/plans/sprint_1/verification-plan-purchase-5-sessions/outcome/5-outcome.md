# Task 5 — `VerificationPurchaseService.purchase` — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Environment**: sandbox, `DB_PROVIDER=pglite` (in-process PG, data dir `./db/pglite`)

## Summary

Teacher applicants can now purchase the platform-owned verification plan through the SAME
money spine as student purchases. `VerificationPurchaseService.purchase(applicantUserId,
idempotencyKey, locale, outerTx?)` composes the full §4.3 flow: pre-DB guards → governance
assertion → server-side plan resolution by canonical title → gateway checkout OUTSIDE the
transaction → ONE atomic transaction (active-plan re-validation → in-tx lifecycle guard →
savepoint-bracketed idempotency claim → pending `subscriptions` row → pending
`student_payments` row with `studentId: null` → re-application attempt increment for
`failed` re-appliers → guarded `pending|failed → in_evaluation` flip → claim backfill) →
`{ subscription, payment, checkout }` composed field-by-field.

As a mandatory precursor, the two purchase guards (`isPositiveSafeId`,
`isCarryableIdempotencyKey`) were PROMOTED out of `subscription-purchase.service.ts` into
the new shared `backend/services/billing/purchase-guards.helpers.ts` — both purchase services
now import the SAME predicates (no verbatim copies; jscpd-safe), with 100% behavior
preservation proven by the untouched student suite (20 pass / 0 fail).

## Files created

| File | Content |
|---|---|
| `backend/services/billing/purchase-guards.helpers.ts` | **CREATE** — the shared pre-transaction purchase guards: `isPositiveSafeId(value: number): boolean` (positive safe-integer identity check, no casts) and `isCarryableIdempotencyKey(key: string | null): key is string` (present, non-empty, ≤ the claim column's 128-char ceiling; never trimmed). `MAX_IDEMPOTENCY_KEY_LENGTH = 128` moved here as a module-private backstop (it had no other consumer). Domain JSDoc only. |
| `backend/services/teachers/verification-purchase.service.ts` | **CREATE** — `export namespace VerificationPurchaseService` with `purchase` (exact exported signature below). Mirrors `subscription-purchase.service.ts` step-for-step: `replayPurchaseOrThrow` (same-caller duplicate → `ConflictError("DUPLICATE_REQUEST", t.duplicateRequest)`; foreign-caller claim → `NotFoundError("PAYMENT", t.notFound)` = `PAYMENT_NOT_FOUND`, oracle-safe, no owner identifiers), `insertClaimOrReplay` (savepoint-bracketed via `tx.transaction`; only `isPgUniqueViolation` caught, everything else bubbles so the whole purchase rolls back), `insertPendingSubscription` (gateway descriptor verbatim; reference collision → localized `ConflictError`, raw driver error never escapes), `purchaseInTx` (the fixed write order). The applicant row read inside the tx is non-null by construction (the in-tx guard just proved it on the SAME transaction); a null there is failed closed as an internal invariant breach (`logger.error` + client-safe `ConflictError("Purchase could not be processed.")` — the billing row-mapping discipline). The payment insert carries `studentId: null` and the paired student-junction insert is deliberately NOT performed (an applicant owns no `students` row — a junction insert would FK-restrict). Money (`amount`/`currency`) comes exclusively from the in-transaction plan row (REQ-9.4). |
| `backend/services/teachers/verification-purchase.service.test.ts` | **CREATE** — the 4-tier service suite (16 tests, see 5.TE). |

## Files modified

| File | Change |
|---|---|
| `backend/services/billing/subscription-purchase.service.ts` | **Behavior-preserving guard extraction** — the module-private `isPositiveSafeId` + `isCarryableIdempotencyKey` (and the private `MAX_IDEMPOTENCY_KEY_LENGTH`) deleted; both functions now imported from `purchase-guards.helpers`. One import line + deletion only; call sites untouched (3 usages keep identical semantics — the type-guard narrowing on the key is preserved by the imported signature). |
| `backend/services/teachers/index.ts` | Barrel registration — `export * from "./verification-purchase.service";` appended (alphabetical). The top-level `@/backend/services` barrel already re-exports `./teachers` (verified — no edit needed). |
| `ai/plans/.../tasks.md` | Task 5 checkbox lifecycle (5 + 5.QL/5.TE/5.SEC/5.SR/5.IV). |

## Files NOT modified (and why)

- `backend/services/teachers/applicant-lifecycle.service.ts` — the cooldown
  (`APPLICANT_COOLDOWN_ACTIVE`), missing-row (`APPLICANT_NOT_FOUND`), and certified
  (`APPLICANT_ALREADY_CERTIFIED`) guards ALREADY live there (Task 2); this service calls
  `assertCanPurchaseVerification(applicantUserId, locale, tx)` + `recordReapplication(..., tx)`
  through the existing public contract. No duplication.
- `backend/services/index.ts` — already `export * from "./teachers";`; verified, not assumed.
- `backend/services/billing/index.ts` — the helpers file is an internal shared module of the
  billing domain's two purchase flows; exporting it through the billing barrel would widen its
  surface beyond its consumers (both importers use the deep path). Barrel conventions honored.
- Parallel-agent files (`subscription-activation.service.ts` + its test) — untouched per
  coordination protocol (Task 6 landed in the shared tree concurrently; my tsgo/sub-loop runs
  observed the combined tree at 0 errors).

## Exact exported signature (Task 7 wiring)

```ts
// import { VerificationPurchaseService } from "@/backend/services/teachers/verification-purchase.service";
// (also reachable via the teachers barrel / "@/backend/services")
VerificationPurchaseService.purchase(
  applicantUserId: number,          // Task 7 passes ctx.user.id (BOLA — identity param only)
  idempotencyKey: string | null,    // Task 7 passes ctx.idempotencyKey ?? null
  locale: string,                   // Task 7 passes ctx.locale
  outerTx?: DBTransaction           // production callers omit; tests pass the rollback tx
): Promise<PurchaseSubscriptionReturnType>  // { subscription, payment, checkout } — reuse of the DEV1-006 payload shape
```

No input object exists at all (BOPLA by construction). The mutation resolver is a one-line
delegate: `VerificationPurchaseService.purchase(ctx.user.id, ctx.idempotencyKey ?? null, ctx.locale)`.

## What the pending pair looks like (for Task 4's journey webhook step)

After a successful purchase the journey can drive `SubscriptionActivationService.processWebhookEvent`
with a confirmed mock event using:

- `reference` = `result.checkout.providerReference` (the `mock_…` string persisted on
  `subscriptions.payment_reference` of the pending row);
- `amount`/`currency` = `result.payment.amount` / `result.payment.currency` (the plan row's
  verbatim `"150.00"` / `"EGP"`) — the activation compares these against the stored payment row;
- state to observe: `subscriptions.status = "pending"` (+ `payment_method = "mock"`),
  `student_payments.status = "pending"` with `student_id = NULL` and `subscription_id` linked,
  claim (`subscription_purchase_idempotency`) backfilled with `subscription_id`,
  `applicants.status = "in_evaluation"` (purchase-time flip; activation never touches status),
  `verification_attempts = 0` for a first purchase from `pending` (or 1 after a `failed`
  re-application), `last_attempt_at` set only in the re-application case.

The mock gateway's webhook envelope is `{ reference, outcome: "confirmed"|"failed", amount,
currency }` (parsed by `MockPaymentGatewayAdapter.parseWebhookEvent`).

## Verification results

| Check | Result |
|---|---|
| 5.QL sub-loop `--lifecycle duplicates` — `purchase-guards.helpers.ts` | **exit 0** (tsgo → oxlint → biome → lint:type-aware → duplicates) |
| 5.QL — `subscription-purchase.service.ts` (refactor) | **exit 0** |
| 5.QL — `verification-purchase.service.ts` (new) | **exit 0** |
| 5.QL — `teachers/index.ts` (barrel) | **exit 0** |
| 5.QL — `verification-purchase.service.test.ts` | **exit 0** (duplicates stage out of jscpd scope, skipped by the tool) |
| `bun tsgo` (project-wide) | **0 errors** (baseline 0; run included the parallel agent's Task 6 files — combined tree clean) |
| `bun biome:check` (project-wide) | **0 warnings** (baseline 0) |
| 5.TE `bun run test/scripts/run-test.ts backend/services/teachers/verification-purchase.service.test.ts` | **15 pass / 0 fail / 1 skip** (115 expect calls); the skip is the pglite-gated concurrent race (`isPgliteProvider()` gate, per repo convention) |
| Regression proof for the refactor | `subscription-purchase.service.test.ts` re-run: **20 pass / 0 fail / 1 skip** (141 expect calls) — byte-for-byte behavior preservation |

## 5.TE — coverage delivered (all mandated cases)

Tier 1 (branches): happy path — pending pair with NULL owner, `pending → in_evaluation` flip,
`verificationAttempts = 0`, junction rows 0, claim backfilled, checkout descriptor (`mock_`
reference, null URL); cooldown-active → `APPLICANT_COOLDOWN_ACTIVE` with the byte-equal
localized message (formatter-clone expansion) + zero-writes proof; expired cooldown +
`failed` → success with `attempts = 1` and `last_attempt_at` stamped; `passed` →
`APPLICANT_ALREADY_CERTIFIED` + zero writes; non-applicant (student-role user, no applicants
row) → `APPLICANT_NOT_FOUND` + zero writes; missing key → `VALIDATION`
(`subscriptionPurchase.idempotencyKeyRequired`) + zero writes; same-caller replay →
`ConflictError("DUPLICATE_REQUEST")` with `{subs:1, payments:1, claims:1}` unchanged, claim
still pointing at the FIRST subscription, flip/ledger untouched; foreign-key replay →
`NotFoundError("PAYMENT")` = `PAYMENT_NOT_FOUND` with no-existence-leak probes (no owner id /
email in the message) and attacker zero-writes; missing plan (deterministic no-active-title
precondition + inactive-fixture proof) → `PLAN_NOT_FOUND`; plan deactivated DURING checkout →
in-transaction plan re-validation denies with `PLAN_NOT_FOUND`, zero writes (checkout-seam spy);
gateway throw → raw error (NOT a DomainError), zero rows, key not burned (pre-tx boundary).
Tier 2 (boundaries): empty key = missing; 128-char key accepted and stored verbatim; 129
rejected; money-fidelity pin (amount is the plan row's decimal string, sessionCount pinned to
the shared constant). Tier 3 (chaos): concurrent double-submit on the SAME key via
`Promise.allSettled` on the production transaction path — committed fixtures, tracked
hard-delete `afterAll` under `withImmutabilityTriggersSuspended(["student_payments"])` with a
zero-residue probe, gated by `testOnRealPostgres` (skipped on pglite). Tier 4 (abuse/i18n):
multi-script unicode idempotency key carried verbatim into the claim; unicode-named applicant's
ar-locale cooldown denial byte-equal to the localized template with zero user-derived material.

Test-fixture note (recorded honestly): the sandbox data dir carries the SEEDED active
verification plan, so (a) purchase tests anchor assertions to the row the service actually
resolves (re-resolved through the same title lookup — the suite never assumes which same-title
row wins and never trusts seed data; fixtures are still created per REQ-1.4), and (b) the
plan-not-found case establishes its precondition INSIDE its own rollback unit by deactivating
every active row carrying the canonical title (zero residue — the rollback undoes it), which
is deterministic on both seeded and unseeded data dirs.

## 5.SEC — BOLA / BOPLA / BFLA / key hygiene

- **BOLA**: the only identity channel is the `applicantUserId` parameter — Task 7's resolver
  passes `ctx.user.id`; no wire input exists to smuggle an id.
- **BOPLA**: the service takes NO input object (nothing to mass-assign); plan, amount,
  currency, gateway, and reference are all server-derived (catalog title + plan row + adapter).
- **BFLA**: the service-level applicant gate (`assertCanPurchaseVerification` in-tx) rejects
  every non-applicant with `APPLICANT_NOT_FOUND` — the surface grants self-purchase only.
- **Key hygiene**: the idempotency key is carried verbatim into DB parameters and NEVER logged
  — grep-verified: every `logDomainError` call logs code/entity/entityId/locale only; the key
  value appears solely as function arguments and bound parameters.
- Oracle-safety: a foreign caller's spent key surfaces `PAYMENT_NOT_FOUND` (`t.notFound`), with
  tests proving no owner id/email leak.

## 5.SR — semantic checklist

- **Atomicity**: every write (claim, subscription, payment, attempt increment, flip, backfill)
  lives inside the ONE `withTransaction` body; the lifecycle guard runs in-transaction BEFORE
  any write (TOCTOU closure); gateway checkout stays outside (network boundary).
- **No module state**: the service file holds only constants + pure helpers; no mutable
  module-level state, no env reads, no singletons.
- **Enums as values**: `ApplicantStatus`, `PaymentStatus`, `SubscriptionStatus` are value
  imports used as members (no string literals in runtime expressions).
- **No dead branches**: each guard branch is exercised by a test; the single defensive branch
  (null applicant row after the in-tx guard proved existence) is the repo's fail-closed
  invariant-breach idiom (mirrors `insertClaim`'s unreachable `ConflictError`), fail-closed by
  design.
- **No plan-artifact references**: `rg "REQ-[0-9]|DEV2-|tasks\.md|specs\.md|plan\.md"` over all
  five files → zero matches; comments/JSDoc describe domain behavior only.
- **git diff** = exactly: the two modified source files (service + barrel), three new files
  (helpers, service, test), tasks.md, and this outcome file. No stray files (a temporary DB
  probe script directory was removed after use).

## 5.IV — rule files read and honored

Printed by the sub-loops and read in full: root `AGENTS.md`, `backend/AGENTS.md`,
`backend/services/AGENTS.md`, `.agents/instructions/backend.instructions.md`, plus
`.agents/instructions/tests.instructions.md` (test rules) and the printed rule set from the
plan protocol. Compliance highlights: services import types from `@/backend/types`; localized
errors via `getServerTranslations(locale).errorsTranslations` property access; `logDomainError`
fires exactly once per enumerated rejection at its throw site; single-writer discipline (repos
reached only through the canonical `@/backend/db/repo` barrel; the lifecycle service is the
sole writer of applicant state); composition seam accepts `outerTx` as the FINAL parameter;
no `console.*`; no `oxlint-disable`; tests live next to the service and use
`runInRollback`/`expectRepoError`/entity-setup factories (never seed-trusted), `bun:test`
utilities only.

## Carry-forward knowledge

1. **Task 7 (mutation)** — wire exactly: `VerificationPurchaseService.purchase(ctx.user.id,
   ctx.idempotencyKey ?? null, ctx.locale)` (signature above; `authScopes: { authenticated:
   true }`, inputless). Rejections are uncaught DomainErrors — the masking boundary owns the
   wire. Import via `@/backend/services` or the teachers barrel.
2. **Task 4 (journey)** — purchase half is GREEN as of this task; the journey's webhook step
   needs only the pending-pair shape recorded above (reference = `checkout.providerReference`,
   verbatim amount/currency). Journey fixtures must use `failed` status for cooldown-path
   applicants (certification outranks cooldown math — Task 2 carry-forward).
3. **Guard helpers are now shared** — any future purchase-flow service (e.g. the paymob plan)
   should import `isPositiveSafeId`/`isCarryableIdempotencyKey` from
   `backend/services/billing/purchase-guards.helpers.ts` instead of growing private copies.
4. **Plan resolution contract** — the verification purchase resolves the FIRST active catalog
   row titled `VERIFICATION_PLAN_TITLE`; the catalog does NOT enforce title uniqueness, so
   catalog administration must not create duplicate active same-title rows (the DB has no
   constraint; the service takes the oldest by `created_at ASC` — deterministic, but a second
   active same-title row would be unpurchasable dead copy).
5. **`ApplicantSelectType.status` is `string | null`** — the re-application decision compares
   the raw varchar against `ApplicantStatus.Failed` directly (null-safe; corrupt values simply
   never match and never increment).

## Cross-file dependencies

- `purchase-guards.helpers.ts` ← imported by BOTH `subscription-purchase.service.ts` and
  `verification-purchase.service.ts` (the anti-duplication seam this task created).
- `verification-purchase.service.ts` ← `teachers/index.ts` barrel ← `@/backend/services`
  barrel (Task 7's resolver import path).
- `applicant-lifecycle.service.ts` (`assertCanPurchaseVerification`, `recordReapplication`) ←
  in-tx guard + attempt increment (Task 2's contract, unchanged).
- `applicant.repository.ts` (`transitionToInEvaluation`, `findByUserId`) ← the guarded flip +
  transition-decision read.
- `verification-purchase.service.test.ts` ← Task 4's journey (green purchase half) and Task 10's
  full-sweep runs.

## Deferred items

None added — no out-of-scope discoveries this task (ledger D1–D6 unchanged).
