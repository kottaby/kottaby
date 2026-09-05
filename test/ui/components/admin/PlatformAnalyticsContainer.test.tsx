/**
 * PlatformAnalyticsContainer — the `/admin/analytics` admin platform
 * analytics component suite.
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components`): every
 * render branch, driven with translation-handle matchers ONLY (labels
 * resolved from the `Analytics` namespace handle; fixture counts/money
 * strings/currency codes/dates are technical test data, never UI copy):
 *
 *   busy mirrored-geometry skeleton (7 metric cards + 2 chart-shaped
 *   placeholders, `component="output" aria-busy`) → populated
 *   dashboard (all seven sections, per-currency revenue table with grouped
 *   money strings, offline-activations row, last-updated caption, both
 *   trend charts) · honest-null ratings render an em-dash (never a
 *   fabricated `0.00`) + `noRatingsYet` when both rating families are empty
 *   · empty revenue renders `noRevenueYet` — never a zero-currency row ·
 *   generic load error → inline `Alert` + Retry CTA that recovers ·
 *   failed-initial-load re-attempt keeps the Alert STABLE (never an
 *   Alert→Skeleton flip while the re-attempt/poll is in flight) ·
 *   query-context FORBIDDEN → the localized denied notice (raw server
 *   message never rendered, no retry CTA) · a FORBIDDEN re-attempt keeps
 *   the denied notice LATCHED through the snapshotless re-attempt window
 *   (never the LoadError/Retry flip) · manual refresh keeps the STALE
 *   snapshot on screen under the `refreshingLabel` chip while the fresh
 *   snapshot is in flight · Arabic RTL render resolves the same handle.
 *
 * The UTC instant formatting assertions recompute the stamp through the
 * SAME i18n date helper the container uses (`formatApplicantDate`) — the
 * label composition itself is asserted through the handle.
 *
 * Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts test/ui/components/admin/PlatformAnalyticsContainer.test.tsx`
 */

// ─── Harness preloads (inline replication of the `test:ui:components` stack) ─
//
// `bun run test/scripts/run-test.ts <file>` spawns
// `bun --env-file=.env.test test <file>` with NO `--preload` flags, and
// bunfig.toml's single `[test]` preload list carries only the global five —
// the four UI preloads are otherwise supplied solely by the package script.
// This suite therefore carries its own copy of that exact stack, in the same
// order, as the FIRST statements of the module body (same LOAD ORDERING
// CONTRACT as the AuditTrailView suite: RTL must evaluate AFTER the Happy-DOM
// window exists).

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

// ─── Post-DOM module wiring (top-level await — LOAD ORDERING CONTRACT) ───────

