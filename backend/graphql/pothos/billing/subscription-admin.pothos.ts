/**
 * Admin subscription-management Pothos input — `ExtendSubscriptionInput`.
 *
 * Input types are the GraphQL schema's BOPLA boundary: the whitelist
 * carries exactly the fields the service accepts, so smuggled fields die
 * at GraphQL validation before a resolver ever runs. The wire
 * `subscriptionId` stays an `ID` and is coerced to the numeric row key
 * through the service's strict numeric parse; `days` is re-validated
 * server-side (whole number ≥ 1) — the GraphQL `Int` type alone does not
 * enforce the positivity floor for non-GraphQL callers.
 *
 * String-named `inputType` per the AGENTS input pattern (never
 * `inputRef<BackendType>`); registered ahead of its resolver module
 * through the billing Pothos barrel. The mutation returns the existing
 * canonical `StudentSubscription` object — no new object type exists for
 * the admin surface.
 */

import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";

/**
 * Input for the `adminExtendSubscription` mutation.
 */
export const ExtendSubscriptionInput = gqlSchemaBuilder.inputType("ExtendSubscriptionInput", {
  description: "Input for extending an active subscription's validity window.",
  fields: t => ({
    subscriptionId: t.id({
      required: true,
      description: "ID of the subscription row to extend.",
    }),
    days: t.int({
      required: true,
      description: "Whole number of days to add to the window's current end (>= 1, server-validated).",
    }),
  }),
});
