/**
 * Session filter inputs — Pothos input types for the session list read
 * surfaces:
 *  - `SessionListFilterInput` — the participant session list filters
 *    (SDL: `input SessionListFilterInput { status: SessionStatus }`).
 *  - `AdminSessionListFilterInput` — the admin sessions directory filters
 *    over six optional filter keys (ids, vocabulary, creation-instant
 *    window).
 *
 * Contract (participant):
 *  - Backed by the canonical `SessionListFilterInput` from `@/backend/types`
 *    (single-source discipline — no local type is declared here; the Pothos
 *    field shape is a structural map of that backend type, per the Input
 *    Exception Policy in `backend/graphql/AGENTS.md`).
 *  - `status` is the ONLY member: an absent/null member drops out at the
 *    service guard (`SessionLifecycleService.guardStatusFilter`) — filters
 *    never error. The `SessionStatusPothosEnum` type rejects
 *    out-of-vocabulary values at GraphQL validation, before any resolver
 *    runs; the service guard remains the fail-closed backstop for
 *    `undefined`/`null` members.
 *  - Registered on the shared builder at import time; imported by the
 *    session query module (`backend/graphql/query/classes/
 *    session-lifecycle.query.ts`), whose transitive registration wires it
 *    into the production schema through the `gqlSchema.ts` side-effect
 *    chain. Deliberately NOT registered anywhere else (single canonical
 *    input definition).
 *
 * Contract (admin):
 *  - Backed by the canonical `AdminSessionListFilterInput` from
 *    `@/backend/types`; the field shape below is a structural map of that
 *    type's filter members (same Input Exception Policy — no local type).
 *  - Six members ONLY: `teacherUserId`, `studentUserId`, `type`, `status`,
 *    `dateFrom`, `dateTo`. `page`/`pageSize` are deliberately NOT members —
 *    the admin directory query declares them as top-level Int arguments
 *    beside the filter (the participant lists' convention), so this input
 *    stays a closed filter whitelist: any extra client field dies as a
 *    GraphQL validation failure before a resolver ever runs.
 *  - Every member is optional: an absent/null member drops out of the
 *    repository predicate — filters never error. `type`/`status` are the
 *    registered Pothos enums (out-of-vocabulary values are rejected at
 *    GraphQL validation, before any resolver runs; the service-side guards
 *    remain the fail-closed backstop for `undefined`/`null` members).
 *    `dateFrom`/`dateTo` ride the shared `DateTime` scalar (ISO-8601 on the
 *    wire, resolved to `Date` before the service sees them) and bound the
 *    half-open creation-instant window.
 *  - Registered on the shared builder at import time; exported for the
 *    admin sessions query module, whose transitive registration wires it
 *    into the production schema through the same side-effect chain.
 *    Deliberately NOT registered anywhere else (single canonical input
 *    definition).
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SessionStatusPothosEnum, SessionTypePothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";

/** Input type for the participant session list filters (REQ-020). */
export const SessionListFilterPothosInput = gqlSchemaBuilder.inputType("SessionListFilterInput", {
  fields: t => ({
    // Optional lifecycle filter — absent/null drops out (never errors).
    status: t.field({ type: SessionStatusPothosEnum, required: false }),
  }),
});

/** Input type for the admin sessions directory filters. */
export const AdminSessionListFilterPothosInput = gqlSchemaBuilder.inputType("AdminSessionListFilterInput", {
  fields: t => ({
    // Optional participant-id filters — absent/null members drop out
    // (never errors); the values are user ids on the session's participant
    // columns, never surrogate keys of another aggregate.
    teacherUserId: t.int({ required: false }),
    studentUserId: t.int({ required: false }),
    // Optional vocabulary filters — the registered Pothos enums reject
    // out-of-vocabulary values at GraphQL validation, before any resolver
    // runs.
    type: t.field({ type: SessionTypePothosEnum, required: false }),
    status: t.field({ type: SessionStatusPothosEnum, required: false }),
    // Half-open creation-instant window pair — the shared `DateTime` scalar
    // (wire ISO-8601, resolved to `Date` before the service sees them).
    dateFrom: t.field({ type: "DateTime", required: false }),
    dateTo: t.field({ type: "DateTime", required: false }),
  }),
});
