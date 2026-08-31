/**
 * SessionRepository — data-access layer for the `session` table.
 *
 * The `session` row is the central scheduling entity: one meeting between a
 * teacher and a student (`teacher_id`/`student_id` are NOT NULL restrict FKs
 * onto the shared `users.id` PKs). Lifecycle transitions are SINGLE guarded
 * conditional UPDATE statements: the full predicate (row identity + owning
 * teacher/participant + current lifecycle state, and for completion the
 * fused certification re-assertion) and the mutation share one statement, so
 * predicate evaluation happens under PostgreSQL's row lock with zero
 * check-then-write window. A transition that matches zero rows reports
 * `null`; deciding WHY (unknown row vs non-participant vs wrong state vs
 * decertified teacher) belongs to the caller, which classifies via
 * `findTransitionProbe` — a cold-path projection read that never feeds
 * writes.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - One `namespace` per repository file; the namespace name is the
 *    canonical export.
 *  - Every method takes `tx?: DBTransaction` as its LAST parameter. Reads
 *    run on the caller's transaction when supplied and fall back to raw
 *    parameterized SQL via `queryDb` (the Neon-HTTP-eligible pattern, as in
 *    `UserRepository.findById`) otherwise; writes execute on `tx ?? db`
 *    (the same fallback the student lane debit/refund methods use).
 *  - NO prepared statements — the list predicates are dynamically composed
 *    and every write is transactional (`docs/drizzle/prepared-statements.md`
 *    excludes both from preparation). NO array-membership operators — the
 *    cancel/dispute-state memberships and every other predicate are
 *    composed from equality conditions. No SQL line-comment sequences in
 *    any statement. Lifecycle vocabulary is carried by the `SessionStatus`
 *    enum members, never string literals.
 *  - No business logic, no permission checks, no i18n or logging imports —
 *    the caller decides what `null` means.
 *
 * Dispute transitions extend the same guarded-UPDATE family: a participant
 * opens a dispute from a live state exactly once, and an admin resolves a
 * disputed row into exactly one terminal state. The CANCEL resolution
 * clears the hold marker inside its guarded UPDATE and leaves the
 * provenance lane intact — the same-lane refund that completes the
 * arbitration is the CALLER's follow-up write on the same transaction
 * (the identical shape `cancelSession` composes), driven by the returned
 * row's recorded lane.
 */

import { and, count, desc, eq, isNotNull, or, type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, queryDb } from "@/backend/db";
import { session } from "@/backend/db/schema/classes/session";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import type {
  DBTransaction,
  SessionInsertType,
  SessionListFilterInput,
  SessionSelectType,
  SessionTransitionProbeRowType,
} from "@/backend/types";

/**
 * The participant columns of `session` — both reference the shared
 * `users.id` PK and carry the identical Drizzle column type (an integer FK
 * onto `users.id`), so one representative column type covers either side.
 * Method entry points pass the schema column object itself (`studentId` or
 * `teacherId`), so the owner side is a closed in-code decision, never
 * caller input.
 */
type SessionOwnerColumn = typeof session.studentId;

