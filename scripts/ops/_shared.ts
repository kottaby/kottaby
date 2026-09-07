/**
 * Shared helpers for the database ops scripts (backup-database.ts and
 * restore-verify.ts).
 *
 * Contract: no script output (stdout, stderr, JSON artifacts, error tails)
 * may contain a raw connection string, a username, or a password. DSNs are
 * rendered as `dbName@host(redacted-user)` — the database name, host, and
 * port are kept for operator readability; every credential-bearing portion
 * is replaced by a fixed marker. Anything that is not a parseable Postgres
 * URL degrades to the fixed `redacted-dsn` placeholder rather than being
 * echoed back.
 *
 * The module also owns the tiny URL/segment utilities the CLIs need (the
 * Postgres protocol set, percent-segment decoding, the backup-eligible DSN
 * parse and the manifest-safe database-name extraction) and the `--env`
 * path resolution — one definition each, imported by both tools. (The
 * restore guard's URL pipeline lives in `restore-guard-url.ts`, extracted
 * from `restore-guard.ts` to honor the oxlint `max-lines` budget.)
 */

import { basename, dirname, resolve } from "node:path";
import { isValidDatabaseUrl } from "@/scripts/dbActions/envFile";

/** Placeholder emitted when a value cannot be safely rendered. */
export const REDACTED_DSN = "redacted-dsn";

/** The URL protocols both tools treat as Postgres DSNs. */
export const POSTGRES_PROTOCOLS = new Set(["postgresql:", "postgres:"]);

/**
 * Percent-decodes one URL path/userinfo segment. A malformed escape
 * (`%ZZ`) degrades to the raw input rather than throwing — callers that
 * need strict decoding must validate separately.
 */
export function decodeUrlSegment(value: string): string {
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

/**
 * Database name from a parsed DSN for the manifest's `database` field. The
 * fallback is the fixed "(default)" marker — NEVER the userinfo: the URL
 * username is a credential-adjacent value and must not leak into a persisted
 * manifest (or anywhere else).
 */
export function databaseNameFromDsn(url: URL): string {
  const dbName = decodeUrlSegment(url.pathname.replace(/^\//, ""));
  return dbName || "(default)";
}

/**
 * Resolves an operator-supplied `--env` value against the process cwd.
 *
 * `applyEnvFile` joins its fileName argument onto a root directory (default
 * cwd), so an ABSOLUTE `--env` path passed through that join would be
 * re-rooted under cwd and silently miss the file. The value is resolved
 * here — absolute values as-is, relative values against cwd — and split
 * back into (rootDir, fileName) for `applyEnvFile(fileName, rootDir)`.
 */
export function resolveEnvFilePath(value: string): { fileName: string; rootDir: string } {
  const resolved = resolve(process.cwd(), value);
  return { fileName: basename(resolved), rootDir: dirname(resolved) };
}

/**
 * Renders a Postgres DSN in a credential-free form: `dbName@host(redacted-user)`.
 *
 * - The username and password are never echoed; a DSN carrying either is
 *   marked `(redacted-user)`, one without userinfo is marked `(no-user)`.
 * - The port is kept (not a credential); query parameters are dropped.
 * - A DSN without a database name renders as `host(...)`.
 * - Empty, malformed, or non-Postgres values render as `redacted-dsn`.
 */
export function redactDsn(dsn: string | undefined): string {
  if (!dsn?.trim()) {
    return REDACTED_DSN;
  }

  let url: URL;
  try {
    url = new URL(dsn.trim());
  } catch {
    return REDACTED_DSN;
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol) || !url.hostname) {
    return REDACTED_DSN;
  }

  const dbName = decodeUrlSegment(url.pathname.replace(/^\//, ""));
  const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  const userMarker = url.username || url.password ? "redacted-user" : "no-user";
  const target = dbName ? `${dbName}@${host}` : host;
  return `${target}(${userMarker})`;
}

/** Single-character classes for the embedded-userinfo sweep (no quantifiers, so no backtracking). */
const SCHEME_HEAD = /[A-Za-z]/;
const SCHEME_CHAR = /[A-Za-z0-9+.-]/;
const USERINFO_BOUNDARY = /[\s@/]/;

function isSchemeToken(text: string): boolean {
  if (text.length === 0 || !SCHEME_HEAD.test(text[0] ?? "")) {
    return false;
  }
  for (const char of text) {
    if (!SCHEME_CHAR.test(char)) {
      return false;
    }
  }
  return true;
}

/**
 * Replaces every `scheme://userinfo@` occurrence with `scheme://***:***@`.
 * A linear scan anchored on `://` instead of a quantified regex, so hostile
 * tool output can never trigger super-linear redaction cost.
 */
function redactEmbeddedUserinfo(text: string): string {
  let redacted = "";
  let cursor = 0;
  for (;;) {
    const schemeEnd = text.indexOf("://", cursor);
    if (schemeEnd < 0) {
      return `${redacted}${text.slice(cursor)}`;
    }
    let schemeStart = schemeEnd;
    while (schemeStart > cursor && SCHEME_CHAR.test(text[schemeStart - 1] ?? "")) {
      schemeStart -= 1;
    }
    let userInfoEnd = schemeEnd + 3;
    while (userInfoEnd < text.length && !USERINFO_BOUNDARY.test(text[userInfoEnd] ?? "")) {
      userInfoEnd += 1;
    }
    const hasUserinfo = userInfoEnd < text.length && text[userInfoEnd] === "@" && userInfoEnd > schemeEnd + 3;
    if (hasUserinfo && isSchemeToken(text.slice(schemeStart, schemeEnd))) {
      redacted += `${text.slice(cursor, schemeEnd + 3)}***:***@`;
      cursor = userInfoEnd + 1;
      continue;
    }
    cursor = schemeEnd + 3;
  }
}

/**
 * Strips credential material from tool output before it is printed.
 *
 * In order: the exact DSN string is replaced by its redacted rendering, the
 * decoded username and password substrings are replaced by `***` (an empty
 * credential is skipped — a blanket replace of "" would corrupt the text),
 * and finally a generic `scheme://userinfo@` sweep (userinfo rendered as
 * `***:***`) catches partial echoes from error messages produced by external
 * tools.
 */
export function scrubDsnSecrets(text: string, dsn?: string): string {
  let scrubbed = text;

  if (dsn) {
    scrubbed = scrubbed.split(dsn).join(redactDsn(dsn));
    try {
      const url = new URL(dsn.trim());
      if (POSTGRES_PROTOCOLS.has(url.protocol)) {
        const password = decodeUrlSegment(url.password);
        if (password.length > 0) {
          scrubbed = scrubbed.split(password).join("***");
        }
        const username = decodeUrlSegment(url.username);
        if (username.length > 0) {
          scrubbed = scrubbed.split(username).join("***");
        }
      }
    } catch {
      // Not a parseable URL — the generic sweep below still applies.
    }
  }

  return redactEmbeddedUserinfo(scrubbed);
}
