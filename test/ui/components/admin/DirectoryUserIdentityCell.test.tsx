/**
 * DirectoryUserIdentityCell — component suite.
 *
 * Happy DOM tier (`test/ui/components`): covers the USER-column identity
 * cell of the admin directory table across BOTH locales, with emphasis on
 * the copy-email quick action contract:
 *
 *   render (name link + email + copy affordance) · successful copy writes
 *   the clipboard and reports success · rejected clipboard write stays
 *   silent (the shared snackbar must never announce a copy that failed).
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * object resolved through `AdminUsers.getLabels(getTranslations(locale))` —
 * ZERO hardcoded Arabic/English copy lives here. The exception class is
 * fixture DATA (ids, an ASCII name/email) per the established suite
 * convention.
 *
 * The clipboard is stubbed with a controllable deferred promise so both the
 * resolve and reject paths are deterministic (happy-dom exposes no real
 * async clipboard).
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

const { cleanup, fireEvent, screen } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { type AdminUsersQuery_adminUsers_items, Gender, UserRole } from "@/frontend/graphql/generated/gql/graphql";
import { DirectoryUserIdentityCell } from "@/frontend/views/admin/users/directory";
import { asDirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { AdminUsers as AdminUsersNs } from "@/shared/locale/namespaces/adminUsers";
import { getTranslations } from "@/shared/locale/server";

/** Deterministic identity payload (fixture data — ASCII, email-shaped). */
function userFixture(): AdminUsersQuery_adminUsers_items {
  return {
    id: 909,
    fullName: "Copy Target User",
    email: "copy.target@example.com",
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

function renderCell(locale: AppLocale, onCopyEmail?: () => void): void {
  const labels = AdminUsersNs.getLabels(getTranslations(locale));
  renderWithWrapper(
    <table>
      <tbody>
        <tr>
          <DirectoryUserIdentityCell
            user={userFixture()}
            role={asDirectoryRole(UserRole.Admin)}
            labels={labels}
            onCopyEmail={onCopyEmail}
          />
        </tr>
      </tbody>
    </table>,
    { locale }
  );
}

function copyButtonFor(locale: AppLocale) {
  const copyLabel = AdminUsersNs.getLabels(getTranslations(locale)).quickActions.copyEmail;
  return screen.getByRole("button", { name: `${copyLabel}: copy.target@example.com` });
}

describe("DirectoryUserIdentityCell", () => {
  describe("both locales", () => {
    test.each(["en", "ar"] as const)("%s — renders identity with accessible copy affordance", locale => {
      installClipboardStub(() => Promise.resolve());
      renderCell(locale);
      const labels = AdminUsersNs.getLabels(getTranslations(locale));
      const link = screen.getByRole("link", {
        name: `${labels.quickActions.viewProfile}: Copy Target User`,
      });
      expect(link).toBeDefined();
      expect(copyButtonFor(locale)).toBeDefined();
      expect(screen.getByText("copy.target@example.com")).toBeDefined();
    });
  });

  describe("copy-email contract", () => {
    test("resolved copy writes the clipboard and reports success exactly once", async () => {
      installClipboardStub(() => Promise.resolve());
      const onCopyEmail = mock<() => void>(() => undefined);
      renderCell("en", onCopyEmail);
      fireEvent.click(copyButtonFor("en"));
      // Let the stubbed promise settle before asserting the callback ran.
      await Promise.resolve();
      await Promise.resolve();
      expect(writeTextMock.mock.calls[0]?.[0]).toBe("copy.target@example.com");
      expect(onCopyEmail.mock.calls).toHaveLength(1);
    });

    test("rejected clipboard write stays silent — no success report", async () => {
      installClipboardStub(
        () =>
          new Promise<void>((_, reject) => {
            // The write self-rejects on the next microtask, after the click.
            queueMicrotask(() => reject(new Error("clipboard denied")));
          })
      );
      const onCopyEmail = mock<() => void>(() => undefined);
      renderCell("en", onCopyEmail);
      fireEvent.click(copyButtonFor("en"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(onCopyEmail.mock.calls).toHaveLength(0);
    });
  });
});
