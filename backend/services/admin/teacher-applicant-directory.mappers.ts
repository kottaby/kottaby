/**
 * Admin teacher-applicant-directory mappers — raw DB row → canonical
 * return-shape projections for the `adminTeacherApplicants` directory
 * surface. Mirrors the `teacher-directory.mappers.ts` discipline: pure
 * functions, null-coalesced governance booleans and default-valued columns
 * — a missing stored value degrades its own field to the column default,
 * never the whole directory read.
 */
import type { AdminApplicantDirectoryRow } from "@/backend/db/repo/teachers/applicant.repository";
import { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import type { AdminApplicantItemReturnType } from "@/backend/types";

/**
 * Maps a raw applicant-directory DB row to the canonical directory item
 * shape. Nullability discipline (mirroring `mapTeacherDirectoryRow`):
 *  - `status` / `verificationAttempts` coalesce to their column defaults
 *    (`pending` / `0`) so a missing value still renders a stage + counter.
 *  - `lastAttemptAt` / `cooldownUntil` pass through null-safely — they are
 *    NULL until the first verification attempt / cooldown grant.
 *  - The governance booleans are null-coalesced (`?? false`) per the
 *    missing-value-reads-as-false discipline.
 */
export function mapApplicantDirectoryRow(row: AdminApplicantDirectoryRow): AdminApplicantItemReturnType {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    status: row.status ?? ApplicantStatus.Pending,
    verificationAttempts: row.verificationAttempts ?? 0,
    lastAttemptAt: row.lastAttemptAt,
    cooldownUntil: row.cooldownUntil,
    isDeleted: row.isDeleted ?? false,
    suspended: row.suspended ?? false,
    isBlocked: row.isBlocked ?? false,
    createdAt: row.createdAt,
  };
}
