/** * StudentRepository — data-access layer for the `students` role-child table. */
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import { db, queryDb } from "@/backend/db";
import * as studentRepositoryCreditLaneImpl from "@/backend/db/repo/students/student.repository.credit-lane.helpers";
import * as studentRepositoryZeroLaneImpl from "@/backend/db/repo/students/student.repository.zero-lane.helpers";
import { students } from "@/backend/db/schema/students/students";
import { users } from "@/backend/db/schema/users/users";
import type { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import type {
  DBQueryExecutor,
  DBTransaction,
  HandshakeDiscoveryRowType,
  ParentLinkedChildReturnType,
  StudentLinkTargetRowType,
  StudentSelectType,
} from "@/backend/types";

/**
 * Frozen held-balance-lane → `students` balance-column resolution map.
 *
 * Keys are the `HeldBalanceLane` enum members themselves — never caller
 * strings — so a debit/refund statement can only ever target one of the
 * three real balance columns. The `Record<HeldBalanceLane, AnyPgColumn>`
 * annotation makes a missing enum member a compile error, and
 * `Object.freeze` blocks any runtime mutation of the resolution table.
 * The `reviews` lane is deliberately absent: it never funds held fees.
 */
const LANE_BALANCE_COLUMNS: Readonly<Record<HeldBalanceLane, AnyPgColumn>> = Object.freeze({
  [HeldBalanceLane.Trial]: students.balanceTrial,
  [HeldBalanceLane.Hifz]: students.balanceHifz,
  [HeldBalanceLane.Tajweed]: students.balanceTajweed,
});

/** Type guard — narrows `DBQueryExecutor` to `DBTransaction`. */
function isDBTransaction(tx: DBQueryExecutor): tx is DBTransaction {
  return typeof tx === "object" && "select" in tx;
}

/**
 * Aliased `users` handle for the admin student directory's parent join —
 * resolves the linked parent's display identity WITHOUT colliding with the
 * student's own `users` row in the same statement.
 */
const directoryParentUser = alias(users, "directory_parent_user");

/**
 * `NormalizedAdminStudentFilters` — repo-internal filter shape for the
 * admin student directory listing.
 *
 * The service layer normalizes a transport-shape
 * `AdminStudentFiltersSubmitInput` into this structure before calling the
 * repo:
 *  - `searchPattern` is the search substring AFTER `escapeLikeWildcards`
 *    has been applied AND after the result has been wrapped as `%…%`.
 *    The repo binds this directly to its `ilike(column, pattern)`
 *    predicates — never re-escaping or re-wrapping (one canonical escape
 *    point at the service, one binding point at the repo).
 *  - `hasParent` filters on the `parent_id` link state (`null` = no
 *    constraint — the member drops out of the WHERE chain).
 *  - `language` is the trimmed target language; the repo matches it
 *    case-insensitively (exact, parameterized) against the student's
 *    primary OR secondary language columns.
 */
export interface NormalizedAdminStudentFilters {
  readonly searchPattern?: string | null;
  readonly hasParent?: boolean | null;
  readonly language?: string | null;
}

/**
 * `AdminStudentDirectoryRow` — raw DB row shape returned by `listDirectory`
 * (users INNER JOIN students on the shared PK, LEFT JOIN users-as-parent on
 * `students.parent_id`). The nullable-with-default schema columns preserve
 * their `| null` select types; the service layer null-coalesces the
 * balances and derives the `hasParent` headline at projection time.
 */
export interface AdminStudentDirectoryRow {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly country: string | null;
  readonly balanceHifz: number | null;
  readonly balanceReviews: number | null;
  readonly balanceTajweed: number | null;
  readonly balanceTrial: number;
  readonly trialGrantedAt: Date | null;
  readonly primaryLanguage: string | null;
  readonly anotherLanguage: string | null;
  readonly parentId: number | null;
  readonly parentName: string | null;
  readonly parentEmail: string | null;
  readonly createdAt: Date;
}

/**
 * Builds the ANDed WHERE chain from the normalized student-directory
 * filters. Absent or null members are skipped (the directory falls back to
 * the unfiltered listing rather than erroring). The `searchPattern` is
 * bound directly to two `ilike` predicates — one over the user's full
 * name, one over the email — joined by `OR` so a single search term
 * matches either column. The `language` filter is a case-insensitive exact
 * match (parameterized `lower(...)` equality — never LIKE) over the
 * primary OR secondary language column. No string interpolation; every
 * value is Drizzle-parameterized.
 */
function buildStudentDirectoryFilterChain(filters: NormalizedAdminStudentFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.searchPattern) {
    conditions.push(
      or(ilike(users.fullName, filters.searchPattern), ilike(users.email, filters.searchPattern)) ?? sql`false`
    );
  }
  if (filters.hasParent !== null && filters.hasParent !== undefined) {
    conditions.push(filters.hasParent ? isNotNull(students.parentId) : isNull(students.parentId));
  }
  if (filters.language) {
    conditions.push(
      or(
        sql`lower(${students.primaryLanguage}) = lower(${filters.language})`,
        sql`lower(${students.anotherLanguage}) = lower(${filters.language})`
      ) ?? sql`false`
    );
  }
  if (conditions.length === 0) {
    return undefined;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return and(...conditions) ?? sql`true`;
}

/**
 * Shared joined projection for handshake-code lookups: the users-side
 * governance columns plus the display name, composed once and reused by both
 * public read methods (`findDiscoveryByHandshakeCode`,
 * `findLinkTargetByHandshakeCode`) — never re-derived per call site.
 */
const HANDSHAKE_GOVERNANCE_SHAPE = {
  parentId: students.parentId,
  fullName: users.fullName,
  isDeleted: users.isDeleted,
  isBlocked: users.isBlocked,
  suspended: users.suspended,
  suspendedAt: users.suspendedAt,
  suspendedPeriodDays: users.suspendedPeriodDays,
} as const;

/**
 * Shared joint reader behind BOTH handshake-code lookups: resolves the
 * student by a single parameterized equality on `handshake_code`, joining
 * `users` on the shared PK. Drizzle select on the supplied transaction, or
 * raw parameterized SQL via `queryDb` (Neon HTTP fast path) when called
 * standalone — identical column aliases on both branches.
 *
 * The ONLY predicate is the equality on `handshake_code` (`WHERE
 * s.handshake_code = $1`); no LIKE/ILIKE, no `sql` templates, no `inArray`.
 * Governance filtering is a service concern — the row is returned
 * faithfully, or `null` on miss.
 */
async function readHandshakeCodeJoinRow(code: string, tx?: DBTransaction): Promise<StudentLinkTargetRowType | null> {
  // Shared parameterized read — identical column aliases on both branches.
  const readSql = `SELECT s.id AS "studentId",
          s.parent_id AS "parentId",
          u.full_name AS "fullName",
          u.is_deleted AS "isDeleted",
          u.is_blocked AS "isBlocked",
          u.suspended,
          u.suspended_at AS "suspendedAt",
          u.suspended_period_days AS "suspendedPeriodDays"
   FROM students s
   JOIN users u ON u.id = s.id
   WHERE s.handshake_code = $1
   LIMIT 1`;
  if (tx) {
    // Transactional read — Drizzle select on the supplied executor.
    const rows = await tx
      .select({ studentId: students.id, ...HANDSHAKE_GOVERNANCE_SHAPE })
      .from(students)
      .innerJoin(users, eq(users.id, students.id))
      .where(eq(students.handshakeCode, code))
      .limit(1);
    return rows[0] ?? null;
  }
  // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
  const result = await queryDb<StudentLinkTargetRowType>(readSql, [code]);
  return result.rows[0] ?? null;
}

export namespace StudentRepository {
  /** * Inserts a `students` row for a freshly-created user during registration. */
  export async function createForRegistration(
    userId: number,
    handshakeCode: string,
    tx: DBTransaction
  ): Promise<StudentSelectType> {
    return tx.transaction(async sp => {
      const [row] = await sp
        .insert(students)
        .values({
          id: userId,
          handshakeCode,
          balanceHifz: 0,
          balanceTajweed: 0,
          balanceReviews: 0,
          parentId: null,
        })
        .returning();
      if (!row) {
        throw new Error("StudentRepository.createForRegistration: insert returned no rows");
      }
      return row;
    });
  }

  /**
   * Reads the `handshake_code` of the `students` row sharing the given user id
   * (shared PK ≡ `users.id`).
   *
   * Single-column equality read — Drizzle select on the supplied transaction,
   * or raw parameterized SQL via `queryDb` (Neon HTTP fast path) when called
   * outside a transaction. Acquires no locks (pure read).
   *
   * @returns The row's `handshakeCode`, or `null` when no `students` row has
   *          that id (the caller owns not-found handling).
   */
  export async function findHandshakeCodeByStudentId(studentId: number, tx?: DBTransaction): Promise<string | null> {
    if (tx) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx
        .select({ handshakeCode: students.handshakeCode })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      return rows[0]?.handshakeCode ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<{ handshakeCode: string }>(
      `SELECT handshake_code AS "handshakeCode" FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    return result.rows[0]?.handshakeCode ?? null;
  }

  /**
   * Discovery read for parent-side handshake-code lookup: joins `students` to
   * `users` on the shared PK and returns EXACTLY the columns the service layer
   * needs for governance evaluation, name masking and the `linkable` signal —
   * a fixed column list, never spread-driven.
   *
   * The ONLY predicate is the parameterized equality on `handshake_code`
   * (`WHERE handshake_code = $1`); no LIKE/ILIKE, no `sql` templates, no
   * `inArray`. Governance filtering (deleted/blocked/suspended) is a service
   * concern — this method returns the row faithfully, or `null` on miss.
   *
   * Implemented on top of the shared `readHandshakeCodeJoinRow` reader (which
   * also backs `findLinkTargetByHandshakeCode`); the student id fetched
   * internally is dropped here — this shape never carries the raw identity.
   *
   * @returns The joined discovery row, or `null` when no student carries that
   *          handshake code.
   */
  export async function findDiscoveryByHandshakeCode(
    code: string,
    tx?: DBTransaction
  ): Promise<HandshakeDiscoveryRowType | null> {
    const row = await readHandshakeCodeJoinRow(code, tx);
    if (!row) {
      return null;
    }
    // Exact picked shape — the raw student id is intentionally NOT part of
    // the discovery contract (the parent-facing lookup must never carry it).
    return {
      parentId: row.parentId,
      fullName: row.fullName,
      isDeleted: row.isDeleted,
      isBlocked: row.isBlocked,
      suspended: row.suspended,
      suspendedAt: row.suspendedAt,
      suspendedPeriodDays: row.suspendedPeriodDays,
    };
  }

  /**
   * Finds a `students` row by its primary key (shared with `users.id`).
   *
   * Read-only — used by the student trial provisioning service to look up the
   * current grant marker state before deciding whether to invoke the grant.
   * Accepts an optional transaction so the read can run inside a caller's
   * transaction scope; falls back to the global Drizzle handle when called
   * standalone.
   *
   * @returns The matching student row, or `null` if no student carries that id.
   */
  export async function findById(studentId: number, tx?: DBQueryExecutor): Promise<StudentSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      const rows = await tx.select().from(students).where(eq(students.id, studentId)).limit(1);
      return rows[0] ?? null;
    }
    const result = await queryDb<StudentSelectType>(
      `SELECT id, balance_hifz AS "balanceHifz", balance_reviews AS "balanceReviews",
              balance_tajweed AS "balanceTajweed", balance_trial AS "balanceTrial",
              trial_granted_at AS "trialGrantedAt",
              primary_language AS "primaryLanguage", another_language AS "anotherLanguage",
              handshake_code AS "handshakeCode", parent_id AS "parentId",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Atomically grants free trial session credits to a student exactly once.
   *
   * Single conditional UPDATE guarded by the trial_granted_at marker — predicate
   * evaluation and column mutation occur in the same SQL statement, so the
   * grant-once invariant holds with zero TOCTOU window. Returns true when the
   * grant was applied, false when the marker was already set (re-grant rejected);
   * the caller (student trial service) is responsible for surfacing a localized
   * conflict error on the false branch.
   */
  export async function grantFreeTrialOnce(
    studentId: number,
    trialCount: number,
    tx?: DBTransaction
  ): Promise<boolean> {
    const executor = tx ?? db;
    const updated = await executor
      .update(students)
      .set({
        balanceTrial: sql`${students.balanceTrial} + ${trialCount}`,
        trialGrantedAt: new Date(),
      })
      .where(and(eq(students.id, studentId), isNull(students.trialGrantedAt)))
      .returning({ id: students.id });
    return updated.length > 0;
  }

  /**
   * Server-internal joint read for the parent-link WRITE path: resolves the
   * link target by handshake code, returning the raw student id plus the
   * parent FK and the users-side governance columns the discovery exclusion
   * predicate consumes (`StudentLinkTargetRowType` — service-internal, never
   * serialized; the parent-facing payload remains `HandshakeDiscoveryRowType`
   * → `HandshakeCodeLookupReturnType` via `findDiscoveryByHandshakeCode`).
   *
   * Delegates to the shared `readHandshakeCodeJoinRow` reader (also backing
   * `findDiscoveryByHandshakeCode`): single parameterized equality on
   * `handshake_code` (no LIKE/ILIKE), dual executor branch,
   * `LIMIT 1`. Mirrors `findDiscoveryByHandshakeCode` with `s.id` added so
   * the write path can address the target row directly. Governance filtering
   * is a service concern — the row is returned faithfully, or `null` on miss.
   *
   * @returns The link-target row, or `null` when no student carries that
   *          handshake code.
   */
  export async function findLinkTargetByHandshakeCode(
    code: string,
    tx?: DBTransaction
  ): Promise<StudentLinkTargetRowType | null> {
    return readHandshakeCodeJoinRow(code, tx);
  }

  /**
   * Atomically links a parent to an UNLINKED student — ONE guarded
   * statement: `UPDATE students SET parent_id = $2, updated_at = now()
   * WHERE id = $1 AND parent_id IS NULL RETURNING *`. The `parent_id IS
   * NULL` conjunct is the guard: predicate evaluation and column mutation
   * occur in the same SQL statement, so the once-only invariant holds with
   * zero TOCTOU window (no read-then-write, no locks).
   *
   * This is THE only production writer of a non-null `students.parent_id`
   * (pinned by the static-locks suite). Requires a transaction so
   * the write joins the caller's atomic unit — in the link-request accept
   * path a lost race here (null return → conflict error) rolls back the
   * whole claim transaction, making ghost confirmations impossible.
   *
   * @returns The updated student row, or `null` when the student does not
   *          exist or already carries a `parent_id` (zero-row collapse).
   */
  export async function linkParentIfUnlinked(
    studentId: number,
    parentId: number,
    tx: DBTransaction
  ): Promise<StudentSelectType | null> {
    const [row] = await tx
      .update(students)
      .set({ parentId, updatedAt: sql`now()` })
      .where(and(eq(students.id, studentId), isNull(students.parentId)))
      .returning();
    return row ?? null;
  }

  /** lane when the lane still holds a positive balance. */
  export async function decrementLaneIfAvailable(
    studentId: number,
    lane: HeldBalanceLane,
    tx?: DBTransaction
  ): Promise<boolean> {
    const balanceColumn = LANE_BALANCE_COLUMNS[lane];
    const executor = tx ?? db;
    const result = await executor.execute<{ id: number }>(sql`
      UPDATE ${students}
      SET ${sql.identifier(balanceColumn.name)} = ${balanceColumn} - 1,
          ${sql.identifier(students.updatedAt.name)} = now()
      WHERE ${students.id} = ${studentId} AND ${balanceColumn} > 0
      RETURNING ${students.id}
    `);
    return result.rows.length > 0;
  }

  /**
   * Refunds ONE allowance unit to the student's held-balance lane
   * (unguarded `+ 1`). No upper bound exists on any lane, so the
   * `balance_* >= 0` CHECK constraints cannot trip on an increment; the
   * caller guarantees the student row exists (a refund targets the lane
   * recorded on a held session whose student FK is restrict-bound).
   *
   * Same-lane rule: the refunded lane is the caller's choice — refunds must
   * target the exact lane that funded the hold. `updated_at` is stamped
   * explicitly (raw SQL bypasses the `$onUpdate` hook), mirroring the debit
   * statement so both mutation shapes advance the row's audit timestamp.
   */
  export async function incrementLane(studentId: number, lane: HeldBalanceLane, tx?: DBTransaction): Promise<void> {
    const balanceColumn = LANE_BALANCE_COLUMNS[lane];
    const executor = tx ?? db;
    await executor.execute(sql`
      UPDATE ${students}
      SET ${sql.identifier(balanceColumn.name)} = ${balanceColumn} + 1,
          ${sql.identifier(students.updatedAt.name)} = now()
      WHERE ${students.id} = ${studentId}
    `);
  }

  /**
   * Credits `amount` session units to ONE student balance lane — the
   * activation-time write for a purchased subscription (one unguarded
   * `COALESCE(balance_<lane>, 0) + amount` UPDATE returning the updated
   * row). Implementation lives in the sibling
   * `student.repository.credit-lane.helpers.ts` module (behavior-identical
   * extraction); this method is a one-to-one delegation wrapper, so the
   * public API (name, signature, behavior) is unchanged.
   *
   * @returns The updated student row, or null when the student does not
   *   exist (the caller decides what the miss means — the repository raises
   *   nothing).
   */
  export async function creditLaneBalance(
    studentId: number,
    lane: SubscriptionCreditLane,
    amount: number,
    tx?: DBTransaction
  ): Promise<StudentSelectType | null> {
    return studentRepositoryCreditLaneImpl.creditLaneBalance(studentId, lane, amount, tx);
  }

  /** boolean for lanes-zeroed counting). */
  export async function zeroLaneIfNoCoveringSubscription(
    studentId: number,
    lane: SubscriptionCreditLane,
    tx?: DBTransaction
  ): Promise<boolean> {
    return studentRepositoryZeroLaneImpl.zeroLaneIfNoCoveringSubscription(studentId, lane, tx);
  }

  /** (`students. */
  export async function listDirectory(
    filters: NormalizedAdminStudentFilters,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<{ rows: AdminStudentDirectoryRow[]; total: number }> {
    const where = buildStudentDirectoryFilterChain(filters);
    const select = {
      id: users.id,
      name: users.fullName,
      email: users.email,
      phone: users.phone,
      country: users.country,
      balanceHifz: students.balanceHifz,
      balanceReviews: students.balanceReviews,
      balanceTajweed: students.balanceTajweed,
      balanceTrial: students.balanceTrial,
      trialGrantedAt: students.trialGrantedAt,
      primaryLanguage: students.primaryLanguage,
      anotherLanguage: students.anotherLanguage,
      parentId: students.parentId,
      parentName: directoryParentUser.fullName,
      parentEmail: directoryParentUser.email,
      createdAt: users.createdAt,
    } as const;
    const [rows, countRows] = await Promise.all([
      (tx ?? db)
        .select(select)
        .from(students)
        .innerJoin(users, eq(users.id, students.id))
        .leftJoin(directoryParentUser, eq(directoryParentUser.id, students.parentId))
        .where(where)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(limit)
        .offset(offset),
      (tx ?? db)
        .select({ count: sql<number>`count(*)::int`.as("count") })
        .from(students)
        .innerJoin(users, eq(users.id, students.id))
        .where(where),
    ]);
    return { rows, total: countRows[0]?.count ?? 0 };
  }

  /**
   * Lists the caller's confirmed-linked children, oldest-first. Soft-deleted
   * excluded — the severance predicate lives in the JOIN, never the service.
   *
   * Read-only, two executor arms (per backend/AGENTS.md "Bare Reads"): on the
   * caller's transaction it runs as a Drizzle join select; standalone it runs
   * as raw parameterized SQL via `queryDb` (the parent id rides a bound
   * parameter — the Neon-HTTP-eligible pattern, never the global Drizzle
   * handle). The raw-SQL column aliases mirror the Drizzle projection keys so
   * both arms return the identical `ParentLinkedChildReturnType` shape.
   */
  export async function listLinkedChildrenByParentId(
    parentId: number,
    tx?: DBTransaction
  ): Promise<ParentLinkedChildReturnType[]> {
    if (tx) {
      return tx
        .select({ id: students.id, fullName: users.fullName, createdAt: students.createdAt })
        .from(students)
        .innerJoin(users, eq(users.id, students.id))
        .where(and(eq(students.parentId, parentId), eq(users.isDeleted, false)))
        .orderBy(asc(students.createdAt), asc(students.id));
    }
    const result = await queryDb<{ id: number; fullName: string; createdAt: Date | string }>(
      `SELECT s.id AS id, u.full_name AS "fullName", s.created_at AS "createdAt"
       FROM students s
       INNER JOIN users u ON u.id = s.id
       WHERE s.parent_id = $1 AND u.is_deleted = false
       ORDER BY s.created_at ASC, s.id ASC`,
      [parentId]
    );
    return result.rows.map(row => ({
      id: row.id,
      fullName: row.fullName,
      createdAt: new Date(row.createdAt),
    }));
  }
}
