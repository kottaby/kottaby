/**
 * EvaluationRepository tests — the `evaluations` table's data-access layer
 * (`insertOnce`, `listByEvaluator`) against the live test database.
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
 *    branches (the `queryDb` read and the raw pool executor that falls
 *    through to it). Those branches by definition run without a
 *    transaction, so their fixtures must be committed (an uncommitted row
 *    is invisible outside the tx); they are registered and hard-deleted in
 *    `afterAll` (rule 9), keeping the repo/ directory's 100%-coverage
 *    mandate (rule 14) honest.
 *  - The concurrency tier commits its fixtures too (two independent
 *    transactions racing for the same unique key cannot live inside one
 *    rolled-back tx); those fixtures are registered and hard-deleted in
 *    `afterAll` as well.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): happy insert returns the exact RETURNING shape
 *    and persists the four supplied columns; the list hit returns the
 *    evaluator's rows, the miss returns an empty list (never null); the
 *    standalone `queryDb` read and the raw-pool executor fall-through run
 *    the same live-row filter.
 *  - Tier 2 (boundary): nullable `session_id` (the applicant-evaluation
 *    shape) stores null and two NULL-session rows from the same evaluator
 *    coexist (PostgreSQL treats NULLs as distinct — the unique arbiter
 *    never fires); the `is_deleted` tri-state (false / null / true) —
 *    only an explicit deleted flag excludes a row, and another evaluator's
 *    row never leaks; score boundaries 0 and 100 are accepted raw (the
 *    table CHECK is the backstop); newest-first ordering with the id DESC
 *    tiebreak between rows created in the same instant.
 *  - Tier 3 (chaos): a duplicate insert inside one transaction raises the
 *    RAW `23505` unique violation naming
 *    `evaluations_session_evaluator_unique` (the repository does NOT
 *    translate it — mapping into a domain conflict is the service's job);
 *    two independent transactions racing `insertOnce` for the same
 *    (session, evaluator) pair under `Promise.allSettled` produce exactly
 *    one winner and one loser (raw 23505), and the loser's transaction
 *    inserts zero rows.
 *  - Tier 4 (security/static): enormous and absurd ids — an enormous or
 *    negative evaluator id lists empty, a nonexistent rated subject is
 *    rejected by the FK (raw `23503`, no translation); static source pins —
 *    bound parameters only, no wildcard select, no prepared statements, no
 *    SQL line-comment sequences, a REQUIRED (non-optional) tx on the
 *    write, no global-handle fallback, caller-scoped read (no rated-subject
 *    filter parameter), no i18n/logger/console, one namespace, no
 *    plan-artifact references.
 *  - tx propagation: an insert made with the explicit `tx` inside
 *    `runInRollback` is absent afterwards, observed via a fresh executor
 *    read against the table.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/backend/db";
import { EvaluationRepository } from "@/backend/db/repo";
import { session } from "@/backend/db/schema/classes/session";
import { students } from "@/backend/db/schema/students/students";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestEvaluation,
  createTestSession,
  createTestStudent,
  createTestTeacherRow,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { constraintNameOf, expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import type { DBTransaction, EvaluationSelectType } from "@/backend/types";
import { isPgliteProvider } from "@/test/helpers/skip-when-pglite";

/** PostgreSQL error code for `unique_violation`. */
const PG_UNIQUE_VIOLATION = "23505";

/** PostgreSQL error code for `foreign_key_violation`. */
const PG_FOREIGN_KEY_VIOLATION = "23503";

/** The `evaluations` select-shape keys (TS property names), locale-sorted. */
const EVALUATION_ROW_KEYS = [
  "createdAt",
  "deletedAt",
  "evaluatedId",
  "evaluatorId",
  "id",
  "isDeleted",
  "notes",
  "score",
  "sessionId",
  "updatedAt",
] as const;

/** Shared-PK ids for one rating cast (evaluated subject, rater, session). */
interface RatingCast {
  evaluatedId: number;
  evaluatorId: number;
  sessionId: number;
}

/** Creates one rated subject (teacher) + one rater (student) pair with shared-PK rows. */
async function createRatingCast(tx: DBTransaction): Promise<Omit<RatingCast, "sessionId">> {
  const teacherUser = await createTestUser(tx, { role: "teacher" });
  await createTestTeacherRow(tx, teacherUser.id);
  const studentUser = await createTestUser(tx, { role: "student" });
  await createTestStudent(tx, studentUser.id);
  return { evaluatedId: teacherUser.id, evaluatorId: studentUser.id };
}

