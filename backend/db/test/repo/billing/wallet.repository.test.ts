/**
 * WalletRepository tests — the teacher `wallet` table's data-access layer
 * (`ensureWalletOnce`, `creditEarningOnce`, `findByTeacherId`,
 * `listTransactionsByWalletId`, `debitForWithdrawalOnce`,
 * `listRecentTransactions`) against the live `kottaby_test` PostgreSQL
 * instance.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Rollback-isolated tests run inside `runInRollback`; `tx` is passed to
 *    EVERY repo call, entity-setup helper, and direct Drizzle query (on
 *    every method under test `tx` is the LAST parameter).
 *  - Entities are created ONLY via `entity-setup.ts` helpers — never seed
 *    data; count assertions are scoped to fixture ids.
 *  - No `expect(...).rejects.toThrow()` — constraint probes go through
 *    `expectRepoError` inside an explicit SAVEPOINT bracket so the outer
 *    transaction stays queryable.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): every method's hit branch returns the row or
 *    projection; the cold-path miss (`findByTeacherId` for an absent
 *    teacher) returns null; the guarded withdrawal debit's miss (zero rows
 *    matched) returns null and — verified through a rolled-back savepoint
 *    probe — commits ZERO writes (the pending ledger row the call inserted
 *    dies with the transaction).
 *  - Tier 2 (boundaries): `ensureWalletOnce` idempotent re-enter (exactly
 *    one wallet row per teacher); additive credit increments with verbatim
 *    decimal-string fidelity ("25.00" + "12.50" → "37.50"); the exact
 *    withdrawal boundary (balance == amount lands on "0.00"); the ledger
 *    page limit and newest-first (`id DESC`) ordering.
 *  - Tier 4 (security/static): CHECK constraint probes — a direct negative
 *    balance / total_earning write and a direct negative ledger amount
 *    insert are each rejected by their named CHECK constraint inside a
 *    savepoint bracket; namespace-closure pin (exactly the six documented
 *    methods, no update/delete primitive for the append-only ledger); the
 *    defensive zero-row INSERT guards exercised through a typed executor
 *    stub (unreachable through a live PostgreSQL INSERT ... RETURNING).
 *
 * Money discipline mirrors the production code: amounts are decimal STRINGS
 * end-to-end; the suite performs NO numeric arithmetic on money values —
 * every balance oracle is an exact string read-back.
 */

