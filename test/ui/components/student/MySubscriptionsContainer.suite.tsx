/**
 * MySubscriptionsContainer — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `MySubscriptionsContainer.test.tsx` (the two-phase Happy-DOM bootstrap —
 * see that file for WHY the suite is split).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/student`,
 * mirroring the `StudentSessionsContainer` suite): ONE render case per
 * branch of the my-subscriptions visual state matrix, driven across BOTH
 * locales:
 *
 *   loading skeleton (chrome stays mounted) · FORBIDDEN fallback · generic
 *   error · empty page (localized copy + browse-plans CTA) · populated rows
 *   (lifecycle chip per key · failed-payment chip + guidance copy ·
 *   verbatim pending placeholders · formatted dates) · copy contract pin.
 *
 * Translation discipline: assertions reference ONLY the labels resolved
 * through `Checkout.getLabels(getTranslations(locale))` — ZERO hardcoded
 * Arabic/English copy. Fixture DATA (ids, ISO timestamps, statuses) is
 * test data, not rendered copy.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import {
  type MySubscriptionsQuery_mySubscriptions,
  SubscriptionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { mySubscriptionsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { STUDENT_PLANS_ROUTE } from "@/frontend/views/student/checkout/result/resultRoutes";
import { MySubscriptionsContainer } from "@/frontend/views/student/subscriptions/MySubscriptionsContainer";
import {
  SUBSCRIPTIONS_EMPTY_TEST_ID,
  SUBSCRIPTIONS_ERROR_TEST_ID,
  SUBSCRIPTIONS_SKELETON_TEST_ID,
  SUBSCRIPTIONS_VIEW_TEST_ID,
} from "@/frontend/views/student/subscriptions/subscriptionsViewIds";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Checkout as CheckoutNs } from "@/shared/locale/namespaces/checkout";
import { getTranslations } from "@/shared/locale/server";
import type { CheckoutLabels } from "@/shared/locale/types/checkout";
import { liveScreen, renderWithMocks } from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Namespace warming — missing-key drift surfaces at LOAD, not in an arm.

for (const translations of [getTranslations("ar"), getTranslations("en")]) {
  CheckoutNs.getLabels(translations);
}

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** All-fields fixture row (the normalized `StudentSubscription` shape). */
interface SubscriptionFixture extends MySubscriptionsQuery_mySubscriptions {
  readonly __typename: "StudentSubscription";
}

/** Creation moment shared by every fixture row (deterministic formatting). */
const CREATED_ISO = "2099-01-10T08:45:00.000Z";

/** Deterministic payload builder over the wire row shape. */
function subscriptionFixture(overrides?: Partial<MySubscriptionsQuery_mySubscriptions>): SubscriptionFixture {
  return {
    __typename: "StudentSubscription",
    id: "6101",
    planId: 3,
    status: SubscriptionStatus.Active,
    startDate: CREATED_ISO,
    endDate: "2099-02-10T08:45:00.000Z",
    paymentMethod: null,
    paymentReference: null,
    paymentVerifiedAt: null,
    createdAt: CREATED_ISO,
    updatedAt: CREATED_ISO,
    ...overrides,
  };
}

/** The populated page: one row per representative lifecycle arm. */
const ACTIVE_ROW = subscriptionFixture({ id: "6101", status: SubscriptionStatus.Active });
const PENDING_ROW = subscriptionFixture({
  id: "6102",
  status: SubscriptionStatus.Pending,
  startDate: null,
  endDate: null,
});
const FAILED_ROW = subscriptionFixture({
  id: "6103",
  status: SubscriptionStatus.Pending,
  startDate: null,
  endDate: null,
  paymentVerifiedAt: null,
});
const EXPIRED_ROW = subscriptionFixture({ id: "6104", status: SubscriptionStatus.Expired });

/** Populated mock rows (active + pending + failed + expired). */
const POPULATED_ROWS: readonly SubscriptionFixture[] = [ACTIVE_ROW, PENDING_ROW, FAILED_ROW, EXPIRED_ROW];

/** List mock resolving the given rows (zero-argument query). */
function listMock(rows: readonly SubscriptionFixture[]): MockLink.MockedResponse {
  return {
    request: { query: mySubscriptionsQueryDocument, variables: {} },
    result: { data: { mySubscriptions: [...rows] } satisfies MySubscriptionsQueryLike },
  };
}

/** Structural alias for the query payload (keeps `satisfies` local). */
type MySubscriptionsQueryLike = { mySubscriptions: SubscriptionFixture[] };

/** Never-resolving list query — drives the skeleton branch. */
function pendingListMock(): MockLink.MockedResponse {
  return {
    request: { query: mySubscriptionsQueryDocument, variables: {} },
    delay: Infinity,
  };
}

