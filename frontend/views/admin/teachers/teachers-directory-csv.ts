/**
 * Teacher-directory CSV export — the pure client-side serialization of the
 * CURRENT page the directory already holds (no second fetch, no backend
 * change: the export reflects EXACTLY the rows on screen, same honesty
 * contract as the platform-analytics export).
 *
 * This module owns the COLUMN layout (localized caption handles) and the
 * per-row VALUE mapping (locale-neutral wire data); the FORMAT — RFC-4180
 * escaping, BOM prefix, record structure, filename stamp — lives in the
 * shared `directory-shared/directory-csv`.
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
 * stay locale-neutral wire data.
 *
 * Formula-injection note: every cell value originates from the repo-owned
 * translation files or the trusted directory read model (names, emails,
 * booleans, ISO timestamps) — no user-authored free text enters a cell, so
 * the classic `=`/`+`/`-`/`@` prefix guard is intentionally not applied
 * (prefixing would corrupt round-tripping of legitimate data).
 */

import type { AdminTeachersQuery } from "@/frontend/graphql/generated/gql/graphql";
import {
  buildDirectoryCsv,
  csvBoolCell,
  directoryCsvFilename,
} from "@/frontend/views/admin/directory-shared/directory-csv";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** One directory row as the query delivered it (the extracted item type). */
type TeacherDirectoryRow = AdminTeachersQuery["adminTeachers"]["items"][number];

/**
 * Builds the full CSV document for the CURRENT page: one localized header
 * record, then one record per on-screen teacher — id, identity, contact,
 * governance/privilege booleans, rating, subjects, and the joined stamp.
 */
export function buildTeachersDirectoryCsv(items: readonly TeacherDirectoryRow[], labels: AdminTeachersLabels): string {
  return buildDirectoryCsv({
    headers: [
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
    ],
    rows: items.map(teacher => [
      String(teacher.id),
      teacher.name,
      teacher.email,
      // Honest null → empty cell (the em-dash is a display-only affordance).
      teacher.phone ?? "",
      teacher.country ?? "",
      csvBoolCell(teacher.isApproved),
      csvBoolCell(teacher.isEvaluator),
      // Raw decimal string verbatim — never parsed, never locale-shaped.
      teacher.averageRating === null ? "" : String(teacher.averageRating),
      csvBoolCell(teacher.isOnline),
      teacher.subjects.join(";"),
      csvBoolCell(teacher.isDeleted),
      csvBoolCell(teacher.suspended),
      csvBoolCell(teacher.isBlocked),
      teacher.createdAt,
    ]),
  });
}

/**
 * Derives the download filename from the wall clock:
 * `teachers-directory-YYYY-MM-DD-HHmm.csv` (UTC, minute precision — the
 * same stamp recipe the analytics export uses). The clock is injected so
 * callers (and tests) can pin the stamp; production uses the default.
 */
export function teachersDirectoryCsvFilename(now: Date = new Date()): string {
  return directoryCsvFilename("teachers-directory", now);
}
