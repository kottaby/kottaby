import type { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import type { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import type { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import type { PaymentCheckoutSession } from "@/backend/types/billing/payment-gateway.types";
import type { StudentPaymentReturnType } from "@/backend/types/billing/student-payment.types";

export type SubscriptionSelectType = typeof subscriptions.$inferSelect;
export type SubscriptionInsertType = typeof subscriptions.$inferInsert;

/**
 * Canonical GraphQL/API read shape for a subscription row.
 *
 * Derived from the table's select row with the two enum columns re-typed
 * to their canonical TypeScript enums (`backend/enum/billing/`): the raw
 * `$inferSelect` projection carries the pgEnum string-literal unions,
 * while consumers of this shape work with the enum objects, forcing
 * enum-member usage and turning accidental raw literals into compile
 * errors. `paymentMethod` stays nullable — a subscription exists before
 * any gateway is involved, and admin-recorded offline payments may never
 * set it.
 */
export type SubscriptionReturnType = Omit<SubscriptionSelectType, "status" | "paymentMethod"> & {
  status: SubscriptionStatus;
  paymentMethod: PaymentGateway | null;
};

/**
 * Purchase input: the client-controlled whitelist ONLY (BOPLA).
 *
 * `planId` is the sole client-supplied field. The purchaser identity is
 * resolved from the authenticated caller's context, and every financial
 * column (amount, currency, gateway, reference) is derived server-side
 * from the freshly-read plan row — a client payload structurally cannot
 * carry, spoof, or influence any of them.
 */
export interface PurchaseSubscriptionInput {
  readonly planId: number;
}

/**
 * Purchase mutation return: the newly created pending subscription +
 * payment pair plus the gateway checkout descriptor. Composed by field —
 * never spread — so each member keeps its own canonical read shape and
 * the checkout session stays provider-agnostic.
 */
export type PurchaseSubscriptionReturnType = {
  readonly subscription: SubscriptionReturnType;
  readonly payment: StudentPaymentReturnType;
  readonly checkout: PaymentCheckoutSession;
};
