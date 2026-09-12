/**
 * ParentChildrenRootContainer — component suite.
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components`): every
 * outcome state of the portal root container gets ONE render case, driven
 * across BOTH locales (RTL `ar` + LTR `en`):
 *
 *   cold load → skeleton (`aria-busy`, zero-children list snapshot yet) ·
 *   zero linked children → `IconCircleEmptyState` + handshake CTA (the
 *   CTA deep-links to `/parent/handshake` on click) · loaded list →
 *   portal header + children count + per-child `ChildCard` (full name +
 *   link-establishment date, both `dir="auto"`) · click `ChildCard` →
 *   `router.push('/parent/children/<id>')` · `?student=` URL-param
 *   behavior: empty `student` AND ≥1 child resolved → `router.replace`
 *   auto-selects the first child's detail URL (client-side, never
 *   server-side) · `?student=<id>` present → no auto-replace (the param
 *   signals explicit list browsing) · FORBIDDEN denial →
 *   `PermissionDeniedFallback` (constant-shape; the server's `message`
 *   is NEVER rendered) · other transport error → `ErrorRetryAlert` with
 *   the localized title + retry affordance (refetches on click).
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through `ParentMonitoring.getLabels(getTranslations(locale))`,
 * `Errors.getLabels(...)`, and `Common.getLabels(...)` — ZERO hardcoded
 * Arabic/English copy lives here. The exception class is fixture DATA
 * (the canonical ISO instants + child display names, with every formatted
 * stamp DERIVED through the real `formatApplicantDate` helper — not
 * eyeballed) plus technical tokens (operation names, error codes, testids).
 *
 * Network discipline: every render mounts a RECORDING `ApolloLink` in
 * front of the `MockLink`; the read-only posture assertion inspects real
 * link traffic — ZERO mutation operations may cross the wire (the portal
 * is a pure read surface).
 *
 * Static discipline verified alongside (grep): `useMutation` appears
 * NOWHERE in the container or its children; no `.skip(`/`.only(` markers
 * exist in this suite.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { ParentChildrenRootContainer } from "@/frontend/views/parent/monitoring";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Common as CommonNs } from "@/shared/locale/namespaces/common";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { ParentMonitoring as ParentMonitoringNs } from "@/shared/locale/namespaces/parentMonitoring";
import { getTranslations } from "@/shared/locale/server";
import { resetNavigationCalls, testNavigationState } from "@/test/ui/components/translation-preload";
import {
  CHILD_A_ID,
  CHILD_A_NAME,
  CHILD_B_ID,
  CHILD_B_NAME,
  CREATED_AT_ISO,
  createNetworkTraffic,
  expectZeroMutations,
  linkedChildFixture,
  linkedFailureMock,
  linkedInFlightMock,
  linkedListMock,
  renderPortal,
  settleNetwork,
} from "./helpers";

/** Never rendered — the raw transport message stays behind the `extractErrorCode` boundary. */
const RAW_TRANSPORT_MESSAGE_SENTINEL = "FORBIDDEN (masked transport surface)";

afterEach(() => {
  cleanup();
  resetNavigationCalls();
});

