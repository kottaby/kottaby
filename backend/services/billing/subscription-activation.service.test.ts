/**
 * SubscriptionActivationService tests — the webhook-facing activation flow
 * (reference correlation, settlement quarantine, the guarded
 * confirmed/failed decision paths, the exactly-once credit, the replay
 * classification, and the persist-first/publish-after-commit notification)
 * against the live PGlite database on REAL repositories.
 *
 * Per `backend/db/test/AGENTS.md` (the DB-backed service-test rules the
 * sibling suites apply):
 *  - Every transactional case runs inside `runInRollback`; the `tx` is
 *    propagated to the service as its `outerTx` seam so the whole delivery
 *    (pre-reads included) executes on the caller's transaction. The only
 *    exception is the true-concurrency chaos case, which needs REAL
 *    independent transactions (committed fixtures — see below).
 *  - Entities are created ONLY via `entity-setup.ts` helpers — never seed
 *    data; nothing escapes the transaction.
 *  - NO `expect(...).rejects.toThrow()` — every denial and quarantine is
 *    asserted through its returned outcome plus the correlated log spy,
 *    never through a pinned throw.
 *  - The notification persistence seam and the realtime publish are SPIED
 *    (never real `notifications` rows, never a live transport): the
 *    insert spy captures the exact composed row content; the publish spy
 *    proves the post-commit receipt hand-off. Spies are tracked and
 *    restored per test (bun reuses ONE mock per object+method pair).
 *
 * Coverage map:
 *  - Tier 1 (branch/statement): the confirmed happy path (paid + active +
 *    dates + lane credited + notification row content + post-commit
 *    publish); unknown reference → `{ processed: false }` warn, zero
 *    mutation; failed path (payment failed, subscription untouched, no
 *    credit, no notification); duplicate confirmed → replay ack with no
 *    double credit/notification; late confirmed after failed → rejected &
 *    logged (replay-incompatible); NULL balance lane at activation → the
 *    quarantine (`{ processed: false }`, zero mutation, one correlated
 *    error log) — the lane-clear is REACHABLE after a purchase commits.
 *  - Tier 2 (boundary): currency mismatch quarantines; the exact balance
 *    delta equals the plan's `sessionCount` (other lanes untouched); the
 *    REVIEWS-lane activation credits `balance_reviews` by `sessionCount`
 *    (hifz/tajweed byte-identical — every pgEnum member is routable); a
 *    legacy plan row written past the interval-days activation ceiling
 *    (direct-DB `interval_days` = 1e8, which would overflow the Date window
 *    arithmetic into a non-domain error) QUARANTINES — `{ processed: false }`,
 *    zero writes, one correlated error log.
 *  - Tier 3 (chaos): out-of-order delivery — a stale `failed` after a won
 *    confirmation replays without downgrading anything; true-concurrent
 *    double-webhook through `Promise.allSettled` proving ONE credit + one
 *    replay (gated to real multi-connection PostgreSQL — PGlite is a
 *    single-connection shim whose interleaved savepoints poison the loser
 *    instead of racing two independent claims, so the serialized Tier-1
 *    replay case carries the invariant here).
 *  - Tier 4 (abuse): a tampered (reduced) amount quarantines with zero
 *    mutation; the zero-credit replay proof — balance read before/after a
 *    duplicate delivery is byte-identical and the decided rows untouched.
 *  - Window-arithmetic lock-in (Tier 2 boundaries, verify-and-pin — the
 *    activation flow's window arithmetic is pinned, never re-implemented):
 *    the committed row's endDate − startDate equals the plan row's
 *    intervalDays × 86_400_000 exactly (one captured `now`; the
 *    second-precision form is pinned as well), the minimum plan interval
 *    (interval_days = 1, the CHECK's > 0 floor) yields an exactly-one-day
 *    window, the leap-day-adjacent property is pinned via the observed-row
 *    delta cross-checked against UTC calendar-field normalization, and
 *    interval_days = 0 / NULL is impossible by the plans_interval_days_check
 *    DB CHECK + NOT NULL (DB-layer probe + live table-config introspection;
 *    subscriptions carries no interval column at all).
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { db } from "@/backend/db";
import { NotificationRepository } from "@/backend/db/repo";
import { plans } from "@/backend/db/schema/billing/plans";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { students } from "@/backend/db/schema/students/students";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestPlan,
  createTestStudent,
  createTestStudentPayment,
  createTestSubscription,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { constraintNameOf, expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { logger } from "@/backend/lib/logger";
import { MAX_SESSION_COUNT } from "@/backend/services/billing/plan-catalog.helpers";
import { SubscriptionActivationService } from "@/backend/services/billing/subscription-activation.service";
import { NotificationEngine } from "@/backend/services/notifications";
import type {
  DBTransaction,
  NotificationReturnType,
  PaymentWebhookEvent,
  PlanSelectType,
  StudentPaymentSelectType,
  StudentSelectType,
  SubscriptionSelectType,
  UserSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { isPgliteProvider } from "@/test/helpers/skip-when-pglite";
import { secondPrecisionMs } from "@/test/workflows/helpers/second-precision";

/** Concurrent-transaction cases run ONLY on a real multi-connection PostgreSQL. */
const testOnRealPostgres = isPgliteProvider() ? test.skip : test;

