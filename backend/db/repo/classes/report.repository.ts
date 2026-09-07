/**
 * ReportRepository — data-access layer for the `reports` table.
 *
 * A report is the teacher's post-session artifact: free-form
 * `teacher_notes` plus an optional `student_rating_by_teacher` integer in
 * [0, 5] (the table CHECK is the backstop). The table carries NO teacher
 * column — the authoring teacher is reached through the session row.
 *
 * One report per session is enforced by the database itself:
 * `reports_session_id_unique` turns a duplicate submission into a raw
 * `23505` unique violation. This repository surfaces that error
 * untranslated — mapping it into a domain conflict is the service layer's
 * decision, so the repo never performs a SELECT-then-INSERT guard of its
 * own.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - One `namespace` per repository file; the namespace name is the
 *    canonical export.
 *  - Every method takes `tx` as its LAST parameter. Reads run on the
 *    caller's executor when one is supplied and fall back to raw
 *    parameterized SQL via `queryDb` (the Neon-HTTP-eligible pattern)
 *    otherwise; writes execute on `tx ?? db`.
 *  - No prepared statements: the non-transactional read branch runs
 *    through `queryDb` (Neon HTTP), which excludes module-level prepared
 *    statements, and every write is transactional
 *    (`docs/drizzle/prepared-statements.md`). No array-membership
 *    operators, no SQL line-comment sequences.
 *  - No business logic, no permission checks, no i18n or logging imports —
 *    the caller decides what `null` or a raw constraint error means.
 */
import { eq } from "drizzle-orm";
import { db, queryDb } from "@/backend/db";
import { reports } from "@/backend/db/schema/classes/reports";
import type { DBQueryExecutor, DBTransaction, ReportInsertType, ReportSelectType } from "@/backend/types";

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

export namespace ReportRepository {
  /**
   * Inserts one `reports` row and returns it (`INSERT … RETURNING`).
   *
   * The caller (report submission flow) supplies every meaningful column —
   * the session id and the report body — field by field; schema defaults
   * fill the timestamps. A session that already carries a report makes the
   * statement fail with the raw `23505` unique violation on
   * `reports_session_id_unique` (one report per session is the database's
   * arbiter); the error is NOT caught or translated here.
   *
   * @returns The inserted row with all server-generated columns populated.
   */
  export async function insertReport(insert: ReportInsertType, tx?: DBTransaction): Promise<ReportSelectType> {
    const executor = tx ?? db;
    const [row] = await executor.insert(reports).values(insert).returning();
    if (!row) {
      throw new Error("ReportRepository.insertReport: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds the report of one session by the `session_id` equality
   * predicate (the table's unique column, so at most one row matches).
   *
   * Read-only: on the caller's transaction it runs as a Drizzle select;
   * standalone it runs as raw parameterized SQL via `queryDb` (the session
   * id rides a bound parameter).
   *
   * @returns The matching report row, or `null` when the session has no
   *          report yet. Participant-scoping (returning null for
   *          non-participants) is the read service's decision — this
   *          method is the raw session-keyed read.
   */
  export async function findBySessionId(sessionId: number, tx?: DBQueryExecutor): Promise<ReportSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      const rows = await tx.select().from(reports).where(eq(reports.sessionId, sessionId)).limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<ReportSelectType>(
      `SELECT id, session_id AS "sessionId", teacher_notes AS "teacherNotes",
              student_rating_by_teacher AS "studentRatingByTeacher",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM reports WHERE session_id = $1 LIMIT 1`,
      [sessionId]
    );
    return result.rows[0] ?? null;
  }
}
