/**
 * VerseActions — component test (Pattern 2 per test/ui/AGENTS.md: the
 * component consumes `useAppTranslation(Landing)` internally). Labels are
 * resolved via `Landing.getLabels(getTranslations(locale))` — never hardcoded.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

import { VerseActions } from "@/frontend/views/landing/sections/verse/VerseActions";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Landing } from "@/shared/locale/namespaces/landing";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

const locale: AppLocale = "en";

afterEach(cleanup);

describe("VerseActions", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mock(() => Promise.resolve()) },
      configurable: true,
    });
  });

  test("en: renders copy and share buttons and switches to copied state on copy click", async () => {
    const labels = Landing.getLabels(getTranslations(locale));

    renderWithWrapper(<VerseActions />, { locale });

    const copyButton = screen.getByRole("button", { name: labels.verseCopy });
    const shareButton = screen.getByRole("button", { name: labels.verseShare });

    expect(copyButton).toBeDefined();
    expect(shareButton).toBeDefined();

    await act(async () => {
      fireEvent.click(copyButton);
    });

    // Status text flips to the localized "copied" confirmation.
    expect(screen.getByText(labels.verseCopied)).toBeDefined();
  });
});
