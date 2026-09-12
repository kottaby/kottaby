import type { MockLink } from "@apollo/client/testing";
import {
  type MySubscriptionsQuery,
  type MySubscriptionsQuery_mySubscriptions,
  SubscriptionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { mySubscriptionsQueryDocument } from "@/frontend/graphql/sharedDocuments";

/**
 * Fixtures for the `Pages/Student/MySubscriptions` story — the prototype's
 * funnel-state matrix: active / pending / failed / empty rows over the
 * normalized `StudentSubscription` wire shape.
 */

type SubscriptionRowFixture = MySubscriptionsQuery_mySubscriptions & { readonly __typename: "StudentSubscription" };

/** Deterministic fixture row (all ten selected fields + `__typename`). */
function subscriptionRow(overrides: Partial<SubscriptionRowFixture> & { id: string }): SubscriptionRowFixture {
  return {
    __typename: "StudentSubscription",
    planId: 3,
    status: SubscriptionStatus.Active,
    startDate: "2099-01-10T08:45:00.000Z",
    endDate: "2099-02-10T08:45:00.000Z",
    paymentMethod: null,
    paymentReference: null,
    paymentVerifiedAt: null,
    createdAt: "2099-01-10T08:45:00.000Z",
    updatedAt: "2099-01-10T08:45:00.000Z",
    ...overrides,
  };
}

export const SUBSCRIPTION_ROWS: readonly SubscriptionRowFixture[] = [
  subscriptionRow({ id: "sub-active" }),
  subscriptionRow({
    id: "sub-pending",
    status: SubscriptionStatus.Pending,
    startDate: null,
    endDate: null,
  }),
  subscriptionRow({
    id: "sub-failed",
    status: SubscriptionStatus.Pending,
    startDate: null,
    endDate: null,
  }),
  subscriptionRow({ id: "sub-expired", status: SubscriptionStatus.Expired }),
];

/** Populated list mock — the four-state funnel matrix on one page. */
export function subscriptionsListMock(rows: readonly SubscriptionRowFixture[]): MockLink.MockedResponse {
  return {
    request: { query: mySubscriptionsQueryDocument, variables: {} },
    result: { data: { mySubscriptions: [...rows] } satisfies MySubscriptionsQuery },
  };
}

/** Never-resolving list query — drives the loading skeleton branch. */
export const SUBSCRIPTIONS_LOADING_MOCK: MockLink.MockedResponse = {
  request: { query: mySubscriptionsQueryDocument, variables: {} },
  delay: Number.POSITIVE_INFINITY,
};
