/**
 * RateTeacherDialog — component suite ENTRY (runner target).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/student`,
 * mirroring the `StudentSessionsContainer` suite in this directory): the
 * teacher-rating CTA + dialog matrix — Rate CTA hidden on pre-confirmation
 * shapes / hidden once the session sits in the rated set / visible on the
 * dual-confirmed shape, the dialog's star choice dispatching the write-once
 * mutation with the selected rating (mid-scale + the 1/5 boundary stars),
 * the server VALIDATION pair addressed at `rating` rendering inline, and the
 * write-once rejection converging the row to its rated state.
 *
 * WHY this file exists (two-phase bootstrap) — the same react-dom eval-order
 * root cause the sibling entry documents: Bun evaluates an entry test file's
 * node_modules CJS dependencies BEFORE the file's own static import
 * statements run. A test file that statically imports `@testing-library/react`
 * therefore first evaluates `react-dom` — and if the Happy-DOM global
 * registration only happens in a later static import, react-dom's module body
 * runs with NO `document` at all (`isInputEventSupported` stays `false`).
 * This entry imports ONLY the local preload chain (test-env → happydom →
 * translation-preload → next-dynamic-mock) via SEQUENTIAL TOP-LEVEL AWAIT
 * imports, then loads the suite body via a final top-level `await import(...)`
 * — guaranteeing react-dom evaluates with `canUseDOM === true` under the plain
 * single-file runner AND the official `test:ui:components` CLI preloads alike.
 * Every preload is idempotent, so the suite body stays free of ordering
 * obligations.
 */

// bun:test handles are imported statically (safe: the module touches no DOM
// at evaluation time); the DOM-dependent preload chain stays behind the
// sequential top-level awaits below.
import { expect, test } from "bun:test";

// Preload chain FIRST — the Happy-DOM window must exist before ANY
// DOM-touching module (react-dom above all) is evaluated. Sequential
// top-level awaits (not static side-effect imports) keep the strict
// evaluation order while satisfying lint's no-unassigned-import rule.
await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

// THEN the suite body — dynamic import keeps react-dom's evaluation behind
// the registered document (see the root-cause note above).
await import("./rate-teacher-dialog.suite");

// Bootstrap self-check (also satisfies the no-empty-test-file lint rule for
// this entry — the suite's own cases are registered by the import above and
// collected by bun natively). It pins the preload contract this file exists
// for: a Happy-DOM document is live BEFORE any suite module is evaluated.
test("bootstrap — Happy-DOM document registered before the suite import resolves", () => {
  expect(typeof document).toBe("object");
  expect(document.body).not.toBeNull();
  expect(typeof window).toBe("object");
});
