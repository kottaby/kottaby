/**
 * `adminStudents`-namespace locale-parity verification
 * · ar+en parity gate + Arabic-script sweep + headers/balances block pin + registry wiring.
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `adminStudents` leaf maps expose
 *      IDENTICAL depth-first leaf-path sets where every leaf is a non-empty
 *      localized string (belt #2: the PRIMARY parity gate is compile-time
 *      typing where BOTH leaf consts are typed `AdminStudentsLabels`; any
 *      missing key fails `bun tsgo`. This suite keeps the guarantee enforced
 *      even if someone loosens that typing later).
 *   2. HEADERS + BALANCES BLOCK PIN — every key of the `headers` block
 *      (identity, balances, parent, languages, trial, joined) and of the
 *      `balances` block (hifz, reviews, tajweed, trial — the backend's
 *      canonical lane order) is pinned under BOTH locales — a key dropped
 *      from both maps simultaneously still fails this suite.
 *   3. NO ENGLISH FALLTHROUGH — every ar leaf contains Arabic script (this
 *      namespace carries no locale-neutral em-dash placeholder).
 *   4. PLACEHOLDER-NAME PARITY — ICU placeholder-name sets are IDENTICAL
 *      across ar/en per key (currently zero placeholders; future keys with
 *      interpolation inherit the pin).
 *   5. REGISTRY WIRING — the `AdminStudents` handle is registered in
 *      `shared/locale/namespaces/index.ts` with the conventional `<ns>.<ns>`
 *      id and its getter resolves the composed bundle slice.
 *
 * Mirrors the structure of `shared/locale/adminUsers-namespace.parity.test.ts`
 * (the sibling namespace gate).
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/adminStudents-namespace.parity.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { adminStudentsAr } from "@/shared/locale/ar/adminStudents";
import { arMessages } from "@/shared/locale/ar/messages";
import { adminStudentsEn } from "@/shared/locale/en/adminStudents";
import { enMessages } from "@/shared/locale/en/messages";
import { AdminStudents } from "@/shared/locale/namespaces/adminStudents";
import { namespaces } from "@/shared/locale/namespaces/index";

// ─── Mandated inventory of the directory table headers ──────────────────────

/** Every leaf key the `headers` block must carry (6 slots). */
const HEADERS_LEAF_PATHS = ["name", "balances", "parent", "languages", "trial", "joined"] as const;

/** Every leaf key the `balances` block must carry (4 slots — backend lane order). */
const BALANCES_LEAF_PATHS = ["hifz", "reviews", "tajweed", "trial"] as const;

/** Arabic-script probe — at least one Arabic-block character in the value. */
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/**
 * Depth-first leaf paths of a locale map — grouped sub-blocks are flattened
 * into dotted paths so nested blocks keep the same zero-dead-key discipline
 * as top-level string slots. Throws on any node that is neither a string nor
 * a grouped labels block.
 */
function leafPathsOf(localeMap: object, prefix = ""): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(localeMap)) {
    const value: unknown = Reflect.get(localeMap, key);
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      paths.push(path);
      continue;
    }
    if (value !== null && typeof value === "object") {
      paths.push(...leafPathsOf(value, path));
      continue;
    }
    throw new Error(`adminStudents.${path} must be a non-empty localized string or a grouped labels block`);
  }
  return paths;
}

/** Locale-sorted leaf paths of a locale map (stable comparison key set). */
function sortedLeafPathsOf(localeMap: object): string[] {
  return leafPathsOf(localeMap).toSorted((a, b) => a.localeCompare(b));
}

/** Reads one leaf value off a locale map by dotted path — throws otherwise. */
function leafValueOf(localeMap: object, path: string, localeName: string): string {
  let node: unknown = localeMap;
  for (const segment of path.split(".")) {
    if (node === null || typeof node !== "object") {
      throw new Error(`adminStudents.${localeName}.${path} traverses a non-block node`);
    }
    node = Reflect.get(node, segment);
  }
  if (typeof node !== "string" || node.length === 0) {
    throw new Error(`adminStudents.${localeName}.${path} must be a non-empty localized string`);
  }
  return node;
}

/** Every `{name}` ICU placeholder occurring in a template, deduplicated + sorted. */
function icuPlaceholdersOf(template: string): string[] {
  const seen = new Set<string>();
  const placeholder = /\{([A-Za-z]\w*)\}/g;
  let match = placeholder.exec(template);
  while (match !== null) {
    if (typeof match[1] === "string") {
      seen.add(match[1]);
    }
    match = placeholder.exec(template);
  }
  return [...seen].toSorted((a, b) => a.localeCompare(b));
}

