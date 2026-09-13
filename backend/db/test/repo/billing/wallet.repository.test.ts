/**
 * WalletRepository tests — the `debitForArbitrationOnce` reversal slice
 * (the consumed-dispute outcomes' teacher leg) against the live PostgreSQL
 * instance: the completed `withdrawal` compensating ledger row and the
 * guarded `balance` debit, on one caller transaction.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Rollback-isolated tests run inside `runInRollback`; `tx` is passed to
 *    EVERY repo call, entity-setup helper, and direct Drizzle query (on
 *    every method under test `tx` is the LAST parameter).
 *  - Entities are created ONLY via `entity-setup.ts` helpers plus
 *    file-local shared-PK fixtures — never seed data.
 *  - No `expect(...).rejects.toThrow()` — the denial path is asserted with
 *    `expectRepoError`, and the compensating-row rollback proof runs
 *    inside an explicit nested transaction (savepoint) so the outer
 *    transaction stays queryable.
 *  - A separate committed-fixture group covers the STANDALONE executor
 *    branch (the `tx ?? db` write fallback); its fixtures are registered
 *    and hard-deleted in `afterAll` (rule 9), keeping the repo/ directory's
 *    100%-coverage mandate (rule 14) honest.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): the hit branch inserts the compensating row
 *    (`withdrawal` + `completed`, keyed to the disputed session) and
 *    debits `balance` by exactly the amount; the miss branch (insufficient
 *    funds) returns `null` and leaves the balance untouched; the caller's
 *    denial throw rolls the compensating row back with the transaction —
 *    either both effects commit or neither does.
 *  - Tier 2 (boundary): the funds guard is inclusive at the exact balance
 *    (`balance == amount` lands, one cent short misses); zero and maximal
 *    decimal(10,2) amounts behave as plain strings; an over-precision
 *    amount is stored/decoded through the column's two-fraction convention
 *    (the decimal columns round — the repo never re-rounds in code).
 *  - Tier 3 (chaos/concurrency): a double arbitration on one wallet and an
 *    arbitration-vs-withdrawal race each produce exactly ONE winning debit
 *    — the funds guard in the UPDATE predicate serializes the losers into
 *    honest nulls, so the balance can never go negative and the ledger can
 *    never double-record.
 *  - Tier 4 (security/tenancy): hostile description text rides as
 *    parameterized data (stored verbatim, nothing executes); the debit's
 *    SET clause touches ONLY `balance` + `updated_at` — `total_earning`
 *    (the gross lifetime counter) and every identity column stay frozen.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { WalletRepository } from "@/backend/db/repo";
import { teacherTransaction, wallet } from "@/backend/db/schema/billing";
import { session } from "@/backend/db/schema/classes/session";
import { students } from "@/backend/db/schema/students/students";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import { createTestStudent, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import type { DBTransaction, SessionSelectType, TeacherTransactionSelectType, WalletSelectType } from "@/backend/types";
import { withImmutabilityTriggersSuspended } from "@/test/helpers/db-cleanup";

/** Shared-PK ids for one booking pair (wallet.teacher_id / session participants). */
interface WalletActors {
  teacherUserId: number;
  studentUserId: number;
}

/** Creates one certified teacher + one student pair with shared-PK rows. */
async function createWalletActors(tx: DBTransaction): Promise<WalletActors> {
  const teacherUser = await createTestUser(tx, { role: "teacher" });
  await tx.insert(teacher).values({ id: teacherUser.id, isApproved: true });
  const studentUser = await createTestUser(tx, { role: "student" });
  await createTestStudent(tx, studentUser.id);
  return { teacherUserId: teacherUser.id, studentUserId: studentUser.id };
}

/** Direct wallet-row insert (full balance control for the funds-guard matrix). */
async function insertWalletRow(
  tx: DBTransaction,
  teacherUserId: number,
  balance: string,
  totalEarning = "0.00"
): Promise<WalletSelectType> {
  const [row] = await tx.insert(wallet).values({ teacherId: teacherUserId, balance, totalEarning }).returning();
  if (!row) {
    throw new Error("insertWalletRow: insert returned no rows");
  }
  return row;
}

