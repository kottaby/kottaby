/**
 * VerificationPurchaseService tests — the applicant-facing purchase flow:
 * the pre-DB boundary (identifier + governance + idempotency-key guards),
 * the server-side plan resolution by canonical title, the gateway checkout
 * outside the transaction, the in-transaction lifecycle guard (cooldown +
 * certification), the savepoint-bracketed claim, the pending
 * subscription/payment pair with a NULL payment owner, the re-application
 * attempt accounting, the guarded `pending|failed → in_evaluation` flip,
 * and the replay classification — against the live PGlite database on REAL
 * repositories.
 *
 * Per `backend/db/test/AGENTS.md` (the DB-backed service-test rules the
 * sibling billing suite applies):
 *  - Every transactional case runs inside `runInRollback`; the `tx` (as
 *    `outerTx`) is propagated to EVERY service call so the flow executes
 *    on the caller's transaction (a SAVEPOINT on it, released or rolled
 *    back per outcome).
 *  - Entities are created ONLY via `entity-setup.ts` helpers — never seed
 *    data; the verification plan itself is created through `createTestPlan`
 *    with the canonical constants (the suite never TRUSTS a seeded catalog
 *    row, and the plan-not-found case deactivates any active row carrying
 *    the title inside its own rollback unit to stay deterministic on both
 *    seeded and unseeded data dirs).
 *  - NO `expect(...).rejects.toThrow()` — every denial goes through
 *    `expectRepoError` (try/catch); typed denials are asserted through the
 *    `DomainError.code` contract plus the exact translated message.
 *
 * Coverage map:
 *  - Tier 1 (branch/statement): the happy path (pending pair with a NULL
 *    owner, `pending → in_evaluation` flip, attempts stay 0, claim
 *    backfilled); cooldown-active denial with a zero-writes proof;
 *    expired-cooldown re-application (attempts +1 + flip); certified
 *    denial; non-applicant denial; missing-key denial; same-caller replay
 *    (`DUPLICATE_REQUEST`, zero new rows); foreign-key replay (oracle-safe
 *    `PAYMENT_NOT_FOUND`); absent/inactive plan (`PLAN_NOT_FOUND`); a plan
 *    deactivated DURING checkout (the in-transaction re-validation); a
 *    gateway throw (the pre-transaction boundary — zero rows).
 *  - Tier 2 (boundary): empty-string key treated as missing; the 128-char
 *    key accepted verbatim and the 129-char key rejected; the plan row is
 *    the money source (decimal-string amount carried verbatim).
 *  - Tier 3 (chaos): concurrent double-submit on the SAME key through
 *    `Promise.allSettled` on the production transaction path (committed
 *    fixtures + tracked hard-delete teardown, real-PostgreSQL-gated) —
 *    exactly one success, exactly one `DUPLICATE_REQUEST` conflict,
 *    exactly ONE pending pair, the flip applied once.
 *  - Tier 4 (abuse/i18n): a multi-script idempotency key is carried
 *    verbatim; a unicode-named applicant's ar-locale cooldown denial is
 *    the byte-equal localized template and carries no user-derived
 *    material.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/backend/db";
import { PlanRepository } from "@/backend/db/repo";
import { plans } from "@/backend/db/schema/billing/plans";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";
import { subscriptionPurchaseIdempotency } from "@/backend/db/schema/billing/subscription-purchase-idempotency";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { users } from "@/backend/db/schema/users/users";
import { createTestApplicant, createTestPlan, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { MockPaymentGatewayAdapter } from "@/backend/services/billing/payment-gateway/mock-payment-gateway.adapter";
import { resetPaymentGateway } from "@/backend/services/billing/payment-gateway/payment-gateway.factory";
import { VerificationPurchaseService } from "@/backend/services/teachers/verification-purchase.service";
import type { ApplicantSelectType, DBTransaction, PurchaseSubscriptionReturnType } from "@/backend/types";
import {
  VERIFICATION_PLAN_SESSION_COUNT,
  VERIFICATION_PLAN_TITLE,
} from "@/shared/constants/verification-plan.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { withImmutabilityTriggersSuspended } from "@/test/helpers/db-cleanup";
import { isPgliteProvider } from "@/test/helpers/skip-when-pglite";

/**
 * Concurrent-transaction cases run ONLY on a real multi-connection
 * PostgreSQL: PGlite is a single-connection shim, so two interleaved
 * transactions share one session (and two concurrent savepoints on one
 * outer transaction share one savepoint name) — the interleaving poisons
 * the shared transaction rather than racing two independent claims. The
 * sibling billing suite applies the same environment gate.
 */
