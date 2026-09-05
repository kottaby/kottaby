/**
 * `analytics`-namespace locale-parity verification
 * · ar+en parity gate + last-updated function pin + registry wiring.
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `analytics` leaf maps expose
 *      IDENTICAL key sets where every STRING slot is non-empty and every
 *      FUNCTION slot is present (belt #2: the PRIMARY parity gate is
 *      compile-time typing where BOTH leaf consts are typed
 *      `AnalyticsLabels`; any missing key fails `bun tsgo`. This suite
 *      keeps the guarantee enforced even if someone loosens that typing
 *      later).
 *   2. MANDATED CONTENT — every key required by the platform-analytics
 *      surface (metadata + page title/subtitle, the SEVEN section titles,
 *      every metric label incl. `recentlyActive24hLabel`,
 *      `awaitingConfirmationLabel`, `offlineActivationsLabel`, the
 *      per-currency table headers, `noRevenueYet`, `noRatingsYet`, the
 *      trend chart titles + series/axis labels, refresh + staleness
 *      captions, and the error/denied/retry copy) exists on BOTH maps — a
 *      key deleted from both maps simultaneously still fails this suite.
 *   3. NO ENGLISH FALLTHROUGH — every ar STRING slot contains Arabic script
 *      (an accidentally English value in the ar map fails the sweep).
 *   4. TEMPLATE PIN — `lastUpdatedLabel` (the namespace's single function
 *      leaf) expands its pre-formatted timestamp argument into the returned
 *      message in BOTH locales.
 *   5. REGISTRY WIRING — the `Analytics` handle is registered in
 *      `shared/locale/namespaces/index.ts` with the conventional
 *      `<ns>.<ns>` id and its getter resolves the composed bundle slice.
 *
 * Mirrors the structure of `shared/locale/notifications-namespace.parity.test.ts`
 * (the sibling namespace gate), scaled to this namespace's single
 * function-valued slot (`lastUpdatedLabel`).
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

// ─── Mandated key inventory (the platform-analytics surface ground truth) ───

/** Every key the platform-analytics UI namespace must carry (71 slots). */
const MANDATED_KEYS = [
  // Metadata + page heading
  "metaTitle",
  "metaDescription",
  "title",
  "subtitle",
  // Section titles (one per metric card)
  "usersSection",
  "sessionsSection",
  "revenueSection",
  "subscriptionsSection",
  "teachersSection",
  "ratingsSection",
  "healthSection",
  // Users metric labels
  "usersTotalLabel",
  "usersActiveLabel",
  "usersSuspendedLabel",
  "usersBlockedLabel",
  "usersDeletedLabel",
  "usersAdminsLabel",
  "usersTeachersLabel",
  "usersStudentsLabel",
  "usersParentsLabel",
  "usersNewThisWeekLabel",
  "recentlyActive24hLabel",
  // Sessions metric labels
  "sessionsTotalLabel",
  "sessionsTodayLabel",
  "sessionsThisWeekLabel",
  "sessionsThisMonthLabel",
  "sessionsScheduledLabel",
  "sessionsStartedLabel",
  "sessionsCompletedLabel",
  "sessionsCancelledLabel",
  "sessionsDisputedLabel",
  "awaitingConfirmationLabel",
  // Revenue labels
  "offlineActivationsLabel",
  "currencyHeader",
  "totalAmountHeader",
  "last30DaysAmountHeader",
  "paidPaymentsCountHeader",
  "noRevenueYet",
  // Subscriptions metric labels
  "subscriptionsTotalLabel",
  "subscriptionsActiveLabel",
  "subscriptionsPendingLabel",
  "subscriptionsExpiredLabel",
  "subscriptionsCancelledLabel",
  "subscriptionsSuspendedLabel",
  "activeInWindowNowLabel",
  // Teachers metric labels
  "teachersCertifiedLabel",
  "teachersEvaluatorsLabel",
  "teachersOnlineNowLabel",
  // Ratings labels
  "averageSessionRatingLabel",
  "sessionRatingsCountLabel",
  "averageEvaluationScoreLabel",
  "evaluationScoresCountLabel",
  "noRatingsYet",
  // Health metric labels
  "pendingDisputesLabel",
  "pendingWithdrawalsLabel",
  // Trend charts
  "sessionTrendTitle",
  "revenueTrendTitle",
  "sessionsSeriesLabel",
  "revenueSeriesLabel",
  "dailyLabel",
  "trendDateAxisLabel",
  "trendCountAxisLabel",
  "trendAmountAxisLabel",
  // Refresh + staleness
  "refreshAction",
  "refreshingLabel",
  "lastUpdatedLabel",
  // Error / denied / retry states
  "loadErrorTitle",
  "loadErrorBody",
  "deniedTitle",
  "deniedBody",
  "retryAction",
] as const;

