# Verification Plan Purchase — Canonical Reference

**Domain:** Teachers / Teacher-applicant verification plan purchase
**Related:** `docs/teachers/applicant-lifecycle.md`, `docs/billing/subscription-purchase.md`
**Status:** Implemented and verified

This document is the canonical reference for the purchase flow a teacher applicant uses to enter
evaluation: the dedicated `purchaseVerificationPlan` surface, the end-to-end purchase pipeline, the
guard contract, the applicant status transition, the activation (webhook-confirmed) behavior, the
idempotency semantics, and the test map. All layers (repository, service, GraphQL, frontend) MUST
conform to the contracts described here. Code blocks in this document are **illustrative and
NON-authoritative** — the authoritative implementations are cited by path in each section.

The purchase rides the SAME money spine as student purchases (plan catalog → gateway checkout →
pending subscription + pending payment pair + idempotency claim) but is its own surface, because of
the binding between the purchase and the teacher-verification lifecycle (`INV-TV` invariant family,
`docs/specs/state-machine-invariants.md`): a verification subscription gates the applicant's entry
into evaluation, not a student's session balance. Two structural consequences follow:

- The pending payment row is written with a **NULL `student_payments.student_id` owner** (the
  purchaser is an applicant with no `students` row) and no `student_subscriptions` junction row is
  ever attempted.
- Activation **skips the lane credit** for applicant-owned subscriptions — the plan's
  `balance_lane` is catalog metadata, never a balance grant for a verification subscription.

---

## 1. The Plan & The Surface

**Catalog identity.** The plan is resolved server-side from the ACTIVE plan catalog by its
canonical title — the shared constant `VERIFICATION_PLAN_TITLE`
(`"New Teacher Verification & Evaluation Plan"`, 5 sessions) in
`shared/constants/verification-plan.constants.ts`. The seeded catalog row derives its title and
session count from the same constants, so the catalog can never drift from what purchase resolution
and the UI expect. The caller supplies no plan id, no amount, and no user id of any kind.

**GraphQL surface** (`backend/graphql/mutation/verification-plan-purchase.mutation.ts`):

```graphql
purchaseVerificationPlan: PurchaseSubscriptionPayload!   # ZERO arguments
# PurchaseSubscriptionPayload { subscription: StudentSubscription!, payment: StudentPayment!, checkout: PaymentCheckout! }
```

- Identity is resolved exclusively from the verified context (`ctx.user.id`). An argument-carrying
  probe dies at schema validation, never at the resolver — the surface is BOLA/BOPLA-proof by
  construction.
- The idempotency key is consumed exactly as captured at the gateway (`ctx.idempotencyKey`,
  propagation-only) from the `X-Idempotency-Key` transport header. An absent header arrives as
  `null` and is rejected by the service's own guard pre-DB. The key is never re-derived, never
  trimmed, and never consultable by any authorization decision.
- The payload reuses the student purchase surface's exact shape; no new wire types exist.
  `PaymentCheckout.checkoutUrl` is nullable (server-side/mock providers have none — the client
  never redirects on a null URL).
- Auth scope is `authenticated: true` ONLY. The applicant gate is service-level, which keeps
  post-conversion re-application reachable for callers whose role has moved on while the effective
  audience stays identical. Anonymous callers hit the 401 `UNAUTHORIZED` channel; there is no role
  leg and no FORBIDDEN-at-scope path.
- Every `DomainError` propagates UNCAUGHT to the masking boundary — the resolver carries no
  try/catch by contract (same discipline as the applicant query surface).

---

## 2. Purchase Flow End-to-End

`VerificationPurchaseService.purchase(applicantUserId, idempotencyKey, locale, outerTx?)`
(`backend/services/teachers/verification-purchase.service.ts`) composes a fixed, never-reordered
stage list:

1. **Pre-DB boundary.** The caller id must be a positive safe integer; the acting user's governance
   state is re-checked (deleted/blocked/suspended callers are denied); the idempotency key must be
   present and within the claim column's 128-char ceiling. All three fail before any database work
   — zero rows written.
