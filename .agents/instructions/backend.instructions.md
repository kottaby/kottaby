---
applyTo: "backend/**/*.ts"
---

# Backend Rules

### Architecture & Layer Separation

- 6-layer data flow: Schema -> Types -> Repo -> Service -> GraphQL -> Test
- Schema (`backend/db/schema/`): Drizzle table definitions + enums
- Types (`backend/types/`): canonical type definitions per entity
- Repo (`backend/db/repo/`): data-access ONLY - no business logic, no permission checks, no hardcoded error strings
- Service (`backend/services/`): business logic, permissions, data transformations, orchestrates repos
- GraphQL (`backend/graphql/pothos/`): resolvers delegate to services (NEVER repos), propagate `ctx.locale`
- Test (`backend/db/test/`): `repo/` = 100% coverage of individual methods, `logic/` = multi-entity workflows
- Server Components call services directly (not GraphQL) - services must not rely on GraphQL-specific contexts
- Domain-driven services - no monolithic services

### Type Definition Pattern (CRITICAL)

- ALL types from `@/backend/types` - NEVER local definitions in Pothos files
- Import with `@/backend/types` alias, never relative paths (`../../types/...`)
- Foundation types from Drizzle:
  ```ts
  export type {Entity}SelectType = typeof {entityTable}.$inferSelect;
  export type {Entity}InsertType = typeof {entityTable}.$inferInsert;
  ```
- ReturnType pattern - Omit forbidden fields, re-apply enums, add resolved optionals:
  ```ts
  export type {Entity}ReturnType = Omit<{Entity}SelectType,
    | "deletedAt"
  > & {
    status: StatusEnum;          // re-apply proper enum type
    resolvedProperty?: string;    // joined/computed fields
  };
  ```
- Input type: `{Entity}SubmitInput` for mutation/filter inputs
- **ReturnType conversion (CRITICAL)**: raw `$inferSelect` rows are NOT assignable to `*ReturnType` shapes that re-type pgEnum columns as TS enums (Omit + enum override) — map rows through total-over-vocabulary mappers (spread + enum-member overrides) before returning them; enum members flow through without casts, raw string unions do not
- NEVER create local types in Pothos files: `{Entity}Definition`, `<Entity>SimpleDefinition`
- Single canonical GraphQL object type per entity - clients select fields they need
- Types must be compatible with Pothos object implementations
- Update `backend/types/index.ts` when adding new entity types
- Frontend stores must not redefine types that exist in GraphQL generated types

### Pothos / GraphQL

- `nullable: true` REQUIRED for nullable TypeScript types (Pothos defaults non-nullable)
- Object ref always uses ReturnType:
  ```ts
  import type { EntityReturnType } from "@/backend/types";
  const {Entity}Ref = gqlSchemaBuilder.objectRef<{Entity}ReturnType>("<Entity>");
  ```
- Input types from `backend/types/` (e.g., `{Entity}SubmitInput`)
- Exception: input types and collection wrapper types (paginated results) allowed as separate definitions
- Complex computed/derived types that don't map to a single table may need custom definitions - but still import base types from `backend/types/`
- `id` field on all GraphQL objects (Apollo cache normalization)
- Error translation: direct errors in resolvers must use `ctx.t("<namespace>")` (already bound to `ctx.locale`)
- Resolvers must propagate `ctx.locale` to service and repository calls
- **DataLoader Batching (CRITICAL)**: All field resolvers calling services/repos per-parent MUST use `t.loadable()` (scalar/object fields) or `loadableObject`/`loadableObjectRef` (top-level entities) to eliminate N+1 queries. `t.loadable()` does NOT support list-typed returns — use `t.field()` for array fields.
- **No Dynamic Imports in Pothos Files**: NEVER use `await import(...)` inside resolver functions or anywhere in `*.pothos.ts` files. Bun's module bundler marks the entire module tree as async ESM, breaking CommonJS `require()` consumers of `graphql`. Use top-level static imports instead.
- **Field Factories**: When multiple Pothos object types share identical field definitions, extract them into `shared/` helper modules using the `_*Fields(t, options?)` pattern. For query/mutation fields with duplicated args/auth/resolve boilerplate, use the `make*QueryField()` / `make*MutationField()` factory pattern, calling `gqlSchemaBuilder.queryField`/`gqlSchemaBuilder.mutationField` directly.
- **DomainError (CRITICAL)**: All GraphQL resolver errors MUST extend DomainError (from `@/backend/lib/errors`) to propagate structured `extensions.code` to clients. Never throw plain `Error` in resolvers.

### Repository Layer

- Drizzle ORM only for PostgreSQL
- When `findMany` with complex relations causes `SQL<unknown>` errors or missing TypeScript properties, use `.select().from().leftJoin()` or manual ID-based mapping
- Conditional aggregation: `sql<number>` template with `.mapWith(Number)` - not raw DB casts like `CAST(... AS INTEGER)`:
  ```ts
  sql<number>`CASE WHEN ${table.status} = 'ACTIVE' THEN 1 ELSE 0 END`.mapWith(Number)
  ```
