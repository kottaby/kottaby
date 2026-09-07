/**
 * RoleDashboardPage status-slot composition suite (DEV1-015 task 4.3.TE).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components`): the REAL
 * `createRoleDashboardPage` factory runs against a controlled
 * `getServerUserContext` double (the page-guard-suite convention — the real
 * `withPageAuth` guard executes; the DB/JWT machinery never loads), and the
 * returned element — the full `DashboardView` carrying the role-composed
 * `statusSlot` — renders under the shared provider stack:
 *
 *   student (en + ar) → BOTH cards compose in the status slot: the
 *   handshake-code card AND the pending parent-link requests card (title,
 *   count chip, CTA anchored to the shared route constant) alongside the
 *   untouched dashboard chrome (welcome header, stat grid) · slot ordering →
 *   HandshakeCodeCard strictly PRECEDES PendingParentLinkRequestsCard in DOM
 *   order, both sharing ONE parent element (the slot Stack) · teacher (en) →
 *   ApplicantStatusCard renders, ZERO student cards mount (absence pinned at
 *   settled AND skeleton testids), dashboard chrome intact · parent/admin
 *   (en) → empty status slot (no card of any kind), dashboard renders
 *   unchanged.
 *
 * Module doubles: `@/backend/lib/auth/server-auth` is mocked BEFORE the page
 * module's dynamic import so the real `server-auth` never executes;
 * `next/navigation` is already the translation-preload's inert double (the
 * happy-path guard never redirects, so the inert `redirect` is never hit).
 * The role matrix runs at "en" for the UNCHANGED branches — their surface is
 * pinned by absence + chrome-presence assertions, not by new copy — while the
 * CHANGED student branch drives BOTH locales per the suite convention.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the namespace handles — ZERO hardcoded
 * Arabic/English copy. Fixture DATA (full names, the handshake-code string,
 * canonical ISO instants, testids) is the sanctioned exception.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, type RenderResult, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { UserRole as BackendUserRole } from "@/backend/enum/users/user-role.enum";
import { STUDENT_LINK_REQUESTS_ROUTE } from "@/frontend/components/ui/useNotificationDrawerActions";
import { AuthContext, type AuthContextType } from "@/frontend/context/AuthContext";
import {
  ApplicantStatus,
  LinkStatus,
  type MeQuery_me,
  type MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests,
  UserRole as WireUserRole,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  myApplicantProfileQueryDocument,
  myHandshakeCodeQueryDocument,
  myIncomingParentLinkRequestsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Applicant as ApplicantNs } from "@/shared/locale/namespaces/applicant";
import { Dashboard as DashboardNs } from "@/shared/locale/namespaces/dashboard";
import { HandshakeCode as HandshakeCodeNs } from "@/shared/locale/namespaces/handshakeCode";
import { ParentLink as ParentLinkNs } from "@/shared/locale/namespaces/parentLink";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ----------------------------------------------------------------------------
// Controlled server state + module double (registered BEFORE the page import)
// ----------------------------------------------------------------------------

/** Shape of the mocked `getServerUserContext` return — all-null = anonymous. */
interface ServerContextState {
  readonly userId: number | null;
  readonly user: Record<string, never> | null;
  readonly role: string | null;
}

let serverContext: ServerContextState = { userId: null, user: null, role: null };

void mock.module("@/backend/lib/auth/server-auth", () => ({
  getServerUserContext: async (): Promise<ServerContextState> => serverContext,
}));

// The page module is imported AFTER the double so its import graph binds to
// the mock (the page-guard-suite precedent). `home/server` is the SERVER-ONLY
// barrel; the client barrel deliberately excludes this module.
const { createRoleDashboardPage } = await import("@/frontend/views/dashboard/home/server");

// ----------------------------------------------------------------------------
// Fixtures — data only
// ----------------------------------------------------------------------------

const STUDENT_FULL_NAME = "Zaid Hassan";
const TEACHER_FULL_NAME = "Omar Farouk";
const PARENT_FULL_NAME = "Layla Nasser";
const ADMIN_FULL_NAME = "Admin Fixture";

/** Canonical `KSB-XXXXXXXX` code, exactly like the handshake-card suite. */
const FIXTURE_HANDSHAKE_CODE = "KSB-4F7A2C91";

const PARENT_NAME_A = "Sara Abdulrahman";
const LIVE_EXPIRES_ISO = "2099-01-07T12:00:00.000Z";
const CREATED_AT_ISO = "2026-08-27T12:00:00.000Z";

