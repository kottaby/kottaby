/**
 * StudentPaymentRepository tests — 4-Tier verification suite, including the
 * payment-ledger trigger matrix.
 *
 * Tier 1: Happy-path data access (insert, findBySubscriptionId).
 * Tier 2: Boundary conditions (unknown subscription id → null).
 * Tier 3: Guarded decisions + allowed trigger matrix rows (pending→paid ✅,
 *         pending→failed ✅, replay zero-rows after a decision).
 * Tier 4: Blocked trigger matrix rows (paid→anything ❌, amount tamper ❌,
 *         DELETE ❌) — each violated expectation raises the DB guard, proven
 *         through the `expectRepoError` try/catch helper inside an explicit
 *         SAVEPOINT bracket created AFTER the probe row insert (a failed
 *         statement aborts the surrounding transaction; the savepoint keeps
 *         it queryable). NEVER `expect(...).rejects` inside a rollback.
 *
 * Probe gotchas encoded here: `now()` is transaction-stable (financial
 * columns are snapshotted before any write and compared after), and the
 * savepoint is opened after the ledger row exists so trigger probes match a
 * live row.
 */

import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { StudentPaymentRepository } from "@/backend/db/repo/billing/student-payment.repository";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import {
  createTestPlan,
  createTestStudent,
  createTestSubscription,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import type { DBTransaction, StudentPaymentInsertType, StudentPaymentSelectType } from "@/backend/types";

/** Substring of the amended UPDATE guard's raised message. */
const UPDATE_GUARD_IMMUTABLE = "student_payments is immutable";
/** Substring of the amended UPDATE guard's permitted-exception clause. */
const UPDATE_GUARD_EXCEPTION = "permitted only to transition a pending payment";
/** Substring of the DELETE guard's raised message. */
const DELETE_GUARD_MESSAGE = "DELETE is not permitted";

/**
 * Walks the Drizzle error cause chain (cycle-safe) for a message substring —
 * Drizzle masks driver errors behind a generic message, so the raised
 * trigger text is reachable only through the chain.
 */
function causeChainContainsMessage(error: unknown, substring: string): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (typeof current.message === "string" && current.message.includes(substring)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** One purchase pair: pending subscription + its pending payment row. */
interface PurchasePair {
  studentId: number;
  subscriptionId: number;
  payment: StudentPaymentSelectType;
}

/** Creates a user + student + plan + pending subscription + pending payment. */
async function createPurchasePair(
  tx: DBTransaction,
  paymentOverrides: Partial<StudentPaymentInsertType> = {}
): Promise<PurchasePair> {
  const user = await createTestUser(tx, { role: "student" });
  const student = await createTestStudent(tx, user.id);
  const plan = await createTestPlan(tx);
  const subscription = await createTestSubscription(tx, user.id, plan.id, {
    status: SubscriptionStatus.Pending,
  });

  const insert: StudentPaymentInsertType = {
    studentId: student.id,
    subscriptionId: subscription.id,
    amount: plan.price,
    currency: plan.currency,
    paymentGateway: PaymentGateway.Mock,
    status: PaymentStatus.Pending,
    ...paymentOverrides,
  };
  const payment = await StudentPaymentRepository.insertPayment(insert, tx);
  return { studentId: student.id, subscriptionId: subscription.id, payment };
}

describe("StudentPaymentRepository", () => {
  // ─── Tier 1: Happy Path Operations ──────────────────────────────────────

  test("insertPayment creates a pending ledger row echoing the financial columns verbatim", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx, { role: "student" });
      const student = await createTestStudent(tx, user.id);
      const plan = await createTestPlan(tx);
      const subscription = await createTestSubscription(tx, user.id, plan.id, {
        status: SubscriptionStatus.Pending,
      });

      const inserted = await StudentPaymentRepository.insertPayment(
        {
          studentId: student.id,
          subscriptionId: subscription.id,
          amount: plan.price,
          currency: plan.currency,
          paymentGateway: PaymentGateway.Mock,
        },
        tx
      );

      expect(inserted.id).toBeGreaterThan(0);
      expect(inserted.studentId).toBe(student.id);
      expect(inserted.subscriptionId).toBe(subscription.id);
      expect(inserted.amount).toBe(plan.price);
      expect(inserted.currency).toBe(plan.currency);
      expect(inserted.paymentGateway).toBe(PaymentGateway.Mock);
      expect(inserted.status).toBe(PaymentStatus.Pending);
      expect(inserted.createdAt).toBeInstanceOf(Date);
      expect(inserted.updatedAt).toBeInstanceOf(Date);
    });
  });

  test("findBySubscriptionId returns the attached payment, and null for an unknown subscription", async () => {
    await runInRollback(async tx => {
      const { subscriptionId, payment } = await createPurchasePair(tx);

      const found = await StudentPaymentRepository.findBySubscriptionId(subscriptionId, tx);
      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(payment.id);
        expect(found.studentId).toBe(payment.studentId);
        expect(found.subscriptionId).toBe(subscriptionId);
        expect(found.amount).toBe(payment.amount);
        expect(found.status).toBe(PaymentStatus.Pending);
      }

      expect(await StudentPaymentRepository.findBySubscriptionId(99999999, tx)).toBeNull();
    });
  });

  // ─── Tier 3: Guarded decisions — the ALLOWED trigger matrix rows ────────

  test("pending→paid: markPaidOnce flips only the status and freezes every financial column", async () => {
    await runInRollback(async tx => {
      const { subscriptionId, payment } = await createPurchasePair(tx);

      const paid = await StudentPaymentRepository.markPaidOnce(subscriptionId, tx);
      expect(paid).not.toBeNull();
      if (paid) {
        expect(paid.id).toBe(payment.id);
        expect(paid.status).toBe(PaymentStatus.Paid);
        // Column freeze: the decision redirects nothing.
        expect(paid.studentId).toBe(payment.studentId);
        expect(paid.subscriptionId).toBe(payment.subscriptionId);
        expect(paid.amount).toBe(payment.amount);
        expect(paid.currency).toBe(payment.currency);
        expect(paid.paymentGateway).toBe(payment.paymentGateway);
        expect(paid.createdAt).toEqual(payment.createdAt);
        expect(paid.updatedAt).toBeInstanceOf(Date);
      }

      // Replay delivery: the guarded UPDATE matches zero rows (no pending
      // payment left) — a no-op, not an error, and the transaction survives.
      expect(await StudentPaymentRepository.markPaidOnce(subscriptionId, tx)).toBeNull();

      // A failed decision can never reach a decided (paid) row.
      expect(await StudentPaymentRepository.markFailedOnce(subscriptionId, tx)).toBeNull();
    });
  });

  test("pending→failed: markFailedOnce flips only the status; the failed state is terminal", async () => {
    await runInRollback(async tx => {
      const { subscriptionId, payment } = await createPurchasePair(tx);

      const failed = await StudentPaymentRepository.markFailedOnce(subscriptionId, tx);
      expect(failed).not.toBeNull();
      if (failed) {
        expect(failed.id).toBe(payment.id);
        expect(failed.status).toBe(PaymentStatus.Failed);
        expect(failed.amount).toBe(payment.amount);
        expect(failed.paymentGateway).toBe(payment.paymentGateway);
        expect(failed.createdAt).toEqual(payment.createdAt);
      }

      // Replay of the same outcome: zero rows.
      expect(await StudentPaymentRepository.markFailedOnce(subscriptionId, tx)).toBeNull();

      // A late `confirmed` after a `failed` decision is rejected by the
      // repo guard before the trigger is even consulted: zero rows.
      expect(await StudentPaymentRepository.markPaidOnce(subscriptionId, tx)).toBeNull();

      // The ledger row still reads failed and untouched.
      const after = await StudentPaymentRepository.findBySubscriptionId(subscriptionId, tx);
      expect(after?.status).toBe(PaymentStatus.Failed);
      expect(after?.amount).toBe(payment.amount);
    });
  });

  // ─── Tier 4: BLOCKED trigger matrix rows (DB guard raises) ──────────────

  test("paid→anything: the DB guard rejects re-opening and re-deciding a decided payment", async () => {
    await runInRollback(async tx => {
      const { subscriptionId } = await createPurchasePair(tx);
      const paid = await StudentPaymentRepository.markPaidOnce(subscriptionId, tx);
      if (!paid) {
        throw new Error("trigger matrix setup: expected the pending payment to flip to paid");
      }
      expect(paid.status).toBe(PaymentStatus.Paid);

      // Bracket 1 — paid → pending (re-open).
      await tx.execute(sql`savepoint pay_guard_reopen_probe`);
      const reopenError = await expectRepoError(() =>
        tx.update(studentPayments).set({ status: PaymentStatus.Pending }).where(eq(studentPayments.id, paid.id))
      );
      await tx.execute(sql`rollback to savepoint pay_guard_reopen_probe`);
      expect(causeChainContainsMessage(reopenError, UPDATE_GUARD_IMMUTABLE)).toBe(true);
      expect(causeChainContainsMessage(reopenError, UPDATE_GUARD_EXCEPTION)).toBe(true);

      // Bracket 2 — paid → failed (re-decide).
      await tx.execute(sql`savepoint pay_guard_redecide_probe`);
      const redecideError = await expectRepoError(() =>
        tx.update(studentPayments).set({ status: PaymentStatus.Failed }).where(eq(studentPayments.id, paid.id))
      );
      await tx.execute(sql`rollback to savepoint pay_guard_redecide_probe`);
      expect(causeChainContainsMessage(redecideError, UPDATE_GUARD_IMMUTABLE)).toBe(true);

      // Post-rollback the paid row is intact and the transaction is usable.
      const after = await StudentPaymentRepository.findBySubscriptionId(subscriptionId, tx);
      expect(after?.status).toBe(PaymentStatus.Paid);
    });
  });

  test("amount tamper: the DB guard rejects a decision that touches the amount — and any amount edit at all", async () => {
    await runInRollback(async tx => {
      const { subscriptionId, payment } = await createPurchasePair(tx);
      const tamperedAmount = "999.99";
      expect(payment.amount).not.toBe(tamperedAmount);

      // Bracket 1 — amount tamper smuggled inside the permitted transition.
      await tx.execute(sql`savepoint pay_guard_tamper_transition_probe`);
      const transitionError = await expectRepoError(() =>
        tx
          .update(studentPayments)
          .set({ status: PaymentStatus.Paid, amount: tamperedAmount })
          .where(eq(studentPayments.subscriptionId, subscriptionId))
      );
      await tx.execute(sql`rollback to savepoint pay_guard_tamper_transition_probe`);
      expect(causeChainContainsMessage(transitionError, UPDATE_GUARD_IMMUTABLE)).toBe(true);
      expect(causeChainContainsMessage(transitionError, UPDATE_GUARD_EXCEPTION)).toBe(true);

      // Bracket 2 — amount tamper with the status untouched.
      await tx.execute(sql`savepoint pay_guard_tamper_only_probe`);
      const tamperOnlyError = await expectRepoError(() =>
        tx
          .update(studentPayments)
          .set({ amount: tamperedAmount })
          .where(eq(studentPayments.subscriptionId, subscriptionId))
      );
      await tx.execute(sql`rollback to savepoint pay_guard_tamper_only_probe`);
      expect(causeChainContainsMessage(tamperOnlyError, UPDATE_GUARD_IMMUTABLE)).toBe(true);

      // Post-rollback: still pending, amount never moved.
      const after = await StudentPaymentRepository.findBySubscriptionId(subscriptionId, tx);
      expect(after?.status).toBe(PaymentStatus.Pending);
      expect(after?.amount).toBe(payment.amount);
    });
  });

  test("DELETE: the append-only ledger cannot be deleted — the delete guard raises", async () => {
    await runInRollback(async tx => {
      const { subscriptionId, payment } = await createPurchasePair(tx);

      await tx.execute(sql`savepoint pay_guard_delete_probe`);
      const deleteError = await expectRepoError(() =>
        tx.delete(studentPayments).where(eq(studentPayments.id, payment.id))
      );
      await tx.execute(sql`rollback to savepoint pay_guard_delete_probe`);

      expect(causeChainContainsMessage(deleteError, UPDATE_GUARD_IMMUTABLE)).toBe(true);
      expect(causeChainContainsMessage(deleteError, DELETE_GUARD_MESSAGE)).toBe(true);

      // Post-rollback the ledger row survived the blocked delete.
      const after = await StudentPaymentRepository.findBySubscriptionId(subscriptionId, tx);
      expect(after?.id).toBe(payment.id);
    });
  });
});
