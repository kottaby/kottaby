/**
 * Admin teacher-applicant directory GraphQL documents — the read-only
 * applicant-queue read model behind the /teachers applicants tab.
 *
 * Per `frontend/graphql/sharedDocuments/AGENTS.md`:
 *  - Documents use `gql` + `TypedDocumentNode` (codegen types only).
 *  - `id` is selected FIRST in every object (Apollo cache normalization).
 *  - Hooks consumed from `@apollo/client/react` in views:
 *    `useQuery` ONLY — NO `useLazyQuery`.
 *  - Variables are typed, never string-interpolated.
 *  - No sensitive field (`passwordHash`) is ever selected.
 *
 * The applicant queue is a pure READ surface (no mutations): certification
 * and governance actions live on the admin user-detail page, so the queue
 * only deep-links there. The backend derives the actor identity
 * server-side, so no caller-identity argument exists in the document.
 */
import { gql, type TypedDocumentNode } from "@apollo/client";
import type { AdminTeacherApplicantsQuery } from "@/frontend/graphql/generated/gql/graphql";

/** Shared list-item fragment for the applicant queue. */
const ADMIN_APPLICANT_LIST_ITEM_FIELDS = gql`
  fragment AdminApplicantListItemFields on AdminApplicantItem {
    id
    name
    email
    phone
    country
    status
    verificationAttempts
    lastAttemptAt
    cooldownUntil
    isDeleted
    suspended
    isBlocked
    createdAt
  }
`;

/**
 * Teacher-applicant queue query — paginated, filterable. The envelope
 * carries the honest `total` + server-computed `pageCount`;
 * `page`/`pageSize` are ALWAYS provided by the queue hook, so the
 * variables are non-null. `statusCounts` is the backend's search-aware /
 * status-filter-independent per-status aggregate (quick-filter chips stay
 * meaningful while a status filter is active).
 */
export const adminTeacherApplicantsQueryDocument: TypedDocumentNode<AdminTeacherApplicantsQuery> = gql`
  ${ADMIN_APPLICANT_LIST_ITEM_FIELDS}
  query AdminTeacherApplicants($filters: AdminApplicantFiltersInput, $page: Int!, $pageSize: Int!) {
    adminTeacherApplicants(filters: $filters, page: $page, pageSize: $pageSize) {
      items {
        ...AdminApplicantListItemFields
      }
      total
      page
      pageSize
      pageCount
      statusCounts {
        pending
        inEvaluation
        failed
        passed
      }
    }
  }
`;
