/**
 * ReportRepository tests — the `reports` table's data-access layer
 * (`insertReport`, `findBySessionId`) against the live test database.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Rollback-isolated tests run inside `runInRollback`; `tx` is passed to
 *    EVERY repo call, entity-setup helper, and direct Drizzle query (on
 *    every method under test `tx` is the LAST parameter).
 *  - Entities are created ONLY via `entity-setup.ts` helpers plus the
 *    file-local actor helper — never seed data.
 *  - No `expect(...).rejects.toThrow()` — constraint probes go through
 *    `expectRepoError` inside an explicit SAVEPOINT bracket so the outer
 *    transaction stays queryable.
 *  - A separate committed-fixture group covers the STANDALONE executor
 *    branches (`queryDb` read + the `tx ?? db` write fallback). Those
 *    branches by definition run without a transaction, so their fixtures
 *    must be committed (an uncommitted row is invisible outside the tx);
 *    they are registered and hard-deleted in `afterAll` (rule 9), keeping
 *    the repo/ directory's 100%-coverage mandate (rule 14) honest.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): happy insert + the exact RETURNING shape;
 *    `findBySessionId` hit and miss (null); nullable/exact column mapping.
 *  - Tier 2 (boundary): maximal notes length (2000 chars, the service
 *    bound) stored verbatim; rating 0 and 5 accepted raw (the
 *    `reports_student_rating_by_teacher_check` backstop holds).
 *  - Tier 3 (chaos): unique-race — a second insert for the same session
 *    raises the RAW `23505` violation naming `reports_session_id_unique`;
 *    the repository does NOT translate it (mapping to a domain conflict is
 *    the service's job).
 *  - Tier 4 (security): notes containing SQL metacharacters/quotes
 *    round-trip byte-identical (parameterization proof); static source
 *    pins — bound parameters only, no `SELECT *`, no SQL line-comment
 *    sequences, no prepared statements, `tx` last everywhere, no console /
 *    logger / i18n, one namespace, no plan-artifact references.
 *  - tx propagation: an insert made with the explicit `tx` inside
 *    `runInRollback` is absent afterwards, observed via a fresh executor
 *    read against the table.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { ReportRepository } from "@/backend/db/repo";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { students } from "@/backend/db/schema/students/students";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestSession,
  createTestStudent,
  createTestTeacherRow,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { constraintNameOf, expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import type { DBTransaction } from "@/backend/types";

/** PostgreSQL error code for `unique_violation`. */
const PG_UNIQUE_VIOLATION = "23505";

/** The `reports` select-shape keys (TS property names), locale-sorted. */
const REPORT_ROW_KEYS = [
  "createdAt",
  "id",
  "sessionId",
  "studentRatingByTeacher",
  "teacherNotes",
  "updatedAt",
] as const;

/** Shared-PK ids for one booking pair (session.teacher_id / session.student_id). */
interface SessionActors {
  teacherUserId: number;
  studentUserId: number;
}

/** Creates one certified teacher + one student pair with shared-PK rows. */
async function createSessionActors(tx: DBTransaction): Promise<SessionActors> {
  const teacherUser = await createTestUser(tx, { role: "teacher" });
  await createTestTeacherRow(tx, teacherUser.id);
  const studentUser = await createTestUser(tx, { role: "student" });
  await createTestStudent(tx, studentUser.id);
  return { teacherUserId: teacherUser.id, studentUserId: studentUser.id };
}

/** Creates a completed session for the actor pair (reports hang off completed sessions). */
async function createCompletedSession(tx: DBTransaction, actors: SessionActors) {
  return createTestSession(tx, actors.teacherUserId, actors.studentUserId, {
    status: SessionStatus.Completed,
    startedAt: new Date(),
    endedAt: new Date(),
    confirmedByTeacherAt: new Date(),
  });
}

