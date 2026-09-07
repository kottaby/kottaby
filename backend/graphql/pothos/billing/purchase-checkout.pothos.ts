/**
 * PurchaseSubscriptionPayloadPothosObject + PaymentCheckoutPothosObject —
 * the wrapper surface of the purchase mutation.
 *
 * Wrapper Exception Policy (`backend/graphql/AGENTS.md`): the purchase
 * response is a composition, not an entity — `PurchaseSubscriptionPayload`
 * is backed EXCLUSIVELY by `PurchaseSubscriptionReturnType` and
 * `PaymentCheckout` by `PaymentCheckoutSession`, both imported from
 * `@/backend/types` (zero local type definitions). Neither wrapper carries
 * an `id`: they are embedded value objects, and Apollo cache normalization
 * converges on the nested `Subscription`/`StudentPayment` identities.
 *
 * `PaymentCheckout` is the provider-agnostic checkout descriptor: the
 * gateway that owns the session, the provider-issued reference to correlate
 * webhook deliveries with the pending pair, and the hosted-checkout URL —
 * nullable because server-side providers (the built-in mock among them)
 * legitimately have none.
 *
 * Registered ahead of its resolver through the billing Pothos barrel
 * (`gqlSchema.ts` side-effect chain).
 */

import { StudentPaymentPothosObject } from "@/backend/graphql/pothos/billing/student-payment.pothos";
import { SubscriptionPothosObject } from "@/backend/graphql/pothos/billing/subscription.pothos";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { PaymentGatewayPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
import type { PaymentCheckoutSession, PurchaseSubscriptionReturnType } from "@/backend/types";

/**
 * The `PaymentCheckout` wrapper — one gateway checkout session descriptor.
 */
export const PaymentCheckoutPothosObject = gqlSchemaBuilder
  .objectRef<PaymentCheckoutSession>("PaymentCheckout")
  .implement({
    description: "Gateway checkout descriptor for a purchase in flight.",
    fields: t => ({
      provider: t.expose("provider", {
        type: PaymentGatewayPothosEnum,
        description: "Gateway that owns the checkout session.",
      }),
      providerReference: t.exposeString("providerReference", {
        description: "Provider-issued reference correlating webhook deliveries with this purchase.",
      }),
      checkoutUrl: t.exposeString("checkoutUrl", {
        nullable: true,
        description: "Hosted checkout URL to redirect the payer to, or null for server-side providers.",
      }),
    }),
  });

/**
 * The `PurchaseSubscriptionPayload` wrapper — the newly created pending
 * subscription + payment pair plus the checkout descriptor.
 */
export const PurchaseSubscriptionPayloadPothosObject = gqlSchemaBuilder
  .objectRef<PurchaseSubscriptionReturnType>("PurchaseSubscriptionPayload")
  .implement({
    description: "Result of a successful purchase attempt — the pending pair and its checkout session.",
    fields: t => ({
      subscription: t.field({
        type: SubscriptionPothosObject,
        description: "The freshly created pending subscription.",
        resolve: parent => parent.subscription,
      }),
      payment: t.field({
        type: StudentPaymentPothosObject,
        description: "The freshly created pending payment record.",
        resolve: parent => parent.payment,
      }),
      checkout: t.field({
        type: PaymentCheckoutPothosObject,
        description: "The gateway checkout session opened for this purchase.",
        resolve: parent => parent.checkout,
      }),
    }),
  });
