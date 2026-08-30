/**
 * StudentRepository — data-access layer for the `students` role-child table.
 *
 * The `students` row shares its PK with `users.id` (FK ON DELETE CASCADE) and
 * carries the `handshake_code` parent-linking identifier plus the zeroed
 * credit balances (`balance_hifz`, `balance_tajweed`, `balance_reviews`) and
 * the segregated one-time free-trial lane (`balance_trial`) guarded by the
 * `trial_granted_at` marker.
 *
 * Registration-path writes (`createForRegistration`) take a REQUIRED
 * `tx: DBTransaction` (last param) so the registration transaction can roll
 * back on any child-insert failure (atomicity). The trial grant method
 * (`grantFreeTrialOnce`) and the held-balance lane debit/refund methods
 * (`decrementLaneIfAvailable` / `incrementLane`) accept an optional `tx` so
 * they can run either inside a caller's transaction or standalone against
 * the global handle.
 * Read methods (`findById`) use `queryDb` (raw parameterized SQL) on the
 * non-transactional branch for the Neon HTTP fast path, and Drizzle's query
 * builder on the transactional branch — per `backend/db/repo/AGENTS.md`.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, queryDb } from "@/backend/db";
import { students } from "@/backend/db/schema/students/students";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import type { DBQueryExecutor, DBTransaction, StudentSelectType } from "@/backend/types";

/**
 * Frozen held-balance-lane → `students` balance-column resolution map.
 *
 * Keys are the `HeldBalanceLane` enum members themselves — never caller
 * strings — so a debit/refund statement can only ever target one of the
 * three real balance columns. The `Record<HeldBalanceLane, AnyPgColumn>`
 * annotation makes a missing enum member a compile error, and
 * `Object.freeze` blocks any runtime mutation of the resolution table.
 * The `reviews` lane is deliberately absent: it never funds held fees.
 */
const LANE_BALANCE_COLUMNS: Readonly<Record<HeldBalanceLane, AnyPgColumn>> = Object.freeze({
  [HeldBalanceLane.Trial]: students.balanceTrial,
  [HeldBalanceLane.Hifz]: students.balanceHifz,
  [HeldBalanceLane.Tajweed]: students.balanceTajweed,
});

/** Type guard — narrows `DBQueryExecutor` to `DBTransaction`. */
function isDBTransaction(tx: DBQueryExecutor): tx is DBTransaction {
  return typeof tx === "object" && "select" in tx;
}