/**
 * The disputed consumed-escrow session the compensating row points at —
 * a dual-confirmed completed session whose fee was earned (the exact
 * provenance of an arbitration reversal).
 */
async function insertDisputedSessionRow(tx: DBTransaction, actors: WalletActors): Promise<SessionSelectType> {
  const stamp = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000);
  const [row] = await tx
    .insert(session)
    .values({
      teacherId: actors.teacherUserId,
      studentId: actors.studentUserId,
      status: SessionStatus.Disputed,
      fee: "25.00",
      feeHeld: false,
      heldBalanceLane: HeldBalanceLane.Hifz,
      startedAt: stamp,
      endedAt: stamp,
      confirmedByTeacherAt: stamp,
      confirmedByStudentAt: stamp,
    })
    .returning();
  if (!row) {
    throw new Error("insertDisputedSessionRow: insert returned no rows");
  }
  return row;
}

/** Reads the wallet row straight off the table (read-back oracle). */
async function readWalletRow(tx: DBTransaction, id: number): Promise<WalletSelectType> {
  const [row] = await tx.select().from(wallet).where(eq(wallet.id, id)).limit(1);
  if (!row) {
    throw new Error("readWalletRow: expected the wallet row to exist");
  }
  return row;
}

/** Ledger rows for one wallet, oldest first (insertion order = id order). */
async function readLedgerRows(tx: DBTransaction, walletId: number): Promise<TeacherTransactionSelectType[]> {
  return tx
    .select()
    .from(teacherTransaction)
    .where(eq(teacherTransaction.walletId, walletId))
    .orderBy(sql`${teacherTransaction.id} ASC`);
}

