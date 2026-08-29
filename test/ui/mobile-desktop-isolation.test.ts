/**
 * Static UI isolation checks — the "Static checks" layer of `test/ui/AGENTS.md`.
 *
 * Import-boundary scans ONLY: no dev server, no browser, no DOM. The scan walks the
 * frontend source tree and asserts the two boundaries that keep the same responsive
 * (mobile + desktop) view tree safe to serve from both server and client runtimes:
 *
 * 1. Client-isolation boundary — modules marked `"use client"` must never import
 *    server-only modules (`@/backend/**`, `server-only`, `@/shared/locale/server`,
 *    `next/server`, `next/headers`). This is the exact failure class caught in
 *    CRON-R11 (a label formatter crossing the RSC boundary), where tsgo alone does
 *    not fail until runtime.
 *
 * 2. Viewport-hook boundary — MUI's `useMediaQuery` (and the viewport-driven
 *    responsive decisions built on it) is a React client hook. Any module that
 *    imports it must be a client module, so mobile/desktop responsive switching
 *    never leaks into server components that render on every request.
 *
 * These are hard isolation rules: a violation is a build-order bug that surfaces as
 * a server-render crash or a hydration mismatch, so the scan fails loudly instead of
 * warning.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

/** Source roots scanned for boundary violations (frontend source only). */
const SCAN_ROOTS = ["frontend/views", "frontend/components", "frontend/stores", "frontend/hooks"] as const;

/** Path segments that never participate in the boundary scan (build output / generated code). */
const EXCLUDED_SEGMENTS = ["node_modules", ".next", "generated"] as const;

/** Module specifiers that must never appear in a `"use client"` module. */
const SERVER_ONLY_SPECIFIERS = [
  "@/backend/",
  "server-only",
  "@/shared/locale/server",
  "next/server",
  "next/headers",
] as const;

/** Specifiers that provide viewport/media hooks — client-only by React rules. */
const VIEWPORT_HOOK_SPECIFIERS = ["useMediaQuery"] as const;

interface ScannedModule {
  /** Repo-relative posix path, for actionable failure messages. */
  readonly path: string;
  /** True when the module declares the `"use client"` directive. */
  readonly isClientModule: boolean;
  /** Every static/dynamic module specifier referenced by the module. */
  readonly specifiers: readonly string[];
}

function isScannableModule(path: string): boolean {
  return !EXCLUDED_SEGMENTS.some(segment => path.includes(segment));
}

function extractSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  // Small linear patterns instead of one combined alternation — nested quantifiers
  // spanning large text are flagged as super-linear (sonarjs/super-linear-regex).
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g, // static import/export ... from "x"
    /\bimport\(\s*["']([^"']+)["']\s*\)/g, // dynamic import("x")
    /\brequire\(\s*["']([^"']+)["']\s*\)/g, // require("x")
  ] as const;
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

function scanModules(): ScannedModule[] {
  const modules: ScannedModule[] = [];
  for (const root of SCAN_ROOTS) {
    for (const relativePath of new Glob("**/*.{ts,tsx}").scanSync(root)) {
      const path = join(root, relativePath);
      if (!isScannableModule(path)) continue;
      let source: string;
      try {
        source = readFileSync(path, "utf8");
      } catch {
        // Deleted between glob and read — nothing to assert about it.
        continue;
      }
      modules.push({
        path,
        // Directive check runs per-line: a whole-file multiline regex with \s*
        // on both anchors is flagged as super-linear (sonarjs/super-linear-regex).
        isClientModule: source.split("\n").some(line => /^\s*["']use client["'];?\s*$/.test(line)),
        specifiers: extractSpecifiers(source),
      });
    }
  }
  return modules;
}

const modules = scanModules();

describe("static mobile/desktop isolation (import-boundary scans)", () => {
  test("scan finds the frontend module tree", () => {
    expect(modules.length).toBeGreaterThan(20);
  });

  describe("client-isolation boundary", () => {
    test('"use client" modules never import server-only modules', () => {
      const violations = modules
        .filter(module => module.isClientModule)
        .flatMap(module =>
          module.specifiers
            .filter(specifier => SERVER_ONLY_SPECIFIERS.some(prefix => specifier.startsWith(prefix)))
            .map(specifier => `${module.path} imports server-only "${specifier}"`)
        );
      expect(violations).toEqual([]);
    });
  });

  describe("viewport-hook boundary", () => {
    test("useMediaQuery is only imported by client modules", () => {
      const violations = modules
        .filter(module => !module.isClientModule)
        .flatMap(module =>
          module.specifiers
            .filter(specifier => VIEWPORT_HOOK_SPECIFIERS.some(hook => specifier.includes(hook)))
            .map(specifier => `${module.path} imports viewport hook "${specifier}" without "use client"`)
        );
      expect(violations).toEqual([]);
    });

    test("the scan itself covers modules (guard against silent empty scans)", () => {
      const clientModules = modules.filter(module => module.isClientModule);
      expect(clientModules.length).toBeGreaterThan(0);
    });
  });
});
