/**
 * Admin student-directory mappers — raw DB row → canonical return-shape
 * projections for the `adminStudents` directory surface. Mirrors the
 * `user-management.mappers.ts` discipline: pure functions, null-coalesced
 * nullable columns, and a derived `hasParent` headline computed from the
 * `parent_id` link state (never from caller input).
 */
import type { AdminStudentDirectoryRow } from "@/backend/db/repo/students/student.repository";
import type { AdminStudentItemReturnType } from "@/backend/types";

/**
 * Maps a raw student-directory DB row to the canonical directory item
 * shape. Held-balance lanes are null-coalesced (`?? 0`) per the
 * missing-value-reads-as-zero discipline (`balance_trial` is NOT NULL at
 * the schema layer and passes through); `hasParent` derives from the
 * `parent_id` link state; the parent display identity comes from the LEFT
 * JOINed parent `users` row (`null` when unlinked).
 */
export function mapStudentDirectoryRow(row: AdminStudentDirectoryRow): AdminStudentItemReturnType {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    balanceHifz: row.balanceHifz ?? 0,
    balanceReviews: row.balanceReviews ?? 0,
    balanceTajweed: row.balanceTajweed ?? 0,
    balanceTrial: row.balanceTrial,
    trialGrantedAt: row.trialGrantedAt,
    primaryLanguage: row.primaryLanguage,
    anotherLanguage: row.anotherLanguage,
    hasParent: row.parentId !== null,
    parentName: row.parentName,
    parentEmail: row.parentEmail,
    createdAt: row.createdAt,
  };
}
