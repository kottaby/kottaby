import type { admin } from "@/backend/db/schema/users/admin";

export type AdminSelectType = typeof admin.$inferSelect;
