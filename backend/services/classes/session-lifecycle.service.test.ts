/**
 * SessionLifecycleService tests — the booking + lifecycle state machine
 * (`createSession`, `startSession`, `completeSession`, `cancelSession`,
 * `getSessionById`, and the participant list pair) against the live
 * `kottaby_test_db` PostgreSQL instance, on REAL repositories.
 *
 * Per `backend/db/test/AGENTS.md` (the DB-backed service-test rules the
 * sibling suites apply):
 *  - Every transactional case runs inside `runInRollback`; `tx` (or
 *    `outerTx`) is propagated to EVERY service call so the flow executes on
 *    the caller's transaction (the service's documented test path — a
 *    SAVEPOINT on it, released or rolled back per outcome).
 *  - Entities are created ONLY via `entity-setup.ts` helpers plus the
 *    file-local shared-PK helpers — never seed data. The journey-cast
 *    builders under `test/workflows/helpers/` are committed-journey
 *    infrastructure (registry + hard-delete cleanup) and do not fit the
 *    rollback model; the chaos block mirrors the repo-suite committed-
 *    fixture pattern instead (beforeAll commit, afterAll hard delete).
 *  - NO `expect(...).rejects.toThrow()` — every denial goes through
 *    `expectRepoError` (try/catch); typed denials are asserted through the
 *    `DomainError.code` contract plus the exact translated message.
 *
 * Coverage map:
 *  - Tier 1 (branch/statement): every debit-ladder branch (trial hit, hifz
 *    hit, tajweed hit, total miss → `INSUFFICIENT_BALANCE` with zero rows
 *    and a still-reusable key); every probe-classification branch on
 *    start/complete/cancel (unknown id and foreign actor →
 *    `SESSION_NOT_FOUND`, wrong state → `SESSION_INVALID_TRANSITION`,
 *    owned+started completion with a decertified teacher →
 *    `TEACHER_NOT_CERTIFIED`); the replay branch (same key →
 *    `DUPLICATE_REQUEST` conflict whose rollback leaves zero new rows and
 *    zero second debit; foreign-key owner → oracle-safe
 *    `SESSION_NOT_FOUND`); every pre-DB validation guard (empty/129-char
 *    key, non-safe-integer ids, `intent=evaluation` with a zero-writes
 *    proof); governance re-check denials (`FORBIDDEN`) on create/start/
 *    complete with cancel deliberately EXEMPT (a governed student can
 *    still release an in-flight hold); teacher-lock branches (missing
 *    teacher → `TEACHER_NOT_FOUND`, unapproved/null-certification →
 *    `TEACHER_NOT_CERTIFIED`); oracle-safe read branches.
 *  - Tier 2 (boundary): confirmation deadline = captured now +
 *    86_400_000 ms EXACTLY (bracketed); fee "25.00" decimal STRING per
 *    intent; cancel reason 500 chars accepted-and-discarded, 501 rejected
 *    (trim-normalized); idempotency key EXACTLY 128 chars accepted
 *    verbatim; pagination boundaries (page 1, pageSize 1 and 50, out-of-
 *    range page/size normalized to 1/25 per the implemented contract, out-
 *    of-vocabulary filter drops out); held-balance provenance (Trial when
 *    the trial lane won, paid lane when the trial lane was empty).
 *  - Tier 3 (rollback-path chaos): REQ-040 forced session-insert failure
 *    (a file-local trigger raises mid-flow) → ZERO rows in `session`,
 *    the claim table, and the students lane delta, and the key is
 *    REUSABLE; REQ-042 double-cancel refunds EXACTLY once (second cancel
 *    → `SESSION_INVALID_TRANSITION`, balance unchanged). The concurrency
 *    chaos lives in the committed-fixture block below.
 *  - Tier 4 (typed denials + source pins): every denial carries the exact
 *    `DomainError.code` and the localized message; `intent=evaluation`
 *    never reaches the DB (zero writes proof); grep-level pins — the
 *    service source imports NOTHING from the notification/audit/wallet/
 *    transaction-ledger/report surfaces (sole service import is the
 *    `withTransaction` helper) and holds zero `console.*` calls.
 *
 * Chaos block (REQ-043, `Promise.allSettled` on the PRODUCTION tx path):
 *  committed fixtures (hard-deleted in `afterAll`) let each concurrent
 *  service call open its own real transaction on its own connection —
 *  genuine row-lock serialization, a genuine 23505 claim race, and the
 *  production savepoint/rollback behavior end to end.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { session } from "@/backend/db/schema/classes/session";
import { sessionRequestIdempotency } from "@/backend/db/schema/classes/session-request-idempotency";
import { students } from "@/backend/db/schema/students/students";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import { createTestStudent, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { SessionLifecycleService } from "@/backend/services/classes/session-lifecycle.service";
import type {
  DBTransaction,
  SessionInsertType,
  SessionListFilterInput,
  SessionReturnType,
  SessionSelectType,
  SessionStudentIntentType,
  SessionSubmitInput,
} from "@/backend/types";
import {
  SESSION_CONFIRMATION_WINDOW_MS,
  SESSION_FEE_HIFZ,
  SESSION_FEE_TAJWEED,
} from "@/shared/constants/session-fees.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** PostgreSQL error code for `raise_exception` (the REQ-040 trigger probe). */
const PG_RAISE_EXCEPTION = "P0001";

/**
 * The chaos-assertion statuses, widened to plain strings at module scope:
 * the fulfilled rows' `status` is the raw pg-enum string union, so the
 * predicate comparison needs the enum member's string identity without a
 * runtime conversion — the vocabulary still flows from the enum, never from
 * a bare literal (mirrors the service's own `SESSION_STARTED_STATUS`).
 */
const SESSION_CANCELLED_STATUS: string = SessionStatus.Cancelled;
const SESSION_STARTED_STATUS: string = SessionStatus.Started;

/** The errors-namespace translations for the default test locale. */
function t() {
  return getServerTranslations("en").errorsTranslations;
}

/**
 * Type-guard read of a caught rejection's `extensions.code` — the
 * assertion-free form of the REQ-050 DomainError contract check (an
 * `instanceof` guard, never a narrowing cast).
 */
function rejectionCode(error: unknown): string {
  return error instanceof DomainError ? error.code : "";
}

/**
 * Asserts a caught error is a `DomainError` carrying EXACTLY the expected
 * `extensions.code` (the REQ-050 typed-denial contract) and the exact
 * translated message (never the raw translation key).
 */
function expectDomainDenial(error: Error, code: string, message: string): void {
  expect(error).toBeInstanceOf(DomainError);
  expect(rejectionCode(error)).toBe(code);
  expect(error.message).toBe(message);
  expect(error.message).not.toContain(code);
}

