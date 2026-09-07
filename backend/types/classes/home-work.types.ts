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
