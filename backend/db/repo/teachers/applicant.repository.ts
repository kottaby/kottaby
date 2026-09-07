/**
 * ApplicantRepository — data-access layer for the `applicants` table.
 *
 * The `applicants` row shares its PK with `users.id` (FK ON DELETE CASCADE)
 * and tracks the teacher-applicant verification pipeline:
 *  - `status` defaults to `'pending'` (varchar, schema-enforced).
 *  - `verification_attempts` defaults to `0`.
 *  - `last_attempt_at` and `cooldown_until` are NULL at registration.
 *
 * A `teacher` row is NOT created here — that only happens after the applicant
 * passes evaluation, a flow owned by the applicant-lifecycle service.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - Reads use `queryDb` (raw parameterized SQL) on the non-transactional
 *    branch, mirroring `UserRepository.findByEmail` / `findById` — Neon HTTP
 *    fast path when eligible, Drizzle select inside a supplied transaction.
 *  - Writes are single statements; `recordVerificationAttempt` increments
 *    `verification_attempts` DB-side (never read-then-write) and never uses
 *    prepared statements — writes are excluded from preparation
 *    (`docs/drizzle/prepared-statements.md`).
 */
import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { db, queryDb } from "@/backend/db";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { users } from "@/backend/db/schema/users/users";
import { ApplicantStatus } from "@/backend/enum";
import type { ApplicantSelectType, DBQueryExecutor, DBTransaction } from "@/backend/types";

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

/**
 * Type guard — narrows `DBQueryExecutor` to a checked-out `PoolClient`.
 *
 * A `PoolClient` (pg) carries no Drizzle cursor; its runtime fingerprint is
 * the `.release()` method that returns it to the pool. `isDBTransaction`
 * cannot recognize it (no `.select`), so without this guard a supplied
 * client would silently fall through to `queryDb` and execute on the GLOBAL
 * pool — outside the caller's session/transaction (a data-integrity hazard
 * caught in code review).
 */
function isPoolClient(tx: DBQueryExecutor): tx is PoolClient {
  return typeof tx === "object" && "release" in tx && typeof tx.release === "function";
}

/**
 * `NormalizedAdminApplicantFilters` — repo-internal filter shape for the
 * admin applicant-queue listing.
 *
 * The service layer normalizes a transport-shape
 * `AdminApplicantFiltersSubmitInput` into this structure before calling the
 * repo:
 *  - `searchPattern` is the search substring AFTER `escapeLikeWildcards`
 *    has been applied AND after the result has been wrapped as `%…%`.
 *    The repo binds this directly to its `ilike(column, pattern)`
 *    predicates — never re-escaping or re-wrapping (one canonical escape
 *    point at the service, one binding point at the repo).
 *  - `status` is the guard-validated `ApplicantStatus` member to match
 *    exactly (`null` = no constraint — the member drops out of the WHERE
 *    chain). Invalid transport values never reach the repo: the service
 *    layer rejects them with a localized `VALIDATION` error.
 */
export interface NormalizedAdminApplicantFilters {
  readonly searchPattern?: string | null;
  readonly status?: ApplicantStatus | null;
}

/**
 * `AdminApplicantDirectoryRow` — raw DB row shape returned by
 * `listDirectory` (users INNER JOIN applicants on the shared PK). The
 * nullable-with-default schema columns preserve their `| null` select
 * types; the service layer null-coalesces the booleans / attempts counter
 * / status default at projection time.
 */
export interface AdminApplicantDirectoryRow {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly country: string | null;
  readonly isDeleted: boolean | null;
  readonly suspended: boolean | null;
  readonly isBlocked: boolean | null;
  readonly status: string | null;
  readonly verificationAttempts: number | null;
  readonly lastAttemptAt: Date | null;
  readonly cooldownUntil: Date | null;
  readonly createdAt: Date;
}

/**
 * Builds the ANDed WHERE chain from the normalized applicant-directory
 * filters. Absent or null members are skipped (the directory falls back to
 * the unfiltered listing rather than erroring). The `searchPattern` is
 * bound directly to two `ilike` predicates — one over the user's full
 * name, one over the email — joined by `OR` so a single search term
 * matches either column. `status` is an exact parameterized equality over
 * the varchar column. No string interpolation; every value is
 * Drizzle-parameterized.
 */
