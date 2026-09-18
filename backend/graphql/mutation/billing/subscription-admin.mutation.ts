/**
 * Admin subscription-management mutations — `adminExtendSubscription` +
 * `adminRenewSubscription`.
 *
 * Contract:
 *  - `adminExtendSubscription(input: ExtendSubscriptionInput!):
 *    StudentSubscription!` — admin-only; the acting admin's identity is
 *    server-bound from `ctx.user.id` (never from args — BOLA-safe by
 *    construction) and the new window end is computed server-side from
 *    the row's stored `endDate` (the payload cannot dictate a target
 *    date).
 *  - `adminRenewSubscription(input: RenewSubscriptionInput!):
 *    StudentSubscription!` — admin-only; the expired-source selector is
 *    the only client material. The renewal's plan snapshot, window
 *    arithmetic, lane credit, and the server-constructed
 *    `renew:<sourceId>` idempotency claim are all derived server-side. A
 *    duplicate renew REPLAYS the first result through the claim's
 *    subscription pointer (no error, no second period, no second
 *    credit); a claim that cannot resolve to a same-owner row surfaces
 *    the localized already-renewed conflict.
 *  - The subscription id arrives as a wire `ID` and is coerced to the
 *    numeric row key through the strict numeric parse
 *    (`coerceSubscriptionId`) before it reaches the service — a
 *    malformed id is the canonical subscription-not-found denial, never
 *    a silent mis-target. The wire input is copied FIELD-BY-FIELD into
 *    the service's closed submit whitelist — never a `{ ...input }`
 *    spread.
 *  - The audit row shares the service transaction's commit/rollback
 *    fate; DomainErrors (FORBIDDEN non-admin, VALIDATION day-count/
 *    ceiling, CONFLICT not-active/replay) propagate uncaught to the
 *    masking boundary — no try/catch here.
 *
 * authScopes (`adminOnlyAuthScopes` — the MANDATORY `$all` conjunction):
 *  - `{ $all: { authenticated: true, role: [Admin] } }` from the shared
 *    admin prelude. Anonymous → `UNAUTHORIZED` (401); authenticated
 *    non-admin → `FORBIDDEN` (403) — both BEFORE the resolver body runs.
 *    `requireAdminUser(ctx)` is the TypeScript-narrowing belt only.
 *
 * Per `backend/graphql/mutation/AGENTS.md`:
 *  - NO named exports — the root field registers at import time via
 *    `gqlSchemaBuilder.mutationField(...)`.
 *  - Wired through side-effect barrels:
 *    `mutation/billing/index.ts` → `mutation/index.ts` → `gqlSchema.ts`.
 *  - Resolver delegates to the services layer with locale propagation;
 *    no business logic inline. Top-level static imports only.
 */

import { SubscriptionPothosObject } from "@/backend/graphql/pothos/billing/subscription.pothos";
import {
  ExtendSubscriptionInput,
  RenewSubscriptionInput,
} from "@/backend/graphql/pothos/billing/subscription-admin.pothos";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { adminOnlyAuthScopes, requireAdminUser } from "@/backend/graphql/shared";
import { coerceSubscriptionId } from "@/backend/services/billing/subscription-admin.helpers";
import { SubscriptionAdminService } from "@/backend/services/billing/subscription-admin.service";

// Side-effect: register the `adminExtendSubscription` mutation field.
gqlSchemaBuilder.mutationField("adminExtendSubscription", t =>
  t.field({
    type: SubscriptionPothosObject,
    description:
      "Extends an active subscription's validity window by a whole number of days. Admin-only; the new window end is derived server-side from the row's current end date.",
    authScopes: adminOnlyAuthScopes,
    args: {
      input: t.arg({
        type: ExtendSubscriptionInput,
        required: true,
        description: "The subscription selector and the day count to add.",
      }),
    },
    resolve: async (_root, args, ctx) => {
      const user = await requireAdminUser(ctx);
      const tErrors = await ctx.t("errorsTranslations");
      return SubscriptionAdminService.extendSubscription(
        {
          subscriptionId: coerceSubscriptionId(args.input.subscriptionId, tErrors),
          days: args.input.days,
        },
        user.id,
        ctx.locale
      );
    },
  })
);

// Side-effect: register the `adminRenewSubscription` mutation field.
gqlSchemaBuilder.mutationField("adminRenewSubscription", t =>
  t.field({
    type: SubscriptionPothosObject,
    description:
      "Renews an expired subscription into a fresh active period: a new row (same owner, fresh plan snapshot), the owner's lane credited the plan's full session count, and the student junction row. Admin-only; a duplicate renew replays the first result.",
    authScopes: adminOnlyAuthScopes,
    args: {
      input: t.arg({
        type: RenewSubscriptionInput,
        required: true,
        description: "The expired subscription selector.",
      }),
    },
    resolve: async (_root, args, ctx) => {
      const user = await requireAdminUser(ctx);
      const tErrors = await ctx.t("errorsTranslations");
      return SubscriptionAdminService.renewSubscription(
        { subscriptionId: coerceSubscriptionId(args.input.subscriptionId, tErrors) },
        user.id,
        ctx.locale
      );
    },
  })
);
