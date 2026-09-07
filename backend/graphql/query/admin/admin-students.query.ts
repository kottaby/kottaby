/**
 * Admin student-directory query — `adminStudents`, the paginated listing
 * over `students` rows joined to their `users` accounts (with the linked
 * parent's display identity resolved via a left join).
 *
 * Contract:
 *  - `adminStudents(filters: AdminStudentFiltersInput, page: Int, pageSize: Int): AdminStudentPage!`
 *
 * authScopes (`$all` conjunction, MANDATORY):
 *  - `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }`
 *  - Anonymous → `UNAUTHORIZED` (401); authenticated non-admin → `FORBIDDEN`
 *    (403) — both BEFORE the resolver body runs.
 *  - A plain `{ authenticated: true, role: [...] }` map is WRONG: Pothos
 *    combines scope keys with ANY semantics unless `$all` makes the
 *    conjunction explicit.
 *
 * Resolver discipline (thin resolvers):
 *  - Pagination args → the positive-safe-integer guard (no `as number`).
 *  - Filter args are copied FIELD-BY-FIELD into the service's closed
 *    submit-input whitelist — NO `{ ...input }` spread. The input type is
 *    the schema's BOPLA boundary: smuggled fields die at GraphQL validation
 *    before a resolver runs, and only the three whitelisted members cross.
 *  - Delegates to `AdminStudentDirectoryService.list` with
 *    `(…, ctx.locale, ctx.user.id)`; reads emit NO audit rows.
 *  - Resolvers throw NOTHING directly; service `DomainError` subclasses
 *    propagate with `extensions.code` and boundary masking.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - NO named exports — root fields register at import time via
 *    `gqlSchemaBuilder.queryField(...)`.
 *  - Wired through side-effect barrels:
 *    `query/admin/index.ts` → `query/index.ts` → `gqlSchema.ts`.
 */
import { AdminStudentFiltersInput, AdminStudentPagePothosObject } from "@/backend/graphql/pothos/admin";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { adminOnlyAuthScopes } from "@/backend/graphql/shared";
import { UnauthorizedError, ValidationError } from "@/backend/lib/errors";
import { AdminStudentDirectoryService } from "@/backend/services";

/**
 * Positive-safe-integer guard for pagination arguments. `page` must be ≥ 1;
 * `pageSize` must be in `1..100`. Both default when absent.
 */
function resolvePagination(
  page: number | undefined | null,
  pageSize: number | undefined | null
): {
  page: number;
  pageSize: number;
} {
  const resolvedPage = page ?? 1;
  const resolvedPageSize = pageSize ?? 25;
  if (!Number.isInteger(resolvedPage) || resolvedPage < 1) {
    throw new ValidationError("page must be a positive integer");
  }
  if (!Number.isInteger(resolvedPageSize) || resolvedPageSize < 1 || resolvedPageSize > 100) {
    throw new ValidationError("pageSize must be an integer in 1..100");
  }
  return { page: resolvedPage, pageSize: resolvedPageSize };
}

// Side-effect: register the `adminStudents` directory query field.
gqlSchemaBuilder.queryField("adminStudents", t =>
  t.field({
    type: AdminStudentPagePothosObject,
    args: {
      filters: t.arg({ type: AdminStudentFiltersInput, required: false }),
      page: t.arg({ type: "Int", required: false }),
      pageSize: t.arg({ type: "Int", required: false }),
    },
    authScopes: adminOnlyAuthScopes,
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      const { page, pageSize } = resolvePagination(args.page, args.pageSize);
      return AdminStudentDirectoryService.list(
        {
          search: args.filters?.search ?? null,
          hasParent: args.filters?.hasParent ?? null,
          language: args.filters?.language ?? null,
        },
        page,
        pageSize,
        ctx.locale,
        ctx.user.id
      );
    },
  })
);
