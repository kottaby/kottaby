/**
 * ActiveFiltersRow — component suite.
 *
 * Happy DOM tier (`test/ui/components/admin`): covers the applied-filter
 * chip strip above the admin users directory across BOTH locales:
 *
 *   nothing applied → the row renders NULL (an empty strip never exists)
 *   · each applied predicate renders exactly one deletable chip labeled
 *   `filterLabel: value` in the active locale (search, role, governance,
 *   country) · removing a chip (its MUI delete icon) invokes ONLY that
 *   filter's clearing setter (the page-resetting setters the toolbar
 *   drives — the row never mutates sibling filters) · a whitespace-only
 *   country draft renders no chip (mirrors the URL serializer's trim
 *   semantics).
 *
 * Translation discipline: assertions reference ONLY the label object
 * resolved through `AdminUsers.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy lives here (expected chip labels are
 * composed from the same label object the component renders).
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

const { cleanup, fireEvent, screen } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import type { RenderResult } from "@testing-library/react";

import { ActiveFiltersRow } from "@/frontend/views/admin/users/directory/ActiveFiltersRow";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { AdminUsers as AdminUsersNs } from "@/shared/locale/namespaces/adminUsers";
import { getTranslations } from "@/shared/locale/server";

afterEach(cleanup);

interface RenderOptions {
  readonly locale: AppLocale;
  readonly roleFilter?: "Admin" | "Teacher" | "Student" | "Parent" | "";
  readonly governanceFilter?: "Active" | "Suspended" | "Blocked" | "Deleted" | "";
  readonly countryFilter?: string;
  readonly searchApplied?: string;
  readonly setRoleFilter?: (value: "Admin" | "Teacher" | "Student" | "Parent" | "") => void;
  readonly setGovernanceFilter?: (value: "Active" | "Suspended" | "Blocked" | "Deleted" | "") => void;
  readonly setCountryFilter?: (value: string) => void;
  readonly setSearchInput?: (value: string) => void;
}

function renderRow({
  locale,
  roleFilter = "",
  governanceFilter = "",
  countryFilter = "",
  searchApplied = "",
  setRoleFilter,
  setGovernanceFilter,
  setCountryFilter,
  setSearchInput,
}: RenderOptions): RenderResult {
  const labels = AdminUsersNs.getLabels(getTranslations(locale));
  return renderWithWrapper(
    <ActiveFiltersRow
      labels={labels}
      roleFilter={roleFilter}
      governanceFilter={governanceFilter}
      countryFilter={countryFilter}
      searchApplied={searchApplied}
      setRoleFilter={setRoleFilter ?? (() => undefined)}
      setGovernanceFilter={setGovernanceFilter ?? (() => undefined)}
      setCountryFilter={setCountryFilter ?? (() => undefined)}
      setSearchInput={setSearchInput ?? (() => undefined)}
    />,
    { locale }
  );
}

describe("ActiveFiltersRow", () => {
  test.each(["en", "ar"] as const)("%s — nothing applied renders no chips at all", locale => {
    const { container } = renderRow({ locale });
    expect(container.querySelectorAll(".MuiChip-root")).toHaveLength(0);
  });

  test.each(["en", "ar"] as const)("%s — one `filter: value` chip per applied predicate, in stable order", locale => {
    const labels = AdminUsersNs.getLabels(getTranslations(locale));
    const { container } = renderRow({
      locale,
      searchApplied: "demo",
      roleFilter: "Teacher",
      governanceFilter: "Suspended",
      countryFilter: "Egypt",
    });
    const expected = [
      `${labels.filters.search}: demo`,
      `${labels.filters.role}: ${labels.roleLabels.teacher}`,
      `${labels.filters.governance}: ${labels.statusBadges.suspended}`,
      `${labels.filters.country}: Egypt`,
    ];
    for (const label of expected) {
      expect(screen.getByText(label)).toBeDefined();
    }
    // Stable order: search → role → governance → country.
    const rendered = [...container.querySelectorAll(".MuiChip-label")].map(node => node.textContent); // label spans only — happy-dom nests the emotion style sheet inside the first chip root
    expect(rendered).toEqual(expected);
  });

  test.each(["en", "ar"] as const)("%s — removing the role chip clears ONLY the role", locale => {
    const setRoleFilter = mock<(value: "Admin" | "Teacher" | "Student" | "Parent" | "") => void>(() => undefined);
    const setGovernanceFilter = mock<(value: "Active" | "Suspended" | "Blocked" | "Deleted" | "") => void>(
      () => undefined
    );
    const setSearchInput = mock<(value: string) => void>(() => undefined);
    const setCountryFilter = mock<(value: string) => void>(() => undefined);
    const { container } = renderRow({
      locale,
      roleFilter: "Teacher",
      governanceFilter: "Active",
      searchApplied: "demo",
      setRoleFilter,
      setGovernanceFilter,
      setSearchInput,
      setCountryFilter,
    });
    const icons = [...container.querySelectorAll(".MuiChip-deleteIcon")];
    // search + role + governance = 3 applied → 3 delete icons (stable order).
    expect(icons).toHaveLength(3);
    fireEvent.click(icons[1]);
    expect(setRoleFilter).toHaveBeenCalledTimes(1);
    expect(setRoleFilter).toHaveBeenCalledWith("");
    expect(setGovernanceFilter).not.toHaveBeenCalled();
    expect(setSearchInput).not.toHaveBeenCalled();
    expect(setCountryFilter).not.toHaveBeenCalled();
  });

  test.each(["en", "ar"] as const)("%s — removing the search chip clears the applied search", locale => {
    const setSearchInput = mock<(value: string) => void>(() => undefined);
    const { container } = renderRow({ locale, searchApplied: "ali", setSearchInput });
    const icons = [...container.querySelectorAll(".MuiChip-deleteIcon")];
    expect(icons).toHaveLength(1);
    fireEvent.click(icons[0]);
    expect(setSearchInput).toHaveBeenCalledTimes(1);
    expect(setSearchInput).toHaveBeenCalledWith("");
  });

  test.each(["en", "ar"] as const)("%s — whitespace-only country draft renders no country chip", locale => {
    const labels = AdminUsersNs.getLabels(getTranslations(locale));
    const { container } = renderRow({ locale, countryFilter: "   ", searchApplied: "demo" });
    // Only the search chip exists — the trimmed country renders none.
    expect(container.querySelectorAll(".MuiChip-root")).toHaveLength(1);
    expect(screen.getByText(`${labels.filters.search}: demo`)).toBeDefined();
  });
});
