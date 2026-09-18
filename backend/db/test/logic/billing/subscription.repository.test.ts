/**
 * SubscriptionRepository tests — 4-Tier verification suite.
 *
 * Tier 1: Happy-path data access (insert, findById, findByPaymentReference,
 *         listByUserId ordering, extendActiveOnce window shift).
 * Tier 2: Boundary conditions (unknown ids, unknown references, empty list).
 * Tier 3: Chaos & concurrency (guarded activation: zero-row replay on an
 *         already-activated subscription; guarded extension: zero-row
 *         replay once the window moved, wrong-status denial; guarded
 *         cancellation: zero-row replay on an already-cancelled
 *         subscription, wrong-status denial).
 * Tier 4: Security & constraints (the partial unique index on
 *         `payment_reference` rejects a colliding insert with the raw
 *         PostgreSQL unique violation — 23505 — untranslated).
 *
 * Per `backend/db/test/AGENTS.md`: every case runs inside `runInRollback`
 * with `tx` passed to EVERY repository call and direct Drizzle query; error
 * probes use the `expectRepoError` try/catch helper inside an explicit
 * SAVEPOINT bracket (never `expect(...).rejects`).
 */

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { SubscriptionRepository } from "@/backend/db/repo/billing/subscription.repository";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { createTestPlan, createTestUser } from "@/backend/db/test/entity-setup";
import { hasPostgresErrorCode } from "@/backend/db/test/pg-error";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import type { DBTransaction, SubscriptionSelectType } from "@/backend/types";

/** PostgreSQL error code for `unique_violation`. */
const PG_UNIQUE_VIOLATION = "23505";

/** Physical name of the partial unique index guarding payment references. */
const PAYMENT_REFERENCE_UNIQUE = "subscriptions_payment_reference_unique";

/**
 * Walks the Drizzle error cause chain (cycle-safe) hunting for a
 * PostgreSQL SQLSTATE code — the raw violation is reachable only through
 * the chain because Drizzle masks driver errors behind a generic message.
 */

/** Walks the same cycle-safe cause chain for a message substring. */
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

/** Creates one purchaser (user) + one plan — the subscription's FK parties. */
async function createPurchaserAndPlan(tx: DBTransaction): Promise<{ userId: number; planId: number }> {
  const user = await createTestUser(tx, { role: "student" });
  const plan = await createTestPlan(tx);
  return { userId: user.id, planId: plan.id };
}

/** Counts the subscriptions owned by one user (in-tx read-back oracle). */
async function countSubscriptionsFor(tx: DBTransaction, userId: number): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  return row?.value ?? 0;
}

/** Creates one subscription row in the requested lifecycle state (window stamped for every state). */
async function createSubscriptionInStatus(
  tx: DBTransaction,
  status: SubscriptionStatus
): Promise<SubscriptionSelectType> {
  const { userId, planId } = await createPurchaserAndPlan(tx);
  const startDate = new Date("2026-02-01T00:00:00Z");
  const endDate = new Date("2026-03-01T00:00:00Z");
  const inserted = await SubscriptionRepository.insertSubscription({ userId, planId, startDate, endDate }, tx);
  if (status === SubscriptionStatus.Active) {
    const activated = await SubscriptionRepository.activatePendingOnce(
      inserted.id,
      { startDate, endDate, paymentVerifiedAt: new Date("2026-01-31T12:00:00Z") },
      tx
    );
    if (!activated) {
      throw new Error("fixture failure: activation matched zero rows");
    }
    return activated;
  }
  await tx.update(subscriptions).set({ status }).where(eq(subscriptions.id, inserted.id));
  const row = await SubscriptionRepository.findById(inserted.id, tx);
  if (!row) {
    throw new Error("fixture failure: subscription row vanished");
  }
  return row;
}

/** Denial probe for one lifecycle state: zero rows matched, row untouched. */
async function expectExtendDeniedForStatus(tx: DBTransaction, status: SubscriptionStatus): Promise<void> {
  const row = await createSubscriptionInStatus(tx, status);
  const windowEnd = row.endDate ?? new Date("2026-03-01T00:00:00Z");
  const denied = await SubscriptionRepository.extendActiveOnce(
    row.id,
    { previousEndDate: windowEnd, newEndDate: new Date("2026-03-31T00:00:00Z") },
    tx
  );
  expect(denied).toBeNull();
  const reread = await SubscriptionRepository.findById(row.id, tx);
  expect(reread?.status).toBe(status);
  expect(reread?.endDate).toEqual(row.endDate);
}