const testOnRealPostgres = isPgliteProvider() ? test.skip : test;

/** The errors-namespace translations for a test locale. */
function t(locale: "en" | "ar" = "en") {
  return getServerTranslations(locale).errorsTranslations;
}

/**
 * Type-guard read of a caught rejection's `extensions.code` — the
 * assertion-free form of the typed-denial contract check (an
 * `instanceof` guard, never a narrowing cast).
 */
function rejectionCode(error: unknown): string {
  return error instanceof DomainError ? error.code : "";
}

/**
 * Asserts a caught error is a `DomainError` carrying EXACTLY the expected
 * `extensions.code` and the exact translated message (never the raw
 * translation key). Suite-local — deliberately NOT a shared export.
 */
function expectDomainDenial(error: Error, code: string, message: string): void {
  expect(error).toBeInstanceOf(DomainError);
  expect(rejectionCode(error)).toBe(code);
  expect(error.message).toBe(message);
  expect(error.message).not.toContain(code);
}

/** A unique opaque purchase idempotency key (carried verbatim by the service). */
function purchaseKey(): string {
  return `verify-${crypto.randomUUID()}`;
}

/**
 * The canonical verification-plan fixture: created via the entity-setup
 * helper with the shared identity constants — never queried from seed
 * data. Domain values match the canonical catalog row (5 sessions, review
 * lane, 150.00 EGP, 14 days).
 */
async function createVerificationPlan(tx: DBTransaction) {
  return createTestPlan(tx, {
    title: VERIFICATION_PLAN_TITLE,
    sessionCount: VERIFICATION_PLAN_SESSION_COUNT,
    balanceLane: SubscriptionCreditLane.Reviews,
    price: "150.00",
    currency: "EGP",
    intervalDays: 14,
    isActive: true,
  });
}

/**
 * The teacher-applicant fixture: a `teacher`-role user plus its `applicants`
 * row (shared PK). Overrides flow through the entity-setup helpers.
 */
async function createApplicantFixture(
  tx: DBTransaction,
  applicantOverrides: Partial<ApplicantSelectType> = {},
  userOverrides: Partial<typeof users.$inferSelect> = {}
) {
  const user = await createTestUser(tx, { role: UserRole.Teacher, ...userOverrides });
  const applicant = await createTestApplicant(tx, user.id, applicantOverrides);
  return { user, applicant };
}

/**
 * Re-resolves the plan row the service's title lookup selects — the FIRST
 * active catalog row carrying the canonical title. Used for assertion
 * expectations only (the suite never assumes WHICH active row wins when a
 * data dir carries earlier same-title rows): every purchase assertion is
 * anchored to this row, so the suite is honest on seeded and unseeded
 * catalogs alike.
 */
async function resolveActiveVerificationPlan(tx: DBTransaction) {
  const activeCatalog = await PlanRepository.listActive(tx);
  return activeCatalog.find(candidate => candidate.title === VERIFICATION_PLAN_TITLE);
}

/** Independent read-back oracle — direct Drizzle select, not via the service. */
async function readApplicantRow(tx: DBTransaction, userId: number) {
  const rows = await tx.select().from(applicants).where(eq(applicants.id, userId));
  return rows[0] ?? null;
}

/**
 * Wholesale-count reads for the zero-writes proofs. The payment leg counts
 * through the owner's subscriptions — a verification payment's owner is
 * NULL, so the ledger rows are only reachable via their subscription link.
 */
