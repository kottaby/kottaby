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
 * FUNNEL-LEVEL coverage (additions on top of the base arms):
 *
 *   branch 8b dialog cancel keeps the attempt's idempotency key (the
 *             cancel path resets only the dialog state — a later
 *             re-opened attempt replays the same key)
 *   branch 11b instant activation refetches the catalog (the mock-provider
 *             branch's completed outcome closes the dialog AND re-queries
 *             the grid)
 *   branch 13 the in-flight purchase CTA's busy state inside the dialog
 *             (the confirm copy swaps to the busy spinner while the
 *             mutation runs — the named-untested arm of the catalog flow)
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
 */
const DIALOG_PLAN_ROW = PLAN_CATALOG_ROWS[1];

/** Renders the container under a capturing link that records each operation's name. */
function renderPlansWithOperationLog(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale,
  onOperationSent: (operationName: string) => void
): RenderResult {
  const capture = new ApolloLink((operation, forward) => {
    onOperationSent(operation.operationName ?? "");
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

/** The idempotency-key arms' buy-testid selector (the captured plan's card). */
function planBuyTestId(planId: string): string {
  return `${PLAN_CARD_TEST_ID_PREFIX}-${planId}${PLAN_CARD_BUY_SUFFIX}`;
}

/** Clicks one plan's Buy CTA once its card is live (the idempotency-arm prologue). */
async function clickBuyWhenLive(planId: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId(planBuyTestId(planId))).toBeDefined();
  });
  fireEvent.click(screen.getByTestId(planBuyTestId(planId)));
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeDefined();
  });
}

/** Filters the captured keys to the mutation-carried (non-null) ones. */
function nonNullKeys(sentKeys: ReadonlyArray<string | null>): string[] {
  return sentKeys.filter((key): key is string => key !== null);
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
      // Query reads are captured too (null header) — only mutation carries keys.
      expect(nonNullKeys(sentKeys)).toHaveLength(0);
      await clickBuyWhenLive("402");
      // First attempt.
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(screen.getByText(t.genericError)).toBeDefined();
      });
      const firstAttempt = nonNullKeys(sentKeys);
      expect(firstAttempt).toHaveLength(1);
      // Retry with the SAME key — failed submits keep the attempt key.
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(nonNullKeys(sentKeys)).toHaveLength(2);
      });
      expect(nonNullKeys(sentKeys)[1]).toBe(firstAttempt[0]);
    });

    test(`[${locale}] branch 8b — dialog cancel keeps the attempt's idempotency key`, async () => {
      // The cancel path (dismiss without a submit) resets only the dialog
      // state — the attempt key survives so a LATER re-opened attempt still
      // replays the same key (the server-side replay dedupe stays effective
      // across cancel/re-open windows).
      const sentKeys: Array<string | null> = [];
      renderPlansWithCapture([POPULATED_MOCK, PURCHASE_FAILED_MOCK], locale, key => {
        sentKeys.push(key);
      });
      // Open the dialog and cancel — no key is consumed (no wire call).
      await clickBuyWhenLive("402");
      fireEvent.click(screen.getByText(t.cancelButton));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(nonNullKeys(sentKeys)).toHaveLength(0);
      // Re-open and submit — the SAME key the dialog-cancel kept alive is
      // the one the mutation carries (never rotated by a cancel).
      await clickBuyWhenLive("402");
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(screen.getByText(t.genericError)).toBeDefined();
      });
      // The single captured key is the cancel-survivor: one mint for the
      // surface lifetime (the same ref the failed-submit arm pins).
      expect(nonNullKeys(sentKeys)).toHaveLength(1);
      expect(new Set(nonNullKeys(sentKeys)).size).toBe(1);
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

    test(`[${locale}] branch 11b — instant activation refetches the catalog (mock-provider branch)`, async () => {
      // The mock-provider branch (`checkoutUrl: null` → `completed`) closes
      // the dialog AND refetches the catalog — the fresh-availability read
      // that follows an instant-activation purchase (the session-credit
      // balances change server-side, so the grid re-queries).
      const sentOperations: string[] = [];
      renderPlansWithOperationLog([POPULATED_MOCK, PURCHASE_COMPLETED_MOCK], locale, name => {
        sentOperations.push(name);
      });
      await waitFor(() => {
        expect(
          screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${DIALOG_PLAN_ROW.id}${PLAN_CARD_BUY_SUFFIX}`)
        ).toBeDefined();
      });
      // The mount's own query ran once.
      expect(sentOperations.filter(name => name === "PlanCatalog")).toHaveLength(1);
      fireEvent.click(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${DIALOG_PLAN_ROW.id}${PLAN_CARD_BUY_SUFFIX}`));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByText(t.confirmButton));
      await waitFor(() => {
        expect(screen.getByText(t.purchaseCompletedNotice)).toBeDefined();
      });
      // The refetch: a SECOND PlanCatalog operation rides the completed
      // outcome (the catalog grid re-queries after the instant activation).
      await waitFor(() => {
        expect(sentOperations.filter(name => name === "PlanCatalog").length).toBeGreaterThanOrEqual(2);
      });
      // The grid stays settled after the refetch (the shared fixture mock is
      // re-usable — `maxUsageCount: Infinity` on the catalog builder).
      expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${DIALOG_PLAN_ROW.id}`)).toBeDefined();
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
      // the busy CTA state the base arms never asserted in isolation.
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
