# Backend GraphQL Pothos Layer Rules

This file governs all files under `backend/graphql/pothos/`. It complements the parent `backend/graphql/AGENTS.md`, whose rules (single canonical object type per entity, types from `@/backend/types`, no local type definitions, `id` fields for Apollo cache normalization, locale propagation, enum registration pattern) all apply here.

## Custom Scalar Registration Pattern

Custom GraphQL scalars are registered ONCE in `backend/graphql/pothos/shared/scalar.pothos.ts` via `gqlSchemaBuilder.addScalarType(...)`, backed by resolvers from `graphql-scalars` (e.g. `DateTime` ← `DateTimeResolver`). The scalar's TypeScript types are declared on the builder's `Scalars` slot in `backend/graphql/pothos/builder.ts` — keep BOTH sides in sync (registration + typing). Domain Pothos files reference the scalar by name (`t.expose("createdAt", { type: "DateTime" })`) — never re-register a scalar in a domain file (runtime error). `DateTime` serializes `Date` to ISO-8601 UTC; frontend codegen maps it to `string` (`codegen.ts`). After adding a scalar, run `bun run generate:gqlSchema` then `bun codegen`, and pin the new type name in `backend/graphql/test/schema-surface.test.ts`.

## Pothos Enum Registration Pattern

Per the parent's CRITICAL RULE, all Pothos enums are backed by real TypeScript enums from `backend/enum/` and registered once, in `shared/enum.pothos.ts`, using the enum-object form:

```typescript
import { ProfileMode } from "@/backend/enum";
export const ProfileModePothosEnum = gqlSchemaBuilder.enumType(ProfileMode, { name: "ProfileMode" });
```

Domain Pothos files import the registered enum from `shared/enum.pothos` — never re-register an enum in a domain file (it produces a "has already been declared" runtime error), and never hardcode enum value literal arrays in a `*.pothos.ts` file. After registering a new enum, run `bun run generate:gqlSchema` then `bun codegen`.

## DataLoader Batching (CRITICAL)

All field resolvers that call services or repositories per-parent-object MUST use Pothos DataLoader (`t.loadable()` for scalar/object fields, `loadableObject`/`loadableObjectRef` for top-level entity types) to batch requests and eliminate N+1 queries.

- `t.loadable()` does NOT support list-typed returns — use `t.field()` for array fields
- Batch service methods must return `Map<string, T | null>` keyed by the parent ID
- Batch repository methods must use `inArray(column, sql.placeholder("ids"))` with the transaction fallback pattern
