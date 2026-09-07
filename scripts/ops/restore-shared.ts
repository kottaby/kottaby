/**
 * Shared seams, data contracts, and artifact helpers for the restore-verify
 * tool family.
 *
 * Everything here is deliberately infrastructure-only: spawn/psql seams and
 * the clock are injectable so tests can drive the orchestrator without real
 * processes or wall time; DSN redaction keeps credentials out of stdout and
 * persisted artifacts (imported from `_shared`, ONE definition for both the
 * backup and restore families); manifest parsing fails closed on any missing
 * or malformed field so a tampered backup can never reach pg_restore.
 *
 * The manifest data contract, its file name, the artifact hasher, and the
 * migrations-absent sentinel are imported from `backup-artifacts` — the
 * backup family is their single definition owner.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { type BackupManifest, MANIFEST_FILE_NAME, MIGRATIONS_ABSENT_HASH } from "@/scripts/ops/backup-artifacts";

export type { BackupManifest };
export { MIGRATIONS_ABSENT_HASH };

/** Restore report file name written into the run directory (0600). */
export const RESTORE_REPORT_FILE = "restore-report.json";
/** Tool identifier persisted in restore-report.json. */
export const RESTORE_TOOL_ID = "ops:db-restore-verify";

// ---------------------------------------------------------------------------
// Injectable clock
// ---------------------------------------------------------------------------

/** Monotonic-enough clock seam (`Date.now`-compatible). */
export type Clock = () => Date;

/** Default wall-clock implementation. */
export const systemClock: Clock = () => new Date();

// ---------------------------------------------------------------------------
// Injectable spawn seam
// ---------------------------------------------------------------------------

/** A single child-process request. All spawns use argv arrays — never shell strings. */
export interface SpawnRequest {
  cmd: string;
  args: string[];
  /** Extra env merged over the allowlisted parent environment (explicit passthrough). */
  env?: Record<string, string | undefined>;
}

/** Captured result of one child process. */
export interface SpawnOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Injectable child-process seam. Deliberately a request-OBJECT seam (not the
 * backup family's `(argv, { env })` shape): every restore call site and test
 * double is built around `SpawnRequest`, and the request carries the merged
 * env per call. Both families share the same INVARIANTS (argv arrays only,
 * piped output, allowlisted child env) rather than the same signature.
 */
export type SpawnRunner = (request: SpawnRequest) => Promise<SpawnOutcome>;

/**
 * Process environment keys forwarded to restore children (psql/pg_restore):
 * PATH/locale plus the libpq connection variables. Mirrors the backup
 * family's `buildChildEnv` semantics. `DATABASE_URL` is deliberately NOT
 * forwarded — connection config travels in the `--dbname` argv value, and
 * the parent's DATABASE_URL names the SOURCE database, which must never leak
 * into a child that might otherwise connect to the wrong database.
 */
const RESTORE_CHILD_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGPASSFILE",
  "PGSSLMODE",
  "PGSSLROOTCERT",
  "PGCONNECT_TIMEOUT",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGAPPNAME",
] as const;

/**
 * Explicit child environment: an allowlist from `source`, merged with
 * `extra` (the per-request passthrough). Never hands the full parent
 * environment — and with it unrelated secrets — to a child process.
 */