async function countRows(
  tx: DBTransaction,
  userId: number
): Promise<{ subs: number; payments: number; claims: number }> {
  const subs = await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, userId));
  const subIds = subs.map(row => row.id);
  const payments =
    subIds.length === 0
      ? []
      : await tx
          .select({ id: studentPayments.id })
          .from(studentPayments)
          .where(inArray(studentPayments.subscriptionId, subIds));
  const claims = await tx
    .select({ id: subscriptionPurchaseIdempotency.id })
    .from(subscriptionPurchaseIdempotency)
    .where(eq(subscriptionPurchaseIdempotency.userId, userId));
  return { subs: subs.length, payments: payments.length, claims: claims.length };
}

/**
 * Byte-parity clone of the lifecycle guard's deterministic UTC formatter
 * options (both suites stay self-contained). Because the fixed option set
 * matches exactly, this renders any given instant to the identical string
 * the guard interpolates into `{cooldownUntil}`.
 */
function formatCooldownExpectation(cooldownUntil: Date, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(cooldownUntil);
}

/**
 * The hostile-mutation seam: the ONLY await between the pre-checkout plan
 * read and the transaction body is the gateway checkout, so the spy
 * performs the mutation DURING checkout creation — exactly the window the
 * in-transaction re-validation owns. The original adapter method is
 * captured BEFORE the spy is installed and invoked from inside the mock
 * implementation, so the checkout descriptor itself stays byte-identical
 * to the real adapter's.
 */
function interceptCheckoutDuring(mutation: () => Promise<void>) {
  const prototype = MockPaymentGatewayAdapter.prototype;
  const realCreateCheckout = prototype.createCheckout;
  return spyOn(prototype, "createCheckout").mockImplementation(async input => {
    await mutation();
    return realCreateCheckout.call(prototype, input);
  });
}

/** Multi-script full name shared by the unicode leak-probe fixtures. */
const UNICODE_APPLICANT_NAME = "أحمد عبد الرحمن ﷺ 汉字 🎓";