import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { WalletRepository } from "@/backend/db/repo";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { wallet } from "@/backend/db/schema/billing/wallet";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import {
  createTestSession,
  createTestStudent,
  createTestTeacherRow,
  createTestTeacherTransaction,
  createTestUser,
  createTestWallet,
} from "@/backend/db/test/entity-setup";
import { constraintNameOf, expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import type { DBTransaction, TeacherTransactionSelectType, WalletSelectType } from "@/backend/types";

/** PostgreSQL error code for `check_violation`. */
const PG_CHECK_VIOLATION = "23514";

/**
 * Shared-PK fixture: one certified teacher (users row + teachers role-child
 * row with the shared primary key).
 *
 * @returns The teacher id (shared across `users` and `teachers`).
 */
async function createTeacherFixture(tx: DBTransaction): Promise<number> {
  const teacherUser = await createTestUser(tx, { role: "teacher" });
  await createTestTeacherRow(tx, teacherUser.id);
  return teacherUser.id;
}

/**
 * Fixture session between a fresh student and the given teacher — the
 * `teacher_transaction.session_id` FK target for earning credits.
 *
 * @returns The session id.
 */
async function createSessionFixture(tx: DBTransaction, teacherId: number): Promise<number> {
  const studentUser = await createTestUser(tx, { role: "student" });
  const student = await createTestStudent(tx, studentUser.id);
  const sessionRow = await createTestSession(tx, teacherId, student.id);
  return sessionRow.id;
}

/** Read-back oracle: the wallet row straight off the table. */
async function readWallet(tx: DBTransaction, walletId: number): Promise<WalletSelectType> {
  const [row] = await tx.select().from(wallet).where(eq(wallet.id, walletId)).limit(1);
  if (!row) {
    throw new Error(`readWallet: expected wallet ${walletId} to exist`);
  }
  return row;
}

/**
 * Ledger row count scoped to ONE wallet (never a global table count —
 * pre-existing data must not break the assertion).
 */
async function countLedgerRows(tx: DBTransaction, walletId: number): Promise<number> {
  const [row] = await tx
    .select({ ledgerCount: sql<number>`count(*)::int` })
    .from(teacherTransaction)
    .where(eq(teacherTransaction.walletId, walletId));
  return row?.ledgerCount ?? 0;
}

/** An integer teacher id that cannot exist as a `teachers` row in this transaction. */
async function absentTeacherId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${teacher.id}), 0)::int` }).from(teacher);
  return (row?.maxId ?? 0) + 1_000_000;
}

/**
 * Inserts `count` settled earning ledger rows sequentially — the rows share
 * one transaction connection, so parallel inserts would serialize on it
 * anyway and sequential ordering keeps the id sequence deterministic.
 *
 * @returns The inserted rows in insertion (ascending id) order.
 */
async function insertLedgerRows(
  tx: DBTransaction,
  walletId: number,
  count: number
): Promise<TeacherTransactionSelectType[]> {
  const rows: TeacherTransactionSelectType[] = [];
  const insertNext = async (index: number): Promise<void> => {
    if (index >= count) {
      return;
    }
    rows.push(await createTestTeacherTransaction(tx, walletId, null, { amount: `${index + 1}.00` }));
    await insertNext(index + 1);
  };
  await insertNext(0);
  return rows;
}

/**
 * Walks the Drizzle error cause chain (cycle-safe) for the original
 * PostgreSQL SQLSTATE code — Drizzle masks driver errors behind a generic
 * "failed query" message.
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

/**
 * Walks the same cause chain searching for an `Error.message` containing
 * the given substring — the PostgreSQL diagnostic that names the rejecting
 * constraint is reachable only through the chain.
 */
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

/**
 * Type guard for the zero-row INSERT stub: it claims the single `insert`
 * seam the defensive guards consume (a live `DBTransaction` shape is never
 * structurally checked here — the guards only ever call `insert`).
 */
function isZeroRowInsertStub(value: unknown): value is DBTransaction {
  return typeof value === "object" && value !== null && "insert" in value;
}

/**
 * Typed executor stub whose `insert(...).values(...).returning()` resolves
 * to zero rows. A live PostgreSQL INSERT ... RETURNING always yields one
 * row per inserted tuple, so the repositories' defensive zero-row guards
 * cannot be reached through the database — the stub exercises those guards
 * without touching a connection (no rollback wrap is needed).
 */
function zeroReturningExecutor(): DBTransaction {
  const stub = {
    insert: () => ({
      values: () => ({
        returning: async (): Promise<TeacherTransactionSelectType[]> => [],
      }),
    }),
  };
  if (!isZeroRowInsertStub(stub)) {
    throw new Error("zeroReturningExecutor: stub failed its own type guard");
  }
  return stub;
}

describe("WalletRepository — transactional paths (runInRollback)", () => {
  test("ensureWalletOnce creates a zeroed wallet for a teacher without one", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);

      const created = await WalletRepository.ensureWalletOnce(teacherUserId, tx);

      expect(created.id).toBeGreaterThan(0);
      expect(created.teacherId).toBe(teacherUserId);
      expect(created.balance).toBe("0.00");
      expect(created.totalEarning).toBe("0.00");
    });
  });

  test("ensureWalletOnce re-enter is conflict-idempotent: the same row, exactly one wallet per teacher", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);

      const first = await WalletRepository.ensureWalletOnce(teacherUserId, tx);
      const second = await WalletRepository.ensureWalletOnce(teacherUserId, tx);

      expect(second.id).toBe(first.id);
      expect(second.balance).toBe("0.00");

      // Scoped to the fixture teacher: the ON CONFLICT DO NOTHING re-enter
      // never grew the table.
      const [row] = await tx
        .select({ walletCount: sql<number>`count(*)::int` })
        .from(wallet)
        .where(eq(wallet.teacherId, teacherUserId));
      expect(row?.walletCount ?? 0).toBe(1);
    });
  });

  test("creditEarningOnce inserts one completed earning row and adds the amount to balance AND total_earning", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const sessionId = await createSessionFixture(tx, teacherUserId);
      const fixtureWallet = await WalletRepository.ensureWalletOnce(teacherUserId, tx);

      const ledger = await WalletRepository.creditEarningOnce(
        {
          walletId: fixtureWallet.id,
          sessionId,
          amount: "25.00",
          description: "completed session earning",
        },
        tx
      );

      expect(ledger.walletId).toBe(fixtureWallet.id);
      expect(ledger.sessionId).toBe(sessionId);
      expect(ledger.amount).toBe("25.00");
      expect(ledger.description).toBe("completed session earning");
      expect(ledger.type).toBe(TransactionType.Earning);
      expect(ledger.status).toBe(TransactionStatus.Completed);

      const after = await readWallet(tx, fixtureWallet.id);
      expect(after.balance).toBe("25.00");
      expect(after.totalEarning).toBe("25.00");
    });
  });

  test("creditEarningOnce is additive across credits and carries each amount verbatim (decimal-string fidelity)", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const sessionId = await createSessionFixture(tx, teacherUserId);
      const fixtureWallet = await WalletRepository.ensureWalletOnce(teacherUserId, tx);

      await WalletRepository.creditEarningOnce(
        { walletId: fixtureWallet.id, sessionId, amount: "25.00", description: "first earning" },
        tx
      );
      await WalletRepository.creditEarningOnce(
        { walletId: fixtureWallet.id, sessionId, amount: "12.50", description: "second earning" },
        tx
      );

      const after = await readWallet(tx, fixtureWallet.id);
      expect(after.balance).toBe("37.50");
      expect(after.totalEarning).toBe("37.50");

      const ledgerRows = await WalletRepository.listTransactionsByWalletId(fixtureWallet.id, tx);
      expect(ledgerRows.map(row => row.amount)).toEqual(["12.50", "25.00"]);
    });
  });

  test("findByTeacherId returns the wallet row for the owning teacher and null for an absent teacher", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const fixtureWallet = await WalletRepository.ensureWalletOnce(teacherUserId, tx);

      const found = await WalletRepository.findByTeacherId(teacherUserId, tx);
      expect(found?.id).toBe(fixtureWallet.id);

      const missing = await WalletRepository.findByTeacherId(await absentTeacherId(tx), tx);
      expect(missing).toBeNull();
    });
  });

  test("listTransactionsByWalletId returns every ledger row for the wallet, newest first (id DESC)", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const fixtureWallet = await createTestWallet(tx, teacherUserId);
      const rows = await insertLedgerRows(tx, fixtureWallet.id, 3);

      const listed = await WalletRepository.listTransactionsByWalletId(fixtureWallet.id, tx);

      expect(listed.map(row => row.id)).toEqual([rows[2]?.id, rows[1]?.id, rows[0]?.id]);
      expect(listed.every(row => row.walletId === fixtureWallet.id)).toBe(true);
      expect(await countLedgerRows(tx, fixtureWallet.id)).toBe(3);
    });
  });

  test("listRecentTransactions respects the limit and stays newest-first", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const fixtureWallet = await createTestWallet(tx, teacherUserId);
      const rows = await insertLedgerRows(tx, fixtureWallet.id, 4);

      const page = await WalletRepository.listRecentTransactions(fixtureWallet.id, 2, tx);
      expect(page.map(row => row.id)).toEqual([rows[3]?.id, rows[2]?.id]);

      // A limit beyond the row count returns every row, still newest-first.
      const fullPage = await WalletRepository.listRecentTransactions(fixtureWallet.id, 10, tx);
      expect(fullPage.map(row => row.id)).toEqual([rows[3]?.id, rows[2]?.id, rows[1]?.id, rows[0]?.id]);
    });
  });

  test("debitForWithdrawalOnce debits the guarded balance, records one pending withdrawal row, and leaves total_earning untouched", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const fixtureWallet = await createTestWallet(tx, teacherUserId, {
        balance: "50.00",
        totalEarning: "50.00",
      });

      const ledger = await WalletRepository.debitForWithdrawalOnce(
        { walletId: fixtureWallet.id, amount: "10.00", description: "payout request" },
        tx
      );
      if (!ledger) {
        throw new Error("expected the funded withdrawal debit to succeed");
      }

      expect(ledger.walletId).toBe(fixtureWallet.id);
      expect(ledger.sessionId).toBeNull();
      expect(ledger.amount).toBe("10.00");
      expect(ledger.description).toBe("payout request");
      expect(ledger.type).toBe(TransactionType.Withdrawal);
      expect(ledger.status).toBe(TransactionStatus.Pending);

      const after = await readWallet(tx, fixtureWallet.id);
      expect(after.balance).toBe("40.00");
      expect(after.totalEarning).toBe("50.00");
      expect(await countLedgerRows(tx, fixtureWallet.id)).toBe(1);
    });
  });

  test('debitForWithdrawalOnce at the exact boundary (balance == amount) succeeds and lands on "0.00"', async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const fixtureWallet = await createTestWallet(tx, teacherUserId, {
        balance: "25.00",
        totalEarning: "25.00",
      });

      const ledger = await WalletRepository.debitForWithdrawalOnce(
        { walletId: fixtureWallet.id, amount: "25.00", description: "full-balance payout" },
        tx
      );
      if (!ledger) {
        throw new Error("expected the exact-boundary debit to succeed");
      }

      const after = await readWallet(tx, fixtureWallet.id);
      expect(after.balance).toBe("0.00");
      expect(after.totalEarning).toBe("25.00");
    });
  });

  test("insufficient funds: the guarded debit returns null, the wallet is untouched, and the pending row rolls back with the transaction", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const fixtureWallet = await createTestWallet(tx, teacherUserId, {
        balance: "10.00",
        totalEarning: "10.00",
      });

      // The debit runs inside a nested transaction (a savepoint on the
      // outer rollback harness): the call itself inserts the pending
      // withdrawal row BEFORE the guarded UPDATE matches zero rows, so the
      // probe throws at the end to roll that row back and prove the
      // insufficient-funds path commits ZERO writes.
      const probeError = await expectRepoError(() =>
        tx.transaction(async probe => {
          const debited = await WalletRepository.debitForWithdrawalOnce(
            { walletId: fixtureWallet.id, amount: "25.00", description: "over-budget payout" },
            probe
          );
          expect(debited).toBeNull();

          const untouched = await readWallet(probe, fixtureWallet.id);
          expect(untouched.balance).toBe("10.00");
          expect(untouched.totalEarning).toBe("10.00");

          // The pending row this call inserted is visible inside the probe
          // transaction — and dies with the rollback below.
          expect(await countLedgerRows(probe, fixtureWallet.id)).toBe(1);

          throw new Error("probe-rollback");
        })
      );
      expect(probeError.message).toBe("probe-rollback");

      // After the savepoint rollback: the wallet is unchanged and the
      // pending ledger row is gone — zero writes survive.
      const after = await readWallet(tx, fixtureWallet.id);
      expect(after.balance).toBe("10.00");
      expect(after.totalEarning).toBe("10.00");
      expect(await countLedgerRows(tx, fixtureWallet.id)).toBe(0);
    });
  });
});

describe("WalletRepository — namespace closure", () => {
  test("exposes exactly the six documented methods — no update or delete primitive for the append-only ledger", () => {
    const exposed = Object.keys(WalletRepository).toSorted((a, b) => a.localeCompare(b));

    expect(exposed).toEqual([
      "creditEarningOnce",
      "debitForWithdrawalOnce",
      "ensureWalletOnce",
      "findByTeacherId",
      "listRecentTransactions",
      "listTransactionsByWalletId",
    ]);
    expect(exposed.some(name => /update|delete/i.test(name))).toBe(false);
  });
});

describe("WalletRepository — defensive zero-row guards (typed executor stub)", () => {
  test("creditEarningOnce throws when the ledger INSERT returns zero rows", async () => {
    const error = await expectRepoError(() =>
      WalletRepository.creditEarningOnce(
        { walletId: 1, sessionId: 1, amount: "25.00", description: "stub probe" },
        zeroReturningExecutor()
      )
    );

    expect(error.message).toContain("creditEarningOnce");
    expect(error.message).toContain("zero rows");
  });

  test("debitForWithdrawalOnce throws when the ledger INSERT returns zero rows", async () => {
    const error = await expectRepoError(() =>
      WalletRepository.debitForWithdrawalOnce(
        { walletId: 1, amount: "10.00", description: "stub probe" },
        zeroReturningExecutor()
      )
    );

    expect(error.message).toContain("debitForWithdrawalOnce");
    expect(error.message).toContain("zero rows");
  });
});

describe("WalletRepository — CHECK constraint probes (savepoint-bracketed)", () => {
  test("direct negative writes at the DB tier are rejected by the named wallet and ledger CHECK constraints", async () => {
    await runInRollback(async tx => {
      const teacherUserId = await createTeacherFixture(tx);
      const fixtureWallet = await createTestWallet(tx, teacherUserId, {
        balance: "10.00",
        totalEarning: "10.00",
      });

      // Bracket 1 — a direct negative balance write (repo bypassed).
      await tx.execute(sql`savepoint wallet_balance_probe`);
      const balanceError = await expectRepoError(() =>
        tx.update(wallet).set({ balance: "-1.00" }).where(eq(wallet.id, fixtureWallet.id))
      );
      await tx.execute(sql`rollback to savepoint wallet_balance_probe`);
      expect(constraintNameOf(balanceError)).toBe("wallet_balance_check");
      expect(hasPostgresErrorCode(balanceError, PG_CHECK_VIOLATION)).toBe(true);
      expect(causeChainContainsMessage(balanceError, "wallet_balance_check")).toBe(true);

      // Bracket 2 — a direct negative total_earning write.
      await tx.execute(sql`savepoint wallet_total_earning_probe`);
      const totalEarningError = await expectRepoError(() =>
        tx.update(wallet).set({ totalEarning: "-1.00" }).where(eq(wallet.id, fixtureWallet.id))
      );
      await tx.execute(sql`rollback to savepoint wallet_total_earning_probe`);
      expect(constraintNameOf(totalEarningError)).toBe("wallet_total_earning_check");
      expect(hasPostgresErrorCode(totalEarningError, PG_CHECK_VIOLATION)).toBe(true);
      expect(causeChainContainsMessage(totalEarningError, "wallet_total_earning_check")).toBe(true);

      // Bracket 3 — a direct negative amount insert into the ledger.
      await tx.execute(sql`savepoint ledger_amount_probe`);
      const amountError = await expectRepoError(() =>
        tx.insert(teacherTransaction).values({
          walletId: fixtureWallet.id,
          sessionId: null,
          amount: "-5.00",
          type: TransactionType.Withdrawal,
          status: TransactionStatus.Pending,
        })
      );
      await tx.execute(sql`rollback to savepoint ledger_amount_probe`);
      expect(constraintNameOf(amountError)).toBe("teacher_transaction_amount_check");
      expect(hasPostgresErrorCode(amountError, PG_CHECK_VIOLATION)).toBe(true);
      expect(causeChainContainsMessage(amountError, "teacher_transaction_amount_check")).toBe(true);

      // The savepoint brackets kept the transaction queryable and the
      // fixture wallet intact.
      const after = await readWallet(tx, fixtureWallet.id);
      expect(after.balance).toBe("10.00");
      expect(after.totalEarning).toBe("10.00");
      expect(await countLedgerRows(tx, fixtureWallet.id)).toBe(0);
    });
  });
});
