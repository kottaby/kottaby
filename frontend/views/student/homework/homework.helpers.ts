/**
 * Pure presentation math for the student homework page — consumed by
 * `HomeworkContainer.tsx` and unit-tested in `homework.helpers.test.ts`.
 *
 * The summary strip's honest partition: a row is GRADED when EITHER track
 * records a grade, PENDING otherwise (no grade on either track yet). The
 * two buckets are disjoint and exhaustive — `graded + pending === total`
 * by construction, and every bucket renders even when zero (an honest
 * "0" card, never a hidden one).
 */
import type { MyHomeworkQuery_myHomework_items } from "@/frontend/graphql/generated/gql/graphql";

/** The summary-strip partition over the student's whole homework history. */
export interface HomeworkSummary {
  readonly total: number;
  readonly graded: number;
  readonly pending: number;
}

/** True when the row records a grade on at least one of its two tracks. */
function isGradedRow(row: MyHomeworkQuery_myHomework_items): boolean {
  return (row.jadid?.grade ?? null) !== null || (row.madi?.grade ?? null) !== null;
}

/**
 * Partitions the fetched rows into graded / pending. A row with both
 * tracks null ("none assigned" on the wire) still counts toward the
 * total — the row exists in the history — and lands in PENDING (nothing
 * graded on it yet).
 */
export function computeHomeworkSummary(rows: readonly MyHomeworkQuery_myHomework_items[]): HomeworkSummary {
  const graded = rows.filter(isGradedRow).length;
  return {
    total: rows.length,
    graded,
    pending: rows.length - graded,
  };
}
