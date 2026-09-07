#!/usr/bin/env bun
/**
 * Logical database backup for the platform's Postgres database.
 *
 * Produces a transactionally-consistent `pg_dump` custom-format artifact in a
 * fresh timestamped run directory (`<out-dir>/<UTC>/`), then writes a
 * `manifest.json` recording provenance, the artifact SHA-256, and a
 * fingerprint of the `backend/drizzle/` migration journal — so every backup
 * is independently verifiable before a restore is attempted.
 *
 * Semantics:
 *  - Read-only against the source database: pg_dump takes a single MVCC
 *    snapshot and no maintenance SQL is issued.
 *  - The artifact is staged in `tmp-<pid>-<ts>/` and atomically renamed into
 *    place only after the dump and manifest succeed; watchers never see a
 *    half-written run, and prior run directories are never overwritten
 *    (same-second collisions get a deterministic `-2`, `-3` … suffix).
 *  - Failed runs keep their staging directory as `<UTC>_FAILED` (never
 *    silently deleted) so postmortems retain the evidence, and no success
 *    manifest is written.
 *  - A run-directory lockfile (`.lock-<pid>`) serializes backups on one
 *    host; locks left behind by dead processes are reclaimed automatically,
 *    live locks are never stolen.
 *  - Credentials never reach stdout, stderr, or the manifest: DSNs are
 *    rendered as `dbName@host(redacted-user)`; artifacts are chmod 0600.
 *
 * Layout: flag parsing in `backup-cli`, the run lock in `backup-lock`,
 * artifacts/manifest rules in `backup-artifacts`, external-tool execution in
 * `backup-toolchain`; this module owns the orchestration and the CLI entry.
 *
 * Usage:
 *   bun run ops:db-backup [--env <env-file>] [--out-dir <dir>]
 *   bun run scripts/ops/backup-database.ts [--env <env-file>] [--out-dir <dir>]
 *
 * Exit codes: 0 = backup published (artifact + manifest written);
 * 1 = operational failure (pg_dump error, empty/missing artifact, manifest
 * contract violation, unexpected error); 2 = usage, environment, toolchain,
 * lock-contention, or manifest-write failure.
 */

import { mkdirSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyEnvFile, isValidDatabaseUrl } from "@/scripts/dbActions/envFile";
import { redactDsn, scrubDsnSecrets } from "@/scripts/ops/_shared";
import {
  ARTIFACT_FILE_NAME,
  buildBackupManifest,
  computeJournalHash,
  createStagingDir,
  isLikelyNonDisposable,
  listLeftoverStagingDirs,
  manifestProblems,
  nextAvailableRunDirName,
  sha256File,
  utcStamp,
  writeManifestFile,
} from "@/scripts/ops/backup-artifacts";
import { buildUsageText, parseBackupArgs } from "@/scripts/ops/backup-cli";
import { acquireRunLock, isPidAlive, type RunLockAcquisition, releaseRunLock } from "@/scripts/ops/backup-lock";
import {
  buildChildEnv,
  bunSpawnRunner,
  errorMessage,
  probeToolchain,
  runPgDump,
  type SpawnRunner,
} from "@/scripts/ops/backup-toolchain";

const BACKUP_TOOL_VERSION = "1.0.0";

/** Repo root, derived from this file's location (stable regardless of cwd). */
const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** Output sinks for the run (defaults to console; tests collect into arrays). */
export interface BackupEmitter {
  log: (line: string) => void;
  error: (line: string) => void;
}

/** Injectable collaborators for `runBackup`. */
export interface BackupRunDeps {
  spawn: SpawnRunner;
  now: () => Date;
  pid: number;
  repoRoot: string;
  emit: BackupEmitter;
  isAlive: (pid: number) => boolean;
}

export interface RunBackupOptions {
  envFile: string;
  outDir?: string;
  deps?: Partial<BackupRunDeps>;
}

/** State shared by the publish stages of one backup run. */
interface BackupRunContext {
  deps: BackupRunDeps;
  outDir: string;
  dsn: string;
  dsnUrl: URL;
  startedAt: Date;
  stamp: string;
}

function decodeUrlSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parses a DATABASE_URL that is eligible for backup: a valid postgres URL
 * with a hostname. Reuses the shared env-file validator first (it rejects
 * placeholders and empty values), then enforces the Postgres-only dialect.
 */
export function parsePostgresDatabaseUrl(value: string | undefined): URL | null {
  if (!isValidDatabaseUrl(value)) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      return null;
    }
    return url.hostname ? url : null;
  } catch {
    return null;
  }
}

