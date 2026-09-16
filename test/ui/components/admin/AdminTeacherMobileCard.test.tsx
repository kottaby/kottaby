/**
 * AdminTeacherMobileCard — component suite.
 *
 * Happy DOM tier (`test/ui/components/admin`): covers the QA-fixed layout
 * contract of the mobile teacher card's identity block across BOTH locales:
 *
 *   the header stays the 3-track grid [avatar | NAME | trailing] with the
 *   single-line ellipsis name · the email + copy affordance render in their
 *   own FULL-CARD-WIDTH row BELOW the header grid (a direct card child —
 *   no longer squeezed into the grid's middle track where addresses wrapped
 *   mid-word) · the email keeps the `dir="ltr"` bidi-isolation attribute ·
 *   the copy quick action shares the same full-width row and its resolved
 *   copy writes the clipboard and reports success exactly once · the copy
 *   click NEVER opens the detail drawer (stopPropagation against the
 *   card-level click).
 *
 * Translation discipline: assertions reference ONLY the label object
 * resolved through `AdminTeachers.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy lives here. The exception class is
 * fixture DATA (ids, an ASCII name/email) per the established suite
 * convention.
 *
 * Structure assertions are style-independent (DOM parent/sibling relations
 * + MUI class hooks) — no stylesheet/computed-style dependence, which
 * Happy DOM does not fully evaluate.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  asHTMLElement,
  cardTestHarness,
  clipboardWriteMock,
  installClipboardStub,
  previousContentElement,
} from "@/test/ui/components/admin/admin-card-test-kit";

const { cleanup, fireEvent, screen, renderWithWrapper } = await cardTestHarness();

import type { AdminTeachersQuery_adminTeachers_items } from "@/frontend/graphql/generated/gql/graphql";
import { AdminTeacherMobileCard } from "@/frontend/views/admin/teachers/AdminTeacherMobileCard";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { AdminTeachers as AdminTeachersNs } from "@/shared/locale/namespaces/adminTeachers";
import { getTranslations } from "@/shared/locale/server";

/** One directory row fixture — the generated wire shape (fixture data class). */
function teacherFixture(): AdminTeachersQuery_adminTeachers_items {
  return {
    id: 7,
    name: "Demo Certified",
    email: "certified@draftacademy.local",
    phone: "+201098765432",
    country: "Egypt",
    isApproved: true,
    isEvaluator: false,
    averageRating: 4.5,
    isOnline: true,
    subjects: ["Quran", "Tajweed"],
    isDeleted: false,
    suspended: false,
    isBlocked: false,
    createdAt: "2026-09-05T10:07:08.000Z",
  };
}

afterEach(cleanup);

/**
 * Nearest previous ELEMENT sibling that carries content — Happy DOM's
 * emotion integration interleaves `<style>` tags between the card's real
 * children, so the structural walk must skip them.
 */

/**
 * Instanceof-narrowed `Element | null` → `HTMLElement` — the runtime-checked
 * replacement for the old bare `as HTMLElement` casts on structural-walk
 * results (a broken walk fails the test through the thrown error).
 */

interface RenderOptions {
  readonly locale: AppLocale;
  readonly onCopyEmail?: () => void;
  readonly onViewDetails?: (teacher: AdminTeachersQuery_adminTeachers_items) => void;
}

function renderCard({ locale, onCopyEmail, onViewDetails }: RenderOptions): void {
  const labels = AdminTeachersNs.getLabels(getTranslations(locale));
  renderWithWrapper(
    <AdminTeacherMobileCard
      labels={labels}
      teacher={teacherFixture()}
      locale={locale}
      onCopyEmail={onCopyEmail}
      onViewDetails={onViewDetails}
    />,
    { locale }
  );
}

function copyButtonFor(locale: AppLocale) {
  const copyLabel = AdminTeachersNs.getLabels(getTranslations(locale)).quickActions.copyEmail;
  return screen.getByRole("button", { name: `${copyLabel}: certified@draftacademy.local` });
}

describe("AdminTeacherMobileCard — full-width email row", () => {
  test.each(["en", "ar"] as const)("%s — email renders in a full-card-width row OUTSIDE the header grid", locale => {
    installClipboardStub(() => Promise.resolve());
    renderCard({ locale });

    const email = screen.getByText("certified@draftacademy.local");
    // The email keeps the bidi-isolation attribute (never a CSS direction rule).
    expect(email.getAttribute("dir")).toBe("ltr");

    // Row shape: email → email row → card. The row is a DIRECT child of the
    // card (full-card-width) and its previous sibling is the header grid.
    const emailRow = asHTMLElement(email.parentElement);
    const card = asHTMLElement(emailRow.parentElement);
    expect(card.classList.contains("MuiCard-root")).toBe(true);
    const headerGrid = asHTMLElement(previousContentElement(emailRow));
    expect(headerGrid).not.toBeNull();
    // The header grid does NOT contain the email anymore — it owns only the
    // avatar + the single-line name.
    expect(headerGrid.contains(email)).toBe(false);
    expect(headerGrid.querySelector(".MuiAvatar-root")).not.toBeNull();
    expect(headerGrid.textContent).toContain("Demo Certified");
    // The copy affordance shares the SAME full-width row.
    expect(emailRow.contains(copyButtonFor(locale))).toBe(true);
  });

  test.each(["en", "ar"] as const)(
    "%s — copy contract: clipboard write + success report exactly once",
    async locale => {
      installClipboardStub(() => Promise.resolve());
      const onCopyEmail = mock<() => void>(() => undefined);
      renderCard({ locale, onCopyEmail });
      fireEvent.click(copyButtonFor(locale));
      // Let the stubbed promise settle before asserting the callback ran.
      await Promise.resolve();
      await Promise.resolve();
      expect(clipboardWriteMock().mock.calls[0]?.[0]).toBe("certified@draftacademy.local");
      expect(onCopyEmail.mock.calls).toHaveLength(1);
    }
  );

  test("copy click does NOT open the detail drawer (stopPropagation vs the card-level click)", () => {
    installClipboardStub(() => Promise.resolve());
    const onViewDetails = mock<(teacher: AdminTeachersQuery_adminTeachers_items) => void>(() => undefined);
    renderCard({ locale: "en", onViewDetails });
    fireEvent.click(copyButtonFor("en"));
    expect(onViewDetails.mock.calls).toHaveLength(0);
  });
});