// ─── File-local fixtures (mirror the repo-suite helpers) ────────────────

/** Shared-PK ids for one booking pair (session.teacher_id / session.student_id). */
interface SessionActors {
  teacherUserId: number;
  studentUserId: number;
}

/**
 * Shared-PK `teacher` row insert for a previously-created user — mirrors
 * the entity-setup role-child factory pattern (PK = users.id, FK cascade).
 * `isApproved` accepts `null` to pin the strict-true certification boundary.
 */
async function createTestTeacherRow(tx: DBTransaction, userId: number, isApproved: boolean | null): Promise<void> {
  await tx.insert(teacher).values({ id: userId, isApproved });
}

/** Creates one certified teacher + one student pair with shared-PK rows. */
async function createSessionActors(tx: DBTransaction): Promise<SessionActors> {
  const teacherUser = await createTestUser(tx, { role: "teacher" });
  await createTestTeacherRow(tx, teacherUser.id, true);
  const studentUser = await createTestUser(tx, { role: "student" });
  await createTestStudent(tx, studentUser.id);
  return { teacherUserId: teacherUser.id, studentUserId: studentUser.id };
}

/** Sets the students row's escrow lane balances (test-local oracle setup). */
async function setLaneBalances(
  tx: DBTransaction,
  studentId: number,
  balances: { trial?: number; hifz?: number; tajweed?: number }
): Promise<void> {
  await tx
    .update(students)
    .set({
      balanceTrial: balances.trial ?? 0,
      balanceHifz: balances.hifz ?? 0,
      balanceTajweed: balances.tajweed ?? 0,
    })
    .where(eq(students.id, studentId));
}

/** Independent read-back oracle: the student row's lane balances. */
async function readLaneBalances(tx: DBTransaction, studentId: number) {
  const [row] = await tx
    .select({ trial: students.balanceTrial, hifz: students.balanceHifz, tajweed: students.balanceTajweed })
    .from(students)
    .where(eq(students.id, studentId));
  if (!row) {
    throw new Error("readLaneBalances: student row vanished");
  }
  return row;
}

/** Independent read-back oracle: the full session row (NOT via the service). */
async function readSessionRow(tx: DBTransaction, sessionId: number): Promise<SessionSelectType | null> {
  const [row] = await tx.select().from(session).where(eq(session.id, sessionId));
  return row ?? null;
}

/** Every session row booked by the student (count oracle, tx-scoped). */
async function countSessionsForStudent(tx: DBTransaction, studentId: number): Promise<number> {
  const rows = await tx.select({ id: session.id }).from(session).where(eq(session.studentId, studentId));
  return rows.length;
}

/** Every claim row spent by the user (count oracle, tx-scoped). */
async function countClaimsForUser(tx: DBTransaction, userId: number): Promise<number> {
  const rows = await tx
    .select({ id: sessionRequestIdempotency.id })
    .from(sessionRequestIdempotency)
    .where(eq(sessionRequestIdempotency.userId, userId));
  return rows.length;
}

/** The claim row for a key, read directly (replay backfill oracle). */
async function readClaimByKey(tx: DBTransaction, key: string) {
  const [row] = await tx
    .select()
    .from(sessionRequestIdempotency)
    .where(eq(sessionRequestIdempotency.idempotencyKey, key));
  return row ?? null;
}

/** Independent read-back oracle for the committed chaos block (db-scoped). */
async function readChaosSessionRow(sessionId: number): Promise<SessionSelectType | null> {
  const [row] = await db.select().from(session).where(eq(session.id, sessionId));
  return row ?? null;
}

/**
 * Direct session-row insert for test preconditions (full column control —
 * e.g. a non-scheduled lifecycle state for probe-classification tests).
 */
async function insertSessionRow(
  tx: DBTransaction,
  actors: SessionActors,
  overrides: Partial<SessionInsertType> = {}
): Promise<SessionSelectType> {
  const [row] = await tx
    .insert(session)
    .values({
      teacherId: actors.teacherUserId,
      studentId: actors.studentUserId,
      status: SessionStatus.Scheduled,
      fee: "10.00",
      feeHeld: true,
      heldBalanceLane: HeldBalanceLane.Hifz,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("insertSessionRow: insert returned no rows");
  }
  return row;
}

/** An integer id that cannot exist as a `session` row during this transaction. */
async function absentSessionId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${session.id}), 0)::int` }).from(session);
  return (row?.maxId ?? 0) + 1_000_000;
}

/** An integer id that cannot exist as a `users` row during this transaction. */
async function absentUserId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${users.id}), 0)::int` }).from(users);
  return (row?.maxId ?? 0) + 1_000_000;
}

/** The service's booking call, pinned to the test transaction + locale. */
function bookSession(
  tx: DBTransaction,
  studentId: number,
  teacherId: number,
  intent: SessionStudentIntentType,
  key: string
): Promise<SessionReturnType> {
  return SessionLifecycleService.createSession(studentId, { teacherId, intent }, key, "en", tx);
}

/** Walks the Drizzle cause chain for a PostgreSQL SQLSTATE code. */
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

// ─── Transactional service flows (runInRollback) ────────────────────────

