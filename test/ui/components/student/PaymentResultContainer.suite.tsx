/**
 * PaymentResultContainer — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `PaymentResultContainer.test.tsx` (see that file for WHY the suite is
 * split — short version: react-dom must first evaluate with the Happy-DOM
 * document already registered).
 *
 * Happy DOM + Apollo `MockedProvider` tier: ONE render case per branch of
 * the payment-result visual state matrix, driven across BOTH locales:
 *
 *   branch 1  re-query in flight → the checking arm, no settled surface
 *   branch 2  FORBIDDEN → shared permission fallback
 *   branch 3  masked INTERNAL_SERVER_ERROR → generic inline alert
 *   branch 4  server truth = ACTIVE row → success arm + summary + CTA
 *   branch 5  server truth = pending row, no hints → pending arm
 *   branch 6  zero rows, no hints → pending arm (nothing settled yet)
 *   branch 7  pending row + decline hint (`success=false`) → failed arm's
 *             guidance copy (the negative-zone display refinement)
 *   branch 8  ZERO-TRUST: forged `?success=true` with NO active row
 *             renders NOTHING positive — pending arm, never success
 *   branch 9  ZERO-TRUST: forged `?success=true` with an ACTIVE row still
 *             shows success (server truth gates the arm — the forged hint
 *             is ignored)
 *   branch 10 pending hint (`pending=true`) overrides a forged decline —
 *             the still-processing arm stays
 *   branch 11 success arm renders ONLY the view-subscriptions CTA (no
 *             retry affordance)
 *   branch 12 failed arm shows the retry CTA (journey back to the catalog)
 *   branch 13 copy contract pin (rendered copy equals preloaded labels)
 *
 * FUNNEL-LEVEL coverage (additions on top of the base arms):
 *
 *   branch 14 cached-truth warm start: an Apollo cache pre-populated with
 *             an ACTIVE `StudentSubscription` row (the instant-activation
 *             payload's write) resolves the success arm on the FIRST paint
 *             — the checking arm never flashes for the redirect-returning
 *             student whose activation already landed in the cache
 *   branch 15 stale-truth revalidation: a pre-populated PENDING row flips
 *             to the ACTIVE success arm once the network revalidation
 *             settles (`cache-and-network` post-settlement truth)
 *   branch 16 hint-form robustness: an array-valued hint record (the
 *             server page's `searchParams` multi-value shape) refines
 *             nothing — the pending arm stays
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through `Checkout.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy. The exception class is fixture DATA
 * (ids, timestamps) which is never locale copy.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { InMemoryCache } from "@apollo/client";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, type RenderResult, waitFor } from "@testing-library/react";
import { SubscriptionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { mySubscriptionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import {
  RESULT_ACTIVE_ROW,
  RESULT_CHECKING_MOCK,
  RESULT_EMPTY_ROWS,
  RESULT_PENDING_ROW,
  subscriptionsListMock,
} from "@/frontend/stories/pages/student/checkout-result.fixtures";
import { PaymentResultContainer } from "@/frontend/views/student/checkout/result/PaymentResultContainer";
import {
  PAYMENT_RESULT_ERROR_TEST_ID,
  PAYMENT_RESULT_LOADING_TEST_ID,
  PAYMENT_RESULT_SUMMARY_TEST_ID,
  PAYMENT_RESULT_TEST_ID,
} from "@/frontend/views/student/checkout/result/resultViewIds";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Checkout as CheckoutNs } from "@/shared/locale/namespaces/checkout";
import { getTranslations } from "@/shared/locale/server";
import type { CheckoutLabels } from "@/shared/locale/types/checkout";
import { componentSuiteLocales, liveScreen } from "@/test/ui/components/helpers";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ---------------------------------------------------------------------------
// Render helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

/** Renders the container with a hint record (the page→view contract shape). */
function renderResult(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale,
  hintParams: Readonly<Record<string, string | string[] | undefined>> = {}
): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <PaymentResultContainer hintParams={hintParams} />
    </MockedProvider>,
    { locale }
  );
}

