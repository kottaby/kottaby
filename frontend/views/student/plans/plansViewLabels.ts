/**
 * plansViewLabels — lane-label resolution for the student plan catalog.
 *
 * The balance-lane VALUE arrives from the plan row (`balanceLane`); the
 * LABEL is namespace-owned localized copy — never raw server data. The
 * lookup table mirrors the codegen `SubscriptionCreditLane` vocabulary
 * exhaustively (the `Record<string, string>` lookup-table convention —
 * never a switch on enum values), with the impossible-value fallback
 * keeping the map total.
 */

import type { SubscriptionCreditLane } from "@/frontend/graphql/generated/gql/graphql";
import type { CheckoutLabels } from "@/shared/locale/types/checkout";

/** The exhaustive lane → label lookup over the checkout namespace copy. */
const LANE_LABELS: Record<SubscriptionCreditLane, (t: CheckoutLabels) => string> = {
  Hifz: t => t.laneHifz,
  Tajweed: t => t.laneTajweed,
  Reviews: t => t.laneReviews,
};

/**
 * Resolves the localized lane label for a `balanceLane` value; unknown
 * values (unreachable over the codegen vocabulary) fall back to the raw
 * value so the total map never yields `undefined`.
 */
export function resolveLaneLabel(lane: SubscriptionCreditLane, t: CheckoutLabels): string {
  const resolve = LANE_LABELS[lane];
  if (resolve === undefined) {
    return lane;
  }
  return resolve(t);
}