for (const locale of ["ar", "en"] as AppLocale[]) {
  const t = ParentMonitoringNs.getLabels(getTranslations(locale));
  const te = ErrorsNs.getLabels(getTranslations(locale));
  const tc = CommonNs.getLabels(getTranslations(locale));

  describe(`ParentChildrenRootContainer (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("cold load → skeleton region with aria-busy; ZERO mutation operations on the wire", async () => {
      const traffic = createNetworkTraffic();
      renderPortal(<ParentChildrenRootContainer student={null} />, traffic, [linkedInFlightMock()], locale);

      // The skeleton region mounts immediately (stateful query in flight, no
      // snapshot yet). `aria-busy` is the screen-reader affordance for the
      // loading state.
      const skeleton = screen.getByTestId("parent-children-loading");
      expect(skeleton.getAttribute("aria-busy")).toBe("true");

      // The portal header renders even during cold load (the page chrome is
      // independent of the query state).
      expect(screen.getByText(t.portalPageTitle)).toBeDefined();
      expect(screen.getByText(t.portalPageSubtitle)).toBeDefined();

      // No list, no empty state — the skeleton is the body.
      expect(screen.queryByTestId("parent-children-list")).toBeNull();
      expect(screen.queryByTestId("parent-children-empty")).toBeNull();

      // The auto-select-first effect does NOT fire while children are
      // undefined (no destination id yet).
      expect(testNavigationState.replaceCalls).toEqual([]);

      // Read-only posture: ZERO mutations on the wire.
      await settleNetwork();
      expectZeroMutations(traffic);
    });

    test("zero linked children → empty state + handshake CTA; CTA click deep-links to /parent/handshake", async () => {
      const traffic = createNetworkTraffic();
      renderPortal(<ParentChildrenRootContainer student={null} />, traffic, [linkedListMock([])], locale);

      // The empty state renders with the localized title + body.
      await waitFor(() => {
        expect(screen.getByTestId("parent-children-empty")).toBeDefined();
      });
      expect(screen.getByText(t.childrenEmptyTitle)).toBeDefined();
      expect(screen.getByText(t.childrenEmptyBody)).toBeDefined();

      // The handshake CTA deep-links to the parent handshake route.
      const cta = screen.getByRole("button", { name: t.childrenEmptyCta });
      const user = userEvent.setup();
      await user.click(cta);
      expect(testNavigationState.pushCalls).toEqual(["/parent/handshake"]);

      // No list renders on the empty branch; no auto-replace fires (zero
      // children means no destination id).
      expect(screen.queryByTestId("parent-children-list")).toBeNull();
      expect(testNavigationState.replaceCalls).toEqual([]);

      // Read-only posture holds.
      expectZeroMutations(traffic);
    });

    test("loaded list → portal header + children count + per-child ChildCard (fullName + link-establishment date, both dir=auto)", async () => {
      const traffic = createNetworkTraffic();
      const childA = linkedChildFixture();
      const childB = linkedChildFixture({ id: CHILD_B_ID, fullName: CHILD_B_NAME });
      renderPortal(
        <ParentChildrenRootContainer student={"list-browsing"} />,
        traffic,
        [linkedListMock([childA, childB])],
        locale
      );

      // The list region gates every synchronous row assertion below.
      const list = await screen.findByTestId("parent-children-list");
      expect(list.getAttribute("aria-label")).toBe(t.portalPageTitle);

      // The portal header + the children-count line render verbatim.
      expect(screen.getByText(t.portalPageTitle)).toBeDefined();
      expect(screen.getByText(t.childrenCount(2))).toBeDefined();

      // Each child card carries the full name + the formatted
      // link-establishment date — both `dir="auto"` (bidi isolation).
      const nameA = screen.getByText(CHILD_A_NAME);
      expect(nameA.getAttribute("dir")).toBe("auto");
      const nameB = screen.getByText(CHILD_B_NAME);
      expect(nameB.getAttribute("dir")).toBe("auto");
      expect(screen.getAllByText(formatApplicantDate(CREATED_AT_ISO, locale)).length).toBe(2);

      // Two cards rendered (one per linked child).
      expect(screen.getAllByTestId("parent-child-card").length).toBe(2);

      // The `?student=` prop is present → no auto-replace fires (the param
      // signals explicit list browsing, not cold-entry).
      expect(testNavigationState.replaceCalls).toEqual([]);

      // Read-only posture holds.
      expectZeroMutations(traffic);
    });

    test("click ChildCard → router.push('/parent/children/<id>') (path-segment navigation, back-button support)", async () => {
      const traffic = createNetworkTraffic();
      renderPortal(
        <ParentChildrenRootContainer student={"list-browsing"} />,
        traffic,
        [linkedListMock([linkedChildFixture()])],
        locale
      );

      const card = await screen.findByTestId("parent-child-card");
      const user = userEvent.setup();
      await user.click(card);

      // The card click navigates to the child's detail URL via path segment
      // (NOT a query param — the URL IS the state).
      expect(testNavigationState.pushCalls).toEqual([`/parent/children/${CHILD_A_ID}`]);

      // Read-only posture holds.
      expectZeroMutations(traffic);
    });

    test("empty `student` prop AND ≥1 child resolved → router.replace auto-selects the first child's detail URL (client-side)", async () => {
      const traffic = createNetworkTraffic();
      renderPortal(
        <ParentChildrenRootContainer student={null} />,
        traffic,
        [linkedListMock([linkedChildFixture()])],
        locale
      );

      // The auto-select-first effect fires once the query resolves with ≥1
      // child AND the `student` prop is empty. `router.replace` keeps the
      // history clean (no back-button churn for the auto-redirect).
      await waitFor(() => {
        expect(testNavigationState.replaceCalls).toEqual([`/parent/children/${CHILD_A_ID}`]);
      });

      // The list still renders behind the redirect (the redirect is a
      // navigation side-effect, not a render-state change).
      expect(screen.getByTestId("parent-children-list")).toBeDefined();

      // Read-only posture holds.
      expectZeroMutations(traffic);
    });

    test("empty `student` prop AND zero children → NO auto-replace (zero children means no destination id)", async () => {
      const traffic = createNetworkTraffic();
      renderPortal(<ParentChildrenRootContainer student={null} />, traffic, [linkedListMock([])], locale);

      await waitFor(() => {
        expect(screen.getByTestId("parent-children-empty")).toBeDefined();
      });
      // The auto-select-first effect's guard (`children.length > 0`) prevents
      // the replace from firing on the empty-children branch.
      expect(testNavigationState.replaceCalls).toEqual([]);

      // Read-only posture holds.
      expectZeroMutations(traffic);
    });

    test("FORBIDDEN denial → PermissionDeniedFallback replaces the container; the server's raw message NEVER renders", async () => {
      const traffic = createNetworkTraffic();
      renderPortal(<ParentChildrenRootContainer student={null} />, traffic, [linkedFailureMock("FORBIDDEN")], locale);

      // The denial surface replaces the container — never bare null. The
      // `errors.forbiddenRole` title + `errors.forbidden` description ride
      // the constant-shape denial (the server's `message` is masked behind
      // `extractErrorCode`).
      await waitFor(() => {
        expect(screen.getByText(te.forbiddenRole)).toBeDefined();
      });
      expect(screen.getByText(te.forbidden)).toBeDefined();

      // No portal chrome, no list, no skeleton — the denial IS the surface.
      expect(screen.queryByText(t.portalPageTitle)).toBeNull();
      expect(screen.queryByTestId("parent-children-list")).toBeNull();
      expect(screen.queryByTestId("parent-children-loading")).toBeNull();

      // SEC: the raw transport message (which carries the error code) never
      // reaches the DOM — the denial copy is the localized namespace string.
      expect(screen.queryByText(RAW_TRANSPORT_MESSAGE_SENTINEL)).toBeNull();

      // Read-only posture holds (the denial arrived over a query, not a mutation).
      expectZeroMutations(traffic);
    });

    test("UNAUTHORIZED denial → PermissionDeniedFallback (same constant-shape surface as FORBIDDEN)", async () => {
      const traffic = createNetworkTraffic();
      renderPortal(
        <ParentChildrenRootContainer student={null} />,
        traffic,
        [linkedFailureMock("UNAUTHORIZED")],
        locale
      );

      // UNAUTHORIZED is classified through the same `extractErrorCode` path
      // as FORBIDDEN — both terminate at the PermissionDeniedFallback.
      await waitFor(() => {
        expect(screen.getByText(te.forbiddenRole)).toBeDefined();
      });
      expect(screen.getByText(te.forbidden)).toBeDefined();
      expect(screen.queryByText(t.portalPageTitle)).toBeNull();
      expect(screen.queryByText(RAW_TRANSPORT_MESSAGE_SENTINEL)).toBeNull();

      // Read-only posture holds.
      expectZeroMutations(traffic);
    });

    test("generic transport failure → ErrorRetryAlert with localized title + retry affordance (refetches on click)", async () => {
      const traffic = createNetworkTraffic();
      // Two identical mocks consumed in order: the first attempt fails
      // generically; the retry's forced refetch resolves with one child.
      renderPortal(
        <ParentChildrenRootContainer student={"list-browsing"} />,
        traffic,
        [linkedFailureMock("INTERNAL_SERVER_ERROR"), linkedListMock([linkedChildFixture()])],
        locale
      );

      // The generic-error surface renders the localized title + the
      // localized body + the retry affordance. The form survives the
      // generic failure (retry is possible).
      await waitFor(() => {
        expect(screen.getByText(te.internalServerError)).toBeDefined();
      });
      expect(screen.getByText(t.loadErrorBody)).toBeDefined();
      const retryButton = screen.getByRole("button", { name: tc.retry });
      expect(retryButton.getAttribute("disabled")).toBeNull();

      // NOT the denial surface, NOT the list, NOT the skeleton.
      expect(screen.queryByText(te.forbiddenRole)).toBeNull();
      expect(screen.queryByTestId("parent-children-list")).toBeNull();
      expect(screen.queryByTestId("parent-children-loading")).toBeNull();

      // Click retry → the refetch resolves with one child → the list
      // replaces the error surface.
      const user = userEvent.setup();
      await user.click(retryButton);
      await waitFor(() => {
        expect(screen.getByTestId("parent-children-list")).toBeDefined();
      });
      expect(screen.queryByText(te.internalServerError)).toBeNull();

      // Read-only posture holds (the retry refetched the SAME query — no
      // mutation crossed the wire).
      expectZeroMutations(traffic);
    });
  });
}
