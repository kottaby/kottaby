/**
 * Pure URL/host normalization pipeline for the restore guard
 * (`restore-guard.ts`).
 *
 * Extracted from the guard to honor the repo's `max-lines` budget
 * (oxlint 300 — see docs/quality/linting-rules.md); behavior is verbatim,
 * moved not copied. Everything here is a pure string/URL function — no env
 * access, no I/O — so the guard stays the only module that seats targets in
 * `DATABASE_URL` and runs the destructive-db assessment.
 *
 * Two concerns live here:
 *
 *  1. The LIBPQ-EFFECTIVE host pipeline: libpq percent-decodes the host of a
 *     connection URI and treats trailing dots as DNS-equal, while the WHATWG
 *     URL parser keeps non-special-scheme hosts opaque — the guard must
 *     analyze the host libpq would actually connect to, so hosts are
 *     percent-decoded, trailing-dot-stripped, charset-gated and round-tripped
 *     through `new URL()` before marker matching.
 *
 *  2. The URI QUERY-STRING host channels: libpq applies `?host=`/`?hostaddr=`
 *     parameters ON TOP of the authority (overriding the connection target),
 *     so the raw query string is parsed with libpq semantics (percent-decoded
 *     names and values, `+` literal, last occurrence wins, malformed escape
 *     refuses) and one assess URL per channel is produced for the caller to
 *     run through the same pipeline. Raw control characters and `#` in the
 *     query (and in the raw host substring) refuse before any URL parsing —
 *     the WHATWG parser strips what libpq keeps, so the assessed URL must be
 *     the URL libpq sees.
 */

import { POSTGRES_PROTOCOLS } from "@/scripts/ops/_shared";

/**
 * The charset a host VALUE may carry to be assessable. Anything outside it
 * (a `/` unix-socket directory, a `%` reshaping the synthesized URL, …) is
 * unassessable and refuses the run (fail closed).
 */
export const CONNINFO_HOST_PATTERN = /^[A-Za-z0-9._\-[\]:]+$/;

/** Result of libpq-style percent-decoding of a URI host. */
export type DecodedHost = { kind: "ok"; decoded: string } | { kind: "refuse"; reason: string };