const { act, cleanup, fireEvent, screen, waitFor, within } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { afterEach, describe, expect, test } from "bun:test";
import { ApolloClient } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import type { RenderResult } from "@testing-library/react";
import type {
  AdminPlatformAnalyticsQuery,
  AdminPlatformAnalyticsQuery_adminPlatformAnalytics,
  AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenue_gatewayRevenueByCurrency,
  AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily,
  AdminPlatformAnalyticsQuery_adminPlatformAnalytics_sessionTrendDaily,
} from "@/frontend/graphql/generated/gql/graphql";
import { adminPlatformAnalyticsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { createApolloCache } from "@/frontend/providers/apollo/apolloCache";
import { PlatformAnalyticsContainer } from "@/frontend/views/admin/analytics/PlatformAnalyticsContainer";
import { NULL_METRIC_PLACEHOLDER } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { Analytics } from "@/shared/locale/namespaces/analytics";
import { getTranslations } from "@/shared/locale/server";

// NOTE: `renderWithWrapper` is deliberately NOT statically imported here —
// `TestWrapper.tsx` statically imports `@testing-library/react`, so a static
// import would pull RTL into the pre-DOM evaluation phase described above.

// Warm the Analytics handle for BOTH locales eagerly — missing-key drift
// surfaces here, at the earliest possible moment, not inside an assertion.
Analytics.getLabels(enMessages);
Analytics.getLabels(arMessages);

// ─── Locale-driven matchers ─────────────────────────────────────────────────

const t = Analytics.getLabels(getTranslations("en"));
const tar = Analytics.getLabels(getTranslations("ar"));

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

/** Deterministic UTC instants — the second one proves the caption swap. */
const FIXED_ISO = "2026-08-29T12:00:00.000Z";
const REFRESHED_ISO = "2026-08-29T13:05:00.000Z";

type CurrencyRowFixture = AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenue_gatewayRevenueByCurrency;
type SessionTrendFixture = AdminPlatformAnalyticsQuery_adminPlatformAnalytics_sessionTrendDaily;
type RevenueTrendFixture = AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily;
type SnapshotFixture = AdminPlatformAnalyticsQuery_adminPlatformAnalytics;

/**
 * MockLink passes `result.data` through AS-IS — the fixtures mirror the
 * generated fragment shapes exactly (no extra wire bookkeeping keys), the
 * same fixture posture the disputes/audit suites established.
 */
const EGP_ROW: CurrencyRowFixture = {
  currency: "EGP",
  totalAmount: "120450.75",
  last30DaysAmount: "15000.00",
  paidPaymentsCount: 512,
};
const USD_ROW: CurrencyRowFixture = {
  currency: "USD",
  totalAmount: "4321.50",
  last30DaysAmount: "980.25",
  paidPaymentsCount: 87,
};

const SESSION_TREND: ReadonlyArray<SessionTrendFixture> = [
  { bucketStart: "2026-08-01T00:00:00.000Z", sessionCount: 12 },
  { bucketStart: "2026-08-02T00:00:00.000Z", sessionCount: 17 },
];
const REVENUE_TREND: ReadonlyArray<RevenueTrendFixture> = [
  { bucketStart: "2026-08-01T00:00:00.000Z", currency: "EGP", amount: "250.00" },
  { bucketStart: "2026-08-01T00:00:00.000Z", currency: "USD", amount: "30.10" },
  { bucketStart: "2026-08-02T00:00:00.000Z", currency: "EGP", amount: "180.50" },
];

/** The fully-populated snapshot (both rating averages present). */
const BASE_SNAPSHOT: SnapshotFixture = {
  generatedAt: FIXED_ISO,
  users: {
    totalCount: 1000,
    activeCount: 850,
    suspendedCount: 12,
    blockedCount: 3,
    deletedCount: 7,
    adminsCount: 4,
    teachersCount: 60,
    studentsCount: 700,
    parentsCount: 226,
    newThisWeekCount: 15,
    recentlyActive24h: 240,
  },
  sessions: {
    total: 5200,
    today: 18,
    thisWeek: 131,
    thisMonth: 502,
    scheduled: 90,
    started: 4100,
    completed: 3980,
    cancelled: 260,
    disputed: 14,
    awaitingConfirmation: 96,
  },
  revenue: {
    offlineActivationsCount: 3,
    gatewayRevenueByCurrency: [EGP_ROW, USD_ROW],
  },
  subscriptions: {
    total: 410,
    active: 355,
    pending: 20,
    expired: 25,
    cancelled: 9,
    suspended: 1,
    activeInWindowNow: 340,
  },
  teachers: {
    certifiedCount: 42,
    evaluatorCount: 9,
    onlineNowCount: 11,
  },
  ratings: {
    averageSessionRating: 4.5,
    sessionRatingsCount: 120,
    averageEvaluationScore: 88.75,
    evaluationScoresCount: 40,
  },
  health: {
    pendingDisputes: 6,
    pendingWithdrawals: 2,
  },
  sessionTrendDaily: [...SESSION_TREND],
  revenueTrendDaily: [...REVENUE_TREND],
};

function snapshotFixture(
  overrides?: Partial<AdminPlatformAnalyticsQuery_adminPlatformAnalytics>
): AdminPlatformAnalyticsQuery {
  return { adminPlatformAnalytics: { ...BASE_SNAPSHOT, ...overrides } };
}

/** Zero-argument query — `variables: {}` on the wire. */
function snapshotMock(data: AdminPlatformAnalyticsQuery, delay?: number): MockLink.MockedResponse {
  return delay === undefined
    ? { request: { query: adminPlatformAnalyticsQueryDocument, variables: {} }, result: { data } }
    : { request: { query: adminPlatformAnalyticsQueryDocument, variables: {} }, result: { data }, delay };
}

function codeErrorMock(code: string, delay?: number): MockLink.MockedResponse {
  const result = { errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }] };
  return delay === undefined
    ? { request: { query: adminPlatformAnalyticsQueryDocument, variables: {} }, result }
    : { request: { query: adminPlatformAnalyticsQueryDocument, variables: {} }, result, delay };
}

