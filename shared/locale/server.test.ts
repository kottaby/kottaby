/**
 * Server-side translation loader suite for `shared/locale/server.ts`.
 *
 * WHAT THIS LOCKS
 *   1. HAPPY PATH LOCALE RESOLUTION — `getTranslations("ar")` returns Arabic message catalog
 *      (`arMessages`) and `getTranslations("en")` returns English message catalog (`enMessages`).
 *   2. FALLBACK LOCALE RESOLUTION — Any unsupported, empty, whitespace-only, wrong-case,
 *      or invalid locale string falls back gracefully to `defaultLocale` ("ar" -> `arMessages`).
 *   3. DEFAULT TRANSLATIONS CONTRACT — `getDefaultTranslations()` always resolves `arMessages`
 *      matching the system default locale.
 *   4. LOAD ALL TRANSLATIONS ALIAS — `loadAllTranslations(locale)` delegates directly to
 *      `getTranslations(locale)` for both valid and fallback locale inputs.
 *   5. DETERMINISM & REFERENCE EQUALITY — Pure loader returns identical object references on
 *      repeated invocations without mutating or re-instantiating catalog trees.
 *   6. CATALOG INTEGRITY & NAMESPACE DIVERGENCE — Resolved translation trees expose all required
 *      schema namespaces (e.g., `errorsTranslations`, `commonTranslations`, `authTranslations`)
 *      and distinct localized values across languages.
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/server.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { defaultLocale } from "@/shared/locale/AppLocale";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import {
  getDefaultTranslations,
  getTranslations,
  loadAllTranslations,
} from "@/shared/locale/server";

describe("getTranslations — happy path supported locales", () => {
  test("returns arMessages when requested locale is 'ar'", () => {
    const translations = getTranslations("ar");
    expect(translations).toBe(arMessages);
  });

  test("returns enMessages when requested locale is 'en'", () => {
    const translations = getTranslations("en");
    expect(translations).toBe(enMessages);
  });
});

describe("getTranslations — fallback for invalid/unsupported locale inputs", () => {
  const UNSUPPORTED_LOCALES = [
    ["unsupported language code", "fr"],
    ["another unsupported language code", "es"],
    ["empty string", ""],
    ["arbitrary text", "invalid-locale"],
    ["numeric string", "123"],
    ["uppercase valid locale", "EN"],
    ["capitalized valid locale", "Ar"],
    ["padded valid locale with spaces", " en "],
    ["tab padded valid locale", "\tar\n"],
    ["stringified null", String(null)],
    ["stringified undefined", String(undefined)],
  ] as const;

  test.each(UNSUPPORTED_LOCALES)(
    "falls back to defaultLocale (arMessages) for %s: %j",
    (_label, locale) => {
      const translations = getTranslations(locale);
      expect(translations).toBe(arMessages);
    }
  );
});

describe("getDefaultTranslations — default locale contract", () => {
  test("returns arMessages matching defaultLocale ('ar')", () => {
    expect(defaultLocale).toBe("ar");
    const defaultTranslations = getDefaultTranslations();
    expect(defaultTranslations).toBe(arMessages);
  });
});

describe("loadAllTranslations — delegation contract", () => {
  test("delegates to getTranslations for supported locale 'en'", () => {
    const result = loadAllTranslations("en");
    expect(result).toBe(getTranslations("en"));
    expect(result).toBe(enMessages);
  });

  test("delegates to getTranslations for supported locale 'ar'", () => {
    const result = loadAllTranslations("ar");
    expect(result).toBe(getTranslations("ar"));
    expect(result).toBe(arMessages);
  });

  test("delegates to getTranslations for unsupported locale", () => {
    const result = loadAllTranslations("de");
    expect(result).toBe(getTranslations("de"));
    expect(result).toBe(arMessages);
  });
});

describe("determinism and reference equality", () => {
  test("repeated getTranslations calls with same locale return same object reference", () => {
    const firstEn = getTranslations("en");
    const secondEn = getTranslations("en");
    expect(firstEn).toBe(secondEn);

    const firstAr = getTranslations("ar");
    const secondAr = getTranslations("ar");
    expect(firstAr).toBe(secondAr);
  });

  test("getDefaultTranslations returns same object reference as getTranslations(defaultLocale)", () => {
    expect(getDefaultTranslations()).toBe(getTranslations(defaultLocale));
  });
});

describe("catalog integrity and localized namespace divergence", () => {
  test("returned catalog contains all required message namespaces", () => {
    const catalog = getTranslations("en");

    expect(catalog.commonTranslations).toBeDefined();
    expect(catalog.authTranslations).toBeDefined();
    expect(catalog.errorsTranslations).toBeDefined();
    expect(catalog.recitationTranslations).toBeDefined();
    expect(catalog.dashboardTranslations).toBeDefined();
    expect(catalog.landingTranslations).toBeDefined();
    expect(catalog.plansTranslations).toBeDefined();
    expect(catalog.applicantTranslations).toBeDefined();
    expect(catalog.sessionsTranslations).toBeDefined();
    expect(catalog.walletTranslations).toBeDefined();
    expect(catalog.adminUsersTranslations).toBeDefined();
    expect(catalog.adminBroadcastsTranslations).toBeDefined();
    expect(catalog.notificationsTranslations).toBeDefined();
    expect(catalog.handshakeCodeTranslations).toBeDefined();
    expect(catalog.parentLinkTranslations).toBeDefined();
  });

  test("ar and en message catalogs provide localized differences", () => {
    const arCatalog = getTranslations("ar");
    const enCatalog = getTranslations("en");

    expect(arCatalog.errorsTranslations.badRequest).not.toBe(
      enCatalog.errorsTranslations.badRequest
    );
    expect(typeof arCatalog.errorsTranslations.badRequest).toBe("string");
    expect(typeof enCatalog.errorsTranslations.badRequest).toBe("string");
  });
});
