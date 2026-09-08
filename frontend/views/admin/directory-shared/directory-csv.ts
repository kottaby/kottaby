/**
 * directory-csv — the shared serialization recipe of the admin directory CSV
 * exports (students / teachers / applicants). The domain modules own the
 * COLUMN layout (localized caption handles) and the per-row VALUE mapping
 * (locale-neutral wire data); this module owns the FORMAT.
 *
 * Posture — EVERYTHING here is pure and synchronous:
 *  - `buildDirectoryCsv` turns a header caption row + raw cell rows into one
 *    UTF-8 CSV document (BOM-prefixed so spreadsheet apps open the Arabic
 *    labels correctly);
 *  - `csvBoolCell` serializes booleans as the lowercase wire strings
 *    `true`/`false` — never localized chips/pills;
 *  - `directoryCsvFilename` derives the download filename from the wall
 *    clock (UTC, minute precision — the stamp recipe every directory export
 *    shares).
 *
 * Byte contract (identical to the pre-extraction builders): one header
 * record, then one `\n`-terminated record per row; quoting engages only
 * when a field carries the delimiter, a quote, or a newline — inside quotes
 * every `"` doubles. The only non-label literals are the field separators
 * (`,`) and the newline (`\n`) — the CSV format itself.
 *
 * Formula-injection note: every cell value originates from the repo-owned
 * translation files or the trusted directory read models (names, emails,
 * booleans, ISO timestamps) — no user-authored free text enters a cell, so
 * the classic `=`/`+`/`-`/`@` prefix guard is intentionally not applied
 * (prefixing would corrupt round-tripping of legitimate data).
 */

/** UTF-8 BOM — spreadsheet apps detect the encoding and render Arabic labels. */
const UTF8_BOM = "\uFEFF";

/**
 * Escapes one CSV cell: quoting engages only when the field contains the
 * delimiter, a quote, or a newline — inside quotes every `"` doubles.
 */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** Joins cells with the comma delimiter and terminates the record. */
function csvRecord(cells: readonly string[]): string {
  return `${cells.map(csvCell).join(",")}\n`;
}

/** Wire serialization of a non-nullable Boolean column. */
export function csvBoolCell(value: boolean): string {
  return value ? "true" : "false";
}

/** One directory CSV document: the localized caption row + one cell row per record. */
export interface DirectoryCsvDocument {
  /** The localized column captions, in column order. */
  readonly headers: readonly string[];
  /** The raw (unescaped) cell values of every record, in column order. */
  readonly rows: readonly (readonly string[])[];
}

/**
 * Builds the full CSV document: the BOM-prefixed header record, then one
 * record per row — escaping applied uniformly to every cell.
 */
export function buildDirectoryCsv({ headers, rows }: DirectoryCsvDocument): string {
  const lines: string[] = [csvRecord(headers)];
  for (const cells of rows) {
    lines.push(csvRecord(cells));
  }
  return `${UTF8_BOM}${lines.join("")}`;
}

/**
 * Derives the download filename from the wall clock:
 * `${prefix}-YYYY-MM-DD-HHmm.csv` (UTC, minute precision). The clock is
 * injected so callers (and tests) can pin the stamp; production uses the
 * default.
 */
export function directoryCsvFilename(prefix: string, now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hour = pad(now.getUTCHours());
  const minute = pad(now.getUTCMinutes());
  return `${prefix}-${year}-${month}-${day}-${hour}${minute}.csv`;
}

/** Zero-pads a number to two digits (UTC stamp components of the CSV filename). */
function pad(input: number): string {
  return String(input).padStart(2, "0");
}
