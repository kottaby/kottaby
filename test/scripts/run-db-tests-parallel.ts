// Parallel test runner for database repository tests.
import { runParallelTests } from "@/test/scripts/run-parallel-tests";

// Each worker creates a pg pool (max: 3 in test env via factory.ts).
// Cap workers so total connections stay well within PostgreSQL's max_connections.
// With max 3 per pool: 8 workers x 3 = 24 connections (leaves headroom for other clients).
// Embedded providers (sqlite, PGlite) serialize instead: PGlite is a single
// in-process instance, so parallel workers interleave on one query queue —
// that widens each file's read→write window and deterministically trips
// whole-table baseline assertions (platform-analytics) with other workers'
// committed fixtures. One worker at a time keeps those baselines stable.
const isEmbeddedDb = ["sqlite", "pglite"].includes(process.env.DB_PROVIDER?.toLowerCase() ?? "");

await runParallelTests({
  pattern: "**/*.test.ts",
  cwd: "backend/db/test",
  maxWorkers: isEmbeddedDb ? 1 : 8,
  label: "database",
  timeoutMs: 60_000,
});