/** The en notifications bundle the assertions compose against. */
const EN_NOTIFICATIONS = getServerTranslations("en").notificationsTranslations;

/** The ar notifications bundle (the platform default locale's copy). */
const AR_NOTIFICATIONS = getServerTranslations("ar").notificationsTranslations;

/** Stand-in primary keys for the stubbed notification rows. */
let notificationRowSeq = 900_000;

/**
 * Registry of every spy created during the currently running test. bun's
 * `spyOn` reuses ONE mock per object+method pair until it is restored, so
 * an unrestored mock keeps accumulating `mock.calls` across tests and
 * poisons later call-count assertions — every spy is registered here and
 * restored by the file-level `afterEach`.
 */
const trackedSpies: Array<{ restore(): void }> = [];

function trackSpy<T extends { mockRestore(): void }>(spy: T): T {
  trackedSpies.push({ restore: () => spy.mockRestore() });
  return spy;
}

afterEach(() => {
  for (const entry of trackedSpies) {
    entry.restore();
  }
  trackedSpies.length = 0;
});

/** One pending purchase pair + its plan — the fixture every delivery path needs. */
interface ActivationFixture {
  readonly user: UserSelectType;
  readonly student: StudentSelectType;
  readonly plan: PlanSelectType;
  readonly subscription: SubscriptionSelectType;
  readonly payment: StudentPaymentSelectType;
}

async function provisionPendingPair(
  tx: DBTransaction,
  planOverrides: Partial<PlanSelectType> = {},
  userOverrides: Partial<UserSelectType> = {}
): Promise<ActivationFixture> {
  const user = await createTestUser(tx, userOverrides);
  const student = await createTestStudent(tx, user.id);
  const plan = await createTestPlan(tx, {
    balanceLane: SubscriptionCreditLane.Hifz,
    sessionCount: 5,
    intervalDays: 30,
    ...planOverrides,
  });
  const subscription = await createTestSubscription(tx, student.id, plan.id, {
    status: SubscriptionStatus.Pending,
    paymentMethod: PaymentGateway.Mock,
    paymentReference: `mock_${crypto.randomUUID()}`,
    startDate: null,
    endDate: null,
    paymentVerifiedAt: null,
  });
  const payment = await createTestStudentPayment(tx, student.id, subscription.id, {
    status: PaymentStatus.Pending,
    paymentGateway: PaymentGateway.Mock,
    amount: plan.price,
    currency: plan.currency,
  });
  return { user, student, plan, subscription, payment };
}

/** A verified `confirmed` event carrying the pair's settled amount. */
function confirmedEvent(reference: string, amount: string, currency = "EGP"): PaymentWebhookEvent {
  return { reference, outcome: "confirmed", amount, currency };
}

/** A verified `failed` event carrying the pair's settled amount. */
function failedEvent(reference: string, amount: string, currency = "EGP"): PaymentWebhookEvent {
  return { reference, outcome: "failed", amount, currency };
}

/** Spy seam doubles: the notification insert (row content capture) + the post-commit publish. */
function spyNotificationSeams(): {
  insertSpy: ReturnType<typeof spyOn>;
  publishSpy: ReturnType<typeof spyOn>;
} {
  const insertSpy = trackSpy(spyOn(NotificationRepository, "createReturning"));
  insertSpy.mockImplementation(async insert => {
    notificationRowSeq += 1;
    const row: NotificationReturnType = {
      id: notificationRowSeq,
      userId: insert.userId,
      type: insert.type,
      title: insert.title,
      body: insert.body ?? null,
      isRead: false,
      relatedEntityType: insert.relatedEntityType ?? null,
      relatedEntityId: insert.relatedEntityId ?? null,
      createdAt: new Date(),
    };
    return row;
  });
  const publishSpy = trackSpy(spyOn(NotificationEngine, "publishReceipts"));
  publishSpy.mockImplementation(async () => {});
  return { insertSpy, publishSpy };
}

