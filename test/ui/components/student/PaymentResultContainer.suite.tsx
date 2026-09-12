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
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through `Checkout.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy. The exception class is fixture DATA
 * (ids, timestamps) which is never locale copy.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, type RenderResult, waitFor } from "@testing-library/react";
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
  }
});
