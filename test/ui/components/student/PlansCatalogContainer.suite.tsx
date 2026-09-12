/**
 * PlansCatalogContainer — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `PlansCatalogContainer.test.tsx` (see that file for WHY the suite is
 * split — short version: react-dom must first evaluate with the Happy-DOM
 * document already registered, or controlled `onChange` can never fire).
 *
 * Happy DOM + Apollo `MockedProvider` tier: ONE render case per branch of
 * the plan-catalog visual state matrix, driven across BOTH locales:
 *
 *   branch 1  query in flight → skeleton cards, no settled surface leaks
 *   branch 2  FORBIDDEN → shared permission fallback (chrome stays)
 *   branch 3  masked INTERNAL_SERVER_ERROR → generic inline alert
 *   branch 4  zero active plans → empty state
 *   branch 5  populated catalog → card titles, prices, chips, Buy CTAs
 *   branch 6  Buy CTA opens the confirm dialog (summary labels + price)
 *   branch 7  dialog dismiss → dialog leaves the DOM, no wire call
 *   branch 8  idempotency key — captured at the LINK tier: minted once per
 *             attempt, sent as the `x-idempotency-key` header, kept across
 *             a failed submit
 *   branch 9  purchase failure (SERVICE_UNAVAILABLE) → localized error
 *             inside the dialog, dialog stays open for a retry
 *   branch 10 purchase success with a hosted `checkoutUrl` — D8-CLASS
 *             SKIP-WITH-BODY (the hard redirect leaves the Happy-DOM
 *             window; compensated by the real-browser 4.1 QA loop)
 *   branch 11 purchase success with `checkoutUrl: null` (instant
 *             activation) — success snackbar + dialog closed
 *   branch 12 copy contract pin (rendered copy equals preloaded labels)
 *
 * FUNNEL-LEVEL coverage (task-owned additions on top of the 7.2 arms):
 *
 *   branch 13 the in-flight purchase CTA's busy state inside the dialog
 *             (the confirm copy swaps to the busy spinner while the
 *             mutation runs — the 7.2 outcome's named-untested arm)
 *
 * CROSS-CONTAINER funnel interplay (the catalog's role in the purchase
 * funnel) lives in the sibling `PlansCheckoutFunnelJourney.suite.tsx`:
 * the instant-activation payload's normalized `StudentSubscription:901`
 * row IS the cache entry the payment-result container's authoritative
 * `mySubscriptions` re-query converges on, and the catalog re-query
 * converges on the same `Plan:<id>` entries across a fresh provider —
 * both exercised end-to-end there through the helpers this file exports.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through `Checkout.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy. The exception class is fixture DATA
 * (ids, prices, timestamps) which is never locale copy.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { ApolloLink } from "@apollo/client";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, fireEvent, type RenderResult, waitFor } from "@testing-library/react";
import { planCatalogQueryDocument, purchaseSubscriptionMutationDocument } from "@/frontend/graphql/sharedDocuments";
import {
  PLAN_CATALOG_LOADING_MOCK,
  PLAN_CATALOG_ROWS,
  PURCHASE_COMPLETED_MOCK,
  PURCHASE_FAILED_MOCK,
  planCatalogMock,
  purchaseRedirectMock,
} from "@/frontend/stories/pages/student/plans.fixtures";
import { PlansCatalogContainer } from "@/frontend/views/student/plans/PlansCatalogContainer";
import {
  PLAN_CARD_BUY_SUFFIX,
  PLAN_CARD_TEST_ID_PREFIX,
  PLANS_CATALOG_TEST_ID,
  PLANS_EMPTY_TEST_ID,
  PLANS_ERROR_TEST_ID,
  PLANS_SKELETON_TEST_ID,
} from "@/frontend/views/student/plans/plansViewIds";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Checkout as CheckoutNs } from "@/shared/locale/namespaces/checkout";
import { getTranslations } from "@/shared/locale/server";
import type { CheckoutLabels } from "@/shared/locale/types/checkout";
import { componentSuiteLocales, liveScreen } from "@/test/ui/components/helpers";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** The exact variables the zero-argument catalog query sends. */
const CATALOG_VARIABLES = {};

