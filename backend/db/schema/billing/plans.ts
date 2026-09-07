import { sql } from "drizzle-orm";
import { boolean, char, check, decimal, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { subscriptionCreditLane } from "@/backend/db/schema/enums";

/**
 * Subscription plans table (`plans`).
 *
 * Defines the catalog of subscription plans a user can purchase. Each plan
 * grants a fixed number of sessions (`session_count`, must be > 0) for a
 * fixed price (`price`, must be >= 0) in a given `currency` (default "EGP"),
 * valid for `interval_days` (must be > 0).
 *
 * `balance_lane` designates which student balance lane the plan's full
 * `session_count` is credited to on activation. It is nullable so catalog
 * rows created before a lane was chosen remain valid; purchase flows treat
 * a NULL lane as unconfigured and fail closed instead of guessing.
 *
 * CHECK constraints mirror the intended validation rules.
 */
export const plans = pgTable(
  "plans",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: varchar("title", { length: 255 }).notNull(),
    sessionCount: integer("session_count").notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EGP"),
    intervalDays: integer("interval_days").notNull(),
    balanceLane: subscriptionCreditLane("balance_lane"),
    isActive: boolean("is_active").notNull().default(true),
    deactivatedAt: timestamp("deactivated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check("plans_session_count_check", sql`${t.sessionCount} > 0`),
    check("plans_price_check", sql`${t.price} >= 0`),
    check("plans_interval_days_check", sql`${t.intervalDays} > 0`),
  ]
);
