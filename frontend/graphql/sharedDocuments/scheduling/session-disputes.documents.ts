import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AdminDisputeCaseQuery,
  AdminDisputeCaseQueryVariables,
  AdminDisputedSessionsQuery,
  AdminDisputedSessionsQueryVariables,
  OpenPostConfirmationDisputeMutation,
  OpenPostConfirmationDisputeMutationVariables,
  OpenSessionDisputeMutation,
  OpenSessionDisputeMutationVariables,
  ResolveSessionDisputeMutation,
  ResolveSessionDisputeMutationVariables,
} from "@/frontend/graphql/generated/gql/graphql";

/**
 * Session DISPUTE documents — the arbitration third of the split
 * out of `session.documents.ts` (which re-exports every sibling, so the
 * deep-import path and the export surface are unchanged).
 *
 * The dispute family: the participant escalation mutation for held-escrow
 * rows (`openSessionDispute`), the student escalation for dual-confirmed
 * (consumed) rows (`openPostConfirmationDispute`), the ADMIN arbitration
 * mutation (`resolveSessionDispute`), the ADMIN read of the arbitration
 * queue (`adminDisputedSessions`) and the ADMIN case-review read
 * (`adminDisputeCase`). Every `Session` payload selects `id` first so
 * Apollo Client normalizes returned rows into the cache — consumers converge
 * lists via the returned `Session!` payloads WITHOUT refetch storms (per
 * the `sharedDocuments/AGENTS.md` "id Field Requirement" — cache-normalized
 * convergence, no refetch).
 *
 * Every `Session` selection carries the dispute/cancel-audit
 * fields (`cancelReason`, `disputeReason`, `disputedAt`, `resolutionNote`,
 * `resolvedAt` — all nullable) so the rows that render them (cancelled
 * rows with a persisted cancel reason; the admin arbitration list) and
 * the cache-normalize `update` arms share ONE field shape across the
 * family.
 *
 * All types come from the codegen output
 * (`@/frontend/graphql/generated/gql/graphql`) — never inline literals
 * as TYPES, never mapping layers. Hooks (`useQuery`, `useMutation`) are
 * consumed from `@apollo/client/react` in views; `useLazyQuery` is banned.
 */

/**
 * `openSessionDispute(id: ID!, reason: String!)` — a session participant
 * (student OR teacher — the participant predicate is service-side)
 * escalates a `Scheduled`/`Started` session into `Disputed` with a
 * REQUIRED reason (trimmed 1..500 at the UI seam). Returns the updated
 * `Session!` payload for cache normalization — the row flips to its
 * disputed chip WITHOUT a refetch. Non-participants and nonexistent ids
 * are indistinguishable `SESSION_NOT_FOUND` denials (oracle-safe).
 */
export const openSessionDisputeMutationDocument: TypedDocumentNode<
  OpenSessionDisputeMutation,
  OpenSessionDisputeMutationVariables
> = gql`
  mutation OpenSessionDispute($id: ID!, $reason: String!) {
    openSessionDispute(id: $id, reason: $reason) {
      id
      status
      intent
      sessionType
      fee
      feeHeld
      studentId
      teacherId
      startedAt
      endedAt
      confirmationDeadline
      confirmedByStudentAt
      confirmedByTeacherAt
      createdAt
      updatedAt
      cancelReason
      disputeReason
      disputedAt
      resolutionNote
      resolvedAt
    }
  }
`;

/**
 * `openPostConfirmationDispute(id: ID!, reason: String!)` — the STUDENT
 * escalation for a dual-confirmed session (held escrow consumed, wallet
 * credited): moves the completed row back into `Disputed` for arbitration.
 * Same oracle-safe denial collapse as the held-escrow sibling
 * (`openSessionDispute`): non-participants and nonexistent ids are
 * indistinguishable `SESSION_NOT_FOUND` denials, and the student predicate
 * is service-side. Returns the updated `Session!` payload for cache
 * normalization — the row flips to its disputed chip WITHOUT a refetch.
 */
export const openPostConfirmationDisputeMutationDocument: TypedDocumentNode<
  OpenPostConfirmationDisputeMutation,
  OpenPostConfirmationDisputeMutationVariables
> = gql`
  mutation OpenPostConfirmationDispute($id: ID!, $reason: String!) {
    openPostConfirmationDispute(id: $id, reason: $reason) {
      id
      status
      intent
      sessionType
      fee
      feeHeld
      studentId
      teacherId
      startedAt
      endedAt
      confirmationDeadline
      confirmedByStudentAt
      confirmedByTeacherAt
      createdAt
      updatedAt
      cancelReason
      disputeReason
      disputedAt
      resolutionNote
      resolvedAt
    }
  }
`;

