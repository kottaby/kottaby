/**
 * Cross-actor journey — teacher-applicant verification plan purchase →
 * webhook activation workflow.
 *
 * Sequential, actor-attributed steps executed against the REAL services on
 * the REAL test database (later steps observe the shared state earlier
 * steps committed):
 *
 *   1. System: the fixture cast — the platform-owned verification plan (the
 *      5-session reviews-lane catalog row the server resolves by its
 *      canonical title), Applicant A (`pending`), Applicant B (`failed`,
 *      re-application cooldown ACTIVE), Applicant C (`failed`, cooldown
 *      EXPIRED), and the foreign cast (a student, a parent, an admin, a
 *      certified teacher) — all committed and tracked.
 *   2. Applicant A purchases the verification plan under an idempotency key
 *      → ONE pending pair (subscription `pending` + payment `pending` with a
 *      NULL owner — no student-junction row) + the verbatim-keyed claim
 *      backfilled; the applicants row flips `pending → in_evaluation` with
 *      `verification_attempts` unchanged (a first purchase is not a
 *      re-application).
 *   3. System delivers the confirmed gateway event → subscription `active`
 *      (window = the resolved plan's intervalDays exactly), payment `paid`
 *      with the owner still NULL, NO lane credit attempted (no `students`
 *      row exists or is fabricated), and ONE `payment_confirmation`
 *      notification persisted + published strictly post-commit — addressed
 *      to Applicant A ONLY.
 *   4. Applicant B (cooldown active) attempts the purchase → the localized
 *      cooldown validation denial carrying the formatted expiry — and zero
 *      writes.
 *   5. Applicant C (cooldown expired) re-applies → success;
 *      `verification_attempts` incremented by exactly 1;
 *      `failed → in_evaluation`; the attempt instant stamped.
 *   6. The student (a non-applicant) attempts the purchase →
 *      `APPLICANT_NOT_FOUND`; the student's rows and balance lanes
 *      untouched.
 *   7. Foreign-actor denial probe: Applicant C — a DIFFERENT applicant in
 *      good standing — replays Applicant A's SPENT key → the oracle-safe
 *      generic not-found denial (no owner leak); the foreign caller's own
 *      committed pair and the owner's pair stay byte-identical. Owner-
 *      scoped visibility asserted BOTH directions: A and C see their own
 *      subscriptions through the owner-scoped read; every other cast
 *      member's list stays empty.
 *   8. System: `afterAll` hard-deletes every tracked id — the append-only
 *      payment ledger FIRST under the sanctioned immutability-trigger
 *      suspension — then re-probes every id → zero residue.
 *
 * Journey rules honored (`test/workflows/AGENTS.md`):
 * - fixtures COMMITTED (never `runInRollback` — the services under test
 *   spawn their own top-level transactions);
 * - honest actors: real `users` rows + real role-child rows (the
 *   `createJourneyFixtures` cast + the entity-setup builders); denials flow
 *   through the real service guards, nothing monkey-patched;
 * - the external publish boundary is SPIED (`NotificationEngine
 *   .publishReceipts`) and restored in `afterAll`; the persisted inbox rows
 *   remain the authoritative proof;
 * - error assertions through `catchJourneyError` + translated strings from
 *   `getServerTranslations("en")` — never `.rejects.toThrow()`, never raw
 *   English strings;
 * - per-run `jrn_teacherverify_<8hex>` prefix on every idempotency key and
 *   fixture name;
 * - cross-actor visibility asserted BOTH directions plus denial probes.
 *
 * Immutable-ledger residue policy: `student_payments` rows are append-only
 * (BEFORE DELETE trigger) and are deleted FIRST in `afterAll` under
 * `withImmutabilityTriggersSuspended`, followed by the claims →
 * subscriptions → plan → notifications legs (`TrackedFixtures`) and the
 * cast legs (`journeyCleanup`). Teardown must leave ZERO residue: every
 * registered id is re-probed after the sweep, and a leaking `afterAll`
 * fails the suite loudly. Unique per-run prefixes make any intermediate
 * crash residue greppable and harmless.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/backend/db";
import { PlanRepository } from "@/backend/db/repo";
import { plans } from "@/backend/db/schema/billing/plans";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";
import { subscriptionPurchaseIdempotency } from "@/backend/db/schema/billing/subscription-purchase-idempotency";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { notifications } from "@/backend/db/schema/notifications";
import { students } from "@/backend/db/schema/students/students";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { users } from "@/backend/db/schema/users/users";
import { createTestApplicant, createTestPlan, createTestUser } from "@/backend/db/test/entity-setup";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { NotFoundError, ValidationError } from "@/backend/lib/errors";
import { SubscriptionActivationService, SubscriptionPurchaseService } from "@/backend/services";
import { NotificationEngine } from "@/backend/services/notifications";
import { VerificationPurchaseService } from "@/backend/services/teachers/verification-purchase.service";
import type {
  ApplicantSelectType,
  DBTransaction,
  PaymentWebhookEvent,
  PlanSelectType,
  PurchaseSubscriptionReturnType,
  StudentSelectType,
  UserSelectType,
} from "@/backend/types";
import {
  VERIFICATION_PLAN_SESSION_COUNT,
  VERIFICATION_PLAN_TITLE,
} from "@/shared/constants/verification-plan.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { withImmutabilityTriggersSuspended } from "@/test/helpers/db-cleanup";
import {
  catchJourneyError,
  createJourneyFixtures,
  type JourneyFixtureBundle,
  journeyCleanup,
  journeyPrefix,
  TrackedFixtures,
} from "@/test/workflows/helpers";

// ─── Harness state ───────────────────────────────────────────────────────────

/** Per-run unique prefix — every fixture name and idempotency key. */
const PREFIX = journeyPrefix("teacherverify");

