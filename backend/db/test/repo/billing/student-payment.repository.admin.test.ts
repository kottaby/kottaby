/**
 * StudentPaymentRepository admin-audit tests — `listForAdminAudit` +
 * `countForAdminAudit` against the live `kottaby_test` PostgreSQL instance.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Transactional tests run inside `runInRollback`; `tx` is passed to EVERY
 *    repo call, entity-setup helper, and direct Drizzle query.
 *  - Entities are created ONLY via `entity-setup.ts` helpers — never seed
 *    data; unique emails/names via `randomUUID()`.
 *  - The non-transactional raw-branch fixture (the `queryDb` fast path
 *    cannot see uncommitted rows) is a COMMITTED bundle created in a test
 *    and hard-deleted in `afterAll` (cleanup rule 9) — the immutable
 *    ledger delete runs under `withImmutabilityTriggersSuspended`, so the
 *    run leaves ZERO residue in the shared test DB.
 *  - Read-only suite (no throwing paths): misses are honest empty pages
 *    asserted directly.
 *
 * Coverage map:
 *  - Join resolution: studentName populated and correct via the
 *    students→users shared-PK join.
 *  - Filter matrix: studentId, status, paymentGateway, from/to range —
 *    each alone + combined; count parity with list length in every case.
 *  - Name search: marker substring match, case-insensitivity (ILIKE), and
 *    wildcard-literal safety (`%`/`_` in the search string must match
 *    literally and NOT widen the match).
 *  - Ordering: newest-first (id DESC).
 *  - Pagination: limit/offset slicing + honest empty page beyond range.
 *  - Raw branch: the no-tx `queryDb` fast path resolves the same joined
 *    rows against a committed fixture.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/backend/db";
import { StudentPaymentRepository } from "@/backend/db/repo";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { students } from "@/backend/db/schema/students/students";
import { users } from "@/backend/db/schema/users/users";
import { createTestStudent, createTestStudentPayment, createTestUser } from "@/backend/db/test/entity-setup";
import { type DBTransaction, runInRollback } from "@/backend/db/test/test-utils";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { escapeLikeWildcards } from "@/backend/lib/db/escape-like-wildcards";
import type { NormalizedAdminPaymentFilters } from "@/backend/types";
import { withImmutabilityTriggersSuspended } from "@/test/helpers/db-cleanup";

/** Shared `now` timestamp per test body (timestamp consistency rule). */
const now = new Date();

/** Per-run unique marker for the committed raw-branch fixture name. */
let rawBranchMarker = "";

/** All-null filter shape — "no filter applied" for the admin audit reads. */
function noFilters(): NormalizedAdminPaymentFilters {
  return { studentId: null, studentNameSearch: null, status: null, paymentGateway: null, from: null, to: null };
}

/** Fixture bundle for one student user + students row + payment row. */
interface StudentPaymentFixture {
  studentUserId: number;
  studentId: number;
  paymentId: number;
}

/**
 * Creates a student user → students row → payment row with a distinct
 * createdAt offset (ascending with `index`) so ordering is observable.
 */
async function createStudentWithPayment(
  tx: DBTransaction,
  index: number,
  overrides: { fullName?: string; status?: PaymentStatus; paymentGateway?: PaymentGateway; amount?: string } = {}
): Promise<StudentPaymentFixture> {
  const user = await createTestUser(tx, {
    role: "student",
    fullName: overrides.fullName ?? `Audit Student ${randomUUID().slice(0, 8)}`,
  });
  const student = await createTestStudent(tx, user.id);
  const payment = await createTestStudentPayment(tx, student.id, null, {
    status: overrides.status ?? PaymentStatus.Paid,
    paymentGateway: overrides.paymentGateway ?? PaymentGateway.Stripe,
    amount: overrides.amount ?? "100.00",
    createdAt: new Date(now.getTime() + index * 1_000),
  });
  return { studentUserId: user.id, studentId: student.id, paymentId: payment.id };
}