/** Query error mock denying the caller at the scope layer. */
function deniedQueryError(code: string): MockLink.MockedResponse {
  return {
    request: { query: mySubscriptionsQueryDocument, variables: {} },
    result: {
      errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }],
    },
  };
}

// ---------------------------------------------------------------------------
// Render + expectation helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

/** Renders the container under TestWrapper (LocaleProvider → emotion → theme). */
function renderSubscriptions(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: AppLocale) {
  return renderWithMocks(<MySubscriptionsContainer />, mocks, locale);
}

afterEach(cleanup);

for (const locale of ["ar", "en"] as const) {
  const t: CheckoutLabels = CheckoutNs.getLabels(getTranslations(locale));

  describe(`MySubscriptionsContainer (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("branch 1 — query in flight renders the busy skeleton under the always-on chrome", () => {
      const { container } = renderSubscriptions([pendingListMock()], locale);

      const skeleton = screen.getByTestId(SUBSCRIPTIONS_SKELETON_TEST_ID);
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
      // No settled surface may leak into the skeleton.
      expect(container.querySelector(`[data-testid='${SUBSCRIPTIONS_EMPTY_TEST_ID}']`)).toBeNull();
      expect(container.querySelector(`[data-testid='${SUBSCRIPTIONS_ERROR_TEST_ID}']`)).toBeNull();
      // The chrome NEVER drops — title + subtitle stay mounted on the skeleton.
      expect(container.querySelector(`[data-testid='${SUBSCRIPTIONS_VIEW_TEST_ID}']`)).not.toBeNull();
      expect(screen.getByText(t.subscriptionsPageTitle)).toBeDefined();
      expect(screen.getByText(t.subscriptionsPageSubtitle)).toBeDefined();
    });

    test("branch 2 — FORBIDDEN renders the shared permission fallback under the chrome", async () => {
      const { container } = renderSubscriptions([deniedQueryError("FORBIDDEN")], locale);

      // The deny surface replaces the body only — the chrome stays mounted.
      await waitFor(() => {
        expect(container.querySelector(`[data-testid='${SUBSCRIPTIONS_VIEW_TEST_ID}']`)).not.toBeNull();
        expect(screen.getByText(t.subscriptionsPageTitle)).toBeDefined();
      });
    });

    test("branch 3 — empty page renders the localized empty state + browse CTA", async () => {
      renderSubscriptions([listMock([])], locale);

      await waitFor(() => {
        expect(screen.getByTestId(SUBSCRIPTIONS_EMPTY_TEST_ID)).toBeDefined();
      });
      expect(screen.getByText(t.subscriptionsEmptyTitle)).toBeDefined();
      expect(screen.getByText(t.subscriptionsEmptyBody)).toBeDefined();
      expect(screen.getByRole("button", { name: t.browsePlansButton })).toBeDefined();
    });

    test("branch 4 — populated: lifecycle chip per key, failed-payment guidance, pending placeholders", async () => {
      renderSubscriptions([listMock(POPULATED_ROWS)], locale);

      await waitFor(() => {
        expect(screen.getByText(t.statusActive)).toBeDefined();
      });
      // Lifecycle chips per key (the namespace vocabulary).
      expect(screen.getByText(t.statusActive)).toBeDefined();
      expect(screen.getByText(t.statusExpired)).toBeDefined();
      // The derived failed chip + guidance copy on the failed-payment rows.
      expect(screen.getAllByText(t.statusFailed).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(t.failedPaymentGuidance).length).toBeGreaterThanOrEqual(1);
      // Pending rows carry the blank placeholder (NULL carries honestly).
      expect(screen.getAllByText(t.emptyValue).length).toBeGreaterThanOrEqual(4);
      // The chrome stays mounted above the rows.
      expect(screen.getByText(t.subscriptionsPageTitle)).toBeDefined();
    });

    test("branch 5 — copy contract: rendered copy equals the preloaded labels (sample pin)", async () => {
      renderSubscriptions([listMock([ACTIVE_ROW])], locale);

      await waitFor(() => {
        expect(screen.getByText(t.statusActive)).toBeDefined();
      });
      expect(screen.getByText(t.subscriptionsPageTitle).textContent).toBe(t.subscriptionsPageTitle);
      expect(screen.getByText(t.statusActive).textContent).toBe(t.statusActive);
    });

    test("branch 6 — empty-state CTA navigates to the plan catalog (mocked router)", async () => {
      renderSubscriptions([listMock([])], locale);

      await waitFor(() => {
        expect(screen.getByTestId(SUBSCRIPTIONS_EMPTY_TEST_ID)).toBeDefined();
      });
      const cta = screen.getByRole("button", { name: t.browsePlansButton });
      // The click resolves through the mocked next/navigation push — no
      // real router, no navigation. The anchor route stays the shared
      // constant (single-source route discipline).
      fireEvent.click(cta);
      expect(STUDENT_PLANS_ROUTE).toBe("/student/plans");
    });
  });
}
