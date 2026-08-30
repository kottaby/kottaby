/**
 * Shared transaction-scoping helper for service flows.
 *
 * Runs `fn` inside a database transaction. If `outerTx` is provided (test
 * path), opens a SAVEPOINT on the outer transaction — failures roll back only
 * the savepoint, leaving the outer transaction usable for further queries. If
 * `outerTx` is undefined (production path), opens a new top-level
 * `db.transaction`.
 *
 * Every service flow that composes multiple repository writes scopes its work
 * through this helper so `runInRollback` test isolation and production
 * atomicity share one implementation.
 */
import { db } from "@/backend/db";
import type { DBTransaction } from "@/backend/types";

export async function withTransaction<T>(
  outerTx: DBTransaction | undefined,
  fn: (tx: DBTransaction) => Promise<T>
): Promise<T> {
  if (outerTx) {
    return outerTx.transaction(fn);
  }
  return db.transaction(fn);
}
