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
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, queryDb } from "@/backend/db";
import { homeWork } from "@/backend/db/schema/classes/home-work";
import { session } from "@/backend/db/schema/classes/session";
import type {
  DBQueryExecutor,
  DBTransaction,
  HomeWorkGradeFieldsInput,
  HomeWorkInsertType,
  HomeWorkSelectType,
} from "@/backend/types";

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
  export async function findBySessionId(sessionId: number, tx?: DBQueryExecutor): Promise<HomeWorkSelectType | null> {
    if (tx && isDBTransaction(tx)) {
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
  export async function findLatestByStudentId(studentId: number, tx?: DBTransaction): Promise<HomeWorkSelectType | null> {
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
}
