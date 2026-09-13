/**
 * StudentPostConfirmationDispute — component suite ENTRY (runner target).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/student`,
 * same two-phase bootstrap as the sibling `StudentSessionsContainer`
 * entry): the suite BODY lives in the sibling
 * `StudentPostConfirmationDispute.suite.tsx` — the student post-confirmation
 * dispute action over the shared sessions surfaces:
 *
 *   the role-scoped dispute-affordance matrix (student rows reach the
 *   post-confirmation escalation; teacher rows NEVER do) · the shared
 *   `DISPUTABLE_STATUSES` vocabulary byte-stability pin · the
 *   post-confirmation dialog flow (typed submit → the post-confirmation
 *   document on the wire → success snackbar + cache-driven DISPUTED chip
 *   flip) · its SESSION_INVALID_TRANSITION denial arm (the dialog's
 *   snackbar-mapped error vocabulary) · the pre-completion arm's byte-stable
 *   wire (the shipped held-escrow document) ·
 *
 * WHY this file exists (two-phase bootstrap) — react-dom eval-order root
 * cause: Bun evaluates an entry test file's node_modules CJS dependencies
 * BEFORE the file's own static import statements run. A test file that
 * statically imports `@testing-library/react` therefore first evaluates
 * `react-dom` — and if the Happy-DOM global registration only happens in a
 * later static import (the usual preload-chain shape), react-dom's module
 * body runs with NO `document` at all, its module-eval-time
 * `isInputEventSupported` flag stays `false`, and controlled `onChange`
 * never fires. The sequential top-level-await preload chain below registers
 * the Happy-DOM document FIRST; the suite (and with it react-dom) is then
 * loaded via a final top-level `await import(...)`, guaranteeing react-dom
 * evaluates with `canUseDOM === true` — which is what makes the TYPED
 * dialog submits of this suite deliverable under the plain single-file
 * runner (`bun run test/scripts/run-test.ts <path>`).
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
await import("./StudentPostConfirmationDispute.suite");

// Bootstrap self-check (also satisfies the no-empty-test-file lint rule for
// this entry — the suite's own cases are registered by the import above and
// collected by bun natively). It pins the preload contract this file exists
// for: a Happy-DOM document is live BEFORE any suite module is evaluated.
test("bootstrap — Happy-DOM document registered before the suite import resolves", () => {
  expect(typeof document).toBe("object");
  expect(document.body).not.toBeNull();
  expect(typeof window).toBe("object");
});
