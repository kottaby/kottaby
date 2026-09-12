/**
 * Financial-ledger immutability proof — trigger-tier probes for the two
 * append-only financial tables (`teacher_transaction`, `student_payments`)
 * plus the `audit_logs` trail, all governed by the same immutability trigger
 * migration.
 *
 *  1. Trigger-presence probe — `pg_trigger` is queried for ALL THREE tables
 *     and BOTH the BEFORE UPDATE and BEFORE DELETE triggers must be present
 *     AND enabled (`tgenabled ≠ 'D'`) on each. A missing or disabled trigger
 *     fails the probe instead of silently weakening the tamper proofs.
 *
 *  2. Adversarial tamper probes — inside `runInRollback`, each direct
 *     `tx.update(...)` / `tx.delete(...)` attempt is bracketed in its own
 *     SAVEPOINT (`savepoint` / `rollback to savepoint`), so a raised
 *     exception never aborts the outer transaction: the row can be read
 *     back and re-probed afterwards. Attempts MUST throw with the exact
 *     raised message, asserted via the `expectRepoError` try/catch helper
 *     (NEVER `rejects.toThrow`, which deadlocks the rollback wrapper).
 *     Covered: teacher_transaction UPDATE (row compared unchanged) +
 *     DELETE (row still present); student_payments tamper UPDATE on a
 *     decided (paid) row (the full guarded-transition matrix lives in the
 *     StudentPaymentRepository suite); an idempotent re-probe (the same
 *     UPDATE fails identically on repeat, in a separate savepoint); and
 *     the compensating-row doctrine (a corrective INSERT succeeds while
 *     mutation of the original row fails — corrections flow through new
 *     rows, never in-place edits).
 *
 * DB SAFETY: every database statement in this file runs inside
 * `runInRollback` with the `tx` passed through — no fixture row ever
 * commits, and no global trigger state is touched (probes only read
 * `pg_trigger` and tamper inside savepoints).
 */

import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import {
  createTestStudent,
  createTestStudentPayment,
  createTestTeacherRow,
  createTestTeacherTransaction,
  createTestUser,
  createTestWallet,
} from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import type { DBTransaction } from "@/backend/types";
import { isPgliteProvider } from "@/test/helpers/skip-when-pglite";

// ─── Contracts under pin ─────────────────────────────────────────────────────

/** The immutability triggers the canonical migration installs on each table. */
const IMMUTABLE_TABLES = ["teacher_transaction", "student_payments", "audit_logs"] as const;

const TEACHER_TX_UPDATE_TRIGGER = "prevent_teacher_transaction_update_trigger";
const TEACHER_TX_DELETE_TRIGGER = "prevent_teacher_transaction_delete_trigger";
const PAYMENTS_UPDATE_TRIGGER = "prevent_student_payments_update_trigger";
const PAYMENTS_DELETE_TRIGGER = "prevent_student_payments_delete_trigger";
const AUDIT_UPDATE_TRIGGER = "prevent_audit_logs_update_trigger";
const AUDIT_DELETE_TRIGGER = "prevent_audit_logs_delete_trigger";

/** Raised message substrings per table (canonical migration DDL). */
const TEACHER_TX_IMMUTABLE = "teacher_transaction is immutable";
const TEACHER_TX_UPDATE_MSG = "UPDATE is not permitted";
const TEACHER_TX_DELETE_MSG = "DELETE is not permitted";
const PAYMENTS_IMMUTABLE = "student_payments is immutable";

// ─── Trigger-presence probe helpers ──────────────────────────────────────────

/** One `pg_trigger` row's identity + firing state for a table. */
interface TriggerState {
  readonly name: string;
  readonly enabled: string;
}

