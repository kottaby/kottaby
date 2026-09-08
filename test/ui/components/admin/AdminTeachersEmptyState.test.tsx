/**
 * AdminTeachersEmptyState — component suite.
 *
 * Happy DOM tier (`test/ui/components/admin`): covers the CTA contract of
 * the teacher directory's empty state across BOTH locales:
 *
 *   unfiltered zero-teachers state renders the PRIMARY "review user
 *   accounts" CTA (Link → /admin/users) · the SECONDARY "review join
 *   requests" CTA renders only when the applicant queue holds ≥1 row, sits
 *   UNDER the primary CTA, is deliberately NOT a Link (the surface owns the
 *   tab state — no URL navigation), and invokes the `onReviewApplicants`
 *   callback on click (the surface flips the tab exactly like the tab strip
 *   does) · a resolved/empty queue (0 applicants) hides the secondary CTA —
 *   the empty state never offers a dead CTA · the filtered variant stays
 *   CTA-free entirely.
 *
 * Translation discipline: assertions reference ONLY the label object
 * resolved through `AdminTeachers.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy lives here. No fixture data needed
 * (the empty state renders copy only).
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

const { cleanup, fireEvent, screen } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { AdminTeachersEmptyState } from "@/frontend/views/admin/teachers/AdminTeachersEmptyState";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { AdminTeachers as AdminTeachersNs } from "@/shared/locale/namespaces/adminTeachers";
import { getTranslations } from "@/shared/locale/server";

afterEach(cleanup);

interface RenderOptions {
  readonly locale: AppLocale;
  readonly hasFilters?: boolean;
  readonly hasApplicants?: boolean;
  readonly onReviewApplicants?: () => void;
}

function renderEmptyState({
  locale,
  hasFilters = false,
  hasApplicants = false,
  onReviewApplicants,
}: RenderOptions): void {
  const labels = AdminTeachersNs.getLabels(getTranslations(locale));
  renderWithWrapper(
    <AdminTeachersEmptyState
      labels={labels}
      hasFilters={hasFilters}
      hasApplicants={hasApplicants}
      onReviewApplicants={onReviewApplicants ?? (() => undefined)}
    />,
    { locale }
  );
}

describe("AdminTeachersEmptyState — join-requests CTA", () => {
  test.each(["en", "ar"] as const)(
    "%s — unfiltered state: primary users CTA renders, secondary joins it at ≥1 applicant",
    locale => {
      const labels = AdminTeachersNs.getLabels(getTranslations(locale));
      const onReviewApplicants = mock<() => void>(() => undefined);

      // Zero applicants — ONLY the users CTA renders (no dead CTA). The users
      // CTA is a Link (component={Link} → anchor role); the join-requests CTA
      // is a plain button.
      renderEmptyState({ locale, hasApplicants: false, onReviewApplicants });
      const usersCta = screen.getByRole("link", { name: labels.emptyState.cta });
      expect(usersCta.getAttribute("href")).toBe("/admin/users");
      expect(screen.queryByRole("button", { name: labels.emptyState.reviewApplicants })).toBeNull();
      cleanup();

      // ≥1 applicant — BOTH CTAs render, the join-requests CTA second.
      renderEmptyState({ locale, hasApplicants: true, onReviewApplicants });
      expect(screen.getByRole("link", { name: labels.emptyState.cta })).toBeDefined();
      const secondary = screen.getByRole("button", { name: labels.emptyState.reviewApplicants });
      // Deliberately NOT a Link — the surface owns the tab state.
      expect(secondary.closest("a")).toBeNull();
    }
  );

  test.each(["en", "ar"] as const)("%s — clicking the join-requests CTA flips the tab via the callback", locale => {
    const labels = AdminTeachersNs.getLabels(getTranslations(locale));
    const onReviewApplicants = mock<() => void>(() => undefined);
    renderEmptyState({ locale, hasApplicants: true, onReviewApplicants });
    fireEvent.click(screen.getByRole("button", { name: labels.emptyState.reviewApplicants }));
    expect(onReviewApplicants.mock.calls).toHaveLength(1);
  });

  test.each(["en", "ar"] as const)("%s — filtered state renders NO CTAs at all", locale => {
    const labels = AdminTeachersNs.getLabels(getTranslations(locale));
    renderEmptyState({ locale, hasFilters: true, hasApplicants: true });
    expect(screen.queryByRole("link", { name: labels.emptyState.cta })).toBeNull();
    expect(screen.queryByRole("button", { name: labels.emptyState.reviewApplicants })).toBeNull();
  });
});
