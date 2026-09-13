# Backend Architecture Pattern

This document outlines the standard architectural pattern used throughout the backend for defining and managing entity types consistently across all layers.

## Standard Type Definition Pattern

The backend follows a consistent pattern for defining and using types across all layers:

### 1. Database Schema (`backend/db/schema/*.ts`)
- Define the database table structure using Drizzle ORM
- Example: `{entityTable}` table in `backend/db/schema/{location}.ts`

### 2. Type Definitions (`backend/types/*.types.ts`)
- Define TypeScript types using Drizzle's `$inferSelect` and `$inferInsert`
- Create custom input/output types with appropriate transformations
- Define specialized types for different use cases (e.g., `{Entity}SubmitInput`, `{Entity}ReturnType`)
- Example: `{Entity}SelectType`, `{Entity}InsertType`, `{Entity}SubmitInput`, `{Entity}ReturnType` in `backend/types/{entity}.types.ts`

### 3. Repository Layer (`backend/db/repo/*repository.ts`)
- Use types defined in `backend/types/` for function parameters and return types
- Focus solely on data access operations
- Apply business logic constraints at the service layer, not in repositories
- Example: Using `{Entity}InsertType` for insert operations and `{Entity}SelectType` for select operations in `{entity}.repository.ts`
- **Bare Reads**: All non-transactional read methods in database repositories MUST use `queryDb(tx)` from `@/backend/db`.
- **Prepared Statements**: Simple read-only methods executing on TCP mode may use Drizzle Prepared Statements 2.0 (`sql.placeholder(...)`) defined at module level. Module-level prepared statements MUST be removed if replaced by `queryDb(tx)`.
- **Batch Lookup Methods**: Repositories that support DataLoader batching MUST expose `findBy{Key}Ids(ids: string[], tx?)` methods returning `Map<string, T | null>`. Use `inArray(column, ids)` with plain arrays.

### 4. Service Layer (`backend/services/**/*.ts`)
- Import and use types from `backend/types/` for function signatures
- Handle business logic, permissions, and orchestration
- Perform data transformations as needed between types
- Example: Using `{Entity}SubmitInput` for input validation and `{Entity}ReturnType` for output in `{entity}.service.ts`
- **Batch Service Methods**: Services called from GraphQL resolvers MUST expose batch versions (e.g., `resolve{Entity}IdsForUsers(userIds: string[])`) returning `Map<string, T | null>` for DataLoader support.
- **Hot-Resolver & Read Caching**: Hot read paths use `cachedRead` from `@/backend/services/cache` with identity+role-scoped key formats. Mutation write paths invoke tag invalidation helpers in `try/catch`.
- **Single-Writer Discipline**: Where a table has a designated single-writer service/repository pair, all state changes to that table MUST flow through it; no other service writes to it directly.

### 5. GraphQL Layer (`backend/graphql/pothos/*.pothos.ts`)
- Reference types from `backend/types/` for Pothos object implementations
- Create Pothos input and object types that map to backend types
- Maintain consistency between GraphQL types and backend service types
- Example: Using `{Entity}ReturnType` for the GraphQL `{Entity}` object in `{entity}.pothos.ts`
- **DataLoader Batching**: All field resolvers that call services per-parent-object MUST use `t.loadable()` or `loadableObject` to eliminate N+1 queries.

### 6. Test Layer (`backend/db/test/repo/*.test.ts`)
- Import and use the same types from `backend/types/` for consistent testing
- Verify that repository functions return expected type structures
- Example: Using `{Entity}SelectType` and `{Entity}ReturnType` in `{entity}.repository.test.ts`
- Always use the `runInRollback` wrapper for DB tests and pass `tx` to ALL repository methods inside transactions

## Single Canonical Object Type Pattern (CRITICAL RULE)

### Positive Pattern (Required):
- Each entity should have a single canonical GraphQL object type that represents the complete entity structure
- Use types from `backend/types/` as the foundation for GraphQL object types
- Allow GraphQL clients to request only the fields they need through field selection
- Add resolved properties (joins, computed values) to the canonical type as needed

### Negative Pattern (PROHIBITED):
- Creating multiple GraphQL object types for the same entity when one canonical type would suffice
- Defining local type definitions within Pothos files (e.g., `export type {Entity}Definition = {...}`)
- Duplicating entity structure in local types instead of using centralized types from `backend/types/`
- Creating ad-hoc types like `export type <Entity>SimpleDefinition`

## Key Benefits

- **Consistency**: Types are defined once and reused across all backend layers
- **Maintainability**: Changes to entity structure only require updates in one place (the type definition file)
- **Type Safety**: Full type safety across all layers using the same definitions
- **Clarity**: Clear separation of concerns with well-defined interfaces between layers
- **Reduced Duplication**: No need to redefine entity structures multiple times across layers
- **GraphQL Efficiency**: Single canonical types allow for flexible field selection by clients

## Best Practices

- Always define types in `backend/types/{entity}.types.ts` when creating new entities
- Import types using the alias `@/backend/types` consistently
- Use Drizzle's `$inferSelect` and `$inferInsert` as the foundation for your types
- Create specialized variations (input types, return types) as needed for different use cases
- Follow the naming convention: `{Entity}SelectType`, `{Entity}InsertType`, `{Entity}ReturnType`, `{Entity}SubmitInput`, etc.
- Use a single canonical GraphQL object type per entity, extending it with resolved properties as needed
- Never create local type definitions in Pothos files; always use types from `backend/types/`
- **Service-layer `.types.ts` files are prohibited.** All types live in `backend/types/`. Provider-specific types are in `backend/types/<domain>/`.
- `DBTransaction` / `DBQueryExecutor` live in `@/backend/types`. Import from `@/backend/types` only.

## Linting

- NEVER use `oxlint-disable` comments — fix the root cause.

## Error Handling

- GraphQL error handling: DomainError → GraphQLError extensions.code propagation.
- **Taxonomy-only statuses**: HTTP statuses for errors MUST derive from `ERROR_CODE_HTTP_STATUS` via `normalizeErrorCode(...)` in `backend/lib/errors/error-code-taxonomy.ts`; numeric error-status literals anywhere else are prohibited (grep-gated).
- **Envelope helpers location**: API routes use `resolveRequestId` / `apiSuccessResponse` / `apiErrorResponse` from the `@/backend/lib/api` barrel — never hand-roll `{ data }` / `{ error }` bodies.

## Reference Docs

- Billing subscription validity window & expiry (window arithmetic, expiry sweep, lane zeroing, booking gate, cron trigger contract): `docs/billing/subscription-validity-window-expiry.md`
