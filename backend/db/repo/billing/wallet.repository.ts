/**
 * WalletRepository — data-access layer for the teacher `wallet` table and
 * its append-only `teacher_transaction` ledger.
 *
 * Dual-confirmation credit slice (R-202): composes THREE
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

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { teacherTransaction, wallet } from "@/backend/db/schema/billing";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import type {
  AdminTeacherWalletProbe,
  AdminWalletTransactionFilters,
  AdminWithdrawalQueueRow,
  DBTransaction,
  TeacherTransactionSelectType,
  WalletSelectType,
  WithdrawalSettlementProbe,
} from "@/backend/types";

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
    if (!ledger) {
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

  /**
   * The withdrawal debit slice (R-302), on the caller's
   * transaction: inserts ONE `pending` `withdrawal` ledger row (the
   * in-flight payout record; the append-only contract means settlement is
   * a future compensating flow, never an in-place flip) and debits the
   * wallet `balance` by exactly `amount` via ONE guarded UPDATE — the
   * funds guard lives in the statement's predicate (`balance >= amount`),
   * mirroring `StudentRepository.decrementLaneIfAvailable`. The amount is
   * a decimal STRING bound verbatim (never re-parsed — money discipline).
   * `total_earning` is deliberately untouched: a withdrawal spends the
   * balance, it does not rewrite the lifetime earnings counter. The
   * DB-side `wallet_balance_check >= 0` CHECK is the concurrent-overdraw
   * backstop behind the predicate.
   *
   * @returns The inserted ledger row, or `null` when the guarded UPDATE
   *     matched zero rows (insufficient funds — the caller classifies).
   */
  export async function debitForWithdrawalOnce(
    insert: {
      readonly walletId: number;
      readonly amount: string;
      readonly description: string;
    },
    tx?: DBTransaction
  ): Promise<TeacherTransactionSelectType | null> {
    const executor = tx ?? db;
    const ledgerRows = await executor
      .insert(teacherTransaction)
      .values({
        walletId: insert.walletId,
        sessionId: null,
        description: insert.description,
        amount: insert.amount,
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Pending,
      })
      .returning();
    const ledger = ledgerRows[0];
    if (!ledger) {
      throw new Error("WalletRepository.debitForWithdrawalOnce: ledger INSERT returned zero rows");
    }
    const debited = await executor
      .update(wallet)
      .set({ balance: sql`${wallet.balance} - ${insert.amount}`, updatedAt: new Date() })
      .where(and(eq(wallet.id, insert.walletId), gte(wallet.balance, insert.amount)))
      .returning({ id: wallet.id });
    if (debited.length === 0) {
      return null;
    }
    return ledger;
  }

  /**
   * Newest-first ledger page for one wallet, capped at `limit` rows (the
   * service passes the documented 50-row surface cap; full pagination is
   * a forward item).
   *
   * @returns Up to `limit` most-recent ledger rows, newest first.
   */
  export async function listRecentTransactions(
    walletId: number,
    limit: number,
    tx?: DBTransaction
  ): Promise<TeacherTransactionSelectType[]> {
    const executor = tx ?? db;
    return executor
      .select()
      .from(teacherTransaction)
      .where(eq(teacherTransaction.walletId, walletId))
      .orderBy(desc(teacherTransaction.id))
      .limit(limit);
  }

  /**
   * Builds the ANDed predicate chain from the normalized admin ledger
   * filters: the wallet scope plus the optional type/status/date-window
   * members. Absent or null members are skipped; the `and(...)` spread over
   * the non-empty conditions always yields a defined SQL node.
   */
  function buildAdminLedgerFilterChain(walletId: number, filters: AdminWalletTransactionFilters) {
    const conditions = [eq(teacherTransaction.walletId, walletId)];
    if (filters.type !== null) {
      conditions.push(eq(teacherTransaction.type, filters.type));
    }
    if (filters.status !== null) {
      conditions.push(eq(teacherTransaction.status, filters.status));
    }
    if (filters.from !== null) {
      conditions.push(gte(teacherTransaction.createdAt, filters.from));
    }
    if (filters.to !== null) {
      conditions.push(lte(teacherTransaction.createdAt, filters.to));
    }
    return and(...conditions);
  }

  /**
   * Cold-path admin probe: the teacher's wallet row plus the teacher's
   * display identity, resolved in ONE joined read (`wallet.teacher_id`
   * shares the `teacher` PK with `users.id`, so the join chain is
   * wallet → teacher → users).
   *
   * @returns The probe row, or `null` when the teacher has no wallet.
   */
  export async function findAdminWalletProbe(
    teacherId: number,
    tx?: DBTransaction
  ): Promise<AdminTeacherWalletProbe | null> {
    const executor = tx ?? db;
    const rows = await executor
      .select({
        wallet: wallet,
        teacherName: users.fullName,
      })
      .from(wallet)
      .innerJoin(teacher, eq(teacher.id, wallet.teacherId))
      .innerJoin(users, eq(users.id, teacher.id))
      .where(eq(wallet.teacherId, teacherId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Newest-first admin-audit page over one wallet's `teacher_transaction`
   * ledger with optional type/status/date-window filters. A plain Drizzle
   * select on `tx ?? db` — the service always calls this inside its
   * transaction.
   *
   * @returns Up to `limit` ledger rows starting at `offset`, newest first.
   */
  export async function listTransactionsForAdmin(
    walletId: number,
    filters: AdminWalletTransactionFilters,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<TeacherTransactionSelectType[]> {
    const executor = tx ?? db;
    return executor
      .select()
      .from(teacherTransaction)
      .where(buildAdminLedgerFilterChain(walletId, filters))
      .orderBy(desc(teacherTransaction.id))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Count of the admin ledger view — the exact same predicate chain as
   * `listTransactionsForAdmin`.
   *
   * @returns The number of ledger rows the filtered page contains.
   */
  export async function countTransactionsForAdmin(
    walletId: number,
    filters: AdminWalletTransactionFilters,
    tx?: DBTransaction
  ): Promise<number> {
    const executor = tx ?? db;
    const rows = await executor
      .select({ total: sql<number>`count(*)::int` })
      .from(teacherTransaction)
      .where(buildAdminLedgerFilterChain(walletId, filters));
    return rows[0]?.total ?? 0;
  }

  /**
   * The pending-withdrawal settlement queue, oldest first (the
   * longest-waiting payout heads the queue per the settlement specs). The
   * predicate is EXACT parity with the analytics counter
   * (`type = withdrawal AND status = pending`). Each row carries the
   * teacher's display name and the wallet's current balance (decimal
   * string) via the wallet → teacher → users join chain.
   *
   * @returns Up to `limit` queue rows starting at `offset`, oldest first.
   */
  export async function listPendingWithdrawals(
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<AdminWithdrawalQueueRow[]> {
    const executor = tx ?? db;
    return executor
      .select({
        transaction: teacherTransaction,
        teacherName: users.fullName,
        walletBalance: wallet.balance,
      })
      .from(teacherTransaction)
      .innerJoin(wallet, eq(wallet.id, teacherTransaction.walletId))
      .innerJoin(teacher, eq(teacher.id, wallet.teacherId))
      .innerJoin(users, eq(users.id, teacher.id))
      .where(
        and(
          eq(teacherTransaction.type, TransactionType.Withdrawal),
          eq(teacherTransaction.status, TransactionStatus.Pending)
        )
      )
      .orderBy(teacherTransaction.id)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Count of the pending-withdrawal settlement queue — the exact same
   * predicate as `listPendingWithdrawals` (analytics-counter parity).
   *
   * @returns The number of pending withdrawal rows in the queue.
   */
  export async function countPendingWithdrawals(tx?: DBTransaction): Promise<number> {
    const executor = tx ?? db;
    const rows = await executor
      .select({ total: sql<number>`count(*)::int` })
      .from(teacherTransaction)
      .where(
        and(
          eq(teacherTransaction.type, TransactionType.Withdrawal),
          eq(teacherTransaction.status, TransactionStatus.Pending)
        )
      );
    return rows[0]?.total ?? 0;
  }

  /**
   * Narrow settlement probe for one ledger row — identity, wallet link,
   * amount, and the type/status pair the settlement guard inspects. A
   * human-readable disambiguation read for tests and trigger verification;
   * never trusted for the write decision.
   *
   * @returns The probe, or `null` when no ledger row has that id.
   */
  export async function findSettlementProbe(
    transactionId: number,
    tx?: DBTransaction
  ): Promise<WithdrawalSettlementProbe | null> {
    const executor = tx ?? db;
    const rows = await executor
      .select({
        id: teacherTransaction.id,
        walletId: teacherTransaction.walletId,
        amount: teacherTransaction.amount,
        type: teacherTransaction.type,
        status: teacherTransaction.status,
      })
      .from(teacherTransaction)
      .where(eq(teacherTransaction.id, transactionId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      walletId: row.walletId,
      amount: row.amount,
      type: toTransactionTypeEnum(row.type),
      status: toTransactionStatusEnum(row.status),
    };
  }

  function toTransactionTypeEnum(type: TeacherTransactionSelectType["type"]): TransactionType {
    if (type === TransactionType.Earning) {
      return TransactionType.Earning;
    }
    if (type === TransactionType.Withdrawal) {
      return TransactionType.Withdrawal;
    }
    if (type === TransactionType.Bonus) {
      return TransactionType.Bonus;
    }
    throw new Error(
      `WalletRepository: unrecognized teacher_transaction.type value ${JSON.stringify(type)} — the pgEnum constraint makes this unreachable`
    );
  }

  function toTransactionStatusEnum(status: TeacherTransactionSelectType["status"]): TransactionStatus {
    if (status === TransactionStatus.Pending) {
      return TransactionStatus.Pending;
    }
    if (status === TransactionStatus.Completed) {
      return TransactionStatus.Completed;
    }
    if (status === TransactionStatus.Failed) {
      return TransactionStatus.Failed;
    }
    throw new Error(
      `WalletRepository: unrecognized teacher_transaction.status value ${JSON.stringify(status)} — the pgEnum constraint makes this unreachable`
    );
  }

  /**
   * One guarded settlement — a single `UPDATE … WHERE id = ? AND type =
   * 'withdrawal' AND status = 'pending' … RETURNING` that flips the status
   * to `completed` or `failed`. The pending predicate is the concurrency
   * lock: a replayed settlement matches zero rows. Every frozen column is
   * unchanged (the amended DB trigger independently re-verifies the freeze
   * and re-raises on any other mutation). `nextStatus` is validated by the
   * CALLER to be `completed | failed`; the repo also defends: any other
   * member returns `null` without touching the row (the repo has no i18n
   * to explain a rejection).
   *
   * @returns The settled ledger row, or `null` when the row is missing,
   *     already settled, not a withdrawal, or `nextStatus` is not a
   *     permitted settlement target.
   */
  export async function settleWithdrawalOnce(
    insert: { readonly transactionId: number; readonly nextStatus: TransactionStatus },
    tx?: DBTransaction
  ): Promise<TeacherTransactionSelectType | null> {
    if (insert.nextStatus !== TransactionStatus.Completed && insert.nextStatus !== TransactionStatus.Failed) {
      return null;
    }
    const executor = tx ?? db;
    const rows = await executor
      .update(teacherTransaction)
      .set({ status: insert.nextStatus, updatedAt: new Date() })
      .where(
        and(
          eq(teacherTransaction.id, insert.transactionId),
          eq(teacherTransaction.type, TransactionType.Withdrawal),
          eq(teacherTransaction.status, TransactionStatus.Pending)
        )
      )
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Restores a withdrawal debit to the wallet balance — the compensating
   * half of a rejected payout, on the caller's transaction. The amount is a
   * decimal STRING bound verbatim (money discipline). The update is strictly
   * additive, so the `wallet_balance_check >= 0` CHECK cannot fire and no
   * lower guard exists.
   */
  export async function restoreWithdrawalDebitOnce(
    insert: { readonly walletId: number; readonly amount: string },
    tx?: DBTransaction
  ): Promise<void> {
    const executor = tx ?? db;
    await executor
      .update(wallet)
      .set({ balance: sql`${wallet.balance} + ${insert.amount}`, updatedAt: new Date() })
      .where(eq(wallet.id, insert.walletId));
  }

  /**
   * Credits a bonus to the wallet — the bonus slice, on the caller's
   * transaction: inserts ONE `bonus/completed` ledger row, then increments
   * the wallet's `balance` by the amount. `total_earning` is deliberately
   * untouched (a bonus is not lifetime teaching earnings — the same
   * discipline as the withdrawal debit). The increment is strictly
   * additive, so the `>= 0` CHECK constraints hold.
   *
   * @returns The inserted ledger row.
   * @throws Error when the ledger INSERT somehow returns zero rows — the
   *     append invariant makes that unreachable, so it can only mean a
   *     broken driver contract (same contract as `creditEarningOnce`).
   */
  export async function creditBonusOnce(
    insert: {
      readonly walletId: number;
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
        sessionId: null,
        description: insert.description,
        amount: insert.amount,
        type: TransactionType.Bonus,
        status: TransactionStatus.Completed,
      })
      .returning();
    const ledger = ledgerRows[0];
    if (!ledger) {
      throw new Error("WalletRepository.creditBonusOnce: ledger INSERT returned zero rows");
    }
    await executor
      .update(wallet)
      .set({
        balance: sql`${wallet.balance} + ${insert.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallet.id, insert.walletId));
    return ledger;
  }

  /**
   * Manual debit adjustment — the admin-correction slice, on the caller's
   * transaction: inserts ONE `withdrawal/completed` ledger row (the
   * description carries the machine-distinguishable manual-adjustment
   * marker composed by the SERVICE), then debits the wallet `balance` via
   * ONE guarded UPDATE (`balance >= amount` in the predicate — the funds
   * guard, mirroring `debitForWithdrawalOnce`). Unlike the withdrawal debit
   * the ledger row lands FIRST at `completed` status: if the guarded debit
   * misses, the `null` return makes the caller classify the miss, and the
   * caller's transaction rollback removes the ledger row (everything
   * composes inside one tx).
   *
   * @returns The inserted ledger row, or `null` when the guarded debit
   *     matched zero rows (insufficient funds — the caller classifies).
   */
  export async function debitAdjustmentOnce(
    insert: {
      readonly walletId: number;
      readonly amount: string;
      readonly description: string;
    },
    tx?: DBTransaction
  ): Promise<TeacherTransactionSelectType | null> {
    const executor = tx ?? db;
    const ledgerRows = await executor
      .insert(teacherTransaction)
      .values({
        walletId: insert.walletId,
        sessionId: null,
        description: insert.description,
        amount: insert.amount,
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Completed,
      })
      .returning();
    const ledger = ledgerRows[0];
    if (!ledger) {
      throw new Error("WalletRepository.debitAdjustmentOnce: ledger INSERT returned zero rows");
    }
    const debited = await executor
      .update(wallet)
      .set({ balance: sql`${wallet.balance} - ${insert.amount}`, updatedAt: new Date() })
      .where(and(eq(wallet.id, insert.walletId), gte(wallet.balance, insert.amount)))
      .returning({ id: wallet.id });
    if (debited.length === 0) {
      return null;
    }
    return ledger;
  }
}
