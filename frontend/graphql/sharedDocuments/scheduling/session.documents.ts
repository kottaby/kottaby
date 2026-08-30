import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CancelSessionMutation,
  CancelSessionMutationVariables,
  CompleteSessionMutation,
  CompleteSessionMutationVariables,
  CreateSessionMutation,
  CreateSessionMutationVariables,
  MyStudentSessionsQuery,
  MyStudentSessionsQueryVariables,
  MyTeacherSessionsQuery,
  MyTeacherSessionsQueryVariables,
  SessionByIdQuery,
  SessionByIdQueryVariables,
  StartSessionMutation,
  StartSessionMutationVariables,
} from "@/frontend/graphql/generated/gql/graphql";

/**
 * Shared GraphQL documents for the session lifecycle domain (DEV3-004).
 *
 * Seven operations over the DEV3-004 SDL surface: three reads
 * (`sessionById`, `myStudentSessions`, `myTeacherSessions`) and the
 * lifecycle quartet of mutations (`createSession`, `startSession`,
 * `completeSession`, `cancelSession`). Every `Session` payload selects
 * `id` first so Apollo Client normalizes returned rows into the cache —
 * consumers converge lists via the returned `Session!` payloads WITHOUT
 * refetch storms (per `sharedDocuments/AGENTS.md` "id Field Requirement"
 * and plan §5.4 "no refetch").
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
    }
  }
`;