/** The populated catalog mock (three plans, shared by the populated arms). */
const POPULATED_MOCK = planCatalogMock(PLAN_CATALOG_ROWS);

/**
 * The in-flight purchase arm's never-resolving mutation mock — held open
 * with `delay: Infinity` so the busy CTA state is observable (the funnel's
 * in-flight arm; the plans fixtures carry no in-flight builder).
 */
function purchaseInFlightMock(planId: string): MockLink.MockedResponse {
  return {
    request: { query: purchaseSubscriptionMutationDocument, variables: { input: { planId } } },
    result: {
      data: {
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
            createdAt: IN_FLIGHT_STAMP,
            updatedAt: IN_FLIGHT_STAMP,
          },
          payment: {
            __typename: "StudentPayment",
            id: "951",
            subscriptionId: 901,
            amount: "300.00",
            currency: "EGP",
            paymentGateway: "mock-provider",
            status: "Pending",
            createdAt: IN_FLIGHT_STAMP,
            updatedAt: IN_FLIGHT_STAMP,
          },
          checkout: {
            __typename: "PaymentCheckout",
            provider: "mock-provider",
            providerReference: "purchase-claim-901",
            checkoutUrl: null,
          },
        },
      },
    },
    delay: Number.POSITIVE_INFINITY,
  };
}

/** Deterministic fixture moment shared by the in-flight arm (DATA — never locale copy). */
const IN_FLIGHT_STAMP = "2099-01-10T08:45:00.000Z";

/**
 * Wire lane value → checkout label key: the fixture rows carry the enum's
 * wire string; assertions resolve the label through the PRELOADED label
 * objects only (zero hardcoded copy).
 */
const LANE_LABEL_KEYS = {
  Hifz: "laneHifz",
  Tajweed: "laneTajweed",
  Reviews: "laneReviews",
} as const;

// ---------------------------------------------------------------------------
// Render + expectation helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

/**
 * The dialog arms' selected catalog row (DATA — never locale copy): the
 * second fixture row, whose id the purchase-mutation fixtures key on.
 * Exported for the funnel-journey suite — the catalog's confirm dialog is
 * the funnel's entry point, so the journey arm opens THIS plan's dialog.
 */
const DIALOG_PLAN_ROW = PLAN_CATALOG_ROWS[1];

/** Renders the container under MockedProvider(mocks) + TestWrapper (LocaleProvider → emotion → theme). */
function renderPlans(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: AppLocale): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <PlansCatalogContainer />
    </MockedProvider>,
    { locale }
  );
}

/** Assertion-free read of a mutation operation's `x-idempotency-key` header. */
function contextIdempotencyKey(operation: ApolloLink.Operation): string | null {
  const headers: unknown = operation.getContext().headers;
  if (typeof headers !== "object" || headers === null) {
    return null;
  }
  const value = Object.entries(headers).find(([key]) => key === "x-idempotency-key")?.[1];
  return typeof value === "string" ? value : null;
}

/**
 * Renders the container with the idempotency key captured at the LINK tier:
 * a capturing `ApolloLink` wraps the `MockLink` and records the header each
 * mutation operation carries (the governance-suite precedent).
 */
function renderPlansWithCapture(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale,
  onOperationSent: (idempotencyKey: string | null) => void
): RenderResult {
  const capture = new ApolloLink((operation, forward) => {
    onOperationSent(contextIdempotencyKey(operation));
    return forward(operation);
  });
  const link = ApolloLink.from([capture, new MockLink([...mocks])]);
  return renderWithWrapper(
    <MockedProvider link={link}>
      <PlansCatalogContainer />
    </MockedProvider>,
    { locale }
  );
}