- No hardcoded error strings - use `getServerTranslations(locale, "<namespace>")` from `@/shared/locale/server-graphql` with `locale?: string` (standalone contexts); repositories accessed from GraphQL resolvers receive translated messages via `ctx.t("<namespace>")` propagated from the resolver
- Repos use `{Entity}SelectType` / `{Entity}InsertType` from `backend/types/`, not raw schema references
- Repos must NOT contain business logic, permission checks, or complex orchestration (service layer only)
- **Prepared Statements (CRITICAL)**: All simple read-only methods MUST use Drizzle Prepared Statements 2.0 (`sql.placeholder(...)`) at module level.
- **`inArray` + Prepared Statements PROHIBITED**: PostgreSQL prepared statement protocol treats `$1` as a single scalar — cannot expand array parameters for `IN` clauses. Use dynamic queries for `inArray` batch lookups.
- **Batch Lookup Methods**: For DataLoader support, expose `findBy{Key}Ids(ids: string[], tx?)` returning `Map<string, T | null>`. Use `inArray(col, ids)` with plain arrays (NOT `sql.placeholder`). Pre-init map with all keys → null, fill matches.
- **Schema Helpers**: Shared column configs and junction table patterns use helpers from `shared/columnHelpers.ts` and `shared/junctionTableHelper.ts` — never duplicate boilerplate column/junction definitions.
- **Cross-Layer Enum Rule**: Canonical cross-layer enums live in `shared/constants/`. Never duplicate an enum definition in `backend/enum/`; re-export or import from `@/shared/constants/`.

### Service Layer

- Business logic hub: all business rules, complex permission gating, orchestration before calling repos
- Data transformations between types (e.g., `SubmitInput` -> `InsertType`, `SelectType` -> `ReturnType`)
- Import types from `@/backend/types` for function signatures - no ad-hoc type definitions
- Never call other services outside your domain boundary - each domain owns its own service
- SSR-compatible: must not rely on GraphQL-specific contexts unless passed explicitly
- Treat `locale` as optional parameter - pass from GraphQL context or Server Component as needed
- **Permission Context Propagation**: Services that check permissions MUST accept pre-loaded permission context passed from the caller (e.g. the GraphQL context's `UserPermissionContext`) instead of re-querying permissions inside the service.
- **Batch Service Methods**: Services called from GraphQL resolvers MUST expose batch versions (e.g., `resolve{Entity}Ids(ids: string[])`) returning `Map<string, T | null>`. Delegate to batch repository methods.

### Seeds (CRITICAL)

- Every table has its own `seedOrGet` function in a dedicated file (e.g., `seed-{entity}.ts`)
- Do NOT combine distinct domains in one seeder file - one seeder per table
- `seedOrGet` must be idempotent: `onConflictDoUpdate` / `onConflictDoNothing` - safe to re-run without creating duplicates
- Check constraints before seeding - read `backend/db/schema/*.ts`
- Match PostgreSQL enums EXACTLY from `backend/db/schema/enums.ts` or `shared/lib/enum.ts` - never guess valid values
- Schema changes: MUST run `bun run scripts/dbActions.ts push` before `bun run db seed`. **Note: `db reset` and `db cleanGenerate` are permanently disabled by repo policy** — use `db push` for schema changes and `db migrate` for migration management.
- Custom SQL migrations: every `backend/db/migration/*.sql` file is auto-bundled into its own `backend/drizzle/<ts>_custom_<slug>/` folder on the next `migrate` (manifest in `backend/drizzle/.custom-migrations.json`); SQLite parity files (`*-sqlite.sql`) are NEVER bundled — each new one MUST be added to `EXCLUDED_FILES` in `backend/db/scripts/applyCustomMigrations.ts`, or `migrate` fails on PostgreSQL syntax
- Return seeded entities for downstream seeders - other seeders should not need to re-query
- Dependencies passed via controller context (`index.ts`) - call other `seedOrGet` functions or accept as parameter
- If strict Entity types unavailable: create new types in `backend/types/`, update `index.ts` - never use `any` or inline types
- Favor `db.select().from(table).where(...)` over `db.query.table.findFirst()` if strict typing issues with relational queries
- If a seeder exceeds ~70-80 lines, extract distinct steps into named functions

### GraphQL Schema Generation

- After modifying Pothos schema files, run: `~/.bun/bin/bun run generate:gqlSchema`
- After modifying documents or schema, also run: `~/.bun/bin/bun codegen`
- Both steps required for consistent frontend-backend type integration

### Database Access Patterns

- **Neon HTTP Client for Bare Reads**: All non-transactional read methods in database repositories MUST use `queryDb(tx)` from `@/backend/db`.
- **Prepared Statements**: Simple read-only methods executing on TCP mode may use Drizzle Prepared Statements 2.0 (`sql.placeholder(...)`) defined at module level.
- Services used by Server Components must not rely on GraphQL-specific contexts - passed explicitly if needed
- Drizzle `$inferSelect` / `$inferInsert` as foundation for all entity types
- Use `React.cache()` wrappers for Server Component data sharing - placed in `backend/lib/auth/` or similar shared location

### Database Testing

- See `tests.instructions.md` (`.agents/instructions/`) for comprehensive test rules (`runInRollback`, `tx` propagation, no seed-data queries, etc.)

### Code Style

- No nested ternary operators - extract into if/else or separate functions (SonarJS code smell)
