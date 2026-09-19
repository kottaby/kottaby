/**
 * Pure view helpers of the admin student drawer's subscription-management
 * section. Extracted so the per-status action matrix, the extend-days
 * validation, the cancel-reason normalization, the change-plan eligibility
 * filter, and the newest-first ordering stay testable without rendering
 * (the rateTeacherMutationError test precedent: pure logic tier).
 *
 * Enum discipline: status/direction comparisons flow from VALUE
 * imports of the generated enums through exhaustive Record lookup tables —
 * never runtime string literals, never switch statements on enum values.
 *
 * The server stays the authority: client validation only gates the
 * "days > 0" rule and the 200-character cancel-reason seam cap
 * (both mirrored from the backend contract); everything else degrades to
 * the server's localized denial surfaced inside the dialog.
 */
import {
  type AdminPlansQuery,
  type AdminStudentSubscriptionsQuery,
  ProrationDirection,
  SubscriptionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import type { DirectoryTone } from "@/frontend/views/admin/users/utils";

/** One subscription row as the drawer section consumes it (query shape). */
export type SubscriptionRow = AdminStudentSubscriptionsQuery["adminStudentSubscriptions"][number];

/** One admin catalog plan as the change-plan selector consumes it. */
export type AdminPlanItem = AdminPlansQuery["adminPlans"][number];

/** UI-seam cap for the optional cancel reason (mirrors the backend boundary). */
export const MAX_CANCEL_REASON_LENGTH = 200;

// ---------------------------------------------------------------------------
// Ordering — the drawer renders newest-first

/**
 * Rows ordered newest-first by creation stamp. The server already orders
 * the list; this client-side sort keeps the drawer honest when rows from
 * different refetch generations merge in the cache.
 */
export function sortNewestFirst(rows: readonly SubscriptionRow[]): SubscriptionRow[] {
  return [...rows].toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ---------------------------------------------------------------------------
// Status presentation

/** Status → directory tone lane (M3 container pairs from the shared lookup). */
export const STATUS_TONE: Record<SubscriptionStatus, DirectoryTone> = {
  [SubscriptionStatus.Active]: "success",
  [SubscriptionStatus.Expired]: "error",
  [SubscriptionStatus.Pending]: "warning",
  [SubscriptionStatus.Cancelled]: "neutral",
  [SubscriptionStatus.Suspended]: "secondary",
};

// ---------------------------------------------------------------------------
// Per-status action matrix

/** Which lifecycle actions a row's status affords. */
export interface SubscriptionRowActions {
  /** Extend the active window (active rows only). */
  readonly extend: boolean;
  /** Renew into a fresh period (expired rows only). */
  readonly renew: boolean;
  /** Cancel balance-preserving (active rows only). */
  readonly cancel: boolean;
  /** Change plan within the lane (active rows only). */
  readonly changePlan: boolean;
}

const NO_ACTIONS: SubscriptionRowActions = {
  extend: false,
  renew: false,
  cancel: false,
  changePlan: false,
};

const ACTIVE_ACTIONS: SubscriptionRowActions = {
  extend: true,
  renew: false,
  cancel: true,
  changePlan: true,
};

const EXPIRED_ACTIONS: SubscriptionRowActions = {
  extend: false,
  renew: true,
  cancel: false,
  changePlan: false,
};

/**
 * The exhaustive per-status action matrix — active → extend/cancel/
 * change plan; expired → renew; pending/cancelled (and the
 * governance-owned `suspended`) → none.
 */
export const ACTIONS_BY_STATUS: Record<SubscriptionStatus, SubscriptionRowActions> = {
  [SubscriptionStatus.Active]: ACTIVE_ACTIONS,
  [SubscriptionStatus.Expired]: EXPIRED_ACTIONS,
  [SubscriptionStatus.Pending]: NO_ACTIONS,
  [SubscriptionStatus.Cancelled]: NO_ACTIONS,
  [SubscriptionStatus.Suspended]: NO_ACTIONS,
};

/** Resolves the action availability for one row's lifecycle status. */
export function actionsForStatus(status: SubscriptionStatus): SubscriptionRowActions {
  return ACTIONS_BY_STATUS[status];
}

// ---------------------------------------------------------------------------
// Extend dialog — days validation (whole days > 0, client-side)

/**
 * Parses the extend-days input into a positive whole day count, or `null`
 * when the input is not a strictly positive integer (0, negatives,
 * decimals, and non-numeric garbage all fail; the server keeps the
 * window-ceiling authority).
 */
export function parseExtendDays(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const days = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(days) || days <= 0) {
    return null;
  }
  return days;
}

// ---------------------------------------------------------------------------
// Cancel dialog — optional bounded reason

/**
 * Normalizes the optional cancel reason: blank (or whitespace-only)
 * resolves to `null`, otherwise the trimmed value is clamped to the
 * backend's 200-character audit boundary.
 */
export function normalizeCancelReason(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, MAX_CANCEL_REASON_LENGTH);
}

// ---------------------------------------------------------------------------
// Change-plan dialog — same-lane eligibility

/**
 * The change-plan target candidates: ACTIVE plans crediting the SAME
 * balance lane as the source subscription's plan, excluding the source
 * plan itself. Cross-lane migration is out of scope server-side — the
 * selector simply never offers an ineligible plan.
 */
export function eligibleChangePlanTargets(
  plans: readonly AdminPlanItem[],
  sourcePlanId: number,
  sourceLane: AdminPlanItem["balanceLane"]
): AdminPlanItem[] {
  return plans.filter(
    plan =>
      plan.isActive && plan.id !== String(sourcePlanId) && plan.balanceLane !== null && plan.balanceLane === sourceLane
  );
}

// ---------------------------------------------------------------------------
// Plan-change proration copy

/** Which proration summary line the payload's direction maps to. */
export type ProrationCopyKind = "carried" | "forfeited";

const DIRECTION_COPY_KIND: Record<ProrationDirection, ProrationCopyKind> = {
  [ProrationDirection.Upgrade]: "carried",
  [ProrationDirection.Downgrade]: "forfeited",
};

/** Resolves the proration result-copy slot for the mutation's direction. */
export function prorationCopyKind(direction: ProrationDirection): ProrationCopyKind {
  return DIRECTION_COPY_KIND[direction];
}
