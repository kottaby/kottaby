"use client";

/**
 * Pure helpers for the admin teacher-directory surfaces (no JSX, no component
 * exports — safe to export non-component values from here without tripping
 * `react-refresh/only-export-components`).
 *
 * Centralizes the filter draft unions (narrowed to the GraphQL Boolean
 * filter values by the hook), the localized rating formatter, and the
 * subjects-chip overflow policy so the desktop table and the mobile card
 * list render identical semantics.
 */

import type { AppLocale } from "@/shared/locale";

/** Approval filter draft union — mapped onto the nullable Boolean filter. */
export type TeacherApprovalFilter = "Approved" | "Pending";

/** Online-presence filter draft union — mapped onto the nullable Boolean filter. */
export type TeacherOnlineFilter = "Online" | "Offline";

/** Evaluator filter draft union — mapped onto the nullable Boolean filter. */
export type TeacherEvaluatorFilter = "Evaluator" | "NonEvaluator";

/** `TeacherApprovalFilter` → backend `approval: Boolean` (absent = all). */
export function approvalFilterToBoolean(filter: TeacherApprovalFilter): boolean {
  return filter === "Approved";
}

/** `TeacherOnlineFilter` → backend `online: Boolean` (absent = all). */
export function onlineFilterToBoolean(filter: TeacherOnlineFilter): boolean {
  return filter === "Online";
}

/** `TeacherEvaluatorFilter` → backend `evaluator: Boolean` (absent = all). */
export function evaluatorFilterToBoolean(filter: TeacherEvaluatorFilter): boolean {
  return filter === "Evaluator";
}

/**
 * Localized rating rendering of the nullable `averageRating` — one decimal
 * place through `Intl.NumberFormat` (Arabic-Indic digits under `ar`), the
 * em-dash when the teacher has no rating yet.
 */
export function formatTeacherRating(value: number | null, locale: AppLocale): string {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** Max subject chips rendered per row before the "+N" overflow chip appears. */
export const ADMIN_TEACHERS_SUBJECTS_LIMIT = 3;

/**
 * Stable skeleton keys for the loading state (table rows and mobile cards).
 * Hard-coded identifiers (not array indices) keep React reconciliation
 * stable and satisfy `react/no-array-index-key`; no state lives on a
 * skeleton row, so identity is unambiguous.
 */
export const ADMIN_TEACHERS_SKELETON_KEYS = [
  "skeleton-1",
  "skeleton-2",
  "skeleton-3",
  "skeleton-4",
  "skeleton-5",
  "skeleton-6",
  "skeleton-7",
  "skeleton-8",
] as const;
