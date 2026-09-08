import type { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import type { AppLocale } from "@/shared/locale/AppLocale";

/** Closed wave vocabulary — the six lifecycle notifications of a session request. */
export type SessionRequestWaveKind =
  | "teacher_request"
  | "outcome_accepted"
  | "outcome_declined"
  | "outcome_auto_rejected"
  | "outcome_queued"
  | "outcome_alternatives_offered";

/**
 * Closed wave vocabulary — the three admin session-governance waves
 * (`sessionGovernance.rescheduled`, `sessionGovernance.cancelled`,
 * `sessionGovernance.teacherReassigned`): one wave per operator
 * intervention, each fanned out per recipient (student, outgoing teacher,
 * incoming teacher) with per-recipient-locale copy and a per-recipient
 * deterministic emit-claim key.
 */
export type SessionGovernanceWaveKind =
  | "sessionGovernance.rescheduled"
  | "sessionGovernance.cancelled"
  | "sessionGovernance.teacherReassigned";

/** Raw joined read row (intent is STILL untrusted storage at this layer). */
export interface SessionWaveContextRow {
  readonly sessionId: number;
  readonly intent: string | null;
  readonly studentUserId: number;
  readonly studentFullName: string;
  readonly studentLocale: AppLocale | null;
  readonly teacherUserId: number;
  readonly teacherFullName: string;
  readonly teacherLocale: AppLocale | null;
  /**
   * The session row's audit stamp as of the wave read — the occurrence
   * discriminator the RECURRING governance waves fold into their emit-claim
   * keys. Null until the row's first mutation stamps it; the one-shot waves
   * (every participant wave + the governance cancel) never consume it.
   */
  readonly sessionUpdatedAt: Date | null;
}

/** Service-level, guard-validated wave context — intent is a real SessionIntent here. */
export interface SessionWaveParticipantContext {
  readonly userId: number;
  readonly fullName: string;
  readonly locale: AppLocale | null;
}

export interface SessionWaveContext {
  readonly sessionId: number;
  readonly intent: SessionIntent;
  readonly student: SessionWaveParticipantContext;
  readonly teacher: SessionWaveParticipantContext;
  /** Emit-time occurrence stamp (see `SessionWaveContextRow.sessionUpdatedAt`). */
  readonly sessionUpdatedAt: Date | null;
}