describe("VerificationPurchaseService — purchase (Tier 1: branches)", () => {
  beforeAll(() => {
    // Resolve the gateway adapter from the runner's environment (mock
    // provider) — hermetic regardless of a prior suite's env mutations.
    resetPaymentGateway();
  });

  test("happy path: pending pair with a NULL owner + flip + claim backfill + attempts stay 0", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);
      const expectedPlan = await resolveActiveVerificationPlan(tx);
      if (expectedPlan === undefined) {
        throw new Error("expected an active verification plan row for the assertion anchor");
      }

      const result = await VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx);

      // The returned composition — pending pair, NULL owner, verbatim money.
      expect(result.subscription.userId).toBe(user.id);
      expect(result.subscription.planId).toBe(expectedPlan.id);
      expect(result.subscription.status).toBe(SubscriptionStatus.Pending);
      expect(result.subscription.paymentMethod).toBe(PaymentGateway.Mock);
      expect(result.subscription.startDate).toBeNull();
      expect(result.payment.subscriptionId).toBe(result.subscription.id);
      expect(result.payment.studentId).toBeNull();
      expect(result.payment.status).toBe(PaymentStatus.Pending);
      expect(result.payment.paymentGateway).toBe(PaymentGateway.Mock);
      expect(result.payment.amount).toBe(expectedPlan.price);
      expect(typeof result.payment.amount).toBe("string");
      expect(result.payment.currency).toBe(expectedPlan.currency);
      expect(result.checkout.provider).toBe(PaymentGateway.Mock);
      expect(result.checkout.providerReference.startsWith("mock_")).toBe(true);
      expect(result.checkout.checkoutUrl).toBeNull();

      // The persisted pair — one subscription + one NULL-owner payment,
      // and deliberately NO student-junction row (an applicant owns no
      // students row).
      const storedSubs = await tx.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
      expect(storedSubs).toHaveLength(1);
      expect(storedSubs[0].status).toBe(SubscriptionStatus.Pending);
      expect(storedSubs[0].planId).toBe(expectedPlan.id);
      expect(storedSubs[0].paymentReference).toBe(result.checkout.providerReference);

      const storedPayments = await tx
        .select()
        .from(studentPayments)
        .where(eq(studentPayments.subscriptionId, storedSubs[0].id));
      expect(storedPayments).toHaveLength(1);
      expect(storedPayments[0].studentId).toBeNull();
      expect(storedPayments[0].amount).toBe("150.00");
      expect(storedPayments[0].currency).toBe("EGP");
      expect(storedPayments[0].paymentGateway).toBe(PaymentGateway.Mock);

      const junction = await tx
        .select()
        .from(studentSubscriptions)
        .where(eq(studentSubscriptions.subscriptionId, storedSubs[0].id));
      expect(junction).toHaveLength(0);

      // The lifecycle flip — `pending → in_evaluation`, attempt ledger
      // untouched on a FIRST purchase.
      const applicantRow = await readApplicantRow(tx, user.id);
      expect(applicantRow?.status).toBe(ApplicantStatus.InEvaluation);
      expect(applicantRow?.verificationAttempts).toBe(0);

      // The claim — keyed, owned by the caller, backfilled with the
      // subscription pointer.
      const claims = await tx
        .select()
        .from(subscriptionPurchaseIdempotency)
        .where(eq(subscriptionPurchaseIdempotency.userId, user.id));
      expect(claims).toHaveLength(1);
      expect(claims[0].subscriptionId).toBe(storedSubs[0].id);
    });
  });

  test("cooldown-active applicant denies with the localized cooldown message — zero writes", async () => {
    await runInRollback(async tx => {
      const cooldownUntil = new Date(Date.now() + 60 * 60 * 1000);
      const { user } = await createApplicantFixture(tx, { status: ApplicantStatus.Failed, cooldownUntil });
      await createVerificationPlan(tx);

      const err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      expectDomainDenial(
        err,
        "APPLICANT_COOLDOWN_ACTIVE",
        t().applicantCooldownActive.replace("{cooldownUntil}", formatCooldownExpectation(cooldownUntil, "en"))
      );

      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });

  test("expired-cooldown re-application from `failed`: attempts +1, last attempt stamped, flip applied", async () => {
    await runInRollback(async tx => {
      const cooldownUntil = new Date(Date.now() - 60 * 60 * 1000);
      const { user } = await createApplicantFixture(tx, { status: ApplicantStatus.Failed, cooldownUntil });
      await createVerificationPlan(tx);

      const result = await VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx);
      expect(result.subscription.status).toBe(SubscriptionStatus.Pending);
      expect(result.payment.studentId).toBeNull();

      const applicantRow = await readApplicantRow(tx, user.id);
      expect(applicantRow?.status).toBe(ApplicantStatus.InEvaluation);
      expect(applicantRow?.verificationAttempts).toBe(1);
      expect(applicantRow?.lastAttemptAt).not.toBeNull();
    });
  });

  test("certified applicant (`passed`) denies with the localized certified message — zero writes", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx, { status: ApplicantStatus.Passed });
      await createVerificationPlan(tx);

      const err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      expectDomainDenial(err, "APPLICANT_ALREADY_CERTIFIED", t().applicantAlreadyCertified);

      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });

  test("non-applicant (no applicants row) denies as not found — zero writes", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createVerificationPlan(tx);

      const err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      expect(err).toBeInstanceOf(NotFoundError);
      expectDomainDenial(err, "APPLICANT_NOT_FOUND", t().applicantNotFound);

      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });

  test("missing idempotency key → localized validation denial — zero writes", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);

      const err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, null, "en", tx));
      expectDomainDenial(err, "VALIDATION", t().subscriptionPurchase.idempotencyKeyRequired);

      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });

  test("same-caller key replay throws the duplicate-request conflict and keeps ONE pair", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);
      const key = purchaseKey();

      const first = await VerificationPurchaseService.purchase(user.id, key, "en", tx);

      const replayErr = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, key, "en", tx));
      expect(replayErr).toBeInstanceOf(ConflictError);
      expectDomainDenial(replayErr, "DUPLICATE_REQUEST", t().duplicateRequest);

      // The replay burned no second row: one pair, one claim, still linked
      // to the FIRST purchase; the flip and the attempt ledger are untouched.
      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 1, payments: 1, claims: 1 });
      const claims = await tx
        .select()
        .from(subscriptionPurchaseIdempotency)
        .where(eq(subscriptionPurchaseIdempotency.userId, user.id));
      expect(claims[0].subscriptionId).toBe(first.subscription.id);
      const applicantRow = await readApplicantRow(tx, user.id);
      expect(applicantRow?.status).toBe(ApplicantStatus.InEvaluation);
      expect(applicantRow?.verificationAttempts).toBe(0);
    });
  });

  test("foreign caller replaying another applicant's key gets the oracle-safe not-found (no existence leak)", async () => {
    await runInRollback(async tx => {
      const owner = await createApplicantFixture(tx);
      const attacker = await createApplicantFixture(tx);
      await createVerificationPlan(tx);

      const spentKey = purchaseKey();
      await VerificationPurchaseService.purchase(owner.user.id, spentKey, "en", tx);

      const foreignErr = await expectRepoError(() =>
        VerificationPurchaseService.purchase(attacker.user.id, spentKey, "en", tx)
      );
      expect(foreignErr).toBeInstanceOf(NotFoundError);
      expectDomainDenial(foreignErr, "PAYMENT_NOT_FOUND", t().notFound);
      // No existence leak: the denial carries no owner identifiers.
      expect(foreignErr.message.includes(owner.user.id.toString())).toBe(false);
      expect(foreignErr.message.includes(owner.user.email)).toBe(false);

      // The attacker wrote nothing; the owner's pair is intact.
      const attackerCounts = await countRows(tx, attacker.user.id);
      expect(attackerCounts).toEqual({ subs: 0, payments: 0, claims: 0 });
      const ownerCounts = await countRows(tx, owner.user.id);
      expect(ownerCounts).toEqual({ subs: 1, payments: 1, claims: 1 });
    });
  });

  test("no ACTIVE catalog row with the canonical title → plan-not-purchasable denial — zero writes", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      const fixturePlan = await createVerificationPlan(tx);

      // Deterministic precondition inside this rollback unit: NO active
      // catalog row carries the canonical title. A previously seeded row
      // (if the data dir was seeded) is deactivated here too — the
      // rollback undoes it, so zero residue escapes either way. The
      // fixture row survives as INACTIVE, proving deactivated rows never
      // satisfy the resolution.
      await tx
        .update(plans)
        .set({ isActive: false, deactivatedAt: new Date() })
        .where(and(eq(plans.title, VERIFICATION_PLAN_TITLE), eq(plans.isActive, true)));

      const err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      expectDomainDenial(err, "PLAN_NOT_FOUND", t().subscriptionPurchase.planNotPurchasable);

      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
      expect(fixturePlan.isActive).toBe(true); // the fixture was active until the in-tx precondition flipped it
    });
  });

  test("a plan deactivated during checkout → the in-transaction plan re-validation denies, zero writes", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);
      const expectedPlan = await resolveActiveVerificationPlan(tx);
      if (expectedPlan === undefined) {
        throw new Error("expected an active verification plan row for the assertion anchor");
      }

      // The pre-checkout catalog read saw an ACTIVE plan; the deactivation
      // flips it during checkout (the checkout seam), so only the
      // in-transaction re-validation can catch it.
      const checkoutSpy = interceptCheckoutDuring(async () => {
        await PlanRepository.setActiveStatusOnce(expectedPlan.id, false, tx);
      });

      let err: Error;
      try {
        err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      } finally {
        checkoutSpy.mockRestore();
      }

      expectDomainDenial(err, "PLAN_NOT_FOUND", t().subscriptionPurchase.planNotPurchasable);

      // Thrown BEFORE any row write: no pair, no claim.
      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });

  test("a plan price changed during checkout → PLAN_PRICE_CHANGED validation denial, zero writes", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);
      const expectedPlan = await resolveActiveVerificationPlan(tx);
      if (expectedPlan === undefined) {
        throw new Error("expected an active verification plan row for the assertion anchor");
      }

      // Direct repo update riding the checkout seam: the pre-checkout read
      // fed the gateway the ORIGINAL price; the fresh in-transaction row now
      // disagrees — committing would pair the provider's charge with a
      // different stored amount (a settlement guaranteed to quarantine).
      const checkoutSpy = interceptCheckoutDuring(async () => {
        await PlanRepository.updatePlanFields(expectedPlan.id, { price: "999.99" }, tx);
      });

      let err: Error;
      try {
        err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      } finally {
        checkoutSpy.mockRestore();
      }

      // The generic localized validation label, machine-coded for the field
      // payload — the plan selector is the offending input.
      expectDomainDenial(err, "VALIDATION", t().validation);
      if (!(err instanceof ValidationError)) {
        throw new Error("expected the mid-flight price denial to be a ValidationError");
      }
      expect(err.fields).toEqual([{ field: "planId", code: "PLAN_PRICE_CHANGED", message: t().validation }]);

      // Thrown BEFORE any row write: no pair, no claim, no burned key.
      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });

  test("a caller suspended during checkout → forbidden denial, zero writes", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);

      // The pre-checkout governance check saw a CLEAN actor; the suspension
      // flips the actor's column during checkout (the session-lifecycle
      // fixture manipulation idiom), so only the in-transaction
      // re-assertion can catch it.
      const checkoutSpy = interceptCheckoutDuring(async () => {
        await tx.update(users).set({ suspended: true }).where(eq(users.id, user.id));
      });

      let err: Error;
      try {
        err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      } finally {
        checkoutSpy.mockRestore();
      }

      expectDomainDenial(err, "FORBIDDEN", t().forbidden);
      expect(err).toBeInstanceOf(ForbiddenError);

      // The governed caller wrote nothing: no pair, no claim.
      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });

  test("gateway checkout failure → zero rows (the provider call is the pre-transaction boundary)", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);

      const checkoutSpy = spyOn(MockPaymentGatewayAdapter.prototype, "createCheckout").mockRejectedValue(
        new Error("checkout provider unavailable")
      );

      let err: Error;
      try {
        err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx));
      } finally {
        checkoutSpy.mockRestore();
      }

      // The raw provider failure is NOT a domain error — it surfaces
      // untouched, and the whole purchase rolled back with zero rows
      // (no pair, no claim, no burned key).
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(DomainError);
      expect(err.message).toBe("checkout provider unavailable");

      const counts = await countRows(tx, user.id);
      expect(counts).toEqual({ subs: 0, payments: 0, claims: 0 });
    });
  });
});

