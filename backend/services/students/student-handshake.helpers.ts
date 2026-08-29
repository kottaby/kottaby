/**
 * Governance predicate for parent-side handshake-code discovery.
 *
 * Pure module: no I/O, no clock reads (the caller supplies the evaluation
 * instant), no module-level mutable state. Repositories return governance
 * columns faithfully; deciding whether a governed child stays discoverable is
 * a service concern, and this helper is that single decision point.
 *
 * Fail-closed by design: when governance data is incomplete (a suspended row
 * missing its window start or duration), the child is treated as actively
 * governed — missing data must never widen discovery visibility.
 */
import type { UserSelectType } from "@/backend/types";

/** Milliseconds per day — the unit of `users.suspended_period_days`. */
const MS_PER_DAY = 86_400_000;

/**
 * Fail-closed: any governed state excludes the child from parent discovery by
 * collapsing the lookup to "does not exist".
 *
 *  - `isDeleted` or `isBlocked` → always excluded;
 *  - not suspended → included;
 *  - suspended with a missing window start or duration → excluded
 *    (fail-closed — incomplete governance data never widens visibility);
 *  - actively suspended (window end strictly after `now`) → excluded;
 *  - lapsed suspension (window end at or before `now`) → included.
 */
export function isGovernanceExcludedFromDiscovery(
  governance: Pick<UserSelectType, "isDeleted" | "isBlocked" | "suspended" | "suspendedAt" | "suspendedPeriodDays">,
  now: Date
): boolean {
  if (governance.isDeleted || governance.isBlocked) {
    return true;
  }
  if (!governance.suspended) {
    return false;
  }
  if (!governance.suspendedAt || governance.suspendedPeriodDays === null) {
    return true;
  }
  const endsAt = new Date(governance.suspendedAt.getTime() + governance.suspendedPeriodDays * MS_PER_DAY);
  // Strict comparison: a suspension window ending exactly at `now` has lapsed.
  return endsAt.getTime() > now.getTime();
}
