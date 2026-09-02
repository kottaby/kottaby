/**
 * `analytics`-namespace locale-parity verification
 * · ar+en parity gate + function-leaf pins + registry wiring.
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `analytics` leaf maps expose
 *      IDENTICAL key sets where every STRING slot is non-empty and the
 *      FUNCTION slot is present (belt #2: the PRIMARY parity gate is
 *      compile-time typing where BOTH leaf consts are typed
 *      `AnalyticsLabels`; any missing key fails `bun tsgo`. This suite
 *      keeps the guarantee enforced even if someone loosens that typing
 *      later).
 *   2. MANDATED CONTENT — every key required by the analytics dashboard
 *      surface (meta title/description, page title/subtitle, SEVEN section
 *      titles, section-qualified metric labels for all seven sections,
 *      per-currency table headers, trend chart titles + axis/series labels
 *      + chart aria-labels (review finding F-1), refresh affordances,
 *      honest-empty copy, load-error + denied states) exists on BOTH maps —
 *      a key deleted from both maps simultaneously still fails this suite.
 *   3. NO ENGLISH FALLTHROUGH — every ar STRING slot contains Arabic script
 *      (an accidentally English value in the ar map fails the sweep).
 *   4. FUNCTION-LEAF PIN — `lastUpdatedLabel` composes over the
 *      pre-formatted instant argument in BOTH locales (interpolation
 *      discipline: no user-supplied content, one pre-formatted string in).
 *   5. REGISTRY WIRING — the `Analytics` handle is registered in
 *      `shared/locale/namespaces/index.ts` with the conventional
 *      `<ns>.<ns>` id and its getter resolves the composed bundle slice.
 *
 * Mirrors `shared/locale/notifications-namespace.parity.test.ts` (the
 * sibling namespace gate).
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/analytics-namespace.parity.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { analyticsAr } from "@/shared/locale/ar/analytics";
import { arMessages } from "@/shared/locale/ar/messages";
import { analyticsEn } from "@/shared/locale/en/analytics";
import { enMessages } from "@/shared/locale/en/messages";
import { Analytics } from "@/shared/locale/namespaces/analytics";
import { namespaces } from "@/shared/locale/namespaces/index";

// ─── Mandated key inventory (the analytics surface ground truth) ────────────

/** Every key the analytics UI namespace must carry (71 slots). */
const MANDATED_KEYS = [
  // Metadata + header
  "metaTitle",
  "metaDescription",
  "title",
  "subtitle",
  // Section titles
  "usersSection",
  "sessionsSection",
  "revenueSection",
  "subscriptionsSection",
  "teachersSection",
  "ratingsSection",
  "healthSection",
  // Users counters
  "totalUsersLabel",
  "activeUsersLabel",
  "suspendedUsersLabel",
  "blockedUsersLabel",
  "deletedUsersLabel",
  "adminsCountLabel",
  "teachersCountLabel",
  "studentsCountLabel",
  "parentsCountLabel",
  "newThisWeekUsersLabel",
  "recentlyActive24hLabel",
  // Sessions counters
  "totalSessionsLabel",
  "sessionsTodayLabel",
  "sessionsThisWeekLabel",
  "sessionsThisMonthLabel",
  "scheduledSessionsLabel",
  "startedSessionsLabel",
  "completedSessionsLabel",
  "cancelledSessionsLabel",
  "disputedSessionsLabel",
  "awaitingConfirmationLabel",
  // Revenue
  "currencyHeader",
  "totalAmountHeader",
  "last30DaysAmountHeader",
  "paidPaymentsCountHeader",
  "offlineActivationsLabel",
  // Subscriptions counters
  "totalSubscriptionsLabel",
  "activeSubscriptionsLabel",
  "pendingSubscriptionsLabel",
  "expiredSubscriptionsLabel",
  "cancelledSubscriptionsLabel",
  "suspendedSubscriptionsLabel",
  "activeInWindowNowLabel",
  // Teachers
  "certifiedTeachersLabel",
  "evaluatorTeachersLabel",
  "teachersOnlineNowLabel",
  // Ratings
  "averageSessionRatingLabel",
  "sessionRatingsCountLabel",
  "averageEvaluationScoreLabel",
  "evaluationScoresCountLabel",
  // Health
  "pendingDisputesLabel",
  "pendingWithdrawalsLabel",
  // Trends
  "sessionTrendTitle",
  "revenueTrendTitle",
  "dailyLabel",
  "dateAxisLabel",
  "amountAxisLabel",
  "sessionsSeriesLabel",
  "sessionTrendAriaLabel",
  "revenueTrendAriaLabel",
  // Empty states
  "noRevenueYet",
  "noRatingsYet",
  // Actions
  "refreshAction",
  "refreshingLabel",
  "lastUpdatedLabel",
  "retryAction",
  // Error + denied states
  "loadErrorTitle",
  "loadErrorBody",
  "deniedTitle",
  "deniedBody",
] as const;

/** The sole function-valued slot (pre-formatted-instant composition). */
const FUNCTION_KEYS = ["lastUpdatedLabel"] as const;