/** Error-copy locale for every service call and denial assertion. */
const ERRORS_EN = getServerTranslations("en").errorsTranslations;
/** Notification copy — the confirmation wave composes in the RECIPIENT's persisted locale. */
const NOTIFS_EN = getServerTranslations("en").notificationsTranslations;

/** Milliseconds per day — the activation-window and cooldown arithmetic. */
const MS_PER_DAY = 86_400_000;

const tracked = new TrackedFixtures();

/**
 * The publish spy — installed over the engine's post-commit publish boundary
 * (the activation service publishes through this exact namespace-bound seam;
 * it exposes no injected-transport parameter). Restored in `afterAll`.
 */
const publishSpy = spyOn(NotificationEngine, "publishReceipts").mockImplementation(async () => {});

/** Idempotency keys — one per purchase/denial leg, ≤128 chars, unique per run. */
const KEY_APPLICANT_A = `${PREFIX}-key-applicant-a`;
const KEY_APPLICANT_B = `${PREFIX}-key-applicant-b`;
const KEY_APPLICANT_C = `${PREFIX}-key-applicant-c`;
const KEY_STUDENT = `${PREFIX}-key-student`;

/** Ledger/money rows created by the services during the journey (teardown worklist). */
const ledgerPaymentIds: number[] = [];
const subscriptionIds: number[] = [];
const claimIds: number[] = [];
const notificationIds: number[] = [];
let planFixtureId = 0;

let bundle: JourneyFixtureBundle;
let planFixture: PlanSelectType;
let resolvedPlanRow: PlanSelectType;
let purchaseA: PurchaseSubscriptionReturnType;
let applicantB: ApplicantCastMember;
let applicantC: ApplicantCastMember;
let cooldownActiveUntil = new Date(0);
let cooldownExpiredAt = new Date(0);

/** A teacher-applicant cast member: user row + the committed applicants fixture row. */
interface ApplicantCastMember {
  readonly userId: number;
  readonly user: UserSelectType;
  readonly fixtureRow: ApplicantSelectType;
}

// ─── Read-back oracles ───────────────────────────────────────────────────────

/**
 * Committed purchase-set counters for one user. The payment leg joins
 * through the user's subscriptions so a NULL-owner verification ledger row
 * still counts (the ledger's owner column is deliberately NULL for
 * verification purchases).
 */
async function purchaseSetCounts(userId: number): Promise<{ subs: number; payments: number; claims: number }> {
  const [subs, payments, claims] = await Promise.all([
    db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, userId)),
    db
      .select({ id: studentPayments.id })
      .from(studentPayments)
      .innerJoin(subscriptions, eq(studentPayments.subscriptionId, subscriptions.id))
      .where(eq(subscriptions.userId, userId)),
    db
      .select({ id: subscriptionPurchaseIdempotency.id })
      .from(subscriptionPurchaseIdempotency)
      .where(eq(subscriptionPurchaseIdempotency.userId, userId)),
  ]);
  return { subs: subs.length, payments: payments.length, claims: claims.length };
}

/** Student-junction rows bound to one subscription (zero for verification purchases). */
async function junctionRowsFor(subscriptionId: number) {
  return db.select().from(studentSubscriptions).where(eq(studentSubscriptions.subscriptionId, subscriptionId));
}

