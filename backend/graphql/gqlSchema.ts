/**
 * GraphQL schema assembler — the single, project-wide Pothos schema.
 *
 * Wiring order (CRITICAL):
 *  1. Import `gqlSchemaBuilder` (Pothos SchemaBuilder with plugins loaded).
 *  2. Side-effect-import the Pothos object barrel (`pothos/index.ts`) —
 *     registers domain object types that land ahead of their resolvers
 *     (e.g. notifications) directly on the builder.
 *  3. Side-effect-import the enum registry (`shared/enum.pothos.ts`) —
 *     registers every TS enum as a GraphQL enum ONCE.
 *  4. Side-effect-import the query + mutation barrels — register every root
 *     field on the builder (each resolver transitively registers the domain
 *     objects it returns).
 *  5. Call `gqlSchemaBuilder.toSchema()` — finalizes the SDL.
 *
 * Apollo Server consumes `graphQLSchema` from `app/api/graphql/route.ts`.
 *
 * After any Pothos change, run:
 *   bun run generate:gqlSchema  # writes frontend/graphql/generated/schema.graphql
 *   bun codegen                  # generates frontend typed-document-node types
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import "@/backend/graphql/pothos";
import "@/backend/graphql/pothos/shared/enum.pothos";
import "@/backend/graphql/mutation";
import "@/backend/graphql/query";

/** The final assembled GraphQL schema — passed to `new ApolloServer({ schema })`. */
export const graphQLSchema = gqlSchemaBuilder.toSchema();
