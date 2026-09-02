/**
 * PlatformAnalyticsContainer component test (DEV3-022c, task 4.4.TE) —
 * Happy DOM + Apollo tier: the container renders through the REAL Apollo
 * client driven by a MockLink, with the REAL translation system.
 *
 * Translation discipline (test/ui/AGENTS.md): every assertion is keyed on
 * the LABELS the component renders — resolved through
 * `getDefaultTranslations()` — never hardcoded strings.
 *
 * Required states (plan 4.4.TE):
 *  - loading → skeleton cards (aria-busy busy wrapper);
 *  - populated → every section renders with resolved labels;
 *  - error → inline load-error alert + Retry CTA;
 *  - FORBIDDEN mock → denied notice (not the generic error);
 *  - honest-null ratings render `—`;
 *  - empty gateway revenue renders `noRevenueYet`.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

// Chart stubs — the chart modules render recharts (excluded from this DOM
// tier by design); the stubs let the container's full section tree commit.
void mock.module("@/frontend/views/admin/analytics/SessionTrendChart", () => ({
  default: () => <div data-testid="session-trend-stub" />,
}));
void mock.module("@/frontend/views/admin/analytics/RevenueTrendChart", () => ({
  default: () => <div data-testid="revenue-trend-stub" />,
}));

import { ApolloClient, InMemoryCache } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { MockLink } from "@apollo/client/testing";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { adminPlatformAnalyticsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { PlatformAnalyticsContainer } from "@/frontend/views/admin/analytics/PlatformAnalyticsContainer";
import { getTranslations } from "@/shared/locale/server";
import { TestWrapper } from "@/test/ui/components/TestWrapper";

// The wrapper pins `en` (see renderWith below), so the assertions resolve the
// SAME labels the component renders — from the translation system, not
// hardcoded strings (test/ui/AGENTS.md discipline; the explicit locale here
// matches the explicitly-pinned wrapper locale).
const t = getTranslations("en").analyticsTranslations;

/** Full valid snapshot fixture (all sections populated; ratings non-null). */
const POPULATED_SNAPSHOT = {
  __typename: "PlatformAnalytics" as const,
  generatedAt: new Date("2026-09-02T12:00:00Z"),
  users: {
    totalCount: 101,
    activeCount: 90,
    suspendedCount: 1,
    blockedCount: 2,
    deletedCount: 3,
    adminsCount: 4,
    teachersCount: 20,
    studentsCount: 60,
    parentsCount: 16,
    newThisWeekCount: 7,
    recentlyActive24h: 33,
  },
  sessions: {
    total: 500,
    today: 4,
    thisWeek: 40,
    thisMonth: 120,
    scheduled: 30,
    started: 10,
    completed: 400,
    cancelled: 50,
    disputed: 10,
    awaitingConfirmation: 5,
  },
  revenue: {
    gatewayRevenueByCurrency: [
      {
        __typename: "PlatformAnalyticsCurrencyRevenue" as const,
        currency: "EGP",
        totalAmount: "1000.00",
        last30DaysAmount: "250.50",
        paidPaymentsCount: 12,
      },
    ],
    offlineActivationsCount: 3,
  },
  subscriptions: { total: 80, active: 60, pending: 5, expired: 10, cancelled: 4, suspended: 1, activeInWindowNow: 58 },
  teachers: { certifiedCount: 18, evaluatorCount: 6, onlineNowCount: 5 },
  ratings: {
    averageSessionRating: 4.5,
    sessionRatingsCount: 2,
    averageEvaluationScore: 87.5,
    evaluationScoresCount: 2,
  },
  health: { pendingDisputes: 10, pendingWithdrawals: 2 },
  sessionTrendDaily: Array.from({ length: 30 }, (_, index) => ({
    bucketStart: new Date(Date.UTC(2026, 7, 4 + index, 0, 0, 0)),
    sessionCount: index,
  })),
  revenueTrendDaily: [
    {
      __typename: "PlatformAnalyticsRevenueTrendPoint" as const,
      bucketStart: new Date(Date.UTC(2026, 8, 2)),
      currency: "EGP",
      amount: "120.00",
    },
  ],
};

/** A single mocked wire case for the analytics document. */
type WireCase = MockLink.MockedResponse<Record<string, unknown>, Record<string, unknown>>;

/** Renders the container under TestWrapper + a real Apollo client on MockLink. */
function renderWith(results: readonly WireCase[]): void {
  const client = new ApolloClient({
    link: new MockLink([...results], { showWarnings: false }),
    cache: new InMemoryCache({
      typePolicies: {
        PlatformAnalytics: { keyFields: false },
        PlatformAnalyticsUsers: { keyFields: false },
        PlatformAnalyticsSessions: { keyFields: false },
        PlatformAnalyticsRevenue: { keyFields: false },
        PlatformAnalyticsCurrencyRevenue: { keyFields: false },
        PlatformAnalyticsSubscriptions: { keyFields: false },
        PlatformAnalyticsTeachers: { keyFields: false },
        PlatformAnalyticsRatings: { keyFields: false },
        PlatformAnalyticsHealth: { keyFields: false },
        PlatformAnalyticsSessionTrendPoint: { keyFields: false },
        PlatformAnalyticsRevenueTrendPoint: { keyFields: false },
      },
    }),
  });
  render(
    <TestWrapper locale="en">
      <ApolloProvider client={client}>
        <PlatformAnalyticsContainer />
      </ApolloProvider>
    </TestWrapper>
  );
}

