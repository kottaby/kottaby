/**
 * HomeWorkRepository — data-access layer for the `home_work` table.
 *
 * A homework row is the per-session assignment: two parallel tracks
 * (`current_*` = Jadid, the new memorization; `revision_*` = Madi, the
 * revision), each carrying an ayah span, a grade, and a surah/juz
 * reference. `session_id` is UNIQUE (`home_work_session_id_unique`) — one
 * assignment row per session — and both grade columns are nullable: a row
 * is INSERTED ungraded (assignment without grade) and graded later
 * through the report submission flow, exactly once.
 *
 * The one-shot grade write is a single guarded UPDATE whose predicate
 * (row identity + BOTH grades still NULL) and the mutation share one
 * statement, so predicate evaluation happens under PostgreSQL's row lock
 * with zero check-then-write window. A zero-row match reports `null` —
 * deciding WHY (unknown id vs already graded) belongs to the caller.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - One `namespace` per repository file; the namespace name is the
 *    canonical export.
 *  - Every method takes `tx` as its LAST parameter. Reads run on the
 *    caller's transaction when supplied and fall back to raw parameterized
 *    SQL via `queryDb` (the Neon-HTTP-eligible pattern) otherwise; writes
 *    execute on `tx ?? db`.
 *  - No prepared statements: the non-transactional read branches run
 *    through `queryDb` (Neon HTTP), which excludes module-level prepared
 *    statements, and every write is transactional
 *    (`docs/drizzle/prepared-statements.md`). No array-membership
 *    operators, no SQL line-comment sequences.
 *  - No business logic, no permission checks, no i18n or logging imports —
 *    the caller decides what `null` or a raw constraint error means.
 */
