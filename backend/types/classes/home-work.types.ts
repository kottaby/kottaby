import type { homeWork } from "@/backend/db/schema/classes/home-work";

export type HomeWorkSelectType = typeof homeWork.$inferSelect;
export type HomeWorkInsertType = typeof homeWork.$inferInsert;

/**
 * Canonical GraphQL/API read shape for a homework row — row-shaped, id-first
 * consumer contract, derived straight from the table's select row (identical
 * to `HomeWorkSelectType`). Both grade columns stay nullable in the read
 * shape: an assigned-but-ungraded row is a normal state, and grading happens
 * through the report submission flow, never by writing the row directly from
 * a client payload.
 */
export type HomeWorkReturnType = typeof homeWork.$inferSelect;

/**
 * Paged-list request for the teacher-scoped student homework history read.
 *
 * Both members are optional and bounded by the service layer before reaching
 * any repository: a non-positive or non-integer `page` resolves to the first
 * page; a missing or out-of-range `pageSize` resolves to the default. The
 * effective values used by the service are echoed honestly by the matching
 * `StudentHomeworkPageReturnType` shape — an out-of-range page yields an
 * empty `items` array next to the true `totalCount`, never a fabricated
 * window.
 */
export interface StudentHomeworkPageInput {
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Sanctioned list-wrapper envelope over the canonical homework object for
 * the teacher-scoped student history read. The canonical `HomeWorkReturnType`
 * is consumed unchanged — no duplicate homework projection — inside the
 * sanctioned list-wrapper envelope (`items` + honest total + page echo).
 */
export interface StudentHomeworkPageReturnType {
  readonly items: readonly HomeWorkReturnType[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}
