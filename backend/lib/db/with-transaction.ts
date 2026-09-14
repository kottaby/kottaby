/**
 * `withTransaction` — canonical transaction-context helper.
 *
 * Runs `fn` inside a transaction. If `outerTx` is provided (typically the
 * test path under `runInRollback`), opens a SAVEPOINT on the outer
 * transaction — failures roll back only the savepoint, leaving the outer
 * transaction usable for further queries. If `outerTx` is undefined (the
 * production path), opens a new top-level `db.transaction` — the
 * transaction commits or rolls back together with `fn`.
 *
 * The helper is intentionally generic so any service can compose its
 * write path through it without re-defining the SAVEPOINT-vs-top-level
 * branch — a single canonical substrate eliminates the "second truth"
 * drift pattern.
 *
 * @param outerTx  Optional outer transaction. When provided, `fn` runs
 *     inside a SAVEPOINT on the outer transaction. When undefined, `fn`
 *     runs inside a new top-level `db.transaction`.
 * @param fn       The async callback. Receives the resolved transaction
 *     handle and MAY return a value (the value flows back to the caller).
 * @param config   Optional top-level transaction configuration. Only the
 *     NEW-transaction path honors it (a SAVEPOINT inherits the outer
 *     transaction's isolation — PostgreSQL has no per-savepoint isolation).
 *     Callers whose gate + data reads must observe ONE consistent snapshot
 *     (e.g. the parent-monitoring portal's link-check-then-read pattern,
 *     which would otherwise be a TOCTOU window under READ COMMITTED) pass
 *     `{ isolationLevel: "repeatable read" }` so every statement inside the
 *     unit shares the snapshot taken by the first read. Read-only callers
 *     are safe under REPEATABLE READ (no write-write conflicts exist);
 *     write paths should keep the default READ COMMITTED.
 * @returns Whatever `fn` returns. The transaction commits (returning the
 *     value) or rolls back (propagating the thrown error) atomically.
 */
import { db } from "@/backend/db";
import type { DBTransaction } from "@/backend/types";

/** Top-level transaction configuration (a narrow, explicit allowlist). */
export interface WithTransactionConfig {
  readonly isolationLevel: "repeatable read" | "serializable";
}

export async function withTransaction<T>(
  outerTx: DBTransaction | undefined,
  fn: (tx: DBTransaction) => Promise<T>,
  config?: WithTransactionConfig
): Promise<T> {
  if (outerTx) {
    return outerTx.transaction(fn);
  }
  return config ? db.transaction(fn, { isolationLevel: config.isolationLevel }) : db.transaction(fn);
}
