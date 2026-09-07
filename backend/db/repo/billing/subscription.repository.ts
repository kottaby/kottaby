/**
 * SubscriptionRepository — data-access layer for the `subscriptions` table.
 *
 * A subscription is owned by a generic `user_id` and links a purchaser to a
 * `plans` row. Its `status` column is the activation idempotency arbiter:
 * activation is a single guarded UPDATE (`activatePendingOnce`) whose
 * `status = 'pending'` predicate is the lock — a duplicate delivery matches
 * zero rows and the caller replays instead of re-crediting. No
 * SELECT-then-UPDATE anywhere: the WHERE clause is the atomicity guarantee.
 *
 * Reads follow the `backend/db/repo/AGENTS.md` "Neon HTTP Client for Bare
 * Reads (CRITICAL)" rule: non-transactional reads run as raw parameterized SQL
 * through `queryDb` (Neon HTTP fast path when eligible); when a transaction is
 * supplied, the read executes as a Drizzle select on that executor.
 *
 * Write methods take an optional `tx: DBTransaction` as their last parameter.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, queryDb } from "@/backend/db";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import type { DBQueryExecutor, DBTransaction, SubscriptionInsertType, SubscriptionSelectType } from "@/backend/types";

/**
 * Type guard — narrows `DBQueryExecutor` to `DBTransaction`.
 *
 * `DBTransaction` (Drizzle's `PgAsyncTransaction`) exposes the `.select()`
 * builder API; raw `Pool` / `PoolClient` from `pg` do not. The presence of
 * `.select` therefore distinguishes the two at runtime without an unsafe
 * cast.
 */
function isDBTransaction(tx: DBQueryExecutor): tx is DBTransaction {
  return typeof tx === "object" && "select" in tx;
}

/** Shared column projection with camelCase aliasing for raw `queryDb` reads. */
const SUBSCRIPTION_READ_COLUMNS = `
  id, user_id AS "userId", plan_id AS "planId", status,
  start_date AS "startDate", end_date AS "endDate",
  payment_method AS "paymentMethod", payment_reference AS "paymentReference",
  payment_verified_at AS "paymentVerifiedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export namespace SubscriptionRepository {
  /**
   * Inserts a new subscription row in the `pending` lifecycle state.
   *
   * The gateway checkout reference is carried verbatim; the partial unique
   * index on `payment_reference` guarantees at most one subscription ever
   * claims a given reference — a colliding insert raises the PostgreSQL
   * unique-violation, which this method does NOT catch (the caller
   * translates it into the duplicate-reference conflict).
   *
   * @returns The inserted subscription row with server defaults applied.
   */
  export async function insertSubscription(
    insert: SubscriptionInsertType,
    tx?: DBTransaction
  ): Promise<SubscriptionSelectType> {
    const executor = tx ?? db;
    const [row] = await executor.insert(subscriptions).values(insert).returning();
    if (!row) {
      throw new Error("SubscriptionRepository.insertSubscription: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds a subscription by ID.
   *
   * @returns The subscription row, or null if not found.
   */
  export async function findById(id: number, tx?: DBQueryExecutor): Promise<SubscriptionSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
      return rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<SubscriptionSelectType>(
      `SELECT ${SUBSCRIPTION_READ_COLUMNS} FROM subscriptions WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Finds a subscription by its gateway-issued payment reference — the
   * webhook delivery's lookup key. The partial unique index makes the
   * reference globally unambiguous among referenced rows.
   *
   * @returns The matching subscription row, or null when the reference is
   *          unknown.
   */
  export async function findByPaymentReference(
    reference: string,
    tx?: DBQueryExecutor
  ): Promise<SubscriptionSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx.select().from(subscriptions).where(eq(subscriptions.paymentReference, reference)).limit(1);
      return rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<SubscriptionSelectType>(
      `SELECT ${SUBSCRIPTION_READ_COLUMNS} FROM subscriptions WHERE payment_reference = $1 LIMIT 1`,
      [reference]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Performs the atomic pending → active activation transition.
   *
   * A single guarded `UPDATE … WHERE id = ? AND status = 'pending' …
   * RETURNING` stamps the activation window (`startDate`, `endDate`) and
   * the payment verification instant, and flips the status. The pending
   * predicate in the WHERE clause is the concurrency lock: when a second
   * delivery (or an already-activated subscription) races the first, the
   * guarded UPDATE matches zero rows and `null` is returned — the caller's
   * replay signal, with no credit side effects.
   *
   * @returns The activated row, or null when the subscription does not
   *          exist or is no longer pending (already activated — replay).
   */
  export async function activatePendingOnce(
    id: number,
    patch: { startDate: Date; endDate: Date; paymentVerifiedAt: Date },
    tx?: DBTransaction
  ): Promise<SubscriptionSelectType | null> {
    const executor = tx ?? db;
    const [row] = await executor
      .update(subscriptions)
      .set({
        status: SubscriptionStatus.Active,
        startDate: patch.startDate,
        endDate: patch.endDate,
        paymentVerifiedAt: patch.paymentVerifiedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(subscriptions.id, id), eq(subscriptions.status, SubscriptionStatus.Pending)))
      .returning();
    return row ?? null;
  }

  /**
   * Lists every subscription owned by one user, newest first.
   *
   * Owner-scoped by design — the only listing predicate is `user_id`
   * equality, so a caller can never reach another user's rows through
   * this read. Ordering is `created_at DESC`.
   *
   * @returns The owner's subscription rows, newest first; empty when the
   *          user has none.
   */
  export async function listByUserId(userId: number, tx?: DBQueryExecutor): Promise<SubscriptionSelectType[]> {
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      return tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt));
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<SubscriptionSelectType>(
      `SELECT ${SUBSCRIPTION_READ_COLUMNS} FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }
}