describe("VerificationPurchaseService — purchase (Tier 2: boundaries)", () => {
  test("empty-string key treated as missing; 128-char key carried verbatim; 129 rejected", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);

      const emptyErr = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, "", "en", tx));
      expectDomainDenial(emptyErr, "VALIDATION", t().subscriptionPurchase.idempotencyKeyRequired);

      const maxKey = "k".repeat(128);
      const accepted = await VerificationPurchaseService.purchase(user.id, maxKey, "en", tx);
      expect(accepted.subscription.status).toBe(SubscriptionStatus.Pending);
      const claims = await tx
        .select()
        .from(subscriptionPurchaseIdempotency)
        .where(eq(subscriptionPurchaseIdempotency.userId, user.id));
      expect(claims).toHaveLength(1);
      expect(claims[0].idempotencyKey).toBe(maxKey);

      const overlongErr = await expectRepoError(() =>
        VerificationPurchaseService.purchase(user.id, "k".repeat(129), "en", tx)
      );
      expectDomainDenial(overlongErr, "VALIDATION", t().subscriptionPurchase.idempotencyKeyRequired);
    });
  });

  test("the plan row is the money source: the verbatim decimal amount lands on the NULL-owner payment", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);
      const expectedPlan = await resolveActiveVerificationPlan(tx);
      if (expectedPlan === undefined) {
        throw new Error("expected an active verification plan row for the assertion anchor");
      }

      const result = await VerificationPurchaseService.purchase(user.id, purchaseKey(), "en", tx);

      expect(result.subscription.planId).toBe(expectedPlan.id);
      expect(result.payment.amount).toBe(expectedPlan.price);
      expect(typeof result.payment.amount).toBe("string");
      expect(result.payment.currency).toBe(expectedPlan.currency);
      expect(expectedPlan.sessionCount).toBe(VERIFICATION_PLAN_SESSION_COUNT);

      const storedPayments = await tx
        .select()
        .from(studentPayments)
        .where(eq(studentPayments.subscriptionId, result.subscription.id));
      expect(storedPayments).toHaveLength(1);
      expect(storedPayments[0].studentId).toBeNull();
      expect(storedPayments[0].amount).toBe("150.00");
    });
  });
});

