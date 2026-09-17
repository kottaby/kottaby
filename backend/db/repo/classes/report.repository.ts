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
 * The surface covers both the report write/read path and the minimal
 * EXISTS-style probe (`existsReportForSession`) that the INV-S8 homework
 * gate needs — homework may only be created for a session whose teacher
 * already filed a report.
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
import { count, desc, eq, type SQL, sql } from "drizzle-orm";
import { db, queryDb } from "@/backend/db";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import type { DBTransaction, ReportInsertType, ReportSelectType, SessionSelectType } from "@/backend/types";

/**
 * Raw joined row returned by {@link ReportRepository.listForStudent} — the
 * bare `reports` columns plus the owning session's `status` and `started_at`
 * resolved through the INNER JOIN. The repository returns raw rows only;
 * the service layer maps this shape into the parent-facing read projection
 * (coercing the raw `sessionStatus` pgEnum string onto the canonical
 * `SessionStatus` enum via a fail-closed guard).
 *
 * Because `reports.session_id` is NOT NULL with `ON DELETE CASCADE` and
 * carries a UNIQUE constraint, every report row joins to exactly one
 * session row — the INNER JOIN cannot fan out, so one return row corresponds
 * to exactly one `reports` row.
 */
export interface ReportForStudentRow {
  readonly id: number;
  readonly sessionId: number;
  readonly teacherNotes: string | null;
  readonly studentRatingByTeacher: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly sessionStatus: SessionSelectType["status"];
  readonly sessionStartedAt: Date | null;
}

/**
 * ONE module-scope JOIN-condition builder shared by `listForStudent` and
 * `countForStudent`: folds together the relationship predicate
 * (`reports.session_id = session.id`) and the tenancy predicate
 * (`session.student_id = $studentId`). Both methods apply this exact
 * fragment as the INNER JOIN's ON clause, so the paged window and the
 * honest total describe the same filtered set — the count can never
 * diverge from the list.
 *
 * Because `reports.session_id` is NOT NULL with `ON DELETE CASCADE` and
 * carries a UNIQUE constraint, the INNER JOIN cannot fan out — one report
 * row matches exactly one session row — so the count over the JOIN equals
 * the count over the bare `reports` table scoped by the same tenancy
 * predicate. No cross-student row can ever surface: the tenancy equality
 * is fused into the JOIN condition itself.
 */
function buildParentScopedReportJoinCondition(studentId: number): SQL {
  return sql.join([eq(session.id, reports.sessionId), eq(session.studentId, studentId)], sql` and `);
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
  export async function findBySessionId(sessionId: number, tx?: DBTransaction): Promise<ReportSelectType | null> {
    if (tx) {
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

  /**
   * Answers exactly one question: does ANY `reports` row exist for the
   * session id? The INV-S8 gate's probe — homework may only be created
   * for a session whose teacher already filed a report.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle
   * existence select; standalone it runs as raw parameterized SQL via
   * `queryDb`. `tx` propagation keeps the probe on the caller's atomic
   * unit (a gate evaluated mid-transaction must see the transaction's
   * own writes).
   *
   * @returns `true` when at least one report row references the session,
   *          `false` otherwise (including an unknown session id — the
   *          caller's upstream gates own existence classification).
   */
  export async function existsReportForSession(sessionId: number, tx?: DBTransaction): Promise<boolean> {
    if (tx) {
      const rows = await tx.select({ id: reports.id }).from(reports).where(eq(reports.sessionId, sessionId)).limit(1);
      return rows.length > 0;
    }
    const result = await queryDb<{ id: number }>(`SELECT id FROM reports WHERE session_id = $1 LIMIT 1`, [sessionId]);
    return result.rows.length > 0;
  }

  /**
   * Lists the student's session reports, newest-session-first, paged.
   * Consumes the shared module-scope JOIN-condition builder together with
   * `countForStudent`, so the page window and the honest total describe
   * the same filtered set.
   *
   * The INNER JOIN surfaces the owning session's `status` and
   * `started_at` columns — the parent projection's `sessionStatus` and
   * `sessionStartedAt` fields derive from these (the mapping happens in
   * the service layer, never here). Ordering is
   * `session.started_at DESC NULLS LAST, reports.id DESC`: the NULLS LAST
   * clause pins sessions that have not started yet (scheduled, no
   * `started_at`) after live sessions in the newest-first scan, and the
   * `reports.id DESC` tiebreak keeps same-instant rows deterministic
   * across pages so consecutive pages never duplicate or drop a row.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle select
   * with an explicit column projection (no `SELECT *`); standalone it
   * runs as raw parameterized SQL via `queryDb` (the student id, limit,
   * and offset each ride a bound parameter).
   *
   * @returns The raw joined rows (NOT the parent projection — the
   *          service layer maps). An offset past the end of the filtered
   *          set yields an empty array (the count companion still reports
   *          the true total).
   */
  export async function listForStudent(
    studentId: number,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<ReportForStudentRow[]> {
    if (tx) {
      return tx
        .select({
          id: reports.id,
          sessionId: reports.sessionId,
          teacherNotes: reports.teacherNotes,
          studentRatingByTeacher: reports.studentRatingByTeacher,
          createdAt: reports.createdAt,
          updatedAt: reports.updatedAt,
          sessionStatus: session.status,
          sessionStartedAt: session.startedAt,
        })
        .from(reports)
        .innerJoin(session, buildParentScopedReportJoinCondition(studentId))
        .orderBy(sql`${session.startedAt} DESC NULLS LAST`, desc(reports.id))
        .limit(limit)
        .offset(offset);
    }
    const result = await queryDb<ReportForStudentRow>(
      `SELECT r.id, r.session_id AS "sessionId", r.teacher_notes AS "teacherNotes",
              r.student_rating_by_teacher AS "studentRatingByTeacher",
              r.created_at AS "createdAt", r.updated_at AS "updatedAt",
              s.status AS "sessionStatus", s.started_at AS "sessionStartedAt"
       FROM reports r
       INNER JOIN session s ON s.id = r.session_id AND s.student_id = $1
       ORDER BY s.started_at DESC NULLS LAST, r.id DESC
       LIMIT $2 OFFSET $3`,
      [studentId, limit, offset]
    );
    return result.rows;
  }

  /**
   * Counts the student's session reports under the SAME JOIN-condition
   * as `listForStudent` (one shared predicate builder) — the honest total
   * for the paginated read. The INNER JOIN is identical to the list's
   * (same ON clause, same tenancy equality) so the count describes the
   * exact filtered set the page windows over; the join cannot fan out
   * because `reports.session_id` is UNIQUE.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle count
   * select; standalone it runs as raw parameterized SQL via `queryDb`
   * (the count returns as a string from the driver and is coerced to a
   * number here).
   *
   * @returns The total number of report rows whose owning session belongs
   *          to the student (zero when the student has no report-bearing
   *          sessions).
   */
  export async function countForStudent(studentId: number, tx?: DBTransaction): Promise<number> {
    if (tx) {
      const rows = await tx
        .select({ value: count() })
        .from(reports)
        .innerJoin(session, buildParentScopedReportJoinCondition(studentId));
      return rows[0]?.value ?? 0;
    }
    const result = await queryDb<{ value: string }>(
      `SELECT count(*) AS "value"
       FROM reports r
       INNER JOIN session s ON s.id = r.session_id AND s.student_id = $1`,
      [studentId]
    );
    return Number(result.rows[0]?.value ?? 0);
  }
}
