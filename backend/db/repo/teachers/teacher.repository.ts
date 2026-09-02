/**
 * TeacherRepository — data-access layer for the `teacher` role-child table.
 *
 * The `teacher` row shares its PK with `users.id` (FK ON DELETE CASCADE) and
 * carries the certification flags consumed by the teaching surfaces:
 *  - `is_approved` — the teacher is certified to teach.
 *  - `is_evaluator` — the teacher may evaluate teacher applicants.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - Reads use `queryDb` (raw parameterized SQL) on the non-transactional
 *    branch, mirroring `UserRepository.findById` — Neon HTTP fast path when
 *    eligible, Drizzle select inside a supplied transaction.
 *  - Writes are single statements that take a REQUIRED `tx: DBTransaction`
 *    (last param) — they always join the caller's atomic unit of work and
 *    never fall back to the global handle. Insert payloads are built
 *    field-by-field (no spread of caller objects), and the guarded UPDATE
 *    folds its precondition (`is_approved = false`) into the WHERE clause so
 *    the predicate and the mutation are one statement (no TOCTOU window).
 *  - No prepared statements on writes; no `inArray`; raw driver errors
 *    (e.g. a duplicate-PK `23505`) surface untranslated — the service layer
 *    owns error mapping.
 */
import { and, eq, sql } from "drizzle-orm";
import { queryDb } from "@/backend/db";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import type { DBQueryExecutor, DBTransaction, TeacherSelectType } from "@/backend/types";

/**
 * Type guard — narrows `DBQueryExecutor` to `DBTransaction`.
 *
 * `DBTransaction` (Drizzle's `PgAsyncTransaction`) exposes the `.select()`
 * builder API; raw `Pool` / `PoolClient` from `pg` do not. The presence of
 * `.select` therefore distinguishes the two at runtime without an unsafe
 * cast.
 */
function isDBTransaction(tx: DBQueryExecutor): tx is DBTransaction {
  return typeof tx === "object" && "select" in tx;
}

export namespace TeacherRepository {
  /**
   * Finds a teacher row by primary key (shared with `users.id`).
   *
   * Read-only — mirrors the `UserRepository.findById` shape: Drizzle select on
   * the supplied transaction executor, or raw parameterized SQL via `queryDb`
   * (Neon HTTP fast path) when called outside a transaction.
   *
   * @returns The matching teacher row, or `null` if no teacher has that id.
   */
  export async function findById(id: number, tx?: DBQueryExecutor): Promise<TeacherSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx.select().from(teacher).where(eq(teacher.id, id)).limit(1);
      return rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<TeacherSelectType>(
      `SELECT id,
              is_approved AS "isApproved",
              is_evaluator AS "isEvaluator",
              average_rating AS "averageRating",
              is_online AS "isOnline",
              subjects,
              request_preference AS "requestPreference",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM teacher WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Inserts a certified `teacher` row directly, bypassing the applicant
   * evaluation pipeline (cold-start bootstrapping path).
   *
   * The payload is built field-by-field: only `id`, `isApproved` and
   * `isEvaluator` are written; every other column (`averageRating`,
   * `isOnline`, `subjects`, `requestPreference`) is carried by the schema
   * defaults. A duplicate PK surfaces the raw driver `23505` error
   * untranslated — the service layer owns translation.
   *
   * @returns The inserted teacher row (Drizzle `.returning()` yields all columns).
   */
  export async function insertColdStartCertified(
    id: number,
    makeEvaluator: boolean,
    tx: DBTransaction
  ): Promise<TeacherSelectType> {
    const [row] = await tx
      .insert(teacher)
      .values({
        id,
        isApproved: true,
        isEvaluator: makeEvaluator,
      })
      .returning();
    if (!row) {
      // Should be unreachable — `.returning()` always yields the inserted row.
      throw new Error("TeacherRepository.insertColdStartCertified: insert returned no rows");
    }
    return row;
  }

  /**
   * Elevates an EXISTING unapproved teacher row to certified in a single
   * guarded UPDATE: the `is_approved = false` precondition is folded into the
   * WHERE clause, so the predicate and the mutation are one statement and a
   * concurrent certification of the same row cannot over-apply.
   *
   * Parameterized always; no prepared statement (writes are excluded), no
   * `inArray`, no string concatenation of the id.
   *
   * @returns The updated teacher row, or `null` when zero rows matched (row
   *          absent or already approved — the service layer maps that to its
   *          domain error).
   */
  export async function elevateToCertified(
    id: number,
    makeEvaluator: boolean,
    tx: DBTransaction
  ): Promise<TeacherSelectType | null> {
    const [row] = await tx
      .update(teacher)
      .set({
        isApproved: true,
        isEvaluator: makeEvaluator,
        updatedAt: sql`now()`,
      })
      .where(and(eq(teacher.id, id), eq(teacher.isApproved, false)))
      .returning();
    return row ?? null;
  }
}
