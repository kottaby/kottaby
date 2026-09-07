import type { teacher } from "@/backend/db/schema/teachers/teacher";

export type TeacherSelectType = typeof teacher.$inferSelect;

export interface TeacherColdStartCertificationInput {
  readonly userId: number;
  readonly makeEvaluator: boolean;
}