/** Creates a completed, dual-confirmed session for the cast (ratings hang off those). */
async function createConfirmedSession(tx: DBTransaction, cast: Omit<RatingCast, "sessionId">) {
  return createTestSession(tx, cast.evaluatedId, cast.evaluatorId, {
    status: SessionStatus.Completed,
    startedAt: new Date(),
    endedAt: new Date(),
    confirmedByTeacherAt: new Date(),
    confirmedByStudentAt: new Date(),
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

/** Reads one evaluation row straight off the table (read-back oracle). */
async function readEvaluationRow(tx: DBTransaction, id: number): Promise<EvaluationSelectType> {
  const [row] = await tx.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
  if (!row) {
    throw new Error("readEvaluationRow: expected the evaluation row to exist");
  }
  return row;
}

/**
 * Committed fixtures (standalone executor + concurrency tiers) — every id
 * registered here is hard-deleted in `afterAll` in FK-dependency order:
 * evaluations first, then sessions (the session FK is SET NULL but the
 * participants' FKs are restrict-bound), then the role-child rows, then
 * the users.
 */
const committedEvaluationIds: number[] = [];
const committedSessionIds: number[] = [];
const committedUserIds: number[] = [];

/** Commits one rating cast (subject, rater, dual-confirmed session) outside any rollback tx. */
async function createCommittedCast(): Promise<RatingCast> {
  return db.transaction(async tx => {
    const cast = await createRatingCast(tx);
    const ratedSession = await createConfirmedSession(tx, cast);
    committedUserIds.push(cast.evaluatedId, cast.evaluatorId);
    committedSessionIds.push(ratedSession.id);
    return { ...cast, sessionId: ratedSession.id };
  });
}

afterAll(async () => {
  await Promise.all(committedEvaluationIds.map(id => db.delete(evaluations).where(eq(evaluations.id, id))));
  committedEvaluationIds.length = 0;
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

describe("EvaluationRepository — transactional paths (runInRollback)", () => {
  // ─── Tier 1: branch/statement ───────────────────────────────────────

  test("insertOnce returns the inserted row with every server-generated column populated", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);
      const ratedSession = await createConfirmedSession(tx, cast);

      const inserted = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: ratedSession.id, score: 80 },
        tx
      );

      expect(inserted.id).toBeGreaterThan(0);
      expect(inserted.evaluatedId).toBe(cast.evaluatedId);
      expect(inserted.evaluatorId).toBe(cast.evaluatorId);
      expect(inserted.sessionId).toBe(ratedSession.id);
      expect(inserted.score).toBe(80);
      // Schema defaults filled the rest of the row.
      expect(inserted.isDeleted).toBe(false);
      expect(inserted.deletedAt).toBeNull();
      expect(inserted.notes).toBeNull();
      expect(inserted.createdAt).not.toBeNull();
      expect(inserted.updatedAt).not.toBeNull();
      // RETURNING mirrors the $inferSelect shape 1:1 — exactly the ten
      // table columns, nothing added, nothing dropped.
      expect(Object.keys(inserted).toSorted((a, b) => a.localeCompare(b))).toEqual([...EVALUATION_ROW_KEYS]);
    });
  });

  test("listByEvaluator returns the evaluator's own rows on the caller's transaction", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);
      const ratedSession = await createConfirmedSession(tx, cast);
      const first = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: ratedSession.id, score: 80 },
        tx
      );

      const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId, tx);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(first.id);
      expect(rows[0]?.sessionId).toBe(ratedSession.id);
      expect(Object.keys(rows[0] ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([...EVALUATION_ROW_KEYS]);
    });
  });

  test("listByEvaluator returns an empty list (never null) for an evaluator with no rows", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);

      const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId, tx);

      expect(rows).toEqual([]);
    });
  });

  // ─── Tier 2: boundary / tri-state ───────────────────────────────────

  test("a NULL session_id stores null and two NULL-session rows from the same evaluator coexist", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);

      const applicant = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: null, score: 90 },
        tx
      );
      const secondApplicant = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: null, score: 70 },
        tx
      );

      // PostgreSQL unique semantics treat NULLs as distinct: the second
      // NULL-session insert for the SAME evaluator never collides.
      expect(secondApplicant.id).not.toBe(applicant.id);
      const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId, tx);
      expect(rows.map(row => row.sessionId)).toEqual([null, null]);
      expect(rows.map(row => row.score).toSorted((a, b) => (a ?? 0) - (b ?? 0))).toEqual([70, 90]);
    });
  });

  test("only an explicit deleted flag excludes a row; another evaluator's row never leaks", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);
      const otherStudent = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, otherStudent.id);
      const live = await createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, {
        isDeleted: false,
        score: 60,
      });
      const nullFlag = await createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, {
        isDeleted: null,
        score: 70,
      });
      const softDeleted = await createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, {
        isDeleted: true,
        deletedAt: new Date(),
        score: 80,
      });
      const foreign = await createTestEvaluation(tx, cast.evaluatedId, otherStudent.id, null, { score: 90 });

      const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId, tx);

      // The explicit soft-delete is excluded; the NULL flag is live; the
      // other evaluator's row is outside the caller's scope.
      expect(rows.map(row => row.id)).toEqual([nullFlag.id, live.id]);
      expect(rows.map(row => row.isDeleted)).toEqual([null, false]);
      const listedIds = new Set(rows.map(row => row.id));
      expect(listedIds.has(softDeleted.id)).toBe(false);
      expect(listedIds.has(foreign.id)).toBe(false);
    });
  });

  test("score boundaries 0 and 100 are accepted raw (the table CHECK is the backstop)", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);

      const floor = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: null, score: 0 },
        tx
      );
      const ceiling = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: null, score: 100 },
        tx
      );

      expect(floor.score).toBe(0);
      expect(ceiling.score).toBe(100);
      expect((await readEvaluationRow(tx, floor.id)).score).toBe(0);
      expect((await readEvaluationRow(tx, ceiling.id)).score).toBe(100);
    });
  });

  test("orders newest first with the id DESC tiebreak between rows created in the same instant", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);
      const earlier = new Date(1_700_000_000_000);
      const instant = new Date(1_700_000_060_000);
      // Insert order A, B, C: A and B share the later instant (A gets the
      // LOWER id), C carries the earlier instant.
      const a = await createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, { createdAt: instant });
      const b = await createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, { createdAt: instant });
      const c = await createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, { createdAt: earlier });

      const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId, tx);

      expect(rows.map(row => row.id)).toEqual([b.id, a.id, c.id]);
      expect(rows.map(row => row.createdAt)).toEqual([instant, instant, earlier]);
    });
  });

  // ─── Tier 3: chaos — the unique arbiter fires untranslated ──────────

  test("a duplicate (session, evaluator) insert raises the RAW 23505 on evaluations_session_evaluator_unique", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);
      const ratedSession = await createConfirmedSession(tx, cast);
      const first = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: ratedSession.id, score: 80 },
        tx
      );

      await tx.execute(sql`savepoint evaluations_unique_probe`);
      const duplicateError = await expectRepoError(() =>
        EvaluationRepository.insertOnce(
          { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: ratedSession.id, score: 60 },
          tx
        )
      );
      await tx.execute(sql`rollback to savepoint evaluations_unique_probe`);

      expect(hasPostgresErrorCode(duplicateError, PG_UNIQUE_VIOLATION)).toBe(true);
      expect(constraintNameOf(duplicateError)).toBe("evaluations_session_evaluator_unique");
      // The repository surfaces the raw driver error untouched — no domain
      // error class, no translated message (the service layer owns both).
      expect(duplicateError.constructor.name).not.toBe("ConflictError");
      expect(duplicateError.constructor.name).not.toBe("DomainError");
      expect(constraintNameOf(duplicateError)).not.toBe("");

      // The savepoint bracket kept the transaction queryable and the
      // winner's row intact.
      const winner = await readEvaluationRow(tx, first.id);
      expect(winner.score).toBe(80);
      const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId, tx);
      expect(rows.map(row => row.id)).toEqual([first.id]);
    });
  });

  // ─── tx propagation ─────────────────────────────────────────────────

  test("an insert made with the explicit tx inside runInRollback rolls back with the block", async () => {
    let doomedEvaluatorId = 0;
    let doomedSessionId: number | null = 0;
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);
      const ratedSession = await createConfirmedSession(tx, cast);
      const inserted = await EvaluationRepository.insertOnce(
        { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: ratedSession.id, score: 40 },
        tx
      );
      doomedEvaluatorId = inserted.evaluatorId;
      doomedSessionId = inserted.sessionId;
      expect(inserted.id).toBeGreaterThan(0);
    });

    // Fresh executor read — the forced rollback removed the row.
    const absent = await db
      .select()
      .from(evaluations)
      .where(and(eq(evaluations.evaluatorId, doomedEvaluatorId), eq(evaluations.sessionId, doomedSessionId)));
    expect(absent).toHaveLength(0);
  });

  // ─── Tier 4: enormous / absurd ids ──────────────────────────────────

  test("an enormous evaluator id lists empty; an absurd negative id lists empty too", async () => {
    await runInRollback(async tx => {
      // The id column is int4, so the enormous probe stays inside the
      // column's domain — far past any real sequential id, still bindable.
      expect(await EvaluationRepository.listByEvaluator(2_147_483_647, tx)).toEqual([]);
      expect(await EvaluationRepository.listByEvaluator(-1, tx)).toEqual([]);
    });
  });

  test("a nonexistent rated subject is rejected by the FK — the raw 23503 surfaces untranslated", async () => {
    await runInRollback(async tx => {
      const cast = await createRatingCast(tx);
      const [absentUser] = await tx.select({ maxId: sql<number>`coalesce(max(${users.id}), 0)::int` }).from(users);
      const enormousSubjectId = (absentUser?.maxId ?? 0) + 1_000_000;

      const fkError = await expectRepoError(() =>
        EvaluationRepository.insertOnce(
          { evaluatedId: enormousSubjectId, evaluatorId: cast.evaluatorId, sessionId: null, score: 80 },
          tx
        )
      );

      expect(hasPostgresErrorCode(fkError, PG_FOREIGN_KEY_VIOLATION)).toBe(true);
      expect(constraintNameOf(fkError)).not.toBe("");
      // No domain translation: the raw driver error reaches the caller.
      expect(fkError.constructor.name).not.toBe("NotFoundError");
      expect(fkError.constructor.name).not.toBe("ConflictError");
    });
  });
});

