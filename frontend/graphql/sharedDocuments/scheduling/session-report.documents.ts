import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  SessionHomeWorkQuery,
  SessionHomeWorkQueryVariables,
  SessionReportQuery,
  SessionReportQueryVariables,
  SubmitSessionReportMutation,
  SubmitSessionReportMutationVariables,
} from "@/frontend/graphql/generated/gql/graphql";

/**
 * Session REPORT + HOMEWORK documents — the grading/review third
 * of the scheduling family split out of `session.documents.ts` (which
 * re-exports every sibling, so the deep-import path and the export surface
 * are unchanged).
 *
 * The trio: the teacher submit mutation (`submitSessionReport`)
 * and the two participant reads of the resulting artifacts
 * (`sessionReport`, `sessionHomework` — both NULLABLE roots). Every
 * `SessionReport`/`SessionHomeWork` payload selects `id` first so Apollo
 * Client normalizes returned rows into the cache (per
 * `sharedDocuments/AGENTS.md` "id Field Requirement"); both objects carry
 * `id`, so no `keyFields: false` registration exists for them in
 * `apolloCache.ts`.
 *
 * Selection contract (plan §5, pinned by `session-report.documents.test.ts`):
 * `id` FIRST on every object selection and NO field beyond the
 * object contracts (`SessionReport` = 6 fields, `SessionHomeWork` = 12);
 * `createdAt`/`updatedAt` ride the registered `DateTime` scalar (codegen
 * `string`); the homework enum legs select as `SurahJuzRef` codegen enum
 * members (plain enum leaves — no sub-selection); the homework nullable
 * legs ride as-is (an ungraded session yields null track fields).
 *
 * All types come from the codegen output
 * (`@/frontend/graphql/generated/gql/graphql`) — never inline literals
 * as TYPES, never mapping layers. Hooks (`useQuery`, `useMutation`) are
 * consumed from `@apollo/client/react` in views; `useLazyQuery` is banned.
 */

/**
 * `submitSessionReport(id: ID!, input: SubmitSessionReportInput!)` — a
 * session teacher submits the post-session report (notes + rating) and the
 * optional homework assignment/previous grades for a completed session.
 * The input is a CLOSED server whitelist (`SubmitSessionReportInput` —
 * `teacherNotes`, `studentRatingByTeacher`, `homework`, `previousGrades`);
 * identity and timestamps are server-owned. Returns the created
 * `SessionReport!` for cache normalization. Wrong-state submits deny as
 * `SESSION_INVALID_TRANSITION`, a second submit as
 * `SESSION_REPORT_ALREADY_EXISTS`; governed teachers deny `FORBIDDEN`.
 */
export const submitSessionReportMutationDocument: TypedDocumentNode<
  SubmitSessionReportMutation,
  SubmitSessionReportMutationVariables
> = gql`
  mutation SubmitSessionReport($id: ID!, $input: SubmitSessionReportInput!) {
    submitSessionReport(id: $id, input: $input) {
      id
      sessionId
      teacherNotes
      studentRatingByTeacher
      createdAt
      updatedAt
    }
  }
`;

/**
 * `sessionReport(sessionId: ID!)` — nullable participant read of the
 * session's submitted report. Foreign/nonexistent session ids collapse to
 * `null` (one no-oracle answer — the row is sensitive), so consumers must
 * handle the empty case.
 */
export const sessionReportQueryDocument: TypedDocumentNode<SessionReportQuery, SessionReportQueryVariables> = gql`
  query SessionReport($sessionId: ID!) {
    sessionReport(sessionId: $sessionId) {
      id
      sessionId
      teacherNotes
      studentRatingByTeacher
      createdAt
      updatedAt
    }
  }
`;

/**
 * `sessionHomework(sessionId: ID!)` — nullable participant read of the
 * session's homework record. Both tracks are nullable legs of the
 * `SessionHomeWork` contract: an ungraded session yields `null` ayah/grade/
 * `SurahJuzRef` fields, riding as-is (no client-side defaults).
 */
export const sessionHomeworkQueryDocument: TypedDocumentNode<SessionHomeWorkQuery, SessionHomeWorkQueryVariables> = gql`
  query SessionHomeWork($sessionId: ID!) {
    sessionHomework(sessionId: $sessionId) {
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
  }
`;
