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
 * Postgres protocol set, percent-segment decoding, the raw URI path
 * substring, the backup-eligible DSN parse, the manifest-safe database-name
 * extraction and the restore guard's URI database-component rule) and the
 * `--env` path resolution — one definition each, imported by both tools.
 * (The restore guard's host/query URL pipeline lives in
 * `restore-guard-url.ts`, extracted to honor the oxlint `max-lines` budget.)
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
 * The RAW path substring of a postgres URI: the characters after the
 * authority span (from the first `/` of the raw string) up to the first
 * `?`/`#`, leading `/` included. The `?` end is libpq's own query
 * delimiter; the `#` end is the WHATWG view — libpq has NO fragment
 * delimiter and READS THROUGH a raw `#` (it is part of the literal database
 * name, live-proven: `…/db#x` restores into `db#x`), so on a raw-fragment
 * path this substring is the TRUNCATED view, not libpq's. The restore guard
 * refuses raw-fragment paths before any run (fail closed —
 * `assessRawUriPath` in `restore-guard-url.ts`), so label consumers of this
 * substring never see a target whose libpq name differs from the truncated
 * label. The WHATWG URL parser also normalizes `.`/`..` dot-segments in its
 * `pathname` (and recognizes their percent-encoded forms), while libpq
 * treats the raw path as the LITERAL database name, so any component that
 * names the target database must derive it from this raw view, never from
 * `URL#pathname`. A URI whose first `?`/`#` precedes any `/` (pathless) has
 * no raw path.
 */
export function rawUriPathSubstring(target: string): string {
  const schemeEnd = target.indexOf("://");
  const authorityStart = schemeEnd < 0 ? 0 : schemeEnd + 3;
  let pathEnd = target.length;
  for (const stop of ["?", "#"]) {
    const stopAt = target.indexOf(stop, authorityStart);
    if (stopAt >= 0 && stopAt < pathEnd) {
      pathEnd = stopAt;
    }
  }
  const slashAt = target.indexOf("/", authorityStart);
  if (slashAt < 0 || slashAt >= pathEnd) {
    return "";
  }
  return target.slice(slashAt, pathEnd);
}

/**
 * True when `path` (leading `/` already stripped) carries a dot-segment —
 * a whole `.` or `..` path segment. The WHATWG parser normalizes such
 * segments away (so `URL#pathname` mislabels the database libpq connects
 * to); libpq does not, and would restore into a bizarre literal
 * dot-segment database name. Such a target is unassessable.
 */
function hasDotSegments(path: string): boolean {
  return path.split("/").some(segment => segment === "." || segment === "..");
}

/** Refusal for a URI-form target whose raw path carries dot-segments. */
const DOT_SEGMENT_PATH_REFUSAL =
  "target URL path contains dot-segments (./..) — the URL parser normalizes them away while libpq treats the " +
  "raw path as the literal database name — dot-segment path is unassessable — cannot assess target safety";

/**
 * Assesses the URI DATABASE COMPONENT against the query `dbname=` override
 * channel. The path database is derived from the RAW path substring (via
 * {@link rawUriPathSubstring}, leading `/` stripped) — libpq's literal view —
 * never from the WHATWG `pathname`, which normalizes dot-segments away.
 * libpq applies query parameters ON TOP of the parsed URI, so a query
 * `dbname=` IS the database the connection uses:
 *
 *   - a raw path carrying dot-segments (`.`/`..` as whole segments, raw or
 *     percent-encoded) REFUSES: the WHATWG pathname would silently rename the
 *     target libpq restores into — unassessable, fail closed;
 *   - no query `dbname=` → the path rule stands (an empty/absent path
 *     database is under-specified — the ambient environment would complete
 *     it);
 *   - query `dbname=` AND a path database → both must AGREE: the libpq URI
 *     families disagree on which component wins, so a disagreement is an
 *     ambiguity no assessment can resolve (`ambiguous: true`, fail closed).
 *     The comparison happens on DECODED values (libpq percent-decodes the
 *     path database before use); a malformed escape refuses the run;
 *   - query `dbname=` over an empty/absent path → the query value IS the
 *     explicit target database (`unspecified: false`) — unless the value is
 *     EMPTY, which names nothing and stays under-specified.
 */