describe("SessionLifecycleService — transactional flows (runInRollback)", () => {
  // ── Tier 1: booking + the debit ladder ──────────────────────────────

  test("trial-hit branch: books on the trial lane, holds the fee, records Trial provenance, debits exactly one trial unit", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });

      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-trial-hit"
      );

      expect(created.status).toBe(SessionStatus.Scheduled);
      expect(created.sessionType).toBe(SessionType.StudentSession);
      expect(created.intent).toBe(SessionIntent.Hifz);
      expect(created.feeHeld).toBe(true);
      expect(created.heldBalanceLane).toBe(HeldBalanceLane.Trial);
      expect(created.startedAt).toBeNull();
      expect(created.endedAt).toBeNull();

      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(0);
      expect(balances.hifz).toBe(0);
      expect(balances.tajweed).toBe(0);

      const claim = await readClaimByKey(tx, "key-trial-hit");
      expect(claim).not.toBeNull();
      expect(claim?.sessionId).toBe(created.id);
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(1);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(1);
    });
  });

  test("hifz-hit branch: empty trial lane falls through to the intent's own lane", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { hifz: 1 });

      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-hifz-hit"
      );

      expect(created.heldBalanceLane).toBe(HeldBalanceLane.Hifz);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(0);
      expect(balances.hifz).toBe(0);
      expect(balances.tajweed).toBe(0);
    });
  });

  test("tajweed-hit branch: the Tajweed intent binds its own lane and its own fee", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { tajweed: 1 });

      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Tajweed,
        "key-tajweed-hit"
      );

      expect(created.intent).toBe(SessionIntent.Tajweed);
      expect(created.heldBalanceLane).toBe(HeldBalanceLane.Tajweed);
      expect(created.fee).toBe(SESSION_FEE_TAJWEED);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.tajweed).toBe(0);
    });
  });

  test("total-miss branch: an empty student is denied INSUFFICIENT_BALANCE with zero rows and the key stays reusable", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);

      const error = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, "key-total-miss")
      );
      expectDomainDenial(error, "INSUFFICIENT_BALANCE", t().insufficientBalance);

      // Zero rows anywhere: no session, no claim, no lane delta.
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(0);
      expect(balances.hifz).toBe(0);
      expect(balances.tajweed).toBe(0);

      // The failed booking never burned its key: funding the student and
      // retrying the SAME key succeeds.
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });
      const retry = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-total-miss"
      );
      expect(retry.heldBalanceLane).toBe(HeldBalanceLane.Trial);
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(1);
    });
  });

  test("trial-first ordering proof: a student holding BOTH lanes books twice — trial first, paid lane second", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1, hifz: 1 });

      const first = await bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, "key-both-1");
      const second = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-both-2"
      );

      expect(first.heldBalanceLane).toBe(HeldBalanceLane.Trial);
      expect(second.heldBalanceLane).toBe(HeldBalanceLane.Hifz);

      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(0);
      expect(balances.hifz).toBe(0);
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(2);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(2);
    });
  });

  // ── Tier 1: pre-DB validation guards ────────────────────────────────

  test("idempotency key guards: an empty key and a 129-char key are rejected pre-DB with VALIDATION", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });

      const emptyError = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, "")
      );
      expectDomainDenial(emptyError, "VALIDATION", t().idempotencyKeyRequired);

      const longError = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, "k".repeat(129))
      );
      expectDomainDenial(longError, "VALIDATION", t().idempotencyKeyRequired);

      // Zero writes: no session, no claim, balances untouched.
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(1);
    });
  });

  test("identifier guards: non-positive / non-safe-integer student and teacher ids are rejected pre-DB", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);

      // Every id fails the PRE-DB boundary guards — no query is ever issued
      // for any attempt, so the guard matrix runs as one parallel batch
      // (each denial is asserted inside its own promise chain).
      await Promise.all(
        [0, -5, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1].map(badStudentId =>
          expectRepoError(() =>
            bookSession(
              tx,
              badStudentId,
              actors.teacherUserId,
              SessionIntent.Hifz,
              `key-bad-student-${String(badStudentId)}`
            )
          ).then(error => expectDomainDenial(error, "VALIDATION", t().validation))
        )
      );
      await Promise.all(
        [0, -1, 2.25, Number.NaN].map(badTeacherId =>
          expectRepoError(() =>
            bookSession(
              tx,
              actors.studentUserId,
              badTeacherId,
              SessionIntent.Hifz,
              `key-bad-teacher-${String(badTeacherId)}`
            )
          ).then(error => expectDomainDenial(error, "VALIDATION", t().validation))
        )
      );

      // Zero rows reached the database through the whole guard matrix
      // (covers the per-attempt zero-writes proof — no attempt touched any
      // table, so the post-batch counts are the same zero).
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
    });
  });

  test("intent guard: intent=evaluation is rejected PRE-DB — VALIDATION, zero writes (no session, no claim, no debit)", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1, hifz: 1 });

      // The out-of-vocabulary intent must reach the SERVICE's runtime guard
      // (the compiler cannot see it): the hostile value is overlaid onto a
      // correctly-typed base input via Object.assign — the lint-clean
      // mechanism (no unsafe assertion), mirroring the registration suite's
      // hostile-extras pattern. At runtime the value IS the
      // SessionIntent.Evaluation member; the guard must still reject it.
      const baseInput: SessionSubmitInput = { teacherId: actors.teacherUserId, intent: SessionIntent.Hifz };
      const evaluationInput: SessionSubmitInput = Object.assign({}, baseInput, { intent: SessionIntent.Evaluation });

      const error = await expectRepoError(() =>
        SessionLifecycleService.createSession(actors.studentUserId, evaluationInput, "key-evaluation", "en", tx)
      );
      expectDomainDenial(error, "VALIDATION", t().invalidSessionIntent);

      // The zero-writes proof: the rejection happened before any DB work.
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(1);
      expect(balances.hifz).toBe(1);
      expect(await readClaimByKey(tx, "key-evaluation")).toBeNull();
    });
  });

  // ── Tier 1: governance re-check (create/start/complete; cancel exempt) ──

  test("governed students are denied FORBIDDEN on create — isDeleted, isBlocked, and suspended each fail closed with zero writes", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const deletedUser = await createTestUser(tx, { role: "student", isDeleted: true });
      await createTestStudent(tx, deletedUser.id);
      const blockedUser = await createTestUser(tx, { role: "student", isBlocked: true });
      await createTestStudent(tx, blockedUser.id);
      const suspendedUser = await createTestUser(tx, { role: "student", suspended: true });
      await createTestStudent(tx, suspendedUser.id);

      // The governance denial is read-only (one probe SELECT, then the typed
      // FORBIDDEN — it throws before the booking transaction opens), so the
      // three cases run as one parallel batch with their zero-writes oracles
      // folded into each case's own promise chain.
      await Promise.all(
        [deletedUser.id, blockedUser.id, suspendedUser.id].map((governedId, index) =>
          expectRepoError(() =>
            bookSession(tx, governedId, actors.teacherUserId, SessionIntent.Hifz, `key-governed-${index}`)
          ).then(async error => {
            expectDomainDenial(error, "FORBIDDEN", t().forbidden);
            expect(await countClaimsForUser(tx, governedId)).toBe(0);
            expect(await countSessionsForStudent(tx, governedId)).toBe(0);
            return undefined;
          })
        )
      );

      // The clean actors are untouched by the denials.
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
    });
  });

  test("governed teachers are denied FORBIDDEN on start AND on complete", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const row = await insertSessionRow(tx, actors, { status: SessionStatus.Started });

      await tx.update(users).set({ isBlocked: true }).where(eq(users.id, actors.teacherUserId));

      const startError = await expectRepoError(() =>
        SessionLifecycleService.startSession(actors.teacherUserId, row.id, "en", tx)
      );
      expectDomainDenial(startError, "FORBIDDEN", t().forbidden);

      const completeError = await expectRepoError(() =>
        SessionLifecycleService.completeSession(actors.teacherUserId, row.id, "en", tx)
      );
      expectDomainDenial(completeError, "FORBIDDEN", t().forbidden);

      // Zero mutation: the session is still exactly where it was.
      const finalRow = await readSessionRow(tx, row.id);
      expect(finalRow?.status).toBe(SessionStatus.Started);
      expect(finalRow?.endedAt).toBeNull();
      expect(finalRow?.confirmedByTeacherAt).toBeNull();
    });
  });

  test("cancel is governance-EXEMPT: a blocked student can still release an in-flight hold and get the refund", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });
      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-gov-cancel"
      );
      expect(created.heldBalanceLane).toBe(HeldBalanceLane.Trial);

      await tx.update(users).set({ isBlocked: true }).where(eq(users.id, actors.studentUserId));

      const cancelled = await SessionLifecycleService.cancelSession(actors.studentUserId, created.id, null, "en", tx);
      expect(cancelled.status).toBe(SessionStatus.Cancelled);
      expect(cancelled.feeHeld).toBe(false);

      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(1);
    });
  });

  // ── Tier 1: teacher-lock branches ───────────────────────────────────

  test("teacher-lock null branch: booking a nonexistent teacher is denied TEACHER_NOT_FOUND with zero writes", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const absentId = await absentUserId(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });

      const error = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, absentId, SessionIntent.Hifz, "key-no-teacher")
      );
      expectDomainDenial(error, "TEACHER_NOT_FOUND", t().teacherNotFound);

      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(1);
    });
  });

  test("teacher-lock certification branches: an unapproved teacher AND a null-flag teacher are both TEACHER_NOT_CERTIFIED", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const unapprovedUser = await createTestUser(tx, { role: "teacher" });
      await createTestTeacherRow(tx, unapprovedUser.id, false);
      const nullFlagUser = await createTestUser(tx, { role: "teacher" });
      await createTestTeacherRow(tx, nullFlagUser.id, null);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });

      const unapprovedError = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, unapprovedUser.id, SessionIntent.Hifz, "key-unapproved")
      );
      expectDomainDenial(unapprovedError, "TEACHER_NOT_CERTIFIED", t().teacherNotCertified);

      const nullFlagError = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, nullFlagUser.id, SessionIntent.Hifz, "key-null-flag")
      );
      expectDomainDenial(nullFlagError, "TEACHER_NOT_CERTIFIED", t().teacherNotCertified);

      // Strict-true semantics: neither booking wrote anything.
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(1);
    });
  });

  // ── Tier 1: transition probe classification (start / complete / cancel) ──

  test("start probe: an unknown session id is classified SESSION_NOT_FOUND", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const absentId = await absentSessionId(tx);

      const error = await expectRepoError(() =>
        SessionLifecycleService.startSession(actors.teacherUserId, absentId, "en", tx)
      );
      expectDomainDenial(error, "SESSION_NOT_FOUND", t().sessionNotFound);
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  test("start probe: a foreign (non-owning) teacher is oracle-collapsed onto SESSION_NOT_FOUND", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const foreignTeacher = await createTestUser(tx, { role: "teacher" });
      await createTestTeacherRow(tx, foreignTeacher.id, true);
      const row = await insertSessionRow(tx, actors);

      const error = await expectRepoError(() =>
        SessionLifecycleService.startSession(foreignTeacher.id, row.id, "en", tx)
      );
      expectDomainDenial(error, "SESSION_NOT_FOUND", t().sessionNotFound);

      const finalRow = await readSessionRow(tx, row.id);
      expect(finalRow?.status).toBe(SessionStatus.Scheduled);
      expect(finalRow?.startedAt).toBeNull();
    });
  });

  test("start probe: an already-started session is a SESSION_INVALID_TRANSITION conflict", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const row = await insertSessionRow(tx, actors, { status: SessionStatus.Started });

      const error = await expectRepoError(() =>
        SessionLifecycleService.startSession(actors.teacherUserId, row.id, "en", tx)
      );
      expectDomainDenial(error, "SESSION_INVALID_TRANSITION", t().sessionInvalidTransition);
      expect(error).toBeInstanceOf(ConflictError);
    });
  });

  test("complete probe: a scheduled (never-started) session is a SESSION_INVALID_TRANSITION conflict", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const row = await insertSessionRow(tx, actors);

      const error = await expectRepoError(() =>
        SessionLifecycleService.completeSession(actors.teacherUserId, row.id, "en", tx)
      );
      expectDomainDenial(error, "SESSION_INVALID_TRANSITION", t().sessionInvalidTransition);

      const finalRow = await readSessionRow(tx, row.id);
      expect(finalRow?.status).toBe(SessionStatus.Scheduled);
      expect(finalRow?.endedAt).toBeNull();
      expect(finalRow?.confirmedByTeacherAt).toBeNull();
    });
  });

  test("complete probe: an owned in-progress session that fails the fused certification predicate is TEACHER_NOT_CERTIFIED", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });
      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-decert"
      );

      // Decertify AFTER booking, then start (start carries no certification
      // predicate — only completion re-asserts it, fused into its UPDATE).
      await tx.update(teacher).set({ isApproved: false }).where(eq(teacher.id, actors.teacherUserId));
      const started = await SessionLifecycleService.startSession(actors.teacherUserId, created.id, "en", tx);
      expect(started.status).toBe(SessionStatus.Started);

      const error = await expectRepoError(() =>
        SessionLifecycleService.completeSession(actors.teacherUserId, created.id, "en", tx)
      );
      expectDomainDenial(error, "TEACHER_NOT_CERTIFIED", t().teacherNotCertified);

      const finalRow = await readSessionRow(tx, created.id);
      expect(finalRow?.status).toBe(SessionStatus.Started);
      expect(finalRow?.endedAt).toBeNull();
      expect(finalRow?.confirmedByTeacherAt).toBeNull();
    });
  });

  test("cancel probe: a completed session and a foreign caller are both denied (terminal + oracle-safety)", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const foreignStudent = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, foreignStudent.id);

      const completed = await insertSessionRow(tx, actors, { status: SessionStatus.Completed, feeHeld: false });
      const terminalError = await expectRepoError(() =>
        SessionLifecycleService.cancelSession(actors.studentUserId, completed.id, null, "en", tx)
      );
      expectDomainDenial(terminalError, "SESSION_INVALID_TRANSITION", t().sessionInvalidTransition);

      const scheduled = await insertSessionRow(tx, actors);
      const foreignError = await expectRepoError(() =>
        SessionLifecycleService.cancelSession(foreignStudent.id, scheduled.id, null, "en", tx)
      );
      expectDomainDenial(foreignError, "SESSION_NOT_FOUND", t().sessionNotFound);

      // Both denials left the rows untouched.
      const untouched = await readSessionRow(tx, scheduled.id);
      expect(untouched?.status).toBe(SessionStatus.Scheduled);
      expect(untouched?.feeHeld).toBe(true);
    });
  });

  test("cancel happy path: keeps the start stamp, never writes an end stamp, refunds the SAME lane exactly once", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { hifz: 1 });
      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-cancel"
      );
      await SessionLifecycleService.startSession(actors.teacherUserId, created.id, "en", tx);

      const cancelled = await SessionLifecycleService.cancelSession(actors.studentUserId, created.id, null, "en", tx);

      expect(cancelled.status).toBe(SessionStatus.Cancelled);
      expect(cancelled.feeHeld).toBe(false);
      expect(cancelled.startedAt).not.toBeNull();
      expect(cancelled.endedAt).toBeNull();
      expect(cancelled.heldBalanceLane).toBe(HeldBalanceLane.Hifz);

      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.hifz).toBe(1);
      expect(balances.trial).toBe(0);
    });
  });

  // ── Tier 1: the idempotent replay branch ────────────────────────────

  test("replay branch: a same-caller retry of a spent key surfaces DUPLICATE_REQUEST, leaves zero new rows and zero second debit", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });
      const original = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-replay"
      );

      // Fund a paid lane so the retry passes the ladder and REACHES the
      // claim insert (the exact conflict-under-duplication scenario).
      await setLaneBalances(tx, actors.studentUserId, { hifz: 1 });

      const error = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, "key-replay")
      );
      expectDomainDenial(error, "DUPLICATE_REQUEST", t().duplicateRequest);
      expect(error).toBeInstanceOf(ConflictError);

      // Exactly one session and one claim — the original's. The replay's
      // own partial writes (its ladder debit) rolled back with its tx, so
      // the balances are static (REQ-073: no second debit).
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(1);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(1);
      const claim = await readClaimByKey(tx, "key-replay");
      expect(claim?.sessionId).toBe(original.id);
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(0);
      expect(balances.hifz).toBe(1);
      expect(balances.tajweed).toBe(0);
    });
  });

  test("replay branch: a key spent by a DIFFERENT caller is oracle-denied SESSION_NOT_FOUND and the foreign attempt writes nothing", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const second = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, second.id);

      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });
      const original = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-owner-a"
      );

      await setLaneBalances(tx, second.id, { trial: 1 });
      const error = await expectRepoError(() =>
        bookSession(tx, second.id, actors.teacherUserId, SessionIntent.Hifz, "key-owner-a")
      );
      expectDomainDenial(error, "SESSION_NOT_FOUND", t().sessionNotFound);

      // Another user's claim is never surfaced, and the foreign attempt's
      // debit rolled back with its transaction.
      const balances = await readLaneBalances(tx, second.id);
      expect(balances.trial).toBe(1);
      expect(await countSessionsForStudent(tx, second.id)).toBe(0);
      const originalClaim = await readClaimByKey(tx, "key-owner-a");
      expect(originalClaim?.sessionId).toBe(original.id);
      expect(await countClaimsForUser(tx, second.id)).toBe(0);
    });
  });

  // ── Tier 1: oracle-safe reads ───────────────────────────────────────

  test("getSessionById: the owner sees the row; a non-participant and a nonexistent id resolve to the identical null", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      const foreignStudent = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, foreignStudent.id);
      const row = await insertSessionRow(tx, actors);
      const absentId = await absentSessionId(tx);

      const ownerView = await SessionLifecycleService.getSessionById(actors.studentUserId, row.id, tx);
      expect(ownerView).not.toBeNull();
      expect(ownerView?.id).toBe(row.id);

      expect(await SessionLifecycleService.getSessionById(foreignStudent.id, row.id, tx)).toBeNull();
      expect(await SessionLifecycleService.getSessionById(actors.studentUserId, absentId, tx)).toBeNull();
    });
  });

  // ── Tier 2: boundary contracts ──────────────────────────────────────

  test("deadline boundary: confirmationDeadline = captured now + 86_400_000 ms EXACTLY (bracketed)", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });

      const before = Date.now();
      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-deadline"
      );
      const after = Date.now();

      expect(created.confirmationDeadline).toBeInstanceOf(Date);
      if (!(created.confirmationDeadline instanceof Date)) {
        throw new Error("deadline boundary: confirmationDeadline is not a Date");
      }
      const deadline = created.confirmationDeadline.getTime();
      expect(deadline).toBeGreaterThanOrEqual(before + SESSION_CONFIRMATION_WINDOW_MS);
      expect(deadline).toBeLessThanOrEqual(after + SESSION_CONFIRMATION_WINDOW_MS);
      expect(SESSION_CONFIRMATION_WINDOW_MS).toBe(86_400_000);
    });
  });

  test("fee boundary: both intents carry the platform fee as a decimal STRING verbatim (never a number)", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      // The hifz booking consumes the trial lane; the tajweed booking then
      // falls through to (and debits) the tajweed lane — both must be funded.
      await setLaneBalances(tx, actors.studentUserId, { trial: 1, tajweed: 1 });

      const hifzSession = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-fee-hifz"
      );
      const tajweedSession = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Tajweed,
        "key-fee-tajweed"
      );

      expect(hifzSession.fee).toBe(SESSION_FEE_HIFZ);
      expect(tajweedSession.fee).toBe(SESSION_FEE_TAJWEED);
      expect(hifzSession.fee).toBe("25.00");
      expect(tajweedSession.fee).toBe("25.00");
      expect(typeof hifzSession.fee).toBe("string");
      expect(typeof tajweedSession.fee).toBe("string");
    });
  });

  test("key boundary: an EXACTLY-128-char key is accepted and stored verbatim", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });
      const key = "k".repeat(128);

      const created = await bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, key);
      const claim = await readClaimByKey(tx, key);
      expect(claim).not.toBeNull();
      expect(claim?.idempotencyKey).toBe(key);
      expect(claim?.sessionId).toBe(created.id);
    });
  });

  test("cancel reason boundary: 500 chars (trim-normalized) accepted and DISCARDED; 501 rejected pre-DB", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 2 });

      const rejectedSession = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-reason-long"
      );
      const tooLongError = await expectRepoError(() =>
        SessionLifecycleService.cancelSession(actors.studentUserId, rejectedSession.id, "x".repeat(501), "en", tx)
      );
      expectDomainDenial(tooLongError, "VALIDATION", t().validation);
      // The rejection mutated nothing: the session is still held.
      const stillHeld = await readSessionRow(tx, rejectedSession.id);
      expect(stillHeld?.status).toBe(SessionStatus.Scheduled);
      expect(stillHeld?.feeHeld).toBe(true);

      // Whitespace beyond 500 content chars trims away — accepted.
      const acceptedSession = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-reason-ok"
      );
      const cancelled = await SessionLifecycleService.cancelSession(
        actors.studentUserId,
        acceptedSession.id,
        `${"y".repeat(500)}  `,
        "en",
        tx
      );
      expect(cancelled.status).toBe(SessionStatus.Cancelled);
      // The reason is deliberately DISCARDED — the row carries no such column.
      expect(Object.hasOwn(cancelled, "reason")).toBe(false);

      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(1);
    });
  });

  test("pagination boundaries: page 1 / pageSize 1 and 50 windows; out-of-range page and size normalize (1 / default 25); bogus filter drops out", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await insertSessionRow(tx, actors);
      await insertSessionRow(tx, actors);
      await insertSessionRow(tx, actors, { status: SessionStatus.Started });

      const firstPage = await SessionLifecycleService.listMyStudentSessions(
        actors.studentUserId,
        {} satisfies SessionListFilterInput,
        1,
        1,
        tx
      );
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.totalCount).toBe(3);
      expect(firstPage.page).toBe(1);
      expect(firstPage.pageSize).toBe(1);

      const fifty = await SessionLifecycleService.listMyStudentSessions(
        actors.studentUserId,
        { status: null },
        1,
        50,
        tx
      );
      expect(fifty.items).toHaveLength(3);
      expect(fifty.totalCount).toBe(3);
      expect(fifty.pageSize).toBe(50);

      // Out-of-range inputs normalize honestly — they never error.
      const oversized = await SessionLifecycleService.listMyStudentSessions(actors.studentUserId, {}, 1, 51, tx);
      expect(oversized.items).toHaveLength(3);
      expect(oversized.pageSize).toBe(25);

      const zeroPage = await SessionLifecycleService.listMyStudentSessions(actors.studentUserId, {}, 0, 25, tx);
      expect(zeroPage.page).toBe(1);
      const negativeInputs = await SessionLifecycleService.listMyStudentSessions(actors.studentUserId, {}, -3, 0, tx);
      expect(negativeInputs.page).toBe(1);
      expect(negativeInputs.pageSize).toBe(25);
      expect(negativeInputs.totalCount).toBe(3);

      // The lifecycle filter narrows list AND count coherently; a bogus
      // status drops out of the predicate (filters never error).
      const scheduled = await SessionLifecycleService.listMyStudentSessions(
        actors.studentUserId,
        { status: SessionStatus.Scheduled },
        1,
        50,
        tx
      );
      expect(scheduled.items).toHaveLength(2);
      expect(scheduled.totalCount).toBe(2);
      // Genuinely out-of-vocabulary (NOT a SessionStatus member — e.g.
      // `disputed` IS one) — the guard drops it and the read is unfiltered.
      // Object.assign overlays the hostile value onto a correctly-typed base
      // filter (no unsafe assertion); at runtime the value is a plausible-
      // but-unknown string the guard must drop out.
      const bogusFilter: SessionListFilterInput = Object.assign(
        { status: SessionStatus.Scheduled },
        { status: "expired" }
      );
      const bogus = await SessionLifecycleService.listMyStudentSessions(actors.studentUserId, bogusFilter, 1, 50, tx);
      expect(bogus.items).toHaveLength(3);
      expect(bogus.totalCount).toBe(3);

      // Owner-side scoping: another student and the teacher-side twin.
      const foreignStudent = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, foreignStudent.id);
      const foreignView = await SessionLifecycleService.listMyStudentSessions(foreignStudent.id, {}, 1, 50, tx);
      expect(foreignView.items).toHaveLength(0);
      expect(foreignView.totalCount).toBe(0);

      const teacherView = await SessionLifecycleService.listMyTeacherSessions(actors.teacherUserId, {}, 1, 50, tx);
      expect(teacherView.items).toHaveLength(3);
      expect(teacherView.totalCount).toBe(3);
    });
  });

  // ── Tier 3 (rollback path): REQ-040 + REQ-042 ───────────────────────

  test("REQ-040 rollback proof: a forced session-insert failure leaves ZERO rows in session/claim/lane delta and the key is REUSABLE", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1, hifz: 1 });
      const key = "key-req040";

      // Chaos injection: a transactional trigger raises on THIS student's
      // session inserts only. The DDL lives inside the rolled-back test
      // transaction — nothing leaks into the shared database.
      const failFn = `raise_session_insert_fail_${randomUUID().slice(0, 8).replaceAll("-", "_")}`;
      const failTrigger = `fail_session_insert_${randomUUID().slice(0, 8).replaceAll("-", "_")}`;
      await tx.execute(
        sql.raw(
          `CREATE FUNCTION ${failFn}() RETURNS trigger LANGUAGE plpgsql AS $fn$ ` +
            `BEGIN RAISE EXCEPTION 'forced session-insert failure (REQ-040 probe)'; END; $fn$;`
        )
      );
      await tx.execute(
        sql.raw(
          `CREATE TRIGGER ${failTrigger} ` +
            `BEFORE INSERT ON session FOR EACH ROW WHEN (NEW.student_id = ${actors.studentUserId}) ` +
            `EXECUTE FUNCTION ${failFn}()`
        )
      );

      const error = await expectRepoError(() =>
        bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, key)
      );

      // The raw database failure surfaced untouched (no DomainError masking,
      // no swallowed catch) as a raise_exception from the trigger.
      expect(error).not.toBeInstanceOf(DomainError);
      expect(hasPostgresErrorCode(error, PG_RAISE_EXCEPTION)).toBe(true);

      // REQ-040's atomicity proof: zero rows in ALL THREE surfaces and the
      // lane delta rolled back with them.
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(0);
      expect(await countClaimsForUser(tx, actors.studentUserId)).toBe(0);
      expect(await readClaimByKey(tx, key)).toBeNull();
      const balances = await readLaneBalances(tx, actors.studentUserId);
      expect(balances.trial).toBe(1);
      expect(balances.hifz).toBe(1);
      expect(balances.tajweed).toBe(0);

      // Drop the trigger (same transaction), then prove the key is
      // REUSABLE: the failed booking never burned it.
      await tx.execute(sql.raw(`DROP TRIGGER ${failTrigger} ON session`));
      const retry = await bookSession(tx, actors.studentUserId, actors.teacherUserId, SessionIntent.Hifz, key);
      expect(retry.status).toBe(SessionStatus.Scheduled);
      expect(await countSessionsForStudent(tx, actors.studentUserId)).toBe(1);
      const claim = await readClaimByKey(tx, key);
      expect(claim?.sessionId).toBe(retry.id);
      const retryBalances = await readLaneBalances(tx, actors.studentUserId);
      // The retry is funded on BOTH lanes, so the documented trial-first
      // ladder debits the TRIAL unit — the hifz unit is untouched.
      expect(retryBalances.trial).toBe(0);
      expect(retryBalances.hifz).toBe(1);
    });
  });

  test("REQ-042: double-cancel refunds EXACTLY once — the second cancel is a SESSION_INVALID_TRANSITION with the balance unchanged", async () => {
    await runInRollback(async tx => {
      const actors = await createSessionActors(tx);
      await setLaneBalances(tx, actors.studentUserId, { trial: 1 });
      const created = await bookSession(
        tx,
        actors.studentUserId,
        actors.teacherUserId,
        SessionIntent.Hifz,
        "key-req042"
      );

      const first = await SessionLifecycleService.cancelSession(actors.studentUserId, created.id, null, "en", tx);
      expect(first.status).toBe(SessionStatus.Cancelled);
      expect(first.feeHeld).toBe(false);
      const afterFirst = await readLaneBalances(tx, actors.studentUserId);
      expect(afterFirst.trial).toBe(1);

      const second = await expectRepoError(() =>
        SessionLifecycleService.cancelSession(actors.studentUserId, created.id, null, "en", tx)
      );
      expectDomainDenial(second, "SESSION_INVALID_TRANSITION", t().sessionInvalidTransition);

      // EXACTLY ONE unit refunded — the second denial refunded nothing.
      const afterSecond = await readLaneBalances(tx, actors.studentUserId);
      expect(afterSecond.trial).toBe(1);
      expect(afterSecond.hifz).toBe(0);
      expect(afterSecond.tajweed).toBe(0);
    });
  });

  // ── Tier 4: grep-level source pins (financial side-effect isolation) ──

  const SERVICE_FILE = join(import.meta.dir, "session-lifecycle.service.ts");
  const serviceSource = readFileSync(SERVICE_FILE, "utf8");
  const serviceFromClauses = serviceSource.match(/from "[^"]+"/g) ?? [];

  test("source: ZERO imports of notification/audit/wallet/transaction-ledger/report modules — the sole service import is withTransaction", () => {
    const serviceImports = serviceFromClauses.filter(clause => clause.includes("@/backend/services/"));
    expect(serviceImports).toEqual(['from "@/backend/services/shared/withTransaction"']);

    for (const clause of serviceFromClauses) {
      expect(/services\/(notification|audit|wallet|transaction|report|billing)/.test(clause)).toBe(false);
      expect(/CommunicationService|dispatchWithPreferences|QuotaService|logReport/.test(clause)).toBe(false);
    }
  });

  test("source: zero console.* calls and zero raw process.env reads in the service", () => {
    expect(/console\./.test(serviceSource)).toBe(false);
    expect(/process\.env/.test(serviceSource)).toBe(false);
  });
});

