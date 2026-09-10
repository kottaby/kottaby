/**
 * SessionRepository wave-context read — the ONE joined read of the
 * session-request notification wave context, extracted VERBATIM from
 * `session.repository.helpers.ts` (behavior-identical max-lines extraction;
 * zero logic change). The public surface stays the `SessionRepository`
 * namespace in `session.repository.ts`: this module backs the namespace's
 * `findWaveContextById` method as a one-to-one delegation target. Nothing
 * in this module is part of the public API.
 *
 * Conventions carried over unchanged (per `backend/db/repo/AGENTS.md`):
 *  - every function takes `tx?: DBTransaction` as its LAST parameter. Reads
 *    run on the caller's transaction when supplied and fall back to raw
 *    parameterized SQL via `queryDb` (the Neon-HTTP-eligible pattern)
 *    otherwise;
 *  - NO prepared statements, NO array-membership operators, NO SQL
 *    line-comment sequences in any statement;
 *  - no business logic, no permission checks, no i18n or logging — the
 *    caller decides what `null` means.
 */

import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { queryDb } from "@/backend/db";
import { session } from "@/backend/db/schema/classes/session";
import { users } from "@/backend/db/schema/users/users";
import type { DBTransaction, SessionWaveContextRow } from "@/backend/types";

/** Aliased `users` handles for the two-participant joined wave-context read. */
const waveStudentUser = alias(users, "wave_student_user");
const waveTeacherUser = alias(users, "wave_teacher_user");

/**
 * ONE joined read of the session-request wave context: the session's `id`
 * + raw `intent` (STILL untrusted storage — validating it is the service
 * layer's job), the row's `updated_at` audit stamp (the occurrence
 * discriminator the recurring governance waves fold into their emit-claim
 * keys), together with BOTH participants' `userId`/`fullName`/
 * `locale` — exactly the fields the session-request notification emitters
 * need, and nothing else. Both participants resolve through INNER JOINs:
 * `student_id`/`teacher_id` are NOT NULL FKs sharing the `users.id` PK, so
 * a session row always joins exactly one student user and one teacher
 * user; a miss on the `session` side yields no row and maps to `null`.
 */
export async function findWaveContextById(id: number, tx?: DBTransaction): Promise<SessionWaveContextRow | null> {
  if (tx) {
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
        sessionUpdatedAt: session.updatedAt,
      })
      .from(session)
      .innerJoin(waveStudentUser, eq(waveStudentUser.id, session.studentId))
      .innerJoin(waveTeacherUser, eq(waveTeacherUser.id, session.teacherId))
      .where(eq(session.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
  const result = await queryDb<SessionWaveContextRow>(
    `SELECT s.id AS "sessionId", s.intent AS "intent",
            su.id AS "studentUserId", su.full_name AS "studentFullName", su.locale AS "studentLocale",
            tu.id AS "teacherUserId", tu.full_name AS "teacherFullName", tu.locale AS "teacherLocale",
            s.updated_at AS "sessionUpdatedAt"
     FROM session s
     JOIN users su ON su.id = s.student_id
     JOIN users tu ON tu.id = s.teacher_id
     WHERE s.id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}
