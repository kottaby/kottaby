import {
  LinkStatus,
  type MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests,
} from "@/frontend/graphql/generated/gql/graphql";
import { displayLinkRequestStatus, isLinkRequestActionable } from "@/frontend/lib/parent-link-request-status";

/**
 * Derivation helpers for the student dashboard's pending-link-requests
 * discoverability card (DEV1-015 task 4.2).
 *
 * PURE module — no React imports, no Apollo imports, no clock reads: the
 * caller owns `nowMs` (the card captures ONE `now` at mount per the
 * read-purity convention). Actionability is REUSED verbatim from
 * `frontend/lib/parent-link-request-status.ts` — the computed-status
 * machinery is never forked, so the dashboard card ALWAYS agrees with the
 * decision page and the backend liveness classifier on which rows count.
 */

/** The card's settled summary — `null` models "zero actionable → render nothing". */
export interface ActionableIncomingSummary {
  readonly count: number;
  /** Full name of the MOST RECENT actionable requester (by `createdAt`). */
  readonly latestParentFullName: string;
}

/**
 * Reduces the incoming link-request rows to the dashboard card summary:
 *
 *  - a row is ACTIONABLE iff its displayed status is `Pending` (computed:
 *    stored `pending` past its expiry shows `Expired` and drops out) AND the
 *    shared strict-`>` liveness predicate (`isLinkRequestActionable`) holds —
 *    the boundary instant `expiresAt === now` is NOT actionable;
 *  - `latest` is the most recent actionable row by `createdAt` (max, never
 *    array order — the wire's newest-first contract is not trusted here);
 *  - zero actionable rows → `null` (the card unmounts, REQ-015/052).
 *
 * Single pass, no `reduce` (sonarjs/reduce-initial-value) and no indexed
 * access: the newest-so-far champion is tracked by timestamp, so a
 * lower-than-`NEGATIVE_INFINITY`-comparing value can never win.
 */
export function deriveActionableIncoming(
  rows: ReadonlyArray<MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests>,
  nowMs: number
): ActionableIncomingSummary | null {
  let count = 0;
  let latestCreatedAtMs = Number.NEGATIVE_INFINITY;
  let latestParentFullName: string | null = null;
  for (const row of rows) {
    const actionable =
      displayLinkRequestStatus(row.status, row.expiresAt, nowMs) === LinkStatus.Pending &&
      isLinkRequestActionable(row.status, row.expiresAt, nowMs);
    if (!actionable) {
      continue;
    }
    count += 1;
    const createdAtMs = new Date(row.createdAt).getTime();
    if (createdAtMs > latestCreatedAtMs) {
      latestCreatedAtMs = createdAtMs;
      latestParentFullName = row.parentFullName;
    }
  }
  if (latestParentFullName === null) {
    return null;
  }
  return { count, latestParentFullName };
}