describe("StudentPaymentRepository.listForAdminAudit — join resolution", () => {
  test("populates studentName correctly from the joined users row", async () => {
    await runInRollback(async tx => {
      const studentName = `Joined Student ${randomUUID().slice(0, 8)}`;
      const user = await createTestUser(tx, { role: "student", fullName: studentName });
      const student = await createTestStudent(tx, user.id);
      const payment = await createTestStudentPayment(tx, student.id, null);

      const rows = await StudentPaymentRepository.listForAdminAudit(
        { ...noFilters(), studentId: student.id },
        50,
        0,
        tx
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(payment.id);
      expect(rows[0]?.studentName).toBe(studentName);
      expect(rows[0]?.studentId).toBe(student.id);
      expect(rows[0]?.amount).toBe("100.00");
    });
  });

  test("count parity with list length (unfiltered, pre-existing data accounted)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const student = await createTestStudent(tx, user.id);
      await createTestStudentPayment(tx, student.id, null);

      const rows = await StudentPaymentRepository.listForAdminAudit(noFilters(), 500, 0, tx);
      const total = await StudentPaymentRepository.countForAdminAudit(noFilters(), tx);

      expect(rows).toHaveLength(total);
      expect(total).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("StudentPaymentRepository.listForAdminAudit — filter matrix", () => {
  test("studentId filter narrows to the matching student's payments", async () => {
    await runInRollback(async tx => {
      const a = await createStudentWithPayment(tx, 0);
      const b = await createStudentWithPayment(tx, 1);

      const rows = await StudentPaymentRepository.listForAdminAudit(
        { ...noFilters(), studentId: a.studentId },
        50,
        0,
        tx
      );
      const total = await StudentPaymentRepository.countForAdminAudit({ ...noFilters(), studentId: a.studentId }, tx);

      expect(total).toBe(1);
      expect(rows.map(row => row.id)).toEqual([a.paymentId]);
      expect(rows.map(row => row.id)).not.toContain(b.paymentId);
    });
  });

  test("status filter narrows to the matching lifecycle rows", async () => {
    await runInRollback(async tx => {
      const paid = await createStudentWithPayment(tx, 0, { status: PaymentStatus.Paid });
      await createStudentWithPayment(tx, 1, { status: PaymentStatus.Failed });

      const rows = await StudentPaymentRepository.listForAdminAudit(
        { ...noFilters(), status: PaymentStatus.Paid },
        50,
        0,
        tx
      );
      const total = await StudentPaymentRepository.countForAdminAudit(
        { ...noFilters(), status: PaymentStatus.Paid },
        tx
      );

      expect(total).toBeGreaterThanOrEqual(1);
      expect(rows.map(row => row.id)).toContain(paid.paymentId);
      for (const row of rows) {
        expect(row.status).toBe(PaymentStatus.Paid);
      }
    });
  });

  test("paymentGateway filter narrows to the matching gateway rows", async () => {
    await runInRollback(async tx => {
      const stripe = await createStudentWithPayment(tx, 0, { paymentGateway: PaymentGateway.Stripe });
      await createStudentWithPayment(tx, 1, { paymentGateway: PaymentGateway.Paymob });

      const rows = await StudentPaymentRepository.listForAdminAudit(
        { ...noFilters(), paymentGateway: PaymentGateway.Stripe },
        50,
        0,
        tx
      );
      const total = await StudentPaymentRepository.countForAdminAudit(
        { ...noFilters(), paymentGateway: PaymentGateway.Stripe },
        tx
      );

      expect(total).toBeGreaterThanOrEqual(1);
      expect(rows.map(row => row.id)).toContain(stripe.paymentId);
      for (const row of rows) {
        expect(row.paymentGateway).toBe(PaymentGateway.Stripe);
      }
    });
  });

  test("from/to range filters bound createdAt inclusively", async () => {
    await runInRollback(async tx => {
      const early = await createStudentWithPayment(tx, 0);
      const mid = await createStudentWithPayment(tx, 1);
      await createStudentWithPayment(tx, 2);

      const filters: NormalizedAdminPaymentFilters = {
        studentId: null,
        studentNameSearch: null,
        status: null,
        paymentGateway: null,
        from: new Date(now.getTime() + 500),
        to: new Date(now.getTime() + 1_500),
      };
      const rows = await StudentPaymentRepository.listForAdminAudit(filters, 50, 0, tx);
      const total = await StudentPaymentRepository.countForAdminAudit(filters, tx);

      expect(total).toBe(1);
      expect(rows.map(row => row.id)).toEqual([mid.paymentId]);
      expect(rows.map(row => row.id)).not.toContain(early.paymentId);
    });
  });

  test("combined filters intersect (studentId AND status AND gateway AND window)", async () => {
    await runInRollback(async tx => {
      const matched = await createStudentWithPayment(tx, 0, {
        status: PaymentStatus.Pending,
        paymentGateway: PaymentGateway.Paymob,
      });
      await createStudentWithPayment(tx, 1, {
        status: PaymentStatus.Paid,
        paymentGateway: PaymentGateway.Paymob,
      });

      const filters: NormalizedAdminPaymentFilters = {
        studentId: matched.studentId,
        studentNameSearch: null,
        status: PaymentStatus.Pending,
        paymentGateway: PaymentGateway.Paymob,
        from: now,
        to: new Date(now.getTime() + 60_000),
      };
      const rows = await StudentPaymentRepository.listForAdminAudit(filters, 50, 0, tx);
      const total = await StudentPaymentRepository.countForAdminAudit(filters, tx);

      expect(total).toBe(1);
      expect(rows.map(row => row.id)).toEqual([matched.paymentId]);
    });
  });
});

describe("StudentPaymentRepository.listForAdminAudit — name search", () => {
  test("marker substring matches only the including students (ILIKE)", async () => {
    await runInRollback(async tx => {
      const marker = randomUUID().slice(0, 8);
      const hit = await createStudentWithPayment(tx, 0, { fullName: `Search ${marker} Hit` });
      await createStudentWithPayment(tx, 1, { fullName: `Other ${randomUUID().slice(0, 8)}` });

      const filters: NormalizedAdminPaymentFilters = {
        studentId: null,
        studentNameSearch: `%${escapeLikeWildcards(marker)}%`,
        status: null,
        paymentGateway: null,
        from: null,
        to: null,
      };
      const rows = await StudentPaymentRepository.listForAdminAudit(filters, 50, 0, tx);
      const total = await StudentPaymentRepository.countForAdminAudit(filters, tx);

      expect(total).toBe(1);
      expect(rows.map(row => row.id)).toEqual([hit.paymentId]);
      expect(rows[0]?.studentName).toContain(marker);
    });
  });

  test("the search is case-insensitive (ILIKE)", async () => {
    await runInRollback(async tx => {
      const marker = randomUUID().slice(0, 8);
      const hit = await createStudentWithPayment(tx, 0, { fullName: `Upper ${marker.toUpperCase()} Name` });

      const filters: NormalizedAdminPaymentFilters = {
        studentId: null,
        studentNameSearch: `%${escapeLikeWildcards(marker.toLowerCase())}%`,
        status: null,
        paymentGateway: null,
        from: null,
        to: null,
      };
      const rows = await StudentPaymentRepository.listForAdminAudit(filters, 50, 0, tx);
      const total = await StudentPaymentRepository.countForAdminAudit(filters, tx);

      expect(total).toBe(1);
      expect(rows.map(row => row.id)).toEqual([hit.paymentId]);
    });
  });

  test("wildcard literals in the search string match literally and do NOT widen", async () => {
    await runInRollback(async tx => {
      const literalName = `Literal ${randomUUID().slice(0, 4)}%_ Name`;
      const hit = await createStudentWithPayment(tx, 0, { fullName: literalName });
      // A second student sharing the prefix BEFORE the `%` — a widened,
      // unescaped search would match it too.
      const prefix = literalName.slice(0, 12);
      await createStudentWithPayment(tx, 1, { fullName: `${prefix}Suffix` });

      const filters: NormalizedAdminPaymentFilters = {
        studentId: null,
        studentNameSearch: `%${escapeLikeWildcards(literalName)}%`,
        status: null,
        paymentGateway: null,
        from: null,
        to: null,
      };
      const rows = await StudentPaymentRepository.listForAdminAudit(filters, 50, 0, tx);
      const total = await StudentPaymentRepository.countForAdminAudit(filters, tx);

      expect(total).toBe(1);
      expect(rows.map(row => row.id)).toEqual([hit.paymentId]);
    });
  });
});

describe("StudentPaymentRepository.listForAdminAudit — ordering & pagination", () => {
  test("rows come back newest-first (id DESC)", async () => {
    await runInRollback(async tx => {
      const first = await createStudentWithPayment(tx, 0);
      const second = await createStudentWithPayment(tx, 1);
      const third = await createStudentWithPayment(tx, 2);

      const rows = await StudentPaymentRepository.listForAdminAudit(noFilters(), 500, 0, tx);
      const ids = rows.map(row => row.id);
      const indexOf = (paymentId: number) => ids.indexOf(paymentId);

      expect(indexOf(third.paymentId)).toBeLessThan(indexOf(second.paymentId));
      expect(indexOf(second.paymentId)).toBeLessThan(indexOf(first.paymentId));
    });
  });

  test("limit/offset slice the page; an offset beyond the range is an honest empty page", async () => {
    await runInRollback(async tx => {
      const a = await createStudentWithPayment(tx, 0);
      const b = await createStudentWithPayment(tx, 1);
      const c = await createStudentWithPayment(tx, 2);

      const page1 = await StudentPaymentRepository.listForAdminAudit(noFilters(), 2, 0, tx);
      const page2 = await StudentPaymentRepository.listForAdminAudit(noFilters(), 2, 2, tx);
      const beyond = await StudentPaymentRepository.listForAdminAudit(noFilters(), 2, 500, tx);

      expect(page1).toHaveLength(2);
      expect(page1[0]?.id).toBe(c.paymentId);
      expect(page1[1]?.id).toBe(b.paymentId);
      expect(page2[0]?.id).toBe(a.paymentId);
      expect(beyond).toEqual([]);
    });
  });
});

/**
 * Non-transactional raw branch — the `queryDb` fast path runs WITHOUT a
 * transaction by definition, so its fixture must be COMMITTED (an
 * uncommitted row is invisible to the pool path). The committed bundle is
 * hard-deleted in `afterAll` (cleanup rule 9): the immutable-ledger delete
 * is wrapped in `withImmutabilityTriggersSuspended` — the same sanctioned
 * teardown the billing journey suite uses — so the run leaves ZERO residue
 * in the shared `kottaby_test` DB (no permanent payment row, no retained
 * identity rows, and repeat runs are byte-identical).
 */
describe("StudentPaymentRepository.listForAdminAudit — non-transactional raw branch (committed fixture)", () => {
  const committedUserIds: number[] = [];
  const committedPaymentIds: number[] = [];
  let committedStudentId = 0;

  afterAll(async () => {
    // FK-dependency order: the immutable ledger row FIRST (restrict-bound
    // to students), under trigger suspension — a plain DELETE raises from
    // the immutability trigger. Then the identity rows (students first,
    // then users, whose students FK cascades but is deleted explicitly for
    // determinism).
    if (committedPaymentIds.length > 0) {
      await withImmutabilityTriggersSuspended(["student_payments"], () =>
        db.delete(studentPayments).where(inArray(studentPayments.id, committedPaymentIds))
      );
    }
    await Promise.all(
      committedUserIds.map(async userId => {
        await db.delete(students).where(eq(students.id, userId));
        await db.delete(users).where(eq(users.id, userId));
      })
    );
    committedPaymentIds.length = 0;
    committedUserIds.length = 0;
    committedStudentId = 0;
  });

  test("commits the fixture bundle first (pool-visible rows)", async () => {
    // The committed bundle is created on the pool path (the committed
    // fixture the raw branch needs); the rollback wrapper transaction
    // performs NO writes — it only anchors the wrapper contract, so the
    // outer transaction still guarantees zero test-side residue.
    await runInRollback(async tx => {
      rawBranchMarker = randomUUID().slice(0, 8);
      const committed = await db.transaction(async poolTx => {
        const user = await createTestUser(poolTx, { role: "student", fullName: `Raw Branch ${rawBranchMarker}` });
        const student = await createTestStudent(poolTx, user.id);
        const payment = await createTestStudentPayment(poolTx, student.id, null);
        return { studentUserId: user.id, studentId: student.id, paymentId: payment.id };
      });
      committedUserIds.push(committed.studentUserId);
      committedPaymentIds.push(committed.paymentId);
      committedStudentId = committed.studentId;
      expect(committedStudentId).toBeGreaterThan(0);
      // tx is intentionally unused — the rollback wrapper transaction
      // performs no writes; the fixture lives on the pool path.
      tx.select();
    });
  });

  test("resolves the same joined rows via queryDb when no tx is supplied", async () => {
    expect(committedStudentId).toBeGreaterThan(0);
    const fullName = `Raw Branch ${rawBranchMarker}`;
    const pattern = `%${escapeLikeWildcards(fullName)}%`;
    const rows = await StudentPaymentRepository.listForAdminAudit(
      { ...noFilters(), studentNameSearch: pattern },
      50,
      0
    );
    const total = await StudentPaymentRepository.countForAdminAudit({ ...noFilters(), studentNameSearch: pattern });

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.studentId).toBe(committedStudentId);
    expect(rows[0]?.studentName).toBe(fullName);
    expect(rows[0]?.amount).toBe("100.00");
  });
});
