/**
 * Test utilities for DB-layer tests — transaction rollback wrapper + error
 * assertion helper.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every DB test MUST run inside `runInRollback` — no test data escapes the
 *    transaction. Pass the `tx` to EVERY repository / direct Drizzle call.
 *  - NEVER use `expect(...).rejects.toThrow()` inside `runInRollback` — it
 *    deadlocks. Use `expectRepoError` (try/catch) instead.
 *  - Type transaction parameters as `DBTransaction` — never `any`.
 */
import { sql } from "drizzle-orm";
import { db } from "@/backend/db";
import type { DBTransaction } from "@/backend/types";

export type { DBTransaction } from "@/backend/types";

/**
 * Optional configuration for {@link runInRollback}.
 */
export interface RunInRollbackOptions {
  /**
   * PostgreSQL isolation level for the test transaction, applied via a
   * first-statement `SET TRANSACTION ISOLATION LEVEL` — works identically for
   * the node-postgres CI pool and the single-process PGlite provider, and is
   * independent of Drizzle's per-driver transaction-config plumbing.
   *
   * `"repeatable read"` freezes the COMMITTED baseline into one transaction
   * snapshot for the whole test body: rows committed concurrently by other
   * test files (parallel CI workers share ONE database — e.g. committed-
   * fixture suites writing through the global executor) become invisible
   * mid-test, so GLOBAL table-count assertions stay deterministic. Writes
   * made through the test's own `tx` remain fully visible, so purity and
   * executor-identity proofs are unaffected.
   */
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
}

/** Closed-set mapping from the option value to the literal SQL fragment (never raw interpolation). */
const ISOLATION_LEVEL_SQL = {
  "read committed": sql`READ COMMITTED`,
  "repeatable read": sql`REPEATABLE READ`,
  serializable: sql`SERIALIZABLE`,
} as const;

/**
 * Runs `fn` inside a `db.transaction` that is FORCED to roll back at the end
 * (success or failure). Use this to wrap every DB test body so test data
 * never escapes to other tests or to the live DB.
 *
 * The wrapper does NOT use a savepoint — it uses a top-level transaction
 * that simply never commits. Any uncaught error inside `fn` propagates to
 * the caller (test assertion failures surface normally); the transaction
 * rolls back via Drizzle's automatic rollback on error.
 *
 * @example
 * await runInRollback(async tx => {
 *   const user = await createTestUser(tx);
 *   await SomeRepository.create(user.id, tx);
 *   // ... assertions ...
 * });
 */
export async function runInRollback<T>(
  fn: (tx: DBTransaction) => Promise<T>,
  options?: RunInRollbackOptions
): Promise<T | undefined> {
  // We deliberately throw after the test body runs to force ROLLBACK. This
  // works because Drizzle's `db.transaction` issues ROLLBACK when the
  // callback throws — even if the test body itself succeeded.
  //
  // The thrown sentinel is caught here and discarded; real test failures
  // (assertion errors thrown inside `fn`) propagate BEFORE the sentinel
  // throw, so they surface to the test runner as-is.
  const SENTINEL = Symbol("runInRollback.forceRollback");
  try {
    return await db.transaction(async tx => {
      // `SET TRANSACTION` must be the FIRST statement of the transaction —
      // issued here, before `fn` runs any query of its own.
      if (options?.isolationLevel !== undefined) {
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL ${ISOLATION_LEVEL_SQL[options.isolationLevel]}`);
      }
      await fn(tx);
      // Discard the result — the transaction will roll back, so any
      // returned DB state is invalid. Callers assert inside `fn` instead.
      throw SENTINEL;
    });
  } catch (err) {
    if (err === SENTINEL) {
      // Forced rollback succeeded — the test body completed without
      // throwing. Return undefined as the result; callers don't use the
      // return value of `runInRollback` (they assert inside `fn`).
      return undefined;
    }
    throw err;
  }
}

/**
 * Try/catch helper for asserting that a repository call rejects.
 *
 * Use this INSTEAD of `expect(...).rejects.toThrow()` inside `runInRollback`
 * — the latter deadlocks the transaction.
 *
 * @example
 * const error = await expectRepoError(() =>
 *   UserRepository.findByEmail("nonexistent@test.local", tx),
 * );
 * expect(error).toBeInstanceOf(NotFoundError);
 * expect(error.message).toContain("not found");
 *
 * @returns The caught error (asserted non-null). Caller can do
 *          `instanceof` / `.message` / `.code` checks on it.
 */
export async function expectRepoError(fn: () => Promise<unknown>): Promise<Error> {
  let errorCaught: unknown = null;
  try {
    await fn();
  } catch (error) {
    errorCaught = error;
  }
  if (errorCaught === null) {
    throw new Error("expectRepoError: expected the call to throw, but it resolved successfully");
  }
  if (errorCaught instanceof Error) {
    return errorCaught;
  }
  // Wrap non-Error throws (e.g. `throw "string"`) so callers always get an
  // `Error` instance to inspect `.message` / `.code` on. Strings are passed
  // through as the message; other types are summarized to avoid relying on
  // `Object.prototype.toString` (which yields `[object Object]`).
  const message = typeof errorCaught === "string" ? errorCaught : `[non-Error throw: ${typeof errorCaught}]`;
  return new Error(message);
}

/**
 * Extracts the PostgreSQL constraint name from a thrown query error.
 *
 * Drivers wrap `pg` errors differently across versions (some expose
 * `.constraint` directly, others nest it under `.cause`), and drizzle may add
 * its own wrapping layer — this helper checks all of those shapes and falls
 * back to scanning the message text (PG CHECK violations always mention the
 * constraint name).
 *
 * Used by constraint-proof tests to assert the SPECIFIC constraint that fired
 * (an aborted-transaction `25P02` error would otherwise be indistinguishable
 * from the intended CHECK violation).
 */
export function constraintNameOf(err: unknown): string {
  if (!(err instanceof Error)) {
    return "";
  }
  const direct = err as Error & { constraint?: unknown; cause?: unknown };
  if (typeof direct.constraint === "string") {
    return direct.constraint;
  }
  if (direct.cause instanceof Error) {
    const nested = direct.cause as Error & { constraint?: unknown };
    if (typeof nested.constraint === "string") {
      return nested.constraint;
    }
  }
  return "";
}
