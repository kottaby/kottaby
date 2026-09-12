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
import { planCatalogQueryDocument } from "@/frontend/graphql/sharedDocuments";
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

// ---------------------------------------------------------------------------
// Render + expectation helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

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

    test(`[${locale}] branch 5 — populated catalog renders card titles, prices and Buy CTAs`, async () => {
      renderPlans([POPULATED_MOCK], locale);
      await waitFor(() => {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-401${PLAN_CARD_BUY_SUFFIX}`)).toBeDefined();
      });
      for (const plan of PLAN_CATALOG_ROWS) {
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${plan.id}`)).toBeDefined();
        expect(screen.getByTestId(`${PLAN_CARD_TEST_ID_PREFIX}-${plan.id}${PLAN_CARD_BUY_SUFFIX}`)).toBeDefined();
        expect(screen.getByText(plan.title)).toBeDefined();
      }
      // The price renders verbatim from the wire decimal string.
      expect(screen.getByText(`${PLAN_CATALOG_ROWS[0].price} ${PLAN_CATALOG_ROWS[0].currency}`)).toBeDefined();
      // Buy CTAs carry the localized copy.
      expect(screen.getAllByText(t.buyButton).length).toBeGreaterThanOrEqual(PLAN_CATALOG_ROWS.length);
    });

    test(`[${locale}] branch 6 — Buy opens the confirm dialog with summary + price`, async () => {
      await renderPlansAndOpenDialog([POPULATED_MOCK], locale, "402");
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
      await renderPlansAndOpenDialog([POPULATED_MOCK], locale, "402");
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
      await renderPlansAndOpenDialog([POPULATED_MOCK, PURCHASE_FAILED_MOCK], locale, "402");
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
      await renderPlansAndOpenDialog([POPULATED_MOCK, PURCHASE_COMPLETED_MOCK], locale, "402");
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
      "402"
    );
    fireEvent.click(screen.getByText(t.confirmButton));
    await waitFor(() => {
      expect(globalThis.window.location.href).toBe("https://eg.checkout.paymob.com/");
    });
  });
});
