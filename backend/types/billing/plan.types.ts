import type { plans } from "@/backend/db/schema/billing/plans";

export type PlanSelectType = typeof plans.$inferSelect;
export type PlanInsertType = typeof plans.$inferInsert;
export type PlanReturnType = typeof plans.$inferSelect;

export interface PlanSubmitInput {
  readonly title: string;
  readonly sessionCount: number;
  readonly price: string;
  readonly currency: string;
  readonly intervalDays: number;
}

export type PlanUpdateInput = Partial<PlanSubmitInput>;