/**
 * Walks the Drizzle `DrizzleQueryError.cause` chain to find whether the
 * original PostgreSQL error carries the given SQLSTATE code — Drizzle wraps
 * driver errors behind its own generic "failed query" message.
 */
function hasPostgresErrorCode(error: unknown, pgCode: string): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === pgCode) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

describe("ReportRepository — transactional paths (runInRollback)", () => {
  // ─── Tier 1: branch/statement ───────────────────────────────────────

  test("insertReport returns the inserted row with every server-generated column populated", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);

      const inserted = await ReportRepository.insertReport(
        { sessionId: sessionRow.id, teacherNotes: "Solid recitation, keep the pace.", studentRatingByTeacher: 4 },
        tx
      );

      expect(inserted.id).toBeGreaterThan(0);
      expect(inserted.sessionId).toBe(sessionRow.id);
      expect(inserted.teacherNotes).toBe("Solid recitation, keep the pace.");
      expect(inserted.studentRatingByTeacher).toBe(4);
      expect(inserted.createdAt).not.toBeNull();
      expect(inserted.updatedAt).not.toBeNull();
      // RETURNING mirrors the $inferSelect shape 1:1 — exactly the six
      // table columns, nothing added, nothing dropped.
      expect(Object.keys(inserted).toSorted((a, b) => a.localeCompare(b))).toEqual([...REPORT_ROW_KEYS]);
    });
  });

  test("insertReport lets schema defaults fill the nullable columns a caller omits", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);

      const inserted = await ReportRepository.insertReport({ sessionId: sessionRow.id }, tx);

      expect(inserted.sessionId).toBe(sessionRow.id);
      expect(inserted.teacherNotes).toBeNull();
      expect(inserted.studentRatingByTeacher).toBeNull();
      expect(inserted.createdAt).not.toBeNull();
      expect(inserted.updatedAt).not.toBeNull();
    });
  });

  test("findBySessionId returns the report row for a session that carries one", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);
      const inserted = await ReportRepository.insertReport(
        { sessionId: sessionRow.id, teacherNotes: "mapped notes", studentRatingByTeacher: 5 },
        tx
      );

      const found = await ReportRepository.findBySessionId(sessionRow.id, tx);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(inserted.id);
      expect(found?.sessionId).toBe(sessionRow.id);
      expect(found?.teacherNotes).toBe("mapped notes");
      expect(found?.studentRatingByTeacher).toBe(5);
      expect(found?.createdAt).not.toBeNull();
      expect(found?.updatedAt).not.toBeNull();
      expect(Object.keys(found ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([...REPORT_ROW_KEYS]);
    });
  });

  test("findBySessionId returns null for a session without a report", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);

      const found = await ReportRepository.findBySessionId(sessionRow.id, tx);

      expect(found).toBeNull();
    });
  });

  // ─── Tier 2: boundary ────────────────────────────────────────────────

  test("insertReport stores a maximal 2000-char notes payload verbatim", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);
      const maximalNotes = "n".repeat(2000);

      const inserted = await ReportRepository.insertReport(
        { sessionId: sessionRow.id, teacherNotes: maximalNotes, studentRatingByTeacher: 3 },
        tx
      );

      expect(inserted.teacherNotes).toHaveLength(2000);
      expect(inserted.teacherNotes).toBe(maximalNotes);
    });
  });

  test("insertReport accepts rating boundaries 0 and 5 (the CHECK backstop holds)", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const first = await createCompletedSession(tx, actors);
      const second = await createCompletedSession(tx, actors);

      const zero = await ReportRepository.insertReport(
        { sessionId: first.id, teacherNotes: null, studentRatingByTeacher: 0 },
        tx
      );
      const five = await ReportRepository.insertReport(
        { sessionId: second.id, teacherNotes: null, studentRatingByTeacher: 5 },
        tx
      );

      expect(zero.studentRatingByTeacher).toBe(0);
      expect(five.studentRatingByTeacher).toBe(5);
    });
  });

  // ─── Tier 3: chaos — the unique arbiter fires untranslated ──────────

  test("a second insert for the same session raises the RAW 23505 on reports_session_id_unique (repo does not translate)", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);
      const first = await ReportRepository.insertReport(
        { sessionId: sessionRow.id, teacherNotes: "first submission", studentRatingByTeacher: 5 },
        tx
      );
      expect(first.id).toBeGreaterThan(0);

      await tx.execute(sql`savepoint report_unique_probe`);
      const duplicateError = await expectRepoError(() =>
        ReportRepository.insertReport(
          { sessionId: sessionRow.id, teacherNotes: "racing duplicate", studentRatingByTeacher: 4 },
          tx
        )
      );
      await tx.execute(sql`rollback to savepoint report_unique_probe`);

      expect(hasPostgresErrorCode(duplicateError, PG_UNIQUE_VIOLATION)).toBe(true);
      expect(constraintNameOf(duplicateError)).toBe("reports_session_id_unique");
      // The repository surfaces the raw driver error untouched — no domain
      // error class, no translated message (the service layer owns both).
      expect(duplicateError.constructor.name).not.toBe("ConflictError");
      expect(duplicateError.constructor.name).not.toBe("DomainError");
      expect(constraintNameOf(duplicateError)).not.toBe("");

      // The savepoint bracket kept the transaction queryable and the
      // winner's row intact.
      const winner = await ReportRepository.findBySessionId(sessionRow.id, tx);
      expect(winner?.id).toBe(first.id);
      expect(winner?.teacherNotes).toBe("first submission");
    });
  });

  // ─── Tier 4: security — parameterization proof ──────────────────────

  test("notes with SQL metacharacters, quotes, and newlines round-trip byte-identical", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);
      const hostileNotes = [
        "Robert'); DROP TABLE reports;--",
        'quote \' and "double" and `backtick`',
        "backslash \\\\ and %like% and _underscore_",
        "unicode 🕌 + \u202Ertl\u202C",
        "line\nbreak\ttab",
      ].join("\n");

      const inserted = await ReportRepository.insertReport(
        { sessionId: sessionRow.id, teacherNotes: hostileNotes, studentRatingByTeacher: 2 },
        tx
      );
      const found = await ReportRepository.findBySessionId(sessionRow.id, tx);

      expect(inserted.teacherNotes).toBe(hostileNotes);
      expect(found?.teacherNotes).toBe(hostileNotes);
      // The reports table is intact — nothing executed out of the payload.
      const intact = await ReportRepository.findBySessionId(sessionRow.id, tx);
      expect(intact).not.toBeNull();
    });
  });

  // ─── tx propagation ─────────────────────────────────────────────────

  test("an insert made with the explicit tx inside runInRollback rolls back with the block", async () => {
    let rolledBackSessionId = 0;
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const sessionRow = await createCompletedSession(tx, actors);
      const inserted = await ReportRepository.insertReport(
        { sessionId: sessionRow.id, teacherNotes: "doomed", studentRatingByTeacher: 1 },
        tx
      );
      rolledBackSessionId = inserted.sessionId;
      expect(inserted.id).toBeGreaterThan(0);
    });

    // Fresh executor read — the forced rollback removed the row.
    const absent = await db.select().from(reports).where(eq(reports.sessionId, rolledBackSessionId)).limit(1);
    expect(absent).toHaveLength(0);
  });

  // ─── Static source pins (Tier 4) ────────────────────────────────────

  const repoSource = readFileSync(join(import.meta.dir, "../../../repo/classes/report.repository.ts"), "utf8");

  test("source: executor discipline — one pool-fallback write, one queryDb read, tx last on every signature", () => {
    expect(repoSource.match(/const executor = tx \?\? db;/g) ?? []).toHaveLength(1);
    expect(repoSource.match(/queryDb</g) ?? []).toHaveLength(1);
    const signatures = repoSource.match(/export async function [a-zA-Z]+\([^)]*\)/g) ?? [];
    expect(signatures).toHaveLength(2);
    for (const signature of signatures) {
      const flattened = signature.replace(/\s+/g, " ").replace(/ \)/g, ")").trim();
      expect(flattened.endsWith("tx?: DBTransaction)") || flattened.endsWith("tx?: DBQueryExecutor)")).toBe(true);
    }
  });

  test("source: bound parameters only, no wildcard select, no prepared statements, no SQL line comments", () => {
    expect(repoSource.includes("session_id = $1")).toBe(true);
    expect(repoSource.includes("SELECT *")).toBe(false);
    expect(repoSource.includes(".prepare(")).toBe(false);
    expect(repoSource.includes("sql.placeholder")).toBe(false);
    expect(repoSource.includes("inArray")).toBe(false);
    expect(repoSource.includes("sql.raw")).toBe(false);
    expect(repoSource.includes("--")).toBe(false);
  });

  test("source: no i18n, no logger, no console, one namespace, no plan-artifact references", () => {
    expect(repoSource.includes("getServerTranslations")).toBe(false);
    expect(repoSource.includes("logger")).toBe(false);
    expect(repoSource.includes("console.")).toBe(false);
    expect(repoSource.includes("export namespace ReportRepository")).toBe(true);
    expect(/REQ-\d|DEV3|Phase \d|Task \d|plan\.md|tasks\.md|specs\.md/.test(repoSource)).toBe(false);
  });
});