/** Reads one applicants row by user id, failing when absent. */
async function applicantRow(userId: number): Promise<ApplicantSelectType> {
  const rows = await db.select().from(applicants).where(eq(applicants.id, userId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`applicants row ${userId} vanished`);
  }
  return row;
}

/** Reads one students row by user id, failing when absent. */
async function studentRow(userId: number): Promise<StudentSelectType> {
  const rows = await db.select().from(students).where(eq(students.id, userId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`students row ${userId} vanished`);
  }
  return row;
}

/** The credit lanes of one student cast member (the cross-actor balance probe). */
async function readStudentBalances(
  userId: number
): Promise<{ hifz: number | null; tajweed: number | null; reviews: number | null }> {
  const row = await studentRow(userId);
  return { hifz: row.balanceHifz, tajweed: row.balanceTajweed, reviews: row.balanceReviews };
}

/** Reads one payment ledger row by id, failing when absent. */
async function paymentRow(paymentId: number) {
  const rows = await db.select().from(studentPayments).where(eq(studentPayments.id, paymentId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`payment ledger row ${paymentId} vanished`);
  }
  return row;
}

/** Reads one subscription row by id, failing when absent. */
async function subscriptionRow(subscriptionId: number) {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`subscription row ${subscriptionId} vanished`);
  }
  return row;
}

/** Independent read-back oracle — direct Drizzle count on the inbox. */
async function inboxCount(userId: number): Promise<number> {
  return db.$count(notifications, eq(notifications.userId, userId));
}

/**
 * Byte-equal expansion of the localized cooldown denial's `{cooldownUntil}`
 * slot — the same fixed-options UTC formatter the server-side guard uses
 * (fixed time zone, fixed component set, forced 24-hour clock: the same
 * instant renders identically in every environment).
 */
function formatCooldownExpiry(instant: Date): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

// ─── Fixture provisioning ────────────────────────────────────────────────────

/**
 * Provisions one teacher-applicant cast member through the entity-setup
 * builders — a real `users` row (role teacher) plus a real `applicants`
 * row in the given lifecycle state — tracked via the bundle registry.
 */
async function provisionCooldownApplicant(
  tx: DBTransaction,
  discriminator: string,
  lifecycle: Partial<Pick<ApplicantSelectType, "status" | "verificationAttempts" | "lastAttemptAt" | "cooldownUntil">>
): Promise<ApplicantCastMember> {
  const user = await createTestUser(tx, {
    role: "teacher",
    fullName: `${PREFIX} applicant-${discriminator}`,
  });
  const fixtureRow = await createTestApplicant(tx, user.id, lifecycle);
  bundle.registry.trackUserId(user.id);
  return { userId: user.id, user, fixtureRow };
}

/**
 * Registers the pending pair + its verbatim-keyed claim for teardown and
 * asserts the claim's owner/backfill.
 */
async function trackPurchaseArtifacts(
  result: PurchaseSubscriptionReturnType,
  idempotencyKey: string,
  ownerUserId: number
): Promise<void> {
  tracked.register(subscriptions, result.subscription.id);
  subscriptionIds.push(result.subscription.id);
  tracked.register(studentPayments, result.payment.id);
  ledgerPaymentIds.push(result.payment.id);
  const claimRows = await db
    .select()
    .from(subscriptionPurchaseIdempotency)
    .where(eq(subscriptionPurchaseIdempotency.idempotencyKey, idempotencyKey));
  for (const claimRow of claimRows) {
    tracked.register(subscriptionPurchaseIdempotency, claimRow.id);
    claimIds.push(claimRow.id);
  }
  expect(claimRows).toHaveLength(1);
  expect(claimRows[0]?.userId).toBe(ownerUserId);
  expect(claimRows[0]?.subscriptionId).toBe(result.subscription.id);
}

/**
 * Post-teardown existence probes for EVERY registered id — each must be
 * absent (a leak fails the suite loudly). The `users`/`applicants` probes
 * cover the cast legs; the money-plane legs cover plan, subscriptions,
 * ledger, claims, and notifications.
 */
async function assertZeroResidue(): Promise<void> {
  const userIds = bundle.registry.userIds;
  const probes = [
    { label: "users", table: users, column: users.id, ids: userIds },
    { label: "applicants", table: applicants, column: applicants.id, ids: userIds },
    { label: "subscriptions", table: subscriptions, column: subscriptions.id, ids: subscriptionIds },
    { label: "student_payments", table: studentPayments, column: studentPayments.id, ids: ledgerPaymentIds },
    {
      label: "subscription_purchase_idempotency",
      table: subscriptionPurchaseIdempotency,
      column: subscriptionPurchaseIdempotency.id,
      ids: claimIds,
    },
    { label: "notifications", table: notifications, column: notifications.id, ids: notificationIds },
    { label: "plans", table: plans, column: plans.id, ids: planFixtureId > 0 ? [planFixtureId] : [] },
  ];
  const counts = await Promise.all(
    probes.map(probe =>
      probe.ids.length === 0 ? Promise.resolve(0) : db.$count(probe.table, inArray(probe.column, probe.ids))
    )
  );
  const residue = probes.filter((_, index) => (counts[index] ?? 0) > 0).map(probe => probe.label);
  if (residue.length > 0) {
    throw new Error(`journey teardown residue — rows still exist for: ${residue.join(", ")}`);
  }
}

