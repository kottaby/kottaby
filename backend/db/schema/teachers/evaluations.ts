import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { session } from "@/backend/db/schema/classes/session";
import { users } from "@/backend/db/schema/users/users";

/**
 * Evaluations table (`evaluations`).
 *
 * Write-once record shared by two flows:
 *
 * 1. Applicant evaluation — a certified sheikh evaluates a teacher
 *    candidate. These records have `session_id = NULL` (the evaluation is
 *    standalone, not tied to a session).
 * 2. Student→teacher session rating — a student rates their teacher after a
 *    fully completed session. `session_id` links the rated session and
 *    `score` stores `rating × 20` (whole stars 1–5 map to 20–100 on the
 *    table's 0–100 scale). `evaluations_session_evaluator_unique` enforces
 *    at most one rating per (session, evaluator) pair — a duplicate insert
 *    is rejected by the database's unique violation rather than a
 *    pre-check. NULL `session_id` values are treated as distinct by
 *    PostgreSQL unique semantics, so applicant evaluations are unaffected.
 *
 * `evaluated_id` is the person being evaluated (cascade delete — their
 * evaluations disappear with them); `evaluator_id` is the user submitting
 * the evaluation (restrict delete — cannot remove a user who still has
 * evaluations on record). `session_id` is nullable and set to NULL on
 * session deletion (the evaluation survives as a standalone record).
 *
 * `score` is an integer in [0, 100] (nullable); 80% is the pass threshold.
 * Soft-delete is via `is_deleted`/`deleted_at` (no hard delete).
 *
 * Imports `session` from the classes domain for the nullable session link.
 */
export const evaluations = pgTable(
  "evaluations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    evaluatedId: integer("evaluated_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    evaluatorId: integer("evaluator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: integer("session_id").references(() => session.id, { onDelete: "set null" }),
    score: integer("score"),
    notes: text("notes"),
    isDeleted: boolean("is_deleted").default(false),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check("evaluations_score_check", sql`${t.score} >= 0 AND ${t.score} <= 100`),
    index("evaluations_evaluated_id_idx").on(t.evaluatedId),
    index("evaluations_evaluator_id_idx").on(t.evaluatorId),
    index("evaluations_session_id_idx").on(t.sessionId),
    unique("evaluations_session_evaluator_unique").on(t.sessionId, t.evaluatorId),
  ]
);
