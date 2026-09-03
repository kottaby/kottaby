// Parallel Test Runner for Backend Services (prevents Bun module registry/mock pollution across service test files).
import { runParallelTests } from "@/test/scripts/run-parallel-tests";

// Each worker creates a pg pool (max: 3 in test env via factory.ts).
// Cap workers so total connections stay well within PostgreSQL's max_connections.
// With max 3 per pool: 8 workers x 3 = 24 connections (leaves headroom for other clients).
// Embedded single-process providers (sqlite, pglite) cannot be shared across
// worker PROCESSES — PGlite is an in-process WASM Postgres whose data dir has
// no cross-process lock (concurrent open aborts the WASM runtime mid-init:
// "RuntimeError: Aborted()"), so workers are serialized for those providers.
const provider = (process.env.DB_PROVIDER ?? "").toLowerCase();
const isEmbeddedProvider = provider === "sqlite" || provider === "pglite";

await runParallelTests({
  pattern: "**/*.test.ts",
  cwd: "backend/services",
  maxWorkers: isEmbeddedProvider ? 1 : 8,
  label: "backend service",
  timeoutMs: 60_000,
});