/**
 * Standalone executor branches — the queryDb read path and the `tx ?? db`
 * write fallback. These branches run WITHOUT a transaction by definition,
 * so their fixtures must be COMMITTED (an uncommitted row is invisible to
 * the pool path). They are registered here and hard-deleted in `afterAll`
 * (rule 9) in FK-dependency order (sessions first — the teacher/student
 * FKs are restrict-bound while sessions reference them; reports cascade
 * with their session).
 */
describe("ReportRepository — standalone executor paths (committed fixtures)", () => {
  const committedSessionIds: number[] = [];
  const committedUserIds: number[] = [];
  let reportSessionId = 0;
  let emptySessionId = 0;

  afterAll(async () => {
    await Promise.all(committedSessionIds.map(id => db.delete(session).where(eq(session.id, id))));
    committedSessionIds.length = 0;
    await Promise.all(
      committedUserIds.map(async userId => {
        await db.delete(teacher).where(eq(teacher.id, userId));
        await db.delete(students).where(eq(students.id, userId));
        await db.delete(users).where(eq(users.id, userId));
      })
    );
    committedUserIds.length = 0;
  });

  test("insertReport runs on the pool fallback and returns the inserted row", async () => {
    const committed = await db.transaction(async tx => {
      const actors = await createSessionActors(tx);
      committedUserIds.push(actors.teacherUserId, actors.studentUserId);
      const reportTarget = await createCompletedSession(tx, actors);
      const emptyTarget = await createCompletedSession(tx, actors);
      committedSessionIds.push(reportTarget.id, emptyTarget.id);
      reportSessionId = reportTarget.id;
      emptySessionId = emptyTarget.id;
      return reportTarget;
    });

    const inserted = await ReportRepository.insertReport({
      sessionId: committed.id,
      teacherNotes: "pool-fallback notes",
      studentRatingByTeacher: 5,
    });

    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.sessionId).toBe(committed.id);
    expect(inserted.teacherNotes).toBe("pool-fallback notes");
  });

  test("findBySessionId runs standalone via the queryDb read path (hit and miss)", async () => {
    const found = await ReportRepository.findBySessionId(reportSessionId);
    expect(found).not.toBeNull();
    expect(found?.sessionId).toBe(reportSessionId);
    expect(found?.teacherNotes).toBe("pool-fallback notes");
    expect(Object.keys(found ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([...REPORT_ROW_KEYS]);

    const miss = await ReportRepository.findBySessionId(emptySessionId);
    expect(miss).toBeNull();
  });
});
