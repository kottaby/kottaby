/**
 * DirectoryToolbarSearchField — component suite.
 *
 * Happy DOM tier (`test/ui/components`): tests the directory search field primitive
 * including its input rendering, clear search affordance when value is non-empty,
 * and onChange callback invocation.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

const { cleanup, fireEvent, screen } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { DirectoryToolbarSearchField } from "@/frontend/views/admin/directory-shared/DirectoryToolbarSearchField";

afterEach(cleanup);

describe("DirectoryToolbarSearchField", () => {
  test("renders placeholder and input without clear button when value is empty", () => {
    const onChange = mock<(val: string) => void>(() => undefined);
    renderWithWrapper(
      <DirectoryToolbarSearchField
        id="test-search"
        placeholder="Search students..."
        ariaLabel="Search students"
        value=""
        onChange={onChange}
      />
    );

    const input = screen.getByRole("textbox", { name: "Search students" });
    expect(input).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("renders clear button with aria-label when value is non-empty", () => {
    const onChange = mock<(val: string) => void>(() => undefined);
    renderWithWrapper(
      <DirectoryToolbarSearchField
        id="test-search"
        placeholder="Search students..."
        ariaLabel="Search students"
        clearLabel="Clear search"
        value="Ahmad"
        onChange={onChange}
      />
    );

    const clearButton = screen.getByRole("button", { name: "Clear search" });
    expect(clearButton).toBeDefined();
  });

  test("clicking clear button invokes onChange with empty string", () => {
    const onChange = mock<(val: string) => void>(() => undefined);
    renderWithWrapper(
      <DirectoryToolbarSearchField
        id="test-search"
        placeholder="Search students..."
        ariaLabel="Search students"
        clearLabel="Clear search"
        value="Ahmad"
        onChange={onChange}
      />
    );

    const clearButton = screen.getByRole("button", { name: "Clear search" });
    fireEvent.click(clearButton);

    expect(onChange.mock.calls).toHaveLength(1);
    expect(onChange.mock.calls[0]?.[0]).toBe("");
  });
});