/** Opens the confirm dialog via one plan's Buy CTA (the dialog-arm prologue). */
async function renderPlansAndOpenDialog(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale,
  planId: string
): Promise<void> {
  renderPlans(mocks, locale);
  await waitFor(() => {
    expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${planId}${PLAN_CARD_BUY_SUFFIX}`)).toBeDefined();
  });
  fireEvent.click(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${planId}${PLAN_CARD_BUY_SUFFIX}`));
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeDefined();
  });
}

/** Confirms the open dialog's purchase and resolves once the attempt settles (the journey prologue). */
async function confirmOpenDialogPurchase(t: CheckoutLabels): Promise<void> {
  fireEvent.click(screen.getByText(t.confirmButton));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
}

// ===========================================================================
describe("PlansCatalogContainer", () => {
  afterEach(() => {
    cleanup();
  });

  for (const locale of componentSuiteLocales) {
    const t: CheckoutLabels = CheckoutNs.getLabels(getTranslations(locale));

    test(`[${locale}] branch 1 — query in flight renders the skeleton, chrome stays`, () => {
      renderPlans([PLAN_CATALOG_LOADING_MOCK], locale);
      expect(screen.getByTestId(PLANS_CATALOG_TEST_ID)).toBeDefined();
      expect(screen.getByText(t.pageTitle)).toBeDefined();
      expect(screen.getByText(t.pageSubtitle)).toBeDefined();
      expect(screen.getByTestId(PLANS_SKELETON_TEST_ID)).toBeDefined();
      expect(screen.queryByTestId(PLANS_EMPTY_TEST_ID)).toBeNull();
    });

    test(`[${locale}] branch 2 — FORBIDDEN renders the shared permission fallback`, async () => {
      renderPlans(
        [
          {
            request: { query: planCatalogQueryDocument, variables: CATALOG_VARIABLES },
            result: {
              errors: [{ message: "FORBIDDEN (masked transport surface)", extensions: { code: "FORBIDDEN" } }],
            },
          },
        ],
        locale
      );
      await waitFor(() => {
        expect(screen.queryByText(t.pageTitle)).toBeDefined();
      });
    });

    test(`[${locale}] branch 3 — masked internal error renders the generic alert`, async () => {
      renderPlans(
        [
          {
            request: { query: planCatalogQueryDocument, variables: CATALOG_VARIABLES },
            result: {
              errors: [{ message: "INTERNAL_SERVER_ERROR (masked)", extensions: { code: "INTERNAL_SERVER_ERROR" } }],
            },
          },
        ],
        locale
      );
      await waitFor(() => {
        expect(screen.getByTestId(PLANS_ERROR_TEST_ID)).toBeDefined();
      });
      expect(screen.getByText(t.genericError)).toBeDefined();
    });

    test(`[${locale}] branch 4 — zero plans renders the empty state`, async () => {
      renderPlans([planCatalogMock([])], locale);
      await waitFor(() => {
        expect(screen.getByTestId(PLANS_EMPTY_TEST_ID)).toBeDefined();
      });
      expect(screen.getByText(t.emptyTitle)).toBeDefined();
      expect(screen.getByText(t.emptyBody)).toBeDefined();
    });

    test(`[${locale}] branch 5 — populated catalog renders card titles, prices, lane lines and Buy CTAs`, async () => {
      renderPlans([POPULATED_MOCK], locale);
      await waitFor(() => {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-401${PLAN_CARD_BUY_SUFFIX}`)).toBeDefined();
      });
      for (const plan of PLAN_CATALOG_ROWS) {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${plan.id}`)).toBeDefined();
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${plan.id}${PLAN_CARD_BUY_SUFFIX}`)).toBeDefined();
        expect(screen.getByText(plan.title)).toBeDefined();
        if (plan.balanceLane !== null) {
          // The lane feature line renders the namespace-owned localized copy.
          expect(screen.getByText(t.laneCreditLine(t[LANE_LABEL_KEYS[plan.balanceLane]]))).toBeDefined();
        }
      }
      // Laneless rows render no lane feature line.
      expect(screen.queryAllByText(t.laneCreditLine(t.laneReviews))).toHaveLength(0);
      // The price renders verbatim from the wire decimal string.
      expect(screen.getByText(`${PLAN_CATALOG_ROWS[0].price} ${PLAN_CATALOG_ROWS[0].currency}`)).toBeDefined();
      // Buy CTAs carry the localized copy.
      expect(screen.getAllByText(t.buyButton).length).toBeGreaterThanOrEqual(PLAN_CATALOG_ROWS.length);
    });

    test(`[${locale}] branch 6 — Buy opens the confirm dialog with summary + price`, async () => {
      await renderPlansAndOpenDialog([POPULATED_MOCK], locale, DIALOG_PLAN_ROW.id);
      expect(screen.getByText(t.confirmDialogTitle)).toBeDefined();
      expect(screen.getByText(t.amountDueLabel)).toBeDefined();
      expect(screen.getByText(t.confirmDialogSecureNote)).toBeDefined();
      expect(screen.getByText(t.confirmButton)).toBeDefined();
      expect(screen.getByText(t.cancelButton)).toBeDefined();
      // The selected plan's summary rides the dialog.
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toContain("Tajweed & Tilawa");
      expect(dialog.textContent).toContain("300.00 EGP");
    });

    test(`[${locale}] branch 7 — dialog dismiss closes without a wire call`, async () => {
      await renderPlansAndOpenDialog([POPULATED_MOCK], locale, DIALOG_PLAN_ROW.id);
      fireEvent.click(screen.getByText(t.cancelButton));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    test(`[${locale}] branch 8 — idempotency key: minted once, kept across a failed submit`, async () => {
      const sentKeys: Array<string | null> = [];
      renderPlansWithCapture([POPULATED_MOCK, PURCHASE_FAILED_MOCK, PURCHASE_FAILED_MOCK], locale, key => {
        sentKeys.push(key);
      });
      await waitFor(() => {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-402${PLAN_CARD_BUY_SUFFIX}`)).toBeDefined();
      });
      // Query reads are captured too (null header) — only mutation carries keys.
      const nonNullKeys = (): string[] => sentKeys.filter((key): key is string => key !== null);
      expect(nonNullKeys()).toHaveLength(0);
      fireEvent.click(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-402${PLAN_CARD_BUY_SUFFIX}`));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });
      // First attempt.
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(screen.getByText(t.genericError)).toBeDefined();
      });
      const firstAttempt = nonNullKeys();
      expect(firstAttempt).toHaveLength(1);
      // Retry with the SAME key — failed submits keep the attempt key.
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(nonNullKeys()).toHaveLength(2);
      });
      expect(nonNullKeys()[1]).toBe(firstAttempt[0]);
    });

    test(`[${locale}] branch 9 — purchase failure keeps the dialog open with the localized error`, async () => {
      await renderPlansAndOpenDialog([POPULATED_MOCK, PURCHASE_FAILED_MOCK], locale, DIALOG_PLAN_ROW.id);
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(screen.getByText(t.genericError)).toBeDefined();
      });
      expect(screen.getByRole("dialog")).toBeDefined();
      // The busy CTA returns to its idle copy once the attempt settles.
      await waitFor(() => {
        expect(screen.getByText(t.confirmButton)).toBeDefined();
      });
    });

    test(`[${locale}] branch 11 — instant activation (checkoutUrl null) shows the success notice`, async () => {
      await renderPlansAndOpenDialog([POPULATED_MOCK, PURCHASE_COMPLETED_MOCK], locale, DIALOG_PLAN_ROW.id);
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(screen.getByText(t.purchaseCompletedNotice)).toBeDefined();
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    test(`[${locale}] branch 12 — copy contract pin (rendered copy equals preloaded labels)`, async () => {
      renderPlans([POPULATED_MOCK], locale);
      await waitFor(() => {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-401${PLAN_CARD_BUY_SUFFIX}`)).toBeDefined();
      });
      expect(screen.getByText(t.pageTitle)).toBeDefined();
      expect(screen.getByText(t.pageSubtitle)).toBeDefined();
      expect(screen.getAllByText(t.buyButton).length).toBeGreaterThanOrEqual(1);
      // The lane feature line is namespace-owned localized copy, per lane.
      expect(screen.getByText(t.laneCreditLine(t.laneHifz))).toBeDefined();
      expect(screen.getByText(t.laneCreditLine(t.laneTajweed))).toBeDefined();
    });

    test(`[${locale}] branch 13 — in-flight purchase shows the busy CTA inside the dialog`, async () => {
      // The never-resolving purchase mock holds the mutation in flight —
      // the busy CTA state the 7.2 arms never asserted in isolation.
      await renderPlansAndOpenDialog(
        [POPULATED_MOCK, purchaseInFlightMock(DIALOG_PLAN_ROW.id)],
        locale,
        DIALOG_PLAN_ROW.id
      );
      fireEvent.click(screen.getByText(t.confirmButton));
      // The confirm affordance swaps to its busy copy while the mutation
      // runs and the cancel affordances leave (disabled is not a text
      // query) — the dialog stays open for the in-flight window.
      await waitFor(() => {
        expect(screen.getByText(t.confirmBusyButton)).toBeDefined();
      });
      expect(screen.getByRole("dialog")).toBeDefined();
      // The attempt settles nowhere — no notice, no error while in flight
      // (the arm pins the in-flight state, not the outcome).
      expect(screen.queryByText(t.purchaseCompletedNotice)).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Redirect arm — D8-CLASS SKIP-WITH-BODY
//
// The hosted-checkout success arm navigates the browser via
// `globalThis.window.location.href` — the Happy-DOM window leaves the
// canvas and the test process loses its document. The arm's body is INTACT
// behind one `.skip(` — a one-line flip re-enables it — and the flow is
// compensated by the REAL-BROWSER 4.1 QA loop (the same skip-with-body
// posture as the wallet suite's SUCCESS-submit arm).
describe.skip("PlansCatalogContainer — hosted-checkout redirect arm (D8-class)", () => {
  test("branch 10 — purchase with a hosted checkoutUrl redirects the browser", async () => {
    const locale: AppLocale = "en";
    const t: CheckoutLabels = CheckoutNs.getLabels(getTranslations(locale));
    await renderPlansAndOpenDialog(
      [POPULATED_MOCK, purchaseRedirectMock("https://eg.checkout.paymob.com/")],
      locale,
      DIALOG_PLAN_ROW.id
    );
    fireEvent.click(screen.getByText(t.confirmButton));
    await waitFor(() => {
      expect(globalThis.window.location.href).toBe("https://eg.checkout.paymob.com/");
    });
  });
});

// ---------------------------------------------------------------------------
// Funnel-journey exports — consumed by `PlansCheckoutFunnelJourney.suite.tsx`
// (the cross-container Apollo-cache interplay matrix). Declared AFTER the
// suite bodies so the module-level fixture consts are initialized (the
// journey suite exercises the funnel with the SAME fixtures + render helpers
// the per-container suites pin — the test-tier counterpart of the view
// modules' one-definition-site convention).

/** The populated catalog mock (the journey arm's catalog side). */
export const FUNNEL_CATALOG_MOCK: ReadonlyArray<MockLink.MockedResponse> = [POPULATED_MOCK];

/** The dialog arms' selected catalog row (the funnel's dialog entry point). */
export const FUNNEL_DIALOG_PLAN = DIALOG_PLAN_ROW;

/**
 * The catalog funnel interaction: opens the dialog for the journey plan,
 * confirms, and resolves once the purchase attempt settles (the dialog
 * leaves the DOM) — the catalog side of the funnel-journey matrix.
 */
export async function funnelOpenDialogAndConfirm(
  locale: AppLocale,
  t: CheckoutLabels,
  extraMocks: ReadonlyArray<MockLink.MockedResponse> = []
): Promise<void> {
  await renderPlansAndOpenDialog([...FUNNEL_CATALOG_MOCK, ...extraMocks], locale, DIALOG_PLAN_ROW.id);
  await confirmOpenDialogPurchase(t);
}