/** One live actionable incoming row — drives the pending card's branch 4. */
function incomingRow(): MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests {
  return {
    id: "301",
    status: LinkStatus.Pending,
    parentFullName: PARENT_NAME_A,
    createdAt: CREATED_AT_ISO,
    expiresAt: LIVE_EXPIRES_ISO,
    respondedAt: null,
  };
}

/** Wire `me` row fixture (the profile-view-suite shape, role parameterized). */
type MeUserFixture = MeQuery_me & { readonly __typename: "User" };

function meUser(role: WireUserRole, fullName: string): MeUserFixture {
  return {
    __typename: "User",
    id: 1,
    email: "slot-fixture@example.test",
    fullName,
    phone: null,
    country: null,
    gender: null,
    locale: null,
    role,
    preferredRecitation: null,
    isDeleted: false,
    suspended: false,
    isBlocked: false,
  };
}

// ----------------------------------------------------------------------------
// Apollo mocks (zero-argument queries — `variables` omitted or `{}` on wire)
// ----------------------------------------------------------------------------

/** Handshake-code success — the student card's settled branch. */
function handshakeCodeMock(): MockLink.MockedResponse {
  return {
    request: { query: myHandshakeCodeQueryDocument },
    result: { data: { myHandshakeCode: FIXTURE_HANDSHAKE_CODE } },
  };
}

/** Incoming-list success with one live actionable row. */
function incomingListMock(): MockLink.MockedResponse {
  return {
    request: { query: myIncomingParentLinkRequestsQueryDocument, variables: {} },
    result: { data: { myIncomingParentLinkRequests: [incomingRow()] } },
  };
}

/** Applicant-profile success in the Pending branch — the teacher card. */
function applicantProfileMock(): MockLink.MockedResponse {
  return {
    request: { query: myApplicantProfileQueryDocument },
    result: {
      data: {
        myApplicantProfile: {
          id: 42424,
          status: ApplicantStatus.Pending,
          verificationAttempts: 0,
          lastAttemptAt: null,
          cooldownUntil: null,
          cooldownActive: false,
          canPurchaseVerification: true,
        },
      },
    },
  };
}

// ----------------------------------------------------------------------------
// Render helpers
// ----------------------------------------------------------------------------

function makeAuthContext(user: MeUserFixture): AuthContextType {
  return {
    user,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    login: async () => false,
    logout: () => undefined,
  };
}

/**
 * Runs the REAL page factory for the given role against the controlled
 * server context, then renders the produced element (DashboardView + slot)
 * under the shared provider stack.
 */
async function renderRoleDashboard(
  role: BackendUserRole,
  path: string,
  user: MeUserFixture,
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale
): Promise<RenderResult> {
  serverContext = { userId: 42, user: {}, role };
  const element: ReactElement = await createRoleDashboardPage(role, path);
  // Built OUTSIDE the JSX prop so the context value is not re-constructed
  // inline (jsx-no-constructed-context-values — the profile-view pattern).
  const authContext = makeAuthContext(user);
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <AuthContext.Provider value={authContext}>{element}</AuthContext.Provider>
    </MockedProvider>,
    { locale }
  );
}

/** Asserts the dashboard chrome every role shares is intact. */
function expectDashboardChrome(td: ReturnType<typeof DashboardNs.getLabels>, fullName: string): void {
  expect(screen.getByText(td.welcome(fullName))).toBeDefined();
  // The 2x2 stat grid renders above/below the slot — unchanged for all roles.
  expect(screen.getByText(td.sessionsCompleted)).toBeDefined();
}

/** Asserts NEITHER student card mounts (settled nor skeleton surface). */
function expectNoStudentCards(): void {
  expect(screen.queryByTestId("handshake-code-card")).toBeNull();
  expect(screen.queryByTestId("handshake-code-card-loading")).toBeNull();
  expect(screen.queryByTestId("pending-parent-link-requests-card")).toBeNull();
  expect(screen.queryByTestId("pending-parent-link-requests-card-loading")).toBeNull();
  expect(screen.queryByTestId("pending-parent-link-requests-card-error")).toBeNull();
}

beforeEach(() => {
  serverContext = { userId: null, user: null, role: null };
});

afterEach(cleanup);

// ----------------------------------------------------------------------------
// Student status slot — the CHANGED branch, driven across BOTH locales
// ----------------------------------------------------------------------------