export function assessUriDatabaseComponent(
  rawTarget: string,
  queryDbname: string | undefined
): { kind: "ok"; unspecified: boolean; ambiguous: boolean } | { kind: "refuse"; reason: string } {
  const rawPathDatabase = rawUriPathSubstring(rawTarget).replace(/^\//, "");
  if (rawPathDatabase.length === 0) {
    return {
      kind: "ok",
      unspecified: queryDbname === undefined || queryDbname.length === 0,
      ambiguous: false,
    };
  }
  if (hasDotSegments(rawPathDatabase)) {
    return { kind: "refuse", reason: DOT_SEGMENT_PATH_REFUSAL };
  }
  let decodedPathDatabase: string;
  try {
    decodedPathDatabase = decodeURIComponent(rawPathDatabase);
  } catch {
    return {
      kind: "refuse",
      reason: "target URL path database carries a malformed percent-escape — cannot assess target safety",
    };
  }
  // A percent-encoded dot-segment (%2e) is normalized by WHATWG exactly like
  // a literal one, so the decoded view is gated the same way.
  if (hasDotSegments(decodedPathDatabase)) {
    return { kind: "refuse", reason: DOT_SEGMENT_PATH_REFUSAL };
  }
  if (queryDbname === undefined) {
    return { kind: "ok", unspecified: false, ambiguous: false };
  }
  return { kind: "ok", unspecified: false, ambiguous: decodedPathDatabase !== queryDbname };
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
 * Whether the RAW path span of a DSN string — the substring from the first
 * `/` after the authority to the first `?` (or the end of the string),
 * exactly the span libpq reads as the path — carries a literal `#`. The
 * WHATWG URL parser ends the path at a `#` (it becomes the fragment) while
 * libpq has no fragment delimiter, so a raw `#` makes the database libpq
 * connects to and the WHATWG path label diverge. The backup bootstrap uses
 * this to refuse such DSNs fail-closed (the mirror of the restore guard's
 * `assessRawUriPath`) instead of letting the manifest mislabel the dump.
 * The label functions above are untouched: refusal upstream (backup
 * bootstrap / restore guard) prevents the divergence they cannot see.
 */
export function rawUriPathHasFragment(trimmedDsn: string): boolean {
  const schemeEnd = trimmedDsn.indexOf("://");
  const authorityStart = schemeEnd < 0 ? 0 : schemeEnd + 3;
  const slashAt = trimmedDsn.indexOf("/", authorityStart);
  if (slashAt < 0) {
    return false;
  }
  const questionAt = trimmedDsn.indexOf("?", authorityStart);
  const rawPath = trimmedDsn.slice(slashAt, questionAt < 0 ? trimmedDsn.length : questionAt);
  return rawPath.includes("#");
}

/**
 * Effective database name of a parsed Postgres DSN: the query `dbname=`
 * parameter when it carries a non-empty value, else the URI path database.
 *
 * libpq applies URI query parameters ON TOP of the parsed URI, so a query
 * `dbname=` names the database the backup family (pg_dump) actually connects
 * to — with an empty/absent path the query is the ONLY database signal, and
 * when both are present the query wins (the manifest must record the
 * database pg_dump dumps, not the path the URI happens to carry). The raw
 * query is scanned with libpq keyword semantics — LAST occurrence wins,
 * names matched case-insensitively, values percent-decoded — deliberately
 * NOT via `URLSearchParams`, which would decode `+` as a space libpq never
 * does. An empty query value (`?dbname=`) names nothing and falls back to
 * the path. Returned WITHOUT a fallback — callers decide what an empty name
 * renders as.
 *
 * The path fallback reads the WHATWG `pathname` (decoded) — the label-side
 * view, kept deliberately for non-guard uses: libpq reads THROUGH a raw `#`
 * in the path (part of the literal database name) and normalizes nothing,
 * so a raw-fragment or dot-segment path would mislabel here; the restore
 * guard refuses such targets upstream before any run (fail closed), so a
 * restore label can never diverge from the database libpq restores into.
 */
function effectiveDatabaseName(url: URL): string {
  let queryDatabase: string | undefined;
  for (const pair of url.search.replace(/^\?/, "").split("&")) {
    if (pair.length === 0) {
      continue;
    }
    const equals = pair.indexOf("=");
    if (equals < 0) {
      continue;
    }
    if (decodeUrlSegment(pair.slice(0, equals)).toLowerCase() === "dbname") {
      queryDatabase = decodeUrlSegment(pair.slice(equals + 1));
    }
  }
  if (queryDatabase !== undefined && queryDatabase.length > 0) {
    return queryDatabase;
  }
  return decodeUrlSegment(url.pathname.replace(/^\//, ""));
}

/**
 * Database name from a parsed DSN for the manifest's `database` field: the
 * effective database ({@link effectiveDatabaseName}) — the query `dbname=`
 * parameter when present, else the path database — so the manifest names the
 * database pg_dump actually dumps. The fallback is the fixed "(default)"
 * marker — NEVER the userinfo: the URL username is a credential-adjacent
 * value and must not leak into a persisted manifest (or anywhere else).
 */
export function databaseNameFromDsn(url: URL): string {
  return effectiveDatabaseName(url) || "(default)";
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
 * - The rendered database name is the EFFECTIVE database
 *   ({@link effectiveDatabaseName}): a query `dbname=` parameter is libpq's
 *   override channel and wins over the path component, matching what the
 *   backup family actually connects to.
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

  const dbName = effectiveDatabaseName(url);
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
