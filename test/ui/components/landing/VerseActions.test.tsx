import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

import { VerseActions } from "@/frontend/views/landing/sections/verse/VerseActions";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Landing } from "@/shared/locale/namespaces/landing";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

afterEach(cleanup);

describe("VerseActions", () => {
  beforeEach(() => {
    // Mock navigator.clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  test("en: renders copy and share buttons with tooltips and handles copy click", async () => {
    const locale: AppLocale = "en";
    const labels = Landing.getLabels(getTranslations(locale));

    renderWithWrapper(<VerseActions />, { locale });

    const copyButton = screen.getByRole("button", { name: labels.verseCopy });
    const shareButton = screen.getByRole("button", { name: labels.verseShare });

    expect(copyButton).toBeDefined();
    expect(shareButton).toBeDefined();

    // Trigger copy button click wrapped in act
    await act(async () => {
      fireEvent.click(copyButton);
    });

    // Verify copy label updates to copied status
    expect(screen.getByText(labels.verseCopied)).toBeDefined();
  });
});