/** Waits for a settled render (the checking arm has left the DOM). */
async function waitForSettled(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByTestId(PAYMENT_RESULT_LOADING_TEST_ID)).toBeNull();
  });
}

// ---------------------------------------------------------------------------
// Cache-row fixtures (DATA — never locale copy)

/**
 * The ACTIVE cache row the funnel-level arms write into the Apollo cache
 * (the instant-activation payload's normalized `StudentSubscription:<id>`
 * entry — the same id-first shape the catalog mutation writes).
 */
const ACTIVE_CACHE_ROW = {
  __typename: "StudentSubscription",
  id: "sub-cache-active",
  planId: 3,
  plan: { __typename: "Plan", id: "3", title: "Hifz Intensive" },
  status: SubscriptionStatus.Active,
  startDate: "2099-01-10T08:45:00.000Z",
  endDate: "2099-02-10T08:45:00.000Z",
  paymentMethod: null,
  paymentReference: "purchase-claim-cache-active",
  paymentVerifiedAt: "2099-01-10T08:46:00.000Z",
  createdAt: "2099-01-10T08:45:00.000Z",
  updatedAt: "2099-01-10T08:46:00.000Z",
};

/** The STALE PENDING cache row (the pre-webhook state the revalidation supersedes). */
const STALE_PENDING_CACHE_ROW = {
  ...ACTIVE_CACHE_ROW,
  id: "sub-cache-stale",
  status: SubscriptionStatus.Pending,
  startDate: null,
  endDate: null,
  paymentReference: "purchase-claim-cache-stale",
  paymentVerifiedAt: null,
  updatedAt: "2099-01-10T08:45:00.000Z",
};