// ─── REQ-043 chaos (production tx path, committed fixtures) ─────────────

describe("SessionLifecycleService — REQ-043 chaos (production tx path, committed fixtures)", () => {
  let chaosTeacherId = 0;
  let chaosStudentId = 0;

  beforeAll(async () => {
    await db.transaction(async tx => {
      const actors = await createSessionActors(tx);
      chaosTeacherId = actors.teacherUserId;
      chaosStudentId = actors.studentUserId;
    });
  });

  afterAll(async () => {
    // FK-safe hard delete: claims → sessions → users (the users delete
    // cascades the students/teacher role-child rows).
    await db.delete(sessionRequestIdempotency).where(eq(sessionRequestIdempotency.userId, chaosStudentId));
    await db.delete(session).where(eq(session.studentId, chaosStudentId));
    await db.delete(users).where(eq(users.id, chaosStudentId));
    await db.delete(users).where(eq(users.id, chaosTeacherId));
  });

  /** Committed lane setup for the chaos fixtures (production-path bookings). */
  async function setChaosBalances(balances: { trial?: number; hifz?: number; tajweed?: number }): Promise<void> {
    await db
      .update(students)
      .set({
        balanceTrial: balances.trial ?? 0,
        balanceHifz: balances.hifz ?? 0,
        balanceTajweed: balances.tajweed ?? 0,
      })
      .where(eq(students.id, chaosStudentId));
  }

  async function readChaosBalances() {
    const [row] = await db
      .select({ trial: students.balanceTrial, hifz: students.balanceHifz, tajweed: students.balanceTajweed })
      .from(students)
      .where(eq(students.id, chaosStudentId));
    if (!row) {
      throw new Error("readChaosBalances: chaos student row vanished");
    }
    return row;
  }

  async function countChaosSessions(): Promise<number> {
    const rows = await db.select({ id: session.id }).from(session).where(eq(session.studentId, chaosStudentId));
    return rows.length;
  }

  async function countChaosClaims(): Promise<number> {
    const rows = await db
      .select({ id: sessionRequestIdempotency.id })
      .from(sessionRequestIdempotency)
      .where(eq(sessionRequestIdempotency.userId, chaosStudentId));
    return rows.length;
  }

  function chaosBook(intent: SessionStudentIntentType, key: string): Promise<SessionReturnType> {
    // NO outerTx — the production path: the service opens its own
    // transaction, giving every concurrent call a real connection.
    return SessionLifecycleService.createSession(chaosStudentId, { teacherId: chaosTeacherId, intent }, key, "en");
  }

  test("REQ-043(a): concurrent double-start → one success + one SESSION_INVALID_TRANSITION, final started", async () => {
    await setChaosBalances({ trial: 1 });
    const created = await chaosBook(SessionIntent.Hifz, `chaos-a-${randomUUID()}`);

    const outcomes = await Promise.allSettled([
      SessionLifecycleService.startSession(chaosTeacherId, created.id, "en"),
      SessionLifecycleService.startSession(chaosTeacherId, created.id, "en"),
    ]);

    const fulfillments = outcomes.flatMap(outcome => (outcome.status === "fulfilled" ? [outcome.value] : []));
    const rejections = outcomes.flatMap(outcome => (outcome.status === "rejected" ? [outcome.reason] : []));
    expect(fulfillments).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(fulfillments[0]?.status).toBe(SessionStatus.Started);
    expect(rejections[0]).toBeInstanceOf(DomainError);
    expect(rejectionCode(rejections[0])).toBe("SESSION_INVALID_TRANSITION");

    const finalRow = await readChaosSessionRow(created.id);
    expect(finalRow?.status).toBe(SessionStatus.Started);
    expect(finalRow?.startedAt).not.toBeNull();
    expect(finalRow?.endedAt).toBeNull();
  });

  test("REQ-043(b): start⚡cancel race serializes to one consistent state — refund iff cancel wins (it always does)", async () => {
    await setChaosBalances({ trial: 1 });
    const created = await chaosBook(SessionIntent.Hifz, `chaos-b-${randomUUID()}`);

    const outcomes = await Promise.allSettled([
      SessionLifecycleService.startSession(chaosTeacherId, created.id, "en"),
      SessionLifecycleService.cancelSession(chaosStudentId, created.id, null, "en"),
    ]);

    const fulfillments = outcomes.flatMap(outcome => (outcome.status === "fulfilled" ? [outcome.value] : []));
    const rejections = outcomes.flatMap(outcome => (outcome.status === "rejected" ? [outcome.reason] : []));

    // Cancel is legal from BOTH pre-start states, so it never loses; the
    // start wins only if its guarded UPDATE acquired the row lock first.
    const cancelledOutcome = fulfillments.find(value => value.status === SESSION_CANCELLED_STATUS);
    expect(cancelledOutcome).toBeDefined();
    for (const rejection of rejections) {
      expect(rejection).toBeInstanceOf(DomainError);
      expect(rejectionCode(rejection)).toBe("SESSION_INVALID_TRANSITION");
    }

    const finalRow = await readChaosSessionRow(created.id);
    expect(finalRow?.status).toBe(SessionStatus.Cancelled);
    expect(finalRow?.feeHeld).toBe(false);
    expect(finalRow?.endedAt).toBeNull();
    // The start stamp survives iff the start landed before the cancel.
    if (fulfillments.some(value => value.status === SESSION_STARTED_STATUS)) {
      expect(finalRow?.startedAt).not.toBeNull();
    } else {
      expect(finalRow?.startedAt).toBeNull();
    }

    // Refund iff cancel won — and EXACTLY once (one unit back on trial).
    const balances = await readChaosBalances();
    expect(balances.trial).toBe(1);
    expect(balances.hifz).toBe(0);
    expect(balances.tajweed).toBe(0);
  });

  test("REQ-043(c): concurrent double-complete → one success, confirmedByTeacherAt written once, loser is a transition conflict", async () => {
    await setChaosBalances({ trial: 1 });
    const created = await chaosBook(SessionIntent.Hifz, `chaos-c-${randomUUID()}`);
    await SessionLifecycleService.startSession(chaosTeacherId, created.id, "en");

    const outcomes = await Promise.allSettled([
      SessionLifecycleService.completeSession(chaosTeacherId, created.id, "en"),
      SessionLifecycleService.completeSession(chaosTeacherId, created.id, "en"),
    ]);

    const fulfillments = outcomes.flatMap(outcome => (outcome.status === "fulfilled" ? [outcome.value] : []));
    const rejections = outcomes.flatMap(outcome => (outcome.status === "rejected" ? [outcome.reason] : []));
    expect(fulfillments).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(fulfillments[0]?.status).toBe(SessionStatus.Completed);
    expect(fulfillments[0]?.confirmedByTeacherAt).not.toBeNull();
    expect(rejectionCode(rejections[0])).toBe("SESSION_INVALID_TRANSITION");

    const finalRow = await readChaosSessionRow(created.id);
    expect(finalRow?.status).toBe(SessionStatus.Completed);
    expect(finalRow?.endedAt).not.toBeNull();
    // The confirmation stamp is the ONE write the winner made.
    expect(finalRow?.confirmedByTeacherAt?.getTime()).toBe(fulfillments[0]?.confirmedByTeacherAt?.getTime());
  });

  test("REQ-043(d): two concurrent creations with ONE unit → exactly one session + one INSUFFICIENT_BALANCE, lanes never negative", async () => {
    await setChaosBalances({ trial: 1 });

    // The chaos block shares one committed student, so the count oracles are
    // scoped per test: the race must add EXACTLY one session and one claim
    // on top of the earlier tests' committed rows.
    const baselineSessions = await countChaosSessions();
    const baselineClaims = await countChaosClaims();

    const outcomes = await Promise.allSettled([
      chaosBook(SessionIntent.Hifz, `chaos-d-${randomUUID()}`),
      chaosBook(SessionIntent.Hifz, `chaos-d-${randomUUID()}`),
    ]);

    const fulfillments = outcomes.flatMap(outcome => (outcome.status === "fulfilled" ? [outcome.value] : []));
    const rejections = outcomes.flatMap(outcome => (outcome.status === "rejected" ? [outcome.reason] : []));
    expect(fulfillments).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toBeInstanceOf(ValidationError);
    expect(rejectionCode(rejections[0])).toBe("INSUFFICIENT_BALANCE");

    expect(await countChaosSessions()).toBe(baselineSessions + 1);
    expect(await countChaosClaims()).toBe(baselineClaims + 1);
    const balances = await readChaosBalances();
    expect(balances.trial).toBe(0);
    expect(balances.hifz).toBe(0);
    expect(balances.tajweed).toBe(0);
  });

  test("REQ-043(e): the same key replayed concurrently N=4 times → exactly one session, one net debit, three DUPLICATE_REQUEST denials", async () => {
    // Fund the paid lane with N units so every concurrent flow passes the
    // ladder and reaches the claim insert — the genuine 23505 race. The
    // losers' flows throw DUPLICATE_REQUEST, so their own ladder debits
    // roll back: exactly ONE net debit survives (REQ-073).
    await setChaosBalances({ hifz: 4 });
    const sharedKey = `chaos-e-${randomUUID()}`;

    // Per-test scoping (shared committed chaos student — see REQ-043(d)).
    const baselineSessions = await countChaosSessions();
    const baselineClaims = await countChaosClaims();

    const outcomes = await Promise.allSettled([
      chaosBook(SessionIntent.Hifz, sharedKey),
      chaosBook(SessionIntent.Hifz, sharedKey),
      chaosBook(SessionIntent.Hifz, sharedKey),
      chaosBook(SessionIntent.Hifz, sharedKey),
    ]);

    const fulfillments = outcomes.flatMap(outcome => (outcome.status === "fulfilled" ? [outcome.value] : []));
    const rejections = outcomes.flatMap(outcome => (outcome.status === "rejected" ? [outcome.reason] : []));
    expect(fulfillments).toHaveLength(1);
    expect(rejections).toHaveLength(3);
    for (const rejection of rejections) {
      expect(rejection).toBeInstanceOf(DomainError);
      expect(rejectionCode(rejection)).toBe("DUPLICATE_REQUEST");
    }

    // One session, one claim, one net debit — every other flow rolled back.
    expect(await countChaosSessions()).toBe(baselineSessions + 1);
    expect(await countChaosClaims()).toBe(baselineClaims + 1);
    const balances = await readChaosBalances();
    expect(balances.hifz).toBe(3);
    expect(balances.trial).toBe(0);
    expect(balances.tajweed).toBe(0);

    const claimRows = await db
      .select()
      .from(sessionRequestIdempotency)
      .where(eq(sessionRequestIdempotency.idempotencyKey, sharedKey));
    expect(claimRows).toHaveLength(1);
    expect(claimRows[0]?.sessionId).toBe(fulfillments[0]?.id);
  });
});