describe("EvaluationRepository — concurrency tier (committed fixtures, independent transactions)", () => {
  // Two transactions racing for the same unique key need real PostgreSQL's
  // cross-connection index-entry serialization. PGlite is single-connection
  // WASM and cannot host the race.
  const testOnRealPostgres = isPgliteProvider() ? test.skip : test;

  testOnRealPostgres(
    "two concurrent insertOnce calls for the same (session, evaluator) pair yield exactly one winner",
    async () => {
      const cast = await createCommittedCast();

      const outcomes = await Promise.allSettled([
        db.transaction(tx =>
          EvaluationRepository.insertOnce(
            { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: cast.sessionId, score: 80 },
            tx
          )
        ),
        db.transaction(tx =>
          EvaluationRepository.insertOnce(
            { evaluatedId: cast.evaluatedId, evaluatorId: cast.evaluatorId, sessionId: cast.sessionId, score: 60 },
            tx
          )
        ),
      ]);

      const fulfilled = outcomes.filter(outcome => outcome.status === "fulfilled");
      const rejected = outcomes.filter(outcome => outcome.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The winner's row is the only one for the pair — the loser's
      // transaction inserted zero rows before rolling back.
      const rows = await db
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.evaluatorId, cast.evaluatorId), eq(evaluations.sessionId, cast.sessionId)));
      expect(rows).toHaveLength(1);
      committedEvaluationIds.push(rows[0]?.id ?? 0);

      // The loser received the RAW 23505 naming the write-once arbiter.
      const rejection = rejected[0];
      if (rejection?.status !== "rejected") throw new Error("expected one rejected outcome");
      expect(hasPostgresErrorCode(rejection.reason, PG_UNIQUE_VIOLATION)).toBe(true);
      expect(constraintNameOf(rejection.reason)).toBe("evaluations_session_evaluator_unique");
    }
  );
});

