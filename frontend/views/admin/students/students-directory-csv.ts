/**
 * Student-directory CSV export — the pure client-side serialization of the
 * CURRENT page the directory already holds (no second fetch, no backend
 * change: the export reflects EXACTLY the rows on screen, same honesty
 * contract as the platform-analytics export).
 *
 * Module posture — EVERYTHING string-building is pure and synchronous:
 *  - `buildStudentsDirectoryCsv` turns the current-page items + the caller's
 *    translation handles into one UTF-8 CSV document (BOM-prefixed so
 *    spreadsheet apps open the Arabic labels correctly);
 *  - `studentsDirectoryCsvFilename` derives the download filename from the
 *    wall clock (UTC, minute precision).
 *
 * Honesty contract (mirrors the render surface):
 *  - booleans serialize as lowercase `true`/`false` wire strings — never
 *    localized chips;
 *  - honest-null values (phone, country, trialGrantedAt, languages, parent
 *    identity) serialize as EMPTY cells (the `—` is a display affordance,
 *    not a value);
 *  - session balances serialize as raw integer strings (locale digit
 *    shaping is display-only);
 *  - `createdAt` / `trialGrantedAt` flow verbatim as the ISO wire strings.
 *
 * Content decision — labels are LOCALIZED: column captions come from the
 * same translation handles the on-screen table renders (existing header /
 * balance / parent keys reused wherever the concept exists; `fields.*`
 * captions minted for concepts the directory chrome never needed before).
 * All VALUES stay locale-neutral wire data. The only non-label literals are
 * the field separators (`,`) and the newline (`\n`) — the CSV format itself.
 *
 * Formula-injection note: every cell value originates from the repo-owned
 * translation files or the trusted directory read model (names, emails,
 * booleans, ISO timestamps) — no user-authored free text enters a cell, so
 * the classic `=`/`+`/`-`/`@` prefix guard is intentionally not applied
 * (prefixing would corrupt round-tripping of legitimate data).
 */

import type { AdminStudentsQuery } from "@/frontend/graphql/generated/gql/graphql";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

/** UTF-8 BOM — spreadsheet apps detect the encoding and render Arabic labels. */
const UTF8_BOM = "\uFEFF";

/** One directory row as the query delivered it (the extracted item type). */
type StudentDirectoryRow = AdminStudentsQuery["adminStudents"]["items"][number];

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
function boolCell(value: boolean): string {
  return value ? "true" : "false";
}

/** Zero-pads a number to two digits (UTC stamp components of the CSV filename). */
function pad(input: number): string {
  return String(input).padStart(2, "0");
}

/**
 * Builds the full CSV document for the CURRENT page: one localized header
 * record, then one record per on-screen student — id, identity, contact,
 * the four session balances, trial stamp, languages, parent placement, and
 * the joined stamp.
 */
export function buildStudentsDirectoryCsv(items: readonly StudentDirectoryRow[], labels: AdminStudentsLabels): string {
  const lines: string[] = [];

  lines.push(
    csvRecord([
      labels.fields.id,
      labels.headers.name,
      labels.fields.email,
      labels.fields.phone,
      labels.fields.country,
      labels.balances.hifz,
      labels.balances.reviews,
      labels.balances.tajweed,
      labels.balances.trial,
      labels.headers.trial,
      labels.fields.primaryLanguage,
      labels.fields.anotherLanguage,
      labels.parentLabels.withParent,
      labels.headers.parent,
      labels.fields.parentEmail,
      labels.headers.joined,
    ])
  );

  for (const student of items) {
    lines.push(
      csvRecord([
        String(student.id),
        student.name,
        student.email,
        // Honest null → empty cell (the em-dash is a display-only affordance).
        student.phone ?? "",
        student.country ?? "",
        String(student.balanceHifz),
        String(student.balanceReviews),
        String(student.balanceTajweed),
        String(student.balanceTrial),
        student.trialGrantedAt ?? "",
        student.primaryLanguage ?? "",
        student.anotherLanguage ?? "",
        boolCell(student.hasParent),
        student.parentName ?? "",
        student.parentEmail ?? "",
        student.createdAt,
      ])
    );
  }

  return `${UTF8_BOM}${lines.join("")}`;
}

/**
 * Derives the download filename from the wall clock:
 * `students-directory-YYYY-MM-DD-HHmm.csv` (UTC, minute precision — the
 * same stamp recipe the analytics export uses). The clock is injected so
 * callers (and tests) can pin the stamp; production uses the default.
 */
export function studentsDirectoryCsvFilename(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hour = pad(now.getUTCHours());
  const minute = pad(now.getUTCMinutes());
  return `students-directory-${year}-${month}-${day}-${hour}${minute}.csv`;
}
