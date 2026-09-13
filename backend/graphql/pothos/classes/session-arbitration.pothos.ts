/**
 * AdminDisputeCasePothosObject — the single canonical GraphQL object for the
 * admin's dispute case-review read (the evidence bundle behind an
 * arbitration decision) — and TeacherDisputeCasePothosObject, the
 * participant-side bundle the session's own teacher reads.
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
import type {
  AdminDisputeAnalyticsReturnType,
  AdminDisputeCaseReturnType,
  AdminDisputedSessionPageReturnType,
  AdminDisputedSessionRowReturnType,
  TeacherDisputeCaseReturnType,
} from "@/backend/types";

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
      // The participant display names resolved server-side — honest `null`
      // when the user row is unreachable (the view falls back to the
      // numeric identity).
      studentName: t.field({
        type: "String",
        nullable: true,
        resolve: parent => parent.studentName,
      }),
      teacherName: t.field({
        type: "String",
        nullable: true,
        resolve: parent => parent.teacherName,
      }),
    }),
  });

/**
 * The canonical `TeacherDisputeCase` GraphQL object. The producer is
 * `SessionArbitrationService.getTeacherDisputeCase` (the participant
 * predicate lives service-side); every field is a passthrough of the
 * composed bundle. The audit trail is deliberately ABSENT — the trail is
 * the admin governance surface, so this envelope reuses only the
 * participant-owned entity objects (`Session`, `SessionReport`,
 * `SessionHomeWork`, `SessionRecitation`), each still registered exactly
 * once repo-wide.
 */
export const TeacherDisputeCasePothosObject = gqlSchemaBuilder
  .objectRef<TeacherDisputeCaseReturnType>("TeacherDisputeCase")
  .implement({
    fields: t => ({
      // The session's full row (dispute reason, stamps, fee, hold marker)
      // through the canonical `Session` object — `Session!`.
      session: t.field({
        type: SessionPothosObject,
        resolve: parent => parent.session,
      }),
      // The teacher's own post-session report — honest `null` when none
      // was submitted.
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
      // The student display name resolved server-side — honest `null`
      // when the user row is unreachable (the view falls back to the
      // numeric identity).
      studentName: t.field({
        type: "String",
        nullable: true,
        resolve: parent => parent.studentName,
      }),
    }),
  });

/**
 * The admin arbitration queue row: the disputed session wrapped with the
 * server-resolved participant display names (honest `null`s fall back to
 * the numeric identity in the view).
 */
export const AdminDisputedSessionRowPothosObject = gqlSchemaBuilder
  .objectRef<AdminDisputedSessionRowReturnType>("AdminDisputedSessionRow")
  .implement({
    fields: t => ({
      // The disputed session's full row through the canonical `Session`
      // object — `Session!`.
      session: t.field({
        type: SessionPothosObject,
        resolve: parent => parent.session,
      }),
      studentName: t.field({
        type: "String",
        nullable: true,
        resolve: parent => parent.studentName,
      }),
      teacherName: t.field({
        type: "String",
        nullable: true,
        resolve: parent => parent.teacherName,
      }),
    }),
  });

/**
 * The admin arbitration queue page: one page of
 * `AdminDisputedSessionRow` entries plus the honest pagination tail.
 */
export const AdminDisputedSessionPagePothosObject = gqlSchemaBuilder
  .objectRef<AdminDisputedSessionPageReturnType>("AdminDisputedSessionPage")
  .implement({
    fields: t => ({
      items: t.field({
        type: [AdminDisputedSessionRowPothosObject],
        resolve: parent => [...parent.items],
      }),
      totalCount: t.exposeInt("totalCount"),
      page: t.exposeInt("page"),
      pageSize: t.exposeInt("pageSize"),
    }),
  });

/**
 * The admin dispute-analytics snapshot object: the aggregate dispute
 * counts (open, resolved, per-outcome) as flat non-nullable Int fields —
 * one canonical object for the analytics read, zero derived values (the
 * view computes rates from the honest counts it already holds).
 */
export const AdminDisputeAnalyticsPothosObject = gqlSchemaBuilder
  .objectRef<AdminDisputeAnalyticsReturnType>("AdminDisputeAnalytics")
  .implement({
    fields: t => ({
      openDisputes: t.exposeInt("openDisputes"),
      resolvedDisputes: t.exposeInt("resolvedDisputes"),
      cancelCount: t.exposeInt("cancelCount"),
      completeCount: t.exposeInt("completeCount"),
      refundCount: t.exposeInt("refundCount"),
      partialRefundCount: t.exposeInt("partialRefundCount"),
      upholdCount: t.exposeInt("upholdCount"),
    }),
  });
