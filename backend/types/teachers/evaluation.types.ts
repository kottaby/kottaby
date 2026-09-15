import type { evaluations } from "@/backend/db/schema/teachers/evaluations";

export type EvaluationSelectType = typeof evaluations.$inferSelect;

export type EvaluationInsertType = typeof evaluations.$inferInsert;

/**
 * GraphQL-facing read shape for an evaluation row. The soft-delete
 * internals (`isDeleted`/`deletedAt`), the free-text `notes` column, and
 * the server-managed `updatedAt` stamp stay server-side — consumers see
 * only the rated subject, the rater, the optional session join, the score,
 * and the creation instant.
 */
export type EvaluationReturnType = Omit<EvaluationSelectType, "isDeleted" | "deletedAt" | "notes" | "updatedAt">;

/**
 * Student's star input. The server converts `rating` (1..5) to the
 * persisted `score` (20..100) — conversion is the service's job, never the
 * client's.
 */
export interface EvaluationSubmitInput {
  readonly rating: number;
}
