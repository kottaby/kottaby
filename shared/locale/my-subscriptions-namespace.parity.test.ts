/**
 * `mySubscriptions`-namespace locale-parity verification (DEV1-010).
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `mySubscriptions` leaf maps expose
 *      IDENTICAL key sets with shape-matched values (belt #2: the PRIMARY
 *      parity gate is compile-time typing where BOTH leaf consts are typed
 *      `MySubscriptionsLabels`; any missing key fails `bun tsgo`. This suite
 *      keeps the guarantee enforced even if someone loosens that typing
 *      later).
 *   2. TYPE-SHAPE PARITY — per key, the value kind (string vs formatter
 *      function) is identical across ar/en; plain strings are non-empty and
 *      carry no ICU braces; every interpolating key expands its single
 *      argument EXACTLY once in BOTH locales.
 *   3. REGISTRY + SERVER WIRING — the `MySubscriptions` handle is registered
 *      in `shared/locale/namespaces/index.ts` under the conventional
 *      `<group>.<ns>` id, its getter resolves the composed bundle slice on
 *      both message bundles, and `getTranslations(locale)` exposes
 *      `mySubscriptionsTranslations.*` (the server `getServerTranslations`
 *      path). Client-hook `useAppTranslation(MySubscriptions)` consumes the
 *      same handle + getter — wiring proof is the consumer view's job;
 *      this stays structural.
 *
 * Mirrors the structure of `shared/locale/student-plans-namespace.parity.test.ts`.
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/my-subscriptions-namespace.parity.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { arMessages } from "@/shared/locale/ar/messages";
import { mySubscriptionsAr } from "@/shared/locale/ar/mySubscriptions";
import { enMessages } from "@/shared/locale/en/messages";
import { mySubscriptionsEn } from "@/shared/locale/en/mySubscriptions";
import { namespaces } from "@/shared/locale/namespaces/index";
import { MySubscriptions } from "@/shared/locale/namespaces/mySubscriptions";
import { getTranslations } from "@/shared/locale/server";

const INTERPOLATING_KEYS = ["intervalDays", "renewDialogBody"] as const;

const EXPECTED_KEY_COUNT = 39;

const TITLE_SENTINEL = "SENTINEL";
const DAYS_SENTINEL = 30;

/** Narrows one locale slot to the day-count formatter kind (undefined otherwise). */
function dayFormatterOf(
  value: string | ((days: number) => string) | undefined
): ((days: number) => string) | undefined {
  return typeof value === "function" ? value : undefined;
}

/** Narrows one locale slot to the plan-title formatter kind (undefined otherwise). */
function titleFormatterOf(
  value: string | ((planTitle: string) => string) | undefined
): ((planTitle: string) => string) | undefined {
  return typeof value === "function" ? value : undefined;
}

/**
 * Own enumerable string keys of `record`, typed as `keyof T` — the cast-free
 * equivalent of `Object.keys(record) as Array<keyof T>` (oxlint
 * no-unsafe-type-assertion). `for...in` only ever binds `Extract<keyof T,
 * string>` members, and the `hasOwn` guard pins the result to exactly
 * `Object.keys` semantics (own string keys, same insertion order).
 */
function keysOf<T extends object>(record: T): Array<keyof T> {
  const keys: Array<keyof T> = [];
  for (const key in record) {
    if (Object.hasOwn(record, key)) keys.push(key);
  }
  return keys;
}

/**
 * Code-unit string comparator — the if-chain spelling of
 * `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` (kept ternary-free for
 * sonarjs/no-nested-conditional). Relational operators on strings compare
 * UTF-16 code units, so this reproduces Array.prototype.sort's default
 * ToString ordering EXACTLY — sorted output is byte-identical to the old
 * comparator-less `.toSorted()`. `localeCompare` is deliberately avoided:
 * its locale-sensitive collation may reorder differently than UTF-16 code
 * units for these camelCase key identifiers.
 */
const compareCodeUnits = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