export namespace StudentRepository {
  /**
   * Inserts a `students` row for a freshly-created user during registration.
   *
   * Balances are explicitly zeroed for clarity-of-contract even though the
   * schema applies `DEFAULT 0`. `handshakeCode` is server-generated
   * by the service layer with a bounded retry loop on unique-violation.
   * `parentId` is `null` at registration — set later via the parent
   * handshake flow.
   *
   * @returns The inserted student row.
   */
  export async function createForRegistration(
    userId: number,
    handshakeCode: string,
    tx: DBTransaction
  ): Promise<StudentSelectType> {
    const [row] = await tx
      .insert(students)
      .values({
        id: userId,
        handshakeCode,
        balanceHifz: 0,
        balanceTajweed: 0,
        balanceReviews: 0,
        parentId: null,
      })
      .returning();
    if (!row) {
      throw new Error("StudentRepository.createForRegistration: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds a `students` row by its primary key (shared with `users.id`).
   *
   * Read-only — used by the student trial provisioning service to look up the
   * current grant marker state before deciding whether to invoke the grant.
   * Accepts an optional transaction so the read can run inside a caller's
   * transaction scope; falls back to the global Drizzle handle when called
   * standalone.
   *
   * @returns The matching student row, or `null` if no student carries that id.
   */
  export async function findById(studentId: number, tx?: DBQueryExecutor): Promise<StudentSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      const rows = await tx.select().from(students).where(eq(students.id, studentId)).limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<StudentSelectType>(
      `SELECT id, balance_hifz AS "balanceHifz", balance_reviews AS "balanceReviews",
              balance_tajweed AS "balanceTajweed", balance_trial AS "balanceTrial",
              trial_granted_at AS "trialGrantedAt",
              primary_language AS "primaryLanguage", another_language AS "anotherLanguage",
              handshake_code AS "handshakeCode", parent_id AS "parentId",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Atomically grants free trial session credits to a student exactly once.
   *
   * Single conditional UPDATE guarded by the trial_granted_at marker — predicate
   * evaluation and column mutation occur in the same SQL statement, so the
   * grant-once invariant holds with zero TOCTOU window. Returns true when the
   * grant was applied, false when the marker was already set (re-grant rejected);
   * the caller (student trial service) is responsible for surfacing a localized
   * conflict error on the false branch.
   */
  export async function grantFreeTrialOnce(
    studentId: number,
    trialCount: number,
    tx?: DBTransaction
  ): Promise<boolean> {
    const executor = tx ?? db;
    const updated = await executor
      .update(students)
      .set({
        balanceTrial: sql`${students.balanceTrial} + ${trialCount}`,
        trialGrantedAt: new Date(),
      })
      .where(and(eq(students.id, studentId), isNull(students.trialGrantedAt)))
      .returning({ id: students.id });
    return updated.length > 0;
  }

  /**
   * Atomically debits ONE allowance unit from the student's held-balance
   * lane when the lane still holds a positive balance.
   *
   * ONE guarded conditional UPDATE per call: the balance predicate
   * (`balance_<lane> > 0`) and the decrement share a single statement, so
   * the check-and-subtract happens atomically under PostgreSQL's row lock
   * (zero TOCTOU — a concurrent debit serializes on the same row and
   * re-evaluates the predicate against the post-decrement value). The lane
   * column is resolved exclusively through the frozen `LANE_BALANCE_COLUMNS`
   * map keyed by `HeldBalanceLane` enum members; caller strings can never
   * select a column.
   *
   * `updated_at` is stamped explicitly because the raw-SQL statement bypasses
   * the query-builder's `$onUpdate` hook. The `balance_* >= 0` CHECK
   * constraints stay untouched as the DB-layer backstop — the guarded
   * predicate prevents the negative write from ever being attempted.
   *
   * @returns `true` when the row matched and the unit was debited, `false`
   *   when the student is unknown or the lane balance was already zero (the
   *   caller decides what the miss means — the repository raises nothing).
   */
  export async function decrementLaneIfAvailable(
    studentId: number,
    lane: HeldBalanceLane,
    tx?: DBTransaction
  ): Promise<boolean> {
    const balanceColumn = LANE_BALANCE_COLUMNS[lane];
    const executor = tx ?? db;
    const result = await executor.execute<{ id: number }>(sql`
      UPDATE ${students}
      SET ${sql.identifier(balanceColumn.name)} = ${balanceColumn} - 1,
          ${sql.identifier(students.updatedAt.name)} = now()
      WHERE ${students.id} = ${studentId} AND ${balanceColumn} > 0
      RETURNING ${students.id}
    `);
    return result.rows.length > 0;
  }

  /**
   * Refunds ONE allowance unit to the student's held-balance lane
   * (unguarded `+ 1`). No upper bound exists on any lane, so the
   * `balance_* >= 0` CHECK constraints cannot trip on an increment; the
   * caller guarantees the student row exists (a refund targets the lane
   * recorded on a held session whose student FK is restrict-bound).
   *
   * Same-lane rule: the refunded lane is the caller's choice — refunds must
   * target the exact lane that funded the hold. `updated_at` is stamped
   * explicitly (raw SQL bypasses the `$onUpdate` hook), mirroring the debit
   * statement so both mutation shapes advance the row's audit timestamp.
   */
  export async function incrementLane(studentId: number, lane: HeldBalanceLane, tx?: DBTransaction): Promise<void> {
    const balanceColumn = LANE_BALANCE_COLUMNS[lane];
    const executor = tx ?? db;
    await executor.execute(sql`
      UPDATE ${students}
      SET ${sql.identifier(balanceColumn.name)} = ${balanceColumn} + 1,
          ${sql.identifier(students.updatedAt.name)} = now()
      WHERE ${students.id} = ${studentId}
    `);
  }
}