/** Cancellation denial probe for one lifecycle state: zero rows matched, row untouched. */
async function expectCancelDeniedForStatus(tx: DBTransaction, status: SubscriptionStatus): Promise<void> {
  const row = await createSubscriptionInStatus(tx, status);
  const denied = await SubscriptionRepository.cancelActiveOnce(row.id, tx);
  expect(denied).toBeNull();
  const reread = await SubscriptionRepository.findById(row.id, tx);
  expect(reread?.status).toBe(status);
  expect(reread?.endDate).toEqual(row.endDate);
}

describe("SubscriptionRepository", () => {
  // ─── Tier 1: Happy Path Operations ──────────────────────────────────────

  test("insertSubscription creates a pending subscription with server defaults", async () => {
    await runInRollback(async tx => {
      const { userId, planId } = await createPurchaserAndPlan(tx);
      const paymentReference = `ref-${randomUUID()}`;

      const inserted = await SubscriptionRepository.insertSubscription({ userId, planId, paymentReference }, tx);

      expect(inserted.id).toBeGreaterThan(0);
      expect(inserted.userId).toBe(userId);
      expect(inserted.planId).toBe(planId);
      expect(inserted.status).toBe(SubscriptionStatus.Pending);
      expect(inserted.paymentReference).toBe(paymentReference);
      expect(inserted.paymentMethod).toBeNull();
      expect(inserted.startDate).toBeNull();
      expect(inserted.endDate).toBeNull();
      expect(inserted.paymentVerifiedAt).toBeNull();
      expect(inserted.createdAt).toBeInstanceOf(Date);
      expect(inserted.updatedAt).toBeInstanceOf(Date);
      expect(await countSubscriptionsFor(tx, userId)).toBe(1);
    });
  });

  test("findById returns the exact row, and null for an unknown id", async () => {
    await runInRollback(async tx => {
      const { userId, planId } = await createPurchaserAndPlan(tx);
      const inserted = await SubscriptionRepository.insertSubscription({ userId, planId }, tx);

      const found = await SubscriptionRepository.findById(inserted.id, tx);
      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(inserted.id);
        expect(found.userId).toBe(userId);
        expect(found.planId).toBe(planId);
        expect(found.status).toBe(SubscriptionStatus.Pending);
      }

      expect(await SubscriptionRepository.findById(99999999, tx)).toBeNull();
    });
  });

  test("findByPaymentReference returns the matching row, and null for an unknown reference", async () => {
    await runInRollback(async tx => {
      const { userId, planId } = await createPurchaserAndPlan(tx);
      const reference = `ref-${randomUUID()}`;
      const inserted = await SubscriptionRepository.insertSubscription(
        { userId, planId, paymentReference: reference },
        tx
      );

      const found = await SubscriptionRepository.findByPaymentReference(reference, tx);
      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(inserted.id);
        expect(found.paymentReference).toBe(reference);
      }

      expect(await SubscriptionRepository.findByPaymentReference(`ref-${randomUUID()}`, tx)).toBeNull();
    });
  });

  test("listByUserId returns only the owner's rows, newest first; empty for a user with none", async () => {
    await runInRollback(async tx => {
      const { userId, planId } = await createPurchaserAndPlan(tx);
      const other = await createPurchaserAndPlan(tx);

      // `now()` is transaction-stable, so every row inserted in this
      // transaction would share one created_at — stamp explicit distinct
      // instants to make the DESC ordering deterministic.
      const base = new Date("2026-01-01T00:00:00Z");
      const oldest = await SubscriptionRepository.insertSubscription({ userId, planId, createdAt: base }, tx);
      const middle = await SubscriptionRepository.insertSubscription(
        { userId, planId, createdAt: new Date(base.getTime() + 60_000) },
        tx
      );
      const newest = await SubscriptionRepository.insertSubscription(
        { userId, planId, createdAt: new Date(base.getTime() + 120_000) },
        tx
      );
      // A subscription for another owner must never leak into the list.
      await SubscriptionRepository.insertSubscription({ userId: other.userId, planId: other.planId }, tx);

      const listed = await SubscriptionRepository.listByUserId(userId, tx);
      expect(listed.map(row => row.id)).toEqual([newest.id, middle.id, oldest.id]);
      for (const row of listed) {
        expect(row.userId).toBe(userId);
      }

      expect(await SubscriptionRepository.listByUserId(other.userId, tx)).toHaveLength(1);
      const lone = await createTestUser(tx, { role: "student" });
      expect(await SubscriptionRepository.listByUserId(lone.id, tx)).toEqual([]);
    });
  });

  // ─── Tier 2 + 3: Guarded activation (zero-row replay) ───────────────────

  test("activatePendingOnce transitions pending → active once, then zero-rows on replay", async () => {
    await runInRollback(async tx => {
      const { userId, planId } = await createPurchaserAndPlan(tx);
      const inserted = await SubscriptionRepository.insertSubscription({ userId, planId }, tx);

      const startDate = new Date("2026-02-01T00:00:00Z");
      const endDate = new Date("2026-03-01T00:00:00Z");
      const paymentVerifiedAt = new Date("2026-01-31T12:00:00Z");

      const activated = await SubscriptionRepository.activatePendingOnce(
        inserted.id,
        { startDate, endDate, paymentVerifiedAt },
        tx
      );
      expect(activated).not.toBeNull();
      if (activated) {
        expect(activated.id).toBe(inserted.id);
        expect(activated.status).toBe(SubscriptionStatus.Active);
        expect(activated.startDate).toEqual(startDate);
        expect(activated.endDate).toEqual(endDate);
        expect(activated.paymentVerifiedAt).toEqual(paymentVerifiedAt);
        expect(activated.userId).toBe(userId);
        expect(activated.planId).toBe(planId);
      }

      // Replay delivery: the guarded UPDATE matches zero rows (status is no
      // longer pending) and returns null — the caller's no-op signal.
      const replayed = await SubscriptionRepository.activatePendingOnce(
        inserted.id,
        { startDate, endDate, paymentVerifiedAt },
        tx
      );
      expect(replayed).toBeNull();

      // The zero-row path must not have mutated anything: still active, and
      // the still-queryable transaction proves no statement abort occurred.
      const after = await SubscriptionRepository.findById(inserted.id, tx);
      expect(after?.status).toBe(SubscriptionStatus.Active);
      expect(after?.startDate).toEqual(startDate);

      // An unknown id matches zero rows through the same guarded predicate.
      expect(
        await SubscriptionRepository.activatePendingOnce(99999999, { startDate, endDate, paymentVerifiedAt }, tx)
      ).toBeNull();
    });
  });

  // ─── Tier 1 + 3: Guarded extension (window shift / zero-row replay) ────

  test("extendActiveOnce shifts an active row's window to the exact requested end date", async () => {
    await runInRollback(async tx => {
      const active = await createSubscriptionInStatus(tx, SubscriptionStatus.Active);
      const previousEndDate = active.endDate;
      if (!previousEndDate) {
        throw new Error("fixture failure: active row has no window end");
      }
      const newEndDate = new Date(previousEndDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      const extended = await SubscriptionRepository.extendActiveOnce(active.id, { previousEndDate, newEndDate }, tx);

      expect(extended).not.toBeNull();
      if (extended) {
        expect(extended.id).toBe(active.id);
        expect(extended.status).toBe(SubscriptionStatus.Active);
        expect(extended.startDate).toEqual(active.startDate);
        expect(extended.endDate).toEqual(newEndDate);
        // The write is an explicit two-column patch: every other column
        // (owner, plan, payment triple) rides through untouched.
        expect(extended.userId).toBe(active.userId);
        expect(extended.planId).toBe(active.planId);
        expect(extended.paymentMethod).toBeNull();
        expect(extended.paymentVerifiedAt).toEqual(active.paymentVerifiedAt);
        expect(extended.updatedAt.getTime()).toBeGreaterThanOrEqual(active.updatedAt.getTime());
      }

      const reread = await SubscriptionRepository.findById(active.id, tx);
      expect(reread?.endDate).toEqual(newEndDate);
      expect(reread?.status).toBe(SubscriptionStatus.Active);
    });
  });

  test("extendActiveOnce replays as zero rows once the window moved — no second shift", async () => {
    await runInRollback(async tx => {
      const active = await createSubscriptionInStatus(tx, SubscriptionStatus.Active);
      const previousEndDate = active.endDate;
      if (!previousEndDate) {
        throw new Error("fixture failure: active row has no window end");
      }
      const extendedEnd = new Date(previousEndDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const first = await SubscriptionRepository.extendActiveOnce(
        active.id,
        { previousEndDate, newEndDate: extendedEnd },
        tx
      );
      expect(first).not.toBeNull();

      // Identical replay: the end_date predicate no longer matches (the
      // window already moved) — zero rows, null, nothing mutated.
      const replayed = await SubscriptionRepository.extendActiveOnce(
        active.id,
        { previousEndDate, newEndDate: extendedEnd },
        tx
      );
      expect(replayed).toBeNull();

      const reread = await SubscriptionRepository.findById(active.id, tx);
      expect(reread?.endDate).toEqual(extendedEnd);

      // An unknown id matches zero rows through the same guarded predicate.
      expect(
        await SubscriptionRepository.extendActiveOnce(99999999, { previousEndDate, newEndDate: extendedEnd }, tx)
      ).toBeNull();
    });
  });

  test("extendActiveOnce denies every non-active lifecycle state", async () => {
    await runInRollback(async tx => {
      // The guarded predicate folds `status = 'active'` into the WHERE, so
      // each non-active state denies with zero rows and an untouched row —
      // one probe per lifecycle state.
      await expectExtendDeniedForStatus(tx, SubscriptionStatus.Pending);
      await expectExtendDeniedForStatus(tx, SubscriptionStatus.Expired);
      await expectExtendDeniedForStatus(tx, SubscriptionStatus.Cancelled);
      await expectExtendDeniedForStatus(tx, SubscriptionStatus.Suspended);
    });
  });

  // ─── Tier 1 + 3: Guarded cancellation (active → cancelled) ─────────────

  test("cancelActiveOnce flips an active row to cancelled, stamping updatedAt and touching nothing else", async () => {
    await runInRollback(async tx => {
      const active = await createSubscriptionInStatus(tx, SubscriptionStatus.Active);

      const cancelled = await SubscriptionRepository.cancelActiveOnce(active.id, tx);

      expect(cancelled).not.toBeNull();
      if (cancelled) {
        expect(cancelled.id).toBe(active.id);
        expect(cancelled.status).toBe(SubscriptionStatus.Cancelled);
        // The write is an explicit two-column patch (status + updatedAt):
        // every other column — owner, plan, window, payment triple — rides
        // through untouched, and no lane balance column is reachable here
        // at all (cancel is balance-preserving by design).
        expect(cancelled.userId).toBe(active.userId);
        expect(cancelled.planId).toBe(active.planId);
        expect(cancelled.startDate).toEqual(active.startDate);
        expect(cancelled.endDate).toEqual(active.endDate);
        expect(cancelled.paymentMethod).toBeNull();
        expect(cancelled.paymentReference).toBe(active.paymentReference);
        expect(cancelled.paymentVerifiedAt).toEqual(active.paymentVerifiedAt);
        expect(cancelled.updatedAt.getTime()).toBeGreaterThanOrEqual(active.updatedAt.getTime());
      }

      const reread = await SubscriptionRepository.findById(active.id, tx);
      expect(reread?.status).toBe(SubscriptionStatus.Cancelled);
      expect(reread?.endDate).toEqual(active.endDate);
    });
  });

  test("cancelActiveOnce replays as zero rows on double-cancel — the row stays cancelled", async () => {
    await runInRollback(async tx => {
      const active = await createSubscriptionInStatus(tx, SubscriptionStatus.Active);

      const first = await SubscriptionRepository.cancelActiveOnce(active.id, tx);
      expect(first?.status).toBe(SubscriptionStatus.Cancelled);

      // Identical replay: the active predicate no longer matches — zero
      // rows, null, nothing mutated by the second statement.
      const replayed = await SubscriptionRepository.cancelActiveOnce(active.id, tx);
      expect(replayed).toBeNull();
      expect((await SubscriptionRepository.findById(active.id, tx))?.status).toBe(SubscriptionStatus.Cancelled);

      // An unknown id matches zero rows through the same guarded predicate.
      expect(await SubscriptionRepository.cancelActiveOnce(99999999, tx)).toBeNull();
    });
  });

  test("cancelActiveOnce denies every non-active lifecycle state", async () => {
    await runInRollback(async tx => {
      // The guarded predicate folds `status = 'active'` into the WHERE, so
      // each non-active state denies with zero rows and an untouched row —
      // one probe per lifecycle state.
      await expectCancelDeniedForStatus(tx, SubscriptionStatus.Pending);
      await expectCancelDeniedForStatus(tx, SubscriptionStatus.Expired);
      await expectCancelDeniedForStatus(tx, SubscriptionStatus.Cancelled);
      await expectCancelDeniedForStatus(tx, SubscriptionStatus.Suspended);
    });
  });

  // ─── Tier 4: Payment-reference uniqueness at the DB layer ───────────────

  test("a duplicate payment_reference insert raises the raw 23505 unique violation, untranslated", async () => {
    await runInRollback(async tx => {
      const { userId, planId } = await createPurchaserAndPlan(tx);
      const reference = `ref-${randomUUID()}`;
      const original = await SubscriptionRepository.insertSubscription(
        { userId, planId, paymentReference: reference },
        tx
      );

      await tx.execute(sql`savepoint sub_ref_dup_probe`);
      const dupError = await expectRepoError(() =>
        SubscriptionRepository.insertSubscription({ userId, planId, paymentReference: reference }, tx)
      );
      await tx.execute(sql`rollback to savepoint sub_ref_dup_probe`);

      expect(hasPostgresErrorCode(dupError, PG_UNIQUE_VIOLATION)).toBe(true);
      expect(causeChainContainsMessage(dupError, PAYMENT_REFERENCE_UNIQUE)).toBe(true);

      // Post-rollback the original row is intact and still the sole claimant
      // of the reference.
      expect(await countSubscriptionsFor(tx, userId)).toBe(1);
      const stillThere = await SubscriptionRepository.findByPaymentReference(reference, tx);
      expect(stillThere?.id).toBe(original.id);
    });
  });
});
