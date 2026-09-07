/**
 * Database client barrel — re-exports the dialect-aware client module so
 * consumers keep the stable `@/backend/db` import path. Pure `export *`
 * re-export per the root AGENTS.md barrel rule (no imports in index.ts).
 */
export * from "./client";