describe("VerificationPurchaseService — purchase (Tier 4: abuse/i18n)", () => {
  test("a multi-script idempotency key is carried verbatim (never trimmed, coerced, or logged)", async () => {
    await runInRollback(async tx => {
      const { user } = await createApplicantFixture(tx);
      await createVerificationPlan(tx);

      const unicodeKey = "مفتاح-🔑-验证".repeat(9); // multi-script, inside the 128-char ceiling
      const result = await VerificationPurchaseService.purchase(user.id, unicodeKey, "en", tx);
      expect(result.subscription.status).toBe(SubscriptionStatus.Pending);

      const claims = await tx
        .select()
        .from(subscriptionPurchaseIdempotency)
        .where(eq(subscriptionPurchaseIdempotency.userId, user.id));
      expect(claims).toHaveLength(1);
      expect(claims[0].idempotencyKey).toBe(unicodeKey);
    });
  });

  test("a unicode-named applicant's ar-locale cooldown denial is the byte-equal localized template (no user data in the copy)", async () => {
    await runInRollback(async tx => {
      const cooldownUntil = new Date(Date.now() + 60 * 60 * 1000);
      const { user } = await createApplicantFixture(
        tx,
        { status: ApplicantStatus.Failed, cooldownUntil },
        {
          fullName: UNICODE_APPLICANT_NAME,
        }
      );
      await createVerificationPlan(tx);

      const err = await expectRepoError(() => VerificationPurchaseService.purchase(user.id, purchaseKey(), "ar", tx));
      const expectedMessage = t("ar").applicantCooldownActive.replace(
        "{cooldownUntil}",
        formatCooldownExpectation(cooldownUntil, "ar")
      );
      expectDomainDenial(err, "APPLICANT_COOLDOWN_ACTIVE", expectedMessage);
      // The localized denial carries the formatted expiry only — no
      // user-derived material ever enters the client-facing copy.
      expect(err.message).not.toContain(UNICODE_APPLICANT_NAME);
    });
  });
});