function renderAnalytics(mocks: ReadonlyArray<MockLink.MockedResponse>): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <PlatformAnalyticsContainer />
    </MockedProvider>,
    { locale: "en" }
  );
}

function renderAnalyticsRtl(mocks: ReadonlyArray<MockLink.MockedResponse>): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <PlatformAnalyticsContainer />
    </MockedProvider>,
    { locale: "ar" }
  );
}

/**
 * Client-handle render for the denial-latch posture: the FORBIDDEN re-attempt
 * is driven the way the 120s poll drives it — a client-level refetch of the
 * active observable (no Retry CTA exists to click during denial). Mirrors the
 * notification-drawer suite's real-client construction (the badge/feed
 * precedent): `createApolloCache()` + the production-default `errorPolicy:
 * "none"`.
 */
function renderAnalyticsWithClient(mocks: ReadonlyArray<MockLink.MockedResponse>): ApolloClient {
  const client = new ApolloClient({
    link: new MockLink([...mocks]),
    cache: createApolloCache(),
    defaultOptions: { query: { errorPolicy: "none" } },
  });
  renderWithWrapper(
    <ApolloProvider client={client}>
      <PlatformAnalyticsContainer />
    </ApolloProvider>,
    { locale: "en" }
  );
  return client;
}

afterEach(cleanup);

// ─── Suite (en / LTR) ───────────────────────────────────────────────────────