/**
 * `resolveSessionDispute(id: ID!, resolution: DisputeResolution!, note: String, partialAmount: String)`
 * — ADMIN arbitration: resolves a `Disputed` session into exactly one
 * terminal state (`Cancel` → cancelled + same-lane refund of any held fee;
 * `Complete` → completed + hold consumed, `startedAt` required;
 * `Refund`/`PartialRefund`/`Uphold` → the consumed-escrow outcomes, where a
 * `PartialRefund` additionally carries the validated `partialAmount` decimal
 * string). The note is optional (≤ 500 chars at the UI seam). Returns the
 * updated `Session!` payload; arbitration writes (refund/hold
 * consumption/wallet reversal) are server-owned.
 */
export const resolveSessionDisputeMutationDocument: TypedDocumentNode<
  ResolveSessionDisputeMutation,
  ResolveSessionDisputeMutationVariables
> = gql`
  mutation ResolveSessionDispute($id: ID!, $resolution: DisputeResolution!, $note: String, $partialAmount: String) {
    resolveSessionDispute(id: $id, resolution: $resolution, note: $note, partialAmount: $partialAmount) {
      id
      status
      intent
      sessionType
      fee
      feeHeld
      studentId
      teacherId
      startedAt
      endedAt
      confirmationDeadline
      confirmedByStudentAt
      confirmedByTeacherAt
      createdAt
      updatedAt
      cancelReason
      disputeReason
      disputedAt
      resolutionNote
      resolvedAt
    }
  }
`;

/**
 * `adminDisputedSessions(filter, limit, offset)` — the ADMIN read of the
 * arbitration queue (`SessionPage!`): every `Disputed` session, newest
 * first, honest `totalCount` under the same status-first predicate.
 * `limit` clamps 1..50 (default 25) server-side; the page clamps offset ≥ 0.
 * Admin-only scope lives server-side (`$all{authenticated, role:[Admin]}`).
 */
export const adminDisputedSessionsQueryDocument: TypedDocumentNode<
  AdminDisputedSessionsQuery,
  AdminDisputedSessionsQueryVariables
> = gql`
  query AdminDisputedSessions($filter: SessionListFilterInput, $limit: Int, $offset: Int) {
    adminDisputedSessions(filter: $filter, limit: $limit, offset: $offset) {
      items {
        id
        status
        intent
        sessionType
        fee
        feeHeld
        studentId
        teacherId
        startedAt
        endedAt
        confirmationDeadline
        confirmedByStudentAt
        confirmedByTeacherAt
        createdAt
        updatedAt
        cancelReason
        disputeReason
        disputedAt
        resolutionNote
        resolvedAt
      }
      page
      pageSize
      totalCount
    }
  }
`;

/**
 * `adminDisputeCase(id: ID!)` — the ADMIN case-review read: the full
 * evidence bundle for one disputed session in a single response — the
 * session detail (the shared dispute-family `Session` selection), the
 * teacher report (with `studentRatingByTeacher`), the homework row, the
 * recitation record and the session-scoped audit-trail entries, plus the
 * server-resolved participant display names. The three
 * evidence artifacts are honest `null`s when absent (no report submitted,
 * no homework/recitation) — never fabricated placeholders. Admin-only
 * scope lives server-side (`$all{authenticated, role:[Admin]}` + the
 * service-level governance re-assertion).
 */
export const adminDisputeCaseQueryDocument: TypedDocumentNode<AdminDisputeCaseQuery, AdminDisputeCaseQueryVariables> =
  gql`
  query AdminDisputeCase($id: ID!) {
    adminDisputeCase(id: $id) {
      session {
        id
        status
        intent
        sessionType
        fee
        feeHeld
        studentId
        teacherId
        startedAt
        endedAt
        confirmationDeadline
        confirmedByStudentAt
        confirmedByTeacherAt
        createdAt
        updatedAt
        cancelReason
        disputeReason
        disputedAt
        resolutionNote
        resolvedAt
      }
      report {
        id
        sessionId
        teacherNotes
        studentRatingByTeacher
        createdAt
        updatedAt
      }
      homework {
        id
        sessionId
        currentFromAyah
        currentToAyah
        currentGrade
        currentSurahJuz
        revisionFromAyah
        revisionToAyah
        revisionGrade
        revisionSurahJuz
        createdAt
        updatedAt
      }
      recitation {
        id
        sessionId
        name
        description
        createdAt
        updatedAt
      }
      auditTrail {
        id
        actionType
        actorId
        actorName
        createdAt
        details
        entityId
        entityType
      }
      studentName
      teacherName
    }
  }
`;