// ===========================================================================
describe("compile-time parity mirror — ar/en adminStudents key sets agree", () => {
  test("identical sorted leaf-path sets across BOTH locale sources (depth-first)", () => {
    const arPaths = sortedLeafPathsOf(adminStudentsAr);
    const enPaths = sortedLeafPathsOf(adminStudentsEn);

    expect(arPaths.length).toBeGreaterThan(0);
    expect(enPaths).toEqual(arPaths);
  });

  test("every leaf value on BOTH maps is a non-empty localized string (zero dead keys)", () => {
    for (const path of sortedLeafPathsOf(adminStudentsAr)) {
      expect(leafValueOf(adminStudentsAr, path, "ar").length).toBeGreaterThan(0);
    }
    // Symmetric sweep — guards an en-only leaf that ar lost via future drift.
    for (const path of sortedLeafPathsOf(adminStudentsEn)) {
      expect(leafValueOf(adminStudentsEn, path, "en").length).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
describe("headers block — pinned under BOTH locales", () => {
  test("exact leaf-path set on BOTH locale sources (no key added, none dropped)", () => {
    const pinned = [...HEADERS_LEAF_PATHS].toSorted((a, b) => a.localeCompare(b));

    expect(leafPathsOf(adminStudentsAr.headers).toSorted((a, b) => a.localeCompare(b))).toEqual(pinned);
    expect(leafPathsOf(adminStudentsEn.headers).toSorted((a, b) => a.localeCompare(b))).toEqual(pinned);
  });

  test.each([...HEADERS_LEAF_PATHS])("headers.%s resolves as a non-empty string in BOTH locales", path => {
    expect(leafValueOf(adminStudentsAr.headers, path, "ar").length).toBeGreaterThan(0);
    expect(leafValueOf(adminStudentsEn.headers, path, "en").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
describe("balances block — pinned under BOTH locales (backend lane order)", () => {
  test("exact leaf-path set on BOTH locale sources (no key added, none dropped)", () => {
    const pinned = [...BALANCES_LEAF_PATHS].toSorted((a, b) => a.localeCompare(b));

    expect(leafPathsOf(adminStudentsAr.balances).toSorted((a, b) => a.localeCompare(b))).toEqual(pinned);
    expect(leafPathsOf(adminStudentsEn.balances).toSorted((a, b) => a.localeCompare(b))).toEqual(pinned);
  });

  test.each([...BALANCES_LEAF_PATHS])("balances.%s resolves as a non-empty string in BOTH locales", path => {
    expect(leafValueOf(adminStudentsAr.balances, path, "ar").length).toBeGreaterThan(0);
    expect(leafValueOf(adminStudentsEn.balances, path, "en").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
describe("no English fallthrough — ar map carries Arabic copy for every prose slot", () => {
  test("every ar leaf contains Arabic script (no locale-neutral placeholders in this namespace)", () => {
    const fallthroughs = sortedLeafPathsOf(adminStudentsAr).filter(path => {
      return !ARABIC_SCRIPT.test(leafValueOf(adminStudentsAr, path, "ar"));
    });
    expect(fallthroughs).toHaveLength(0);
  });
});

// ===========================================================================
describe("placeholder-name sets are IDENTICAL across ar/en per key", () => {
  test("per-key placeholder-name sets agree ar/en (currently zero placeholders)", () => {
    for (const path of sortedLeafPathsOf(adminStudentsAr)) {
      const arNames = icuPlaceholdersOf(leafValueOf(adminStudentsAr, path, "ar"));
      const enNames = icuPlaceholdersOf(leafValueOf(adminStudentsEn, path, "en"));
      expect(enNames).toEqual(arNames);
    }
  });
});

// ===========================================================================
describe("registry + bundle wiring", () => {
  test("namespaces registry exposes the AdminStudents handle with the `<ns>.<ns>` id convention", () => {
    expect(Object.hasOwn(namespaces, "AdminStudents")).toBe(true);
    expect(AdminStudents.id).toBe("adminStudents.adminStudents");
  });

  test("handle getter resolves the composed bundle slice (both locales)", () => {
    expect(AdminStudents.getLabels(enMessages)).toBe(enMessages.adminStudentsTranslations);
    expect(AdminStudents.getLabels(arMessages)).toBe(arMessages.adminStudentsTranslations);
  });

  test("`adminStudentsTranslations` exists on BOTH message bundles", () => {
    expect(Object.hasOwn(enMessages, "adminStudentsTranslations")).toBe(true);
    expect(Object.hasOwn(arMessages, "adminStudentsTranslations")).toBe(true);
  });
});
