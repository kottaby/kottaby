/**
 * PlanPothosObject — canonical GraphQL object type and inputs for `Plan`.
 *
 * Backed exclusively by `PlanReturnType` from `@/backend/types` (zero local
 * types). The canonical row carries `balanceLane` as the raw pgEnum string
 * union, so the catalog field maps it onto the `SubscriptionCreditLane`
 * Pothos enum through an exhaustive, fail-closed mapper — never a cast.
 */

import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SubscriptionCreditLanePothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
import type { PlanReturnType } from "@/backend/types";

/**
 * The lane vocabulary, widened to plain strings: the canonical row's
 * `balanceLane` is the raw pgEnum string union, so the mapper's cases test
 * the enum member's string identity — the vocabulary flows from the enum
 * object, never from a bare literal.
 */
const LANE_HIFZ: string = SubscriptionCreditLane.Hifz;
const LANE_TAJWEED: string = SubscriptionCreditLane.Tajweed;
const LANE_REVIEWS: string = SubscriptionCreditLane.Reviews;

/**
 * Maps the `balance_lane` pgEnum value carried by the canonical
 * `PlanReturnType` row onto the `SubscriptionCreditLane` TS enum —
 * exhaustive over the lane vocabulary plus `null` (a plan may stay
 * laneless): one case per member, NO `default`; the fail-closed trailing
 * throw guards a runtime-only drift (a DB enum ahead of the TS schema) by
 * surfacing a resolver error instead of passing an unmapped value through.
 */
function toSubscriptionCreditLane(lane: PlanReturnType["balanceLane"]): SubscriptionCreditLane | null {
  switch (lane) {
    case LANE_HIFZ:
      return SubscriptionCreditLane.Hifz;
    case LANE_TAJWEED:
      return SubscriptionCreditLane.Tajweed;
    case LANE_REVIEWS:
      return SubscriptionCreditLane.Reviews;
    case null:
      return null;
  }
  // Reachable only on a runtime-only drift (a DB enum value ahead of the
  // TS schema) — fail closed instead of passing an unmapped lane through.
  throw new Error(`Unexpected subscription credit lane: ${lane}`);
}

/**
 * The canonical `Plan` GraphQL object type.
 */
export const PlanPothosObject = gqlSchemaBuilder.objectRef<PlanReturnType>("Plan").implement({
  description: "A subscription plan in the Kottaby catalog.",
  fields: t => ({
    id: t.exposeID("id", {
      description: "Unique plan identifier (Apollo cache normalization key).",
    }),
    title: t.exposeString("title", {
      description: "Human-readable title of the subscription plan.",
    }),
    sessionCount: t.exposeInt("sessionCount", {
      description: "Number of lesson sessions included in this plan.",
    }),
    price: t.exposeString("price", {
      description: "Plan price represented as an exact decimal string.",
    }),
    currency: t.exposeString("currency", {
      description: "Three-letter ISO currency code (e.g. EGP, USD).",
    }),
    intervalDays: t.exposeInt("intervalDays", {
      description: "Duration of the billing/service cycle in days.",
    }),
    balanceLane: t.field({
      type: SubscriptionCreditLanePothosEnum,
      nullable: true,
      description:
        "Student balance lane this plan's sessions are credited to on activation, or null while unconfigured.",
      resolve: parent => toSubscriptionCreditLane(parent.balanceLane),
    }),
    isActive: t.exposeBoolean("isActive", {
      description: "Flag indicating whether this plan is actively offered in the student catalog.",
    }),
    deactivatedAt: t.string({
      nullable: true,
      description: "Timestamp when the plan was deactivated, or null if currently active.",
      resolve: parent => parent.deactivatedAt?.toISOString() ?? null,
    }),
    createdAt: t.string({
      description: "Timestamp when the plan record was created.",
      resolve: parent => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      description: "Timestamp when the plan record was last modified.",
      resolve: parent => parent.updatedAt.toISOString(),
    }),
  }),
});

/**
 * Input type for creating a new subscription plan.
 */
export const CreatePlanInput = gqlSchemaBuilder.inputType("CreatePlanInput", {
  description: "Input fields required to create a new subscription plan.",
  fields: t => ({
    title: t.string({
      required: true,
      description: "Plan title (1..255 characters).",
    }),
    sessionCount: t.int({
      required: true,
      description: "Total sessions included (integer >= 1).",
    }),
    price: t.string({
      required: true,
      description: "Exact price formatted as numeric string (e.g. '150.00').",
    }),
    currency: t.string({
      required: true,
      description: "3-letter uppercase currency code (e.g. 'EGP').",
    }),
    intervalDays: t.int({
      required: true,
      description: "Plan duration in days (integer >= 1).",
    }),
    balanceLane: t.field({
      type: SubscriptionCreditLanePothosEnum,
      required: false,
      description:
        "Balance lane to assign to the plan. Omitted or null leaves the plan unconfigured — purchases fail closed until a lane is set.",
    }),
  }),
});

/**
 * Input type for updating an existing subscription plan.
 */
export const UpdatePlanInput = gqlSchemaBuilder.inputType("UpdatePlanInput", {
  description: "Mutable fields for updating an existing subscription plan.",
  fields: t => ({
    title: t.string({
      required: false,
      description: "Updated plan title.",
    }),
    sessionCount: t.int({
      required: false,
      description: "Updated session count.",
    }),
    price: t.string({
      required: false,
      description: "Updated price string.",
    }),
    currency: t.string({
      required: false,
      description: "Updated currency code.",
    }),
    intervalDays: t.int({
      required: false,
      description: "Updated duration in days.",
    }),
    balanceLane: t.field({
      type: SubscriptionCreditLanePothosEnum,
      required: false,
      description:
        "Updated balance lane. Omitted leaves the stored lane untouched; null clears it (purchases fail closed while unconfigured).",
    }),
  }),
});