/** Database name from a parsed DSN, falling back to the username, then "(default)". */
export function databaseNameFromDsn(url: URL): string {
  const dbName = decodeUrlSegment(url.pathname.replace(/^\//, ""));
  if (dbName) {
    return dbName;
  }
  return decodeUrlSegment(url.username) || "(default)";
}

export function defaultBackupDeps(overrides: Partial<BackupRunDeps> = {}): BackupRunDeps {
  return {
    spawn: bunSpawnRunner,
    now: () => new Date(),
    pid: process.pid,
    repoRoot: REPO_ROOT,
    emit: {
      log: line => console.log(line),
      error: line => console.error(line),
    },
    isAlive: isPidAlive,
    ...overrides,
  };
}

/** Loads the env file and validates DATABASE_URL; `null` = reported exit-2 problem. */
function bootstrapDsn(envFile: string, deps: BackupRunDeps): { dsn: string; dsnUrl: URL } | null {
  try {
    applyEnvFile(envFile);
  } catch (error) {
    deps.emit.error(`[env] env bootstrap failed: ${errorMessage(error)}`);
    return null;
  }

  const rawDsn = process.env.DATABASE_URL;
  if (!isValidDatabaseUrl(rawDsn)) {
    deps.emit.error(
      `[env] DATABASE_URL is missing or invalid after loading "${envFile}" — backup requires a postgresql:// connection string`
    );
    return null;
  }
  const dsnUrl = parsePostgresDatabaseUrl(rawDsn);
  if (!dsnUrl) {
    deps.emit.error(
      `[env] DATABASE_URL must be a postgresql:// connection string — SQLite/file targets are not backup-eligible`
    );
    return null;
  }
  return { dsn: rawDsn, dsnUrl };
}

/** Creates the output directory (0700); `null` = reported exit-2 problem. */
function prepareOutDir(outDirOption: string | undefined, deps: BackupRunDeps): string | null {
  const outDir = resolve(outDirOption ?? join(deps.repoRoot, "backups"));
  try {
    mkdirSync(outDir, { recursive: true, mode: 0o700 });
  } catch (error) {
    deps.emit.error(`[env] cannot create the output directory ${outDir}: ${errorMessage(error)}`);
    return null;
  }
  if (isLikelyNonDisposable(outDir, deps.repoRoot)) {
    deps.emit.error(
      `[env] warning: output directory ${outDir} is outside the repository or a system path — make sure it is locally disposable storage`
    );
  }
  return outDir;
}

/** Acquires the run lock and reports stale reclamation; `false` = exit-2 problem. */
function acquireBackupLock(outDir: string, deps: BackupRunDeps): boolean {
  let acquired: RunLockAcquisition;
  try {
    acquired = acquireRunLock(outDir, deps.pid, deps.isAlive);
  } catch (error) {
    deps.emit.error(`[env] cannot acquire the backup lock in ${outDir}: ${errorMessage(error)}`);
    return false;
  }
  if (!acquired.ok) {
    const holder = acquired.holderPid === null ? "unknown holder" : `pid ${acquired.holderPid}`;
    deps.emit.error(
      `[env] another backup holds the run lock (${holder}) — live locks are never stolen; retry once that run finishes`
    );
    return false;
  }
  for (const pid of acquired.reclaimedPids) {
    deps.emit.error(`[env] warning: reclaimed a stale backup lock held by dead pid ${pid}`);
  }
  for (const name of acquired.reclaimedPaths) {
    deps.emit.error(`[env] warning: reclaimed a malformed backup lock file ${name}`);
  }
  return true;
}

function preserveFailedStaging(outDir: string, stamp: string, deps: BackupRunDeps, stagingDir: string | null): void {
  if (stagingDir === null) {
    return;
  }
  try {
    const failedPath = join(outDir, nextAvailableRunDirName(outDir, `${stamp}_FAILED`));
    renameSync(stagingDir, failedPath);
    deps.emit.error(`[backup] failed-run artifacts kept in ${failedPath}`);
  } catch (renameError) {
    deps.emit.error(`[backup] could not preserve the failed staging directory: ${errorMessage(renameError)}`);
  }
}

function failRun(
  ctx: BackupRunContext,
  stagingDir: string | null,
  tag: string,
  message: string,
  exitCode: 1 | 2
): number {
  ctx.deps.emit.error(`[${tag}] ${message}`);
  preserveFailedStaging(ctx.outDir, ctx.stamp, ctx.deps, stagingDir);
  return exitCode;
}

/**
 * Probe → stage → dump → hash → manifest → atomic publish. Controlled
 * failures emit their tagged message, preserve the staging directory as
 * `<stamp>_FAILED`, and return the mapped exit code; anything unexpected
 * keeps the same evidence trail and exits 1.
 */
async function publishBackup(ctx: BackupRunContext): Promise<number> {
  let stagingDir: string | null = null;
  const fail = (tag: string, message: string, exitCode: 1 | 2): number =>
    failRun(ctx, stagingDir, tag, message, exitCode);
  try {
    const probe = await probeToolchain(ctx.deps.spawn, ctx.dsn, buildChildEnv());
    if (!probe.ok) {
      ctx.deps.emit.error(`[env] ${probe.message}`);
      return 2;
    }
    ctx.deps.emit.log(`toolchain ok — client: ${probe.pgDumpVersion} / server: ${probe.postgresServerVersion}`);

    for (const leftover of listLeftoverStagingDirs(ctx.outDir)) {
      ctx.deps.emit.error(
        `[backup] warning: leftover staging directory from an earlier crashed run: ${leftover} (kept for inspection; remove manually after review)`
      );
    }

    stagingDir = createStagingDir(ctx.outDir, ctx.deps.pid, ctx.stamp);
    const artifactPath = join(stagingDir, ARTIFACT_FILE_NAME);

    ctx.deps.emit.log(`running pg_dump (custom format) into ${stagingDir}`);
    const dump = await runPgDump(ctx.deps.spawn, buildChildEnv(), artifactPath, ctx.dsn);
    if (!dump.ok) {
      return fail("pg_dump", dump.message, 1);
    }

    const sha256 = await sha256File(artifactPath);

    let journalHash: string;
    try {
      journalHash = computeJournalHash(join(ctx.deps.repoRoot, "backend", "drizzle"));
    } catch (journalError) {
      return fail("env", `cannot fingerprint the migration journal: ${errorMessage(journalError)}`, 2);
    }

    const manifest = buildBackupManifest({
      toolVersion: BACKUP_TOOL_VERSION,
      postgresServerVersion: probe.postgresServerVersion,
      pgDumpVersion: probe.pgDumpVersion,
      database: databaseNameFromDsn(ctx.dsnUrl),
      startedAtUtc: ctx.startedAt.toISOString(),
      finishedAtUtc: ctx.deps.now().toISOString(),
      artifactFile: ARTIFACT_FILE_NAME,
      artifactBytes: dump.artifactBytes,
      sha256,
      journalHash,
    });
    // The manifest validator runs on the PRODUCTION path, not just in tests:
    // a manifest that violates its own contract is a failed run.
    const manifestProblemsFound = manifestProblems(manifest);
    if (manifestProblemsFound.length > 0) {
      return fail("backup", `built manifest failed validation: ${manifestProblemsFound.join("; ")}`, 1);
    }

    try {
      writeManifestFile(stagingDir, manifest);
    } catch (writeError) {
      return fail("env", `cannot write the manifest: ${errorMessage(writeError)}`, 2);
    }

    const runPath = join(ctx.outDir, nextAvailableRunDirName(ctx.outDir, ctx.stamp));
    try {
      renameSync(stagingDir, runPath);
    } catch (renameError) {
      return fail("backup", `cannot publish the run directory: ${errorMessage(renameError)}`, 1);
    }
    stagingDir = null;

    ctx.deps.emit.log(
      `backup complete: ${runPath} — artifact ${ARTIFACT_FILE_NAME} (${dump.artifactBytes} bytes, sha256 ${sha256})`
    );
    return 0;
  } catch (error) {
    preserveFailedStaging(ctx.outDir, ctx.stamp, ctx.deps, stagingDir);
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    ctx.deps.emit.error(`[backup] unexpected failure: ${scrubDsnSecrets(detail, ctx.dsn)}`);
    return 1;
  }
}

/**
 * Runs one backup end-to-end and returns the process exit code (0/1/2).
 * All operational failures are reported through tagged output — nothing is
 * thrown to the caller except programming errors.
 */
export async function runBackup(options: RunBackupOptions): Promise<number> {
  const deps = defaultBackupDeps(options.deps);
  const startedAt = deps.now();

  const boot = bootstrapDsn(options.envFile, deps);
  if (!boot) {
    return 2;
  }
  const outDir = prepareOutDir(options.outDir, deps);
  if (!outDir) {
    return 2;
  }
  if (!acquireBackupLock(outDir, deps)) {
    return 2;
  }

  const ctx: BackupRunContext = {
    deps,
    outDir,
    dsn: boot.dsn,
    dsnUrl: boot.dsnUrl,
    startedAt,
    stamp: utcStamp(startedAt),
  };
  try {
    deps.emit.log(`backing up ${redactDsn(ctx.dsn)} (env: ${options.envFile})`);
    return await publishBackup(ctx);
  } finally {
    releaseRunLock(outDir, deps.pid);
  }
}

async function main(): Promise<number> {
  const parsed = parseBackupArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(buildUsageText());
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(`[env] ${parsed.message}. Pass --help for usage.`);
    return 2;
  }
  return runBackup({ envFile: parsed.envFile, outDir: parsed.outDir });
}

if (import.meta.main) {
  process.exit(await main());
}