export function buildRestoreChildEnv(
  source: Record<string, string | undefined> = process.env,
  extra: Record<string, string | undefined> = {}
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of RESTORE_CHILD_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

/** Default spawn implementation: argv-array `Bun.spawn`, piped stdio, allowlisted env. */
export const defaultSpawnRunner: SpawnRunner = async request => {
  const child = Bun.spawn([request.cmd, ...request.args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: buildRestoreChildEnv(process.env, request.env),
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode: exitCode ?? -1, stdout, stderr };
};

// ---------------------------------------------------------------------------
// psql seam
// ---------------------------------------------------------------------------

/** Result of one read-only `psql -Atc` query. `ok === false` means the query errored. */
export interface PsqlOutcome {
  ok: boolean;
  /** Trimmed stdout (single value for our queries). */
  value: string;
  stderr: string;
}

/** Injectable read-only psql runner bound to one connection string. */
export type PsqlRunner = (sql: string) => Promise<PsqlOutcome>;

/**
 * psql argv prefix shared by every read-only query (tuples-only, unaligned,
 * fail on error). `VERBOSITY=verbose` puts the SQLSTATE (e.g. `42P01`) into
 * stderr — the restore oracle evaluator gates the migrations-absence ladder
 * on that exact code, so it must be observable on real psql errors.
 */
const PSQL_ARGS = ["--no-psqlrc", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose"];

/**
 * Builds a psql runner bound to the given connection string. The DSN is
 * forwarded to psql via argv only — never interpolated into SQL text and
 * never printed.
 */
export function makePsqlRunner(spawn: SpawnRunner, dsn: string): PsqlRunner {
  return async sql => {
    const outcome = await spawn({
      cmd: "psql",
      args: [...PSQL_ARGS, "--dbname", dsn, "--command", sql],
    });
    return { ok: outcome.exitCode === 0, value: outcome.stdout.trim(), stderr: outcome.stderr };
  };
}

// ---------------------------------------------------------------------------
// Credential redaction
// ---------------------------------------------------------------------------

/**
 * Redacted target identifier for reports: the database name ONLY — host,
 * user, and password never leave the process.
 */
export function redactTargetDatabaseName(dsn: string): string {
  try {
    const parsed = new URL(dsn);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (database.length > 0) {
      return database;
    }
  } catch {
    // Not a URL — fall through to keyword/value conninfo form.
  }

  const keywordMatch = /\bdbname=([^\s]+)/i.exec(dsn);
  if (keywordMatch?.[1]) {
    return keywordMatch[1];
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Manifest parsing (fail closed)
// ---------------------------------------------------------------------------

/** Thrown when the backup artifact or its manifest cannot be trusted (exit 1). */
export class RestoreArtifactError extends Error {}

const HEX_64_PATTERN = /^[0-9a-f]{64}$/;

function requireNonEmptyString(record: Map<string, unknown>, field: string): string {
  const value = record.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RestoreArtifactError(`manifest field "${field}" is missing or empty`);
  }
  return value;
}

/**
 * Parses and validates a manifest JSON document. Every field must be
 * present and well-formed (all fields non-empty, `artifactBytes > 0`,
 * `sha256`/`journalHash` 64-hex lower-case — the journalHash sentinel
 * {@link MIGRATIONS_ABSENT_HASH} satisfies that shape) — a manifest missing
 * any key fails closed.
 */
export function parseBackupManifest(raw: string): BackupManifest {
  let source: unknown;
  try {
    source = JSON.parse(raw);
  } catch {
    throw new RestoreArtifactError("manifest.json is not valid JSON");
  }

  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    throw new RestoreArtifactError("manifest.json is not a JSON object");
  }

  const record = new Map<string, unknown>(Object.entries(source));
  const tool = requireNonEmptyString(record, "tool");
  if (tool !== "ops:db-backup") {
    throw new RestoreArtifactError(`manifest tool "${tool}" is not a database backup manifest`);
  }

  const sha256 = requireNonEmptyString(record, "sha256");
  if (!HEX_64_PATTERN.test(sha256)) {
    throw new RestoreArtifactError('manifest field "sha256" is not lower-case 64-hex');
  }

  const journalHash = requireNonEmptyString(record, "journalHash");
  if (!HEX_64_PATTERN.test(journalHash)) {
    throw new RestoreArtifactError('manifest field "journalHash" is not lower-case 64-hex');
  }

  const artifactBytes = record.get("artifactBytes");
  if (typeof artifactBytes !== "number" || !Number.isInteger(artifactBytes) || artifactBytes <= 0) {
    throw new RestoreArtifactError('manifest field "artifactBytes" must be a positive integer');
  }

  return {
    tool: "ops:db-backup",
    toolVersion: requireNonEmptyString(record, "toolVersion"),
    postgresServerVersion: requireNonEmptyString(record, "postgresServerVersion"),
    pgDumpVersion: requireNonEmptyString(record, "pgDumpVersion"),
    database: requireNonEmptyString(record, "database"),
    startedAtUtc: requireNonEmptyString(record, "startedAtUtc"),
    finishedAtUtc: requireNonEmptyString(record, "finishedAtUtc"),
    artifactFile: requireNonEmptyString(record, "artifactFile"),
    artifactBytes,
    sha256,
    journalHash,
  };
}

// ---------------------------------------------------------------------------
// Artifact resolution
// ---------------------------------------------------------------------------

/** A located backup artifact plus its validated manifest. */
export interface ResolvedArtifact {
  runDir: string;
  manifestPath: string;
  artifactPath: string;
  manifest: BackupManifest;
}

/**
 * Resolves `--from` into (run directory, artifact, manifest).
 *
 * Accepts either a backup run directory (manifest.json + dump inside) or a
 * direct dump artifact whose manifest.json sits beside it. Any missing or
 * unreadable piece throws {@link RestoreArtifactError} so the caller refuses
 * the restore before spawning pg_restore.
 */
export function resolveRunArtifact(fromPath: string): ResolvedArtifact {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(fromPath);
  } catch {
    throw new RestoreArtifactError(`--from path does not exist or is unreadable: ${fromPath}`);
  }

  const manifestPath = stats.isDirectory()
    ? join(fromPath, MANIFEST_FILE_NAME)
    : join(fromPath, "..", MANIFEST_FILE_NAME);

  let rawManifest: string;
  try {
    rawManifest = readFileSync(manifestPath, "utf8");
  } catch {
    throw new RestoreArtifactError(`manifest not found or unreadable next to the artifact (expected ${manifestPath})`);
  }

  const manifest = parseBackupManifest(rawManifest);

  const artifactPath = stats.isDirectory() ? join(fromPath, manifest.artifactFile) : fromPath;
  try {
    const artifactStats = statSync(artifactPath);
    if (!artifactStats.isFile()) {
      throw new RestoreArtifactError(`artifact is not a regular file: ${artifactPath}`);
    }
  } catch (error) {
    if (error instanceof RestoreArtifactError) {
      throw error;
    }
    throw new RestoreArtifactError(`backup artifact does not exist or is unreadable: ${artifactPath}`);
  }

  return { runDir: stats.isDirectory() ? fromPath : join(fromPath, ".."), manifestPath, artifactPath, manifest };
}

// ---------------------------------------------------------------------------
// Expected-table derivation
// ---------------------------------------------------------------------------

/**
 * Derives the expected physical table names from the Drizzle schema source.
 *
 * DERIVATION NOTE: the table list is scanned from the `pgTable("<name>", ...)`
 * first arguments in the TypeScript files under `backend/db/schema/` (any
 * depth) at runtime — the first argument IS the physical database table name.
 * A hardcoded copy of the list would go stale the moment a table is added or
 * renamed and would then silently PASS a truncated restore that is missing
 * that table; deriving from source keeps the structural contract in lockstep
 * with the schema.
 */
export function deriveExpectedTableNames(schemaDir: string): string[] {
  const tableNames = new Set<string>();
  const pgTableNamePattern = /pgTable\(\s*["']([A-Za-z_]\w*)["']/g;

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
        continue;
      }
      const contents = readFileSync(entryPath, "utf8");
      for (const match of contents.matchAll(pgTableNamePattern)) {
        const tableName = match[1];
        if (tableName) {
          tableNames.add(tableName);
        }
      }
    }
  };

  try {
    visit(schemaDir);
  } catch {
    throw new RestoreArtifactError(`schema directory not found or unreadable: ${schemaDir}`);
  }

  if (tableNames.size === 0) {
    throw new RestoreArtifactError(`no pgTable definitions found under ${schemaDir}`);
  }

  return [...tableNames].toSorted((a, b) => a.localeCompare(b));
}
