/**
 * StudentPaymentRepository — data-access layer for the `student_payments`
 * payment ledger.
 *
 * The table is IMMUTABLE at the database layer: a BEFORE UPDATE trigger
 * permits exactly one mutation — the status lifecycle `pending → paid` or
 * `pending → failed` with every financial/identity column frozen
 * (`student_id`, `subscription_id`, `amount`, `currency`, `payment_gateway`,
 * `created_at`) — and a BEFORE DELETE trigger blocks removal entirely.
 * Every violated expectation raises an exception from the trigger.
 *
 * Consequently the decision writes are single guarded UPDATEs
 * (`markPaidOnce` / `markFailedOnce`) whose `status = 'pending'` predicate
 * is the concurrency lock: a replayed delivery matches zero rows and the
 * caller replays instead of re-deciding. No SELECT-then-UPDATE anywhere,
 * and no column other than `status` / `updated_at` is ever written — the
 * repo and the trigger agree on the single permitted exception.
 *
 * Reads follow the `backend/db/repo/AGENTS.md` "Neon HTTP Client for Bare
 * Reads (CRITICAL)" rule: non-transactional reads run as raw parameterized SQL
 * through `queryDb` (Neon HTTP fast path when eligible); when a transaction is
 * supplied, the read executes as a Drizzle select on that executor.
 *
 * Write methods take an optional `tx: DBTransaction` as their last parameter.
 */
import { and, asc, eq } from "drizzle-orm";
import { db, queryDb } from "@/backend/db";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { ConflictError } from "@/backend/lib/errors";
import type {
  DBQueryExecutor,
  DBTransaction,
  StudentPaymentInsertType,
  StudentPaymentSelectType,
} from "@/backend/types";

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
const PAYMENT_READ_COLUMNS = `
  id, student_id AS "studentId", subscription_id AS "subscriptionId",
  amount, currency, payment_gateway AS "paymentGateway", status,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

/**
 * One guarded status decision — the shared body of the paid/failed
 * writers. The update touches ONLY the lifecycle status (plus the bookkeep
 * timestamp); the DB trigger re-verifies that every frozen financial
 * column is unchanged, so a pending payment is the only row that can ever
 * match.
 */
async function markStatusOnce(
  subscriptionId: number,
  targetStatus: PaymentStatus,
  tx?: DBTransaction
): Promise<StudentPaymentSelectType | null> {
  const executor = tx ?? db;
  const [row] = await executor
    .update(studentPayments)
    .set({
      status: targetStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(studentPayments.subscriptionId, subscriptionId), eq(studentPayments.status, PaymentStatus.Pending)))
    .returning();
  return row ?? null;
}

export namespace StudentPaymentRepository {
  /**
   * Inserts a new payment ledger row in the `pending` lifecycle state —
   * the append-only ledger's only writer. The amount is the plan's decimal
   * string carried verbatim by the caller.
   *
   * @returns The inserted payment row with server defaults applied.
   * @throws ConflictError when the INSERT somehow returns no row — the
   *         ledger's append invariant makes that unreachable, so it can
   *         only mean a broken driver contract.
   */
  export async function insertPayment(
    insert: StudentPaymentInsertType,
    tx?: DBTransaction
  ): Promise<StudentPaymentSelectType> {
    const executor = tx ?? db;
    const [row] = await executor.insert(studentPayments).values(insert).returning();
    if (!row) {
      throw new ConflictError("StudentPaymentRepository.insertPayment: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds the payment row attached to one subscription.
   *
   * A subscription pair carries exactly one ledger row (created with the
   * subscription at purchase time), so the read takes the lowest id for
   * determinism and returns it alone.
   *
   * @returns The payment row, or null when the subscription has no payment.
   */
  export async function findBySubscriptionId(
    subscriptionId: number,
    tx?: DBQueryExecutor
  ): Promise<StudentPaymentSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx
        .select()
        .from(studentPayments)
        .where(eq(studentPayments.subscriptionId, subscriptionId))
        .orderBy(asc(studentPayments.id))
        .limit(1);
      return rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<StudentPaymentSelectType>(
      `SELECT ${PAYMENT_READ_COLUMNS} FROM student_payments
       WHERE subscription_id = $1 ORDER BY id ASC LIMIT 1`,
      [subscriptionId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Performs the atomic pending → paid decision for one subscription's
   * payment: a single guarded `UPDATE … WHERE subscription_id = ? AND
   * status = 'pending' … RETURNING` that touches only the status (plus
   * `updated_at`). The pending predicate is the lock — a replayed
   * `confirmed` delivery, or a `confirmed` arriving after a `failed`
   * decision, matches zero rows.
   *
   * @returns The paid row, or null when no pending payment exists for the
   *          subscription (already decided — replay or terminal state).
   */
  export async function markPaidOnce(
    subscriptionId: number,
    tx?: DBTransaction
  ): Promise<StudentPaymentSelectType | null> {
    return markStatusOnce(subscriptionId, PaymentStatus.Paid, tx);
  }

  /**
   * Performs the atomic pending → failed decision for one subscription's
   * payment — the same guarded single UPDATE as the paid writer, with the
   * failed outcome. A failed payment is terminal: no later writer can
   * match it.
   *
   * @returns The failed row, or null when no pending payment exists for
   *          the subscription (already decided — replay or terminal state).
   */
  export async function markFailedOnce(
    subscriptionId: number,
    tx?: DBTransaction
  ): Promise<StudentPaymentSelectType | null> {
    return markStatusOnce(subscriptionId, PaymentStatus.Failed, tx);
  }
}
