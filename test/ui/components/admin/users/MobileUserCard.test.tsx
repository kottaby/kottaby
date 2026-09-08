/**
 * MobileUserCard — component suite (the users directory's mobile identity
 * block: `MobileUserName` + `MobileUserIdentity` in their real composition).
 *
 * Happy DOM tier (`test/ui/components/admin/users`): covers the QA-fixed
 * layout contract of the mobile user card across BOTH locales:
 *
 *   the header stays the 3-track grid [avatar | NAME profile link |
 *   trailing] with the single-line ellipsis name · the email + copy
 *   affordance render in their own FULL-CARD-WIDTH row BELOW the header
 *   grid (no longer squeezed into the grid's middle track where addresses
 *   wrapped mid-word) · the role pill stays in the identity area under the
 *   email row · the email keeps the `dir="ltr"` bidi-isolation attribute ·
 *   the copy quick action shares the same full-width row and its resolved
 *   copy writes the clipboard and reports success exactly once (no
 *   card-level click exists on this surface, so no stopPropagation is
 *   needed — parity with the desktop identity cell).
 *
 * Translation discipline: assertions reference ONLY the label object
 * resolved through `AdminUsers.getLabels(getTranslations(locale))` —
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

import { type AdminUsersQuery_adminUsers_items, Gender, UserRole } from "@/frontend/graphql/generated/gql/graphql";
import { MobileUserCard } from "@/frontend/views/admin/users/directory";
import { asDirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { AdminUsers as AdminUsersNs } from "@/shared/locale/namespaces/adminUsers";
import { getTranslations } from "@/shared/locale/server";

/** Deterministic identity payload (fixture data — ASCII, email-shaped). */
function userFixture(): AdminUsersQuery_adminUsers_items {
  return {
    id: 909,
    fullName: "Identity Target User",
    email: "identity@draftacademy.local",
    phone: "+201234567890",
    role: UserRole.Admin,
    gender: Gender.Male,
    dateOfBirth: null,
    country: "Egypt",
    isDeleted: false,
    suspended: false,
    isBlocked: false,
    lastActiveAt: "2026-09-05T10:00:00.000Z",
    createdAt: "2026-09-05T09:00:00.000Z",
    applicantStatus: null,
    teacherIsApproved: null,
    teacherIsEvaluator: null,
    studentHasParentLink: null,
    studentHasActiveSubscription: null,
    parentLinkedChildrenCount: null,
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
}

function renderCard({ locale, onCopyEmail }: RenderOptions): void {
  const labels = AdminUsersNs.getLabels(getTranslations(locale));
  const user = userFixture();
  renderWithWrapper(
    <MobileUserCard
      labels={labels}
      user={user}
      locale={locale}
      onEdit={() => undefined}
      onDelete={() => undefined}
      onCopyEmail={onCopyEmail}
    />,
    { locale }
  );
}

function copyButtonFor(locale: AppLocale) {
  const copyLabel = AdminUsersNs.getLabels(getTranslations(locale)).quickActions.copyEmail;
  return screen.getByRole("button", { name: `${copyLabel}: identity@draftacademy.local` });
}

describe("MobileUserCard — full-width email row + role pill", () => {
  test.each(["en", "ar"] as const)(
    "%s — email + role pill render in the identity block OUTSIDE the header grid",
    locale => {
      installClipboardStub(() => Promise.resolve());
      renderCard({ locale });

      const email = screen.getByText("identity@draftacademy.local");
      // The email keeps the bidi-isolation attribute (never a CSS direction rule).
      expect(email.getAttribute("dir")).toBe("ltr");

      // Identity block shape: email → email row → identity root → card. The
      // identity root is a DIRECT child of the card (full-card-width) and its
      // previous content sibling is the header grid.
      const emailRow = email.parentElement as HTMLElement;
      const identityRoot = emailRow.parentElement as HTMLElement;
      const card = identityRoot.parentElement as HTMLElement;
      expect(card.classList.contains("MuiCard-root")).toBe(true);
      const headerGrid = previousContentElement(identityRoot) as HTMLElement;
      expect(headerGrid).not.toBeNull();
      // The header grid does NOT contain the email anymore — it owns the
      // avatar + the single-line NAME PROFILE LINK (the card renders one
      // view-profile link with this aria-label — the kebab menu is a button).
      expect(headerGrid.contains(email)).toBe(false);
      expect(headerGrid.querySelector(".MuiAvatar-root")).not.toBeNull();
      const labels = AdminUsersNs.getLabels(getTranslations(locale));
      const nameLink = screen.getByRole("link", {
        name: `${labels.quickActions.viewProfile}: Identity Target User`,
      });
      expect(headerGrid.contains(nameLink)).toBe(true);
      // The copy affordance shares the SAME full-width row.
      expect(emailRow.contains(copyButtonFor(locale))).toBe(true);
      // The role pill stays in the identity area, under the email row.
      expect(identityRoot.textContent).toContain(labels.roleLabels.admin);
    }
  );

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
      expect(writeTextMock.mock.calls[0]?.[0]).toBe("identity@draftacademy.local");
      expect(onCopyEmail.mock.calls).toHaveLength(1);
    }
  );

  test("asDirectoryRole maps the fixture wire role to the pill's DirectoryRole union", () => {
    // Sanity pin for the prop threading the suite relies on (wire UserRole →
    // DirectoryRole pill lane).
    expect(asDirectoryRole(UserRole.Admin)).toBe("Admin");
  });
});
