/**
 * Admin teacher-applicant-directory GraphQL objects + filter input — the
 * read surface over the `applicants` pipeline rows joined to their `users`
 * accounts (the teacher-certification queue).
 *
 * Every shape is backed by a canonical type from `backend/types/admin/`:
 *  - `AdminApplicantItem` ← `AdminApplicantItemReturnType` (one queue row)
 *  - `AdminApplicantPage` ← `AdminApplicantPageReturnType` (embedded envelope)
 *  - `AdminApplicantStatusCounts` ← `AdminApplicantStatusCountsReturnType`
 *    (module-private embedded value object behind the page envelope's
 *    `statusCounts` field — search-aware, status-filter-independent)
 *  - `AdminApplicantFiltersInput` — closed two-member filter whitelist
 *    whose members map 1:1 onto `AdminApplicantFiltersSubmitInput` (the
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
  AdminApplicantItemReturnType,
  AdminApplicantPageReturnType,
  AdminApplicantStatusCountsReturnType,
} from "@/backend/types";

/**
 * `AdminApplicantItem` — one applicant-queue row: the safe `users` columns
 * plus the `applicants` verification-pipeline headline (`status`,
 * `verificationAttempts`, `lastAttemptAt`, `cooldownUntil`). This is a
 * pure read surface — NO mutation here ever drives the applicant
 * lifecycle; certification actions live on the admin user-detail surface.
 * Governance flags mirror the `AdminUserListItem` projection
 * (null-coalesced to `false` at the mapper layer).
 */
const AdminApplicantItemPothosObject = gqlSchemaBuilder
  .objectRef<AdminApplicantItemReturnType>("AdminApplicantItem")
  .implement({
    fields: t => ({
      id: t.exposeInt("id"),
      name: t.exposeString("name"),
      email: t.exposeString("email"),
      phone: t.exposeString("phone", { nullable: true }),
      country: t.exposeString("country", { nullable: true }),
      status: t.exposeString("status"),
      verificationAttempts: t.exposeInt("verificationAttempts"),
      lastAttemptAt: t.expose("lastAttemptAt", { type: "DateTime", nullable: true }),
      cooldownUntil: t.expose("cooldownUntil", { type: "DateTime", nullable: true }),
      isDeleted: t.field({ type: "Boolean", resolve: parent => parent.isDeleted }),
      suspended: t.field({ type: "Boolean", resolve: parent => parent.suspended }),
      isBlocked: t.field({ type: "Boolean", resolve: parent => parent.isBlocked }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
    }),
  });

/**
 * `AdminApplicantStatusCounts` — per-status counts for the queue's
 * quick-filter chips. SEARCH-aware but STATUS-filter-INDEPENDENT: the
 * counts always describe the whole pipeline matching the current search
 * term (the status filter is NOT applied to the aggregate), so the chips
 * stay meaningful while a status filter is active. Rows whose stored
 * `status` falls outside the canonical vocabulary (`pending` |
 * `in_evaluation` | `failed` | `passed`) are ignored — the varchar column
 * is enum-less and the counts are honest to the canonical vocabulary only.
 * Embedded value object behind the page envelope — NO `id` field.
 */
const AdminApplicantStatusCountsPothosObject = gqlSchemaBuilder
  .objectRef<AdminApplicantStatusCountsReturnType>("AdminApplicantStatusCounts")
  .implement({
    fields: t => ({
      pending: t.exposeInt("pending"),
      inEvaluation: t.exposeInt("inEvaluation"),
      failed: t.exposeInt("failed"),
      passed: t.exposeInt("passed"),
    }),
  });

/**
 * `AdminApplicantPage` — paginated directory envelope. Echoes `page` +
 * `pageSize` so callers can normalize client-side pagination state;
 * `pageCount` is the ceiling division of `total` over `pageSize`. An
 * out-of-range page yields an empty `items` array with the honest `total`
 * (never clamped, never an error). `statusCounts` carries the search-aware
 * / status-independent per-status aggregate for the quick-filter chips.
 * Embedded wrapper — NO `id` field.
 */
export const AdminApplicantPagePothosObject = gqlSchemaBuilder
  .objectRef<AdminApplicantPageReturnType>("AdminApplicantPage")
  .implement({
    fields: t => ({
      items: t.field({
        type: [AdminApplicantItemPothosObject],
        resolve: parent => parent.items,
      }),
      total: t.exposeInt("total"),
      page: t.exposeInt("page"),
      pageSize: t.exposeInt("pageSize"),
      pageCount: t.exposeInt("pageCount"),
      statusCounts: t.field({
        type: AdminApplicantStatusCountsPothosObject,
        resolve: parent => parent.statusCounts,
      }),
    }),
  });

/**
 * `AdminApplicantFiltersInput` — independent ANDed filters for the
 * applicant-queue listing, all optional (absent or `null` members drop out
 * at the service layer). `status` is a plain String input mirroring the
 * R1 directory inputs' style (no GraphQL enum): the varchar
 * `applicants.status` column is enum-less, so the service layer enforces
 * the canonical `ApplicantStatus` vocabulary and REJECTS any other value
 * with a localized `VALIDATION` error. Closed whitelist: any smuggled
 * field dies as a GraphQL validation failure before a resolver ever runs
 * (BOPLA).
 */
export const AdminApplicantFiltersInput = gqlSchemaBuilder.inputType("AdminApplicantFiltersInput", {
  fields: t => ({
    search: t.string({ required: false }),
    status: t.string({ required: false }),
  }),
});
