/**
 * Admin student directory GraphQL documents — read-only directory query.
 *
 * Per `frontend/graphql/sharedDocuments/AGENTS.md`:
 *  - Documents use `gql` + `TypedDocumentNode` (codegen types only).
 *  - `id` is selected FIRST in every object (Apollo cache normalization).
 *  - Hooks consumed from `@apollo/client/react` in views:
 *    `useQuery` ONLY — NO `useLazyQuery`.
 *  - Variables are typed, never string-interpolated.
 *  - No sensitive field (`passwordHash`) is ever selected.
 *
 * The admin student directory is a pure READ surface (no mutations): the
 * backend derives the actor identity server-side, so no caller-identity
 * argument exists in the document.
 */
import { gql, type TypedDocumentNode } from "@apollo/client";
import type { AdminStudentsQuery } from "@/frontend/graphql/generated/gql/graphql";

/** Shared list-item fragment for the student directory. */
const ADMIN_STUDENT_LIST_ITEM_FIELDS = gql`
  fragment AdminStudentListItemFields on AdminStudentItem {
    id
    name
    email
    phone
    country
    balanceHifz
    balanceReviews
    balanceTajweed
    balanceTrial
    trialGrantedAt
    primaryLanguage
    anotherLanguage
    hasParent
    parentName
    parentEmail
    createdAt
  }
`;

/**
 * Student directory query — paginated, filterable. The envelope carries the
 * honest `total` + server-computed `pageCount`; `page`/`pageSize` are ALWAYS
 * provided by the directory hook, so the variables are non-null.
 */
export const adminStudentsQueryDocument: TypedDocumentNode<AdminStudentsQuery> = gql`
  ${ADMIN_STUDENT_LIST_ITEM_FIELDS}
  query AdminStudents($filters: AdminStudentFiltersInput, $page: Int!, $pageSize: Int!) {
    adminStudents(filters: $filters, page: $page, pageSize: $pageSize) {
      items {
        ...AdminStudentListItemFields
      }
      total
      page
      pageSize
      pageCount
    }
  }
`;
