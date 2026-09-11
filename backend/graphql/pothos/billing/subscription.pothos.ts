/**
 * SubscriptionPothosObject — the single canonical GraphQL object type for
 * a `subscriptions` row, on the wire as `StudentSubscription`.
 *
 * The GraphQL type name is deliberately NOT `Subscription`: GraphQL
 * default-root naming reserves that name for the schema's subscription
 * root, and a bare object carrying it is silently auto-adopted as the
 * root when the builder declares none — realtime delivery is the
 * WebSocket sidecar's contract, never a GraphQL subscription (pinned by
 * `backend/graphql/test/sdl-static-assertions.test.ts`). The canonical
 * backend type remains `SubscriptionReturnType` from `@/backend/types`.
 *
 * Single Canonical Object Type Pattern (`backend/graphql/AGENTS.md`):
 *  - Backed EXCLUSIVELY by `SubscriptionReturnType` from `@/backend/types`
 *    (the table's `$inferSelect` projection with the status/payment-method
 *    columns re-typed to their canonical TS enums) — zero local type
 *    definitions here, and no business logic: every field is a
 *    passthrough or a serialization of the canonical row.
 *  - `id` first (Apollo cache normalization identity).
 *  - Timestamps are serialized to ISO-8601 UTC strings exactly like the
 *    plan-catalog object (date→String mapping, no scalar indirection).
 *  - The columns that may legitimately be unset (`startDate`, `endDate`,
 *    `paymentVerifiedAt` until the payment decision, plus the
 *    offline-payment pair `paymentMethod`/`paymentReference`) stay
 *    nullable — a pending subscription carries NULL honestly.
 *
 * Registered ahead of its resolvers through the billing Pothos barrel
 * (`gqlSchema.ts` side-effect chain); the purchase payload wrapper and the
 * owner listing reference this ref.
 */

import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { PaymentGatewayPothosEnum, SubscriptionStatusPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
import type { SubscriptionReturnType } from "@/backend/types";

/**
 * The canonical `StudentSubscription` GraphQL object type (the
 * `subscriptions` row).
 */
export const SubscriptionPothosObject = gqlSchemaBuilder
  .objectRef<SubscriptionReturnType>("StudentSubscription")
  .implement({
    description: "A student subscription linking a purchaser to a catalog plan.",
    fields: t => ({
      // ID FIRST — Apollo cache normalization identity.
      id: t.exposeID("id", {
        description: "Unique subscription identifier (Apollo cache normalization key).",
      }),
      planId: t.exposeInt("planId", {
        description: "ID of the catalog plan this subscription grants.",
      }),
      status: t.expose("status", {
        type: SubscriptionStatusPothosEnum,
        description: "Lifecycle state — purchases start pending; activation moves them to active.",
      }),
      startDate: t.string({
        nullable: true,
        description: "Timestamp the subscription period began, or null while pending.",
        resolve: parent => parent.startDate?.toISOString() ?? null,
      }),
      endDate: t.string({
        nullable: true,
        description: "Timestamp the subscription period ends, or null while pending.",
        resolve: parent => parent.endDate?.toISOString() ?? null,
      }),
      paymentMethod: t.expose("paymentMethod", {
        type: PaymentGatewayPothosEnum,
        nullable: true,
        description: "Gateway the payment traveled, or null when no gateway is involved yet.",
      }),
      paymentReference: t.exposeString("paymentReference", {
        nullable: true,
        description: "Gateway-issued payment reference, or null for offline payments without one.",
      }),
      paymentVerifiedAt: t.string({
        nullable: true,
        description: "Timestamp the payment was verified, or null while unverified.",
        resolve: parent => parent.paymentVerifiedAt?.toISOString() ?? null,
      }),
      createdAt: t.string({
        description: "Timestamp when the subscription record was created.",
        resolve: parent => parent.createdAt.toISOString(),
      }),
      updatedAt: t.string({
        description: "Timestamp when the subscription record was last modified.",
        resolve: parent => parent.updatedAt.toISOString(),
      }),
    }),
  });