beforeAll(async () => {
  // Unit 1 — the actor cast (commit-or-nothing inside the cast provisioner):
  // real users rows + real role-child rows, tracked by the bundle registry.
  bundle = await createJourneyFixtures(PREFIX);

  // Unit 2 — the verification-flow fixtures, ONE committing transaction:
  // the purchaser's persisted locale (the confirmation copy composes in the
  // RECIPIENT's persisted locale), the two cooldown-path applicants, and the
  // journey's own plan row (never seed-trusted).
  const fixtureNow = Date.now();
  cooldownActiveUntil = new Date(fixtureNow + 7 * MS_PER_DAY);
  cooldownExpiredAt = new Date(fixtureNow - 2 * MS_PER_DAY);
  await db.transaction(async tx => {
    await tx.update(users).set({ locale: "en" }).where(eq(users.id, bundle.cast.applicant.user.id));

    applicantB = await provisionCooldownApplicant(tx, "b", {
      status: ApplicantStatus.Failed,
      verificationAttempts: 1,
      lastAttemptAt: new Date(fixtureNow - 8 * MS_PER_DAY),
      cooldownUntil: cooldownActiveUntil,
    });
    applicantC = await provisionCooldownApplicant(tx, "c", {
      status: ApplicantStatus.Failed,
      verificationAttempts: 1,
      lastAttemptAt: new Date(fixtureNow - 9 * MS_PER_DAY),
      cooldownUntil: cooldownExpiredAt,
    });

    planFixture = await createTestPlan(tx, {
      title: VERIFICATION_PLAN_TITLE,
      sessionCount: VERIFICATION_PLAN_SESSION_COUNT,
      balanceLane: SubscriptionCreditLane.Reviews,
      price: "150.00",
      intervalDays: 14,
      isActive: true,
    });
    planFixtureId = planFixture.id;
    tracked.register(plans, planFixture.id);
  });

  // The plan row the service will ACTUALLY resolve: the same lookup the
  // purchase performs (the ACTIVE catalog scanned for the canonical
  // verification-plan title). The sandbox catalog may already carry a seeded
  // same-title row — every plan-derived assertion anchors to THIS row,
  // never to which same-title row a given data dir happens to hold.
  const activeCatalog = await PlanRepository.listActive();
  const resolved = activeCatalog.find(candidate => candidate.title === VERIFICATION_PLAN_TITLE);
  if (!resolved) {
    throw new Error(
      `journey fixture: no active catalog plan titled "${VERIFICATION_PLAN_TITLE}" — the purchase surface has no purchasable plan`
    );
  }
  resolvedPlanRow = resolved;
});

afterAll(async () => {
  publishSpy.mockRestore();
  // Immutable-ledger teardown leg FIRST: the append-only trigger blocks a
  // plain DELETE, so the sanctioned suspension wraps exactly this leg (with
  // its own residue probe).
  if (ledgerPaymentIds.length > 0) {
    await withImmutabilityTriggersSuspended(["student_payments"], async () => {
      await db.delete(studentPayments).where(inArray(studentPayments.id, ledgerPaymentIds));
      const ledgerResidue = await db.$count(studentPayments, inArray(studentPayments.id, ledgerPaymentIds));
      if (ledgerResidue !== 0) {
        throw new Error(`journey teardown: ${ledgerResidue} student_payments row(s) survived deletion`);
      }
    });
  }
  // Money-plane legs (reverse registration order + per-row re-probes):
  // notifications → claims → subscriptions → the journey plan row.
  await tracked.cleanup();
  // Cast legs: audit logs (suspension-wrapped) → role-child rows → users.
  await journeyCleanup(bundle.registry);
  // Mandatory zero-residue proof — EVERY registered id re-probed.
  await assertZeroResidue();
});

// ─── The journey ─────────────────────────────────────────────────────────────

