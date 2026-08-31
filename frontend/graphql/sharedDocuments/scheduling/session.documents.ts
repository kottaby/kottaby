import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AdminDisputedSessionsQuery,
  AdminDisputedSessionsQueryVariables,
  CancelSessionMutation,
  CancelSessionMutationVariables,
  CompleteSessionMutation,
  CompleteSessionMutationVariables,
  ConfirmSessionCompletionMutation,
  ConfirmSessionCompletionMutationVariables,
  CreateSessionMutation,
  CreateSessionMutationVariables,
  MyStudentSessionsQuery,
  MyStudentSessionsQueryVariables,
  MyTeacherSessionsQuery,
  MyTeacherSessionsQueryVariables,
  OpenSessionDisputeMutation,
  OpenSessionDisputeMutationVariables,
  ResolveSessionDisputeMutation,
  ResolveSessionDisputeMutationVariables,
  SessionByIdQuery,
  SessionByIdQueryVariables,
  StartSessionMutation,
  StartSessionMutationVariables,
} from "@/frontend/graphql/generated/gql/graphql";

/**
 * Shared GraphQL documents for the session lifecycle + dispute domain
 * (DEV3-004 + DEV3-005 + DEV3-012).
 *
 * Eleven operations over the DEV3-004 SDL surface: three reads
 * (`sessionById`, `myStudentSessions`, `myTeacherSessions`), the
 * lifecycle quartet of mutations (`createSession`, `startSession`,
 * `completeSession`, `cancelSession`), the DEV3-005 dispute trio
 * (`openSessionDispute`, `resolveSessionDispute` mutations + the
 * `adminDisputedSessions` admin read) and the DEV3-012 dual-confirmation
 * mutation (`confirmSessionCompletion`). Every `Session` payload selects
 * `id` first so Apollo Client normalizes returned rows into the cache —
 * consumers converge lists via the returned `Session!` payloads WITHOUT
 * refetch storms (per `sharedDocuments/AGENTS.md` "id Field Requirement"
 * and plan §5.4 "no refetch").
 *
 * Every `Session` selection carries the DEV3-005 dispute/cancel-audit
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
 * `sessionById(id: ID!)` — nullable single-session read for participants.
 * Returns `null` for foreign/nonexistent/never-existed ids (one no-oracle
 * answer — the row is sensitive), so consumers must handle the empty case.
 */
export const sessionByIdQueryDocument: TypedDocumentNode<SessionByIdQuery, SessionByIdQueryVariables> = gql`
  query SessionById($id: ID!) {
    sessionById(id: $id) {
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
 * `myStudentSessions(filter, page, pageSize)` — the authenticated student's
 * paginated session list (`SessionPage!`). Identity is server-bound
 * (`ctx.user.id`); no student identity variable exists (BOPLA hygiene).
 */
export const myStudentSessionsQueryDocument: TypedDocumentNode<
  MyStudentSessionsQuery,
  MyStudentSessionsQueryVariables
> = gql`
  query MyStudentSessions($filter: SessionListFilterInput, $page: Int, $pageSize: Int) {
    myStudentSessions(filter: $filter, page: $page, pageSize: $pageSize) {
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
 * `myTeacherSessions(filter, page, pageSize)` — the authenticated teacher's
 * paginated session list (`SessionPage!`). Mirrors `myStudentSessions`;
 * teacher applicants get an empty page, never an error.
 */
export const myTeacherSessionsQueryDocument: TypedDocumentNode<
  MyTeacherSessionsQuery,
  MyTeacherSessionsQueryVariables
> = gql`
  query MyTeacherSessions($filter: SessionListFilterInput, $page: Int, $pageSize: Int) {
    myTeacherSessions(filter: $filter, page: $page, pageSize: $pageSize) {
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
 * `createSession(input: CreateSessionInput!)` — books a session
 * (`intent` + `teacherId`; student identity is server-bound). Returns the
 * created `Session!` for cache normalization. Callers pass a fresh
 * `X-Idempotency-Key` per logical booking attempt (see `docs/IDEMPOTENCY.md`).
 */
export const createSessionMutationDocument: TypedDocumentNode<CreateSessionMutation, CreateSessionMutationVariables> =
  gql`
  mutation CreateSession($input: CreateSessionInput!) {
    createSession(input: $input) {
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
 * `startSession(id: ID!)` — teacher transitions `Scheduled → Started`.
 * Returns the updated `Session!` payload; the Apollo cache converges by `id`.
 */
export const startSessionMutationDocument: TypedDocumentNode<StartSessionMutation, StartSessionMutationVariables> = gql`
  mutation StartSession($id: ID!) {
    startSession(id: $id) {
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
 * `completeSession(id: ID!)` — teacher transitions `Started → Completed`
 * (settles the held fee). Returns the updated `Session!` payload.
 */
export const completeSessionMutationDocument: TypedDocumentNode<
  CompleteSessionMutation,
  CompleteSessionMutationVariables
> = gql`
  mutation CompleteSession($id: ID!) {
    completeSession(id: $id) {
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
 * `cancelSession(id: ID!, reason: String)` — participant cancels a
 * `Scheduled`/`Started` session (optional reason string, ≤ 500 chars
 * enforced at the UI seam). Returns the updated `Session!` payload; the
 * fee hold release surfaces server-side.
 */
export const cancelSessionMutationDocument: TypedDocumentNode<CancelSessionMutation, CancelSessionMutationVariables> =
  gql`
  mutation CancelSession($id: ID!, $reason: String) {
    cancelSession(id: $id, reason: $reason) {
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
 * `confirmSessionCompletion(id: ID!)` — DEV3-012 (R-201/R-202): the
 * student's completion confirmation, the second dual-confirmation half.
 * IDEMPOTENT — a repeat confirm, the teacher caller, or an already-released
 * hold returns the current `Session!` payload with ZERO financial writes;
 * the FIRST student confirm on a completed hold-marked row writes the
 * student stamp and credits the teacher's wallet server-side (one atomic
 * slice). Non-participants and nonexistent ids are indistinguishable
 * `SESSION_NOT_FOUND` denials (oracle-safe); a non-completed row denies
 * with `SESSION_INVALID_TRANSITION`.
 */
export const confirmSessionCompletionMutationDocument: TypedDocumentNode<
  ConfirmSessionCompletionMutation,
  ConfirmSessionCompletionMutationVariables
> = gql`
  mutation ConfirmSessionCompletion($id: ID!) {
    confirmSessionCompletion(id: $id) {
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
 * `resolveSessionDispute(id: ID!, resolution: DisputeResolution!, note: String)`
 * — ADMIN arbitration: resolves a `Disputed` session into exactly one
 * terminal state (`Cancel` → cancelled + same-lane refund of any held fee;
 * `Complete` → completed + hold consumed, `startedAt` required). The note
 * is optional (≤ 500 chars at the UI seam). Returns the updated `Session!`
 * payload; arbitration writes (refund/hold consumption) are server-owned.
 */
export const resolveSessionDisputeMutationDocument: TypedDocumentNode<
  ResolveSessionDisputeMutation,
  ResolveSessionDisputeMutationVariables
> = gql`
  mutation ResolveSessionDispute($id: ID!, $resolution: DisputeResolution!, $note: String) {
    resolveSessionDispute(id: $id, resolution: $resolution, note: $note) {
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
