/**
 * SubscriptionRepository tests — 4-Tier verification suite.
 *
 * Tier 1: Happy-path data access (insert, findById, findByPaymentReference,
 *         listByUserId ordering).
 * Tier 2: Boundary conditions (unknown ids, unknown references, empty list).
 * Tier 3: Chaos & concurrency (guarded activation: zero-row replay on an
 *         already-activated subscription).
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
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import type { DBTransaction } from "@/backend/types";

/** PostgreSQL error code for `unique_violation`. */
const PG_UNIQUE_VIOLATION = "23505";

/** Physical name of the partial unique index guarding payment references. */
const PAYMENT_REFERENCE_UNIQUE = "subscriptions_payment_reference_unique";

/**
 * Walks the Drizzle error cause chain (cycle-safe) hunting for a
 * PostgreSQL SQLSTATE code — the raw violation is reachable only through
 * the chain because Drizzle masks driver errors behind a generic message.
 */
function hasPostgresErrorCode(error: unknown, pgCode: string): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === pgCode) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

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
