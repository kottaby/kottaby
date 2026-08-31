/**
 * WalletRepository — data-access layer for the teacher `wallet` table and
 * its append-only `teacher_transaction` ledger.
 *
 * DEV3-012 (R-202): the dual-confirmation credit slice composes THREE
 * writes on the caller's transaction — ensure the wallet row exists, insert
 * the `earning` ledger row, increment the wallet's `balance` and
 * `total_earning` by the credited amount. The schema docblocks describe a
 * consistency trigger, but no such trigger exists in the database yet
 * (verified via information_schema on the dev cluster), so the wallet
 * increment is an EXPLICIT guarded UPDATE inside the same transaction —
 * the ledger row and the balance move commit atomically or not at all.
 *
 * Conventions per `backend/db/repo/AGENTS.md` (mirroring
 * `SessionRepository`):
 *  - One `namespace` per repository file; the namespace name is the
 *    canonical export.
 *  - Every method takes `tx?: DBTransaction` as its LAST parameter; writes
 *    execute on `tx ?? db`.
 *  - NO prepared statements, NO business logic, NO permission checks, NO
 *    i18n or logging imports — the caller decides what every result means.
 *  - Financial vocabulary is carried by the `TransactionType` /
 *    `TransactionStatus` enum members, never string literals.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { teacherTransaction, wallet } from "@/backend/db/schema/billing";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import type { DBTransaction, TeacherTransactionSelectType, WalletSelectType } from "@/backend/types";

export namespace WalletRepository {
  /**
   * Ensures a wallet row exists for the teacher (the schema docblock's
   * "created when a teacher is approved" writer does not exist yet, so the
   * credit primitive is self-sufficient): one idempotent
   * `INSERT … ON CONFLICT (teacher_id) DO NOTHING` followed by the
   * authoritative SELECT, on the caller's transaction. The unique
   * `wallet_teacher_id_unique` constraint makes the ensure step safe under
   * concurrent confirms — exactly one row ever exists per teacher.
   *
   * @returns The teacher's wallet row (pre-existing or just created).
   */
  export async function ensureWalletOnce(teacherId: number, tx?: DBTransaction): Promise<WalletSelectType> {
    const executor = tx ?? db;
    await executor.insert(wallet).values({ teacherId }).onConflictDoNothing();
    const rows = await executor.select().from(wallet).where(eq(wallet.teacherId, teacherId)).limit(1);
    return rows[0];
  }

  /**
   * Inserts ONE `earning` ledger row and increments the wallet's
   * `balance` and `total_earning` by the credited amount — the completed
   * dual-confirmation credit slice, on the caller's transaction. The
   * amount is the session's `fee` decimal string taken VERBATIM (never
   * re-parsed or re-rounded — B.3's platform-owned pricing). The wallet
   * increment is an explicit guarded UPDATE (no DB trigger exists); its
   * `>= 0` CHECK constraints hold because the increment is strictly
   * additive.
   *
   * @returns The inserted ledger row.
   */
  export async function creditEarningOnce(
    insert: {
      readonly walletId: number;
      readonly sessionId: number;
      readonly amount: string;
      readonly description: string;
    },
    tx?: DBTransaction
  ): Promise<TeacherTransactionSelectType> {
    const executor = tx ?? db;
    const ledgerRows = await executor
      .insert(teacherTransaction)
      .values({
        walletId: insert.walletId,
        sessionId: insert.sessionId,
        description: insert.description,
        amount: insert.amount,
        type: TransactionType.Earning,
        status: TransactionStatus.Completed,
      })
      .returning();
    const ledger = ledgerRows[0];
    if (ledger === undefined) {
      throw new Error("WalletRepository.creditEarningOnce: ledger INSERT returned zero rows");
    }
    await executor
      .update(wallet)
      .set({
        balance: sql`${wallet.balance} + ${insert.amount}`,
        totalEarning: sql`${wallet.totalEarning} + ${insert.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallet.id, insert.walletId));
    return ledger;
  }

  /**
   * Cold-path read of the teacher's wallet (probe/verification use).
   *
   * @returns The wallet row, or `null` when the teacher has none.
   */
  export async function findByTeacherId(teacherId: number, tx?: DBTransaction): Promise<WalletSelectType | null> {
    const executor = tx ?? db;
    const rows = await executor.select().from(wallet).where(eq(wallet.teacherId, teacherId)).limit(1);
    return rows[0] ?? null;
  }

  /**
   * Cold-path ledger read for one wallet (test/verification use).
   *
   * @returns Every ledger row for the wallet, newest first.
   */
  export async function listTransactionsByWalletId(
    walletId: number,
    tx?: DBTransaction
  ): Promise<TeacherTransactionSelectType[]> {
    const executor = tx ?? db;
    return executor
      .select()
      .from(teacherTransaction)
      .where(eq(teacherTransaction.walletId, walletId))
      .orderBy(sql`${teacherTransaction.id} DESC`);
  }
}
