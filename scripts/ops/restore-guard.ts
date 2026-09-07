/**
 * Safety gate for the restore-verify tool.
 *
 * The restore DESTROYS and recreates public objects in the target database
 * (`pg_restore --clean --if-exists`), so the exact connection string handed
 * to pg_restore must pass the repo's destructive-database guard, and the
 * operator must have confirmed the run with `--yes-i-understand`.
 *
 * Target normalization (this module ONLY — the shared guard lib is never
 * modified): the destructive-db guard analyzes host signals from a
 * `postgresql://` URL, but operators may pass PostgreSQL keyword/value
 * conninfo strings (`host=x.rds.amazonaws.com dbname=y`). Before assessment
 * the target is normalized:
 *
 *   - a `postgresql://`/`postgres://` URL is assessed via its LIBPQ-EFFECTIVE
 *     host: libpq percent-decodes the host component of a connection URI,
 *     while WHATWG URL parsers do NOT decode the host of non-special schemes
 *     — so `postgresql://prod.rds.amazonaws.co%6d/db` parses with the ENCODED
 *     host and would slip past marker analysis while libpq connects to the
 *     decoded managed host. Each `.`-separated host label carrying a `%` is
 *     therefore percent-decoded (a malformed escape is UNASSESSABLE and
 *     refuses the run) and ALL trailing dots are stripped (`prod.rds…com.`
 *     is DNS-equal to `prod.rds…com` but invisible to suffix markers); the
 *     guard assesses the decoded, dot-stripped host;
 *   - a key=value conninfo string has its `host`/`hostaddr`/`dbname`
 *     keywords extracted with libpq LAST-OCCURRENCE semantics (libpq applies
 *     repeated keywords in order, so `host=a host=b` connects to `b`) and
 *     synthesized into `postgresql://<host>/<db>` URL(s) for the guard's
 *     HOST-SIGNAL analysis only; every synthesized URL is round-tripped
 *     through `new URL()` — a value that cannot form a valid URL (malformed
 *     host characters) refuses the run, because the downstream guard silently
 *     SKIPS its host analysis on unparseable URLs. Trailing dots are stripped
 *     from conninfo host values too, for the same suffix-marker reason;
 *   - when `hostaddr` is present alongside `host`, BOTH values are assessed
 *     (libpq connects to `hostaddr` while using `host` for verification), so
 *     token order can never hide one of the two host signals; a conninfo
 *     with `hostaddr` but NO `host` is refused outright — a bare-IP target
 *     with no assessable host signal cannot be reasoned about (URL-form DSNs
 *     with IP hosts remain the supported drill path);
 *   - anything else is UNASSESSABLE and refuses the run (fail closed) —
 *     a target whose safety cannot be reasoned about is never restored to.
 *
 * TOCTOU note: the target DSN is parsed ONCE on the CLI, held in a single
 * variable, threaded through this assessment, and later passed UNCHANGED to
 * pg_restore — the assessed string and the executed string are the same
 * object; the synthesized URL exists only inside the guard analysis, and
 * there is no re-parse between gate and spawn.
 */

import { assessDestructiveDbCommandSafety, formatDestructiveDbBlockMessage } from "@/scripts/lib/destructiveDbGuard";
import { POSTGRES_PROTOCOLS } from "@/scripts/ops/_shared";
import { RestoreUsageError } from "@/scripts/ops/restore-cli";

/** Assessment result for the restore target. */
export interface RestoreGuardAssessment {
  blocked: boolean;
  reasons: string[];
}

/** Confirmation flag required on every (non-interactive) restore run. */
export const CONFIRMATION_FLAG = "--yes-i-understand";

const UNASSESSABLE_REASON =
  "target is not a postgresql:// URL and not an assessable host=<host> [dbname=<db>] conninfo string — " +
  "cannot assess target safety";

const CONNINFO_DBNAME_KEY = "dbname";
const CONNINFO_HOST_PATTERN = /^[A-Za-z0-9._\-[\]:]+$/;

/**
 * Splits a keyword/value conninfo string into unquoted tokens (libpq rules:
 * whitespace-separated, single quotes quote literally with `''` escapes).
 * Returns null for strings that cannot be tokenized (unterminated quote).
 */
