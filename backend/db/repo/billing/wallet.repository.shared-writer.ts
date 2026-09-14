/**
 * WalletRepository shared debit writer — the `debitWithLedgerRow` primitive
 * extracted VERBATIM from the `WalletRepository` namespace in
 * `wallet.repository.ts` (behavior-identical extraction; zero logic
 * change). The teacher-facing `debitForWithdrawalOnce` (namespace file) and
 * the admin-scoped `debitAdjustmentOnce` (admin helpers module) both
 * delegate here, so the guarded-debit pair stays one implementation and
 * clone-free across the sibling modules. Nothing in this module is part of
 * the public API — the public surface remains the `WalletRepository`
 * namespace in `wallet.repository.ts`.
 *
 * Conventions carried over unchanged (per `backend/db/repo/AGENTS.md`,
 * mirroring `SessionRepository`):
 *  - Every function takes `tx?: DBTransaction` as its LAST parameter; writes
 *    execute on `tx ?? db`.
 *  - NO prepared statements, NO business logic, NO permission checks, NO
 *    i18n or logging imports — the caller decides what every result means.
 *  - Financial vocabulary is carried by the `TransactionType` /
 *    `TransactionStatus` enum members, never string literals.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { teacherTransaction, wallet } from "@/backend/db/schema/billing";
import type { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import type { DBTransaction, TeacherTransactionSelectType } from "@/backend/types";

/**
 * Shared debit writer behind `debitForWithdrawalOnce` and
 * `debitAdjustmentOnce`: inserts ONE `withdrawal` ledger row at
 * `ledgerStatus` (the in-flight payout record or the completed
 * manual-adjustment record) and debits the wallet `balance` by exactly
 * `amount` via ONE guarded UPDATE — the funds guard lives in the
 * statement's predicate (`balance >= amount`), mirroring
 * `StudentRepository.decrementLaneIfAvailable`. The amount is a decimal
 * STRING bound verbatim (never re-parsed — money discipline).
 * `total_earning` is deliberately untouched: a debit spends the balance,
 * it does not rewrite the lifetime earnings counter. The DB-side
 * `wallet_balance_check >= 0` CHECK is the concurrent-overdraw backstop
 * behind the predicate. `methodLabel` is the caller's fully-qualified
 * method name, carried verbatim into the unreachable zero-row INSERT
 * error so each public entry point keeps its own message.
 *
 * When `tx` is supplied, both writes compose on the caller's
 * transaction. When `tx` is NOT supplied, the pair is wrapped in ONE
 * atomic top-level transaction (`db.transaction`), so a missed guarded
 * debit (`null` return on insufficient funds) rolls the ledger INSERT
 * back with it — no orphan ledger row can survive without its matching
 * balance change.
 *
 * @returns The inserted ledger row, or `null` when the guarded UPDATE
 *     matched zero rows (insufficient funds — the caller classifies).
 */
export async function debitWithLedgerRow(
  insert: {
    readonly walletId: number;
    readonly amount: string;
    readonly description: string;
  },
  ledgerStatus: TransactionStatus,
  methodLabel: string,
  tx?: DBTransaction
): Promise<TeacherTransactionSelectType | null> {
  if (!tx) {
    return db.transaction(nested => debitWithLedgerRow(insert, ledgerStatus, methodLabel, nested));
  }
  const executor = tx;
  const ledgerRows = await executor
    .insert(teacherTransaction)
    .values({
      walletId: insert.walletId,
      sessionId: null,
      description: insert.description,
      amount: insert.amount,
      type: TransactionType.Withdrawal,
      status: ledgerStatus,
    })
    .returning();
  const ledger = ledgerRows[0];
  if (!ledger) {
    throw new Error(`${methodLabel}: ledger INSERT returned zero rows`);
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