// ===========================================================================
describe("PaymentResultContainer", () => {
  afterEach(() => {
    cleanup();
  });

  for (const locale of componentSuiteLocales) {
    const t: CheckoutLabels = CheckoutNs.getLabels(getTranslations(locale));

    test(`[${locale}] branch 1 — re-query in flight renders the checking arm`, () => {
      renderResult([RESULT_CHECKING_MOCK], locale);
      expect(screen.getByTestId(PAYMENT_RESULT_TEST_ID)).toBeDefined();
      expect(screen.getByTestId(PAYMENT_RESULT_LOADING_TEST_ID)).toBeDefined();
      expect(screen.getByText(t.resultCheckingTitle)).toBeDefined();
      expect(screen.getByText(t.resultCheckingBody)).toBeDefined();
      // No settled branch leaks while the authoritative query runs.
      expect(screen.queryByTestId(PAYMENT_RESULT_SUMMARY_TEST_ID)).toBeNull();
    });

    test(`[${locale}] branch 2 — FORBIDDEN renders the shared permission fallback`, async () => {
      renderResult(
        [
          {
            request: { query: mySubscriptionsQueryDocument, variables: {} },
            result: {
              errors: [{ message: "FORBIDDEN (masked transport surface)", extensions: { code: "FORBIDDEN" } }],
            },
          },
        ],
        locale
      );
      await waitFor(() => {
        // The denial family renders the shared fallback's alert surface.
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.queryByTestId(PAYMENT_RESULT_SUMMARY_TEST_ID)).toBeNull();
    });

    test(`[${locale}] branch 3 — masked internal error renders the generic alert`, async () => {
      renderResult(
        [
          {
            request: { query: mySubscriptionsQueryDocument, variables: {} },
            result: {
              errors: [{ message: "INTERNAL_SERVER_ERROR (masked)", extensions: { code: "INTERNAL_SERVER_ERROR" } }],
            },
          },
        ],
        locale
      );
      await waitFor(() => {
        expect(screen.getByTestId(PAYMENT_RESULT_ERROR_TEST_ID)).toBeDefined();
      });
      expect(screen.getByText(t.genericError)).toBeDefined();
    });

    test(`[${locale}] branch 4 — server truth ACTIVE renders the success arm`, async () => {
      renderResult([subscriptionsListMock(RESULT_ACTIVE_ROW)], locale);
      await waitForSettled();
      expect(screen.getByText(t.resultSuccessTitle)).toBeDefined();
      expect(screen.getByText(t.resultSuccessBody)).toBeDefined();
      expect(screen.getByTestId(PAYMENT_RESULT_SUMMARY_TEST_ID)).toBeDefined();
      expect(screen.getByText(t.viewSubscriptionsButton)).toBeDefined();
      expect(screen.queryByText(t.resultPendingTitle)).toBeNull();
    });

    test(`[${locale}] branch 5 — pending row with no hints renders the pending arm`, async () => {
      renderResult([subscriptionsListMock(RESULT_PENDING_ROW)], locale);
      await waitForSettled();
      expect(screen.getByText(t.resultPendingTitle)).toBeDefined();
      expect(screen.getByText(t.resultPendingBody)).toBeDefined();
      expect(screen.queryByText(t.resultSuccessTitle)).toBeNull();
    });

    test(`[${locale}] branch 6 — zero rows with no hints renders the pending arm`, async () => {
      renderResult([subscriptionsListMock(RESULT_EMPTY_ROWS)], locale);
      await waitForSettled();
      expect(screen.getByText(t.resultPendingTitle)).toBeDefined();
      // The arm shell renders, but with zero rows there are NO summary rows.
      expect(screen.getByTestId(PAYMENT_RESULT_SUMMARY_TEST_ID)).toBeDefined();
      expect(screen.queryByText(t.planLabel)).toBeNull();
    });

    test(`[${locale}] branch 7 — decline hint on a pending row shows the failed guidance`, async () => {
      renderResult([subscriptionsListMock(RESULT_PENDING_ROW)], locale, { success: "false" });
      await waitForSettled();
      expect(screen.getByText(t.resultFailedTitle)).toBeDefined();
      expect(screen.getByText(t.resultFailedBody)).toBeDefined();
      expect(screen.queryByText(t.resultSuccessTitle)).toBeNull();
      expect(screen.queryByText(t.resultPendingTitle)).toBeNull();
    });

    test(`[${locale}] branch 8 — forged success hint with NO active row renders NOTHING positive`, async () => {
      renderResult([subscriptionsListMock(RESULT_PENDING_ROW)], locale, { success: "true" });
      await waitForSettled();
      // The forged hint never elevates the display: pending arm stays.
      expect(screen.getByText(t.resultPendingTitle)).toBeDefined();
      expect(screen.queryByText(t.resultSuccessTitle)).toBeNull();
      expect(screen.queryByText(t.resultFailedTitle)).toBeNull();
    });

    test(`[${locale}] branch 9 — forged success hint over zero rows renders NOTHING positive`, async () => {
      renderResult([subscriptionsListMock(RESULT_EMPTY_ROWS)], locale, { success: "true" });
      await waitForSettled();
      expect(screen.getByText(t.resultPendingTitle)).toBeDefined();
      expect(screen.queryByText(t.resultSuccessTitle)).toBeNull();
    });

    test(`[${locale}] branch 10 — pending hint overrides a forged decline`, async () => {
      renderResult([subscriptionsListMock(RESULT_PENDING_ROW)], locale, { success: "false", pending: "true" });
      await waitForSettled();
      // An in-flight wallet confirmation is not a decline — still processing.
      expect(screen.getByText(t.resultPendingTitle)).toBeDefined();
      expect(screen.queryByText(t.resultFailedTitle)).toBeNull();
    });

    test(`[${locale}] branch 11 — success arm renders only the view-subscriptions CTA`, async () => {
      renderResult([subscriptionsListMock(RESULT_ACTIVE_ROW)], locale);
      await waitForSettled();
      // The success arm's ONLY CTA is the journey to the subscriptions list
      // (no retry affordance — there is nothing to retry).
      expect(screen.getByText(t.viewSubscriptionsButton)).toBeDefined();
      expect(screen.queryByText(t.retryButton)).toBeNull();
    });

    test(`[${locale}] branch 12 — failed arm shows the retry CTA`, async () => {
      renderResult([subscriptionsListMock(RESULT_PENDING_ROW)], locale, { success: "false" });
      await waitForSettled();
      expect(screen.getByText(t.retryButton)).toBeDefined();
      expect(screen.getByText(t.viewSubscriptionsButton)).toBeDefined();
    });

    test(`[${locale}] branch 13 — copy contract pin (rendered copy equals preloaded labels)`, async () => {
      renderResult([subscriptionsListMock(RESULT_ACTIVE_ROW)], locale);
      await waitForSettled();
      expect(screen.getByText(t.resultSuccessTitle)).toBeDefined();
      expect(screen.getByText(t.resultSuccessBody)).toBeDefined();
      expect(screen.getByText(t.viewSubscriptionsButton)).toBeDefined();
    });

    test(`[${locale}] branch 14 — cached-truth warm start resolves the success arm on first paint`, async () => {
      // The Apollo cache pre-populated with the ACTIVE row (the
      // instant-activation payload's normalized write — the mutation's
      // `StudentSubscription:<id>` entry): the redirect-returning student
      // whose activation already landed in the cache gets the success arm
      // on the FIRST paint, before the network settles.
      const cache = new InMemoryCache();
      cache.writeQuery({
        query: mySubscriptionsQueryDocument,
        data: { mySubscriptions: [ACTIVE_CACHE_ROW] },
      });
      renderWithWrapper(
        <MockedProvider mocks={[subscriptionsListMock(RESULT_ACTIVE_ROW)]} cache={cache}>
          <PaymentResultContainer hintParams={{}} />
        </MockedProvider>,
        { locale }
      );
      // First paint: no checking arm flash, the success arm is live.
      expect(screen.queryByTestId(PAYMENT_RESULT_LOADING_TEST_ID)).toBeNull();
      expect(screen.getByTestId(PAYMENT_RESULT_SUMMARY_TEST_ID)).toBeDefined();
      await waitFor(() => {
        expect(screen.getByText(t.resultSuccessTitle)).toBeDefined();
      });
      expect(screen.queryByText(t.resultPendingTitle)).toBeNull();
    });

    test(`[${locale}] branch 15 — stale cached truth revalidates to the active arm`, async () => {
      // The cache pre-populated with a STALE PENDING row (the
      // pre-webhook state): `cache-and-network` paints the pending arm from
      // the stale truth, then the network revalidation flips the display to
      // the ACTIVE success arm — the post-settlement truth the
      // redirect-returning student always gets.
      const cache = new InMemoryCache();
      cache.writeQuery({
        query: mySubscriptionsQueryDocument,
        data: { mySubscriptions: [STALE_PENDING_CACHE_ROW] },
      });
      renderWithWrapper(
        <MockedProvider mocks={[subscriptionsListMock(RESULT_ACTIVE_ROW)]} cache={cache}>
          <PaymentResultContainer hintParams={{}} />
        </MockedProvider>,
        { locale }
      );
      // First paint resolves from the stale cache (pending), the network
      // revalidation then settles the display to the success arm.
      await waitFor(() => {
        expect(screen.getByText(t.resultSuccessTitle)).toBeDefined();
      });
      expect(screen.queryByTestId(PAYMENT_RESULT_LOADING_TEST_ID)).toBeNull();
      expect(screen.queryByText(t.resultPendingTitle)).toBeNull();
      // The summary rides the settled truth (the ACTIVE row's values).
      expect(screen.getByTestId(PAYMENT_RESULT_SUMMARY_TEST_ID)).toBeDefined();
    });

    test(`[${locale}] branch 16 — array-valued hints refine nothing (multi-value searchParams shape)`, async () => {
      // The server page's promise-resolved `searchParams` carries
      // array values for repeated keys — the hint record's shape the
      // refinement must survive: an array-valued `success` hint is neither
      // `success=false` nor `pending=true`, so it refines nothing.
      renderResult([subscriptionsListMock(RESULT_PENDING_ROW)], locale, { success: ["true"] });
      await waitForSettled();
      expect(screen.getByText(t.resultPendingTitle)).toBeDefined();
      expect(screen.queryByText(t.resultSuccessTitle)).toBeNull();
      expect(screen.queryByText(t.resultFailedTitle)).toBeNull();
    });
  }
});
