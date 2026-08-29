/**
 * Pre-flight pollution guard for the parallel DB/service test runners.
 *
 * Server-mode suites (`test:graphql`, `test:ui:e2e`) exercise the real HTTP
 * stack against the SAME test database and COMMIT their rows — there is no
 * `runInRollback` wrapper across an HTTP boundary. Among those rows are
 * append-only audit trail entries. The trail-reading tests in
 * `backend/db/test/logic/audit/` assume a clean `audit_logs` table (e.g.
 * "an empty trail reads as an empty page with total 0"), so ANY earlier
 * server-mode run poisons every subsequent `test:db` / `test:services` run.
 *
 * This helper deletes pre-existing audit rows BEFORE the parallel workers
 * spawn. Hard safety rail: it refuses to run unless the target database name
 * ends with `_test`, so it can never touch a development or production DB.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

/** Parses a dotenv-style file and returns the DATABASE_URL value (quotes stripped). */
function readDatabaseUrlFromEnvFile(envFile: string): string {
  const content = readFileSync(envFile, "utf8");
  const match = /^DATABASE_URL=(.*)$/m.exec(content);
  if (!match) {
    throw new Error(`DATABASE_URL not found in ${envFile}`);
  }
  const url = match[1].trim().replace(/^["']|["']$/g, "");
  if (url.length === 0) {
    throw new Error(`DATABASE_URL is empty in ${envFile}`);
  }
  return url;
}

/**
 * Clears rows committed into `audit_logs` by earlier server-mode test runs.
 * No-op (silent skip) when the test env does not point at PostgreSQL — the
 * sqlite suites keep their own file-scoped isolation and have no shared
 * server-mode pollution model.
 */
export async function clearPreExistingAuditRows(label: string): Promise<void> {
  const envFile = process.env.TEST_ENV_FILE ?? ".env.test";

  let url: string;
  let dbName: string;
  try {
    url = readDatabaseUrlFromEnvFile(envFile);
    const parsed = new URL(url);
    // Only PostgreSQL-backed suites share the server-mode DB. Anything else
    // (libsql/file URLs) is skipped — the safety rail below would reject it.
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return;
    }
    dbName = parsed.pathname.replace(/^\//, "");
  } catch (err) {
    throw new Error(`[audit-cleanup] ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  if (!dbName.endsWith("_test")) {
    throw new Error(`[audit-cleanup] refusing to clear audit rows: database "${dbName}" does not end with _test`);
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    try {
      // TRUNCATE, not DELETE: the append-only doctrine is enforced at the SQL
      // layer by the row-level BEFORE DELETE / BEFORE UPDATE triggers
      // (backend/db/migration/3-immutability-triggers.sql), which reject any
      // row-level cleanup. TRUNCATE fires only FOR EACH STATEMENT truncate
      // triggers — none are defined on audit_logs — so it is the sanctioned
      // maintenance path for resetting the test trail.
      await client.query("TRUNCATE TABLE audit_logs");
      globalThis.console.log(
        `\x1b[33m[audit-cleanup]\x1b[0m truncated audit_logs in ${dbName} ` +
          `before the ${label} suite (server-mode pollution guard)`
      );
    } catch (err) {
      // Missing table on a brand-new test DB — the suite's own setup owns it.
      if (typeof err === "object" && err !== null && "code" in err && err.code === "42P01") {
        return;
      }
      throw err;
    }
  } finally {
    await client.end().catch(() => {});
  }
}