function tokenizeConninfo(target: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < target.length; index += 1) {
    const char = target[index];
    if (quoted) {
      if (char === "'") {
        if (target[index + 1] === "'") {
          current += "'";
          index += 1;
        } else {
          quoted = false;
        }
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'") {
      quoted = true;
      continue;
    }
    if (/\s/.test(char ?? " ")) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quoted) {
    return null;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * The host-signal keywords extracted from a conninfo target. libpq applies
 * repeated keywords LAST-WINS (`host=a host=b` connects to `b`), so the
 * extraction below overwrites on every repeat exactly as libpq does — the
 * assessed host is always the host libpq would actually use.
 */
interface ConninfoSignal {
  host: string | undefined;
  hostaddr: string | undefined;
  dbname: string | undefined;
}

function extractConninfoSignal(target: string): ConninfoSignal | null {
  const tokens = tokenizeConninfo(target);
  if (tokens === null || tokens.length === 0) {
    return null;
  }

  const signal: ConninfoSignal = { host: undefined, hostaddr: undefined, dbname: undefined };
  for (const token of tokens) {
    const equals = token.indexOf("=");
    if (equals <= 0) {
      return null;
    }
    const key = token.slice(0, equals).toLowerCase();
    const value = token.slice(equals + 1);
    if (value.length === 0) {
      return null;
    }
    if (key === "host") {
      signal.host = value;
    } else if (key === "hostaddr") {
      signal.hostaddr = value;
    } else if (key === CONNINFO_DBNAME_KEY) {
      signal.dbname = value;
    }
  }
  if (signal.host === undefined && signal.hostaddr === undefined) {
    return null;
  }
  return signal;
}

/** Brackets a bare IPv6-ish host token so it survives the URL round-trip. */
function toUrlHostToken(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/**
 * Strips ALL trailing dots from a hostname. DNS treats `host.example.` and
 * `host.example` as the same name, but the managed/production marker
 * patterns are suffix-anchored — the dot would hide the marker while libpq
 * still connects to the managed host. Applied to URL hosts and conninfo
 * host values alike, before marker matching.
 */
function stripTrailingDots(host: string): string {
  let end = host.length;
  while (end > 0 && host.charCodeAt(end - 1) === 46) {
    end -= 1;
  }
  return host.slice(0, end);
}

/** Result of libpq-style percent-decoding of a URI host. */
type DecodedHost = { kind: "ok"; decoded: string } | { kind: "refuse"; reason: string };

/**
 * Percent-decodes a URI host the way libpq does, label by label. libpq
 * percent-decodes the host of a connection URI before connecting, so an
 * encoded label (`…co%6d`) must be assessed in its DECODED form; the WHATWG
 * URL parser keeps non-special-scheme hosts opaque, which is exactly the gap
 * a marker-dodging DSN exploits. A malformed escape (`%ZZ`) means the host
 * cannot be reasoned about and refuses the run (fail closed).
 */
function decodePercentEncodedHost(host: string): DecodedHost {
  if (!host.includes("%")) {
    return { kind: "ok", decoded: host };
  }
  try {
    const decoded = host
      .split(".")
      .map(label => (label.includes("%") ? decodeURIComponent(label) : label))
      .join(".");
    return { kind: "ok", decoded };
  } catch {
    return {
      kind: "refuse",
      reason: "target URL host carries a malformed percent-escape — cannot assess target safety",
    };
  }
}

/**
 * Derives the LIBPQ-EFFECTIVE host of a URI-form target: percent-decode each
 * label carrying an escape, then strip trailing dots. The decoded host must
 * stay within the assessable charset and form a parseable postgres URL —
 * anything else is unassessable and refuses the run, because the downstream
 * guard would otherwise analyze (or skip) a host libpq never connects to.
 */
function libpqEffectiveAssessUrl(url: URL): { kind: "ok"; url: string } | { kind: "refuse"; reason: string } {
  const decoded = decodePercentEncodedHost(url.hostname);
  if (decoded.kind === "refuse") {
    return decoded;
  }
  const effectiveHost = stripTrailingDots(decoded.decoded);
  if (effectiveHost.length === 0 || !CONNINFO_HOST_PATTERN.test(effectiveHost)) {
    return {
      kind: "refuse",
      reason:
        "target URL host decodes to a value outside the assessable host character set — cannot assess target safety",
    };
  }
  const assessUrl = `postgresql://${toUrlHostToken(effectiveHost)}/`;
  if (!parsesAsPostgresUrl(assessUrl)) {
    return {
      kind: "refuse",
      reason:
        "target URL host does not form a valid postgresql:// URL (malformed host value) — cannot assess target safety",
    };
  }
  return { kind: "ok", url: assessUrl };
}

/** Result of extracting the assessable host URL(s) from a conninfo target. */
export type ConninfoAssessUrls = { kind: "ok"; urls: string[] } | { kind: "refuse"; reason: string };

/**
 * Extracts the host-signal keywords from a keyword/value conninfo string and
 * synthesizes the `postgresql://<host>/<dbname>` URL(s) the guard can analyze.
 *
 * Returns null when the string is not a conninfo string or carries no
 * assessable host keyword, `{ kind: "refuse" }` when the target cannot be
 * assessed — `hostaddr` without a `host` (a bare-IP target with no host
 * signal), a host value outside the assessable charset, or a value that
 * cannot round-trip through `new URL()` (the downstream guard SKIPS its host
 * analysis on unparseable URLs, so an unparseable synthesis must refuse
 * rather than assess as "no signal") — and `{ kind: "ok" }` with ONE URL PER
 * host value otherwise: `host` and `hostaddr` are independent libpq signals
 * (hostaddr names the address actually connected; host is used for
 * verification), so both are assessed regardless of token order.
 */
export function conninfoAssessUrls(target: string): ConninfoAssessUrls | null {
  const signal = extractConninfoSignal(target);
  if (signal === null) {
    return null;
  }

  // A conninfo with `hostaddr` but no `host` names a bare IP with no
  // assessable host signal — refused outright (fail closed). URL-form DSNs
  // with IP hosts are the supported drill path and are unaffected.
  if (signal.host === undefined) {
    return {
      kind: "refuse",
      reason:
        "target conninfo carries hostaddr without a host keyword — bare-IP targets are unassessable — cannot assess target safety",
    };
  }

  const suffix = signal.dbname !== undefined ? `/${encodeURIComponent(signal.dbname)}` : "/";
  const urls: string[] = [];
  for (const rawHostValue of [signal.host, signal.hostaddr]) {
    if (rawHostValue === undefined) {
      continue;
    }
    // Trailing dots are DNS-invisible but suffix-marker-invisible too; strip
    // them so `host=prod.rds.amazonaws.com.` assesses as the managed host.
    const hostValue = stripTrailingDots(rawHostValue);
    if (hostValue.length === 0 || !CONNINFO_HOST_PATTERN.test(hostValue)) {
      return {
        kind: "refuse",
        reason:
          "target conninfo carries a host value outside the assessable host character set — " +
          "cannot assess target safety",
      };
    }
    const url = `postgresql://${toUrlHostToken(hostValue)}${suffix}`;
    // Round-trip gate: the downstream guard SKIPS its host analysis when the
    // seated DATABASE_URL does not parse, so a synthesis that cannot
    // round-trip through `new URL()` must refuse here instead of assessing
    // as "no host signal".
    if (!parsesAsPostgresUrl(url)) {
      return {
        kind: "refuse",
        reason:
          "target conninfo host value does not form a valid postgresql:// URL (malformed host value) — " +
          "cannot assess target safety",
      };
    }
    urls.push(url);
  }
  return { kind: "ok", urls };
}

function parsesAsPostgresUrl(target: string): boolean {
  try {
    const url = new URL(target.trim());
    return POSTGRES_PROTOCOLS.has(url.protocol) && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Assesses the restore target through the existing destructive-database
 * guard, normalizing keyword/value conninfo targets first (see module doc).
 *
 * A conninfo target synthesizes ONE guard URL PER host-signal value (`host`
 * and `hostaddr`), and every URL must pass: the first blocking assessment
 * wins. A URI-form target is assessed via its libpq-effective host
 * (percent-decoded, trailing dots stripped) so the analyzed host is always
 * the host libpq would actually connect to.
 *
 * The guard reads `DATABASE_URL` from the process environment for its
 * host-pattern analysis. Rather than duplicating the guard's managed-host and
 * production-marker pattern sets, each (normalized) URL is temporarily seated
 * in `DATABASE_URL` for the duration of its call (previous value restored in
 * a `finally`), so the guard evaluates the host of THE connection string
 * pg_restore will receive — plus the ambient env signals (NODE_ENV,
 * providers) loaded from the operator's env file. An unassessable or
 * ambiguous target refuses the run.
 */
export function assessRestoreTargetSafety(targetDsn: string): RestoreGuardAssessment {
  let assessUrls: string[];
  if (parsesAsPostgresUrl(targetDsn)) {
    // URI form: assess the libpq-effective host (percent-decoded labels,
    // trailing dots stripped), never the raw encoded form — libpq decodes
    // before connecting, so marker analysis must see the decoded host.
    const effective = libpqEffectiveAssessUrl(new URL(targetDsn.trim()));
    if (effective.kind === "refuse") {
      return { blocked: true, reasons: [effective.reason] };
    }
    assessUrls = [effective.url];
  } else {
    const extraction = conninfoAssessUrls(targetDsn);
    if (extraction === null) {
      return { blocked: true, reasons: [UNASSESSABLE_REASON] };
    }
    if (extraction.kind === "refuse") {
      return { blocked: true, reasons: [extraction.reason] };
    }
    assessUrls = extraction.urls;
  }

  for (const assessAs of assessUrls) {
    const assessment = assessUrlThroughGuard(assessAs);
    if (assessment.blocked) {
      return assessment;
    }
  }
  return { blocked: false, reasons: [] };
}

/** Runs the shared guard with `assessAs` seated in DATABASE_URL (restored in `finally`). */
function assessUrlThroughGuard(assessAs: string): RestoreGuardAssessment {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = assessAs;
  try {
    const assessment = assessDestructiveDbCommandSafety();
    return { blocked: assessment.blocked, reasons: assessment.reasons };
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
}

/** Formats a guard refusal for stderr (tagged, multi-line, no credentials). */
export function formatRestoreGuardBlockMessage(assessment: RestoreGuardAssessment): string {
  return `[guard] ${formatDestructiveDbBlockMessage(assessment.reasons)}`;
}

/**
 * Enforces the non-TTY confirmation gate: the restore is destructive and ops
 * tooling runs unattended, so a bare TTY prompt is not trusted — the flag
 * must be present on every invocation, even when the guard passes.
 */
export function assertRestoreConfirmation(confirmed: boolean): void {
  if (!confirmed) {
    throw new RestoreUsageError(
      `refusing to restore without explicit confirmation: pass ${CONFIRMATION_FLAG} to acknowledge ` +
        "that the target database objects will be dropped and recreated"
    );
  }
}