describe("WalletRepository.debitForArbitrationOnce — transactional paths (runInRollback)", () => {
  // ─── Tier 1: branch/statement ───────────────────────────────────────

  test("the reversal slice inserts the completed compensating row and debits exactly the amount", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);
      const walletRow = await insertWalletRow(tx, actors.teacherUserId, "50.00", "80.00");
      const description = "Dispute refund reversal";

      const ledger = await WalletRepository.debitForArbitrationOnce(
        { walletId: walletRow.id, sessionId: sessionRow.id, amount: "15.99", description },
        tx
      );

      expect(ledger).not.toBeNull();
      expect(ledger?.walletId).toBe(walletRow.id);
      expect(ledger?.sessionId).toBe(sessionRow.id);
      expect(ledger?.amount).toBe("15.99");
      expect(ledger?.description).toBe(description);
      expect(ledger?.type).toBe(TransactionType.Withdrawal);
      expect(ledger?.status).toBe(TransactionStatus.Completed);
      expect(ledger?.createdAt).not.toBeNull();

      // The debit moved ONLY the spendable balance — the gross lifetime
      // earnings counter and every identity column are frozen.
      const after = await readWalletRow(tx, walletRow.id);
      expect(after.balance).toBe("34.01");
      expect(after.totalEarning).toBe("80.00");
      expect(after.teacherId).toBe(actors.teacherUserId);
      expect(after.createdAt.getTime()).toBe(walletRow.createdAt.getTime());

      // Exactly one ledger row, and it is the compensating one.
      const rows = await readLedgerRows(tx, walletRow.id);
      expect(rows).toHaveLength(1);
      expect(ledger?.id).toBe(rows[0]?.id);
    });
  });

  test("the reversal slice returns null on insufficient funds and leaves the balance untouched", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);
      const walletRow = await insertWalletRow(tx, actors.teacherUserId, "10.00", "30.00");

      const denied = await WalletRepository.debitForArbitrationOnce(
        { walletId: walletRow.id, sessionId: sessionRow.id, amount: "15.99", description: "reversal" },
        tx
      );

      expect(denied).toBeNull();
      const after = await readWalletRow(tx, walletRow.id);
      expect(after.balance).toBe("10.00");
      expect(after.totalEarning).toBe("30.00");
    });
  });

  test("a denied arbitration commits neither the compensating row nor the debit — the caller's throw rolls the slice back", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);
      const walletRow = await insertWalletRow(tx, actors.teacherUserId, "10.00", "30.00");

      // The service-tier denial shape (requestWithdrawal's precedent): the
      // primitive returns null, the caller throws, and the nested
      // transaction (savepoint) rolls the compensating INSERT back with the
      // failed flow — the outer transaction stays queryable.
      const denialError = await expectRepoError(() =>
        tx.transaction(async nested => {
          const ledger = await WalletRepository.debitForArbitrationOnce(
            { walletId: walletRow.id, sessionId: sessionRow.id, amount: "15.99", description: "reversal" },
            nested
          );
          expect(ledger).toBeNull();
          throw new Error("arbitration denied: insufficient wallet balance");
        })
      );
      expect(denialError.message).toContain("insufficient wallet balance");

      // Either both effects commit or neither does: zero ledger rows, zero
      // balance movement after the rolled-back denial.
      expect(await readLedgerRows(tx, walletRow.id)).toHaveLength(0);
      const after = await readWalletRow(tx, walletRow.id);
      expect(after.balance).toBe("10.00");

      // The outer transaction survived the savepoint rollback.
      const stillThere = await WalletRepository.findByTeacherId(actors.teacherUserId, tx);
      expect(stillThere?.id).toBe(walletRow.id);
    });
  });

  // ─── Tier 2: money boundaries ───────────────────────────────────────

  test("the funds guard is inclusive at the exact balance and misses one cent short", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const otherActors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);

      const exact = await insertWalletRow(tx, actors.teacherUserId, "20.00", "20.00");
      const exactLedger = await WalletRepository.debitForArbitrationOnce(
        { walletId: exact.id, sessionId: sessionRow.id, amount: "20.00", description: "full fee" },
        tx
      );
      expect(exactLedger).not.toBeNull();
      expect((await readWalletRow(tx, exact.id)).balance).toBe("0.00");

      const short = await insertWalletRow(tx, otherActors.teacherUserId, "19.99", "19.99");
      const shortLedger = await WalletRepository.debitForArbitrationOnce(
        { walletId: short.id, sessionId: sessionRow.id, amount: "20.00", description: "full fee" },
        tx
      );
      expect(shortLedger).toBeNull();
      expect((await readWalletRow(tx, short.id)).balance).toBe("19.99");
    });
  });

  test("zero and maximal decimal(10,2) amounts behave as plain bound strings", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const otherActors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);

      // A zero debit is a no-op movement that still records the reversal.
      const zero = await insertWalletRow(tx, actors.teacherUserId, "5.00", "5.00");
      const zeroLedger = await WalletRepository.debitForArbitrationOnce(
        { walletId: zero.id, sessionId: sessionRow.id, amount: "0.00", description: "zero" },
        tx
      );
      expect(zeroLedger?.amount).toBe("0.00");
      expect((await readWalletRow(tx, zero.id)).balance).toBe("5.00");

      // The column's full decimal(10,2) range drains to exactly zero.
      const max = await insertWalletRow(tx, otherActors.teacherUserId, "99999999.99", "99999999.99");
      const maxLedger = await WalletRepository.debitForArbitrationOnce(
        { walletId: max.id, sessionId: sessionRow.id, amount: "99999999.99", description: "max" },
        tx
      );
      expect(maxLedger?.amount).toBe("99999999.99");
      expect((await readWalletRow(tx, max.id)).balance).toBe("0.00");
      expect((await readWalletRow(tx, max.id)).totalEarning).toBe("99999999.99");
    });
  });

  test("an over-precision amount flows through the decimal columns' two-fraction storage — the repo never re-rounds", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);
      const walletRow = await insertWalletRow(tx, actors.teacherUserId, "20.00", "40.00");

      // The amount is bound verbatim; the decimal(10,2) columns own the
      // storage convention (the service tier validates precision BEFORE
      // this primitive is reached).
      const ledger = await WalletRepository.debitForArbitrationOnce(
        { walletId: walletRow.id, sessionId: sessionRow.id, amount: "15.999", description: "over-precision" },
        tx
      );

      expect(ledger?.amount).toBe("16.00");
      const after = await readWalletRow(tx, walletRow.id);
      expect(after.balance).toBe("4.00");
      expect(after.totalEarning).toBe("40.00");
    });
  });

  // ─── Tier 3: guarded debits under duplication ───────────────────────

  test("a double arbitration on one wallet debits exactly once — the funds guard serializes the loser", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);
      const walletRow = await insertWalletRow(tx, actors.teacherUserId, "30.00", "30.00");

      // Raw statements race (the harness's single rollback connection
      // serializes them in call order): the first slice debits the full
      // balance, the second's `balance >= amount` predicate matches zero
      // rows and returns the honest null.
      const outcomes = await Promise.allSettled([
        WalletRepository.debitForArbitrationOnce(
          { walletId: walletRow.id, sessionId: sessionRow.id, amount: "30.00", description: "first" },
          tx
        ),
        WalletRepository.debitForArbitrationOnce(
          { walletId: walletRow.id, sessionId: sessionRow.id, amount: "30.00", description: "second" },
          tx
        ),
      ]);

      expect(outcomes.map(outcome => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
      const winners = outcomes.flatMap(outcome =>
        outcome.status === "fulfilled" && outcome.value !== null ? [outcome.value] : []
      );
      expect(winners).toHaveLength(1);
      expect(winners[0]?.description).toBe("first");

      // The balance drained EXACTLY once — the financial invariant the
      // funds guard owns (no double debit, no negative balance). The
      // loser's in-tx compensating row is the artifact the caller's denial
      // throw removes (proven by the savepoint test above); the harness's
      // single shared transaction cannot roll it back per-branch.
      expect((await readWalletRow(tx, walletRow.id)).balance).toBe("0.00");
      const rows = await readLedgerRows(tx, walletRow.id);
      expect(rows.map(row => row.description).toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual(
        ["first", "second"].toSorted((a, b) => a.localeCompare(b))
      );
    });
  });

  test("an arbitration and a withdrawal racing the same funds guard debit exactly once", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);
      const walletRow = await insertWalletRow(tx, actors.teacherUserId, "30.00", "30.00");

      // The arbitration slice is enqueued first, the withdrawal second; the
      // loser's `balance >= amount` predicate matches zero rows against the
      // winner's effect — the loser gets the honest null and no negative
      // balance can ever land (INV-W1's guarded-UPDATE shape).
      const outcomes = await Promise.allSettled([
        WalletRepository.debitForArbitrationOnce(
          { walletId: walletRow.id, sessionId: sessionRow.id, amount: "30.00", description: "arbitration" },
          tx
        ),
        WalletRepository.debitForWithdrawalOnce(
          { walletId: walletRow.id, amount: "30.00", description: "withdrawal" },
          tx
        ),
      ]);

      expect(outcomes.map(outcome => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
      const winners = outcomes.flatMap(outcome =>
        outcome.status === "fulfilled" && outcome.value !== null ? [outcome.value] : []
      );
      expect(winners).toHaveLength(1);
      expect(winners[0]?.description).toBe("arbitration");
      expect(winners[0]?.sessionId).toBe(sessionRow.id);

      // One debit moved the balance; the ledger carries the winner's row
      // plus the loser's un-debited in-tx artifact (see the double
      // arbitration above for the composition ruling).
      expect((await readWalletRow(tx, walletRow.id)).balance).toBe("0.00");
      const rows = await readLedgerRows(tx, walletRow.id);
      expect(rows.map(row => row.description).toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual(
        ["arbitration", "withdrawal"].toSorted((a, b) => a.localeCompare(b))
      );
      expect(rows.map(row => row.type)).toEqual([TransactionType.Withdrawal, TransactionType.Withdrawal]);
    });
  });

  // ─── Tier 4: security/tenancy ───────────────────────────────────────

  test("hostile description text rides as parameterized data — stored verbatim, nothing executes", async () => {
    await runInRollback(async tx => {
      const actors = await createWalletActors(tx);
      const sessionRow = await insertDisputedSessionRow(tx, actors);
      const walletRow = await insertWalletRow(tx, actors.teacherUserId, "50.00", "50.00");
      const hostileDescription = "reversal'); DELETE FROM wallet; UPDATE wallet SET balance = 0; --";

      const ledger = await WalletRepository.debitForArbitrationOnce(
        { walletId: walletRow.id, sessionId: sessionRow.id, amount: "10.00", description: hostileDescription },
        tx
      );

      // The text landed verbatim as data and nothing executed: the wallet
      // row is exactly as the guarded debit left it.
      expect(ledger?.description).toBe(hostileDescription);
      const after = await readWalletRow(tx, walletRow.id);
      expect(after.balance).toBe("40.00");
      expect(after.teacherId).toBe(actors.teacherUserId);
    });
  });
});