/** Reads the student's live balance lanes. */
async function readBalances(tx: DBTransaction, studentId: number): Promise<StudentSelectType> {
  const rows = await tx.select().from(students).where(eq(students.id, studentId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("fixture vanished: student row not found");
  }
  return row;
}

/**
 * Assertion-free narrowing of a nullable timestamp that MUST have been
 * stamped — a null here fails the test with a named reason instead of
 * poisoning a later `.getTime()` with `undefined`.
 */
function stampedDateOf(value: Date | null | undefined, column: string): Date {
  if (value === null || value === undefined) {
    throw new Error(`expected ${column} to be stamped, found ${String(value)}`);
  }
  return value;
}

describe("SubscriptionActivationService — confirmed path (Tier 1: branches)", () => {
  test("happy path: activation commits, lane credited, notification composed + published after commit", async () => {
    await runInRollback(async tx => {
      // The recipient carries an explicit stored locale ("en") — the copy
      // assertions below compose against the EN bundle (the recipient's
      // persisted preference owns the copy, never the caller locale).
      const { student, plan, subscription, payment } = await provisionPendingPair(tx, {}, { locale: "en" });
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const silenceSpy = trackSpy(spyOn(logger, "logDomainError"));

      const before = new Date(Date.now() - 1000);
      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      const after = new Date(Date.now() + 1000);

      expect(outcome).toEqual({ processed: true });
      expect(silenceSpy).not.toHaveBeenCalled();

      // The subscription row — active with the activation window stamped.
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      const sub = subRows[0];
      expect(sub?.status).toBe(SubscriptionStatus.Active);
      const start = stampedDateOf(sub?.startDate, "subscriptions.start_date");
      const end = stampedDateOf(sub?.endDate, "subscriptions.end_date");
      expect(start.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(start.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(end.getTime() - start.getTime()).toBe(plan.intervalDays * 86_400_000);
      expect(stampedDateOf(sub?.paymentVerifiedAt, "subscriptions.payment_verified_at").getTime()).toBe(
        start.getTime()
      );

      // The payment row — decided paid.
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Paid);

      // The lane credit — the full sessionCount on the plan's lane.
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(plan.sessionCount);

      // The notification row content — composed copy, subscription pointer,
      // the purchaser as recipient (captured at the persistence seam).
      expect(insertSpy).toHaveBeenCalledTimes(1);
      const emitted = insertSpy.mock.calls[0]?.[0];
      expect(emitted.userId).toBe(student.id);
      expect(emitted.type).toBe(NotificationType.PaymentConfirmation);
      expect(emitted.title).toBe(EN_NOTIFICATIONS.eventPaymentConfirmedTitle);
      expect(emitted.body).toBe(EN_NOTIFICATIONS.eventPaymentConfirmedBody(plan.title));
      expect(emitted.relatedEntityType).toBe("subscription");
      expect(emitted.relatedEntityId).toBe(subscription.id);

      // The receipt publish — strictly after the unit resolved, carrying the
      // persisted row and the recipient ids.
      expect(publishSpy).toHaveBeenCalledTimes(1);
      const [receipts, publishLocale] = publishSpy.mock.calls[0] ?? [];
      expect(publishLocale).toBe("en");
      const receipt = receipts?.[0];
      expect(receipt?.recipientUserIds).toEqual([student.id]);
      expect(receipt?.notifications).toHaveLength(1);
      expect(receipt?.notifications[0]?.type).toBe(NotificationType.PaymentConfirmation);
      expect(receipt?.notifications[0]?.userId).toBe(student.id);
    });
  });

  test("notification copy is composed in the RECIPIENT's persisted locale — not the deployment default", async () => {
    await runInRollback(async tx => {
      // The webhook is server-to-server: the caller-supplied locale is the
      // deployment default ("ar"), and the recipient carries an explicit
      // NON-default stored locale ("en"). The persisted copy must come from
      // the user row's stored preference — never the deployment default.
      const { plan, subscription, payment } = await provisionPendingPair(tx, {}, { locale: "en" });
      const { insertSpy, publishSpy } = spyNotificationSeams();

      // Guard the premise: the two locales' copy genuinely differs, so a
      // deployment-default composition cannot satisfy the recipient assertion.
      expect(EN_NOTIFICATIONS.eventPaymentConfirmedTitle).not.toBe(AR_NOTIFICATIONS.eventPaymentConfirmedTitle);

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "ar",
        tx
      );
      expect(outcome).toEqual({ processed: true });

      // The persisted copy is the RECIPIENT's ("en") — composed from the
      // user row's stored locale read in the same transaction.
      expect(insertSpy).toHaveBeenCalledTimes(1);
      const emitted = insertSpy.mock.calls[0]?.[0];
      expect(emitted.title).toBe(EN_NOTIFICATIONS.eventPaymentConfirmedTitle);
      expect(emitted.body).toBe(EN_NOTIFICATIONS.eventPaymentConfirmedBody(plan.title));

      // The post-commit publish stays attributed to the caller locale
      // (log attribution only — the payload is the persisted row's copy).
      const [, publishLocale] = publishSpy.mock.calls[0] ?? [];
      expect(publishLocale).toBe("ar");
    });
  });

  test("unknown payment reference → processed:false, warn logged, zero mutation", async () => {
    await runInRollback(async tx => {
      const { student, subscription, payment } = await provisionPendingPair(tx);
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const warnSpy = trackSpy(spyOn(logger, "logDomainError"));

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(`mock_unknown-${crypto.randomUUID()}`, payment.amount),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: false });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[1]?.code).toBe("PAYMENT_REFERENCE_UNKNOWN");

      // Zero mutation: the pair is byte-identical, no credit, no notification.
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Pending);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  test("failed delivery: payment decided failed, subscription untouched, no credit, no notification", async () => {
    await runInRollback(async tx => {
      const { student, subscription, payment } = await provisionPendingPair(tx);
      const { insertSpy, publishSpy } = spyNotificationSeams();

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        failedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: true });

      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      expect(subRows[0]?.startDate).toBeNull();
      expect(subRows[0]?.endDate).toBeNull();
      expect(subRows[0]?.paymentVerifiedAt).toBeNull();
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Failed);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  test("duplicate confirmed delivery → replay ack, no double credit, no second notification", async () => {
    await runInRollback(async tx => {
      const { student, subscription, payment } = await provisionPendingPair(tx);
      const { insertSpy, publishSpy } = spyNotificationSeams();

      const first = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      expect(first).toEqual({ processed: true });

      const balancesAfterFirst = await readBalances(tx, student.id);
      const subAfterFirst = (
        await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1)
      )[0];

      const second = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(second).toEqual({ processed: true, replayed: true });
      expect((await readBalances(tx, student.id)).balanceHifz).toBe(balancesAfterFirst.balanceHifz);
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);

      const subAfterSecond = (
        await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1)
      )[0];
      expect(subAfterSecond?.startDate?.getTime()).toBe(subAfterFirst?.startDate?.getTime());
    });
  });

  test("late confirmed after failed → rejected & logged (replay-incompatible), zero mutation", async () => {
    await runInRollback(async tx => {
      const { student, subscription, payment } = await provisionPendingPair(tx);
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const domainLogSpy = trackSpy(spyOn(logger, "logDomainError"));

      const failed = await SubscriptionActivationService.processWebhookEvent(
        failedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      expect(failed).toEqual({ processed: true });
      domainLogSpy.mockClear();

      const lateConfirmed = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(lateConfirmed).toEqual({ processed: false });
      expect(domainLogSpy).toHaveBeenCalledTimes(1);
      expect(domainLogSpy.mock.calls[0]?.[1]?.code).toBe("PAYMENT_REPLAY_INCOMPATIBLE");

      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Failed);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  test("NULL balance lane at activation quarantines — processed:false, zero mutation, error logged with correlation ids", async () => {
    await runInRollback(async tx => {
      const { student, plan, subscription, payment } = await provisionPendingPair(tx, { balanceLane: null });
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const errorSpy = trackSpy(spyOn(logger, "error"));

      // The lane-clear is REACHABLE (an admin can clear the lane after the
      // purchase commits), so the delivery QUARANTINES instead of throwing:
      // the honest `{ processed: false }` ack — never a 4xx error the
      // gateway would classify as a permanent transport failure.
      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
        reference: subscription.paymentReference,
        subscriptionId: subscription.id,
        planId: plan.id,
      });

      // The quarantined unit left NO trace: pending pair, zero credit, no
      // notification — the settled charge stays pending for operator
      // follow-up until the lane is re-configured.
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Pending);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });
});

describe("SubscriptionActivationService — settlement quarantine + exact credit (Tier 2: boundaries)", () => {
  test("currency mismatch quarantines: zero mutation, error logged with correlation ids only", async () => {
    await runInRollback(async tx => {
      const { student, subscription, payment } = await provisionPendingPair(tx);
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const errorSpy = trackSpy(spyOn(logger, "error"));

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount, "USD"),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message, context] = errorSpy.mock.calls[0] ?? [];
      expect(message).toContain("quarantined");
      expect(context).toMatchObject({ subscriptionId: subscription.id, paymentId: payment.id });
      // Correlation ids only — the logged context never carries financial values.
      const serialized = JSON.stringify(context);
      expect(serialized.includes(payment.amount)).toBe(false);
      expect(serialized.includes("USD")).toBe(false);

      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Pending);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  test("the exact balance delta equals the plan's sessionCount — one lane, siblings untouched", async () => {
    await runInRollback(async tx => {
      const { student, plan, subscription, payment } = await provisionPendingPair(tx, { sessionCount: 7 });
      spyNotificationSeams();

      const before = await readBalances(tx, student.id);
      expect(before.balanceHifz).toBe(0);

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      expect(outcome).toEqual({ processed: true });

      const after = await readBalances(tx, student.id);
      expect(after.balanceHifz).toBe((before.balanceHifz ?? 0) + plan.sessionCount);
      expect(after.balanceHifz).toBe(7);
      expect(after.balanceTajweed).toBe(0);
      expect(after.balanceReviews).toBe(0);
    });
  });

  test("reviews-lane activation: confirmed event credits balance_reviews by sessionCount — hifz/tajweed untouched", async () => {
    await runInRollback(async tx => {
      // The reviews lane is a legitimate, seeded, documented lane (the
      // "New Teacher Verification & Evaluation Plan" demo catalog member) —
      // the activation credit must route it like any other plan.
      const { student, plan, subscription, payment } = await provisionPendingPair(tx, {
        balanceLane: SubscriptionCreditLane.Reviews,
        sessionCount: 5,
      });
      const { insertSpy, publishSpy } = spyNotificationSeams();

      const before = await readBalances(tx, student.id);
      expect(before.balanceReviews).toBe(0);

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      expect(outcome).toEqual({ processed: true });

      // The reviews lane credited exactly the plan's sessionCount; the
      // sibling lanes are byte-identical.
      const after = await readBalances(tx, student.id);
      expect(after.balanceReviews).toBe((before.balanceReviews ?? 0) + plan.sessionCount);
      expect(after.balanceReviews).toBe(5);
      expect(after.balanceHifz).toBe(before.balanceHifz);
      expect(after.balanceTajweed).toBe(before.balanceTajweed);

      // The rest of the committed unit is lane-agnostic: active window,
      // decided payment, one notification, one post-commit publish.
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Active);
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Paid);
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);
    });
  });

  test("legacy plan row past the interval-days activation ceiling quarantines — processed:false, zero writes, error logged", async () => {
    await runInRollback(async tx => {
      // Direct-DB legacy row: the catalog ceiling (MAX_INTERVAL_DAYS) guards
      // WRITES only — the DB check enforces just `> 0` — so an out-of-range
      // row (1e8 days) is insertable and would overflow the Date window
      // arithmetic into an Invalid Date (a non-domain error → a 500 retry
      // storm). The activation boundary re-guards BEFORE the arithmetic and
      // QUARANTINES instead (the sibling NULL-lane posture).
      const { student, plan, subscription, payment } = await provisionPendingPair(tx, {
        intervalDays: 100_000_000,
      });
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const errorSpy = trackSpy(spyOn(logger, "error"));

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message, context] = errorSpy.mock.calls[0] ?? [];
      expect(message).toContain("quarantined");
      expect(context).toMatchObject({
        reference: subscription.paymentReference,
        subscriptionId: subscription.id,
        planId: plan.id,
        intervalDays: plan.intervalDays,
      });

      // The quarantined unit left NO trace: pending pair, zero credit on
      // every lane, no notification — the honest ack stops the retry storm.
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      expect(subRows[0]?.startDate).toBeNull();
      expect(subRows[0]?.endDate).toBeNull();
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Pending);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(balances.balanceTajweed).toBe(0);
      expect(balances.balanceReviews).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  test("legacy plan row past the session-count credit ceiling quarantines — processed:false, zero writes, error logged", async () => {
    await runInRollback(async tx => {
      // Direct-DB legacy row: the catalog credit ceiling (MAX_SESSION_COUNT)
      // guards WRITES only — the DB check enforces just `> 0` — so an
      // over-ceiling row is insertable and would credit an amount the lane's
      // int4 balance cannot safely absorb at the credit step. The activation
      // boundary re-guards BEFORE any write and QUARANTINES instead (the
      // sibling NULL-lane / interval-ceiling posture).
      const { student, plan, subscription, payment } = await provisionPendingPair(tx, {
        sessionCount: MAX_SESSION_COUNT + 1,
      });
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const errorSpy = trackSpy(spyOn(logger, "error"));

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message, context] = errorSpy.mock.calls[0] ?? [];
      expect(message).toContain("quarantined");
      expect(context).toMatchObject({
        reference: subscription.paymentReference,
        subscriptionId: subscription.id,
        planId: plan.id,
        sessionCount: plan.sessionCount,
      });

      // The quarantined unit left NO trace: pending pair, zero credit on
      // every lane, no notification — the honest ack stops the retry storm.
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      expect(subRows[0]?.startDate).toBeNull();
      expect(subRows[0]?.endDate).toBeNull();
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Pending);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(balances.balanceTajweed).toBe(0);
      expect(balances.balanceReviews).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });
});

describe("SubscriptionActivationService — out-of-order + concurrent deliveries (Tier 3: chaos)", () => {
  test("stale failed after a won confirmation replays without downgrading anything", async () => {
    await runInRollback(async tx => {
      const { student, plan, subscription, payment } = await provisionPendingPair(tx);
      const { insertSpy, publishSpy } = spyNotificationSeams();

      // The confirmation wins first.
      const confirmed = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      expect(confirmed).toEqual({ processed: true });
      const credited = await readBalances(tx, student.id);
      expect(credited.balanceHifz).toBe(plan.sessionCount);

      // A stale `failed` (queued before the confirmation, delivered after)
      // matches zero rows on the payment guard: replay ack, NOTHING changes.
      const staleFailed = await SubscriptionActivationService.processWebhookEvent(
        failedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(staleFailed).toEqual({ processed: true, replayed: true });
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Active);
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Paid);
      expect((await readBalances(tx, student.id)).balanceHifz).toBe(credited.balanceHifz);
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);
    });
  });

  testOnRealPostgres(
    "concurrent double-confirmed webhooks on independent transactions: exactly ONE credit + one replay",
    async () => {
      // Committed fixtures — the production path opens its OWN transaction
      // per call, so the race needs real committed entities. The payment
      // ledger is append-only (DELETE blocked by trigger) and its
      // subscription link cannot be re-pointed (the set-null UPDATE is not a
      // permitted transition), so the decided pair and its owners remain as
      // accepted test-database residue; every deletable child row is still
      // removed below.
      const pair = await db.transaction(async fixtureTx => {
        const { subscription, payment, plan, student } = await provisionPendingPair(fixtureTx);
        return {
          userId: student.id,
          planId: plan.id,
          subscriptionId: subscription.id,
          reference: subscription.paymentReference ?? "",
          amount: payment.amount,
          sessionCount: plan.sessionCount,
        };
      });

      const residue: string[] = [];
      try {
        const { insertSpy, publishSpy } = spyNotificationSeams();

        const attempts = await Promise.allSettled([
          SubscriptionActivationService.processWebhookEvent(confirmedEvent(pair.reference, pair.amount), "en"),
          SubscriptionActivationService.processWebhookEvent(confirmedEvent(pair.reference, pair.amount), "en"),
        ]);

        expect(attempts.every(entry => entry.status === "fulfilled")).toBe(true);
        const outcomes = attempts.map(entry => (entry.status === "fulfilled" ? entry.value : null));
        expect(outcomes.filter(value => value?.processed === true && value.replayed === true)).toHaveLength(1);
        expect(outcomes.filter(value => value?.processed === true && value.replayed === undefined)).toHaveLength(1);

        // Exactly ONE credit — the balance is the sessionCount, never twice.
        const balances = await db.select().from(students).where(eq(students.id, pair.userId)).limit(1);
        expect(balances[0]?.balanceHifz).toBe(pair.sessionCount);
        const subRows = await db.select().from(subscriptions).where(eq(subscriptions.id, pair.subscriptionId)).limit(1);
        expect(subRows[0]?.status).toBe(SubscriptionStatus.Active);
        const payRows = await db
          .select()
          .from(studentPayments)
          .where(eq(studentPayments.subscriptionId, pair.subscriptionId))
          .limit(1);
        expect(payRows[0]?.status).toBe(PaymentStatus.Paid);
        expect(insertSpy).toHaveBeenCalledTimes(1);
        expect(publishSpy).toHaveBeenCalledTimes(1);
      } finally {
        // FK-ordered teardown; the ledger-impossible deletes are recorded
        // (never silent) — the append-only ledger keeps its rows by design.
        await db
          .delete(subscriptions)
          .where(eq(subscriptions.userId, pair.userId))
          .catch(() => residue.push("subscriptions"));
        await db
          .delete(plans)
          .where(eq(plans.id, pair.planId))
          .catch(() => residue.push("plans"));
        await db
          .delete(students)
          .where(eq(students.id, pair.userId))
          .catch(() => residue.push("students"));
        await db
          .delete(users)
          .where(eq(users.id, pair.userId))
          .catch(() => residue.push("users"));
      }
    }
  );
});

