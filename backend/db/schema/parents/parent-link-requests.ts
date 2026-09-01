import { sql } from "drizzle-orm";
import { index, integer, pgTable, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { linkStatus } from "@/backend/db/schema/enums";
import { students } from "@/backend/db/schema/students/students";
import { users } from "@/backend/db/schema/users/users";

/**
 * Parent→student link request history (`parent_link_requests`).
 *
 * Append-and-transition rows: a request starts as `pending` and moves through
 * the `link_status` lifecycle (confirmed / rejected / expired); production
 * flows never delete rows, so the table doubles as the pair's request history.
 * Both foreign keys are `ON DELETE RESTRICT` — a request row is durable
 * history that must outlive role-table bookkeeping (teardown code deletes
 * request rows BEFORE users/students for the same reason).
 *
 * The partial unique index admits at most ONE live `pending` request per
 * (parent, student) pair while still allowing a fresh request after the
 * previous one was rejected/expired — it is the final arbiter against
 * duplicate-pending rows under concurrent creation (the losing insert
 * surfaces as a 23505 unique violation). It is declared as a UNIQUE INDEX
 * (`uniqueIndex(...).where(...)`), NOT a table unique constraint: PostgreSQL
 * unique constraints cannot carry a WHERE predicate, while unique indexes
 * can, so the constraint-builder chain (`unique(...).on(...)`) is not an
 * option for a partial rule.
 *
 * `expiresAt` is application-written (`createdAt` + 7 days), never
 * default-computed: liveness is decided by strict `expiresAt > now`, and the
 * transition to `expired` is materialized lazily at the first write
 * interaction (guarded UPDATE), so DB defaults would lie about intent.
 */
export const parentLinkRequests = pgTable(
  "parent_link_requests",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    parentId: integer("parent_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    status: linkStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    respondedAt: timestamp("responded_at"),
  },
  t => [
    index("parent_link_requests_parent_id_idx").on(t.parentId),
    index("parent_link_requests_student_id_idx").on(t.studentId),
    uniqueIndex("parent_link_requests_pending_pair_unique")
      .on(t.parentId, t.studentId)
      .where(sql`${t.status} = 'pending'`),
  ]
);