/**
 * Standalone executor branch — the `tx ?? db` write fallback. This branch
 * runs WITHOUT a transaction by definition, so its fixtures must be
 * COMMITTED (an uncommitted row is invisible to the pool path). They are
 * registered here and hard-deleted in `afterAll` (rule 9) in FK-dependency
 * order (ledger rows first — the wallet FK is restrict-bound; sessions
 * before the participant rows — the teacher/student FKs are restrict-bound
 * while sessions reference them). The push-provisioned test database
 * carries no immutability trigger on the ledger (the migration-installed
 * triggers only exist in migrate-provisioned environments), so the ledger
 * delete needs no trigger suspension here.
 */
describe("WalletRepository.debitForArbitrationOnce — standalone executor path (committed fixtures)", () => {
  const committedTeacherTransactionIds: number[] = [];
  const committedWalletIds: number[] = [];
  const committedSessionIds: number[] = [];
  const committedUserIds: number[] = [];

  afterAll(async () => {
    // Ledger rows first (wallet FK restrict), then sessions (participant
    // FKs restrict), then the users cascade the role rows. The ledger is
    // append-only in production — the sweep runs under the sanctioned
    // immutability-trigger suspension, mirroring the journey teardowns.
    await withImmutabilityTriggersSuspended(["teacher_transaction"], async () => {
      await Promise.all(
        committedTeacherTransactionIds.map(id => db.delete(teacherTransaction).where(eq(teacherTransaction.id, id)))
      );
    });
    committedTeacherTransactionIds.length = 0;
    await Promise.all(committedWalletIds.map(id => db.delete(wallet).where(eq(wallet.id, id))));
    committedWalletIds.length = 0;
    await Promise.all(committedSessionIds.map(id => db.delete(session).where(eq(session.id, id))));
    committedSessionIds.length = 0;
    await Promise.all(
      committedUserIds.map(async userId => {
        await db.delete(teacher).where(eq(teacher.id, userId));
        await db.delete(students).where(eq(students.id, userId));
        await db.delete(users).where(eq(users.id, userId));
      })
    );
    committedUserIds.length = 0;
  });

  test("the reversal slice runs on the pool fallback and commits both effects", async () => {
    const fixture = await db.transaction(async tx => {
      const pair = await createWalletActors(tx);
      committedUserIds.push(pair.teacherUserId, pair.studentUserId);
      const sessionRow = await insertDisputedSessionRow(tx, pair);
      const walletRow = await insertWalletRow(tx, pair.teacherUserId, "40.00", "40.00");
      committedSessionIds.push(sessionRow.id);
      committedWalletIds.push(walletRow.id);
      return { pair, sessionRow, walletRow };
    });

    const ledger = await WalletRepository.debitForArbitrationOnce({
      walletId: fixture.walletRow.id,
      sessionId: fixture.sessionRow.id,
      amount: "25.00",
      description: "pool reversal",
    });

    expect(ledger).not.toBeNull();
    committedTeacherTransactionIds.push(ledger?.id ?? 0);
    expect(ledger?.type).toBe(TransactionType.Withdrawal);
    expect(ledger?.status).toBe(TransactionStatus.Completed);
    expect(ledger?.sessionId).toBe(fixture.sessionRow.id);
    expect(ledger?.amount).toBe("25.00");

    const after = await WalletRepository.findByTeacherId(fixture.pair.teacherUserId);
    expect(after?.balance).toBe("15.00");
    expect(after?.totalEarning).toBe("40.00");
  });
});
