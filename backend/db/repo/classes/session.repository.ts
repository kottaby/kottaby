/**
 * SessionRepository — data-access layer for the `session` table.
 *
 * The `session` row holds one meeting between a teacher and a student:
 * `teacher_id` → teacher.id and `student_id` → students.id (both NOT NULL,
 * FK restrict), the nullable `intent` classification, lifecycle `status`
 * (default "scheduled") and the escrow/confirmation timestamps.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - Reads are read-only, single-parameter equality lookups that take an
 *    OPTIONAL `tx` (last param). The transactional branch runs a Drizzle
 *    select on the supplied executor; the non-transactional branch runs ONE
 *    flat parameterized statement through `queryDb` (Neon HTTP fast path,
 *    mirroring `StudentRepository.findById`). No prepared statements (single
 *    parameterized lookup, no reuse win), no `inArray`, no `sql`
 *    placeholders, no LIKE/ILIKE anywhere.
 *  - Zero business rules, zero log strings, zero i18n imports — reads return
 *    `null` on miss; the service layer owns validation, intent guarding and
 *    error mapping.
 */
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { queryDb } from "@/backend/db";
import { session } from "@/backend/db/schema/classes/session";
import { users } from "@/backend/db/schema/users/users";
import type { DBQueryExecutor, DBTransaction, SessionSelectType, SessionWaveContextRow } from "@/backend/types";

/** Type guard — narrows `DBQueryExecutor` to `DBTransaction`. */
function isDBTransaction(tx: DBQueryExecutor): tx is DBTransaction {
  return typeof tx === "object" && "select" in tx;
}

/** Aliased `users` handles for the two-participant joined read. */
const waveStudentUser = alias(users, "wave_student_user");
const waveTeacherUser = alias(users, "wave_teacher_user");

export namespace SessionRepository {
  /**
   * Finds a `session` row by its primary key.
   *
   * Read-only — the full row (`SessionSelectType`), used by callers that
   * need lifecycle or confirmation state beyond the wave-context
   * projection. Accepts an optional transaction so the read can run inside
   * a caller's transaction scope; falls back to one parameterized
   * `queryDb` statement when called standalone.
   *
   * @returns The matching session row, or `null` if no session carries that id.
   */
  export async function findById(sessionId: number, tx?: DBQueryExecutor): Promise<SessionSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      const rows = await tx.select().from(session).where(eq(session.id, sessionId)).limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<SessionSelectType>(
      `SELECT id, teacher_id AS "teacherId", student_id AS "studentId",
              status, session_type AS "sessionType", intent, fee,
              fee_held AS "feeHeld", started_at AS "startedAt", ended_at AS "endedAt",
              confirmed_by_student_at AS "confirmedByStudentAt",
              confirmed_by_teacher_at AS "confirmedByTeacherAt",
              confirmation_deadline AS "confirmationDeadline",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM session WHERE id = $1 LIMIT 1`,
      [sessionId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * ONE joined read of the session-request wave context: the session's
   * `id` + `intent` together with BOTH participants' `userId`, `fullName`
   * and `locale` — exactly the fields the session-request notification
   * emitters need, and nothing else (no email/phone/governance columns).
   *
   * Both participants are read through INNER JOINs: the session's
   * `student_id` and `teacher_id` are NOT NULL foreign keys into role-child
   * rows that share their PK with `users.id`, so a session row always joins
   * exactly one student user and one teacher user. A miss on the LEFT side
   * (`WHERE session.id = $1`) yields no row and maps to `null`; the caller
   * owns not-found handling.
   *
   * Row mapping to `SessionWaveContextRow` is field-by-field on both
   * branches — never a spread of the raw result row. `intent` is returned
   * untrusted (`string | null`); validating it is the service layer's job.
   *
   * @returns The joined wave-context row, or `null` when no session carries
   *          that id.
   */
  export async function findWaveContextById(
    sessionId: number,
    tx?: DBQueryExecutor
  ): Promise<SessionWaveContextRow | null> {
    if (tx && isDBTransaction(tx)) {
      const rows = await tx
        .select({
          sessionId: session.id,
          intent: session.intent,
          studentUserId: waveStudentUser.id,
          studentFullName: waveStudentUser.fullName,
          studentLocale: waveStudentUser.locale,
          teacherUserId: waveTeacherUser.id,
          teacherFullName: waveTeacherUser.fullName,
          teacherLocale: waveTeacherUser.locale,
        })
        .from(session)
        .innerJoin(waveStudentUser, eq(waveStudentUser.id, session.studentId))
        .innerJoin(waveTeacherUser, eq(waveTeacherUser.id, session.teacherId))
        .where(eq(session.id, sessionId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        sessionId: row.sessionId,
        intent: row.intent,
        studentUserId: row.studentUserId,
        studentFullName: row.studentFullName,
        studentLocale: row.studentLocale,
        teacherUserId: row.teacherUserId,
        teacherFullName: row.teacherFullName,
        teacherLocale: row.teacherLocale,
      };
    }
    const result = await queryDb<SessionWaveContextRow>(
      `SELECT s.id AS "sessionId", s.intent AS "intent",
              su.id AS "studentUserId", su.full_name AS "studentFullName", su.locale AS "studentLocale",
              tu.id AS "teacherUserId", tu.full_name AS "teacherFullName", tu.locale AS "teacherLocale"
       FROM session s
       JOIN users su ON su.id = s.student_id
       JOIN users tu ON tu.id = s.teacher_id
       WHERE s.id = $1 LIMIT 1`,
      [sessionId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      sessionId: row.sessionId,
      intent: row.intent,
      studentUserId: row.studentUserId,
      studentFullName: row.studentFullName,
      studentLocale: row.studentLocale,
      teacherUserId: row.teacherUserId,
      teacherFullName: row.teacherFullName,
      teacherLocale: row.teacherLocale,
    };
  }
}
