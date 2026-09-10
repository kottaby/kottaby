"use client";

/**
 * Pure helpers for the admin student-directory surfaces (no JSX, no component
 * exports — safe to export non-component values from here without tripping
 * `react-refresh/only-export-components`).
 *
 * Centralizes the filter draft unions (narrowed onto the backend's nullable
 * Boolean / string filters by the hook) and the stable skeleton keys so the
 * desktop table and the mobile card list render identical semantics.
 */

/** Parent-link filter draft union — mapped onto the nullable Boolean filter. */
export type StudentHasParentFilter = "WithParent" | "Independent";

/** `StudentHasParentFilter` → backend `hasParent: Boolean` (absent = all). */
export function hasParentFilterToBoolean(filter: StudentHasParentFilter): boolean {
  return filter === "WithParent";
}

/**
 * Stable skeleton keys for the loading state (table rows and mobile cards).
 * Hard-coded identifiers (not array indices) keep React reconciliation
 * stable and satisfy `react/no-array-index-key`; no state lives on a
 * skeleton row, so identity is unambiguous.
 */
export const ADMIN_STUDENTS_SKELETON_KEYS = [
  "skeleton-1",
  "skeleton-2",
  "skeleton-3",
  "skeleton-4",
  "skeleton-5",
  "skeleton-6",
  "skeleton-7",
  "skeleton-8",
] as const;
