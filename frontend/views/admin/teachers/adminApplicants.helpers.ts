"use client";

/**
 * Pure helpers for the admin applicant-queue surfaces (no JSX, no component
 * exports — safe to export non-component values from here without tripping
 * `react-refresh/only-export-components`).
 *
 * Centralizes the status-filter draft union (the canonical lowercase wire
 * vocabulary the backend validates fail-closed), the status → tonal-lane
 * mapping with its honest verbatim fallback, the cooling-down predicate,
 * and the skeleton-key list so the desktop table and the mobile card list
 * render identical semantics.
 */

import type { DirectoryTone } from "@/frontend/views/admin/users/utils";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Applicant status filter draft union — the backend's canonical wire values. */
export type ApplicantStatusFilter = "pending" | "in_evaluation" | "failed" | "passed";

/** The four canonical applicant-status wire values, in display order. */
export const ADMIN_APPLICANT_STATUSES = ["pending", "in_evaluation", "failed", "passed"] as const;

/** Runtime narrowing of the select's string value back to the status union. */
export function asApplicantStatusFilter(value: string): ApplicantStatusFilter | "" {
  return (ADMIN_APPLICANT_STATUSES as readonly string[]).includes(value) ? (value as ApplicantStatusFilter) : "";
}

/**
 * Applicant status → tonal lane (pending = warning, in evaluation =
 * secondary, failed = error, passed = success). Unknown wire values fall
 * back to the neutral lane so a corrupt status can never paint a confident
 * semantic color.
 */
export function applicantStatusTone(status: string): DirectoryTone {
  switch (status) {
    case "pending":
      return "warning";
    case "in_evaluation":
      return "secondary";
    case "failed":
      return "error";
    case "passed":
      return "success";
    default:
      return "neutral";
  }
}

/**
 * Localized applicant-status label — mapped lookup over the four canonical
 * values; any unknown wire value renders VERBATIM (honest fallback — the
 * queue is a display projection, never a lifecycle authority).
 */
export function applicantStatusLabel(status: string, labels: AdminTeachersLabels["applicantStatus"]): string {
  switch (status) {
    case "pending":
      return labels.pending;
    case "in_evaluation":
      return labels.inEvaluation;
    case "failed":
      return labels.failed;
    case "passed":
      return labels.passed;
    default:
      return status;
  }
}

/**
 * Cooling-down predicate — `true` while the applicant's cooldown window is
 * still in the future at the given clock tick (client-side comparison; the
 * queue renders an advisory chip, the backend remains the lifecycle
 * authority).
 */
export function isCoolingDown(cooldownUntil: string | null, now: number): boolean {
  if (cooldownUntil === null) {
    return false;
  }
  const expiry = Date.parse(cooldownUntil);
  return Number.isFinite(expiry) && expiry > now;
}

/**
 * Stable skeleton keys for the loading state (table rows and mobile cards).
 * Hard-coded identifiers (not array indices) keep React reconciliation
 * stable and satisfy `react/no-array-index-key`; no state lives on a
 * skeleton row, so identity is unambiguous.
 */
export const ADMIN_APPLICANTS_SKELETON_KEYS = [
  "applicant-skeleton-1",
  "applicant-skeleton-2",
  "applicant-skeleton-3",
  "applicant-skeleton-4",
  "applicant-skeleton-5",
  "applicant-skeleton-6",
  "applicant-skeleton-7",
  "applicant-skeleton-8",
] as const;
