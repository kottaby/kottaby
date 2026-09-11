import { sql } from "drizzle-orm";
import { char, check, decimal, index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { paymentGateway, paymentStatus } from "@/backend/db/schema/enums";
import { students } from "@/backend/db/schema/students/students";

/**
 * Student payments table (`student_payments`).
 *
 * Records every payment a student makes. `subscription_id` is the ledger
 * row's FROZEN identity: once a payment points at a subscription, no UPDATE
 * may re-point it — deleting a subscription that still has ledger rows
 * raises the immutable-ledger guard (the FK's `set null` action would have
 * to UPDATE those rows, and the BEFORE UPDATE guard rejects every
 * `subscription_id` change). The nullable column + `set null` FK action are
 * therefore schema metadata only, unreachable for ledger rows; the payment
 * history never loses its subscription pointer. `amount` must be
 * non-negative (CHECK). `payment_gateway` records the channel;
 * `status` is the payment lifecycle (pending → paid → failed → refunded).
 *
 * IMMUTABLE LEDGER: DELETE is blocked entirely by a trigger, so corrections
 * are made via a new compensating payment row — never by editing or
 * removing an existing one. UPDATE is permitted for exactly one guarded
 * exception: the status decision `pending → paid | failed`, and only while
 * every financial/identity column (`student_id`, `subscription_id`,
 * `amount`, `currency`, `payment_gateway`, `created_at`) is left
 * unchanged — the `prevent_student_payments_update()` guard (amended by
 * `4-student-payments-status-transition.sql`) raises for every other
 * mutation. Decided payments are therefore terminal, and the audit trail
 * for financial reconciliation is preserved.
 *
 * Indexes on `student_id` and `subscription_id`.
 */
export const studentPayments = pgTable(
  "student_payments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EGP"),
    paymentGateway: paymentGateway("payment_gateway").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check("student_payments_amount_check", sql`${t.amount} >= 0`),
    index("student_payments_student_id_idx").on(t.studentId),
    index("student_payments_subscription_id_idx").on(t.subscriptionId),
  ]
);
