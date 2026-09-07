import type { plans } from "@/backend/db/schema/billing/plans";
import type { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";

export type PlanSelectType = typeof plans.$inferSelect;
export type PlanInsertType = typeof plans.$inferInsert;
export type PlanReturnType = typeof plans.$inferSelect;

export interface PlanSubmitInput {
  readonly title: string;
  readonly sessionCount: number;
  readonly price: string;
  readonly currency: string;
  readonly intervalDays: number;
  /**
   * Student balance lane the plan's sessions are credited to on activation.
   * Optional so catalog rows may stay laneless; a NULL lane never falls back
   * to a guessed lane — purchase flows fail closed until a lane is set.
   */
  readonly balanceLane?: SubscriptionCreditLane | null;
}

export type PlanUpdateInput = Partial<PlanSubmitInput>;

/**
 * Options for the admin plan listing (backend/types is the canonical home —
 * service-layer type definitions are prohibited per `backend/services/AGENTS.md`).
 */
export interface PlanListForAdminOptions {
  readonly includeInactive?: boolean;
}
