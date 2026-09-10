/**
 * SessionReportPothosObject — the single canonical GraphQL object type for a
 * post-session teacher report row.
 *
 * Single Canonical Object Type Pattern (`backend/graphql/AGENTS.md`):
 *  - Backed EXCLUSIVELY by the canonical `ReportReturnType` from
 *    `@/backend/types` (the `reports` table's derived select row) — no local
 *    type definitions here. There is NO business logic in this module.
 *  - `SessionReport` exposes `id` FIRST (Apollo cache normalization), then
 *    the session join id, the teacher-authored content, and the row stamps.
 *  - Every `reports` column is consumer-safe by construction (the row has no
 *    `teacher_id`; the teacher identity is reached through the session), so
 *    the full column set is exposed and nothing else.
 *
 * Timestamps use the `DateTime` scalar (registered in
 * `shared/scalar.pothos.ts`, backed by `DateTimeResolver` from
 * `graphql-scalars`): `Date` on the canonical shape, ISO-8601 UTC on the
 * wire — never a manual `toISOString()`-into-String workaround.
 *
 * Consumed by the session-report query/mutation resolver modules, whose
 * imports transitively register the type through the `gqlSchema.ts`
 * side-effect chain.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import type { ReportReturnType } from "@/backend/types";

/**
 * The canonical `SessionReport` GraphQL object. Producers return
 * `ReportReturnType` (the reports table's derived select row). Field order:
 * `id` first (Apollo cache normalization), session join, teacher content,
 * then row timestamps.
 */
export const SessionReportPothosObject = gqlSchemaBuilder.objectRef<ReportReturnType>("SessionReport").implement({
  fields: t => ({
    // ID FIRST — Apollo cache normalization requires `id` on every
    // entity-shaped object (identity PK, surfaced as GraphQL `ID!`).
    id: t.exposeID("id"),
    // The one-to-one session join id (UNIQUE column) — `Int!`.
    sessionId: t.exposeInt("sessionId"),
    // Teacher-authored notes — `String!` on the wire. The DB column is
    // nullable (Drizzle types it `string | null`), but the producing service
    // validates the notes as a non-empty trimmed string pre-DB, so every row
    // written through the submission flow carries a non-null value; null
    // resolves to the empty string at the GraphQL layer (mirrors the
    // governance-boolean precedent on the User object).
    teacherNotes: t.string({
      resolve: parent => parent.teacherNotes ?? "",
    }),
    // Teacher's student rating — `Int!` on the wire (the CHECK constrains
    // it to [0, 5]). Same nullable-column rationale as `teacherNotes`: the
    // service validates the rating pre-DB, so null (a legacy/backstop shape)
    // resolves to 0 at the GraphQL layer.
    studentRatingByTeacher: t.int({
      resolve: parent => parent.studentRatingByTeacher ?? 0,
    }),
    // Row timestamps — NOT NULL columns, non-nullable `DateTime!`.
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