/** The single function-valued slot (the staleness caption template). */
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

/**
 * Sample arguments per function slot, per locale — used by the callable pin
 * and the Arabic-flavored function-slot sweep (NOT by the exact-string pins).
 */
const FUNCTION_SLOT_SAMPLE_ARGS: Record<
  (typeof FUNCTION_KEYS)[number],
  { en: readonly unknown[]; ar: readonly unknown[] }
> = {
  lastUpdatedLabel: { en: ["14:32 UTC"], ar: ["14:32 بتوقيت UTC"] },
};

/** Invokes one function slot with sample args — throws if the slot is not callable or returns a non-string. */
function callFunctionSlot(localeMap: object, key: string, args: readonly unknown[], localeName: string): string {
  const value: unknown = Reflect.get(localeMap, key);
  if (typeof value !== "function") {
    throw new Error(`analytics.${localeName}.${key} must be a function`);
  }
  const result: unknown = Reflect.apply(value, undefined, args);
  if (typeof result !== "string") {
    throw new Error(`analytics.${localeName}.${key} must return a string`);
  }
  return result;
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

  test("the prompt-mandated surface keys are present verbatim (REQ-066 minimum)", () => {
    for (const key of [
      "metaTitle",
      "metaDescription",
      "title",
      "subtitle",
      "usersSection",
      "sessionsSection",
      "revenueSection",
      "subscriptionsSection",
      "teachersSection",
      "ratingsSection",
      "healthSection",
      "recentlyActive24hLabel",
      "awaitingConfirmationLabel",
      "offlineActivationsLabel",
      "currencyHeader",
      "totalAmountHeader",
      "last30DaysAmountHeader",
      "paidPaymentsCountHeader",
      "noRevenueYet",
      "noRatingsYet",
      "sessionTrendTitle",
      "revenueTrendTitle",
      "sessionsSeriesLabel",
      "dailyLabel",
      "refreshAction",
      "refreshingLabel",
      "lastUpdatedLabel",
      "loadErrorTitle",
      "loadErrorBody",
      "deniedTitle",
      "deniedBody",
      "retryAction",
    ] as const) {
      expect((MANDATED_KEYS as readonly string[]).includes(key)).toBe(true);
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

  test("the ar FUNCTION slot returns Arabic-script output for Arabic-flavored arguments", () => {
    for (const key of FUNCTION_KEYS) {
      expect(ARABIC_SCRIPT.test(callFunctionSlot(analyticsAr, key, FUNCTION_SLOT_SAMPLE_ARGS[key].ar, "ar"))).toBe(
        true
      );
    }
  });
});

// ===========================================================================
describe("template pin — the staleness caption expands its timestamp argument", () => {
  test("lastUpdatedLabel embeds the pre-formatted timestamp in BOTH locales", () => {
    expect(analyticsEn.lastUpdatedLabel("14:32 UTC")).toContain("14:32 UTC");
    expect(analyticsAr.lastUpdatedLabel("14:32 بتوقيت UTC")).toContain("14:32 بتوقيت UTC");
    expect(analyticsEn.lastUpdatedLabel("14:32 UTC")).toBe("Last updated 14:32 UTC");
    expect(analyticsAr.lastUpdatedLabel("14:32 بتوقيت UTC")).toBe("آخر تحديث 14:32 بتوقيت UTC");
  });

  test("every function slot is callable with non-empty output in BOTH locales", () => {
    for (const key of FUNCTION_KEYS) {
      const args = FUNCTION_SLOT_SAMPLE_ARGS[key];
      expect(callFunctionSlot(analyticsEn, key, args.en, "en").length).toBeGreaterThan(0);
      expect(callFunctionSlot(analyticsAr, key, args.ar, "ar").length).toBeGreaterThan(0);
    }
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
