// Parallel Test Runner for Backend Services (prevents Bun module registry/mock pollution across service test files).
import { runParallelTests } from "@/test/scripts/run-parallel-tests";

// Each worker creates a pg pool (max: 3 in test env via factory.ts).
// Cap workers so total connections stay well within PostgreSQL's max_connections.
// With max 3 per pool: 8 workers x 3 = 24 connections (leaves headroom for other clients).
// Embedded providers (sqlite, PGlite) serialize instead — PGlite is a single
// in-process instance whose serialized query queue widens each file's
// read→write window; parallel workers then trip cross-file fixture races
// (see the PR #56 broadcast race note below for the same class of problem).
const isEmbeddedDb = ["sqlite", "pglite"].includes(process.env.DB_PROVIDER?.toLowerCase() ?? "");

await runParallelTests({
  pattern: "**/*.test.ts",
  cwd: "backend/services",
  maxWorkers: isEmbeddedDb ? 1 : 8,
  label: "backend service",
  timeoutMs: 60_000,
  // The ALL-cohort broadcast fans one notifications row out per governed user
  // read from the SHARED test database. Parallel chaos/own-commit files keep
  // committed fixture users alive for their whole file and hard-delete them in
  // afterAll cleanup — when such a delete commits between the cohort read and
  // the batch insert, the FK check fails with 23503 (proved deterministically;
  // see PR #56 CI). Running this file alone after the pool drains closes the
  // race without touching the production read→write contract.
  sequentialTailPatterns: ["notifications/admin-broadcast.service.test.ts"],
});
