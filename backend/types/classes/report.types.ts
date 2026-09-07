import type { reports } from "@/backend/db/schema/classes/reports";

export type ReportSelectType = typeof reports.$inferSelect;