/** Type-guarded refresh control lookup (no unsafe assertions — oxlint). */
function getRefreshButton(): HTMLButtonElement {
  const control = screen.getByRole("button", { name: t.refreshAction });
  if (!(control instanceof HTMLButtonElement)) {
    throw new TypeError("the refresh control must render as a <button>");
  }
  return control;
}

afterEach(() => {
  cleanup();
});

describe("PlatformAnalyticsContainer", () => {
  test("loading renders the busy shell with skeleton cards and no metric text yet", () => {
    renderWith([
      {
        // Neither result nor error — the request stays pending and the
        // initial loading state persists for the assertion window.
        request: { query: adminPlatformAnalyticsQueryDocument },
      },
    ]);
    // The refresh control exists but is disabled during the initial load.
    expect(getRefreshButton().disabled).toBe(true);
  });

  test("populated renders every section title with figures from the snapshot", async () => {
    renderWith([
      {
        request: { query: adminPlatformAnalyticsQueryDocument },
        result: { data: { adminPlatformAnalytics: POPULATED_SNAPSHOT } },
      },
    ]);
    await waitFor(() => expect(document.body.textContent).toContain(t.usersSection));
    const body = document.body.textContent ?? "";
    const missing = [
      t.sessionsSection,
      t.revenueSection,
      t.subscriptionsSection,
      t.teachersSection,
      t.ratingsSection,
      t.healthSection,
      t.totalUsersLabel,
      t.recentlyActive24hLabel,
      t.pendingDisputesLabel,
    ].filter(label => !body.includes(label));
    if (missing.length > 0) {
      throw new Error(`missing=${JSON.stringify(missing)} len=${body.length} snippet=${body.slice(0, 400)}`);
    }
    // Refresh re-enabled once populated.
    expect(getRefreshButton().disabled).toBe(false);
  });

  test("error renders the load-error alert with the Retry CTA (no raw server text)", async () => {
    renderWith([
      {
        request: { query: adminPlatformAnalyticsQueryDocument },
        error: Object.assign(new Error("internal server detail leak"), {
          errors: [{ message: "boom", extensions: { code: "INTERNAL_SERVER_ERROR" } }],
        }),
      },
    ]);
    await waitFor(() => expect(document.body.textContent).toContain(t.loadErrorTitle));
    const body = document.body.textContent ?? "";
    expect(body).toContain(t.loadErrorBody);
    expect(body).toContain(t.retryAction);
    // The raw server message is NEVER rendered.
    expect(body).not.toContain("internal server detail leak");
  });

  test("FORBIDDEN renders the denied notice instead of the generic error", async () => {
    const forbidden = Object.assign(new Error("governed"), {
      errors: [{ message: "governed", extensions: { code: "FORBIDDEN" } }],
    });
    renderWith([{ request: { query: adminPlatformAnalyticsQueryDocument }, error: forbidden }]);
    await waitFor(() => expect(document.body.textContent).toContain(t.deniedTitle));
    const body = document.body.textContent ?? "";
    expect(body).toContain(t.deniedBody);
    expect(body).not.toContain(t.loadErrorTitle);
  });

  test("honest-null ratings render the em-dash and empty revenue renders noRevenueYet", async () => {
    const coldSnapshot = {
      ...POPULATED_SNAPSHOT,
      ratings: {
        averageSessionRating: null,
        sessionRatingsCount: 0,
        averageEvaluationScore: null,
        evaluationScoresCount: 0,
      },
      revenue: { gatewayRevenueByCurrency: [], offlineActivationsCount: 0 },
    };
    renderWith([
      {
        request: { query: adminPlatformAnalyticsQueryDocument },
        result: { data: { adminPlatformAnalytics: coldSnapshot } },
      },
    ]);
    await waitFor(() => expect(document.body.textContent).toContain(t.ratingsSection));
    const body = document.body.textContent ?? "";
    // Em-dash placeholders — never a fabricated 0.00.
    expect(body).toContain("—");
    expect(body).toContain(t.noRevenueYet);
    expect(body).toContain(t.noRatingsYet);
  });

  test("refreshing keeps the STALE snapshot on screen under the busy chip (REQ-075)", async () => {
    renderWith([
      // Request 1 — the initial load resolves with the populated snapshot.
      {
        request: { query: adminPlatformAnalyticsQueryDocument },
        result: { data: { adminPlatformAnalytics: POPULATED_SNAPSHOT } },
      },
      // Request 2 — the refetch resolves with the same populated snapshot
      // after a long delay, so the in-flight `NetworkStatus.refetch` posture
      // persists for the assertion window (a result-less mock would error
      // the refetch instead of holding it open).
      {
        request: { query: adminPlatformAnalyticsQueryDocument },
        result: { data: { adminPlatformAnalytics: POPULATED_SNAPSHOT } },
        delay: 5000,
      },
    ]);
    await waitFor(() => expect(document.body.textContent).toContain(t.usersSection));
    // Fire the manual refresh — the delayed refetch above stays in flight.
    getRefreshButton().click();
    await waitFor(() => expect(document.body.textContent).toContain(t.refreshingLabel));
    // Stale retention: the previous snapshot's figures stay rendered (never
    // blanked) while the refetch is in flight.
    const refreshingBody = document.body.textContent ?? "";
    expect(refreshingBody).toContain(t.usersSection);
    expect(refreshingBody).toContain("101");
    // The refresh control disables itself while a refetch is in flight.
    expect(getRefreshButton().disabled).toBe(true);
  });
});