describe("SubscriptionActivationService — forged deliveries (Tier 4: abuse)", () => {
  test("a subscription without its ledger row quarantines — the settlement check cannot pass", async () => {
    await runInRollback(async tx => {
      // A subscription pair normally carries exactly one ledger row; a
      // subscription WITHOUT one is a degenerate state the purchase flow
      // cannot produce (the pair commits atomically). Fail closed anyway.
      const user = await createTestUser(tx);
      const student = await createTestStudent(tx, user.id);
      const plan = await createTestPlan(tx, { balanceLane: SubscriptionCreditLane.Hifz });
      const orphan = await createTestSubscription(tx, student.id, plan.id, {
        status: SubscriptionStatus.Pending,
        paymentMethod: PaymentGateway.Mock,
        paymentReference: `mock_${crypto.randomUUID()}`,
        startDate: null,
        endDate: null,
        paymentVerifiedAt: null,
      });
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const errorSpy = trackSpy(spyOn(logger, "error"));

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(orphan.paymentReference ?? "", plan.price),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({ subscriptionId: orphan.id });
      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, orphan.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  test("tampered (reduced) amount quarantines — the stored row is the source of truth", async () => {
    await runInRollback(async tx => {
      const { student, subscription, payment } = await provisionPendingPair(tx);
      const { insertSpy, publishSpy } = spyNotificationSeams();
      const errorSpy = trackSpy(spyOn(logger, "error"));

      // A forged event claiming a fraction of the settled price — settlement
      // integrity beats liveness: nothing is applied, the log carries ids.
      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", "0.01"),
        "en",
        tx
      );

      expect(outcome).toEqual({ processed: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
        reference: subscription.paymentReference,
        subscriptionId: subscription.id,
        paymentId: payment.id,
      });

      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      expect(subRows[0]?.status).toBe(SubscriptionStatus.Pending);
      const payRows = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1);
      expect(payRows[0]?.status).toBe(PaymentStatus.Pending);
      expect(payRows[0]?.amount).toBe(payment.amount);
      const balances = await readBalances(tx, student.id);
      expect(balances.balanceHifz).toBe(0);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  test("zero-credit replay proof: balance and decided rows are byte-identical across a duplicate delivery", async () => {
    await runInRollback(async tx => {
      const { student, subscription, payment } = await provisionPendingPair(tx);
      spyNotificationSeams();

      await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      const balanceBefore = (await readBalances(tx, student.id)).balanceHifz;
      const payBefore = (await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1))[0];
      const subBefore = (
        await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1)
      )[0];

      const replay = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );

      expect(replay).toEqual({ processed: true, replayed: true });
      expect((await readBalances(tx, student.id)).balanceHifz).toBe(balanceBefore);
      const payAfter = (await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id)).limit(1))[0];
      const subAfter = (await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1))[0];
      expect(payAfter?.updatedAt?.getTime()).toBe(payBefore?.updatedAt?.getTime());
      expect(payAfter?.status).toBe(payBefore?.status);
      expect(subAfter?.startDate?.getTime()).toBe(subBefore?.startDate?.getTime());
      expect(subAfter?.updatedAt?.getTime()).toBe(subBefore?.updatedAt?.getTime());
    });
  });
});