for (const locale of ["ar", "en"] as AppLocale[]) {
  const td = DashboardNs.getLabels(getTranslations(locale));
  const th = HandshakeCodeNs.getLabels(getTranslations(locale));
  const tp = ParentLinkNs.getLabels(getTranslations(locale));

  describe(`RoleDashboardPage student status slot (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("student → BOTH cards compose in the status slot beside the untouched dashboard chrome", async () => {
      await renderRoleDashboard(
        BackendUserRole.Student,
        "/student/dashboard",
        meUser(WireUserRole.Student, STUDENT_FULL_NAME),
        [handshakeCodeMock(), incomingListMock()],
        locale
      );

      // Card 1 — handshake code (settled, translated title + code chip).
      expect(await screen.findByTestId("handshake-code-card")).toBeDefined();
      expect(screen.getByText(th.yourCodeTitle)).toBeDefined();

      // Card 2 — pending parent-link requests (settled: title + count chip
      // + the ONE CTA anchored to the shared decision route constant).
      const pendingCard = await screen.findByTestId("pending-parent-link-requests-card");
      expect(within(pendingCard).getByText(tp.dashboardCardTitle)).toBeDefined();
      expect(within(pendingCard).getByText(tp.dashboardCardCount(1))).toBeDefined();
      const cta = within(pendingCard).getByRole("link", { name: tp.dashboardCardCta });
      // Constant wiring + frozen-value pin (the 4.1 belt-and-braces precedent).
      expect(cta.getAttribute("href")).toBe(STUDENT_LINK_REQUESTS_ROUTE);
      expect(cta.getAttribute("href")).toBe("/student/link-requests");

      // The dashboard around the slot is untouched: welcome header + stats.
      expectDashboardChrome(td, STUDENT_FULL_NAME);
    });

    test("slot composition — HandshakeCodeCard precedes PendingParentLinkRequestsCard as Stack siblings", async () => {
      await renderRoleDashboard(
        BackendUserRole.Student,
        "/student/dashboard",
        meUser(WireUserRole.Student, STUDENT_FULL_NAME),
        [handshakeCodeMock(), incomingListMock()],
        locale
      );

      const handshakeCard = await screen.findByTestId("handshake-code-card");
      const pendingCard = await screen.findByTestId("pending-parent-link-requests-card");

      // DOM order: handshake strictly BEFORE pending (plan D6 ordering).
      expect(handshakeCard.compareDocumentPosition(pendingCard) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      // Sibling composition: both cards share ONE parent — the slot Stack —
      // so the spacing wrapper composes them rather than nesting either.
      expect(pendingCard.parentElement).not.toBeNull();
      expect(handshakeCard.parentElement).toBe(pendingCard.parentElement);
    });
  });
}

// ----------------------------------------------------------------------------
// Other roles — UNCHANGED surfaces (en matrix; absence + chrome pinning)
// ----------------------------------------------------------------------------

describe("RoleDashboardPage other-role slots (en) — unchanged surfaces", () => {
  const td = DashboardNs.getLabels(getTranslations("en"));
  const ta = ApplicantNs.getLabels(getTranslations("en"));

  test("teacher → ApplicantStatusCard renders; zero student cards mount", async () => {
    await renderRoleDashboard(
      BackendUserRole.Teacher,
      "/teacher/dashboard",
      meUser(WireUserRole.Teacher, TEACHER_FULL_NAME),
      [applicantProfileMock()],
      "en"
    );

    // The EXISTING teacher status content, unchanged.
    expect(await screen.findByTestId("applicant-status-card")).toBeDefined();
    expect(screen.getByText(ta.statusPending)).toBeDefined();

    // Neither student card mounts — not settled, not even a skeleton.
    expectNoStudentCards();
    expectDashboardChrome(td, TEACHER_FULL_NAME);
  });

  test.each([
    ["parent", BackendUserRole.Parent, WireUserRole.Parent, "/parent/dashboard", PARENT_FULL_NAME],
    ["admin", BackendUserRole.Admin, WireUserRole.Admin, "/admin/dashboard", ADMIN_FULL_NAME],
  ])("%s → empty status slot; dashboard renders unchanged", async (_role, backendRole, wireRole, path, fullName) => {
    // No Apollo mocks: parent/admin fire NO queries — an unmatched operation
    // would surface as a MockLink error if the slot ever mounted a card.
    await renderRoleDashboard(backendRole, path, meUser(wireRole, fullName), [], "en");

    expect(await screen.findByText(td.welcome(fullName))).toBeDefined();
    expectDashboardChrome(td, fullName);

    // Slot stays empty: no student cards, no teacher card.
    expectNoStudentCards();
    expect(screen.queryByTestId("applicant-status-card")).toBeNull();
    expect(screen.queryByTestId("applicant-status-card-loading")).toBeNull();
  });
});
