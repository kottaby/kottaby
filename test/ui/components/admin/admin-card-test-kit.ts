/**
 * Admin mobile-card test kit — the shared Happy-DOM plumbing of the
 * `Admin*MobileCard` suites (controllable clipboard stub + the structural
 * walk helpers that skip Happy DOM's interleaved `<style>` tags).
 *
 * Extracted so the clipboard stub and the DOM walk cannot drift apart
 * across the student/teacher card suites (backend/db/test/AGENTS.md dedupe
 * discipline, applied at the UI test layer).
 *
 * TEST-ONLY module: imports `bun:test` and must never be imported from
 * production code.
 */

import { mock } from "bun:test";

export type WriteTextMock = ReturnType<typeof mock<(text: string) => Promise<void>>>;

let writeTextMock: WriteTextMock;

/** Controllable clipboard stub: tests resolve/reject writes explicitly. */
export function installClipboardStub(impl: (text: string) => Promise<void>): void {
  writeTextMock = mock<(text: string) => Promise<void>>(impl);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
}

/** The active clipboard write mock installed by `installClipboardStub`. */
export function clipboardWriteMock(): WriteTextMock {
  return writeTextMock;
}

/**
 * Card-suite environment boot: the mandated preload chain (test env →
 * Happy DOM → translations → next/dynamic mock) followed by the
 * testing-library + wrapper resolution, in THAT order. Returns the handles
 * the suites destructure. Awaits preserve the preload sequencing exactly.
 */
export async function cardTestHarness(): Promise<{
  cleanup: () => void;
  fireEvent: typeof import("@testing-library/react").fireEvent;
  screen: typeof import("@testing-library/react").screen;
  renderWithWrapper: typeof import("@/test/ui/components/TestWrapper").renderWithWrapper;
}> {
  await import("@/test/ui/test-env");
  await import("@/test/ui/components/happydom-preload");
  await import("@/test/ui/components/translation-preload");
  await import("@/test/ui/components/next-dynamic-mock");

  const { cleanup, fireEvent, screen } = await import("@testing-library/react");
  const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");
  return { cleanup, fireEvent, screen, renderWithWrapper };
}

/**
 * Nearest previous ELEMENT sibling that carries content — Happy DOM's
 * emotion integration interleaves `<style>` tags between the card's real
 * children, so the structural walk must skip them.
 */
export function previousContentElement(element: Element): Element | null {
  let node: Element | null = element.previousElementSibling;
  while (node !== null && (node.tagName === "STYLE" || node.tagName === "LINK")) {
    node = node.previousElementSibling;
  }
  return node;
}

/**
 * Instanceof-narrowed `Element | null` → `HTMLElement` — the runtime-checked
 * replacement for the old bare `as HTMLElement` casts on structural-walk
 * results (a broken walk fails the test through the thrown error).
 */
export function asHTMLElement(element: Element | null): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError("expected an HTMLElement — the structural walk broke");
  }
  return element;
}
