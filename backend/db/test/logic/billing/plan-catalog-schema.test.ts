/**
 * Plan catalog database schema tests — lifecycle columns & CHECK constraints.
 *
 * Verifies that the plans table contains `is_active` (default true) and `deactivated_at`
 * (nullable), and that database-level check constraints enforce domain bounds.
 */

import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { plans } from "@/backend/db/schema/billing/plans";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";

describe("Plan Catalog Schema", () => {
  test("inserts plan with default isActive = true and deactivatedAt = null", async () => {
    await runInRollback(async tx => {
      const [inserted] = await tx
        .insert(plans)
        .values({
          title: "Test Plan Title",
          sessionCount: 4,
          price: "100.00",
          currency: "EGP",
          intervalDays: 30,
        })
        .returning();

      expect(inserted).toBeDefined();
      expect(inserted.isActive).toBe(true);
      expect(inserted.deactivatedAt).toBeNull();
      expect(inserted.title).toBe("Test Plan Title");
      expect(inserted.sessionCount).toBe(4);
      expect(inserted.price).toBe("100.00");
      expect(inserted.currency).toBe("EGP");
      expect(inserted.intervalDays).toBe(30);

      const [queried] = await tx.select().from(plans).where(eq(plans.id, inserted.id));

      expect(queried).toBeDefined();
      expect(queried.isActive).toBe(true);
      expect(queried.deactivatedAt).toBeNull();
    });
  });

  test("allows inserting plan with explicit isActive = false and deactivatedAt timestamp", async () => {
    await runInRollback(async tx => {
      const deactivatedTime = new Date();
      const [inserted] = await tx
        .insert(plans)
        .values({
          title: "Deactivated Plan",
          sessionCount: 8,
          price: "250.00",
          currency: "EGP",
          intervalDays: 60,
          isActive: false,
          deactivatedAt: deactivatedTime,
        })
        .returning();

      expect(inserted.isActive).toBe(false);
      expect(inserted.deactivatedAt).toBeDefined();
      expect(inserted.deactivatedAt).not.toBeNull();
    });
  });

  test("rejects plan insert when sessionCount is 0 or negative (plans_session_count_check)", async () => {
    await runInRollback(async tx => {
      const err1 = await expectRepoError(async () => {
        await tx.insert(plans).values({
          title: "Invalid Session Plan",
          sessionCount: 0,
          price: "100.00",
          currency: "EGP",
          intervalDays: 30,
        });
      });
      expect(err1).toBeInstanceOf(Error);

      const err2 = await expectRepoError(async () => {
        await tx.insert(plans).values({
          title: "Negative Session Plan",
          sessionCount: -1,
          price: "100.00",
          currency: "EGP",
          intervalDays: 30,
        });
      });
      expect(err2).toBeInstanceOf(Error);
    });
  });

  test("rejects plan insert when price is negative (plans_price_check)", async () => {
    await runInRollback(async tx => {
      const err = await expectRepoError(async () => {
        await tx.insert(plans).values({
          title: "Negative Price Plan",
          sessionCount: 5,
          price: "-10.00",
          currency: "EGP",
          intervalDays: 30,
        });
      });
      expect(err).toBeInstanceOf(Error);
    });
  });

  test("rejects plan insert when intervalDays is 0 or negative (plans_interval_days_check)", async () => {
    await runInRollback(async tx => {
      const err1 = await expectRepoError(async () => {
        await tx.insert(plans).values({
          title: "Zero Interval Plan",
          sessionCount: 5,
          price: "50.00",
          currency: "EGP",
          intervalDays: 0,
        });
      });
      expect(err1).toBeInstanceOf(Error);

      const err2 = await expectRepoError(async () => {
        await tx.insert(plans).values({
          title: "Negative Interval Plan",
          sessionCount: 5,
          price: "50.00",
          currency: "EGP",
          intervalDays: -5,
        });
      });
      expect(err2).toBeInstanceOf(Error);
    });
  });
});
