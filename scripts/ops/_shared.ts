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
 * Whether ANY of the three raw spans of a DSN string is unassessable — a
 * delimiter libpq reads one way while every WHATWG-derived view reads it
 * another — the backup-side mirror of the restore guard's raw-authority
 * and raw-# channels in `restore-guard-url.ts`:
 *
 *  1. the RAW AUTHORITY SPAN — after `//` up to the first `/` of the raw
 *     string (with the guard's pathless refinement: on a pathless URI a
 *     first `?` followed by no later `@` is the query delimiter both
 *     parsers agree on, so the span ends there). A raw `?` OR `#` OR
 *     control character inside the span is UNASSESSABLE: libpq scans the
 *     authority to that `/` and splits userinfo at the last `@` inside it,
 *     while WHATWG ends the authority at the first `?`/`#` —
 *     `…//postgres?k@host:5432/db` dumps as role `postgres?k` at
 *     `host:5432` while the WHATWG view parses host `postgres`
 *     (live-proven R11 shape: manifest `(default)` while dumping a named
 *     database); `…//ops_owner#k:pw@host/db` dumps as role `ops_owner#k`
 *     while the WHATWG view parses host `ops_owner`;
 *  2. the RAW PATH SPAN — from the first `/` to the first `?`. libpq has
 *     no fragment delimiter and reads the raw path as the LITERAL database
 *     name (`…/pt9b#k`), while the WHATWG pathname ends at the `#`. A raw
 *     control character there diverges the same way: WHATWG strips
 *     tab/newline/CR outright (db `r12ptab<TAB>k` labels `r12ptabk` —
 *     live-proven R12 shape) and percent-encodes the other C0 controls,
 *     while libpq dumps the literal bytes;
 *  3. the RAW QUERY STRING — after the first `?`. A raw `#` there is a
 *     fragment delimiter to WHATWG but a literal parameter-value character
 *     to libpq (`?dbname=app_db#k` dumps `app_db#k` while the WHATWG query
 *     value is `app_db`); a raw tab/newline/CR is stripped by WHATWG and
 *     kept by libpq — the guard's query-channel rule.
 *
 * Control characters follow the guard's authority-span rule (C0 range plus
 * DEL) in the authority and path spans. Any of the three channels makes the
 * database (or role) pg_dump connects as diverge from every URL-derived
 * label, so the backup bootstrap refuses such DSNs fail-closed instead of
 * letting the manifest mislabel the dump. A percent-encoded escape is fine:
 * libpq percent-decodes each channel before use and the label decodes to
 * the same literal value (`%23`, `%09`). The label functions above are
 * untouched: refusal upstream (backup bootstrap / restore guard) prevents
 * the divergence they cannot see.
 */
