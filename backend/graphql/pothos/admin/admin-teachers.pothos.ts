/**
 * Admin teacher-directory GraphQL objects + filter input — the read surface
 * over the `teacher` role-child rows joined to their `users` accounts.
 *
 * Every shape is backed by a canonical type from `backend/types/admin/`:
 *  - `AdminTeacherItem` ← `AdminTeacherItemReturnType` (one directory row)
 *  - `AdminTeacherPage` ← `AdminTeacherPageReturnType` (embedded envelope)
 *  - `AdminTeacherExportEnvelope` ← `AdminTeacherExportEnvelopeReturnType`
 *    (export-all envelope behind `adminTeachersExport` — reuses
 *    `AdminTeacherItem` for its rows, NO new row type)
 *  - `AdminTeacherFiltersInput` — closed four-member filter whitelist whose
 *    members map 1:1 onto `AdminTeacherFiltersSubmitInput` (the resolver
 *    copies them field-by-field; nothing else crosses the boundary).
 *
 * Per `backend/graphql/pothos/AGENTS.md`:
 *  - NO local type definitions — all shapes come from `@/backend/types`.
 *  - `id` is exposed FIRST (Int) so Apollo cache normalization keys
 *    consistently; the page wrapper is a deliberate embedded value object
 *    with NO `id` (the normalizable entities are the rows inside `items`).
 *  - Timestamps ride the shared `DateTime` scalar (ISO-8601 UTC
 *    serialization) — no hand-rolled `toISOString()` presentation layer.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import type {
  AdminTeacherExportEnvelopeReturnType,
  AdminTeacherItemReturnType,
  AdminTeacherPageReturnType,
} from "@/backend/types";

/**
 * `AdminTeacherItem` — one directory row: the safe `users` columns plus the
 * `teacher` certification headline. `averageRating` is projected from the
 * decimal(3,2) column as a float (`null` when unrated); `subjects` is the
 * defensively-parsed JSON array (a corrupt payload degrades to an empty
 * list, never a resolver error). Governance flags mirror the
 * `AdminUserListItem` projection (null-coalesced to `false` at the mapper
 * layer).
 */
const AdminTeacherItemPothosObject = gqlSchemaBuilder
  .objectRef<AdminTeacherItemReturnType>("AdminTeacherItem")
  .implement({
    fields: t => ({
      id: t.exposeInt("id"),
      name: t.exposeString("name"),
      email: t.exposeString("email"),
      phone: t.exposeString("phone", { nullable: true }),
      country: t.exposeString("country", { nullable: true }),
      isApproved: t.exposeBoolean("isApproved"),
      isEvaluator: t.exposeBoolean("isEvaluator"),
      averageRating: t.exposeFloat("averageRating", { nullable: true }),
      isOnline: t.exposeBoolean("isOnline"),
      subjects: t.field({
        type: ["String"],
        resolve: parent => [...parent.subjects],
      }),
      isDeleted: t.field({ type: "Boolean", resolve: parent => parent.isDeleted }),
      suspended: t.field({ type: "Boolean", resolve: parent => parent.suspended }),
      isBlocked: t.field({ type: "Boolean", resolve: parent => parent.isBlocked }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
    }),
  });

/**
 * `AdminTeacherPage` — paginated directory envelope. Echoes `page` +
 * `pageSize` so callers can normalize client-side pagination state;
 * `pageCount` is the ceiling division of `total` over `pageSize`. An
 * out-of-range page yields an empty `items` array with the honest `total`
 * (never clamped, never an error). Embedded wrapper — NO `id` field.
 */
export const AdminTeacherPagePothosObject = gqlSchemaBuilder
  .objectRef<AdminTeacherPageReturnType>("AdminTeacherPage")
  .implement({
    fields: t => ({
      items: t.field({
        type: [AdminTeacherItemPothosObject],
        resolve: parent => parent.items,
      }),
      total: t.exposeInt("total"),
      page: t.exposeInt("page"),
      pageSize: t.exposeInt("pageSize"),
      pageCount: t.exposeInt("pageCount"),
    }),
  });

/**
 * `AdminTeacherExportEnvelope` — export-all envelope behind
 * `adminTeachersExport`. `rows` reuses the `AdminTeacherItem` row shape
 * (the exact objects the listing query returns per item — no new row
 * type), bounded to the first 1000 filtered rows in the listing's default
 * ordering; `total` is the FULL filtered row count (the count the listing
 * would report across all pages); `truncated` is the honest cap flag
 * (`true` exactly when `total > rows.length`). NO pagination arguments
 * feed this envelope. Embedded wrapper — NO `id` field.
 */
export const AdminTeacherExportEnvelopePothosObject = gqlSchemaBuilder
  .objectRef<AdminTeacherExportEnvelopeReturnType>("AdminTeacherExportEnvelope")
  .implement({
    fields: t => ({
      rows: t.field({
        type: [AdminTeacherItemPothosObject],
        resolve: parent => [...parent.rows],
      }),
      total: t.exposeInt("total"),
      truncated: t.exposeBoolean("truncated"),
    }),
  });

/**
 * `AdminTeacherFiltersInput` — independent ANDed filters for the teacher
 * directory listing, all optional (absent or `null` members drop out at
 * the service layer). `approval` models the two-state `is_approved` flag
 * as a nullable Boolean (`true` → approved only, `false` → pending only,
 * absent → all). Closed whitelist: any smuggled field dies as a GraphQL
 * validation failure before a resolver ever runs (BOPLA).
 */
export const AdminTeacherFiltersInput = gqlSchemaBuilder.inputType("AdminTeacherFiltersInput", {
  fields: t => ({
    search: t.string({ required: false }),
    approval: t.boolean({ required: false }),
    online: t.boolean({ required: false }),
    evaluator: t.boolean({ required: false }),
  }),
});
