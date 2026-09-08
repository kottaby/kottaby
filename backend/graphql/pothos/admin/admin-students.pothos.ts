/**
 * Admin student-directory GraphQL objects + filter input — the read surface
 * over the `students` role-child rows joined to their `users` accounts,
 * with the linked parent's display identity resolved via a left join.
 *
 * Every shape is backed by a canonical type from `backend/types/admin/`:
 *  - `AdminStudentItem` ← `AdminStudentItemReturnType` (one directory row)
 *  - `AdminStudentPage` ← `AdminStudentPageReturnType` (embedded envelope)
 *  - `AdminStudentExportEnvelope` ← `AdminStudentExportEnvelopeReturnType`
 *    (export-all envelope behind `adminStudentsExport` — reuses
 *    `AdminStudentItem` for its rows, NO new row type)
 *  - `AdminStudentFiltersInput` — closed three-member filter whitelist
 *    whose members map 1:1 onto `AdminStudentFiltersSubmitInput` (the
 *    resolver copies them field-by-field; nothing else crosses the
 *    boundary).
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
  AdminStudentExportEnvelopeReturnType,
  AdminStudentItemReturnType,
  AdminStudentPageReturnType,
} from "@/backend/types";

/**
 * `AdminStudentItem` — one directory row: the safe `users` columns plus
 * the `students` role-child projection (held-balance lanes, trial marker,
 * language preferences) plus the linked parent's display identity. Balance
 * fields are pure reads — this surface ships NO mutation that touches
 * them; `hasParent` derives from the `parent_id` link state, never from
 * caller input (`parentName` / `parentEmail` are `null` when unlinked).
 */
const AdminStudentItemPothosObject = gqlSchemaBuilder
  .objectRef<AdminStudentItemReturnType>("AdminStudentItem")
  .implement({
    fields: t => ({
      id: t.exposeInt("id"),
      name: t.exposeString("name"),
      email: t.exposeString("email"),
      phone: t.exposeString("phone", { nullable: true }),
      country: t.exposeString("country", { nullable: true }),
      balanceHifz: t.exposeInt("balanceHifz"),
      balanceReviews: t.exposeInt("balanceReviews"),
      balanceTajweed: t.exposeInt("balanceTajweed"),
      balanceTrial: t.exposeInt("balanceTrial"),
      trialGrantedAt: t.expose("trialGrantedAt", { type: "DateTime", nullable: true }),
      primaryLanguage: t.exposeString("primaryLanguage", { nullable: true }),
      anotherLanguage: t.exposeString("anotherLanguage", { nullable: true }),
      hasParent: t.exposeBoolean("hasParent"),
      parentName: t.exposeString("parentName", { nullable: true }),
      parentEmail: t.exposeString("parentEmail", { nullable: true }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
    }),
  });

/**
 * `AdminStudentPage` — paginated directory envelope. Echoes `page` +
 * `pageSize` so callers can normalize client-side pagination state;
 * `pageCount` is the ceiling division of `total` over `pageSize`. An
 * out-of-range page yields an empty `items` array with the honest `total`
 * (never clamped, never an error). Embedded wrapper — NO `id` field.
 */
export const AdminStudentPagePothosObject = gqlSchemaBuilder
  .objectRef<AdminStudentPageReturnType>("AdminStudentPage")
  .implement({
    fields: t => ({
      items: t.field({
        type: [AdminStudentItemPothosObject],
        resolve: parent => parent.items,
      }),
      total: t.exposeInt("total"),
      page: t.exposeInt("page"),
      pageSize: t.exposeInt("pageSize"),
      pageCount: t.exposeInt("pageCount"),
    }),
  });

/**
 * `AdminStudentExportEnvelope` — export-all envelope behind
 * `adminStudentsExport`. `rows` reuses the `AdminStudentItem` row shape
 * (the exact objects the listing query returns per item — no new row
 * type), bounded to the first 1000 filtered rows in the listing's default
 * ordering; `total` is the FULL filtered row count (the count the listing
 * would report across all pages); `truncated` is the honest cap flag
 * (`true` exactly when `total > rows.length`). NO pagination arguments
 * feed this envelope. Embedded wrapper — NO `id` field.
 */
export const AdminStudentExportEnvelopePothosObject = gqlSchemaBuilder
  .objectRef<AdminStudentExportEnvelopeReturnType>("AdminStudentExportEnvelope")
  .implement({
    fields: t => ({
      rows: t.field({
        type: [AdminStudentItemPothosObject],
        resolve: parent => [...parent.rows],
      }),
      total: t.exposeInt("total"),
      truncated: t.exposeBoolean("truncated"),
    }),
  });

/**
 * `AdminStudentFiltersInput` — independent ANDed filters for the student
 * directory listing, all optional (absent or `null` members drop out at
 * the service layer). `hasParent` filters on the parent link state
 * (`true` → linked only, `false` → unlinked only, absent → all);
 * `language` matches the primary OR secondary language case-insensitively.
 * Closed whitelist: any smuggled field dies as a GraphQL validation
 * failure before a resolver ever runs (BOPLA).
 */
export const AdminStudentFiltersInput = gqlSchemaBuilder.inputType("AdminStudentFiltersInput", {
  fields: t => ({
    search: t.string({ required: false }),
    hasParent: t.boolean({ required: false }),
    language: t.string({ required: false }),
  }),
});