/** True when `span` carries an ASCII control character (C0 range or DEL) — the restore guard's rule. */
function hasControlCharacter(span: string): boolean {
  for (let index = 0; index < span.length; index += 1) {
    const code = span.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function rawDsnHasAmbiguousAuthority(trimmedDsn: string): boolean {
  const schemeEnd = trimmedDsn.indexOf("://");
  const authorityStart = schemeEnd < 0 ? 0 : schemeEnd + 3;
  const slashAt = trimmedDsn.indexOf("/", authorityStart);
  const questionAt = trimmedDsn.indexOf("?", authorityStart);
  // Channel 1 — raw authority span: the restore guard's span math
  // (`assessRawUriAuthority`) mirrored exactly, control characters included.
  let authorityEnd = trimmedDsn.length;
  if (slashAt >= 0) {
    authorityEnd = slashAt;
  } else if (questionAt >= 0 && trimmedDsn.indexOf("@", questionAt) < 0) {
    authorityEnd = questionAt;
  }
  const authoritySpan = trimmedDsn.slice(authorityStart, authorityEnd);
  if (authoritySpan.includes("?") || authoritySpan.includes("#") || hasControlCharacter(authoritySpan)) {
    return true;
  }
  // Channel 2 — raw path span (`assessRawUriPath` mirror): first `/` to
  // the first `?`, the span libpq reads as the path. Control characters
  // follow the guard's C0 rule: WHATWG strips tab/newline/CR and
  // percent-encodes the rest, libpq keeps the literal bytes.
  if (slashAt >= 0) {
    const rawPath = trimmedDsn.slice(slashAt, questionAt < 0 ? trimmedDsn.length : questionAt);
    if (rawPath.includes("#") || hasControlCharacter(rawPath)) {
      return true;
    }
  }
  // Channel 3 — raw query string (the restore guard's query-channel
  // rule): everything after the first `?` to the end of the string. A raw
  // tab/newline/CR is exactly what WHATWG strips and libpq keeps.
  if (questionAt >= 0) {
    const rawQuery = trimmedDsn.slice(questionAt + 1);
    if (rawQuery.includes("#") || /[\t\n\r]/.test(rawQuery)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the RAW path span of a DSN string carries a dot-segment — a whole
 * `.` or `..` path segment, raw OR percent-decoded — the backup-side mirror
 * of the restore guard's dot-segment rule (`hasDotSegments` inside
 * {@link assessUriDatabaseComponent}). The span is libpq's path view: from
 * the first `/` after the authority to the first `?` (a raw `#` stays INSIDE
 * the span — libpq has no fragment delimiter — and is separately refused by
 * {@link rawDsnHasAmbiguousAuthority}). The WHATWG parser normalizes
 * dot-segments away in its `pathname` (recognizing their percent-encoded
 * forms too) while libpq treats the raw path as the LITERAL database name
 * (live-proven: `…/a/../db` dumps the literal `a/../db` database while the
 * WHATWG pathname records `db`), so the decoded span is gated exactly like
 * the raw one and a dot-segment path is unassessable either way.
 */
export function rawDsnPathHasDotSegments(trimmedDsn: string): boolean {
  const schemeEnd = trimmedDsn.indexOf("://");
  const authorityStart = schemeEnd < 0 ? 0 : schemeEnd + 3;
  const slashAt = trimmedDsn.indexOf("/", authorityStart);
  if (slashAt < 0) {
    return false;
  }
  const questionAt = trimmedDsn.indexOf("?", authorityStart);
  const rawPathDatabase = trimmedDsn.slice(slashAt, questionAt < 0 ? trimmedDsn.length : questionAt).replace(/^\//, "");
  if (hasDotSegments(rawPathDatabase)) {
    return true;
  }
  // A percent-encoded dot-segment (%2e) is normalized by WHATWG exactly like
  // a literal one, so the decoded view is gated the same way (a malformed
  // escape degrades to the raw span — nothing new to normalize there).
  return hasDotSegments(decodeUrlSegment(rawPathDatabase));
}

/**
 * Whether the RAW query string of a DSN string carries an endpoint-override
 * parameter — a `host`, `hostaddr`, or `port` key (case-insensitive,
 * percent-decoded key match; a valueless key counts as present) — the
 * backup-side completion of the restore guard's query-channel rule (restore
 * targets have assessed `?host=`/`?hostaddr=` through the guard pipeline
 * since R2; the backup source DSN had no equivalent gate). libpq applies URI
 * query parameters ON TOP of the parsed authority, so a query `?host=`/
 * `?port=` names the endpoint pg_dump actually connects to while every
 * URL-derived view — the redacted provenance line and the manifest's
 * authority label among them — renders the DSN authority (live-proven: a
 * `?host=…&port=…` source backed up with the authority label naming a dead
 * endpoint, and `?hostaddr=8.8.8.8` would ship the dump off-box entirely).
 * The authority is the only supported endpoint channel, so the backup
 * bootstrap refuses such DSNs fail-closed. Plain query parameters (`dbname`,
 * `sslmode`, `application_name`, …) are untouched: only the three endpoint
 * keys refuse, matched EXACTLY (a `localhost` key is not a `host` key).
 * Keys are compared after percent-decoding (libpq decodes parameter names
 * before matching; a malformed escape degrades to the raw text and simply
 * does not match) and case-folding (libpq keyword matching is
 * case-insensitive), so `?HOST=` and `?%68ost=` refuse like `?host=`.
 */
export function rawDsnQueryHasEndpointOverride(trimmedDsn: string): boolean {
  const questionAt = trimmedDsn.indexOf("?");
  if (questionAt < 0) {
    return false;
  }
  // The whole raw tail after the first `?` is libpq's query view (a raw `#`
  // inside it is a separate refusal in `rawDsnHasAmbiguousAuthority`). One
  // linear pass, split on `&`, first `=` separates a decoded, case-folded
  // KEY from its value — the value is never endpoint-deciding here.
  for (const pair of trimmedDsn.slice(questionAt + 1).split("&")) {
    if (pair.length === 0) {
      continue;
    }
    const equals = pair.indexOf("=");
    const key = decodeUrlSegment(equals < 0 ? pair : pair.slice(0, equals)).toLowerCase();
    if (key === "host" || key === "hostaddr" || key === "port") {
      return true;
    }
  }
  return false;
}

/**
 * Effective database name of a parsed Postgres DSN: the query `dbname=`
 * parameter when it carries a value, else the URI path database.
 *
 * libpq applies URI query parameters ON TOP of the parsed URI, so a query
 * `dbname=` names the database the backup family (pg_dump) actually connects
 * to — with an empty/absent path the query is the ONLY database signal, and
 * when both are present the query wins (the manifest must record the
 * database pg_dump dumps, not the path the URI happens to carry). The raw
 * query is scanned with libpq keyword semantics — LAST occurrence wins,
 * names matched case-insensitively, values percent-decoded — deliberately
 * NOT via `URLSearchParams`, which would decode `+` as a space libpq never
 * does. An explicitly EMPTY query value (`?dbname=`) names nothing: libpq
 * completes an empty dbname from the USER name (never from the path), so
 * the path fallback does not apply and the empty string is returned — the
 * under-specified shape the backup bootstrap refuses (the unnamed-source
 * gate); a valueless `?dbname` counts as the same empty value. Returned
 * WITHOUT a fallback — callers decide what an empty name renders as.
 *
 * The path fallback reads the WHATWG `pathname` (decoded) — the label-side
 * view, kept deliberately for non-guard uses: libpq reads THROUGH a raw `#`
 * in the path (part of the literal database name) and normalizes nothing,
 * so a raw-fragment or dot-segment path would mislabel here; the restore
 * guard refuses such targets upstream before any run (fail closed), so a
 * restore label can never diverge from the database libpq restores into.
 * The backup bootstrap treats an EMPTY effective name as an unspecified
 * source database and refuses it (the unnamed-source gate).
 */
export function effectiveDatabaseName(url: URL): string {
  let queryDatabase: string | undefined;
  for (const pair of url.search.replace(/^\?/, "").split("&")) {
    if (pair.length === 0) {
      continue;
    }
    const equals = pair.indexOf("=");
    if (equals < 0) {
      // A valueless `?dbname` counts as libpq's empty value (the restore
      // guard's convention) — it names nothing rather than the path db.
      if (decodeUrlSegment(pair).toLowerCase() === "dbname") {
        queryDatabase = "";
      }
      continue;
    }
    if (decodeUrlSegment(pair.slice(0, equals)).toLowerCase() === "dbname") {
      queryDatabase = decodeUrlSegment(pair.slice(equals + 1));
    }
  }
  // An explicitly present (valueless or empty) query dbname= NEVER falls
  // back to the path: libpq completes an empty dbname from the USER name,
  // so the path db would mislabel the dump.
  if (queryDatabase !== undefined) {
    return queryDatabase;
  }
  return decodeUrlSegment(url.pathname.replace(/^\//, ""));
}

/**
 * Database name from a parsed DSN for the manifest's `database` field: the
 * effective database ({@link effectiveDatabaseName}) — the query `dbname=`
 * parameter when it carries a value, else the path database — so the
 * manifest names the database pg_dump actually dumps. An explicitly empty
 * `dbname=` names nothing (libpq completes it from the USER name; the
 * backup bootstrap refuses it) and renders the fixed "(default)" marker —
 * which is NEVER the userinfo either: the URL username is a
 * credential-adjacent value and must not leak into a persisted manifest (or
 * anywhere else).
 */
export function databaseNameFromDsn(url: URL): string {
  return effectiveDatabaseName(url) || "(default)";
}

/**
 * The source-DSN refusal (the exit-2 `[env]` message) for a BACKUP source
 * DSN — `null` when the DSN is assessable and backup-eligible. One
 * dispatcher for the four fail-closed gates the backup bootstrap applies,
 * in assessment order, before any out-dir, staging, dump, or manifest side
 * effect (the bootstrap prints the message; this function owns the rules):
 *
 *  1. RAW unassessable-authority/fragment/control gate — the backup-side
 *     mirror of the restore guard's raw-authority, raw-#, and control
 *     character channels (`assessRawUriAuthority`, `assessRawUriPath`, and
 *     the query-string rule in `restore-guard-url.ts`). libpq has no
 *     fragment delimiter and reads THROUGH a raw `#` in any span, and
 *     WHATWG and libpq DISAGREE on where the authority ends when a raw `?`
 *     sits inside it: libpq dumps the literal `…/pt9b#k` path database,
 *     connects as the literal `user#k` authority role, and folds
 *     `?dbname=app_db#k` into the parameter value, while every
 *     WHATWG-derived view (the `effectiveDatabaseName` label among them)
 *     ends that span at the `?`/`#` — breaking the _shared contract that
 *     the manifest records the database pg_dump dumps (live-proven R11
 *     shape: `postgres?k@host:5432/db` → manifest `(default)` while
 *     dumping a named database). A raw control character diverges the same
 *     way: WHATWG strips tab/newline/CR outright and percent-encodes the
 *     other C0 controls, while libpq keeps the literal bytes (live-proven
 *     R12 shape: a database literally named `r12ptab<TAB>k` in the path —
 *     the manifest labeled `r12ptabk` while the dump contains the tab). A
 *     percent-encoded escape (`%23`, `%09`) is fine — libpq percent-decodes
 *     each channel and the label decodes to the same literal name, so the
 *     manifest matches what was dumped.
 *  2. Dot-segment path gate — the backup-side mirror of the restore
 *     guard's dot-segment refusal ({@link assessUriDatabaseComponent}): the
 *     WHATWG parser normalizes `.`/`..` path segments away (raw or
 *     percent-encoded) while libpq treats the raw path as the LITERAL
 *     database name (live-proven: `…/a/../db` dumps the literal `a/../db`
 *     database while the manifest's WHATWG-derived label records `db`) —
 *     the manifest would rename the source. One message covers both the
 *     raw and the percent-encoded shape: percent-encoding a dot-segment is
 *     normalized away exactly like the literal one, so the remediation is
 *     the literal database name, not an escape.
 *  3. Endpoint-override query gate ({@link rawDsnQueryHasEndpointOverride})
 *     — the backup-side completion of the restore guard's query channels
 *     (restore targets have assessed `?host=`/`?hostaddr=` since R2; the
 *     backup source DSN had no equivalent gate). libpq applies URI query
 *     parameters ON TOP of the parsed authority, so `?host=`/`?hostaddr=`/
 *     `?port=` name the endpoint pg_dump actually connects to while every
 *     URL-derived label (the redacted provenance line, the manifest's
 *     authority view among them) renders the DSN authority — live-proven:
 *     a `?host=…&port=…` source backed up with the authority label naming
 *     a dead endpoint, and `?hostaddr=8.8.8.8` would ship the dump
 *     off-box entirely. The authority is the only supported endpoint
 *     channel; plain query parameters (`dbname`, `sslmode`,
 *     `application_name`, …) are untouched.
 *  4. Unnamed-database gate — the backup-side mirror of the restore
 *     guard's target-naming rule (R5: a target whose database is
 *     under-specified refuses). A db-less source DSN (no path database, no
 *     `?dbname=` query) AND an explicitly EMPTY `?dbname=` value are the
 *     same under-specified endpoint: libpq completes an empty dbname from
 *     the USER name (never from the path; live-proven: the dump header
 *     said `dbname: postgres` while a path-fallback label said the path
 *     database), so the dump's provenance is unverifiable and the manifest
 *     would mislabel it with the `(default)` marker.
 */
export function backupSourceDsnRefusal(trimmedDsn: string, dsnUrl: URL): string | null {
  if (rawDsnHasAmbiguousAuthority(trimmedDsn)) {
    return "source DSN contains an unassessable character sequence — percent-encode special characters";
  }
  if (rawDsnPathHasDotSegments(trimmedDsn)) {
    return "source DSN path contains dot-segments — use the literal database name";
  }
  if (rawDsnQueryHasEndpointOverride(trimmedDsn)) {
    return "source DSN endpoint override in query string is not supported — put host/port in the DSN authority";
  }
  if (effectiveDatabaseName(dsnUrl).length === 0) {
    return "source database name is unspecified — name the database explicitly";
  }
  return null;
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
 *   backup family actually connects to (an explicitly empty `dbname=`
 *   names nothing and renders host-only — the bootstrap refuses it).
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