2. **Server-side plan resolution.** The ACTIVE catalog is scanned for the canonical title. A
   missing active plan (absent or deactivated) fails the purchase BEFORE the gateway call — no
   checkout session is ever opened for a non-purchasable plan. The pre-checkout plan read only
   feeds the gateway input.
3. **Gateway checkout, OUTSIDE any transaction.** A provider call is a network boundary and never
   holds a DB transaction open. The checkout input carries the plan row's verbatim
   `amount`/`currency` (decimal strings, never arithmetic) and the purchaser's user id as provider
   metadata (the port's `studentId` member is shared vocabulary with the student flow).
4. **ONE transaction** owns the authoritative validation and every write, in this order:
   1. active-state re-validation of the plan (a deactivation that lands mid-checkout denies the
      purchase before any row write);
   2. price/currency re-comparison of the fresh in-transaction plan row against the values the
      checkout was minted with (`PLAN_PRICE_CHANGED`, thrown before any row write — committing a
      mismatched pair would be a settlement guaranteed to quarantine);
   3. governance re-assertion (a suspension that lands during checkout rolls the pair back);
   4. the applicant lifecycle guard (`assertCanPurchaseVerification`) INSIDE the transaction,
      BEFORE any write — the pre-checkout gateway call cannot smuggle a purchase past the cooldown
      or the certification terminal state;
   5. the idempotency claim insert, savepoint-bracketed (a duplicate key poisons only the
      savepoint, keeping the transaction readable for the replay lookup);
   6. the applicant row read for the transition decision (non-null by construction — the guard
      just proved existence on the SAME transaction; a null here is failed closed as an internal
      invariant breach with client-safe generic copy);
   7. the pending `subscriptions` insert (`paymentMethod`/`paymentReference` from the checkout
      descriptor; a provider reference collision translates to a localized conflict — the raw
      driver error never escapes);
   8. the pending `student_payments` insert with `studentId: null`, `amount`/`currency` verbatim
      from the in-transaction plan row;
   9. the re-application attempt increment — ONLY when the in-tx applicant read reports `failed`
      (a first purchase from `pending` never increments);
   10. the guarded `pending|failed → in_evaluation` flip (§3);
   11. the claim's subscription-pointer backfill.
5. **Payload composition.** Raw rows are mapped field-by-field into the enum-typed payload shape
   (never a spread, never a cast); the pending lifecycle states are re-asserted from the enum
   members.

Any failure rolls the whole purchase back — the claim rolls back with it, so **a failed purchase
never burns its key**.

---

## 3. Applicant Transition Semantics

The purchase flow is the writer of the two purchase-driven transitions in the applicant state
machine (`docs/teachers/applicant-lifecycle.md` §1): `pending → in_evaluation` and
`failed → in_evaluation` (re-application after an expired cooldown).

- **The flip** — `ApplicantRepository.transitionToInEvaluation(userId, tx?)`
  (`backend/db/repo/teachers/applicant.repository.ts`) — is ONE guarded single-statement UPDATE
  with the enterable prior states folded into its WHERE predicate (never SELECT-then-UPDATE):

  ```ts
  // ILLUSTRATIVE — NON-AUTHORITATIVE. Canonical shape lives in
  // backend/db/repo/teachers/applicant.repository.ts (Drizzle form).
  tx.update(applicants)
    .set({ status: "in_evaluation", updatedAt: sql`now()` })
    .where(and(eq(applicants.id, userId), inArray(applicants.status, ["pending", "failed"])))
    .returning();
  ```

- A **zero-row miss returns `null`** — a signal, never an error. The miss means the applicant is
  already `in_evaluation` under a concurrent/repeat caller (silent no-op: not even `updated_at`
  moves); `passed` never reaches the flip (the guard rejected it upstream) and a missing row was
  rejected by the guard too.
- The flip touches ONLY `status` + `updated_at` (stamped DB-side). The attempt ledger
  (`verification_attempts`, `last_attempt_at`) and `cooldown_until` are deliberately untouched by
  the flip — the gate is read-only over the cooldown.
- **Attempt accounting is a re-application contract:** `ApplicantLifecycleService.recordReapplication`
  delegates to the atomic DB-side increment (`verification_attempts + 1`, `last_attempt_at = now()`)
  and runs ONLY for a purchase from `failed`. Cooldown durations are a write-time concern of the
  failure writer; the purchase flow reads `cooldown_until` and never writes it.

---

## 4. Guard Contract

Every rejection is a `DomainError` whose `extensions.code` follows
`docs/graphql/domain-error-extensions-code.md`; messages resolve through the compile-time `errors`
namespace (ar/en parity mechanically pinned). The resolver never masks — codes reach the wire
verbatim through the masking boundary.

| `extensions.code` | Raised at | Trigger | Client-visible semantics |
|---|---|---|---|
| `UNAUTHORIZED` | GraphQL scope | anonymous caller | 401 channel |
| `VALIDATION` | pre-DB boundary | missing/empty key, over-128-char key, or malformed caller id | localized copy, zero writes; also the carrier for the `PLAN_PRICE_CHANGED` field denial (below) |
| `FORBIDDEN` | governance assertion (pre-checkout, re-asserted in-tx) | caller deleted/blocked/suspended | localized copy, zero writes |
| `APPLICANT_NOT_FOUND` | in-tx lifecycle guard | caller has no `applicants` row | the honest non-applicant denial; localized copy, zero writes |
| `APPLICANT_COOLDOWN_ACTIVE` | in-tx lifecycle guard | `cooldown_until > now()` (strict `>` — a cooldown expiring exactly now no longer blocks) | localized ICU template expanded server-side around the formatted expiry instant (deterministic UTC options); the single placeholder is server-expanded, never client-derived |
| `APPLICANT_ALREADY_CERTIFIED` | in-tx lifecycle guard | stored status is `passed` | terminal: certification can never be re-purchased; fires AFTER the cooldown arm, so a certified row is denied on this code regardless of its cooldown timestamps |
| `PLAN_NOT_FOUND` | pre-checkout resolution AND in-tx re-validation | no active catalog row carries the canonical title | localized copy; raised before the gateway call (first instance) or before any row write (second) |
| `PLAN_PRICE_CHANGED` | in-tx price/currency re-comparison | fresh plan row disagrees with the checkout's captured price or currency | rides the generic `VALIDATION` denial with a `planId` field payload; thrown before ANY row write |
| `DUPLICATE_REQUEST` | claim replay (in-tx, savepoint-bracketed) | same caller replays a committed key | 409 conflict; zero new rows; the first purchase stands |
| `PAYMENT_NOT_FOUND` | claim replay (in-tx) | the key was claimed by a DIFFERENT caller | oracle-safe 404, generic localized copy, zero writes — another user's claim is never surfaced (no owner id, no email prefix) |

**Denial ordering (fail-closed, deliberate):** the lifecycle guard runs inside the transaction
BEFORE the claim arbiter, so a non-applicant foreign caller replaying a spent key surfaces
`APPLICANT_NOT_FOUND` — claim existence never leaks to a caller the surface would reject anyway.
`PAYMENT_NOT_FOUND` is reachable exactly for an applicant-shaped caller holding someone else's
spent key.

**Cooldown/certification context:** the cooldown predicate, the two-source split (login/session
gating vs re-purchase gating), and the duration-agnostic reader posture are canonical in
`docs/teachers/applicant-lifecycle.md` §2 — the purchase flow is a consumer of that contract, not
its author.

---

## 5. Activation Behavior (Webhook-Confirmed)

The confirmed callback is processed by `SubscriptionActivationService.processWebhookEvent`
(`backend/services/billing/subscription-activation.service.ts`). Reference correlation, settlement
quarantine, and the replay arbiter are the shared billing contract (`docs/billing/subscription-purchase.md`
§5/§7) and behave identically for verification subscriptions: an unknown reference acks
`{ processed: false }`; a verified callback whose `amount`/`currency` disagrees with the stored
ledger row QUARANTINES (nothing mutated, one correlated error log, acked `200 { processed: false }`);
a second confirmed delivery for the same reference acks as a replay with zero new effects.

The verification-specific behavior is the **purchaser discrimination probe** (students-first) that
runs inside the confirmed transaction, after the guarded activation + payment decision and before
the notification persist:

1. **A `students` row exists** → the full lane credit exactly as the student flow (fail-closed lane
   resolution unchanged). This leg ALWAYS wins — even a degenerate purchaser holding both a
   `students` row and an `applicants` row is credited, so the skip is structurally unreachable for
   student purchases (pinned by a dedicated both-rows test).
2. **No `students` row but an `applicants` row** → the verification shape: the lane credit is
   deliberately SKIPPED and the unit completes — subscription `active` with the exact
   `intervalDays` window, payment `paid` on its still-NULL owner, no `students` row fabricated, the
   applicant row untouched (activation owns money finality + notification only).
3. **Neither row** → corrupt purchaser: fail-closed abort; the throw rolls the whole activation
   unit back (the pair stays pending), the client-safe generic copy reaches the wire, and the
   breach detail rides the correlated log line only.

**Receipt:** the confirmation notification row is persisted in-tx, composed in the RECIPIENT's
persisted `users.locale` (falling back to the platform default — the webhook has no session
locale), and receipts are published strictly AFTER the unit commits, to the purchaser
(`subscription.userId`) only. The `failed` delivery path is unchanged for verification
subscriptions: payment `failed`, subscription stays `pending` with NULL dates, no credit, no
notification.

**Payment-failed aftermath (accepted posture):** on a `failed` webhook the applicant remains
`in_evaluation` with a `pending` subscription. Re-purchase from `in_evaluation` is permitted (the
flip is a no-op there), so there is no trap; a formal "payment failed, try again" UX is a
downstream concern, and stuck pending pairs are the operator follow-up backlog described in
`docs/billing/subscription-purchase.md` §10.

---

## 6. Idempotency Semantics

- **Transport:** the key rides the `X-Idempotency-Key` header, captured once into the GraphQL
  context; reads never require it. It is an opaque byte-exact claim — never trimmed, coerced, or
  logged; the 128-char claim-column ceiling is enforced pre-DB.
- **Per-attempt key:** the client mints a fresh key for each purchase intent. The shipped dialog
  mints a UUID at dialog mount and **rotates it only after a confirmed success** — a failed attempt
  keeps its key, so a retry of the same intent is arbitrated by the server-side replay dedupe
  instead of silently double-purchasing.
- **Claim fate-sharing:** the claim is inserted in the SAME transaction as the pending pair
  (savepoint-bracketed) and outlives its subscription (`subscription_id` set-null on delete), so
  replays after deletion still surface duplicate semantics — claims are never "cleaned up" with
  subscriptions.
- **Replay by throwing:** a same-caller duplicate NEVER returns a row — it throws
  `ConflictError("DUPLICATE_REQUEST")`, and the replay attempt's own partial writes roll back with
  the transaction (zero new rows). The unique-violation path catches only PG `23505` on the claim
  insert; every other failure bubbles untouched so the whole purchase rolls back together.
- **Retry cleanliness:** a mid-flow failure (FK, constraint, governance flip) rolls the claim back
  with everything else — the same key is cleanly reusable on retry.

---

## 7. Testing Map

| Suite | What it owns |
|---|---|
| `backend/db/test/repo/teachers/applicant.repository.transition.test.ts` | The guarded flip: `pending`/`failed` flips, zero-row no-ops for `in_evaluation`/`passed`, absent id → null, parallel single-winner race, transaction composition with the attempt increment |
| `backend/services/teachers/verification-purchase.service.test.ts` | The 4-tier service suite: happy path (NULL-owner pair, flip, claim backfill, checkout descriptor), every guard denial with byte-equal localized assertions, replay/foreign-key semantics, plan-resolution + mid-checkout price-change denials, governance re-assertion, gateway pre-tx boundary (zero rows, key not burned), key-length boundaries, real-Postgres concurrent double-submit, unicode/locale fuzz |
| `backend/services/billing/subscription-activation.service.test.ts` | The purchaser discrimination probe: applicant-owned confirmation (no credit, no abort, receipt to the purchaser), the students-first order pin (both-rows purchaser is credited), corrupt-purchaser abort, failed-delivery posture for verification pairs |
| `backend/db/test/logic/billing/student-payment.repository.test.ts` | The nullable ledger owner: NULL-owner insert, guarded `pending → paid` on a NULL-owner row, the immutability trigger's NULL-safe column freeze |
| `test/workflows/teachers/verification-plan-purchase.journey.test.ts` | The cross-actor journey on real services + real DB: purchase → webhook confirmation → activation observables end-to-end, cooldown-active denial, expired-cooldown re-application (attempts + 1), non-applicant denial, foreign spent-key denial, owner-scoped visibility both directions, zero-residue teardown |
| `frontend/graphql/test/teachers/verification-plan-purchase.test.ts` | The wire boundary: anonymous → `UNAUTHORIZED`, non-applicant with a key → `APPLICANT_NOT_FOUND`, applicant without the key header → `VALIDATION` (executes against real PostgreSQL in CI) |
| `test/ui/components/teachers/VerificationPurchaseDialog.test.tsx` | The dialog: plan-line render (EN + AR), success → refetch + close, cooldown denial → verbatim server copy + refetch, duplicate → info notice, generic denial with no raw server message, key rotation policy (stable across failures, rotates on success), missing-plan and catalog-error arms |

Locale parity pins: `shared/locale/errors-namespace.parity.test.ts` (`applicantAlreadyCertified`)
and `shared/locale/applicant-namespace.parity.test.ts` (the purchase copy inventory, including the
placeholder-order pin for the plan line).

---

## 8. Consumer Obligations & Known Postures

- **Frontend clients:** per-attempt key minted at intent; rotate on success only; branch on
  `extensions.code` — `APPLICANT_COOLDOWN_ACTIVE` renders the verbatim server-localized copy (it
  already contains the expanded expiry) and refetches the applicant profile; `DUPLICATE_REQUEST`
  renders an info notice; everything else renders the localized generic error. Never render raw
  server messages beyond the localized cooldown copy.
- **Catalog administration:** the catalog does not enforce title uniqueness. Never create a second
  ACTIVE row carrying the canonical title — resolution is deterministic, but a duplicate active
  same-title row is unpurchasable dead copy.
- **Cooldown fixes:** when a cooldown should no longer bind (admin clearing), null/clear
  `applicants.cooldown_until` rather than leaving a stale instant (see
  `docs/teachers/applicant-lifecycle.md` §6).
- **Student-catalog exposure (accepted posture):** the seeded verification plan is active in the
  student catalog, so a student can purchase it through the student purchase surface like any other
  plan (and would be lane-credited — the activation probe is students-first by design).
  Restricting catalog rows by audience is a catalog-visibility concern, deliberately out of scope
  for this surface.
- **Stateful provider forward-note:** the purchase flow opens the provider checkout BEFORE the
  applicant lifecycle gate. With the stateless mock this is harmless (a checkout is a pure
  descriptor mint); when a stateful provider lands, its integration plan must re-review this
  ordering (pre-checkout applicant-existence read or provider-side rate limiting).

---

## 9. References

- Applicant lifecycle (state machine, cooldown/attempt contracts, guard ownership):
  `docs/teachers/applicant-lifecycle.md`
- Billing spine (gateway port, webhook security, ledger trigger, idempotency tables, activation
  stages): `docs/billing/subscription-purchase.md`
- Invariants: `docs/specs/state-machine-invariants.md` (§2 Teacher Verification Lifecycle,
  `INV-TV1`–`INV-TV7`)
- Error contract: `docs/graphql/domain-error-extensions-code.md`
- Workflow context: `docs/workflows/01-teacher-verification-workflow.md`
- Authoritative implementations: `shared/constants/verification-plan.constants.ts`,
  `backend/db/repo/teachers/applicant.repository.ts`,
  `backend/db/repo/billing/student-payment.repository.ts`,
  `backend/services/teachers/applicant-lifecycle.service.ts`,
  `backend/services/teachers/verification-purchase.service.ts`,
  `backend/services/billing/purchase-guards.helpers.ts`,
  `backend/services/billing/subscription-activation.service.ts`,
  `backend/graphql/mutation/verification-plan-purchase.mutation.ts`,
  `frontend/views/teachers/dashboard/VerificationPurchaseDialog.tsx`
- Test locks: the suites in §7 (each is the owning coverage for its contract row above)
