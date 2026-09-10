/**
 * Admin teacher-directory query — `adminTeachers`, the paginated listing
 * over certified `teacher` rows joined to their `users` accounts, plus the
 * `adminTeachersExport` export-all sibling (same filters, NO pagination —
 * the first 1000 filtered rows with an honest `truncated` cap flag).
 *
 * Contracts:
 *  - `adminTeachers(filters: AdminTeacherFiltersInput, page: Int, pageSize: Int): AdminTeacherPage!`
 *  - `adminTeachersExport(filters: AdminTeacherFiltersInput): AdminTeacherExportEnvelope!`
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
 *  - The pagination plumbing (optional `page`/`pageSize` args, the
 *    positive-safe-integer guard — no `as number` —) is shared via
 *    `query/admin/shared/adminDirectoryPagination.helpers.ts`; the
 *    `ctx.user` belt reuses `requireAdminUser` from
 *    `backend/graphql/shared/admin-prelude.ts` (TS narrowing only — the
 *    translated `UnauthorizedError` matches the `authenticated` scope's
 *    own throw, so the belt is invisible when the scope did its job).
 *    The export sibling takes NO pagination arguments (the 1000-row bound
 *    lives in the service, not in caller-supplied args).
 *  - Filter args are copied FIELD-BY-FIELD into the service's closed
 *    submit-input whitelist — NO `{ ...input }` spread. The input type is
 *    the schema's BOPLA boundary: smuggled fields die at GraphQL validation
 *    before a resolver runs, and only the four whitelisted members cross.
 *  - Delegates to `AdminTeacherDirectoryService.list` / `.exportAll` with
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
import {
  AdminTeacherExportEnvelopePothosObject,
  AdminTeacherFiltersInput,
  AdminTeacherPagePothosObject,
} from "@/backend/graphql/pothos/admin";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import {
  adminDirectoryPaginationArgs,
  resolveAdminDirectoryPageBounds,
} from "@/backend/graphql/query/admin/shared/adminDirectoryPagination.helpers";
import { adminOnlyAuthScopes, requireAdminUser } from "@/backend/graphql/shared";
import { AdminTeacherDirectoryService } from "@/backend/services";

// Side-effect: register the `adminTeachers` directory query field.
gqlSchemaBuilder.queryField("adminTeachers", t =>
  t.field({
    type: AdminTeacherPagePothosObject,
    args: {
      filters: t.arg({ type: AdminTeacherFiltersInput, required: false }),
      ...adminDirectoryPaginationArgs(t),
    },
    authScopes: adminOnlyAuthScopes,
    resolve: async (_root, args, ctx) => {
      const user = await requireAdminUser(ctx);
      const { page, pageSize } = resolveAdminDirectoryPageBounds(args.page, args.pageSize);
      return AdminTeacherDirectoryService.list(
        {
          search: args.filters?.search ?? null,
          approval: args.filters?.approval ?? null,
          online: args.filters?.online ?? null,
          evaluator: args.filters?.evaluator ?? null,
        },
        page,
        pageSize,
        ctx.locale,
        user.id
      );
    },
  })
);

// Side-effect: register the `adminTeachersExport` export-all query field.
gqlSchemaBuilder.queryField("adminTeachersExport", t =>
  t.field({
    type: AdminTeacherExportEnvelopePothosObject,
    args: {
      filters: t.arg({ type: AdminTeacherFiltersInput, required: false }),
    },
    authScopes: adminOnlyAuthScopes,
    resolve: async (_root, args, ctx) => {
      const user = await requireAdminUser(ctx);
      return AdminTeacherDirectoryService.exportAll(
        {
          search: args.filters?.search ?? null,
          approval: args.filters?.approval ?? null,
          online: args.filters?.online ?? null,
          evaluator: args.filters?.evaluator ?? null,
        },
        ctx.locale,
        user.id
      );
    },
  })
);
