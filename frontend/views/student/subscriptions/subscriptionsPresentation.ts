/**
 * subscriptionsPresentation — pure type→presentation maps for the
 * my-subscriptions view (the `plansViewLabels` precedent: namespace-owned
 * localized copy, never raw server data).
 *
 * Rows carry the codegen `SubscriptionStatus` lifecycle value; the derived
 * payment-failed chip is presentation-only (a failed payment leaves the
 * subscription row `Pending` — `SubscriptionStatus` has no failed member).
 * The lookup table mirrors the codegen vocabulary exhaustively (the
 * `Record` lookup-table convention — never a switch on enum values), so
 * the map is total and no undefined-fallback branch exists.
 */
import type { SubscriptionStatus } from "@/frontend/graphql/generated/gql/graphql";
import type { CheckoutLabels } from "@/shared/locale/types/checkout";

/** The lifecycle chip label per `SubscriptionStatus` — the checkout
 * namespace's COMPLETE lifecycle chip vocabulary (map total by
 * construction — every codegen member carries an entry). */
const STATUS_LABELS: Readonly<Record<SubscriptionStatus, (t: CheckoutLabels) => string>> = {
  Active: t => t.statusActive,
  Pending: t => t.statusPending,
  Expired: t => t.statusExpired,
  Cancelled: t => t.statusCancelled,
  Suspended: t => t.statusSuspended,
};

/** Resolves the localized chip label for a subscription status value. */
export function statusChipLabel(status: SubscriptionStatus, t: CheckoutLabels): string {
  return STATUS_LABELS[status](t);
}

/** The derived payment-failed chip label (the failed-payment row's chip). */
export function paymentFailedChipLabel(t: CheckoutLabels): string {
  return t.statusFailed;
}
