/**
 * Admin teacher-directory mappers — raw DB row → canonical return-shape
 * projections for the `adminTeachers` directory surface. Mirrors the
 * `user-management.mappers.ts` discipline: pure functions, fail-safe
 * payload parsing, null-coalesced governance booleans — a corrupt stored
 * value degrades its own field, never the whole directory read.
 */
import type { AdminTeacherDirectoryRow } from "@/backend/db/repo/teachers/teacher.repository";
import type { AdminTeacherItemReturnType } from "@/backend/types";

/**
 * Parses the `teacher.subjects` varchar JSON payload into a string array.
 * Every non-conforming shape (null/empty, unparseable JSON, non-array
 * root, non-string members) is filtered out — a corrupt payload degrades
 * to an empty list instead of failing the directory read.
 */
export function parseSubjectsJson(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

/**
 * Parses the `teacher.average_rating` decimal(3,2) read-back into a float.
 * Drizzle's default numeric mode returns the decimal as a string; `null`
 * (unrated teacher) passes through, and an unparseable payload degrades to
 * `null` rather than `NaN`.
 */
export function parseAverageRating(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Maps a raw teacher-directory DB row to the canonical directory item
 * shape. Governance/certification booleans are null-coalesced (`?? false`)
 * per the missing-value-reads-as-false discipline; `subjects` and
 * `averageRating` ride their defensive parsers above.
 */
export function mapTeacherDirectoryRow(row: AdminTeacherDirectoryRow): AdminTeacherItemReturnType {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    isApproved: row.isApproved ?? false,
    isEvaluator: row.isEvaluator ?? false,
    averageRating: parseAverageRating(row.averageRating),
    isOnline: row.isOnline ?? false,
    subjects: parseSubjectsJson(row.subjects),
    isDeleted: row.isDeleted ?? false,
    suspended: row.suspended ?? false,
    isBlocked: row.isBlocked ?? false,
    createdAt: row.createdAt,
  };
}
