import { z } from "zod";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import type { SessionReturnType } from "@/backend/types/classes/session.types";

/**
 * Admin session governance — the canonical input and read types for the
 * admin-only session directory and its operator mutations.
 *
 * Participant session reads are ownership-scoped: a caller only ever sees
 * rows on which they sit as a participant. This surface is the browse plane
 * over EVERY session row regardless of state or ownership, plus the operator
 * mutations that reshape a row (reschedule the timing pair, cancel with hold
 * release, reassign the teacher) or observe it (join a live session as a
 * read-only observer). The types here are the single canonical vocabulary
 * for that surface — GraphQL input objects, service signatures, and
 * repositories all bind to these shapes; nothing local is declared at the
 * consuming layers.
 *
 * Every identifier on an input is a user-facing id (a session row id, a
 * user id) — never a surrogate key of another aggregate. Timestamps are
 * `Date` values: the transport-level DateTime scalar parses inbound ISO
 * strings before these types see the payload.
 *
 * Zod schemas live beside their interfaces and are exported: they are the
 * argument-validation boundary consumed by the GraphQL layer. Unknown keys
 * are stripped by the object schemas, so a client-supplied extra field is
 * silently dropped — never forwarded into a repository write.
 */

/** Upper bound of the admin list window's page size. */
const MAX_PAGE_SIZE = 50;

/** Upper bound of the admin cancel reason — the audit details column width. */
const MAX_CANCEL_REASON_LENGTH = 2000;

/**
 * Shape gate for every caller-supplied identifier on this surface: a
 * positive safe integer. A NaN, fractional, out-of-safe-range, non-positive,
 * or non-number value fails closed before any database work — the same
 * closed vocabulary the session lifecycle's pre-DB id guards enforce.
 */
const governanceIdSchema = z.number().int().positive();

/**
 * Filter + window payload for the admin sessions directory. Absent members
 * drop out of the query — they never error; a present member narrows the
 * result set.
 *
 * The creation-instant window is a pairing: a row qualifies when its
 * creation instant is at or after `dateFrom` and before `dateTo` (half-open,
 * UTC), so an inverted range is rejected at this boundary while a zero-width
 * window (`dateFrom` equal to `dateTo`) is a legitimate empty result and
 * passes. `page` is the 1-based window index; the page size is capped at 50.
 */
export interface AdminSessionListFilterInput {
  readonly teacherUserId?: number;
  readonly studentUserId?: number;
  readonly type?: SessionType;
  readonly status?: SessionStatus;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Reschedule payload: the target session and its replacement timing pair.
 * The pair must be ordered — a start at or after the end is not a session.
 */
export interface AdminSessionRescheduleInput {
  readonly sessionId: number;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

/**
 * Cancel payload: the target session plus an optional free-text reason.
 * The reason is audit metadata — bounded to the audit-details width,
 * trimmed downstream, and persisted as no reason at all when empty.
 */
export interface AdminSessionCancelInput {
  readonly sessionId: number;
  readonly reason?: string;
}

/**
 * Teacher-reassignment payload: the target session and the candidate
 * teacher's user id. The candidate's certification is verified server-side
 * against the teacher record — the payload carries identity only, never an
 * approval assertion.
 */
export interface AdminSessionReassignInput {
  readonly sessionId: number;
  readonly newTeacherUserId: number;
}

/** Join payload: the target session the admin observes while it is live. */
export interface AdminSessionJoinInput {
  readonly sessionId: number;
}

/**
 * Directory row: the canonical session read shape plus the derived admin
 * badge flag. `needsAttention` is computed server-side per row (a disputed
 * row, or a scheduled row whose confirmation deadline has lapsed) and
 * exists purely for badge styling — it never grants, denies, or narrows
 * authorization.
 */
export type AdminSessionRowReturnType = SessionReturnType & {
  readonly needsAttention: boolean;
};

/**
 * Admin browse read of a single session by id: the canonical session read
 * shape for ANY id regardless of lifecycle state. An absent id resolves to
 * `null` — a browse read answers "no such row" with data, not with a thrown
 * not-found error.
 */
export type AdminSessionDetail = SessionReturnType | null;

/**
 * Validation boundary for {@link AdminSessionListFilterInput}: every member
 * optional, enum members closed to the session vocabularies, identifiers
 * positive safe integers, the page size window capped, and the creation
 * window paired (inverted ranges rejected, zero-width windows accepted).
 */
export const AdminSessionListFilterInputSchema = z
  .object({
    teacherUserId: governanceIdSchema.optional(),
    studentUserId: governanceIdSchema.optional(),
    type: z.enum(SessionType).optional(),
    status: z.enum(SessionStatus).optional(),
    dateFrom: z.date().optional(),
    dateTo: z.date().optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  })
  .refine(
    filter =>
      filter.dateFrom === undefined ||
      filter.dateTo === undefined ||
      filter.dateFrom.getTime() <= filter.dateTo.getTime()
  );

/**
 * Validation boundary for {@link AdminSessionRescheduleInput}: the ordered
 * timing pair is enforced here — an equal or inverted pair is rejected
 * before the payload reaches the service layer.
 */
export const AdminSessionRescheduleInputSchema = z
  .object({
    sessionId: governanceIdSchema,
    startedAt: z.date(),
    endedAt: z.date(),
  })
  .refine(input => input.startedAt.getTime() < input.endedAt.getTime());

/**
 * Validation boundary for {@link AdminSessionCancelInput}: the optional
 * reason is length-capped; content normalization (trim, whitespace-only →
 * no reason) stays a service-layer concern.
 */
export const AdminSessionCancelInputSchema = z.object({
  sessionId: governanceIdSchema,
  reason: z.string().max(MAX_CANCEL_REASON_LENGTH).optional(),
});

/**
 * Validation boundary for {@link AdminSessionReassignInput}: both ids are
 * positive safe integers; certification of the candidate teacher is a
 * server-side check, never a client assertion.
 */
export const AdminSessionReassignInputSchema = z.object({
  sessionId: governanceIdSchema,
  newTeacherUserId: governanceIdSchema,
});

/**
 * Validation boundary for {@link AdminSessionJoinInput}: the single target
 * id is a positive safe integer.
 */
export const AdminSessionJoinInputSchema = z.object({
  sessionId: governanceIdSchema,
});
