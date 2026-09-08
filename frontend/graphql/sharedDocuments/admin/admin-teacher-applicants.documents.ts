/**
 * Admin teacher-applicant directory GraphQL documents — the read-only
 * applicant-queue read model behind the /teachers applicants tab, plus its
 * server-side export-all counterpart.
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
import type {
  AdminTeacherApplicantsExportQuery,
  AdminTeacherApplicantsQuery,
} from "@/frontend/graphql/generated/gql/graphql";

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

/**
 * Applicant-queue EXPORT-ALL query — the server-side serialization source
 * for the queue's CSV download. Accepts the SAME filter argument set as the
 * listing (NO page/pageSize: the backend caps the dump at its own
 * EXPORT_MAX_ROWS and reports `truncated` honestly), reusing the EXISTING
 * item fragment so the CSV rows carry exactly the shape the queue builder
 * consumes. `total` is the FULL filtered count; `truncated === true` means
 * the dump was capped and the UI must warn. `statusCounts` is deliberately
 * NOT part of the export payload (the aggregate feeds the on-screen chips,
 * not the file).
 */
export const adminTeacherApplicantsExportQueryDocument: TypedDocumentNode<AdminTeacherApplicantsExportQuery> = gql`
  ${ADMIN_APPLICANT_LIST_ITEM_FIELDS}
  query AdminTeacherApplicantsExport($filters: AdminApplicantFiltersInput) {
    adminTeacherApplicantsExport(filters: $filters) {
      rows {
        ...AdminApplicantListItemFields
      }
      total
      truncated
    }
  }
`;
