/**
 * AdminDisputeAnalyticsCard — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `AdminDisputeAnalyticsCard.test.tsx` (the same two-phase Happy-DOM
 * bootstrap the disputes-family entries use — see that file for WHY).
 *
 * Happy DOM tier (no wire at all — the card is pure presentation over its
 * settled props), driven across BOTH locales:
 *
 *   the error contract (hasError ⇒ renders NOTHING — the card is
 *   supplementary by definition and never paints a fabricated snapshot
 *   next to a working queue) · the loading skeleton · the settled
 *   snapshot (open/resolved stat values + the FULL five-member outcome
 *   vocabulary with honest zero counts) · the label contract (every
 *   localized string flows from the preloaded Sessions labels — zero
 *   hardcoded copy).
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` (Sessions
 * namespace) — ZERO hardcoded Arabic/English copy lives here. The
 * exception class is fixture DATA (numeric counts, enum member names in
 * testids). No `console.*`, no `any`, no `.skip(`/`test.only(` markers.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import type { AdminDisputeAnalyticsQuery_adminDisputeAnalytics } from "@/frontend/graphql/generated/gql/graphql";
import { AdminDisputeAnalyticsCard } from "@/frontend/views/admin/disputes/AdminDisputeAnalyticsCard";
import type { AppLocale } from "@/shared/locale/AppLocale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";
import { componentSuiteLocales, liveScreen, renderWithMocks, sessionSuiteLabels } from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** Deterministic mixed snapshot (DATA). */
const MIXED_SNAPSHOT: AdminDisputeAnalyticsQuery_adminDisputeAnalytics = {
  openDisputes: 3,
  resolvedDisputes: 12,
  cancelCount: 2,
  completeCount: 1,
  refundCount: 4,
  partialRefundCount: 5,
  upholdCount: 0,
};

/** Deterministic all-zero snapshot — the honest empty state (DATA). */
const ZERO_SNAPSHOT: AdminDisputeAnalyticsQuery_adminDisputeAnalytics = {
  openDisputes: 0,
  resolvedDisputes: 0,
  cancelCount: 0,
  completeCount: 0,
  refundCount: 0,
  partialRefundCount: 0,
  upholdCount: 0,
};

/** The five outcome testids in canonical enum order (vocabulary-stability pin). */
const OUTCOME_TESTIDS = [
  "admin-dispute-analytics-outcome-Cancel",
  "admin-dispute-analytics-outcome-Complete",
  "admin-dispute-analytics-outcome-Refund",
  "admin-dispute-analytics-outcome-PartialRefund",
  "admin-dispute-analytics-outcome-Uphold",
] as const;

// ---------------------------------------------------------------------------
// Render helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

function renderCard(
  analytics: AdminDisputeAnalyticsQuery_adminDisputeAnalytics | null | undefined,
  loading: boolean,
  hasError: boolean,
  t: SessionsLabels,
  locale: AppLocale
): void {
  renderWithMocks(
    <AdminDisputeAnalyticsCard analytics={analytics} loading={loading} hasError={hasError} t={t} />,
    [],
    locale
  );
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the full branch
// matrix (STUI_LOCALE split-run guard, shared with the sibling suites).
for (const locale of componentSuiteLocales) {
  const { t } = sessionSuiteLabels(locale);

  describe(`AdminDisputeAnalyticsCard (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("error contract: a failed snapshot query renders NOTHING (no fabricated zeros)", () => {
      renderCard(MIXED_SNAPSHOT, false, true, t, locale);

      expect(screen.queryByTestId("admin-dispute-analytics")).toBeNull();
      expect(screen.queryByTestId("admin-dispute-analytics-loading")).toBeNull();
      expect(screen.queryByTestId("admin-dispute-analytics-open")).toBeNull();
      expect(screen.queryByTestId("admin-dispute-analytics-resolved")).toBeNull();
    });

    test("loading contract: the skeleton renders and the settled snapshot does not", () => {
      renderCard(null, true, false, t, locale);

      expect(screen.getByTestId("admin-dispute-analytics-loading")).toBeDefined();
      expect(screen.queryByTestId("admin-dispute-analytics")).toBeNull();
    });

    test("settled snapshot: the title, both stat values, and the FULL five-member outcome vocabulary render", () => {
      renderCard(MIXED_SNAPSHOT, false, false, t, locale);

      expect(screen.getByTestId("admin-dispute-analytics")).toBeDefined();
      expect(screen.getByTestId("admin-dispute-analytics").textContent).toContain(t.adminDisputeAnalyticsTitle);
      expect(screen.getByTestId("admin-dispute-analytics-open").textContent).toContain(t.adminDisputeAnalyticsOpen);
      expect(screen.getByTestId("admin-dispute-analytics-resolved").textContent).toContain(
        t.adminDisputeAnalyticsResolved
      );

      // Every outcome chip renders — zero is a legitimate analytic state,
      // and the full vocabulary is the point of the snapshot.
      for (const testid of OUTCOME_TESTIDS) {
        expect(screen.getByTestId(testid)).toBeDefined();
      }
      expect(screen.getByTestId("admin-dispute-analytics-outcome-Cancel").textContent).toContain("2");
      expect(screen.getByTestId("admin-dispute-analytics-outcome-Complete").textContent).toContain("1");
      expect(screen.getByTestId("admin-dispute-analytics-outcome-Refund").textContent).toContain("4");
      expect(screen.getByTestId("admin-dispute-analytics-outcome-PartialRefund").textContent).toContain("5");
      expect(screen.getByTestId("admin-dispute-analytics-outcome-Uphold").textContent).toContain("0");

      // The section heading rides the localized labels.
      expect(screen.getByTestId("admin-dispute-analytics").textContent).toContain(t.adminDisputeAnalyticsOutcomes);
      // The chip labels come from the preloaded outcome vocabulary.
      expect(screen.getByTestId("admin-dispute-analytics-outcome-Cancel").textContent).toContain(t.outcomeCancel);
      expect(screen.getByTestId("admin-dispute-analytics-outcome-Uphold").textContent).toContain(t.outcomeUphold);
    });

    test("all-zero snapshot: every value renders as an honest zero (the empty analytics state)", () => {
      renderCard(ZERO_SNAPSHOT, false, false, t, locale);

      expect(screen.getByTestId("admin-dispute-analytics-open").textContent).toContain("0");
      expect(screen.getByTestId("admin-dispute-analytics-resolved").textContent).toContain("0");
      for (const testid of OUTCOME_TESTIDS) {
        expect(screen.getByTestId(testid).textContent).toContain("0");
      }
    });
  });
}
