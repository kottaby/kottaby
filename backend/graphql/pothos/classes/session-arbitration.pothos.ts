/**
 * AdminDisputeCasePothosObject — the single canonical GraphQL object for the
 * admin's dispute case-review read (the evidence bundle behind an
 * arbitration decision).
 *
 * Single Canonical Object Type Pattern (`backend/graphql/AGENTS.md`):
 *  - Backed EXCLUSIVELY by the canonical `AdminDisputeCaseReturnType` from
 *    `@/backend/types` — no local type definitions here. There is NO
 *    business logic in this module.
 *  - It is a compound READ envelope (the sanctioned wrapper exception): it
 *    reuses the existing canonical entity objects — `Session`,
 *    `SessionReport`, `SessionHomeWork`, `SessionRecitation`, and
 *    `AdminAuditLogEntry` — by reference; every member entity keeps exactly
 *    one GraphQL object type and this module registers no duplicate of any
 *    of them. The envelope itself is an embedded value object with NO `id`
 *    (the normalizable entities are its members).
 *  - Absent artifacts surface as honest `null`s (`report`, `homework`,
 *    `recitation` are nullable): a session whose report, homework, or
 *    recitation record was never produced renders no fabricated
 *    placeholder. The `auditTrail` list is non-nullable and resolves to an
 *    empty list when the session has no trail rows yet.
 *
 * Consumed by the arbitration query resolver module, whose import
 * transitively registers the type through the `gqlSchema.ts` side-effect
 * chain.
 */

import { AdminAuditLogEntryPothosObject } from "@/backend/graphql/pothos/admin/audit-trail.pothos";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SessionHomeWorkPothosObject } from "@/backend/graphql/pothos/classes/home-work.pothos";
import { SessionRecitationPothosObject } from "@/backend/graphql/pothos/classes/recitation.pothos";
import { SessionReportPothosObject } from "@/backend/graphql/pothos/classes/report.pothos";
import { SessionPothosObject } from "@/backend/graphql/pothos/classes/session.pothos";
import type { AdminDisputeCaseReturnType } from "@/backend/types";

/**
 * The canonical `AdminDisputeCase` GraphQL object. The producer is
 * `SessionArbitrationService.getAdminDisputeCase` (the admin-gated case
 * read); every field is a passthrough of the composed bundle.
 */
export const AdminDisputeCasePothosObject = gqlSchemaBuilder
  .objectRef<AdminDisputeCaseReturnType>("AdminDisputeCase")
  .implement({
    fields: t => ({
      // The disputed session's full row (dispute reason, stamps, fee, hold
      // marker) through the canonical `Session` object — `Session!`.
      session: t.field({
        type: SessionPothosObject,
        resolve: parent => parent.session,
      }),
      // The teacher's post-session report — honest `null` when none was
      // submitted.
      report: t.field({
        type: SessionReportPothosObject,
        nullable: true,
        resolve: parent => parent.report,
      }),
      // The session's homework record — honest `null` when none was
      // produced.
      homework: t.field({
        type: SessionHomeWorkPothosObject,
        nullable: true,
        resolve: parent => parent.homework,
      }),
      // The session's recitation record — honest `null` when none was
      // recorded.
      recitation: t.field({
        type: SessionRecitationPothosObject,
        nullable: true,
        resolve: parent => parent.recitation,
      }),
      // The session-scoped audit trail entries (newest first, the trail
      // service's largest single page — a session's arbitration history is
      // bounded by its own lifecycle). Non-nullable list; an empty trail is
      // the honest empty state.
      auditTrail: t.field({
        type: [AdminAuditLogEntryPothosObject],
        resolve: parent => [...parent.auditTrail],
      }),
    }),
  });
