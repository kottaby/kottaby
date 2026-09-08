/**
 * Admin teacher directory GraphQL documents — the read-only directory
 * listing plus its server-side export-all counterpart.
 *
 * Per `frontend/graphql/sharedDocuments/AGENTS.md`:
 *  - Documents use `gql` + `TypedDocumentNode` (codegen types only).
 *  - `id` is selected FIRST in every object (Apollo cache normalization).
 *  - Hooks consumed from `@apollo/client/react` in views:
 *    `useQuery` ONLY — NO `useLazyQuery`.
 *  - Variables are typed, never string-interpolated.
 *  - No sensitive field (`passwordHash`) is ever selected.
 *
 * The admin teacher directory is a pure READ surface (no mutations): the
 * backend derives the actor identity server-side, so no caller-identity
 * argument exists in the document.
 */
import { gql, type TypedDocumentNode } from "@apollo/client";
import type { AdminTeachersExportQuery, AdminTeachersQuery } from "@/frontend/graphql/generated/gql/graphql";

/** Shared list-item fragment for the teacher directory. */
const ADMIN_TEACHER_LIST_ITEM_FIELDS = gql`
  fragment AdminTeacherListItemFields on AdminTeacherItem {
    id
    name
    email
    phone
    country
    isApproved
    isEvaluator
    averageRating
    isOnline
    subjects
    isDeleted
    suspended
    isBlocked
    createdAt
  }
`;

/**
 * Teacher directory query — paginated, filterable. The envelope carries the
 * honest `total` + server-computed `pageCount`; `page`/`pageSize` are ALWAYS
 * provided by the directory hook, so the variables are non-null.
 */
export const adminTeachersQueryDocument: TypedDocumentNode<AdminTeachersQuery> = gql`
  ${ADMIN_TEACHER_LIST_ITEM_FIELDS}
  query AdminTeachers($filters: AdminTeacherFiltersInput, $page: Int!, $pageSize: Int!) {
    adminTeachers(filters: $filters, page: $page, pageSize: $pageSize) {
      items {
        ...AdminTeacherListItemFields
      }
      total
      page
      pageSize
      pageCount
    }
  }
`;

/**
 * Teacher directory EXPORT-ALL query — the server-side serialization source
 * for the CSV download. Accepts the SAME filter argument set as the listing
 * (NO page/pageSize: the backend caps the dump at its own EXPORT_MAX_ROWS
 * and reports `truncated` honestly), reusing the EXISTING item fragment so
 * the CSV rows carry exactly the shape the current-page builder consumes.
 * `total` is the FULL filtered count (what the listing would report across
 * all pages); `truncated === true` means the dump was capped and the UI must
 * warn.
 */
export const adminTeachersExportQueryDocument: TypedDocumentNode<AdminTeachersExportQuery> = gql`
  ${ADMIN_TEACHER_LIST_ITEM_FIELDS}
  query AdminTeachersExport($filters: AdminTeacherFiltersInput) {
    adminTeachersExport(filters: $filters) {
      rows {
        ...AdminTeacherListItemFields
      }
      total
      truncated
    }
  }
`;
