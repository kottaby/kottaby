/**
 * LocaleContext — component suite ENTRY (runner target).
 *
 * This entry module isolates Happy-DOM preloads to ensure `react-dom`
 * evaluates with a real `document` environment (resolving React DOM
 * issues with `renderHook`).
 */

import { expect, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");

await import("./localeContext.suite");

test("bootstrap — Happy-DOM document registered before the suite import resolves", () => {
  expect(typeof document).toBe("object");
  expect(document.body).not.toBeNull();
  expect(typeof window).toBe("object");
});