/** Brackets a bare IPv6-ish host token so it survives the URL round-trip. */
export function toUrlHostToken(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/**
 * Strips ALL trailing dots from a hostname. DNS treats `host.example.` and
 * `host.example` as the same name, but the managed/production marker
 * patterns are suffix-anchored — the dot would hide the marker while libpq
 * still connects to the managed host. Applied to URL hosts and conninfo
 * host values alike, before marker matching.
 */
export function stripTrailingDots(host: string): string {
  let end = host.length;
  while (end > 0 && host.charCodeAt(end - 1) === 46) {
    end -= 1;
  }
  return host.slice(0, end);
}

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
export function libpqEffectiveAssessUrl(url: URL): { kind: "ok"; url: string } | { kind: "refuse"; reason: string } {
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

export function parsesAsPostgresUrl(target: string): boolean {
  try {
    const url = new URL(target.trim());
    return POSTGRES_PROTOCOLS.has(url.protocol) && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Numeric IPv4 loopback (127.0.0.0/8) — the only IPv4 `hostaddr` a local drill may name. */
const LOOPBACK_IPV4_PATTERN = /^127(?:\.\d{1,3}){3}$/;

/**
 * True for the numeric loopback addresses (IPv4 127.0.0.0/8, IPv6 ::1).
 * libpq CONNECTS to `hostaddr` directly, so a non-loopback hostaddr makes
 * the socket endpoint a remote numeric address that no host marker can
 * reason about — such a channel is unassessable and the run refuses.
 */
function isLoopbackHostaddr(value: string): boolean {
  const bare = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return LOOPBACK_IPV4_PATTERN.test(bare) || bare === "::1";
}

/**
 * Percent-decodes one URI query name/value the way libpq does: `%XX` bytes
 * decode, `+` stays literal, and a malformed escape (`%ZZ`) makes the query
 * — and therefore the whole target — unassessable (libpq itself rejects the
 * URI). decodeURIComponent matches exactly these semantics for the values
 * libpq would accept as host tokens.
 */
function decodeUriQueryComponent(component: string): DecodedHost {
  if (!component.includes("%")) {
    return { kind: "ok", decoded: component };
  }
  try {
    return { kind: "ok", decoded: decodeURIComponent(component) };
  } catch {
    return {
      kind: "refuse",
      reason: "target URL query carries a malformed percent-escape — cannot assess target safety",
    };
  }
}

/** Result of extracting the libpq host channels from a URI query string. */
type UriQueryChannels =
  | { kind: "ok"; host: string | undefined; hostaddr: string | undefined }
  | { kind: "refuse"; reason: string };

/**
 * Extracts the libpq host channels from the RAW query string of a URI-form
 * target. libpq applies query parameters on top of the parsed authority —
 * `?host=`/`?hostaddr=` OVERRIDE the connection target — so both are
 * independent channels an authority-only assessment would miss. Names and
 * values are percent-decoded (libpq decodes both) with LAST-OCCURRENCE-WINS
 * semantics; names match case-insensitively (fail closed: whether libpq ends
 * up rejecting the odd casing as an unknown option or applying it, refusing
 * is never wrong), and a valueless `?host` counts as libpq's empty value.
 */
function extractUriQueryChannels(rawQuery: string): UriQueryChannels {
  let host: string | undefined;
  let hostaddr: string | undefined;
  for (const pair of rawQuery.split("&")) {
    if (pair.length === 0) {
      continue;
    }
    const equals = pair.indexOf("=");
    const decodedName = decodeUriQueryComponent(equals < 0 ? pair : pair.slice(0, equals));
    if (decodedName.kind === "refuse") {
      return decodedName;
    }
    const decodedValue = decodeUriQueryComponent(equals < 0 ? "" : pair.slice(equals + 1));
    if (decodedValue.kind === "refuse") {
      return decodedValue;
    }
    const key = decodedName.decoded.toLowerCase();
    if (key === "host") {
      host = decodedValue.decoded;
    } else if (key === "hostaddr") {
      hostaddr = decodedValue.decoded;
    }
  }
  return { kind: "ok", host, hostaddr };
}

/**
 * Assesses ONE URI query channel (`host` or `hostaddr` from the query
 * string) through the SAME pipeline as the authority host: charset gate,
 * trailing-dot strip, percent-decode re-assessment and `new URL()` round-trip
 * (inside {@link libpqEffectiveAssessUrl}), then managed-marker matching by
 * the caller. An EMPTY value is unassessable and refuses; a decoded value
 * outside the assessable host charset refuses (this also covers unix-socket
 * directory hosts, which carry `/`). A `hostaddr` channel must additionally
 * name a LOOPBACK address: hostaddr is the endpoint libpq actually connects
 * to, and a remote numeric endpoint has no assessable host signal.
 */
function assessQueryChannel(
  label: "host" | "hostaddr",
  value: string
): { kind: "ok"; url: string } | { kind: "refuse"; reason: string } {
  if (value.length === 0) {
    return {
      kind: "refuse",
      reason:
        label === "host"
          ? "target URL query host is empty — libpq would fall back to the default socket — cannot assess target safety"
          : "target URL query hostaddr is empty — libpq would ignore the empty address, leaving the channel unassessed — cannot assess target safety",
    };
  }
  // Charset gate BEFORE synthesis: a decoded value carrying URL-structural
  // characters (`/`, `?`, `#`, `@`, `%`, …) would otherwise reshape the
  // synthesized URL instead of being analyzed as a host token.
  if (!CONNINFO_HOST_PATTERN.test(value)) {
    return {
      kind: "refuse",
      reason: `target URL query ${label} decodes to a value outside the assessable host character set — cannot assess target safety`,
    };
  }
  const synthesized = `postgresql://${toUrlHostToken(value)}/`;
  if (!parsesAsPostgresUrl(synthesized)) {
    return {
      kind: "refuse",
      reason: `target URL query ${label} does not form a valid postgresql:// URL (malformed host value) — cannot assess target safety`,
    };
  }
  const effective = libpqEffectiveAssessUrl(new URL(synthesized));
  if (effective.kind === "refuse") {
    return effective;
  }
  if (label === "hostaddr" && !isLoopbackHostaddr(value)) {
    return {
      kind: "refuse",
      reason:
        "target URL query hostaddr names a non-loopback address — the connection endpoint has no assessable host signal — cannot assess target safety",
    };
  }
  return effective;
}

/**
 * The RAW host substring of a postgres URI: the authority after the last `@`
 * (userinfo separator in both libpq and WHATWG), up to the first path/query/
 * fragment delimiter. Control characters here are the fail-closed signal for
 * the WHATWG-strips/libpq-keeps divergence.
 */
export function rawUriHostSubstring(target: string): string {
  const schemeEnd = target.indexOf("://");
  const authorityStart = schemeEnd < 0 ? 0 : schemeEnd + 3;
  let authorityEnd = target.length;
  for (const stop of ["/", "?", "#"]) {
    const stopAt = target.indexOf(stop, authorityStart);
    if (stopAt >= 0 && stopAt < authorityEnd) {
      authorityEnd = stopAt;
    }
  }
  const authority = target.slice(authorityStart, authorityEnd);
  const atSign = authority.lastIndexOf("@");
  return atSign < 0 ? authority : authority.slice(atSign + 1);
}

/**
 * Parses the RAW query string of a URI-form target into one assess URL per
 * query host channel. Parsing happens on the raw string — NOT on WHATWG's
 * `url.search`, which already stripped raw control characters libpq keeps —
 * and anything the two parsers must disagree on refuses before assessment.
 */
export function uriQueryChannelAssessUrls(
  trimmedTarget: string
): { kind: "ok"; urls: string[] } | { kind: "refuse"; reason: string } {
  const queryStart = trimmedTarget.indexOf("?");
  if (queryStart < 0) {
    return { kind: "ok", urls: [] };
  }
  const rawQuery = trimmedTarget.slice(queryStart + 1);
  if (/[\t\n\r]/.test(rawQuery)) {
    return {
      kind: "refuse",
      reason:
        "target URL query carries a raw control character (tab/newline) that the URL parser strips but libpq does not — cannot assess target safety",
    };
  }
  if (rawQuery.includes("#")) {
    return {
      kind: "refuse",
      reason:
        "target URL query carries a fragment delimiter libpq would fold into a parameter value — cannot assess target safety",
    };
  }
  const channels = extractUriQueryChannels(rawQuery);
  if (channels.kind === "refuse") {
    return channels;
  }
  const urls: string[] = [];
  for (const [label, value] of [
    ["host", channels.host],
    ["hostaddr", channels.hostaddr],
  ] as const) {
    if (value === undefined) {
      continue;
    }
    const assessed = assessQueryChannel(label, value);
    if (assessed.kind === "refuse") {
      return assessed;
    }
    urls.push(assessed.url);
  }
  return { kind: "ok", urls };
}