describe("mySubscriptions namespace — locale parity", () => {
  test("en and ar expose the SAME key sets", () => {
    const enKeys = Object.keys(mySubscriptionsEn).toSorted(compareCodeUnits);
    const arKeys = Object.keys(mySubscriptionsAr).toSorted(compareCodeUnits);
    expect(arKeys).toEqual(enKeys);
  });

  test(`every key is present — exactly ${EXPECTED_KEY_COUNT} keys`, () => {
    expect(Object.keys(mySubscriptionsEn)).toHaveLength(EXPECTED_KEY_COUNT);
    expect(Object.keys(mySubscriptionsAr)).toHaveLength(EXPECTED_KEY_COUNT);
  });

  test("plain strings are non-empty and carry no ICU braces (both locales)", () => {
    for (const [locale, labels] of [
      ["en", mySubscriptionsEn],
      ["ar", mySubscriptionsAr],
    ] as const) {
      for (const [key, value] of Object.entries(labels)) {
        if (typeof value !== "string") continue;
        expect(value.length, `${locale}.${key} must be non-empty`).toBeGreaterThan(0);
        expect(value.includes("{"), `${locale}.${key} must not use ICU braces`).toBeFalse();
        expect(value.includes("}"), `${locale}.${key} must not use ICU braces`).toBeFalse();
      }
    }
  });

  test("type-shape parity — formatter keys are formatters in BOTH locales, strings in BOTH", () => {
    for (const key of keysOf(mySubscriptionsEn)) {
      const enIsFunction = typeof mySubscriptionsEn[key] === "function";
      const arIsFunction = typeof mySubscriptionsAr[key] === "function";
      expect(enIsFunction, `${key}: en kind`).toBe(arIsFunction);
    }
  });

  test("intervalDays expands its single day-count argument EXACTLY once (both locales)", () => {
    for (const [locale, labels] of [
      ["en", mySubscriptionsEn],
      ["ar", mySubscriptionsAr],
    ] as const) {
      const formatter = dayFormatterOf(labels.intervalDays);
      expect(formatter, `${locale}.intervalDays must be a function`).toBeDefined();
      const rendered = formatter?.(DAYS_SENTINEL);
      if (rendered === undefined) {
        throw new Error(`${locale}.intervalDays must be a day-count formatter`);
      }
      expect(rendered).toContain(String(DAYS_SENTINEL));
      expect(rendered.split(String(DAYS_SENTINEL)).length - 1).toBe(1);
    }
  });

  test("renewDialogBody expands its single plan-title argument EXACTLY once (both locales)", () => {
    for (const [locale, labels] of [
      ["en", mySubscriptionsEn],
      ["ar", mySubscriptionsAr],
    ] as const) {
      const formatter = titleFormatterOf(labels.renewDialogBody);
      expect(formatter, `${locale}.renewDialogBody must be a function`).toBeDefined();
      const rendered = formatter?.(TITLE_SENTINEL);
      if (rendered === undefined) {
        throw new Error(`${locale}.renewDialogBody must be a plan-title formatter`);
      }
      expect(rendered).toContain(TITLE_SENTINEL);
      expect(rendered.split(TITLE_SENTINEL).length - 1).toBe(1);
    }
  });

  test("INTERPOLATING_KEYS covers exactly the formatter members of the namespace", () => {
    const formatterKeys = keysOf(mySubscriptionsEn).filter(key => typeof mySubscriptionsEn[key] === "function");
    expect([...formatterKeys].toSorted(compareCodeUnits)).toEqual([...INTERPOLATING_KEYS].toSorted(compareCodeUnits));
  });
});

describe("mySubscriptions namespace — registry + server wiring", () => {
  test("handle is registered under the conventional `<group>.<ns>` id", () => {
    expect(MySubscriptions.id).toBe("student.mySubscriptions");
    expect(Object.values(namespaces)).toContain(MySubscriptions);
  });

  test("getter resolves the composed bundle slice on BOTH message bundles", () => {
    const enSlice = MySubscriptions.getLabels(enMessages);
    const arSlice = MySubscriptions.getLabels(arMessages);
    expect(enSlice).toBe(enMessages.mySubscriptionsTranslations);
    expect(arSlice).toBe(arMessages.mySubscriptionsTranslations);
  });

  test("server getTranslations exposes mySubscriptionsTranslations for both locales", () => {
    const en = getTranslations("en").mySubscriptionsTranslations;
    const ar = getTranslations("ar").mySubscriptionsTranslations;
    expect(en.pageTitle).toBe(mySubscriptionsEn.pageTitle);
    expect(ar.pageTitle).toBe(mySubscriptionsAr.pageTitle);
  });
});