/** Same probe shape as the audit-immutability suite — non-internal triggers on one table. */
async function probeTriggerStates(tx: DBTransaction, table: string): Promise<TriggerState[]> {
  const discovered = await tx.execute<{ tgname: string; tgenabled: string }>(
    sql`SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = ${table}::regclass AND NOT tgisinternal`
  );
  return discovered.rows
    .map(row => ({ name: row.tgname, enabled: row.tgenabled }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** True only when the named trigger is installed AND enabled (a disabled trigger never fires). */
function isTriggerEnforcing(states: readonly TriggerState[], triggerName: string): boolean {
  const state = states.find(candidate => candidate.name === triggerName);
  return state !== undefined && state.enabled !== "D";
}

/** Asserts BOTH the BEFORE UPDATE and BEFORE DELETE triggers are present AND enabled. */
function expectTriggerPairEnforcing(states: readonly TriggerState[], updateTrigger: string, deleteTrigger: string): void {
  expect(isTriggerEnforcing(states, updateTrigger)).toBe(true);
  expect(isTriggerEnforcing(states, deleteTrigger)).toBe(true);
}

// ─── Savepoint + tamper helpers ──────────────────────────────────────────────

/**
 * Runs `probe` inside its own SAVEPOINT bracket (`savepoint` / `rollback to
 * savepoint`) on the caller's transaction. A failed statement inside the
 * bracket leaves the outer transaction fully queryable — the row can be
 * read back and re-probed after the raise.
 */
async function withinSavepoint(tx: DBTransaction, name: string, probe: () => Promise<void>): Promise<void> {
  await tx.execute(sql.raw(`savepoint ${name}`));
  await probe();
  await tx.execute(sql.raw(`rollback to savepoint ${name}`));
}

/** Captures the full ledger row state for unchanged comparisons. */
interface TeacherTxRowSnapshot {
  readonly id: number;
  readonly walletId: number;
  readonly amount: string;
  readonly type: string;
  readonly status: string;
}

/** Reads back the teacher_transaction row by id (independent oracle on the same tx). */
async function readTeacherTransactionRow(tx: DBTransaction, id: number): Promise<TeacherTxRowSnapshot | undefined> {
  const [row] = await tx
    .select({
      id: teacherTransaction.id,
      walletId: teacherTransaction.walletId,
      amount: teacherTransaction.amount,
      type: teacherTransaction.type,
      status: teacherTransaction.status,
    })
    .from(teacherTransaction)
    .where(eq(teacherTransaction.id, id))
    .limit(1);
  return row;
}

/** Independent read-back oracle — proves the fixture row is really there. */
async function expectTeacherTransactionPresent(tx: DBTransaction, id: number): Promise<void> {
  const row = await readTeacherTransactionRow(tx, id);
  expect(row).toBeDefined();
  expect(row?.id).toBe(id);
}

/** Independent read-back oracle for the payments ledger. */
async function expectStudentPaymentPresent(tx: DBTransaction, id: number): Promise<void> {
  const [row] = await tx.select({ id: studentPayments.id }).from(studentPayments).where(eq(studentPayments.id, id)).limit(1);
  expect(row).toBeDefined();
  expect(row?.id).toBe(id);
}

/**
 * Walks the Drizzle error cause chain (Drizzle masks driver errors behind a
 * generic message, so the raised trigger text is reachable only through the
 * chain) and joins every message so the DB-enforced text can be asserted
 * regardless of wrapping depth.
 */
function errorMessageChain(error: Error): string {
  const messages: string[] = [error.message];
  let current: Error = error;
  const seen = new Set<Error>([error]);
  while (current.cause instanceof Error && !seen.has(current.cause)) {
    current = current.cause;
    seen.add(current);
    messages.push(current.message);
  }
  return messages.join("\n");
}

/**
 * INSERTs one fixture teacher_transaction ledger row inside the caller's
 * transaction (user → teacher row → wallet → ledger row; the append path is
 * NEVER blocked) and returns the persisted row snapshot for tamper attempts.
 */
async function insertTeacherLedgerFixture(
  tx: DBTransaction,
  overrides: Partial<{ amount: string; type: TransactionType }> = {}
): Promise<TeacherTxRowSnapshot> {
  const user = await createTestUser(tx);
  await createTestTeacherRow(tx, user.id);
  const teacherWallet = await createTestWallet(tx, user.id);
  const row = await createTestTeacherTransaction(tx, teacherWallet.id, null, {
    type: overrides.type ?? TransactionType.Earning,
    amount: overrides.amount ?? "50.00",
  });
  return { id: row.id, walletId: row.walletId, amount: row.amount, type: row.type, status: row.status };
}

/** INSERTs one fixture student_payments row (user → student → ledger row). */
async function insertStudentPaymentFixture(tx: DBTransaction) {
  const user = await createTestUser(tx);
  const student = await createTestStudent(tx, user.id);
  return createTestStudentPayment(tx, student.id, null, { status: PaymentStatus.Paid });
}

const describeTriggerTier = isPgliteProvider() ? describe.skip : describe;

// ─── Tier 1: trigger presence on all three immutable tables ──────────────────

describeTriggerTier("financial ledger immutability — trigger presence tier", () => {
  test("both immutability triggers are present and enabled on teacher_transaction", async () => {
    await runInRollback(async tx => {
      const states = await probeTriggerStates(tx, "teacher_transaction");
      expectTriggerPairEnforcing(states, TEACHER_TX_UPDATE_TRIGGER, TEACHER_TX_DELETE_TRIGGER);
    });
  });

  test("both immutability triggers are present and enabled on student_payments", async () => {
    await runInRollback(async tx => {
      const states = await probeTriggerStates(tx, "student_payments");
      expectTriggerPairEnforcing(states, PAYMENTS_UPDATE_TRIGGER, PAYMENTS_DELETE_TRIGGER);
    });
  });

  test("both immutability triggers are present and enabled on audit_logs", async () => {
    await runInRollback(async tx => {
      const states = await probeTriggerStates(tx, "audit_logs");
      expectTriggerPairEnforcing(states, AUDIT_UPDATE_TRIGGER, AUDIT_DELETE_TRIGGER);
    });
  });

  test("every immutable table carries exactly the two migration-installed triggers", async () => {
    await runInRollback(async tx => {
      const expected = new Set([
        TEACHER_TX_UPDATE_TRIGGER,
        TEACHER_TX_DELETE_TRIGGER,
        PAYMENTS_UPDATE_TRIGGER,
        PAYMENTS_DELETE_TRIGGER,
        AUDIT_UPDATE_TRIGGER,
        AUDIT_DELETE_TRIGGER,
      ]);
      const statesByTable = await Promise.all(IMMUTABLE_TABLES.map(table => probeTriggerStates(tx, table)));
      for (const states of statesByTable) {
        expect(states.length).toBe(2);
        for (const state of states) {
          expect([...expected].includes(state.name)).toBe(true);
        }
      }
    });
  });
});

// ─── Tier 2: adversarial tamper probes under savepoint ───────────────────────

describeTriggerTier("financial ledger immutability — teacher_transaction tamper tier", () => {
  test("direct UPDATE on a teacher_transaction row is rejected and the row stays unchanged", async () => {
    await runInRollback(async tx => {
      const fixture = await insertTeacherLedgerFixture(tx);
      await expectTeacherTransactionPresent(tx, fixture.id);

      await withinSavepoint(tx, "teacher_tx_update_probe", async () => {
        const error = await expectRepoError(() =>
          tx.update(teacherTransaction).set({ amount: "999.99" }).where(eq(teacherTransaction.id, fixture.id))
        );
        const chain = errorMessageChain(error);
        expect(chain).toContain(TEACHER_TX_IMMUTABLE);
        expect(chain).toContain(TEACHER_TX_UPDATE_MSG);
      });

      const after = await readTeacherTransactionRow(tx, fixture.id);
      expect(after).toEqual(fixture);
    });
  });

  test("direct DELETE of a teacher_transaction row is rejected and the row stays present", async () => {
    await runInRollback(async tx => {
      const fixture = await insertTeacherLedgerFixture(tx);
      await expectTeacherTransactionPresent(tx, fixture.id);

      await withinSavepoint(tx, "teacher_tx_delete_probe", async () => {
        const error = await expectRepoError(() => tx.delete(teacherTransaction).where(eq(teacherTransaction.id, fixture.id)));
        const chain = errorMessageChain(error);
        expect(chain).toContain(TEACHER_TX_IMMUTABLE);
        expect(chain).toContain(TEACHER_TX_DELETE_MSG);
      });

      await expectTeacherTransactionPresent(tx, fixture.id);
    });
  });

  test("the same tamper UPDATE fails identically on repeat (idempotent re-probe)", async () => {
    await runInRollback(async tx => {
      const fixture = await insertTeacherLedgerFixture(tx);
      await expectTeacherTransactionPresent(tx, fixture.id);

      const firstMessages: string[] = [];
      await withinSavepoint(tx, "teacher_tx_repeat_probe_1", async () => {
        const error = await expectRepoError(() =>
          tx.update(teacherTransaction).set({ amount: "999.99" }).where(eq(teacherTransaction.id, fixture.id))
        );
        firstMessages.push(errorMessageChain(error));
      });

      const secondMessages: string[] = [];
      await withinSavepoint(tx, "teacher_tx_repeat_probe_2", async () => {
        const error = await expectRepoError(() =>
          tx.update(teacherTransaction).set({ amount: "999.99" }).where(eq(teacherTransaction.id, fixture.id))
        );
        secondMessages.push(errorMessageChain(error));
      });

      expect(firstMessages[0]).toContain(TEACHER_TX_IMMUTABLE);
      expect(secondMessages[0]).toBe(firstMessages[0]);
    });
  });

  test("the compensating-row doctrine holds — a corrective INSERT succeeds while mutation of the original fails", async () => {
    await runInRollback(async tx => {
      const fixture = await insertTeacherLedgerFixture(tx);
      await expectTeacherTransactionPresent(tx, fixture.id);

      await withinSavepoint(tx, "teacher_tx_compensating_probe", async () => {
        const error = await expectRepoError(() =>
          tx.update(teacherTransaction).set({ amount: "0.00" }).where(eq(teacherTransaction.id, fixture.id))
        );
        expect(errorMessageChain(error)).toContain(TEACHER_TX_IMMUTABLE);
      });

      const corrective = await createTestTeacherTransaction(tx, fixture.walletId, null, {
        type: TransactionType.Withdrawal,
        amount: "50.00",
        description: "correction for reversed earning",
      });
      expect(corrective.id).toBeGreaterThan(0);
      expect(corrective.id).not.toBe(fixture.id);
      await expectTeacherTransactionPresent(tx, corrective.id);
    });
  });
});

describeTriggerTier("financial ledger immutability — student_payments tamper tier", () => {
  test("direct UPDATE on a decided payment row is rejected and the row stays present", async () => {
    await runInRollback(async tx => {
      const payment = await insertStudentPaymentFixture(tx);
      expect(payment.status).toBe(PaymentStatus.Paid);
      await expectStudentPaymentPresent(tx, payment.id);

      await withinSavepoint(tx, "payments_update_probe", async () => {
        const error = await expectRepoError(() =>
          tx.update(studentPayments).set({ amount: "999.99" }).where(eq(studentPayments.id, payment.id))
        );
        const chain = errorMessageChain(error);
        expect(chain).toContain(PAYMENTS_IMMUTABLE);
        expect(chain).toContain("permitted only to transition a pending payment");
      });

      await expectStudentPaymentPresent(tx, payment.id);
    });
  });

  test("direct DELETE of a decided payment row is rejected and the row stays present", async () => {
    await runInRollback(async tx => {
      const payment = await insertStudentPaymentFixture(tx);
      await expectStudentPaymentPresent(tx, payment.id);

      await withinSavepoint(tx, "payments_delete_probe", async () => {
        const error = await expectRepoError(() => tx.delete(studentPayments).where(eq(studentPayments.id, payment.id)));
        const chain = errorMessageChain(error);
        expect(chain).toContain(PAYMENTS_IMMUTABLE);
        expect(chain).toContain("DELETE is not permitted");
      });

      await expectStudentPaymentPresent(tx, payment.id);
    });
  });
});
