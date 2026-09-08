/**
 * Teacher-directory CSV export — the pure client-side serialization of the
 * CURRENT page the directory already holds (no second fetch, no backend
 * change: the export reflects EXACTLY the rows on screen, same honesty
 * contract as the platform-analytics export).
 *
 * Module posture — EVERYTHING string-building is pure and synchronous:
 *  - `buildTeachersDirectoryCsv` turns the current-page items + the caller's
 *    translation handles into one UTF-8 CSV document (BOM-prefixed so
 *    spreadsheet apps open the Arabic labels correctly);
 *  - `teachersDirectoryCsvFilename` derives the download filename from the
 *    wall clock (UTC, minute precision).
 *
 * Honesty contract (mirrors the render surface):
 *  - booleans serialize as lowercase `true`/`false` wire strings — never
 *    localized pills;
 *  - honest-null values (phone, country, averageRating) serialize as EMPTY
 *    cells (the `—` is a display affordance, not a value);
 *  - the average rating serializes as the raw decimal string the query
 *    carried (no digit shaping — locale formatting is display-only);
 *  - subjects join with `;` (a list separator that never collides with the
 *    CSV comma delimiter);
 *  - `createdAt` flows verbatim as the ISO wire string.
 *
 * Content decision — labels are LOCALIZED: column captions come from the
 * same translation handles the on-screen table renders (existing header /
 * status-pill keys reused wherever the concept exists; `fields.*` captions
 * minted for concepts the directory chrome never needed before). All VALUES
 * stay locale-neutral wire data. The only non-label literals are the field
 * separators (`,`) and the newline (`\n`) — the CSV format itself.
 *
 * Formula-injection note: every cell value originates from the repo-owned
 * translation files or the trusted directory read model (names, emails,
 * booleans, ISO timestamps) — no user-authored free text enters a cell, so
 * the classic `=`/`+`/`-`/`@` prefix guard is intentionally not applied
 * (prefixing would corrupt round-tripping of legitimate data).
 */

import type { AdminTeachersQuery } from "@/frontend/graphql/generated/gql/graphql";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** UTF-8 BOM — spreadsheet apps detect the encoding and render Arabic labels. */
const UTF8_BOM = "\uFEFF";

/** One directory row as the query delivered it (the extracted item type). */
type TeacherDirectoryRow = AdminTeachersQuery["adminTeachers"]["items"][number];

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

/** Wire serialization of a non-nullable Boolean filter column. */
function boolCell(value: boolean): string {
  return value ? "true" : "false";
}

/** Zero-pads a number to two digits (UTC stamp components of the CSV filename). */
function pad(input: number): string {
  return String(input).padStart(2, "0");
}

/**
 * Builds the full CSV document for the CURRENT page: one localized header
 * record, then one record per on-screen teacher — id, identity, contact,
 * governance/privilege booleans, rating, subjects, and the joined stamp.
 */
export function buildTeachersDirectoryCsv(items: readonly TeacherDirectoryRow[], labels: AdminTeachersLabels): string {
  const lines: string[] = [];

  lines.push(
    csvRecord([
      labels.fields.id,
      labels.headers.name,
      labels.fields.email,
      labels.fields.phone,
      labels.fields.country,
      labels.statusPills.approved,
      labels.statusPills.evaluator,
      labels.headers.rating,
      labels.statusPills.online,
      labels.headers.subjects,
      labels.statusPills.deleted,
      labels.statusPills.suspended,
      labels.statusPills.blocked,
      labels.headers.joined,
    ])
  );

  for (const teacher of items) {
    lines.push(
      csvRecord([
        String(teacher.id),
        teacher.name,
        teacher.email,
        // Honest null → empty cell (the em-dash is a display-only affordance).
        teacher.phone ?? "",
        teacher.country ?? "",
        boolCell(teacher.isApproved),
        boolCell(teacher.isEvaluator),
        // Raw decimal string verbatim — never parsed, never locale-shaped.
        teacher.averageRating === null ? "" : String(teacher.averageRating),
        boolCell(teacher.isOnline),
        teacher.subjects.join(";"),
        boolCell(teacher.isDeleted),
        boolCell(teacher.suspended),
        boolCell(teacher.isBlocked),
        teacher.createdAt,
      ])
    );
  }

  return `${UTF8_BOM}${lines.join("")}`;
}

/**
 * Derives the download filename from the wall clock:
 * `teachers-directory-YYYY-MM-DD-HHmm.csv` (UTC, minute precision — the
 * same stamp recipe the analytics export uses). The clock is injected so
 * callers (and tests) can pin the stamp; production uses the default.
 */
export function teachersDirectoryCsvFilename(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hour = pad(now.getUTCHours());
  const minute = pad(now.getUTCMinutes());
  return `teachers-directory-${year}-${month}-${day}-${hour}${minute}.csv`;
}
