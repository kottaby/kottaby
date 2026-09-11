# Backend Types Layer Rules

## Single Canonical Object Type Pattern

Each database table/entity must have a single canonical type definition in the types layer that serves as the foundation for all GraphQL and backend operations.

### Positive Pattern (Required):
- Define a single core type per entity using Drizzle's `$inferSelect` (e.g., `{Entity}SelectType = typeof {entityTable}.$inferSelect`)
- Create a single canonical return type that extends the core type with resolved properties, enums properly typed, and forbidden fields excluded (e.g., `{Entity}ReturnType`)
- Define input types as needed (e.g., `{Entity}SubmitInput`, `{Entity}UpdateInput`) with appropriate field omissions
- Use consistent naming: `{Entity}SelectType`, `{Entity}InsertType`, `{Entity}ReturnType`, `{Entity}SubmitInput`, etc.

### Negative Pattern (Prohibited):
- Creating multiple similar types for the same entity
- Defining local types in GraphQL/Pothos files instead of using centralized types
- Creating ad-hoc type definitions like `{Entity}Definition` in Pothos files
- Duplicating entity structure across multiple type definitions without clear purpose

### Example:
```typescript
// backend/types/<domain>/<entity>.types.ts (e.g. backend/types/users/user.types.ts)
import type { {entityTable} } from "@/backend/db/schema";

export type {Entity}SelectType = typeof {entityTable}.$inferSelect;
export type {Entity}InsertType = typeof {entityTable}.$inferInsert;

export type {Entity}ReturnType = Omit<{Entity}SelectType, 
  // Remove forbidden fields like deletedAt, internal fields
  | "deletedAt"
  | "internalNotes"
> & {
  // Reapply enums with proper typing
  status: StatusEnum;
  role: RoleEnum;
  // Add resolved properties
  resolvedProperty?: string;
};
```

## GraphQL Integration

- Types defined here must be compatible with GraphQL Pothos object implementations
- Use `Omit` to exclude forbidden properties (like `deletedAt`) from GraphQL exposure
- Add resolved properties that come from joins as optional fields
- Enums should be properly typed using shared enum types

## Base Interface Pattern (Duplication Elimination)

When multiple entity types share identical fields/methods, extract a `*Base*` type in a shared types file rather than duplicating the shape across per-entity type files.

## Types Location Rules (CRITICAL)

- **All `.types.ts` files MUST live in `backend/types/`.** Service-layer files must not define or re-export types — import from `@/backend/types` instead.
- **If a service file contains both types and runtime code, split:** types → `backend/types/`, runtime → stays in the service layer with a non-`.types` filename (e.g., `.helpers.ts`, `.constants.ts`).
- **`backend/types/**/index.ts` barrels MUST use `./` relative paths and `export * from "./..."`.** No `@/` aliases, no `../` parent traversal, no explicit per-export `export type { ... }`.
- **`DBTransaction` and `DBQueryExecutor` live in `@/backend/types`.** All consumers import from `@/backend/types`.

## Cross-Layer Enums

`shared/constants/` is the canonical home for cross-layer enums. A duplicate under `backend/enum/` must be converted to a re-export of the `shared/constants/` definition rather than maintained as a second source of truth.

## Schema Ground Truth

All `$inferSelect`/`$inferInsert` types derive from `backend/db/schema/<domain>/`, which is the sole structural ground truth. Cross-stream contract types live in `contracts/`.