/** Column alias list for standalone reads — mirrors `$inferSelect` typing 1:1. */
const SESSION_SELECT_COLUMNS = `
  id, teacher_id AS "teacherId", student_id AS "studentId", status,
  session_type AS "sessionType", intent, fee, fee_held AS "feeHeld",
  held_balance_lane AS "heldBalanceLane", started_at AS "startedAt",
  ended_at AS "endedAt", confirmed_by_student_at AS "confirmedByStudentAt",
  confirmed_by_teacher_at AS "confirmedByTeacherAt",
  confirmation_deadline AS "confirmationDeadline",
  cancel_reason AS "cancelReason", dispute_reason AS "disputeReason",
  disputed_at AS "disputedAt", resolution_note AS "resolutionNote",
  resolved_at AS "resolvedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Stateless renderer used to translate the shared predicate into standalone-read SQL. */
const participantDialect = new PgDialect();

/**
 * ONE module-scope predicate builder shared by every participant read
 * (list + count, transactional + standalone branches): the owner equality
 * plus, only when a status filter is provided, the lifecycle-state
 * equality. `null`/absent filters drop out (they never error). The status
 * vocabulary flows as a bound parameter from the `SessionStatus` enum, so
 * the filtered set the list pages over and the set the count totals are
 * decided by exactly this one function — `totalCount` can never diverge
 * from the list.
 */
function buildParticipantPredicate(
  ownerColumn: SessionOwnerColumn,
  ownerId: number,
  filter: SessionListFilterInput
): SQL {
  const conditions: SQL[] = [eq(ownerColumn, ownerId)];
  const statusFilter = filter.status ?? undefined;
  if (statusFilter !== undefined) {
    conditions.push(eq(session.status, statusFilter));
  }
  return sql.join(conditions, sql` and `);
}

/**
 * Participant list read shared by `listForStudent`/`listForTeacher`. Newest
 * first (`created_at DESC`), with `id DESC` as the deterministic tiebreak
 * for rows created in the same instant; page window via bound LIMIT/OFFSET
 * (an offset past the end yields zero rows — the count stays honest).
 */
async function listParticipantSessions(
  ownerColumn: SessionOwnerColumn,
  ownerId: number,
  filter: SessionListFilterInput,
  limit: number,
  offset: number,
  tx?: DBTransaction
): Promise<SessionSelectType[]> {
  if (tx) {
    return tx
      .select()
      .from(session)
      .where(buildParticipantPredicate(ownerColumn, ownerId, filter))
      .orderBy(desc(session.createdAt), desc(session.id))
      .limit(limit)
      .offset(offset);
  }
  // Standalone read — the shared predicate is rendered to parameterized SQL
  // (placeholders $1…) and executed via the queryDb pool path.
  const rendered = participantDialect.sqlToQuery(buildParticipantPredicate(ownerColumn, ownerId, filter));
  const result = await queryDb<SessionSelectType>(
    `SELECT ${SESSION_SELECT_COLUMNS}
     FROM session
     WHERE ${rendered.sql}
     ORDER BY created_at DESC, id DESC
     LIMIT $${rendered.params.length + 1} OFFSET $${rendered.params.length + 2}`,
    [...rendered.params, limit, offset]
  );
  return result.rows;
}

/**
 * Participant count read shared by `countForStudent`/`countForTeacher` —
 * consumes the SAME predicate builder as the list, so the total always
 * describes the exact filtered set.
 */
async function countParticipantSessions(
  ownerColumn: SessionOwnerColumn,
  ownerId: number,
  filter: SessionListFilterInput,
  tx?: DBTransaction
): Promise<number> {
  if (tx) {
    const rows = await tx
      .select({ value: count() })
      .from(session)
      .where(buildParticipantPredicate(ownerColumn, ownerId, filter));
    return rows[0]?.value ?? 0;
  }
  const rendered = participantDialect.sqlToQuery(buildParticipantPredicate(ownerColumn, ownerId, filter));
  const result = await queryDb<{ value: string }>(`SELECT count(*) AS "value" FROM session WHERE ${rendered.sql}`, [
    ...rendered.params,
  ]);
  return Number(result.rows[0]?.value ?? 0);
}

/**
 * ONE module-scope predicate builder for the admin arbitration read: the
 * status-first pinned membership on the disputed lifecycle state. The
 * disputed rows are the arbitration work queue — no owner equality exists
 * on this predicate (the admin surface is role-gated upstream, not
 * owner-scoped), and no filter input participates: the caller (service)
 * narrows contradictory filter requests out before this read is reached,
 * so the list and the count always describe one identical set.
 */
function buildAdminDisputedPredicate(): SQL {
  return eq(session.status, SessionStatus.Disputed);
}

export namespace SessionRepository {
  /**
   * Inserts one `session` row and returns it (`INSERT … RETURNING`).
   *
   * The caller (session creation flow) supplies every server-controlled
   * column: the participant ids resolved from locked identities, the
   * lifecycle/type/intent vocabulary, the platform fee (a decimal string
   * carried verbatim — no arithmetic), the escrow hold marker and its
   * provenance lane, and the confirmation deadline. Schema defaults fill
   * anything the caller legitimately omits (lifecycle state defaults to the
   * pre-start state, the hold marker to false).
   *
   * @returns The inserted row with all server-generated columns populated.
   */
  export async function insertSession(insert: SessionInsertType, tx?: DBTransaction): Promise<SessionSelectType> {
    const executor = tx ?? db;
    const [row] = await executor.insert(session).values(insert).returning();
    if (!row) {
      throw new Error("SessionRepository.insertSession: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds a session row by primary key.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle select;
   * standalone it runs as raw parameterized SQL via `queryDb`.
   *
   * @returns The matching session row, or `null` when the id is unknown.
   *          Participant-scoping (returning null for non-participants) is
   *          the read service's decision — this method is the raw PK read.
   */
  export async function findById(id: number, tx?: DBTransaction): Promise<SessionSelectType | null> {
    if (tx) {
      const rows = await tx.select().from(session).where(eq(session.id, id)).limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<SessionSelectType>(
      `SELECT ${SESSION_SELECT_COLUMNS}
       FROM session WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Starts a session exactly once: a single guarded UPDATE whose predicate
   * requires row identity, the owning teacher, and the pre-start state.
   * Writes the start stamp and the audit stamp from one captured instant.
   * The confirmation deadline is deliberately NOT in the SET clause — it is
   * written at creation and never re-armed by any transition.
   *
   * @returns The updated row, or `null` when zero rows matched (unknown id,
   *          non-owner teacher, or the row is no longer in the pre-start
   *          state — the caller classifies via the transition probe).
   */
  export async function startSessionOnce(
    id: number,
    teacherId: number,
    tx?: DBTransaction
  ): Promise<SessionSelectType | null> {
    const now = new Date();
    const executor = tx ?? db;
    const rows = await executor
      .update(session)
      .set({ status: SessionStatus.Started, startedAt: now, updatedAt: now })
      .where(and(eq(session.id, id), eq(session.teacherId, teacherId), eq(session.status, SessionStatus.Scheduled)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Completes a session exactly once: a single guarded UPDATE whose
   * predicate fuses the ownership/state conditions with the certification
   * re-assertion — an `EXISTS (SELECT 1 FROM teacher …)` subquery evaluated
   * inside the same statement, so a teacher decertified between booking and
   * completion can never complete (zero rows match; no separate read exists
   * to race against). Writes the end stamp, the teacher confirmation stamp,
   * and the audit stamp from one captured instant. Report/homework side
   * effects are deliberately absent — this method touches ONLY the session
   * row.
   *
   * @returns The updated row, or `null` when zero rows matched (unknown id,
   *          non-owner, wrong state, or the owning teacher no longer holds a
   *          strictly-true certification — the caller classifies via the
   *          transition probe).
   */
  export async function completeSessionOnce(
    id: number,
    teacherId: number,
    tx?: DBTransaction
  ): Promise<SessionSelectType | null> {
    const now = new Date();
    const executor = tx ?? db;
    const rows = await executor
      .update(session)
      .set({ status: SessionStatus.Completed, endedAt: now, confirmedByTeacherAt: now, updatedAt: now })
      .where(
        and(
          eq(session.id, id),
          eq(session.teacherId, teacherId),
          eq(session.status, SessionStatus.Started),
          sql`EXISTS (SELECT 1 FROM ${teacher} WHERE ${eq(teacher.id, session.teacherId)} AND ${eq(teacher.isApproved, true)})`
        )
      )
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Cancels a session exactly once, callable by EITHER participant: a
   * single guarded UPDATE whose predicate requires row identity, the caller
   * being the session's student OR its teacher, and the lifecycle state
   * still being cancellable (pre-start or in-progress — completed and
   * cancelled rows are structurally unreachable, so a double cancel can
   * never double-release the held fee). Clears the escrow hold marker;
   * keeps the start stamp as-is and never writes an end stamp for a
   * cancellation. The trimmed cancellation reason is persisted inside this
   * same guarded statement (NULL when the caller supplied none — no
   * behavior change to the predicate or stamps). The held-fee refund to
   * the funding lane is the caller's follow-up write inside the same
   * transaction, driven by the returned row's provenance lane.
   *
   * @returns The updated row, or `null` when zero rows matched (unknown id,
   *          non-participant caller, or the row already reached a terminal
   *          state — the caller classifies via the transition probe).
   */
  export async function cancelSessionOnce(
    id: number,
    participantId: number,
    cancelReason: string | null,
    tx?: DBTransaction
  ): Promise<SessionSelectType | null> {
    const now = new Date();
    const executor = tx ?? db;
    const rows = await executor
      .update(session)
      .set({ status: SessionStatus.Cancelled, feeHeld: false, cancelReason, updatedAt: now })
      .where(
        and(
          eq(session.id, id),
          or(eq(session.studentId, participantId), eq(session.teacherId, participantId)),
          or(eq(session.status, SessionStatus.Scheduled), eq(session.status, SessionStatus.Started))
        )
      )
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Opens a dispute exactly once, callable by EITHER participant: a single
   * guarded UPDATE whose predicate requires row identity, the caller being
   * the session's student OR its teacher, and the lifecycle state still
   * live (pre-start or in-progress — terminal rows and already-disputed
   * rows are structurally unreachable, so a double dispute can never
   * rewrite a recorded reason). Writes the dispute reason and the dispute
   * stamp from one captured instant. The escrow hold is deliberately
   * untouched — the hold money stays frozen until the admin resolution
   * releases or consumes it.
   *
   * @returns The updated row, or `null` when zero rows matched (unknown id,
   *          non-participant caller, or the row is not in a live state —
   *          the caller classifies via the transition probe).
   */
  export async function openDisputeOnce(
    id: number,
    participantId: number,
    disputeReason: string,
    tx?: DBTransaction
  ): Promise<SessionSelectType | null> {
    const now = new Date();
    const executor = tx ?? db;
    const rows = await executor
      .update(session)
      .set({ status: SessionStatus.Disputed, disputeReason, disputedAt: now, updatedAt: now })
      .where(
        and(
          eq(session.id, id),
          or(eq(session.studentId, participantId), eq(session.teacherId, participantId)),
          or(eq(session.status, SessionStatus.Scheduled), eq(session.status, SessionStatus.Started))
        )
      )
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Resolves a disputed session into `cancelled` exactly once (the admin
   * arbitration CANCEL outcome): a single guarded UPDATE whose predicate
   * requires row identity and the disputed state — a row in any other
   * state is structurally unreachable, so a resolution can never run
   * twice. Writes the resolution note and stamp from one captured instant
   * and clears the escrow hold marker inside the same statement, keeping
   * the provenance lane intact for the caller's same-lane refund — the
   * refund and the status flip land in ONE transaction only because the
   * caller composes them there (the identical shape `cancelSessionOnce`
   * leaves behind).
   *
   * @returns The updated row, or `null` when zero rows matched (unknown id
   *          or a row no longer disputed — the caller classifies via the
   *          transition probe).
   */
  export async function resolveDisputeCancelOnce(
    id: number,
    resolutionNote: string | null,
    tx?: DBTransaction
  ): Promise<SessionSelectType | null> {
    const now = new Date();
    const executor = tx ?? db;
    const rows = await executor
      .update(session)
      .set({ status: SessionStatus.Cancelled, feeHeld: false, resolutionNote, resolvedAt: now, updatedAt: now })
      .where(and(eq(session.id, id), eq(session.status, SessionStatus.Disputed)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Resolves a disputed session into `completed` exactly once (the admin
   * arbitration COMPLETE outcome): a single guarded UPDATE whose predicate
   * requires row identity, the disputed state, AND a written start stamp —
   * a dispute on a session that never started is structurally unreachable
   * here (the caller pre-validates that shape before this write, and the
   * fused `IS NOT NULL` predicate keeps the statement self-sufficient
   * under races). Writes the end stamp, resolution note and stamp from one
   * captured instant and consumes the hold (`fee_held = false`) in the
   * same statement — no credit write is part of this method (the escrow
   * hold is consumed, never reimbursed; the credit flow is a later
   * ticket's concern).
   *
   * @returns The updated row, or `null` when zero rows matched (unknown
   *          id, a row no longer disputed, or a disputed row without a
   *          start stamp — the caller classifies via the transition
   *          probe).
   */
  export async function resolveDisputeCompleteOnce(
    id: number,
    resolutionNote: string | null,
    tx?: DBTransaction
  ): Promise<SessionSelectType | null> {
    const now = new Date();
    const executor = tx ?? db;
    const rows = await executor
      .update(session)
      .set({
        status: SessionStatus.Completed,
        feeHeld: false,
        endedAt: now,
        resolutionNote,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(and(eq(session.id, id), eq(session.status, SessionStatus.Disputed), isNotNull(session.startedAt)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Cold-path probe: reads the minimal classification projection (identity
   * + lifecycle state + both participants + the start stamp) for a session
   * id. Used ONLY AFTER a guarded transition matched zero rows (or, for
   * the arbitration COMPLETE outcome, BEFORE the guarded write) to
   * distinguish an unknown id from a non-participant caller from a
   * wrong-state row from a never-started dispute; the probe is
   * classification-only — it never gates or influences any write.
   *
   * @returns The five-column projection, or `null` when the id is unknown.
   */
  export async function findTransitionProbe(
    id: number,
    tx?: DBTransaction
  ): Promise<SessionTransitionProbeRowType | null> {
    const projection = {
      id: session.id,
      status: session.status,
      studentId: session.studentId,
      teacherId: session.teacherId,
      startedAt: session.startedAt,
    };
    if (tx) {
      const rows = await tx.select(projection).from(session).where(eq(session.id, id)).limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<SessionTransitionProbeRowType>(
      `SELECT id, status, student_id AS "studentId", teacher_id AS "teacherId",
              started_at AS "startedAt"
       FROM session WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Lists the student's own sessions, newest first, paged. Consumes the
   * shared module-scope predicate builder together with
   * `countForStudent`, so the page window and the honest total describe the
   * same filtered set.
   *
   * @returns The page rows (an empty array when the window falls past the
   *          end — the count companion still reports the true total).
   */
  export async function listForStudent(
    studentId: number,
    filter: SessionListFilterInput,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<SessionSelectType[]> {
    return listParticipantSessions(session.studentId, studentId, filter, limit, offset, tx);
  }

  /**
   * Lists the teacher's own sessions — the teacher-side twin of
   * `listForStudent`, identical ordering/paging/filter semantics over the
   * owning-teacher predicate.
   */
  export async function listForTeacher(
    teacherId: number,
    filter: SessionListFilterInput,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<SessionSelectType[]> {
    return listParticipantSessions(session.teacherId, teacherId, filter, limit, offset, tx);
  }

  /**
   * Counts the student's own sessions under the SAME filter semantics as
   * `listForStudent` (one shared predicate builder) — the honest total for
   * the paginated read.
   */
  export async function countForStudent(
    studentId: number,
    filter: SessionListFilterInput,
    tx?: DBTransaction
  ): Promise<number> {
    return countParticipantSessions(session.studentId, studentId, filter, tx);
  }

  /**
   * Counts the teacher's own sessions — the teacher-side twin of
   * `countForStudent`, same shared predicate builder.
   */
  export async function countForTeacher(
    teacherId: number,
    filter: SessionListFilterInput,
    tx?: DBTransaction
  ): Promise<number> {
    return countParticipantSessions(session.teacherId, teacherId, filter, tx);
  }

  /**
   * Lists the disputed sessions (the admin arbitration work queue), newest
   * first, paged. Consumes the ONE status-first admin predicate together
   * with `countAdminDisputed`, so the page window and the honest total
   * describe the same filtered set. No owner equality exists on this read
   * — the admin surface is role-gated upstream, and ownership scoping is
   * the participant lists' job.
   *
   * @returns The page rows (an empty array when the window falls past the
   *          end — the count companion still reports the true total).
   */
  export async function listAdminDisputed(
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<SessionSelectType[]> {
    if (tx) {
      return tx
        .select()
        .from(session)
        .where(buildAdminDisputedPredicate())
        .orderBy(desc(session.createdAt), desc(session.id))
        .limit(limit)
        .offset(offset);
    }
    // Standalone read — the shared predicate is rendered to parameterized
    // SQL (placeholders $1…) and executed via the queryDb pool path.
    const rendered = participantDialect.sqlToQuery(buildAdminDisputedPredicate());
    const result = await queryDb<SessionSelectType>(
      `SELECT ${SESSION_SELECT_COLUMNS}
       FROM session
       WHERE ${rendered.sql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${rendered.params.length + 1} OFFSET $${rendered.params.length + 2}`,
      [...rendered.params, limit, offset]
    );
    return result.rows;
  }

  /**
   * Counts the disputed sessions under the SAME status-first predicate as
   * `listAdminDisputed` — the honest total for the paginated arbitration
   * read.
   */
  export async function countAdminDisputed(tx?: DBTransaction): Promise<number> {
    if (tx) {
      const rows = await tx.select({ value: count() }).from(session).where(buildAdminDisputedPredicate());
      return rows[0]?.value ?? 0;
    }
    const rendered = participantDialect.sqlToQuery(buildAdminDisputedPredicate());
    const result = await queryDb<{ value: string }>(`SELECT count(*) AS "value" FROM session WHERE ${rendered.sql}`, [
      ...rendered.params,
    ]);
    return Number(result.rows[0]?.value ?? 0);
  }
}
