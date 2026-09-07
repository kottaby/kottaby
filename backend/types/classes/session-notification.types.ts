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
}

/** Raw joined read row for the report wave (identities are STILL untrusted storage here). */
export interface SessionReportWaveContextRow {
  readonly sessionId: number;
  readonly studentUserId: number;
  readonly studentFullName: string;
  readonly studentLocale: AppLocale | null;
  readonly teacherUserId: number;
  readonly teacherFullName: string;
  readonly teacherLocale: AppLocale | null;
  readonly parentUserId: number | null;
  readonly parentFullName: string | null;
  readonly parentLocale: AppLocale | null;
}

/** Report-wave participant — same trusted shape as the request-wave participant. */
export type SessionReportWaveParticipant = SessionWaveParticipantContext;

/**
 * Report wave context — the notification seam's guard-validated view of the
 * report recipients. The parent leg is `null` when the student has no linked
 * parent account: only the student and teacher waves are emitted, and the
 * parent leg can never be fabricated by a caller.
 */
export interface SessionReportWaveContext {
  readonly sessionId: number;
  readonly student: SessionReportWaveParticipant;
  readonly teacher: SessionReportWaveParticipant;
  readonly parent: SessionReportWaveParticipant | null;
}
