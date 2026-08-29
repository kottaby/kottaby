import type { users } from "@/backend/db/schema/users/users";

export type UserSelectType = typeof users.$inferSelect;
export type UserInsertType = typeof users.$inferInsert;

/** The least-privilege purchaser summary embedded in wire shapes — never the full `users` row. */
export type UserSummary = Pick<UserSelectType, "id" | "fullName" | "email">;
