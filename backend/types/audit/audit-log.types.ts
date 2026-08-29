import type { auditLogs } from "@/backend/db/schema/audit/audit-logs";

export type AuditLogSelectType = typeof auditLogs.$inferSelect;
export type AuditLogInsertType = typeof auditLogs.$inferInsert;

/** Machine-readable action descriptor carried inside `details`. */
export type AuditEntityType = "plans" | "subscriptions";
/** Input shape for one auditable admin action. */
export interface RecordAdminActionInput {
  /** The acting admin's user id (audit_logs.actor_id — never null). */
  readonly actorId: number;
  /** The audit_action_type enum verb. */
  readonly actionType: AuditLogInsertType["actionType"];
  /** The affected entity family (machine code, never user content). */
  readonly entityType: AuditEntityType;
  /** The affected row's id, when the action targets one. */
  readonly entityId?: number;
  /** The action's machine code (e.g. PLAN_CREATED) — lands in `details`. */
  readonly actionCode: string;
  /** Additional id/machine-code context (never field values). */
  readonly details?: Record<string, string | number | readonly string[]>;
}
/** The paginated trail page + grand total behind the admin viewer. */
export interface AuditTrailPage {
  readonly items: AuditLogWithActor[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
/** The narrow actor summary embedded in every audit row the admin reads. */
export interface AuditLogActorSummary {
  readonly id: number;
  readonly fullName: string;
  readonly email: string;
}
/** One audit-trail row with its actor summary embedded. */
export interface AuditLogWithActor {
  readonly id: number;
  readonly actorId: number;
  readonly actionType: AuditLogSelectType["actionType"];
  readonly entityType: string;
  readonly entityId: number | null;
  readonly details: string | null;
  readonly createdAt: Date;
  readonly actor: AuditLogActorSummary;
}
/** Every filter the admin audit-trail viewer can express (all optional). */
export interface AuditLogListFilters {
  readonly actorId?: number;
  readonly actionType?: AuditLogSelectType["actionType"];
  readonly entityType?: string;
  readonly entityId?: number;
  /** Inclusive lower bound on `created_at`. */
  readonly createdFrom?: Date;
  /** Inclusive upper bound on `created_at`. */
  readonly createdTo?: Date;
  /** Page size (the service clamps and validates; the repo does not). */
  readonly limit: number;
  /** Zero-based row offset. */
  readonly offset: number;
}