function buildApplicantDirectoryFilterChain(filters: NormalizedAdminApplicantFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.searchPattern) {
    conditions.push(
      or(ilike(users.fullName, filters.searchPattern), ilike(users.email, filters.searchPattern)) ?? sql`false`
    );
  }
  if (filters.status !== null && filters.status !== undefined) {
    conditions.push(eq(applicants.status, filters.status));
  }
  if (conditions.length === 0) {
    return undefined;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return and(...conditions) ?? sql`true`;
}

export namespace ApplicantRepository {
  /**
   * Inserts an `applicants` row for a freshly-created user registering as a
   * teacher. Schema defaults supply `status='pending'`,
   * `verification_attempts=0`, and NULL timestamps; we pass them explicitly
   * for clarity-of-contract.
   *
   * @returns The inserted applicant row.
   */
  export async function create(userId: number, tx: DBTransaction): Promise<ApplicantSelectType> {
    const [row] = await tx
      .insert(applicants)
      .values({
        id: userId,
        status: "pending",
        verificationAttempts: 0,
        lastAttemptAt: null,
        cooldownUntil: null,
      })
      .returning();
    if (!row) {
      throw new Error("ApplicantRepository.create: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds an applicant row by its primary key (shared with `users.id`).
   *
   * Read-only — mirrors the `UserRepository.findByEmail` shape: Drizzle select
   * on the supplied transaction executor, or raw parameterized SQL via
   * `queryDb` (Neon HTTP fast path) when called outside a transaction.
   *
   * @returns The matching applicant row, or `null` if no applicant has that id.
   */
  export async function findByUserId(userId: number, tx?: DBQueryExecutor): Promise<ApplicantSelectType | null> {
    // Shared parameterized read — executed on whichever executor the caller
    // supplied (see branches below); identical column aliases in all paths.
    const readSql = `SELECT id,
            verification_attempts AS "verificationAttempts",
            last_attempt_at AS "lastAttemptAt",
            cooldown_until AS "cooldownUntil",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM applicants WHERE id = $1 LIMIT 1`;
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx.select().from(applicants).where(eq(applicants.id, userId)).limit(1);
      return rows[0] ?? null;
    }
    if (tx && isPoolClient(tx)) {
      // Session-faithful read — checked-out PoolClient: run the SAME
      // parameterized SQL on the SUPPLIED client so the read stays inside
      // the caller's session/transaction instead of escaping to the global
      // pool via `queryDb`.
      const result = await tx.query<ApplicantSelectType>(readSql, [userId]);
      return result.rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<ApplicantSelectType>(readSql, [userId]);
    return result.rows[0] ?? null;
  }

  /**
   * Records one verification attempt by atomically incrementing
   * `verification_attempts` IN PLACE (`col = col + 1` at the database — never
   * a read-then-write) and stamping `last_attempt_at` / `updated_at` to
   * `now()` in the same single UPDATE. The RETURNING clause yields the
   * post-update audit row.
   *
   * Parameterized always; no prepared statement (writes are excluded), no
   * `inArray`, no string concatenation of the id.
   *
   * @returns The updated applicant row, or `null` when zero rows matched
   *          (the service layer converts that into a NotFoundError).
   */
  export async function recordVerificationAttempt(
    userId: number,
    tx?: DBTransaction
  ): Promise<ApplicantSelectType | null> {
    // Single atomic statement fragments — DB-side column arithmetic, never an
    // application-level read-modify-write.
    const attemptIncrement = {
      verificationAttempts: sql`${applicants.verificationAttempts} + 1`,
      lastAttemptAt: sql`now()`,
      updatedAt: sql`now()`,
    };
    if (tx) {
      // Transactional write — joins the caller's atomic flow
      // (e.g. outer registration / re-application transaction).
      const [row] = await tx.update(applicants).set(attemptIncrement).where(eq(applicants.id, userId)).returning();
      return row ?? null;
    }
    // Standalone write — global db handle.
    const [row] = await db.update(applicants).set(attemptIncrement).where(eq(applicants.id, userId)).returning();
    return row ?? null;
  }

  /**
   * Lists the admin applicant directory: `applicants` rows INNER JOINed to
   * their `users` accounts on the shared PK, filtered by the normalized
   * filter chain, ordered newest-account-first (deterministic
   * `created_at DESC, id DESC` so consecutive pages never duplicate or
   * drop a row inserted mid-pagination).
   *
   * Directory filters are dynamic AND chains of scalar predicates — no
   * prepared statements (no reuse win, per repo policy), no `inArray`. The
   * search pattern arrives already escaped + `%…%`-wrapped from the service
   * layer and is bound as a Drizzle parameter; `status` is a
   * guard-validated enum member bound as an exact equality.
   *
   * Runs the page query and the same-filter `count(*)` in one round-trip
   * pair so the caller can surface an honest `total` — an out-of-range
   * page yields an empty `rows` array with the unchanged count (never an
   * error, never clamped results).
   *
   * Read-only — applicants who later receive a `teacher` row simply stop
   * appearing here (their `applicants` row may persist, but this listing
   * is the certification-queue projection, not a lifecycle authority).
   *
   * @returns The raw directory rows plus the unfiltered-by-page total (NOT
   *          the return type — the service layer maps rows →
   *          `AdminApplicantItemReturnType`).
   */
  export async function listDirectory(
    filters: NormalizedAdminApplicantFilters,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<{ rows: AdminApplicantDirectoryRow[]; total: number }> {
    const where = buildApplicantDirectoryFilterChain(filters);
    const select = {
      id: users.id,
      name: users.fullName,
      email: users.email,
      phone: users.phone,
      country: users.country,
      isDeleted: users.isDeleted,
      suspended: users.suspended,
      isBlocked: users.isBlocked,
      status: applicants.status,
      verificationAttempts: applicants.verificationAttempts,
      lastAttemptAt: applicants.lastAttemptAt,
      cooldownUntil: applicants.cooldownUntil,
      createdAt: users.createdAt,
    } as const;
    const [rows, countRows] = await Promise.all([
      (tx ?? db)
        .select(select)
        .from(applicants)
        .innerJoin(users, eq(users.id, applicants.id))
        .where(where)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(limit)
        .offset(offset),
      (tx ?? db)
        .select({ count: sql<number>`count(*)::int`.as("count") })
        .from(applicants)
        .innerJoin(users, eq(users.id, applicants.id))
        .where(where),
    ]);
    return { rows, total: countRows[0]?.count ?? 0 };
  }

  /**
   * Finalizes an applicant row upon certification: sets `status` to 'passed',
   * clears any outstanding cooldown (`cooldown_until` → NULL), and stamps
   * `updated_at` in ONE atomic UPDATE with `RETURNING id`.
   *
   * The write is unconditional on prior state — it supersedes any existing
   * status (`pending` / `in_evaluation` / `failed`) and any active cooldown,
   * matching the same supersede-on-certification semantics the applicant
   * lifecycle defines for passing evaluation. `verification_attempts` and
   * `last_attempt_at` are deliberately NOT rewritten: they form the audit
   * trail of the verification loop and must survive finalization. The row
   * itself is preserved (never deleted).
   *
   * Parameterized always; id is bound, never concatenated; no prepared
   * statement (writes are excluded — `docs/drizzle/prepared-statements.md`).
   *
   * @returns `true` when an applicant row was finalized, `false` when no row
   *          carries the given id (a certification of an applicant-less user
   *          is still valid — the caller treats `false` as signal, not error).
   */
  export async function finalizeOnCertification(userId: number, tx?: DBTransaction): Promise<boolean> {
    // Single-statement terminal write — no read-modify-write window.
    const finalizeWrite = {
      status: ApplicantStatus.Passed,
      cooldownUntil: null,
      updatedAt: sql`now()`,
    };
    if (tx) {
      // Transactional write — joins the caller's certification transaction.
      const rows = await tx
        .update(applicants)
        .set(finalizeWrite)
        .where(eq(applicants.id, userId))
        .returning({ id: applicants.id });
      return rows.length > 0;
    }
    // Standalone write — global db handle.
    const rows = await db
      .update(applicants)
      .set(finalizeWrite)
      .where(eq(applicants.id, userId))
      .returning({ id: applicants.id });
    return rows.length > 0;
  }
}
