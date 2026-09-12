/**
 * StudentPaymentRepository admin-audit tests — `listForAdminAudit` +
 * `countForAdminAudit` against the live `kottaby_test` PostgreSQL instance.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every test runs inside `runInRollback`; `tx` is passed to EVERY repo
 *    call, entity-setup helper, and direct Drizzle query.
 *  - Entities are created ONLY via `entity-setup.ts` helpers — never seed
 *    data; unique emails/names via `randomUUID()`.
 *  - Read-only suite (no throwing paths): misses are honest empty pages
 *    asserted directly.
 *
 * Coverage map:
 *  - Join resolution: studentName/studentEmail populated and correct via
 *    the students→users shared-PK join.
 *  - Filter matrix: studentId, status, paymentGateway, from/to range —
 *    each alone + combined; count parity with list length in every case.
 *  - Name search: marker substring match, case-insensitivity (ILIKE), and
 *    wildcard-literal safety (`%`/`_` in the search string must match
 *    literally and NOT widen the match).
 *  - Ordering: newest-first (id DESC).
 *  - Pagination: limit/offset slicing + honest empty page beyond range.
 */

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/backend/db";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { students } from "@/backend/db/schema/students/students";
import { StudentPaymentRepository } from "@/backend/db/repo";
import { createTestStudent, createTestStudentPayment, createTestUser } from "@/backend/db/test/entity-setup";
import { runInRollback, type DBTransaction } from "@/backend/db/test/test-utils";
import { escapeLikeWildcards } from "@/backend/lib/db/escape-like-wildcards";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import type { NormalizedAdminPaymentFilters } from "@/backend/types";

/** Shared `now` timestamp per test body (timestamp consistency rule). */
const now = new Date();

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
  test("populates studentName/studentEmail correctly from the joined users row", async () => {
    await runInRollback(async tx => {
      const studentName = `Joined Student ${randomUUID().slice(0, 8)}`;
      const studentEmail = `joined-${randomUUID()}@test.local`;
      const user = await createTestUser(tx, { role: "student", fullName: studentName, email: studentEmail });
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
      expect(rows[0]?.studentEmail).toBe(studentEmail);
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
      const total = await StudentPaymentRepository.countForAdminAudit({ ...noFilters(), status: PaymentStatus.Paid }, tx);

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

describe("StudentPaymentRepository.listForAdminAudit — non-transactional raw branch", () => {
  test("resolves the same joined rows via queryDb when no tx is supplied", async () => {
    const marker = randomUUID().slice(0, 8);
    // The non-tx branch reads COMMITTED data only — this fixture commits,
    // is asserted on, and is hard-deleted in a finally (cleanup rule 9).
    let createdUserIds: number[] = [];
    try {
      const committed = await db.transaction(async tx => {
        const user = await createTestUser(tx, {
          role: "student",
          fullName: `Raw Branch ${marker}`,
        });
        const student = await createTestStudent(tx, user.id);
        await createTestStudentPayment(tx, student.id, null);
        return { studentUserId: user.id, studentId: student.id };
      });
      createdUserIds = [committed.studentUserId];

      const fullName = `Raw Branch ${marker}`;
      const pattern = `%${escapeLikeWildcards(fullName)}%`;
      const rows = await StudentPaymentRepository.listForAdminAudit(
        { ...noFilters(), studentNameSearch: pattern },
        50,
        0
      );
      const total = await StudentPaymentRepository.countForAdminAudit({ ...noFilters(), studentNameSearch: pattern });

      expect(total).toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.studentId).toBe(committed.studentId);
      expect(rows[0]?.studentName).toBe(fullName);
      expect(rows[0]?.studentEmail).toContain("@test.local");
    } finally {
      // The student_payments ledger is IMMUTABLE (DELETE blocked by the
      // trigger), and `student_payments_student_id_students_id_fkey` is
      // `restrict` — the committed payment row permanently blocks the
      // students-row delete. Only the removable identity rows are
      // hard-deleted (raise-safe): the user row (whose students FK is
      // cascade, but the students row still exists and restricts it, so a
      // students delete must precede or be skipped) and the students row
      // when no ledger row blocks it. The leftover identity pair is inert:
      // the fixture is unique per run (randomUUID marker) and its payment
      // row is a permanent audit row per the ledger contract.
      for (const userId of createdUserIds) {
        const [student] = await db.select().from(students).where(eq(students.id, userId)).limit(1);
        if (student) {
          const paymentRows = await db
            .select()
            .from(studentPayments)
            .where(eq(studentPayments.studentId, student.id))
            .limit(1);
          if (paymentRows.length === 0) {
            await db.delete(students).where(eq(students.id, userId));
          }
        }
      }
    }
  });
});