import { and, count, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { db, queryDb } from "@/backend/db";
import { homeWork } from "@/backend/db/schema/classes/home-work";
import { session } from "@/backend/db/schema/classes/session";
import type { DBTransaction, HomeWorkGradeFieldsInput, HomeWorkInsertType, HomeWorkSelectType } from "@/backend/types";

/**
 * ONE module-scope JOIN-condition builder shared by `listForStudent` and
 * `countForStudent`: folds together the relationship predicate
 * (`home_work.session_id = session.id`) and the tenancy predicate
 * (`session.student_id = $studentId`). Both methods apply this exact
 * fragment as the INNER JOIN's ON clause, so the paged window and the
 * honest total describe the same filtered set — the count can never
 * diverge from the list.
 *
 * Because `home_work.session_id` is NOT NULL with `ON DELETE CASCADE`
 * and carries a UNIQUE constraint, the INNER JOIN cannot fan out — one
 * homework row matches exactly one session row — so the count over the
 * JOIN equals the count over the bare `home_work` table scoped by the
 * same tenancy predicate. No cross-student row can ever surface: the
 * tenancy equality is fused into the JOIN condition itself.
 */
function buildParentScopedHomeWorkJoinCondition(studentId: number): SQL {
  return sql.join([eq(session.id, homeWork.sessionId), eq(session.studentId, studentId)], sql` and `);
}

export namespace HomeWorkRepository {
  /**
   * Inserts one `home_work` row and returns it (`INSERT … RETURNING`).
   *
   * The caller (report submission flow) supplies the session id and the
   * Jadid/Madi assignment blocks field by field; the grade columns may be
   * omitted entirely — an assignment WITHOUT grades is a normal state
   * (the row is graded later through the one-shot guarded update). Schema
   * defaults fill the timestamps. A session that already carries an
   * assignment makes the statement fail with the raw `23505` unique
   * violation on `home_work_session_id_unique`; the error is NOT caught
   * or translated here.
   *
   * @returns The inserted row with all server-generated columns populated.
   */
  export async function insertHomeWork(insert: HomeWorkInsertType, tx?: DBTransaction): Promise<HomeWorkSelectType> {
    const executor = tx ?? db;
    const [row] = await executor.insert(homeWork).values(insert).returning();
    if (!row) {
      throw new Error("HomeWorkRepository.insertHomeWork: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds the homework row of one session by the `session_id` equality
   * predicate (the table's unique column, so at most one row matches).
   *
   * Read-only: on the caller's transaction it runs as a Drizzle select;
   * standalone it runs as raw parameterized SQL via `queryDb` (the session
   * id rides a bound parameter).
   *
   * @returns The matching homework row, or `null` when the session has no
   *          assignment yet.
   */
  export async function findBySessionId(sessionId: number, tx?: DBTransaction): Promise<HomeWorkSelectType | null> {
    if (tx) {
      const rows = await tx.select().from(homeWork).where(eq(homeWork.sessionId, sessionId)).limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<HomeWorkSelectType>(
      `SELECT id, session_id AS "sessionId",
              current_from_ayah AS "currentFromAyah", current_to_ayah AS "currentToAyah",
              current_grade AS "currentGrade", current_surah_juz AS "currentSurahJuz",
              revision_from_ayah AS "revisionFromAyah", revision_to_ayah AS "revisionToAyah",
              revision_grade AS "revisionGrade", revision_surah_juz AS "revisionSurahJuz",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM home_work WHERE session_id = $1 LIMIT 1`,
      [sessionId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Finds the student's NEWEST homework row — the grading probe of a
   * subsequent report submission. The student scope is resolved through
   * the owning session (`session.student_id`): the statement selects
   * `home_work` rows whose session belongs to the student, expressed as
   * an `EXISTS` semi-join over `session` (with `session_id` UNIQUE on
   * `home_work`, the semi-join selects exactly the rows an INNER JOIN
   * would — the same fused shape the session repository's certification
   * re-assertion uses).
   *
   * NO grade predicate: the newest row is returned whatever its grade
   * state, so gradeability is decided by the caller's one-shot guarded
   * UPDATE (`gradeHomeWorkOnce`), never by this read. A newest row that
   * is already graded yields the guarded UPDATE's zero-row miss for the
   * caller to classify as the write-once conflict; a `null` here means
   * the student has NO homework rows at all — a genuine first session,
   * nothing to grade. Newest first by the homework's own creation stamp
   * (`created_at DESC`) with `id DESC` as the deterministic tiebreak for
   * rows authored in the same instant — the house newest-first convention
   * of the session participant lists, applied to the queried table; the
   * choice is pinned here so future readers do not re-litigate
   * session-stamp vs homework-stamp ordering.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle select;
   * standalone it runs as raw parameterized SQL via `queryDb` (the
   * student id rides a bound parameter).
   *
   * @returns The newest row of any grade state, or `null` when the
   *          student has no homework rows (a true first session).
   */
  export async function findLatestByStudentId(
    studentId: number,
    tx?: DBTransaction
  ): Promise<HomeWorkSelectType | null> {
    if (tx) {
      const rows = await tx
        .select()
        .from(homeWork)
        .where(
          sql`EXISTS (SELECT 1 FROM ${session} WHERE ${eq(session.id, homeWork.sessionId)} AND ${eq(session.studentId, studentId)})`
        )
        .orderBy(desc(homeWork.createdAt), desc(homeWork.id))
        .limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<HomeWorkSelectType>(
      `SELECT id, session_id AS "sessionId",
              current_from_ayah AS "currentFromAyah", current_to_ayah AS "currentToAyah",
              current_grade AS "currentGrade", current_surah_juz AS "currentSurahJuz",
              revision_from_ayah AS "revisionFromAyah", revision_to_ayah AS "revisionToAyah",
              revision_grade AS "revisionGrade", revision_surah_juz AS "revisionSurahJuz",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM home_work
       WHERE EXISTS (SELECT 1 FROM session s WHERE s.id = home_work.session_id AND s.student_id = $1)
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [studentId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Grades a homework row EXACTLY once: a single guarded UPDATE whose
   * predicate requires the row identity AND both grade columns still NULL,
   * writing both grades and the audit stamp from the statement's own
   * `now()` reading. The predicate and the mutation are one statement — a
   * concurrent grading of the same row serializes behind the row lock and
   * matches zero rows.
   *
   * @returns The updated row, or `null` when zero rows matched (unknown id
   *          or the row is already graded on either track — the caller
   *          classifies; no exception is raised here).
   */
  export async function gradeHomeWorkOnce(
    id: number,
    grades: HomeWorkGradeFieldsInput,
    tx?: DBTransaction
  ): Promise<HomeWorkSelectType | null> {
    const executor = tx ?? db;
    const rows = await executor
      .update(homeWork)
      .set({ currentGrade: grades.currentGrade, revisionGrade: grades.revisionGrade, updatedAt: sql`now()` })
      .where(and(eq(homeWork.id, id), isNull(homeWork.currentGrade), isNull(homeWork.revisionGrade)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Lists the student's homework assignments, newest-session-first, paged.
   * Consumes the shared module-scope JOIN-condition builder together with
   * `countForStudent`, so the page window and the honest total describe
   * the same filtered set.
   *
   * The INNER JOIN is used for tenancy scoping and ordering only — no
   * session column is projected onto the returned row. The homework row's
   * own columns (the Jadid `current_*` block, the Madi `revision_*` block,
   * plus the identity and audit fields) are the complete projection; the
   * service layer maps them into the parent-facing read shape (splitting
   * the two track blocks, preserving per-field nullability — never
   * fabricating zeros for absent grades or surah/juz references).
   *
   * Ordering is `session.started_at DESC NULLS LAST, home_work.id DESC`:
   * the NULLS LAST clause pins sessions that have not started yet
   * (scheduled, no `started_at`) after live sessions in the newest-first
   * scan, and the `home_work.id DESC` tiebreak keeps same-instant rows
   * deterministic across pages so consecutive pages never duplicate or
   * drop a row. This is the same session-stamp-first discipline the
   * report pair uses, keeping the parent portal's report and homework
   * windows in lockstep chronological order.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle select
   * with an explicit column projection (no `SELECT *`); standalone it
   * runs as raw parameterized SQL via `queryDb` (the student id, limit,
   * and offset each ride a bound parameter).
   *
   * @returns The raw homework rows (NOT the parent projection — the
   *          service layer maps). An offset past the end of the filtered
   *          set yields an empty array (the count companion still reports
   *          the true total).
   */
  export async function listForStudent(
    studentId: number,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<HomeWorkSelectType[]> {
    if (tx) {
      return tx
        .select({
          id: homeWork.id,
          sessionId: homeWork.sessionId,
          currentFromAyah: homeWork.currentFromAyah,
          currentToAyah: homeWork.currentToAyah,
          currentGrade: homeWork.currentGrade,
          currentSurahJuz: homeWork.currentSurahJuz,
          revisionFromAyah: homeWork.revisionFromAyah,
          revisionToAyah: homeWork.revisionToAyah,
          revisionGrade: homeWork.revisionGrade,
          revisionSurahJuz: homeWork.revisionSurahJuz,
          createdAt: homeWork.createdAt,
          updatedAt: homeWork.updatedAt,
        })
        .from(homeWork)
        .innerJoin(session, buildParentScopedHomeWorkJoinCondition(studentId))
        .orderBy(sql`${session.startedAt} DESC NULLS LAST`, desc(homeWork.id))
        .limit(limit)
        .offset(offset);
    }
    const result = await queryDb<HomeWorkSelectType>(
      `SELECT id, session_id AS "sessionId",
              current_from_ayah AS "currentFromAyah", current_to_ayah AS "currentToAyah",
              current_grade AS "currentGrade", current_surah_juz AS "currentSurahJuz",
              revision_from_ayah AS "revisionFromAyah", revision_to_ayah AS "revisionToAyah",
              revision_grade AS "revisionGrade", revision_surah_juz AS "revisionSurahJuz",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM home_work hw
       INNER JOIN session s ON s.id = hw.session_id AND s.student_id = $1
       ORDER BY s.started_at DESC NULLS LAST, hw.id DESC
       LIMIT $2 OFFSET $3`,
      [studentId, limit, offset]
    );
    return result.rows;
  }

  /**
   * Counts the student's homework assignments under the SAME JOIN-condition
   * as `listForStudent` (one shared predicate builder) — the honest total
   * for the paginated read. The INNER JOIN is identical to the list's
   * (same ON clause, same tenancy equality) so the count describes the
   * exact filtered set the page windows over; the join cannot fan out
   * because `home_work.session_id` is UNIQUE.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle count
   * select; standalone it runs as raw parameterized SQL via `queryDb`
   * (the count returns as a string from the driver and is coerced to a
   * number here).
   *
   * @returns The total number of homework rows whose owning session
   *          belongs to the student (zero when the student has no
   *          homework-bearing sessions).
   */
  export async function countForStudent(studentId: number, tx?: DBTransaction): Promise<number> {
    if (tx) {
      const rows = await tx
        .select({ value: count() })
        .from(homeWork)
        .innerJoin(session, buildParentScopedHomeWorkJoinCondition(studentId));
      return rows[0]?.value ?? 0;
    }
    const result = await queryDb<{ value: string }>(
      `SELECT count(*) AS "value"
       FROM home_work hw
       INNER JOIN session s ON s.id = hw.session_id AND s.student_id = $1`,
      [studentId]
    );
    return Number(result.rows[0]?.value ?? 0);
  }
}
