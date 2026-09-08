/**
 * Applicant-queue CSV export — the pure client-side serialization of the
 * SERVER-SIDE export-all dump (the `adminTeacherApplicantsExport` query):
 * the rows arrive from the backend bounded to its EXPORT_MAX_ROWS cap, so
 * the export reflects the WHOLE filtered queue, not the current page.
 *
 * Module posture — EVERYTHING string-building is pure and synchronous:
 *  - `buildApplicantsDirectoryCsv` turns the export rows + the caller's
 *    translation handles into one UTF-8 CSV document (BOM-prefixed so
 *    spreadsheet apps open the Arabic labels correctly);
 *  - `applicantsDirectoryCsvFilename` derives the download filename from
 *    the wall clock (UTC, minute precision).
 *
 * Honesty contract (mirrors the sibling directory builders):
 *  - the lifecycle status serializes as the raw lowercase wire string
 *    (`pending` / `in_evaluation` / `failed` / `passed`) — never a
 *    localized pill;
 *  - booleans serialize as lowercase `true`/`false` wire strings;
 *  - honest-null values (phone, country, lastAttemptAt, cooldownUntil)
 *    serialize as EMPTY cells (the `—` and the cooling-down chip are
 *    display affordances, not values);
 *  - `createdAt` / `lastAttemptAt` / `cooldownUntil` flow verbatim as the
 *    ISO wire strings.
 *
 * Content decision — labels are LOCALIZED: column captions come from the
 * same translation handles the queue table renders (headers,
 * applicantHeaders, statusPills, fields — zero new captions minted). All
 * VALUES stay locale-neutral wire data. The only non-label literals are
 * the field separators (`,`) and the newline (`\n`) — the CSV format
 * itself.
 *
 * Formula-injection note: every cell value originates from the repo-owned
 * translation files or the trusted queue read model (names, emails, ISO
 * timestamps, booleans) — no user-authored free text enters a cell, so the
 * classic `=`/`+`/`-`/`@` prefix guard is intentionally not applied
 * (prefixing would corrupt round-tripping of legitimate data).
 */

import type { AdminTeacherApplicantsExportQuery } from "@/frontend/graphql/generated/gql/graphql";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** UTF-8 BOM — spreadsheet apps detect the encoding and render Arabic labels. */
const UTF8_BOM = "\uFEFF";

/** One export row as the export query delivered it (the extracted item type). */
type ApplicantDirectoryRow = AdminTeacherApplicantsExportQuery["adminTeacherApplicantsExport"]["rows"][number];

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
 * Builds the full CSV document for the EXPORT-ALL dump: one localized
 * header record, then one record per filtered applicant — id, identity,
 * contact, lifecycle status, verification attempts, last-attempt and
 * cooldown stamps, governance booleans, and the joined stamp.
 */
export function buildApplicantsDirectoryCsv(
  items: readonly ApplicantDirectoryRow[],
  labels: AdminTeachersLabels
): string {
  const lines: string[] = [];

  lines.push(
    csvRecord([
      labels.fields.id,
      labels.headers.name,
      labels.fields.email,
      labels.fields.phone,
      labels.fields.country,
      labels.headers.status,
      labels.applicantHeaders.attempts,
      labels.applicantHeaders.lastAttempt,
      labels.applicantHeaders.cooldown,
      labels.statusPills.deleted,
      labels.statusPills.suspended,
      labels.statusPills.blocked,
      labels.headers.joined,
    ])
  );

  for (const applicant of items) {
    lines.push(
      csvRecord([
        String(applicant.id),
        applicant.name,
        applicant.email,
        // Honest null → empty cell (the em-dash is a display-only affordance).
        applicant.phone ?? "",
        applicant.country ?? "",
        // Raw wire status — never the localized pill.
        applicant.status,
        String(applicant.verificationAttempts),
        applicant.lastAttemptAt ?? "",
        applicant.cooldownUntil ?? "",
        boolCell(applicant.isDeleted),
        boolCell(applicant.suspended),
        boolCell(applicant.isBlocked),
        applicant.createdAt,
      ])
    );
  }

  return `${UTF8_BOM}${lines.join("")}`;
}

/**
 * Derives the download filename from the wall clock:
 * `applicants-directory-YYYY-MM-DD-HHmm.csv` (UTC, minute precision — the
 * same stamp recipe the sibling directory exports use). The clock is
 * injected so callers (and tests) can pin the stamp; production uses the
 * default.
 */
export function applicantsDirectoryCsvFilename(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hour = pad(now.getUTCHours());
  const minute = pad(now.getUTCMinutes());
  return `applicants-directory-${year}-${month}-${day}-${hour}${minute}.csv`;
}
