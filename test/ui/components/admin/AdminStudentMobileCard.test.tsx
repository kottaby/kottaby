/**
 * AdminStudentMobileCard — component suite.
 *
 * Happy DOM tier (`test/ui/components/admin`): covers the QA-fixed layout
 * contract of the mobile student card's identity block across BOTH locales:
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
 * resolved through `AdminStudents.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy lives here. The exception class is
 * fixture DATA (ids, an ASCII name/email) per the established suite
 * convention.
 *
 * Structure assertions are style-independent (DOM parent/sibling relations
 * + MUI class hooks) — no stylesheet/computed-style dependence, which
 * Happy DOM does not fully evaluate.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

const { cleanup, fireEvent, screen } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import type { AdminStudentsQuery_adminStudents_items } from "@/frontend/graphql/generated/gql/graphql";
import { AdminStudentMobileCard } from "@/frontend/views/admin/students/AdminStudentMobileCard";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { AdminStudents as AdminStudentsNs } from "@/shared/locale/namespaces/adminStudents";
import { getTranslations } from "@/shared/locale/server";

/** One directory row fixture — the generated wire shape (fixture data class). */
function studentFixture(): AdminStudentsQuery_adminStudents_items {
  return {
    id: 12,
    name: "Demo Student",
    email: "student@draftacademy.local",
    phone: "+201098765432",
    country: "Egypt",
    balanceHifz: 3,
    balanceReviews: 5,
    balanceTajweed: 1,
    balanceTrial: 2,
    trialGrantedAt: "2026-08-27T13:00:00.000Z",
    primaryLanguage: "Arabic",
    anotherLanguage: "English",
    hasParent: true,
    parentName: "Parent Waheed",
    parentEmail: "waheed@kottaby.test",
    createdAt: "2026-09-05T10:07:08.000Z",
  };
}

type WriteTextMock = ReturnType<typeof mock<(text: string) => Promise<void>>>;

/** Controllable clipboard stub: tests resolve/reject writes explicitly. */
let writeTextMock: WriteTextMock;

function installClipboardStub(impl: (text: string) => Promise<void>): void {
  writeTextMock = mock<(text: string) => Promise<void>>(impl);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
}

afterEach(cleanup);

/**
 * Nearest previous ELEMENT sibling that carries content — Happy DOM's
 * emotion integration interleaves `<style>` tags between the card's real
 * children, so the structural walk must skip them.
 */
function previousContentElement(element: Element): Element | null {
  let node: Element | null = element.previousElementSibling;
  while (node !== null && (node.tagName === "STYLE" || node.tagName === "LINK")) {
    node = node.previousElementSibling;
  }
  return node;
}

interface RenderOptions {
  readonly locale: AppLocale;
  readonly onCopyEmail?: () => void;
  readonly onViewDetails?: (student: AdminStudentsQuery_adminStudents_items) => void;
}

function renderCard({ locale, onCopyEmail, onViewDetails }: RenderOptions): void {
  const labels = AdminStudentsNs.getLabels(getTranslations(locale));
  renderWithWrapper(
    <AdminStudentMobileCard
      labels={labels}
      student={studentFixture()}
      locale={locale}
      onCopyEmail={onCopyEmail}
      onViewDetails={onViewDetails}
    />,
    { locale }
  );
}

function copyButtonFor(locale: AppLocale) {
  const copyLabel = AdminStudentsNs.getLabels(getTranslations(locale)).quickActions.copyEmail;
  return screen.getByRole("button", { name: `${copyLabel}: student@draftacademy.local` });
}

describe("AdminStudentMobileCard — full-width email row", () => {
  test.each(["en", "ar"] as const)("%s — email renders in a full-card-width row OUTSIDE the header grid", locale => {
    installClipboardStub(() => Promise.resolve());
    renderCard({ locale });

    const email = screen.getByText("student@draftacademy.local");
    // The email keeps the bidi-isolation attribute (never a CSS direction rule).
    expect(email.getAttribute("dir")).toBe("ltr");

    // Row shape: email → email row → card. The row is a DIRECT child of the
    // card (full-card-width) and its previous sibling is the header grid.
    const emailRow = email.parentElement as HTMLElement;
    const card = emailRow.parentElement as HTMLElement;
    expect(card.classList.contains("MuiCard-root")).toBe(true);
    const headerGrid = previousContentElement(emailRow) as HTMLElement;
    expect(headerGrid).not.toBeNull();
    // The header grid does NOT contain the email anymore — it owns only the
    // avatar + the single-line name.
    expect(headerGrid.contains(email)).toBe(false);
    expect(headerGrid.querySelector(".MuiAvatar-root")).not.toBeNull();
    expect(headerGrid.textContent).toContain("Demo Student");
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
      expect(writeTextMock.mock.calls[0]?.[0]).toBe("student@draftacademy.local");
      expect(onCopyEmail.mock.calls).toHaveLength(1);
    }
  );

  test("copy click does NOT open the detail drawer (stopPropagation vs the card-level click)", () => {
    installClipboardStub(() => Promise.resolve());
    const onViewDetails = mock<(student: AdminStudentsQuery_adminStudents_items) => void>(() => undefined);
    renderCard({ locale: "en", onViewDetails });
    fireEvent.click(copyButtonFor("en"));
    expect(onViewDetails.mock.calls).toHaveLength(0);
  });
});
