import type { evaluations } from "@/backend/db/schema/teachers/evaluations";

export type EvaluationSelectType = typeof evaluations.$inferSelect;