/** Arabic-script probe — at least one Arabic-block character in the value. */
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/** Reads one non-empty-string value slot off a locale map — throws otherwise. */
function stringSlotOf(localeMap: object, key: string, localeName: string): string {
  const value: unknown = Reflect.get(localeMap, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`analytics.${localeName}.${key} must be a non-empty localized string`);
  }
  return value;
}

// ===========================================================================
describe("compile-time parity mirror — ar/en key sets agree", () => {
  test("identical sorted key sets across BOTH locale sources", () => {
    const arKeys = Object.keys(analyticsAr).toSorted((a, b) => a.localeCompare(b));
    const enKeys = Object.keys(analyticsEn).toSorted((a, b) => a.localeCompare(b));

    expect(arKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(arKeys);
  });

  test("every value on BOTH maps is a non-empty string or a function (zero dead keys)", () => {
    for (const key of Object.keys(analyticsAr)) {
      const arValue: unknown = Reflect.get(analyticsAr, key);
      const enValue: unknown = Reflect.get(analyticsEn, key);
      expect(typeof arValue === "string" || typeof arValue === "function").toBe(true);
      expect(typeof enValue === "string" || typeof enValue === "function").toBe(true);
      if (typeof arValue === "string") {
        expect(arValue.length).toBeGreaterThan(0);
        expect(stringSlotOf(analyticsEn, key, "en").length).toBeGreaterThan(0);
      }
    }
    // Symmetric sweep — guards an en-only key that ar lost via future drift.
    for (const key of Object.keys(analyticsEn)) {
      const enValue: unknown = Reflect.get(analyticsEn, key);
      if (typeof enValue === "string") {
        expect(stringSlotOf(analyticsAr, key, "ar").length).toBeGreaterThan(0);
      }
    }
  });

  test.each([...MANDATED_KEYS])("mandated key `%s` exists on BOTH maps", key => {
    expect(Object.hasOwn(analyticsAr, key)).toBe(true);
    expect(Object.hasOwn(analyticsEn, key)).toBe(true);
  });

  test("the mandated inventory is exhaustive (no silent key minting beyond the 71 slots)", () => {
    const mandated = new Set<string>(MANDATED_KEYS);
    for (const key of Object.keys(analyticsAr)) {
      expect(mandated.has(key)).toBe(true);
    }
  });
});

// ===========================================================================
describe("no English fallthrough — ar map carries Arabic copy for every string slot", () => {
  test("every ar STRING slot contains Arabic script", () => {
    for (const key of Object.keys(analyticsAr)) {
      const value: unknown = Reflect.get(analyticsAr, key);
      if (typeof value === "string") {
        expect(ARABIC_SCRIPT.test(value)).toBe(true);
      }
    }
  });

  test("the ar FUNCTION slot returns Arabic-script output for an Arabic-flavored argument", () => {
    const arStamp = "١٢:٣٠";
    expect(ARABIC_SCRIPT.test(analyticsAr.lastUpdatedLabel(arStamp))).toBe(true);
  });
});

// ===========================================================================
describe("function-leaf pin — lastUpdatedLabel composes over the pre-formatted stamp", () => {
  test("embeds the formatted instant in BOTH locales", () => {
    expect(analyticsEn.lastUpdatedLabel("12:30")).toBe("Last updated at 12:30");
    expect(analyticsAr.lastUpdatedLabel("12:30")).toContain("12:30");
  });

  test("both locales produce non-empty output for any pre-formatted stamp", () => {
    expect(analyticsEn.lastUpdatedLabel("2026-01-01 00:00").length).toBeGreaterThan(0);
    expect(analyticsAr.lastUpdatedLabel("2026-01-01 00:00").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
describe("registry + bundle wiring", () => {
  test("namespaces registry exposes the Analytics handle with the `<ns>.<ns>` id convention", () => {
    expect(Object.hasOwn(namespaces, "Analytics")).toBe(true);
    expect(Analytics.id).toBe("analytics.analytics");
  });

  test("handle getter resolves the composed bundle slice (both locales)", () => {
    expect(Analytics.getLabels(enMessages)).toBe(enMessages.analyticsTranslations);
    expect(Analytics.getLabels(arMessages)).toBe(arMessages.analyticsTranslations);
  });

  test("`analyticsTranslations` exists on BOTH message bundles", () => {
    expect(Object.hasOwn(enMessages, "analyticsTranslations")).toBe(true);
    expect(Object.hasOwn(arMessages, "analyticsTranslations")).toBe(true);
  });

  test("the bundle slice IS the leaf map (no re-wrapper indirection) in BOTH locales", () => {
    expect(enMessages.analyticsTranslations).toBe(analyticsEn);
    expect(arMessages.analyticsTranslations).toBe(analyticsAr);
  });
});

// ===========================================================================
describe("function-slot inventory — exactly the one locale function, on BOTH maps", () => {
  test.each([...FUNCTION_KEYS])("slot `%s` is a function on BOTH maps", key => {
    expect(typeof Reflect.get(analyticsAr, key)).toBe("function");
    expect(typeof Reflect.get(analyticsEn, key)).toBe("function");
  });

  test("no OTHER slot is function-valued (string/function split is stable)", () => {
    for (const key of Object.keys(analyticsEn)) {
      const isFunction = typeof Reflect.get(analyticsEn, key) === "function";
      expect(isFunction).toBe((FUNCTION_KEYS as readonly string[]).includes(key));
    }
  });
});