describe("EvaluationRepository — standalone executor paths (committed fixtures)", () => {
  test("listByEvaluator runs standalone via the queryDb read path (live-row filter, newest first)", async () => {
    const cast = await createCommittedCast();
    const earlier = new Date(1_700_000_000_000);
    const later = new Date(1_700_000_060_000);
    // The three fixtures share one evaluator but carry NULL session ids:
    // NULLs are distinct under the unique arbiter, so several rows for the
    // same evaluator can coexist without colliding (the applicant shape).
    const live = await db.transaction(tx =>
      createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, {
        isDeleted: false,
        score: 60,
        createdAt: earlier,
      })
    );
    const nullFlag = await db.transaction(tx =>
      createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, {
        isDeleted: null,
        score: 70,
        createdAt: later,
      })
    );
    const softDeleted = await db.transaction(tx =>
      createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, null, {
        isDeleted: true,
        deletedAt: new Date(),
        score: 80,
        createdAt: new Date(1_700_000_120_000),
      })
    );
    committedEvaluationIds.push(live.id, nullFlag.id, softDeleted.id);

    const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId);

    // The explicit soft-delete is excluded; the NULL flag is live; the
    // order is newest first; the raw-SQL column aliases round-trip the
    // full $inferSelect shape.
    expect(rows.map(row => row.id)).toEqual([nullFlag.id, live.id]);
    expect(rows.map(row => row.isDeleted)).toEqual([null, false]);
    expect(Object.keys(rows[0] ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([...EVALUATION_ROW_KEYS]);

    // Miss on the same standalone path (int4-domain enormous id).
    const miss = await EvaluationRepository.listByEvaluator(2_147_483_647);
    expect(miss).toEqual([]);
  });

  test("listByEvaluator falls through to the queryDb read on a raw pool executor", async () => {
    const cast = await createCommittedCast();
    const live = await db.transaction(tx =>
      createTestEvaluation(tx, cast.evaluatedId, cast.evaluatorId, cast.sessionId, { score: 65 })
    );
    committedEvaluationIds.push(live.id);

    // A checked-out raw pool is a non-transaction executor: the read must
    // fall through to the standalone parameterized-SQL path.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const rows = await EvaluationRepository.listByEvaluator(cast.evaluatorId, pool);
      expect(rows.map(row => row.id)).toEqual([live.id]);
    } finally {
      await pool.end();
    }
  });

  // ─── Static source pins (Tier 4) ────────────────────────────────────

  const repoSource = readFileSync(join(import.meta.dir, "../../../repo/teachers/evaluation.repository.ts"), "utf8");

  test("source: executor discipline — REQUIRED tx write, two-branch read, tx last on every signature", () => {
    expect(repoSource.includes("const executor = tx ?? db;")).toBe(false);
    expect(repoSource.match(/queryDb</g) ?? []).toHaveLength(1);
    // Slice each `export async function` signature out up to its parameter
    // list's closing paren (linear scan — no backtracking-prone regex over
    // the whole source).
    const signatures: string[] = [];
    let start = repoSource.indexOf("export async function ");
    while (start !== -1) {
      const close = repoSource.indexOf(")", start);
      if (close === -1) {
        break;
      }
      signatures.push(repoSource.slice(start, close));
      start = repoSource.indexOf("export async function ", close);
    }
    expect(signatures).toHaveLength(2);
    expect(signatures[0]?.startsWith("export async function insertOnce(")).toBe(true);
    // The write's tx is REQUIRED and is the LAST parameter.
    expect(signatures[0]?.trimEnd().endsWith("tx: DBTransaction")).toBe(true);
    expect(signatures[1]?.startsWith("export async function listByEvaluator(")).toBe(true);
    // The read's executor is OPTIONAL and is the LAST parameter.
    expect(signatures[1]?.trimEnd().endsWith("tx?: DBQueryExecutor")).toBe(true);
  });

  test("source: bound parameters only, no wildcard select, no prepared statements, no SQL line comments", () => {
    expect(repoSource.includes("evaluator_id = $1")).toBe(true);
    expect(repoSource.includes("SELECT *")).toBe(false);
    expect(repoSource.includes(".prepare(")).toBe(false);
    expect(repoSource.includes("sql.placeholder")).toBe(false);
    expect(repoSource.includes("inArray")).toBe(false);
    expect(repoSource.includes("sql.raw")).toBe(false);
    expect(repoSource.includes("${")).toBe(false);
    expect(repoSource.includes("--")).toBe(false);
  });

  test("source: soft-delete exclusion is NULL-safe on both read paths", () => {
    expect(repoSource.includes("or(eq(evaluations.isDeleted, false), isNull(evaluations.isDeleted))")).toBe(true);
    expect(repoSource.includes("coalesce(is_deleted, false) = $2")).toBe(true);
  });

  test("source: caller-scoped read, database-owned arbiter, no i18n/logger/console, one namespace", () => {
    // The ONLY numeric filter parameter is the caller's evaluator id — no
    // rated-subject (evaluatedId) parameter exists to widen the read.
    expect(repoSource.match(/evaluatorId: number/g) ?? []).toHaveLength(1);
    expect(repoSource.includes("evaluatedId: number")).toBe(false);
    // The write-once arbiter is the database's — no SELECT-then-INSERT
    // guard, no error translation in the repository.
    expect(repoSource.includes("evaluations_session_evaluator_unique")).toBe(true);
    expect(repoSource.includes("ConflictError")).toBe(false);
    expect(repoSource.includes("getServerTranslations")).toBe(false);
    expect(repoSource.includes("logger")).toBe(false);
    expect(repoSource.includes("console.")).toBe(false);
    expect(repoSource.includes("export namespace EvaluationRepository")).toBe(true);
    expect(/REQ-\d|DEV3|Phase \d|Task \d|plan\.md|tasks\.md|specs\.md/.test(repoSource)).toBe(false);
  });
});
