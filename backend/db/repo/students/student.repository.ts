/**
 * StudentRepository — data-access layer for the `students` role-child table.
 *
 * The `students` row shares its PK with `users.id` (FK ON DELETE CASCADE) and
 * carries the `handshake_code` parent-linking identifier plus the zeroed
 * credit balances (`balance_hifz`, `balance_tajweed`, `balance_reviews`).
 *
 * Writes take a REQUIRED `tx: DBTransaction` (last param) so the registration
 * transaction can roll back on any child-insert failure (atomicity).
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - Reads are read-only, single-scalar/parameterized equality lookups that
 *    take an OPTIONAL `tx` (last param) and use `queryDb` (raw parameterized
 *    SQL) on the non-transactional branch, mirroring `UserRepository`
 *    `findByEmail` / `findById` — Neon HTTP fast path when eligible, Drizzle
 *    select inside a supplied transaction. No prepared statements (single
 *    equality, no reuse win), no `inArray`, no LIKE/ILIKE, no `sql` templates.
 *  - Zero business rules, zero log strings, zero i18n imports — reads return
 *    `null` on miss; the service layer owns validation, governance filtering
 *    and error mapping.
 */
import { eq } from "drizzle-orm";
import { queryDb } from "@/backend/db";
import { students } from "@/backend/db/schema/students/students";
import { users } from "@/backend/db/schema/users/users";
import type { DBTransaction, HandshakeDiscoveryRowType, StudentSelectType } from "@/backend/types";

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
   * Reads the `handshake_code` of the `students` row sharing the given user id
   * (shared PK ≡ `users.id`).
   *
   * Single-column equality read — Drizzle select on the supplied transaction,
   * or raw parameterized SQL via `queryDb` (Neon HTTP fast path) when called
   * outside a transaction. Acquires no locks (pure read).
   *
   * @returns The row's `handshakeCode`, or `null` when no `students` row has
   *          that id (the caller owns not-found handling).
   */
  export async function findHandshakeCodeByStudentId(studentId: number, tx?: DBTransaction): Promise<string | null> {
    if (tx) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx
        .select({ handshakeCode: students.handshakeCode })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      return rows[0]?.handshakeCode ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<{ handshakeCode: string }>(
      `SELECT handshake_code AS "handshakeCode" FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    return result.rows[0]?.handshakeCode ?? null;
  }

  /**
   * Discovery read for parent-side handshake-code lookup: joins `students` to
   * `users` on the shared PK and returns EXACTLY the columns the service layer
   * needs for governance evaluation, name masking and the `linkable` signal —
   * a fixed column list, never spread-driven.
   *
   * The ONLY predicate is the parameterized equality on `handshake_code`
   * (`WHERE handshake_code = $1`); no LIKE/ILIKE, no `sql` templates, no
   * `inArray`. Governance filtering (deleted/blocked/suspended) is a service
   * concern — this method returns the row faithfully, or `null` on miss.
   *
   * @returns The joined discovery row, or `null` when no student carries that
   *          handshake code.
   */
  export async function findDiscoveryByHandshakeCode(
    code: string,
    tx?: DBTransaction
  ): Promise<HandshakeDiscoveryRowType | null> {
    // Shared parameterized read — identical column aliases on both branches.
    const readSql = `SELECT s.parent_id AS "parentId",
            u.full_name AS "fullName",
            u.is_deleted AS "isDeleted",
            u.is_blocked AS "isBlocked",
            u.suspended,
            u.suspended_at AS "suspendedAt",
            u.suspended_period_days AS "suspendedPeriodDays"
     FROM students s
     JOIN users u ON u.id = s.id
     WHERE s.handshake_code = $1
     LIMIT 1`;
    if (tx) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx
        .select({
          parentId: students.parentId,
          fullName: users.fullName,
          isDeleted: users.isDeleted,
          isBlocked: users.isBlocked,
          suspended: users.suspended,
          suspendedAt: users.suspendedAt,
          suspendedPeriodDays: users.suspendedPeriodDays,
        })
        .from(students)
        .innerJoin(users, eq(users.id, students.id))
        .where(eq(students.handshakeCode, code))
        .limit(1);
      return rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<HandshakeDiscoveryRowType>(readSql, [code]);
    return result.rows[0] ?? null;
  }
}
