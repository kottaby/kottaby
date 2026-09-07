/**
 * Backup run artifacts: the run-directory naming rules, the manifest data
 * contract (and its validator), the artifact/integrity hashing helpers, and
 * the staging-directory lifecycle. Everything here is deterministic and
 * side-effect-confined to the backup output directory.
 */

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

export const ARTIFACT_FILE_NAME = "dump.pgc";
export const MANIFEST_FILE_NAME = "manifest.json";
export const STAGING_DIR_PREFIX = "tmp-";

/** Machine-readable provenance + integrity record for one backup run. */
export interface BackupManifest {
  tool: "ops:db-backup";
  toolVersion: string;
  postgresServerVersion: string;
  pgDumpVersion: string;
  database: string;
  startedAtUtc: string;
  finishedAtUtc: string;
  artifactFile: string;
  artifactBytes: number;
  sha256: string;
  journalHash: string;
}

export function buildBackupManifest(input: Omit<BackupManifest, "tool">): BackupManifest {
  return { tool: "ops:db-backup", ...input };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Contract problems of a parsed manifest object (empty array = valid). */
export function manifestProblems(manifest: unknown): string[] {
  if (!isRecord(manifest)) {
    return ["manifest is not an object"];
  }

  const problems: string[] = [];
  const requiredStringFields = [
    "tool",
    "toolVersion",
    "postgresServerVersion",
    "pgDumpVersion",
    "database",
    "startedAtUtc",
    "finishedAtUtc",
    "artifactFile",
    "sha256",
    "journalHash",
  ] as const;

  for (const field of requiredStringFields) {
    const value = manifest[field];
    if (typeof value !== "string" || value.length === 0) {
      problems.push(`field ${field} must be a non-empty string`);
    }
  }
  if (manifest.tool !== undefined && manifest.tool !== "ops:db-backup") {
    problems.push(`field tool must be "ops:db-backup"`);
  }
  const bytes = manifest.artifactBytes;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) {
    problems.push("field artifactBytes must be a positive integer");
  }
  for (const field of ["sha256", "journalHash"] as const) {
    const value = manifest[field];
    if (typeof value === "string" && !/^[0-9a-f]{64}$/.test(value)) {
      problems.push(`field ${field} must be 64 lowercase hex characters`);
    }
  }
  for (const field of ["startedAtUtc", "finishedAtUtc"] as const) {
    const value = manifest[field];
    if (typeof value === "string" && Number.isNaN(Date.parse(value))) {
      problems.push(`field ${field} must be a parseable timestamp`);
    }
  }
  return problems;
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** UTC timestamp in the `YYYYmmddTHHMMSSZ` run-directory format. */
export function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/** SHA-256 of a file, streamed (no whole-file buffering). */
export async function sha256File(filePath: string): Promise<string> {
  const hasher = createHash("sha256");
  const stream = Bun.file(filePath).stream();
  for await (const chunk of stream) {
    hasher.update(chunk);
  }
  return hasher.digest("hex");
}

/**
 * Fingerprint of the migration journal: SHA-256 over the depth-first,
 * name-sorted listing of every file under the Drizzle journal directory,
 * where each file contributes a line
 * `<relative-posix-path>:<size-in-bytes>:<sha256-of-content>\n`.
 * Deterministic across directory enumeration order; throws when the
 * directory is missing.
 */
export function computeJournalHash(drizzleDir: string): string {
  if (!existsSync(drizzleDir)) {
    throw new Error(`migration journal directory not found: ${drizzleDir}`);
  }

  const hasher = createHash("sha256");
  const walk = (dir: string, prefix: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relativePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const content = readFileSync(join(dir, entry.name));
      const fileHash = createHash("sha256").update(content).digest("hex");
      hasher.update(`${relativePath}:${content.byteLength}:${fileHash}\n`);
    }
  };
  walk(drizzleDir, "");
  return hasher.digest("hex");
}

/** Staging directories left behind by crashed runs (reported, never deleted). */
export function listLeftoverStagingDirs(outDir: string): string[] {
  return readdirSync(outDir)
    .filter(name => name.startsWith(STAGING_DIR_PREFIX))
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * First available directory name derived from `baseName`: `baseName`, then
 * `baseName-2`, `baseName-3`, … — deterministic, never overwrites.
 */
export function nextAvailableRunDirName(outDir: string, baseName: string): string {
  if (!existsSync(join(outDir, baseName))) {
    return baseName;
  }
  let n = 2;
  while (existsSync(join(outDir, `${baseName}-${n}`))) {
    n += 1;
  }
  return `${baseName}-${n}`;
}

/** True when the output directory is outside the repo (or the repo root itself). */
export function isLikelyNonDisposable(outDir: string, repoRoot: string): boolean {
  return outDir === repoRoot || !outDir.startsWith(`${repoRoot}${sep}`);
}

/**
 * Creates the staging directory `tmp-<pid>-<ts>` (first collision-free
 * name) with a pre-created empty artifact file, so a failed dump always
 * leaves inspectable evidence and pg_dump never invents file permissions.
 */
export function createStagingDir(outDir: string, pid: number, stamp: string): string {
  const stagingDir = join(outDir, nextAvailableRunDirName(outDir, `${STAGING_DIR_PREFIX}${pid}-${stamp}`));
  mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(stagingDir, ARTIFACT_FILE_NAME), "", { flag: "wx", mode: 0o600 });
  return stagingDir;
}

/** Writes the manifest with 0600 permissions and returns its path. */
export function writeManifestFile(stagingDir: string, manifest: BackupManifest): string {
  const manifestPath = join(stagingDir, MANIFEST_FILE_NAME);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  chmodSync(manifestPath, 0o600);
  return manifestPath;
}
