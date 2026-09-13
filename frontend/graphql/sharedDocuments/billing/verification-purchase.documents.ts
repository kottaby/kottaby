import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  PurchaseVerificationPlanMutation,
  PurchaseVerificationPlanMutationVariables,
} from "@/frontend/graphql/generated/gql/graphql";

/**
 * Shared GraphQL documents for the teacher-applicant verification-plan
 * purchase.
 *
 * `purchaseVerificationPlan` is the ZERO-ARGUMENT purchase write: the
 * purchaser identity, the plan row, the amount, and the currency are all
 * derived server-side (no plan id, no amount, no user id ever travels on
 * the wire). The payload reuses the student purchase surface's shape —
 * `{ subscription, payment, checkout }` — with `id` selected FIRST on the
 * two normalizable row objects (`StudentSubscription`, `StudentPayment`)
 * so Apollo Client normalizes them into the cache (per
 * `sharedDocuments/AGENTS.md` "id Field Requirement").
 *
 * `checkout` is a scalar-only embedded value object (`provider`,
 * `providerReference`, `checkoutUrl` — no `id`), cached inline under the
 * root mutation field; `checkoutUrl` is `null` for the mock gateway and
 * this surface never redirects on it.
 *
 * All types come from the codegen output
 * (`@/frontend/graphql/generated/gql/graphql`) — never inline literals as
 * TYPES, never mapping layers. Hooks (`useMutation`) are consumed from
 * `@apollo/client/react` in views; `useLazyQuery` is banned.
 */

/**
 * `purchaseVerificationPlan` — purchases the platform-owned verification
 * plan for the authenticated teacher applicant. The mutation is INPUTLESS
 * (identity + money are server-derived), so the operation declares NO
 * variables. Replay protection rides the `x-idempotency-key` context
 * header carried per attempt by the caller.
 */
export const purchaseVerificationPlanMutationDocument: TypedDocumentNode<
  PurchaseVerificationPlanMutation,
  PurchaseVerificationPlanMutationVariables
> = gql`
  mutation PurchaseVerificationPlan {
    purchaseVerificationPlan {
      subscription {
        id
        status
        planId
        paymentMethod
        paymentReference
        paymentVerifiedAt
        startDate
        endDate
        createdAt
        updatedAt
      }
      payment {
        id
        amount
        currency
        status
        paymentGateway
        subscriptionId
        createdAt
        updatedAt
      }
      checkout {
        provider
        providerReference
        checkoutUrl
      }
    }
  }
`;
