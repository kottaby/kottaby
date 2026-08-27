/**
 * PlanRepository — data-access layer for the `plans` table.
 *
 * Implements atomic CRUD operations for subscription plans.
 * Concurrency:
 *  - Uses conditional guarded updates (`setActiveStatusOnce`) to prevent race conditions.
 *  - Uses `listActive` as the single canonical predicate for public active plans.
 *
 * All methods take an optional `tx: DBTransaction` as their last parameter.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/backend/db";
import { plans } from "@/backend/db/schema/billing/plans";
import type { DBTransaction, PlanInsertType, PlanSelectType, PlanUpdateInput } from "@/backend/types";

export namespace PlanRepository {
  /**
   * Inserts a new subscription plan record.
   *
   * @returns The inserted plan row.
   */
  export async function insertPlan(insert: PlanInsertType, tx?: DBTransaction): Promise<PlanSelectType> {
    const executor = tx ?? db;
    const [row] = await executor.insert(plans).values(insert).returning();
    if (!row) {
      throw new Error("PlanRepository.insertPlan: insert returned no rows");
    }
    return row;
  }

  /**
   * Updates mutable fields on a plan record by ID.
   *
   * @returns The updated plan row, or null if no row with `id` exists.
   */
  export async function updatePlanFields(
    id: number,
    patch: PlanUpdateInput,
    tx?: DBTransaction
  ): Promise<PlanSelectType | null> {
    const executor = tx ?? db;
    const [row] = await executor
      .update(plans)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Performs an atomic guarded transition of a plan's active status.
   *
   * Transitions `isActive` from `!target` to `target`.
   * When deactivating (`target === false`), populates `deactivatedAt` with current timestamp.
   * When reactivating (`target === true`), resets `deactivatedAt` to null.
   *
   * @returns The transitioned row if state changed, or null if row not found or already in target state.
   */
  export async function setActiveStatusOnce(
    id: number,
    target: boolean,
    tx?: DBTransaction
  ): Promise<PlanSelectType | null> {
    const executor = tx ?? db;
    const [row] = await executor
      .update(plans)
      .set({
        isActive: target,
        deactivatedAt: target ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(plans.id, id), eq(plans.isActive, !target)))
      .returning();
    return row ?? null;
  }

  /**
   * Checks if a plan row exists by ID (for post-guard failure disambiguation).
   *
   * @returns True if a row with the given ID exists in the database.
   */
  export async function existsById(id: number, tx?: DBTransaction): Promise<boolean> {
    const executor = tx ?? db;
    const [row] = await executor.select({ id: plans.id }).from(plans).where(eq(plans.id, id)).limit(1);
    return !!row;
  }

  /**
   * Finds a plan by ID.
   *
   * @returns The plan row, or null if not found.
   */
  export async function findById(id: number, tx?: DBTransaction): Promise<PlanSelectType | null> {
    const executor = tx ?? db;
    const [row] = await executor.select().from(plans).where(eq(plans.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * Lists all active plans (for student/public catalog consumption).
   *
   * Single active predicate: `WHERE is_active = true ORDER BY created_at ASC`.
   */
  export async function listActive(tx?: DBTransaction): Promise<PlanSelectType[]> {
    const executor = tx ?? db;
    return executor.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.createdAt));
  }

  /**
   * Lists all plans regardless of active status (for admin management).
   *
   * Query: `ORDER BY created_at ASC`.
   */
  export async function listAll(tx?: DBTransaction): Promise<PlanSelectType[]> {
    const executor = tx ?? db;
    return executor.select().from(plans).orderBy(asc(plans.createdAt));
  }
}
