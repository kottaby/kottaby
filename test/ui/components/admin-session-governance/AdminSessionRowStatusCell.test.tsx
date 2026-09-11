/**
 * AdminSessionRowStatusCell — component suite ENTRY (runner target).
 *
 * The lifecycle StatusBadge matrix of the admin session-governance directory
 * (suite): the suite BODY lives in the sibling
 * `AdminSessionRowStatusCell.suite.tsx` — the shared status chip rendered
 * for every lifecycle status (plus the defensive unknown-status arm) across
 * BOTH locales.
 *
 * WHY this file exists (two-phase bootstrap) — identical root cause to the
 * container entry: Bun evaluates an entry test file's node_modules CJS
 * dependencies BEFORE the file's own static import statements run, so any
 * module touching `@testing-library/react` (and with it `react-dom`) must
 * be evaluated AFTER the Happy-DOM global registration. This entry imports
 * ONLY the local preload chain (test-env → happydom → translation-preload →
 * next-dynamic-mock) via SEQUENTIAL TOP-LEVEL AWAIT imports and loads the
 * suite body through a final top-level `await import(...)`. Every preload
 * is idempotent, so the suite body stays free of ordering obligations.
 */

// bun:test handles are imported statically (safe: the module touches no DOM
// at evaluation time); the DOM-dependent preload chain stays behind the
// sequential top-level awaits below.
import { expect, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

// THEN the suite body — dynamic import keeps react-dom's evaluation behind
// the registered document (see the root-cause note above).
await import("./AdminSessionRowStatusCell.suite");

// Bootstrap self-check (also satisfies the no-empty-test-file lint rule for
// this entry): a Happy-DOM document is live BEFORE any suite module is
// evaluated.
test("bootstrap — Happy-DOM document registered before the suite import resolves", () => {
  expect(typeof document).toBe("object");
  expect(document.body).not.toBeNull();
  expect(typeof window).toBe("object");
});
