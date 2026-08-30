/**
 * Re-export shim — DateTime scalar is registered canonically in
 * `scalar.pothos.ts` via `gqlSchemaBuilder.addScalarType("DateTime", DateTimeResolver)`.
 * This module re-exports the ref as `DateTimePothosScalar` for backward
 * compatibility with consumers that import from this path.
 */
export { DateTimeScalar as DateTimePothosScalar } from "@/backend/graphql/pothos/shared/scalar.pothos";
