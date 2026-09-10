/**
 * StudentRepository subscription credit-lane write — the activation-time
 * balance crediting for a purchased subscription, extracted VERBATIM from
 * `student.repository.ts` (behavior-identical max-lines extraction; zero
 * logic change). The public surface stays the `StudentRepository` namespace
 * in `student.repository.ts`: this module backs the namespace's
 * `creditLaneBalance` method as a one-to-one delegation target. Nothing in
 * this module is part of the public API.
 *
 * Conventions carried over unchanged (per `backend/db/repo/AGENTS.md`):
 *  - the write takes `tx?: DBTransaction` as its LAST parameter and runs
 *    inside the caller's transaction when supplied, or standalone against
 *    the global handle otherwise;
 *  - no business logic, no permission checks, no i18n or logging — the
 *    caller decides what a `null` return means.
 */

import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/backend/db";
import { students } from "@/backend/db/schema/students/students";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import type { DBTransaction, StudentSelectType } from "@/backend/types";

/**
 * Frozen subscription-credit-lane → `students` balance-column resolution map.
 *
 * Keys are the `SubscriptionCreditLane` enum members themselves — never
 * caller strings — so a credit statement can only ever target one of the
 * three real balance columns. The `Record<SubscriptionCreditLane, AnyPgColumn>`
 * annotation makes a missing enum member a compile error, and
 * `Object.freeze` blocks any runtime mutation of the resolution table.
 *
 * Deliberately separate from `LANE_BALANCE_COLUMNS`: that map encodes which
 * lanes may FUND a held session (the reviews lane never does), while
 * activation crediting tops up whichever lane the purchased plan names —
 * reviews included. Folding the two vocabularies together would let a
 * held-fee debit drain the review lane, so the credit map carries its own
 * exhaustive three-lane key set.
 */
const CREDIT_LANE_BALANCE_COLUMNS: Readonly<Record<SubscriptionCreditLane, AnyPgColumn>> = Object.freeze({
  [SubscriptionCreditLane.Hifz]: students.balanceHifz,
  [SubscriptionCreditLane.Tajweed]: students.balanceTajweed,
  [SubscriptionCreditLane.Reviews]: students.balanceReviews,
});

/**
 * Credits `amount` session units to ONE student balance lane — the
 * activation-time write for a purchased subscription.
 *
 * ONE unguarded UPDATE (`SET balance_<lane> = balance_<lane> + amount
 * WHERE id = ? RETURNING`), mirroring `incrementLane`: crediting only ever
 * adds, so there is no balance predicate to race on, and the
 * `balance_* >= 0` CHECK constraints remain the DB-layer backstop (an
 * increment can only violate them via a negative amount, which the
 * purchase flow never produces). The lane column is resolved exclusively
 * through the frozen `CREDIT_LANE_BALANCE_COLUMNS` map keyed by
 * `SubscriptionCreditLane` enum members; caller strings can never select
 * a column.
 *
 * NULL-lane convention — a NULL lane credits from ZERO: the SET coalesces
 * the target column (`COALESCE(balance_x, 0) + amount`), so a
 * legacy/degenerate NULL lane is seeded with the credited amount instead
 * of the NULL-arithmetic no-op that would return the row untouched and
 * commit a paid activation with a still-NULL balance. Columns default to
 * 0 at registration — NULL is legacy-only — and the `>= 0` CHECK
 * constraints remain the DB-layer backstop (an increment can only violate
 * them via a negative amount, which the purchase flow never produces).
 *
 * `updated_at` is stamped explicitly because the raw-SQL statement bypasses
 * the query-builder's `$onUpdate` hook (same as the debit/refund pair).
 *
 * @returns The updated student row, or null when the student does not
 *   exist (the caller decides what the miss means — the repository raises
 *   nothing).
 */
export async function creditLaneBalance(
  studentId: number,
  lane: SubscriptionCreditLane,
  amount: number,
  tx?: DBTransaction
): Promise<StudentSelectType | null> {
  const balanceColumn = CREDIT_LANE_BALANCE_COLUMNS[lane];
  const executor = tx ?? db;
  const result = await executor.execute<StudentSelectType>(sql`
    UPDATE ${students}
    SET ${sql.identifier(balanceColumn.name)} = COALESCE(${balanceColumn}, 0) + ${amount},
        ${sql.identifier(students.updatedAt.name)} = now()
    WHERE ${students.id} = ${studentId}
    RETURNING id, balance_hifz AS "balanceHifz", balance_reviews AS "balanceReviews",
              balance_tajweed AS "balanceTajweed", balance_trial AS "balanceTrial",
              trial_granted_at AS "trialGrantedAt",
              primary_language AS "primaryLanguage", another_language AS "anotherLanguage",
              handshake_code AS "handshakeCode", parent_id AS "parentId",
              created_at AS "createdAt", updated_at AS "updatedAt"
  `);
  return result.rows[0] ?? null;
}
