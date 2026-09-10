/**
 * `adminTeachers`-namespace locale-parity verification
 * · ar+en parity gate + Arabic-script sweep + headers block pin + registry wiring.
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `adminTeachers` leaf maps expose
 *      IDENTICAL depth-first leaf-path sets where every leaf is a non-empty
 *      localized string (belt #2: the PRIMARY parity gate is compile-time
 *      typing where BOTH leaf consts are typed `AdminTeachersLabels`; any
 *      missing key fails `bun tsgo`. This suite keeps the guarantee enforced
 *      even if someone loosens that typing later).
 *   2. HEADERS BLOCK PIN — every key of the `headers` block (identity,
 *      status, rating, subjects, joined) is pinned under BOTH locales — a
 *      key dropped from both maps simultaneously still fails this suite.
 *   3. NO ENGLISH FALLTHROUGH — every ar leaf contains Arabic script (this
 *      namespace carries no locale-neutral em-dash placeholder).
 *   4. PLACEHOLDER-NAME PARITY — ICU placeholder-name sets are IDENTICAL
 *      across ar/en per key (currently zero placeholders; future keys with
 *      interpolation inherit the pin).
 *   5. REGISTRY WIRING — the `AdminTeachers` handle is registered in
 *      `shared/locale/namespaces/index.ts` with the conventional `<ns>.<ns>`
 *      id and its getter resolves the composed bundle slice.
 *
 * Mirrors the structure of `shared/locale/adminUsers-namespace.parity.test.ts`
 * (the sibling namespace gate).
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/adminTeachers-namespace.parity.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { adminTeachersAr } from "@/shared/locale/ar/adminTeachers";
import { arMessages } from "@/shared/locale/ar/messages";
import { adminTeachersEn } from "@/shared/locale/en/adminTeachers";
import { enMessages } from "@/shared/locale/en/messages";
import { AdminTeachers } from "@/shared/locale/namespaces/adminTeachers";
import { namespaces } from "@/shared/locale/namespaces/index";

// ─── Mandated inventory of the directory table headers ──────────────────────

/**
 * Every leaf key the `headers` block must carry (5 slots) — the desktop
 * table column set (the evaluator column header reuses `statusPills.evaluator`).
 */
const HEADERS_LEAF_PATHS = ["name", "status", "rating", "subjects", "joined"] as const;

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
    throw new Error(`adminTeachers.${path} must be a non-empty localized string or a grouped labels block`);
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
      throw new Error(`adminTeachers.${localeName}.${path} traverses a non-block node`);
    }
    node = Reflect.get(node, segment);
  }
  if (typeof node !== "string" || node.length === 0) {
    throw new Error(`adminTeachers.${localeName}.${path} must be a non-empty localized string`);
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
describe("compile-time parity mirror — ar/en adminTeachers key sets agree", () => {
  test("identical sorted leaf-path sets across BOTH locale sources (depth-first)", () => {
    const arPaths = sortedLeafPathsOf(adminTeachersAr);
    const enPaths = sortedLeafPathsOf(adminTeachersEn);

    expect(arPaths.length).toBeGreaterThan(0);
    expect(enPaths).toEqual(arPaths);
  });

  test("every leaf value on BOTH maps is a non-empty localized string (zero dead keys)", () => {
    for (const path of sortedLeafPathsOf(adminTeachersAr)) {
      expect(leafValueOf(adminTeachersAr, path, "ar").length).toBeGreaterThan(0);
    }
    // Symmetric sweep — guards an en-only leaf that ar lost via future drift.
    for (const path of sortedLeafPathsOf(adminTeachersEn)) {
      expect(leafValueOf(adminTeachersEn, path, "en").length).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
describe("headers block — pinned under BOTH locales", () => {
  test("exact leaf-path set on BOTH locale sources (no key added, none dropped)", () => {
    const pinned = [...HEADERS_LEAF_PATHS].toSorted((a, b) => a.localeCompare(b));

    expect(leafPathsOf(adminTeachersAr.headers).toSorted((a, b) => a.localeCompare(b))).toEqual(pinned);
    expect(leafPathsOf(adminTeachersEn.headers).toSorted((a, b) => a.localeCompare(b))).toEqual(pinned);
  });

  test.each([...HEADERS_LEAF_PATHS])("headers.%s resolves as a non-empty string in BOTH locales", path => {
    expect(leafValueOf(adminTeachersAr.headers, path, "ar").length).toBeGreaterThan(0);
    expect(leafValueOf(adminTeachersEn.headers, path, "en").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
describe("no English fallthrough — ar map carries Arabic copy for every prose slot", () => {
  test("every ar leaf contains Arabic script (no locale-neutral placeholders in this namespace)", () => {
    const fallthroughs = sortedLeafPathsOf(adminTeachersAr).filter(path => {
      return !ARABIC_SCRIPT.test(leafValueOf(adminTeachersAr, path, "ar"));
    });
    expect(fallthroughs).toHaveLength(0);
  });
});

// ===========================================================================
describe("placeholder-name sets are IDENTICAL across ar/en per key", () => {
  test("per-key placeholder-name sets agree ar/en (currently zero placeholders)", () => {
    for (const path of sortedLeafPathsOf(adminTeachersAr)) {
      const arNames = icuPlaceholdersOf(leafValueOf(adminTeachersAr, path, "ar"));
      const enNames = icuPlaceholdersOf(leafValueOf(adminTeachersEn, path, "en"));
      expect(enNames).toEqual(arNames);
    }
  });
});

// ===========================================================================
describe("registry + bundle wiring", () => {
  test("namespaces registry exposes the AdminTeachers handle with the `<ns>.<ns>` id convention", () => {
    expect(Object.hasOwn(namespaces, "AdminTeachers")).toBe(true);
    expect(AdminTeachers.id).toBe("adminTeachers.adminTeachers");
  });

  test("handle getter resolves the composed bundle slice (both locales)", () => {
    expect(AdminTeachers.getLabels(enMessages)).toBe(enMessages.adminTeachersTranslations);
    expect(AdminTeachers.getLabels(arMessages)).toBe(arMessages.adminTeachersTranslations);
  });

  test("`adminTeachersTranslations` exists on BOTH message bundles", () => {
    expect(Object.hasOwn(enMessages, "adminTeachersTranslations")).toBe(true);
    expect(Object.hasOwn(arMessages, "adminTeachersTranslations")).toBe(true);
  });
});
