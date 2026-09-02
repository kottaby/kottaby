#!/usr/bin/env bun
/**
 * On-demand ops trigger for the D1 parent-link expiry sweep PRIMITIVE.
 *
 * Materializes EVERY lapsed live pending parent link request to `expired` in
 * ONE atomic, idempotent bulk statement — the canonical doc's sanctioned
 * manual path while the cron STREAM remains the D1 future ticket
 * (docs/parents/parent-link-request.md §5: "sweeps are invoked by ops on
 * demand"). The future cron-stream job handler registers the SAME service
 * primitive (`ParentLinkRequestService.sweepExpiredRequests`) on a schedule.
 *
 * Semantics (canonical doc §5/R6):
 *  - Actor-less (system scope) and SILENT: zero notifications, zero audit
 *    rows (REQ-018/REQ-024). This script's stdout line is the ops record.
 *  - Idempotent by predicate: a re-run materializes 0 rows.
 *  - Strict-`>` liveness boundary: a pending with `expires_at <= now` has
 *    lapsed and is materialized.
 *  - A successful run LIFTS the silent-expiry re-request lockout (§5 D9b):
 *    after materialization the pair's pending arbiter collapses and a fresh
 *    `requestLink` succeeds.
 *
 * Usage:
 *   bun run ops:sweep-link-requests
 *   bun run scripts/ops/sweep-expired-link-requests.ts [--env <env-file>]
 *
 * Exit codes: 0 = sweep ran (any row count); 1 = bootstrap or sweep failure.
 */

import { applyEnvFile } from "@/scripts/dbActions/envFile";

function printHelp(): void {
  console.log(`
On-demand ops trigger for the parent-link expiry sweep (D1 primitive).

Usage:
  bun run ops:sweep-link-requests
  bun run scripts/ops/sweep-expired-link-requests.ts [--env <env-file>]

Options:
  --env <file>   Env file to load (default: .env)
  --help         Show this help

The sweep is atomic, idempotent, and silent (no notifications, no audit
rows). A successful run materializes every lapsed live pending parent link
request to \`expired\` and lifts the silent-expiry re-request lockout for
the affected pairs (canonical doc §5/D9b).
`);
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const envIdx = argv.indexOf("--env");
const envFile = envIdx !== -1 && argv[envIdx + 1] ? argv[envIdx + 1] : ".env";

// Apply env BEFORE importing backend modules — the DB client is lazy, but
// env-dependent module singletons must see the right configuration first
// (same bootstrap pattern as scripts/dbActions/index.ts).
try {
  applyEnvFile(envFile);
} catch (error) {
  console.error(`[ops:sweep] env bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const { ParentLinkRequestService } = await import("@/backend/services/parents/parent-link-request.service");
const { closePool } = await import("@/backend/db");

try {
  const materialized = await ParentLinkRequestService.sweepExpiredRequests();
  console.log(
    `[ops:sweep] parent-link expiry sweep complete: ${materialized} row(s) materialized to expired (env: ${envFile})`
  );
} catch (error) {
  console.error("[ops:sweep] sweep failed:", error);
  process.exitCode = 1;
} finally {
  await closePool();
}
