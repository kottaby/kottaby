import { sql } from "drizzle-orm";
import { index, integer, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { plans } from "@/backend/db/schema/billing/plans";
import { paymentGateway, subscriptionStatus } from "@/backend/db/schema/enums";
import { users } from "@/backend/db/schema/users/users";

/**
 * Subscriptions table (`subscriptions`).
 *
 * A subscription is owned by a generic `user_id` (lifecycle: pending →
 * active → expired/cancelled/suspended). It links a purchaser (any role —
 * parent, teacher, or self-paying student) to a `plans` row. Offline payment
 * tracking columns (`payment_method`, `payment_reference`,
 * `payment_verified_at`) support admin-verified offline payments.
 *
 * Both FKs use `restrict` delete semantics: a user or plan with active
 * subscriptions cannot be hard-deleted until the subscriptions are resolved.
 * Indexes on `user_id` and `plan_id`.
 *
 * `payment_reference` carries the gateway-issued reference for the purchase.
 * The partial unique index (`... WHERE payment_reference IS NOT NULL`) is
 * declared as a UNIQUE INDEX, not a table constraint: PostgreSQL unique
 * constraints cannot carry a WHERE predicate. It guarantees at most one
 * subscription ever claims a given gateway reference (the losing insert
 * surfaces as a 23505 unique violation), while subscriptions that have no
 * reference yet — or offline payments recorded without one — stay exempt.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull().default("pending"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    paymentMethod: paymentGateway("payment_method"),
    paymentReference: varchar("payment_reference", { length: 255 }),
    paymentVerifiedAt: timestamp("payment_verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    index("subscriptions_user_id_idx").on(t.userId),
    index("subscriptions_plan_id_idx").on(t.planId),
    index("subscriptions_active_end_date_idx").on(t.endDate).where(sql`${t.status} = 'active'`),
    uniqueIndex("subscriptions_payment_reference_unique")
      .on(t.paymentReference)
      .where(sql`${t.paymentReference} IS NOT NULL`),
  ]
);