describe("VerificationPurchaseService — purchase (chaos: production tx path, committed fixtures)", () => {
  let chaosUserId = 0;
  let chaosPlanId = 0;

  beforeAll(async () => {
    // Committed fixtures — the production path opens its OWN transaction
    // per call, so the race needs real committed entities (the sibling
    // billing chaos block).
    await db.transaction(async tx => {
      const { user } = await createApplicantFixture(tx);
      const plan = await createVerificationPlan(tx);
      chaosUserId = user.id;
      chaosPlanId = plan.id;
    });
  });

  afterAll(async () => {
    // FK-safe hard-delete of every fixture row. The NULL-owner payment
    // ledger rows are un-deletable through their append-only DELETE guard —
    // that leg runs under the sanctioned teardown-window trigger suspension
    // (the sibling billing teardown wraps this exact leg); with the ledger
    // leg resolved the rest deletes in strict child-first order.
    const ownedSubIds = (
      await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, chaosUserId))
    ).map(row => row.id);
    await withImmutabilityTriggersSuspended(["student_payments"], async () => {
      if (ownedSubIds.length > 0) {
        await db.delete(studentPayments).where(inArray(studentPayments.subscriptionId, ownedSubIds));
      }
    });
    await db.delete(subscriptionPurchaseIdempotency).where(eq(subscriptionPurchaseIdempotency.userId, chaosUserId));
    await db.delete(subscriptions).where(eq(subscriptions.userId, chaosUserId));
    await db.delete(applicants).where(eq(applicants.id, chaosUserId));
    await db.delete(plans).where(eq(plans.id, chaosPlanId));
    await db.delete(users).where(eq(users.id, chaosUserId));

    // Load-bearing residue proof: the teardown must leave zero rows behind.
    const residueCounts = await Promise.all([
      db.$count(subscriptions, eq(subscriptions.userId, chaosUserId)),
      db.$count(subscriptionPurchaseIdempotency, eq(subscriptionPurchaseIdempotency.userId, chaosUserId)),
      db.$count(applicants, eq(applicants.id, chaosUserId)),
      db.$count(users, eq(users.id, chaosUserId)),
      ownedSubIds.length > 0
        ? db.$count(studentPayments, inArray(studentPayments.subscriptionId, ownedSubIds))
        : Promise.resolve(0),
    ]);
    for (const count of residueCounts) {
      expect(count).toBe(0);
    }
  });

  function chaosPurchase(key: string): Promise<PurchaseSubscriptionReturnType> {
    // NO outerTx — the production path: the service opens its own
    // transaction, giving every concurrent call a real connection.
    return VerificationPurchaseService.purchase(chaosUserId, key, "en");
  }

  testOnRealPostgres(
    "concurrent double-submit on independent production transactions: one success, one conflict, ONE pair",
    async () => {
      // The SAME idempotency key rides BOTH concurrent attempts — the
      // invariant under test is same-key double-submit: the claim-race
      // loser must surface the duplicate-replay conflict, never mint a
      // second pair under a fresh key.
      const sharedKey = purchaseKey();
      const attempts = await Promise.allSettled([chaosPurchase(sharedKey), chaosPurchase(sharedKey)]);

      const fulfilled = attempts.filter(entry => entry.status === "fulfilled");
      const rejected = attempts.filter(entry => entry.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const reason = rejected[0].reason;
      expect(reason).toBeInstanceOf(ConflictError);
      expect(rejectionCode(reason)).toBe("DUPLICATE_REQUEST");

      // Exactly ONE pending pair survived the race (NULL payment owner),
      // the claim points at the winning subscription, and the guarded flip
      // was applied once with an untouched attempt ledger.
      const storedSubs = await db.select().from(subscriptions).where(eq(subscriptions.userId, chaosUserId));
      expect(storedSubs).toHaveLength(1);
      expect(storedSubs[0].status).toBe(SubscriptionStatus.Pending);
      const storedPayments = await db
        .select()
        .from(studentPayments)
        .where(inArray(studentPayments.subscriptionId, [storedSubs[0].id]));
      expect(storedPayments).toHaveLength(1);
      expect(storedPayments[0].studentId).toBeNull();
      const claims = await db
        .select()
        .from(subscriptionPurchaseIdempotency)
        .where(eq(subscriptionPurchaseIdempotency.userId, chaosUserId));
      expect(claims).toHaveLength(1);
      expect(claims[0].subscriptionId).toBe(storedSubs[0].id);
      const applicantRow = (await db.select().from(applicants).where(eq(applicants.id, chaosUserId)))[0];
      expect(applicantRow?.status).toBe(ApplicantStatus.InEvaluation);
      expect(applicantRow?.verificationAttempts).toBe(0);
    }
  );
});