describe("SubscriptionActivationService — validity-window arithmetic lock-in (Tier 2: boundaries)", () => {
  test("committed window: endDate − startDate === plan.intervalDays × 86_400_000 exactly, anchored at the activation instant", async () => {
    await runInRollback(async tx => {
      // A non-default interval (37 days, not the fixture's 30) so the delta
      // below can only come from the plan ROW's interval_days — the window
      // is read from the activating plan row, never guessed or re-stored.
      const { plan, subscription, payment } = await provisionPendingPair(tx, { intervalDays: 37 });
      expect(plan.intervalDays).toBe(37);
      spyNotificationSeams();

      const before = new Date(Date.now() - 1000);
      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      const after = new Date(Date.now() + 1000);
      expect(outcome).toEqual({ processed: true });

      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      const sub = subRows[0];
      expect(sub?.status).toBe(SubscriptionStatus.Active);
      const start = stampedDateOf(sub?.startDate, "subscriptions.start_date");
      const end = stampedDateOf(sub?.endDate, "subscriptions.end_date");

      // The window is anchored at the REAL activation instant (the flow
      // captures `now` once in-transaction) — the delta is the contract.
      expect(start.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(start.getTime()).toBeLessThanOrEqual(after.getTime());

      // 86_400_000 ms/day mirrors the service's module-private MS_PER_DAY
      // constant (subscription-activation.service.ts:96 — deliberately not
      // re-exported; the service file is pinned, never modified). Both
      // endpoints derive from that single captured `now`, so the delta
      // carries NO sub-second noise and the exact form is the honest pin.
      expect(end.getTime() - start.getTime()).toBe(plan.intervalDays * 86_400_000);

      // Second-precision form — the same window survives the timestamp
      // resolution floor the journey fixtures rely on: a whole-day interval
      // is a whole-second multiple, so flooring both endpoints preserves the
      // delta exactly (the pin would still hold if storage ever rounded the
      // timestamps to whole seconds).
      expect(secondPrecisionMs(end) - secondPrecisionMs(start)).toBe(plan.intervalDays * 86_400_000);

      // One captured `now` for the whole write: the verification stamp is
      // the same instant as the window's start.
      expect(stampedDateOf(sub?.paymentVerifiedAt, "subscriptions.payment_verified_at").getTime()).toBe(
        start.getTime()
      );
    });
  });

  test("minimum plan interval: intervalDays = 1 (the CHECK's > 0 floor) activates an exactly-one-day window", async () => {
    await runInRollback(async tx => {
      const { plan, subscription, payment } = await provisionPendingPair(tx, { intervalDays: 1 });
      expect(plan.intervalDays).toBe(1);
      spyNotificationSeams();

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      expect(outcome).toEqual({ processed: true });

      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      const sub = subRows[0];
      expect(sub?.status).toBe(SubscriptionStatus.Active);
      const start = stampedDateOf(sub?.startDate, "subscriptions.start_date");
      const end = stampedDateOf(sub?.endDate, "subscriptions.end_date");

      // The floor interval passes the activation ceiling guard (only values
      // ABOVE it quarantine — the over-ceiling case is pinned separately)
      // and yields a window of EXACTLY one day.
      expect(end.getTime() - start.getTime()).toBe(86_400_000);
      expect(secondPrecisionMs(end) - secondPrecisionMs(start)).toBe(86_400_000);
    });
  });

  test("leap-day-adjacent activation: the observed window delta is absolute-epoch arithmetic that agrees with UTC calendar normalization", async () => {
    await runInRollback(async tx => {
      // The flow captures its activation instant with `new Date()` internally
      // (subscription-activation.service.ts:360) — pinning `now` to a Feb-29
      // wall-clock instant would mean mocking the GLOBAL Date constructor
      // shared by the entire engine stack (driver, ORM, fixture helpers), an
      // intervention of the same grade as re-implementing the flow. So the
      // leap-day property is pinned the honest way: a REAL activation, the
      // OBSERVED row timestamps, and the delta — the DELTA is the point, not
      // wall-clock control.
      const { plan, subscription, payment } = await provisionPendingPair(tx, { intervalDays: 30 });
      spyNotificationSeams();

      const outcome = await SubscriptionActivationService.processWebhookEvent(
        confirmedEvent(subscription.paymentReference ?? "", payment.amount),
        "en",
        tx
      );
      expect(outcome).toEqual({ processed: true });

      const subRows = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1);
      const start = stampedDateOf(subRows[0]?.startDate, "subscriptions.start_date");
      const end = stampedDateOf(subRows[0]?.endDate, "subscriptions.end_date");

      // Pure elapsed-time arithmetic: intervalDays × 86_400_000 ms added to
      // the observed start. A leap day cannot skew this — Feb 29 exists only
      // in calendar-field arithmetic, and the window's writer never touches
      // calendar fields.
      expect(end.getTime() - start.getTime()).toBe(plan.intervalDays * 86_400_000);

      // Cross-check against the computation that DOES know about Feb 29:
      // UTC calendar-field normalization (Date.UTC normalizes day-of-month
      // overflow through month lengths and leap years). The epoch-ms
      // arithmetic must agree with it exactly for the observed activation
      // instant — whenever the observed window spans a Feb 29 this IS the
      // leap-day case, and since the two paths agree for every instant, the
      // pin holds on every run regardless of the host clock.
      const calendarLanding = Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + plan.intervalDays,
        start.getUTCHours(),
        start.getUTCMinutes(),
        start.getUTCSeconds(),
        start.getUTCMilliseconds()
      );
      expect(end.getTime()).toBe(calendarLanding);
    });
  });

  test("interval_days = 0 is impossible by DB CHECK — plans_interval_days_check fires; the floor value 1 inserts", async () => {
    await runInRollback(async tx => {
      // Control first: the same insert shape with the floor value (1)
      // commits — the CHECK is `> 0`, so the failure below is the ZERO, not
      // the insert shape.
      const floorPlan = await createTestPlan(tx, { intervalDays: 1 });
      expect(floorPlan.intervalDays).toBe(1);

      // The violation probe — the LAST statement of the transaction (a CHECK
      // violation aborts the tx; every later statement would fail with 25P02,
      // so nothing may follow it — the plan-catalog-schema suite's pattern).
      const err = await expectRepoError(() => createTestPlan(tx, { intervalDays: 0 }));
      expect(constraintNameOf(err)).toBe("plans_interval_days_check");
    });
  });

  test("schema-definition pin: interval_days is NOT NULL on plans, carries plans_interval_days_check, and subscriptions stores no interval column", () => {
    // Introspection of the live drizzle table configs (no DB I/O): the pin
    // fails if the schema definition drifts from the contracted shape; the
    // DB-level probe above proves the running database enforces it.
    const plansConfig = getTableConfig(plans);
    const intervalColumn = plansConfig.columns.find(column => column.name === "interval_days");
    if (!intervalColumn) {
      throw new Error("expected the plans table to define an interval_days column");
    }
    // NULL impossible: the column is NOT NULL — a plan row can never carry a
    // null interval for the window arithmetic to read.
    expect(intervalColumn.notNull).toBe(true);
    // Zero impossible: the CHECK lives on the table config under its
    // constraint name (the same name the DB-level probe above catches).
    expect(plansConfig.checks.map(constraint => constraint.name)).toContain("plans_interval_days_check");

    // The interval-source discipline: interval_days is a PLANS column only —
    // the subscriptions table stores no interval value at all, so the window
    // can only ever be computed from the activating plan row.
    const subscriptionsConfig = getTableConfig(subscriptions);
    expect(subscriptionsConfig.columns.some(column => column.name.includes("interval"))).toBe(false);
  });
});