describe("PlatformAnalyticsContainer (en / LTR)", () => {
  test("initial load renders the busy card-shaped skeleton, then every populated section", async () => {
    renderAnalytics([snapshotMock(snapshotFixture(), 30)]);

    // First paint: the aria-busy output wrapper and NO settled metric labels.
    const busy = screen.getByRole("status");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText(t.usersTotalLabel)).toBeNull();
    expect(screen.queryByText(t.revenueSection)).toBeNull();

    // The skeleton mirrors the populated grid geometry (7 metric cards + 2
    // chart slots at shared heights); per-card row counts approximate.
    // Counted by card node (`.MuiCard-root`): Happy DOM also reports emotion's
    // injected <style> tags among the grids' element children.
    const metricSkeleton = within(busy).getByTestId("platform-analytics-metric-skeleton");
    expect(metricSkeleton.querySelectorAll(".MuiCard-root")).toHaveLength(7);
    const trendsSkeleton = within(busy).getByTestId("platform-analytics-trends-skeleton");
    expect(trendsSkeleton.querySelectorAll(".MuiCard-root")).toHaveLength(2);

    await waitFor(() => {
      expect(screen.getByText(t.usersTotalLabel)).toBeDefined();
    });

    // Heading + the seven section titles, all through the handle.
    expect(screen.getByText(t.subtitle)).toBeDefined();
    expect(screen.getByText(t.usersSection)).toBeDefined();
    expect(screen.getByText(t.sessionsSection)).toBeDefined();
    expect(screen.getByText(t.revenueSection)).toBeDefined();
    expect(screen.getByText(t.subscriptionsSection)).toBeDefined();
    expect(screen.getByText(t.teachersSection)).toBeDefined();
    expect(screen.getByText(t.ratingsSection)).toBeDefined();
    expect(screen.getByText(t.healthSection)).toBeDefined();

    // A spread of metric labels/values (label ≠ value embedding; the values
    // are the locale-formatted fixture counts — en groups thousands).
    expect(screen.getByText(t.usersTotalLabel)).toBeDefined();
    expect(screen.getByText("1,000")).toBeDefined();
    expect(screen.getByText(t.recentlyActive24hLabel)).toBeDefined();
    expect(screen.getByText(t.awaitingConfirmationLabel)).toBeDefined();
    expect(screen.getByText(t.activeInWindowNowLabel)).toBeDefined();
    expect(screen.getByText(t.teachersOnlineNowLabel)).toBeDefined();
    expect(screen.getByText(t.averageSessionRatingLabel)).toBeDefined();
    expect(screen.getByText("4.5")).toBeDefined();
    expect(screen.getByText(t.averageEvaluationScoreLabel)).toBeDefined();
    expect(screen.getByText("88.75")).toBeDefined();
    expect(screen.getByText(t.pendingDisputesLabel)).toBeDefined();

    // Per-currency revenue table: headers + grouped money strings verbatim.
    const table = screen.getByRole("table", { name: t.revenueSection });
    expect(within(table).getByRole("columnheader", { name: t.currencyHeader })).toBeDefined();
    expect(within(table).getByRole("columnheader", { name: t.totalAmountHeader })).toBeDefined();
    expect(within(table).getByRole("columnheader", { name: t.last30DaysAmountHeader })).toBeDefined();
    expect(within(table).getByRole("columnheader", { name: t.paidPaymentsCountHeader })).toBeDefined();
    expect(within(table).getByText("EGP")).toBeDefined();
    expect(within(table).getByText("120,450.75")).toBeDefined();
    expect(within(table).getByText("15,000.00")).toBeDefined();
    expect(within(table).getByText("512")).toBeDefined();
    expect(within(table).getByText("USD")).toBeDefined();
    expect(within(table).getByText("4,321.50")).toBeDefined();
    expect(within(table).getByText("980.25")).toBeDefined();

    // Offline activations — the honest-separate row below the table.
    expect(screen.getByText(t.offlineActivationsLabel)).toBeDefined();

    // Staleness caption + toolbar, composed over the i18n date helper stamp.
    const stamp = formatApplicantDate(FIXED_ISO, "en");
    expect(screen.getByText(t.lastUpdatedLabel(stamp))).toBeDefined();
    expect(screen.getByRole("button", { name: t.refreshAction })).toBeDefined();

    // Both trend charts titled, both carrying the daily-granularity chip.
    expect(screen.getByText(t.sessionTrendTitle)).toBeDefined();
    expect(screen.getByText(t.revenueTrendTitle)).toBeDefined();
    expect(screen.getAllByText(t.dailyLabel)).toHaveLength(2);

    // The settled output region no longer advertises busy.
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBeNull();
  });

  test("honest-null ratings render an em-dash — never a fabricated zero", async () => {
    renderAnalytics([
      snapshotMock(
        snapshotFixture({
          ratings: {
            averageSessionRating: null,
            sessionRatingsCount: 0,
            averageEvaluationScore: null,
            evaluationScoresCount: 0,
          },
        })
      ),
    ]);

    await waitFor(() => expect(screen.getByText(t.ratingsSection)).toBeDefined());

    // Both nullable averages render the honest placeholder.
    expect(screen.getAllByText(NULL_METRIC_PLACEHOLDER)).toHaveLength(2);
    // Never a fabricated `0`-shaped average or a fabricated currency row.
    expect(screen.queryByText("0.00")).toBeNull();
    // With both rating families empty, the explicit empty-state copy shows.
    expect(screen.getByText(t.noRatingsYet)).toBeDefined();
  });

  test("empty revenue renders the noRevenueYet empty state — never a zero-currency row", async () => {
    renderAnalytics([
      snapshotMock(
        snapshotFixture({
          revenue: {
            offlineActivationsCount: 2,
            gatewayRevenueByCurrency: [],
          },
        })
      ),
    ]);

    await waitFor(() => expect(screen.getByText(t.revenueSection)).toBeDefined());

    expect(screen.getByText(t.noRevenueYet)).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(t.currencyHeader)).toBeNull();
    // The offline-activations row stays honest and separate.
    expect(screen.getByText(t.offlineActivationsLabel)).toBeDefined();
  });

  test("load error renders the inline alert with retry; retry recovers", async () => {
    renderAnalytics([codeErrorMock("INTERNAL_SERVER_ERROR"), snapshotMock(snapshotFixture())]);

    await waitFor(() => expect(screen.getByText(t.loadErrorTitle)).toBeDefined());
    expect(screen.getByText(t.loadErrorBody)).toBeDefined();
    expect(screen.queryByText(t.deniedTitle)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.retryAction }));

    await waitFor(() => expect(screen.getByText("1,000")).toBeDefined());
    expect(screen.queryByText(t.loadErrorTitle)).toBeNull();
    expect(screen.getByRole("table", { name: t.revenueSection })).toBeDefined();
  });

  test("failed initial load keeps the error Alert stable through a re-attempt — never a skeleton flip", async () => {
    // Two failures: the settle state AND the in-flight re-attempt state are
    // both rendered from the same posture a background poll produces when no
    // snapshot exists (loading pulse + settled error, no data to fall back to).
    renderAnalytics([codeErrorMock("INTERNAL_SERVER_ERROR"), codeErrorMock("INTERNAL_SERVER_ERROR", 80)]);

    await waitFor(() => expect(screen.getByText(t.loadErrorTitle)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: t.retryAction }));

    // In-flight: the Alert STAYS on screen (Retry disabled while pending —
    // the in-flight signal) and NO `status`/output skeleton region appears.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t.retryAction }).hasAttribute("disabled")).toBe(true)
    );
    expect(screen.getByText(t.loadErrorTitle)).toBeDefined();
    expect(screen.getByText(t.loadErrorBody)).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();

    // Settled failure again — Alert still up, Retry re-enabled, still no skeleton.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t.retryAction }).hasAttribute("disabled")).toBe(false)
    );
    expect(screen.getByText(t.loadErrorTitle)).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("query-context FORBIDDEN renders the localized denied notice — never the raw message", async () => {
    renderAnalytics([codeErrorMock("FORBIDDEN")]);

    await waitFor(() => expect(screen.getByText(t.deniedTitle)).toBeDefined());
    expect(screen.getByText(t.deniedBody)).toBeDefined();
    // The server `message` text NEVER reaches the DOM.
    expect(screen.queryByText(/masked transport surface/)).toBeNull();
    // A permission denial is not retryable — no retry CTA, refresh disabled.
    expect(screen.queryByRole("button", { name: t.retryAction })).toBeNull();
    expect(screen.getByRole("button", { name: t.refreshAction }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("a FORBIDDEN re-attempt keeps the denied notice latched — never the LoadError/Retry flip", async () => {
    // Poll mechanics: the settled FORBIDDEN is followed by a SNAPSHOTLESS
    // re-attempt that also fails FORBIDDEN (Apollo v4 drops the settled error
    // the moment the re-attempt starts, so the derived denial flips false
    // mid-window). The re-attempt is driven through the client handle the way
    // the 120s poll drives it — no Retry CTA exists to click during denial —
    // mirroring the failed-initial-load stability test's two-mock shape.
    const client = renderAnalyticsWithClient([codeErrorMock("FORBIDDEN"), codeErrorMock("FORBIDDEN", 80)]);

    await waitFor(() => expect(screen.getByText(t.deniedTitle)).toBeDefined());
    expect(screen.queryByRole("button", { name: t.retryAction })).toBeNull();

    // Start the re-attempt; the mocked response settles on an 80ms macrotask,
    // so the act scope exits with the re-attempt still in flight (settled
    // error dropped, no snapshot on screen).
    let reattempt: Promise<unknown> = Promise.resolve();
    await act(async () => {
      reattempt = client.reFetchObservableQueries();
    });

    // Mid-window: the DENIED notice stays — no LoadError, no Retry CTA, no
    // skeleton flip.
    expect(screen.getByText(t.deniedTitle)).toBeDefined();
    expect(screen.queryByText(t.loadErrorTitle)).toBeNull();
    expect(screen.queryByRole("button", { name: t.retryAction })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    // Settled second FORBIDDEN: still the denied notice, still no Retry CTA,
    // refresh still disabled, and the raw message never reached the DOM.
    await act(async () => {
      // errorPolicy "none" rejects the refetch promise on a GraphQL error —
      // the hook still receives the settled FORBIDDEN (asserted below).
      await reattempt.catch(() => undefined);
    });
    expect(screen.getByText(t.deniedTitle)).toBeDefined();
    expect(screen.queryByText(t.loadErrorTitle)).toBeNull();
    expect(screen.queryByRole("button", { name: t.retryAction })).toBeNull();
    expect(screen.getByRole("button", { name: t.refreshAction }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText(/masked transport surface/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();

    // Unmount, then stop the hand-rolled client (MockedProvider's unmount →
    // stop ordering) so the poll interval never outlives the test.
    cleanup();
    client.stop();
  });

  test("manual refresh keeps stale data on screen under the refreshing chip, then swaps in the fresh snapshot", async () => {
    renderAnalytics([
      snapshotMock(snapshotFixture()),
      snapshotMock(
        snapshotFixture({
          generatedAt: REFRESHED_ISO,
          users: { ...BASE_SNAPSHOT.users, totalCount: 1001 },
        }),
        80
      ),
    ]);

    await waitFor(() => expect(screen.getByText("1,000")).toBeDefined());
    expect(screen.queryByText(t.refreshingLabel)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.refreshAction }));

    // In-flight: the refreshing chip appears and the STALE snapshot stays.
    await waitFor(() => expect(screen.getByText(t.refreshingLabel)).toBeDefined());
    expect(screen.getByText("1,000")).toBeDefined();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");

    // Settled: fresh snapshot rendered, chip gone, caption recomposed.
    await waitFor(() => expect(screen.getByText("1,001")).toBeDefined());
    expect(screen.queryByText(t.refreshingLabel)).toBeNull();
    expect(screen.getByText(t.lastUpdatedLabel(formatApplicantDate(REFRESHED_ISO, "en")))).toBeDefined();
  });

  test("initial load keeps the Refresh CTA disabled until a snapshot exists", async () => {
    renderAnalytics([snapshotMock(snapshotFixture(), 60)]);

    const refresh = screen.getByRole("button", { name: t.refreshAction });
    expect(refresh.hasAttribute("disabled")).toBe(true);

    await waitFor(() => expect(screen.getByText("1,000")).toBeDefined());
    expect(screen.getByRole("button", { name: t.refreshAction }).hasAttribute("disabled")).toBe(false);
  });
});

// ─── Suite (ar / RTL) ───────────────────────────────────────────────────────

describe("PlatformAnalyticsContainer (ar / RTL)", () => {
  test("renders the Arabic labels through the same handle over the RTL provider stack", async () => {
    renderAnalyticsRtl([snapshotMock(snapshotFixture())]);

    await waitFor(() => expect(screen.getByText(tar.usersTotalLabel)).toBeDefined());
    expect(screen.getByRole("heading", { level: 1, name: tar.title })).toBeDefined();
    expect(screen.getByText(tar.subtitle)).toBeDefined();
    expect(screen.getByText(tar.usersSection)).toBeDefined();
    expect(screen.getByText(tar.revenueSection)).toBeDefined();
    expect(screen.getByText(tar.ratingsSection)).toBeDefined();
    expect(screen.getByRole("button", { name: tar.refreshAction })).toBeDefined();
    expect(screen.getByText(tar.lastUpdatedLabel(formatApplicantDate(FIXED_ISO, "ar")))).toBeDefined();
    // The revenue table still renders the wire currency codes verbatim.
    expect(within(screen.getByRole("table", { name: tar.revenueSection })).getByText("EGP")).toBeDefined();
  });
});