describe("cross-actor journey: verification plan purchase → webhook activation", () => {
  test("step 1 — System: the cast and the plan fixture hold the journey's preconditions", async () => {
    // Honest roles across the cast: the applicants are real teacher users,
    // the foreign actors hold their own real roles.
    expect(bundle.cast.applicant.user.role).toBe("teacher");
    expect(applicantB.user.role).toBe("teacher");
    expect(applicantC.user.role).toBe("teacher");
    expect(bundle.cast.student.user.role).toBe("student");
    expect(bundle.cast.parent.user.role).toBe("parent");
    expect(bundle.cast.admin.user.role).toBe("admin");
    expect(bundle.cast.certifiedTeacher.user.role).toBe("teacher");

    // Applicant A: a pending applicants row — attempts 0, no cooldown.
    expect(bundle.cast.applicant.child.status).toBe(ApplicantStatus.Pending);
    expect(bundle.cast.applicant.child.verificationAttempts ?? 0).toBe(0);
    expect(bundle.cast.applicant.child.cooldownUntil).toBeNull();

    // Applicant B: failed, one prior attempt, cooldown strictly future.
    expect(applicantB.fixtureRow.status).toBe(ApplicantStatus.Failed);
    expect(applicantB.fixtureRow.verificationAttempts ?? 0).toBe(1);
    expect(applicantB.fixtureRow.cooldownUntil?.getTime()).toBe(cooldownActiveUntil.getTime());
    expect(cooldownActiveUntil.getTime()).toBeGreaterThan(Date.now());

    // Applicant C: failed, one prior attempt, cooldown strictly past.
    expect(applicantC.fixtureRow.status).toBe(ApplicantStatus.Failed);
    expect(applicantC.fixtureRow.verificationAttempts ?? 0).toBe(1);
    expect(applicantC.fixtureRow.cooldownUntil?.getTime()).toBe(cooldownExpiredAt.getTime());
    expect(cooldownExpiredAt.getTime()).toBeLessThan(Date.now());

    // The journey's own plan row mirrors the canonical verification plan's
    // catalog shape (never seed-trusted; tracked for teardown).
    expect(planFixture.title).toBe(VERIFICATION_PLAN_TITLE);
    expect(planFixture.sessionCount).toBe(VERIFICATION_PLAN_SESSION_COUNT);
    expect(planFixture.balanceLane).toBe(SubscriptionCreditLane.Reviews);
    expect(planFixture.isActive).toBe(true);

    // The resolved plan is what the purchase will charge: active, canonical
    // title, five sessions, reviews lane.
    expect(resolvedPlanRow.isActive).toBe(true);
    expect(resolvedPlanRow.title).toBe(VERIFICATION_PLAN_TITLE);
    expect(resolvedPlanRow.sessionCount).toBe(VERIFICATION_PLAN_SESSION_COUNT);
    expect(resolvedPlanRow.balanceLane).toBe(SubscriptionCreditLane.Reviews);
  });

  test("step 2 — Applicant A: purchase commits ONE pending pair with a NULL owner + verbatim claim; pending → in_evaluation; attempts unchanged", async () => {
    const countsBefore = await purchaseSetCounts(bundle.cast.applicant.user.id);

    const result = await VerificationPurchaseService.purchase(bundle.cast.applicant.user.id, KEY_APPLICANT_A, "en");
    purchaseA = result;

    // The returned pending pair: subscription pending with the gateway
    // reference correlation; the payment pending with a NULL owner and the
    // plan row's verbatim money (no arithmetic, no client values).
    expect(result.subscription.status).toBe(SubscriptionStatus.Pending);
    expect(result.subscription.userId).toBe(bundle.cast.applicant.user.id);
    expect(result.subscription.planId).toBe(resolvedPlanRow.id);
    expect(result.subscription.paymentMethod).toBe(PaymentGateway.Mock);
    expect(result.subscription.paymentReference).toBe(result.checkout.providerReference);
    expect(result.checkout.provider).toBe(PaymentGateway.Mock);
    expect(result.checkout.providerReference.startsWith("mock_")).toBe(true);
    expect(result.checkout.checkoutUrl).toBeNull();
    expect(result.payment.status).toBe(PaymentStatus.Pending);
    expect(result.payment.studentId).toBeNull();
    expect(result.payment.subscriptionId).toBe(result.subscription.id);
    expect(result.payment.amount).toBe(resolvedPlanRow.price);
    expect(result.payment.currency).toBe(resolvedPlanRow.currency);

    // Track every service-created row for teardown before asserting
    // cardinality — any surprise must not strand committed rows.
    await trackPurchaseArtifacts(result, KEY_APPLICANT_A, bundle.cast.applicant.user.id);

    // Exactly ONE committed pending set for the purchaser — and NO
    // student-junction row (an applicant owns no students row, so the
    // junction insert is never attempted).
    expect(await purchaseSetCounts(bundle.cast.applicant.user.id)).toEqual({
      subs: countsBefore.subs + 1,
      payments: countsBefore.payments + 1,
      claims: countsBefore.claims + 1,
    });
    expect(await junctionRowsFor(result.subscription.id)).toHaveLength(0);

    // The purchase-time lifecycle flip: pending → in_evaluation. A FIRST
    // purchase never increments the attempt ledger.
    const after = await applicantRow(bundle.cast.applicant.user.id);
    expect(after.status).toBe(ApplicantStatus.InEvaluation);
    expect(after.verificationAttempts ?? 0).toBe(bundle.cast.applicant.child.verificationAttempts ?? 0);
    expect(after.lastAttemptAt).toBeNull();
  });

  test("step 3 — System: confirmed webhook → active + paid with the owner still NULL; NO lane credit; ONE receipt published to Applicant A ONLY", async () => {
    const reference = purchaseA.subscription.paymentReference;
    if (reference === null) {
      throw new Error("expected the pending subscription to carry the gateway payment reference");
    }
    const studentBalancesBefore = await readStudentBalances(bundle.cast.student.user.id);
    const windowStart = Date.now() - 2_000;

    const event: PaymentWebhookEvent = {
      reference,
      outcome: "confirmed",
      amount: purchaseA.payment.amount,
      currency: purchaseA.payment.currency,
    };
    const outcome = await SubscriptionActivationService.processWebhookEvent(event, "en");
    expect(outcome).toEqual({ processed: true });

    // The activation window: startDate ≈ now, verification stamped,
    // endDate − startDate = the resolved plan's intervalDays exactly.
    const active = await subscriptionRow(purchaseA.subscription.id);
    expect(active.status).toBe(SubscriptionStatus.Active);
    expect(active.paymentVerifiedAt).not.toBeNull();
    if (active.startDate === null || active.endDate === null) {
      throw new Error("expected the activated subscription to carry its window dates");
    }
    expect(active.startDate.getTime()).toBeGreaterThanOrEqual(windowStart);
    expect(active.endDate.getTime() - active.startDate.getTime()).toBe(resolvedPlanRow.intervalDays * MS_PER_DAY);

    // The ledger decision: pending → paid, owner STILL NULL.
    const paid = await paymentRow(purchaseA.payment.id);
    expect(paid.status).toBe(PaymentStatus.Paid);
    expect(paid.studentId).toBeNull();

    // NO lane credit for a verification purchase: the purchaser still has no
    // students row and none was fabricated, no junction row appeared, and
    // the student cast member's own lanes are byte-identical.
    expect(await db.$count(students, eq(students.id, bundle.cast.applicant.user.id))).toBe(0);
    expect(await junctionRowsFor(purchaseA.subscription.id)).toHaveLength(0);
    expect(await readStudentBalances(bundle.cast.student.user.id)).toEqual(studentBalancesBefore);

    // The purchaser's lifecycle row is untouched by activation (activation
    // owns money finality + notification only).
    const applicantAfter = await applicantRow(bundle.cast.applicant.user.id);
    expect(applicantAfter.status).toBe(ApplicantStatus.InEvaluation);
    expect(applicantAfter.verificationAttempts ?? 0).toBe(bundle.cast.applicant.child.verificationAttempts ?? 0);

    // ONE persisted notification, composed for the purchaser in their
    // persisted locale.
    const inboxRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, bundle.cast.applicant.user.id));
    expect(inboxRows).toHaveLength(1);
    const row = inboxRows[0];
    if (!row) {
      throw new Error("expected exactly one notification row for the purchaser");
    }
    tracked.register(notifications, row.id);
    notificationIds.push(row.id);
    expect(row.type).toBe(NotificationType.PaymentConfirmation);
    expect(row.relatedEntityType).toBe("subscription");
    expect(row.relatedEntityId).toBe(purchaseA.subscription.id);
    expect(row.isRead).toBe(false);
    expect(row.title).toBe(NOTIFS_EN.eventPaymentConfirmedTitle);
    expect(row.body).toBe(NOTIFS_EN.eventPaymentConfirmedBody(resolvedPlanRow.title));

    // The receipt published strictly post-commit — to Applicant A ONLY.
    expect(publishSpy.mock.calls).toHaveLength(1);
    const receipts = publishSpy.mock.calls[0]?.[0];
    if (receipts?.length !== 1) {
      throw new Error("expected exactly one published delivery receipt");
    }
    expect(receipts[0]?.recipientUserIds).toEqual([bundle.cast.applicant.user.id]);

    // Cross-actor: no other cast member's inbox exists or grew.
    const foreignInboxes = await Promise.all(
      [
        applicantB.userId,
        applicantC.userId,
        bundle.cast.student.user.id,
        bundle.cast.parent.user.id,
        bundle.cast.admin.user.id,
        bundle.cast.certifiedTeacher.user.id,
      ].map(userId => inboxCount(userId))
    );
    for (const count of foreignInboxes) {
      expect(count).toBe(0);
    }
  });

  test("step 4 — Applicant B (cooldown active): purchase denied with the localized cooldown message; zero writes", async () => {
    const countsBefore = await purchaseSetCounts(applicantB.userId);
    const applicantBefore = await applicantRow(applicantB.userId);

    const denial = await catchJourneyError(() =>
      VerificationPurchaseService.purchase(applicantB.userId, KEY_APPLICANT_B, "en")
    );
    if (!(denial instanceof ValidationError)) {
      throw new Error(`expected ValidationError (got ${denial instanceof Error ? denial.name : String(denial)})`);
    }
    expect(denial.code).toBe("APPLICANT_COOLDOWN_ACTIVE");
    // The server-composed copy with the formatted expiry: byte-equal to the
    // localized template expanded over the fixture's cooldown instant.
    expect(denial.message).toBe(
      ERRORS_EN.applicantCooldownActive.replace("{cooldownUntil}", formatCooldownExpiry(cooldownActiveUntil))
    );

    // The denial wrote nothing: the purchase set is unchanged and the
    // applicants row is byte-identical (status, attempts, cooldown, stamp).
    expect(await purchaseSetCounts(applicantB.userId)).toEqual(countsBefore);
    const applicantAfter = await applicantRow(applicantB.userId);
    expect(applicantAfter.status).toBe(applicantBefore.status);
    expect(applicantAfter.verificationAttempts).toBe(applicantBefore.verificationAttempts);
    expect(applicantAfter.cooldownUntil?.getTime()).toBe(applicantBefore.cooldownUntil?.getTime());
    expect(applicantAfter.lastAttemptAt?.getTime()).toBe(applicantBefore.lastAttemptAt?.getTime());
  });

  test("step 5 — Applicant C (cooldown expired): re-application succeeds; attempts incremented by exactly 1; failed → in_evaluation", async () => {
    const countsBefore = await purchaseSetCounts(applicantC.userId);

    const result = await VerificationPurchaseService.purchase(applicantC.userId, KEY_APPLICANT_C, "en");

    // The second pending pair: same money-spine shape, NULL owner.
    expect(result.subscription.status).toBe(SubscriptionStatus.Pending);
    expect(result.subscription.userId).toBe(applicantC.userId);
    expect(result.subscription.planId).toBe(resolvedPlanRow.id);
    expect(result.payment.status).toBe(PaymentStatus.Pending);
    expect(result.payment.studentId).toBeNull();
    expect(result.payment.amount).toBe(resolvedPlanRow.price);
    expect(result.payment.currency).toBe(resolvedPlanRow.currency);
    await trackPurchaseArtifacts(result, KEY_APPLICANT_C, applicantC.userId);

    // The re-application contract: attempts incremented by exactly 1, the
    // failed status returned to in_evaluation, the attempt instant stamped.
    const after = await applicantRow(applicantC.userId);
    expect(after.status).toBe(ApplicantStatus.InEvaluation);
    expect(after.verificationAttempts ?? 0).toBe((applicantC.fixtureRow.verificationAttempts ?? 0) + 1);
    expect(after.lastAttemptAt).not.toBeNull();

    // The purchase gate is read-only over the cooldown: the expired instant
    // is untouched by the re-application.
    expect(after.cooldownUntil?.getTime()).toBe(cooldownExpiredAt.getTime());

    // The committed pending set grew by exactly the second pair.
    expect(await purchaseSetCounts(applicantC.userId)).toEqual({
      subs: countsBefore.subs + 1,
      payments: countsBefore.payments + 1,
      claims: countsBefore.claims + 1,
    });
  });

  test("step 6 — Student (non-applicant): purchase denied with APPLICANT_NOT_FOUND; zero side effects", async () => {
    const countsBefore = await purchaseSetCounts(bundle.cast.student.user.id);
    const studentBefore = await readStudentBalances(bundle.cast.student.user.id);

    const denial = await catchJourneyError(() =>
      VerificationPurchaseService.purchase(bundle.cast.student.user.id, KEY_STUDENT, "en")
    );
    if (!(denial instanceof NotFoundError)) {
      throw new Error(`expected NotFoundError (got ${denial instanceof Error ? denial.name : String(denial)})`);
    }
    expect(denial.code).toBe("APPLICANT_NOT_FOUND");
    expect(denial.message).toBe(ERRORS_EN.applicantNotFound);

    // Zero side effects: no purchase rows, the students row still exists,
    // and the balance lanes are byte-identical.
    expect(await purchaseSetCounts(bundle.cast.student.user.id)).toEqual(countsBefore);
    expect(await readStudentBalances(bundle.cast.student.user.id)).toEqual(studentBefore);
  });

  test("step 7 — Applicant C as foreign caller: replaying Applicant A's SPENT key → oracle-safe denial, no leak, no writes; owner-scoped visibility holds both ways", async () => {
    const ownerCounts = await purchaseSetCounts(bundle.cast.applicant.user.id);
    const foreignCounts = await purchaseSetCounts(applicantC.userId);

    // The foreign applicant attempts a write against another actor's
    // purchase by replaying the owner's spent key. The lifecycle guard lets
    // a good-standing applicant through, and the claim-table arbiter denies
    // oracle-safely: another user's claim is never surfaced.
    const denial = await catchJourneyError(() =>
      VerificationPurchaseService.purchase(applicantC.userId, KEY_APPLICANT_A, "en")
    );
    if (!(denial instanceof NotFoundError)) {
      throw new Error(`expected NotFoundError (got ${denial instanceof Error ? denial.name : String(denial)})`);
    }
    expect(denial.code).toBe("PAYMENT_NOT_FOUND");
    expect(denial.message).toBe(ERRORS_EN.notFound);
    // Oracle-safe: the generic denial leaks nothing about the key's owner.
    expect(denial.message).not.toContain(bundle.cast.applicant.user.email);
    expect(denial.message).not.toContain(PREFIX);

    // The foreign caller wrote nothing; the owner's committed pair is
    // byte-identical (still active + paid, claim still pointing home).
    expect(await purchaseSetCounts(applicantC.userId)).toEqual(foreignCounts);
    expect(await purchaseSetCounts(bundle.cast.applicant.user.id)).toEqual(ownerCounts);
    expect((await paymentRow(purchaseA.payment.id)).status).toBe(PaymentStatus.Paid);
    expect((await subscriptionRow(purchaseA.subscription.id)).status).toBe(SubscriptionStatus.Active);
    const ownerClaim = await db
      .select()
      .from(subscriptionPurchaseIdempotency)
      .where(eq(subscriptionPurchaseIdempotency.idempotencyKey, KEY_APPLICANT_A));
    expect(ownerClaim).toHaveLength(1);
    expect(ownerClaim[0]?.subscriptionId).toBe(purchaseA.subscription.id);

    // Owner-scoped visibility, BOTH directions: the purchasers see their own
    // subscriptions through the owner-scoped read; every other cast
    // member's list stays empty.
    const ownedA = await SubscriptionPurchaseService.listOwn(bundle.cast.applicant.user.id);
    expect(ownedA).toHaveLength(1);
    expect(ownedA[0]?.id).toBe(purchaseA.subscription.id);
    expect(ownedA[0]?.status).toBe(SubscriptionStatus.Active);
    const ownedC = await SubscriptionPurchaseService.listOwn(applicantC.userId);
    expect(ownedC).toHaveLength(1);
    expect(ownedC[0]?.status).toBe(SubscriptionStatus.Pending);
    const foreignLists = await Promise.all(
      [
        applicantB.userId,
        bundle.cast.student.user.id,
        bundle.cast.parent.user.id,
        bundle.cast.admin.user.id,
        bundle.cast.certifiedTeacher.user.id,
      ].map(userId => SubscriptionPurchaseService.listOwn(userId))
    );
    for (const list of foreignLists) {
      expect(list).toEqual([]);
    }

    // The foreign caller's own pending pair is untouched by the denial.
    const foreignOwned = await SubscriptionPurchaseService.listOwn(applicantC.userId);
    expect(foreignOwned).toHaveLength(1);
    expect(foreignOwned[0]?.status).toBe(SubscriptionStatus.Pending);

    // The denials emitted nothing: the confirmation inbox stands alone.
    expect(await inboxCount(bundle.cast.applicant.user.id)).toBe(1);
    const foreignInboxes = await Promise.all(
      [applicantB.userId, applicantC.userId, bundle.cast.student.user.id].map(userId => inboxCount(userId))
    );
    for (const count of foreignInboxes) {
      expect(count).toBe(0);
    }
  });
});
