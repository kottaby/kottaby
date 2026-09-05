/**
 * Platform-analytics CSV export — builder suite (PURE unit tier).
 *
 * Covers the serialization contract of `buildPlatformAnalyticsCsv` and
 * `platformAnalyticsCsvFilename`:
 *
 *   BOM + generated-at metadata line · localized metrics table with raw
 *   counts · honest-null rating averages serialize as EMPTY cells · money
 *   decimal strings stay verbatim (never parsed/grouped) · empty revenue
 *   currency table omitted entirely · CSV escaping of delimiter/quote
 *   carrying labels · filename derivation from the coherence stamp.
 *
 * Labels resolve from the en/ar leaf maps directly (the same objects the
 * namespace composes) — ZERO hardcoded copy in assertions; the exception
 * class is fixture DATA (numbers, ISO stamps, currency codes) and the
 * DELIBERATELY hostile synthetic label used by the escaping case.
 *
 * Pure unit tier — NO DOM, NO server boot, NO network, NO DB. Runs via the
 * mandated runner: `bun run test/scripts/run-test.ts test/ui/components/admin/platform-analytics-csv.test.ts`
 */

import { describe, expect, test } from "bun:test";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics } from "@/frontend/graphql/generated/gql/graphql";
import {
  buildPlatformAnalyticsCsv,
  platformAnalyticsCsvFilename,
} from "@/frontend/views/admin/analytics/platform-analytics-csv";
import { analyticsAr } from "@/shared/locale/ar/analytics";
import { analyticsEn } from "@/shared/locale/en/analytics";

/** Full coherent snapshot fixture (aggregate values — fixture data class). */
function snapshotFixture(): AdminPlatformAnalyticsQuery_adminPlatformAnalytics {
  return {
    generatedAt: "2026-09-05T10:07:08.000Z",
    users: {
      totalCount: 42,
      activeCount: 40,
      suspendedCount: 1,
      blockedCount: 0,
      deletedCount: 1,
      adminsCount: 1,
      teachersCount: 2,
      studentsCount: 30,
      parentsCount: 9,
      newThisWeekCount: 6,
      recentlyActive24h: 11,
    },
    sessions: {
      total: 120,
      today: 3,
      thisWeek: 25,
      thisMonth: 90,
      scheduled: 10,
      started: 100,
      completed: 80,
      cancelled: 9,
      disputed: 1,
      awaitingConfirmation: 7,
    },
    revenue: {
      offlineActivationsCount: 4,
      gatewayRevenueByCurrency: [
        { currency: "EGP", totalAmount: "12500.50", last30DaysAmount: "1250.25", paidPaymentsCount: 12 },
        { currency: "USD", totalAmount: "90.00", last30DaysAmount: "0.00", paidPaymentsCount: 2 },
      ],
    },
    subscriptions: {
      total: 35,
      active: 28,
      pending: 2,
      expired: 3,
      cancelled: 1,
      suspended: 1,
      activeInWindowNow: 27,
    },
    teachers: { certifiedCount: 1, evaluatorCount: 1, onlineNowCount: 2 },
    ratings: {
      averageSessionRating: null,
      sessionRatingsCount: 0,
      averageEvaluationScore: 4.25,
      evaluationScoresCount: 8,
    },
    health: { pendingDisputes: 1, pendingWithdrawals: 0 },
    sessionTrendDaily: [
      { bucketStart: "2026-09-04", sessionCount: 5 },
      { bucketStart: "2026-09-05", sessionCount: 3 },
    ],
    revenueTrendDaily: [{ bucketStart: "2026-09-05", currency: "EGP", amount: "250.50" }],
  };
}

describe("platform-analytics CSV builder", () => {
  test("prefixes a UTF-8 BOM and leads with the generated-at metadata line", () => {
    const csv = buildPlatformAnalyticsCsv(snapshotFixture(), analyticsEn);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const withoutBom = csv.slice(1);
    const firstRecord = withoutBom.slice(0, withoutBom.indexOf("\n"));
    expect(firstRecord).toBe(`Generated at (UTC),2026-09-05T10:07:08.000Z`);
  });

  test("metrics table carries localized labels with raw locale-neutral counts", () => {
    const csv = buildPlatformAnalyticsCsv(snapshotFixture(), analyticsEn);
    expect(csv).toContain(`Users,Total users,42`);
    expect(csv).toContain(`Operational Health,Pending disputes,1`);
    // The Arabic labels round-trip through the SAME builder (locale comes from labels only).
    const csvAr = buildPlatformAnalyticsCsv(snapshotFixture(), analyticsAr);
    expect(csvAr).toContain(`المستخدمون,إجمالي المستخدمين,42`);
  });

  test("honest-null rating averages serialize as EMPTY cells (never 0, never —)", () => {
    const csv = buildPlatformAnalyticsCsv(snapshotFixture(), analyticsEn);
    expect(csv).toContain(`Ratings,Average session rating,`);
    expect(csv).toContain(`Ratings,Average session rating,\n`);
    expect(csv).not.toContain(`Ratings,Average session rating,0`);
    expect(csv).not.toContain(`Ratings,Average session rating,—`);
  });

  test("money decimal strings stay verbatim — never parsed, never grouped", () => {
    const csv = buildPlatformAnalyticsCsv(snapshotFixture(), analyticsEn);
    expect(csv).toContain(`EGP,12500.50,1250.25,12`);
    expect(csv).toContain(`USD,90.00,0.00,2`);
    expect(csv).not.toContain("12,500");
  });

  test("empty per-currency revenue table omits the currency block entirely", () => {
    const snapshot = snapshotFixture();
    snapshot.revenue.gatewayRevenueByCurrency = [];
    const csv = buildPlatformAnalyticsCsv(snapshot, analyticsEn);
    expect(csv).not.toContain(`Currency,Lifetime total`);
    // The offline activations metric row is unaffected.
    expect(csv).toContain(`Revenue,Offline activations,4`);
  });

  test("trend series render with the localized axis/series headers and raw rows", () => {
    const csv = buildPlatformAnalyticsCsv(snapshotFixture(), analyticsEn);
    expect(csv).toContain(`Date (UTC),Sessions\n2026-09-04,5\n2026-09-05,3`);
    expect(csv).toContain(`Date (UTC),Currency,Amount\n2026-09-05,EGP,250.50`);
  });

  test("escapes delimiter- and quote-carrying labels per RFC-4180", () => {
    const hostileLabels = {
      ...analyticsEn,
      csvSectionHeader: `Section, "the" edition`,
    };
    const csv = buildPlatformAnalyticsCsv(snapshotFixture(), hostileLabels);
    const escapedHeader = `"Section, ""the"" edition"`;
    expect(csv).toContain(escapedHeader);
  });

  test("filename derives from the coherence stamp at UTC minute precision", () => {
    expect(platformAnalyticsCsvFilename("2026-09-05T10:07:08.000Z")).toBe("platform-analytics-2026-09-05-1007.csv");
    // Unparseable stamps fall back to the wall clock — always a real timestamp.
    const fallback = platformAnalyticsCsvFilename("not-a-timestamp", new Date("2026-01-02T03:04:05.000Z"));
    expect(fallback).toBe("platform-analytics-2026-01-02-0304.csv");
  });
});
