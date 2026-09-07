/**
 * PendingParentLinkRequestsCard — component suite (DEV1-015 task 4.2.TE).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components`): the
 * REQ-064 dashboard-card matrix gets ONE render case per outcome, driven
 * across BOTH locales:
 *
 *   cold load → skeleton card with `aria-busy` · zero actionable → renders
 *   NOTHING (container is empty, REQ-015/052) · present-1 → title +
 *   count-1 chip + FULL requester name + CTA anchored to the shared
 *   `STUDENT_LINK_REQUESTS_ROUTE` (constant wiring + frozen-value pin) ·
 *   present-N → count-N chip + MOST RECENT requester (max `createdAt`,
 *   no per-request list) · query error → ONE localized inline Alert
 *   (masked code folds onto the generic copy — raw wire message NEVER in
 *   the DOM) + retry invoking a real refetch · post-decision
 *   disappearance → normalized cache write-back flips the row to
 *   Confirmed → actionable 0 → the card unmounts (REQ-016 convergence) ·
 *   expired-row exclusion → a stored-pending row past `expiresAt` is NOT
 *   counted even when it is the newest by `createdAt`.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the namespace handles — ZERO hardcoded
 * Arabic/English copy. Fixture DATA (parent full names, canonical ISO
 * instants, the masked wire message asserted ONLY by absence, operation
 * names, testids) is the sanctioned exception.
 *
 * Pure-helper units: `deriveActionableIncoming` edges (empty, all-terminal,
 * boundary instant `expiresAt === now` NOT actionable, ordering by
 * `createdAt` max rather than array order, mixed counting) run in the same
 * file — locale-independent by construction.
 */

// Apollo Client v4 restructured the testing surface: the component provider
// moved into the nested `testing/react` entrypoint, and the wire-shape types
// were consolidated under the non-deprecated `MockLink` namespace.
import { afterEach, describe, expect, test } from "bun:test";
import { type ApolloClient, ApolloLink } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, type RenderResult, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { STUDENT_LINK_REQUESTS_ROUTE } from "@/frontend/components/ui/useNotificationDrawerActions";
import {
  LinkStatus,
  type MyIncomingParentLinkRequestsQuery,
  type MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests,
} from "@/frontend/graphql/generated/gql/graphql";
import { myIncomingParentLinkRequestsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { PendingParentLinkRequestsCard } from "@/frontend/views/students/dashboard/PendingParentLinkRequestsCard";
import { deriveActionableIncoming } from "@/frontend/views/students/dashboard/pending-parent-link-requests";
import { isolateBidi } from "@/shared/lib/isolate-bidi";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Common as CommonNs } from "@/shared/locale/namespaces/common";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { ParentLink as ParentLinkNs } from "@/shared/locale/namespaces/parentLink";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ----------------------------------------------------------------------------
// Fixtures — data only (parent names are the sanctioned full-name disclosure;
// canonical ISO instants so no verdict can flip with the wall clock)
// ----------------------------------------------------------------------------

const PARENT_NAME_A = "Sara Abdulrahman";
const PARENT_NAME_B = "Mona Khalid";
const PARENT_NAME_C = "Huda Ammar";

/** Chronology for the most-recent derivation (B newest, A oldest). */
const CREATED_AT_OLDEST_ISO = "2026-08-25T12:00:00.000Z";
const CREATED_AT_MIDDLE_ISO = "2026-08-26T12:00:00.000Z";
const CREATED_AT_NEWEST_ISO = "2026-08-27T12:00:00.000Z";

/** LIVE expiry far in the future; EXPIRED far in the past (strict-`>` liveness). */
const LIVE_EXPIRES_ISO = "2099-01-07T12:00:00.000Z";
const EXPIRED_EXPIRES_ISO = "2020-01-01T12:00:00.000Z";

/** Shared boundary anchor for the pure-helper cells. */
const HELPER_NOW_MS = new Date("2026-09-01T12:00:00.000Z").getTime();
const HELPER_BOUNDARY_EXPIRES_ISO = new Date(HELPER_NOW_MS).toISOString();

/** Incoming-row factory — exactly the six canonical selection fields. */
function incomingRow(
  overrides: Partial<MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests> = {}
): MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests {
  return {
    id: "301",
    status: LinkStatus.Pending,
    parentFullName: PARENT_NAME_A,
    createdAt: CREATED_AT_OLDEST_ISO,
    expiresAt: LIVE_EXPIRES_ISO,
    respondedAt: null,
    ...overrides,
  };
}

/** The single GraphQL query operation this surface may ever issue. */
const QUERY_OPERATION_NAME = "MyIncomingParentLinkRequests";

// ----------------------------------------------------------------------------
// Apollo link traffic recorder + mock builders
// ----------------------------------------------------------------------------

/** Captured network traffic — the single-query + refetch proofs. */
interface NetworkTraffic {
  readonly operationNames: string[];
}

function createNetworkTraffic(): NetworkTraffic {
  return { operationNames: [] };
}

/** Incoming-list mock — zero-argument query, `variables: {}` on the wire. */
function incomingListMock(
  rows: ReadonlyArray<MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests>
): MockLink.MockedResponse {
  return {
    request: { query: myIncomingParentLinkRequestsQueryDocument, variables: {} },
    result: { data: { myIncomingParentLinkRequests: [...rows] } },
  };
}

/** Permanently in-flight list mock — pins the skeleton branch. */
function inFlightListMock(): MockLink.MockedResponse {
  return {
    request: { query: myIncomingParentLinkRequestsQueryDocument, variables: {} },
    delay: Infinity,
  };
}

/** Query failure authored as a raw `result.errors[]` entry (transport shape). */
function listFailureMock(errorCode: string): MockLink.MockedResponse {
  return {
    request: { query: myIncomingParentLinkRequestsQueryDocument, variables: {} },
    result: {
      errors: [
        {
          message: `${errorCode} (masked transport surface)`,
          extensions: { code: errorCode },
        },
      ],
    },
  };
}

// ----------------------------------------------------------------------------
// Render helpers — a client probe captures the Apollo client for the
// post-decision cache write-back cell (the decision page's respond
// mutation normalizes the row; the card must re-derive and unmount).
// The capture happens in an EFFECT (never during render) per the
// react-hooks side-effect discipline.
// ----------------------------------------------------------------------------

const capturedClientHolder: { current: ApolloClient | null } = { current: null };

function ApolloClientProbe(): null {
  const client = useApolloClient();
  useEffect(() => {
    capturedClientHolder.current = client;
  }, [client]);
  return null;
}

function renderCard(
  traffic: NetworkTraffic,
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale
): RenderResult {
  const mockLink = new MockLink([...mocks]);
  const recordingLink = new ApolloLink((operation, forward) => {
    // operationName is optional on the request type; a blank placeholder keeps
    // the recorder total (in practice every operation carries its name).
    traffic.operationNames.push(operation.operationName ?? "");
    return forward(operation);
  });
  return renderWithWrapper(
    <MockedProvider link={ApolloLink.from([recordingLink, mockLink])}>
      {/* SINGLE fragment child — MockedProvider + array children renders an
          empty tree in this environment (verified via render bisect). */}
      <>
        <ApolloClientProbe />
        <PendingParentLinkRequestsCard />
      </>
    </MockedProvider>,
    { locale }
  );
}

afterEach(() => {
  cleanup();
  capturedClientHolder.current = null;
});

// ----------------------------------------------------------------------------
// Suite — one block per locale keeps RTL/LTR both exercised over the FULL
// REQ-064 branch matrix while every case stays independently readable.
// ----------------------------------------------------------------------------

for (const locale of ["ar", "en"] as AppLocale[]) {
  const t = ParentLinkNs.getLabels(getTranslations(locale));
  const te = ErrorsNs.getLabels(getTranslations(locale));
  const tc = CommonNs.getLabels(getTranslations(locale));

  describe(`PendingParentLinkRequestsCard (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("cold load → skeleton card with aria-busy, zero settled copy", () => {
      const traffic = createNetworkTraffic();
      renderCard(traffic, [inFlightListMock()], locale);

      const skeleton = screen.getByTestId("pending-parent-link-requests-card-loading");
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
      // No settled surface may leak into the skeleton branch.
      expect(screen.queryByTestId("pending-parent-link-requests-card")).toBeNull();
      expect(screen.queryByTestId("pending-parent-link-requests-card-error")).toBeNull();
      expect(traffic.operationNames).toEqual([QUERY_OPERATION_NAME]);
    });

    test("zero actionable → renders NOTHING (empty container, no chrome)", async () => {
      const traffic = createNetworkTraffic();
      const { container } = renderCard(traffic, [incomingListMock([])], locale);

      // The skeleton shows at mount, then the settled empty derivation unmounts it.
      await screen.findByTestId("pending-parent-link-requests-card-loading");
      await waitFor(() => {
        expect(screen.queryByTestId("pending-parent-link-requests-card-loading")).toBeNull();
      });
      expect(screen.queryByTestId("pending-parent-link-requests-card")).toBeNull();
      expect(screen.queryByTestId("pending-parent-link-requests-card-error")).toBeNull();
      expect(container.childElementCount).toBe(0);
      expect(traffic.operationNames).toEqual([QUERY_OPERATION_NAME]);
    });

    test("present-1 → title + count-1 chip + FULL requester name + CTA on the shared route constant", async () => {
      const traffic = createNetworkTraffic();
      renderCard(traffic, [incomingListMock([incomingRow()])], locale);

      const card = await screen.findByTestId("pending-parent-link-requests-card");
      expect(screen.getByText(t.dashboardCardTitle)).toBeDefined();
      expect(screen.getByText(t.dashboardCardCount(1))).toBeDefined();
      // The FULL parent name, bidi-isolated BEFORE interpolation, rendered
      // with the bidi-safe direction where it abuts the card chrome.
      const nameLine = screen.getByText(t.dashboardCardLatestRequester(isolateBidi(PARENT_NAME_A)));
      expect(nameLine.getAttribute("dir")).toBe("auto");
      // No other requester leaks onto the dashboard card.
      expect(screen.queryByText(PARENT_NAME_B)).toBeNull();

      // The single CTA anchors to the ONE shared route constant (constant
      // wiring + frozen-value pin, the 4.1 belt-and-braces precedent).
      const cta = within(card).getByRole("link", { name: t.dashboardCardCta });
      expect(cta.getAttribute("href")).toBe(STUDENT_LINK_REQUESTS_ROUTE);
      expect(cta.getAttribute("href")).toBe("/student/link-requests");
      expect(within(card).getAllByRole("link")).toHaveLength(1);
      expect(traffic.operationNames).toEqual([QUERY_OPERATION_NAME]);
    });

    test("present-N → count-N chip + MOST RECENT requester (no per-request list)", async () => {
      const traffic = createNetworkTraffic();
      renderCard(
        traffic,
        [
          incomingListMock([
            incomingRow({ id: "301", parentFullName: PARENT_NAME_A, createdAt: CREATED_AT_OLDEST_ISO }),
            incomingRow({ id: "302", parentFullName: PARENT_NAME_B, createdAt: CREATED_AT_NEWEST_ISO }),
            incomingRow({
              id: "303",
              parentFullName: PARENT_NAME_C,
              createdAt: CREATED_AT_MIDDLE_ISO,
              status: LinkStatus.Confirmed,
              respondedAt: LIVE_EXPIRES_ISO,
            }),
          ]),
        ],
        locale
      );

      await screen.findByTestId("pending-parent-link-requests-card");
      // Two actionable rows (the confirmed third drops out) — count chip says 2…
      expect(screen.getByText(t.dashboardCardCount(2))).toBeDefined();
      // …and the MOST RECENT actionable requester is B (max createdAt), never A.
      expect(screen.getByText(t.dashboardCardLatestRequester(isolateBidi(PARENT_NAME_B)))).toBeDefined();
      expect(screen.queryByText(t.dashboardCardLatestRequester(isolateBidi(PARENT_NAME_A)))).toBeNull();
      // No per-request list on the dashboard: no other full names rendered.
      expect(screen.queryByText(PARENT_NAME_A)).toBeNull();
      expect(screen.queryByText(PARENT_NAME_C)).toBeNull();
      expect(traffic.operationNames).toEqual([QUERY_OPERATION_NAME]);
    });

    test("expired-row exclusion → stored-pending row past expiresAt NOT counted (even when newest)", async () => {
      const traffic = createNetworkTraffic();
      renderCard(
        traffic,
        [
          incomingListMock([
            incomingRow({ id: "301", parentFullName: PARENT_NAME_A, createdAt: CREATED_AT_MIDDLE_ISO }),
            // Newest by createdAt, but its expiry moment has passed → drops out.
            incomingRow({
              id: "304",
              parentFullName: PARENT_NAME_B,
              createdAt: CREATED_AT_NEWEST_ISO,
              expiresAt: EXPIRED_EXPIRES_ISO,
            }),
          ]),
        ],
        locale
      );

      await screen.findByTestId("pending-parent-link-requests-card");
      expect(screen.getByText(t.dashboardCardCount(1))).toBeDefined();
      expect(screen.getByText(t.dashboardCardLatestRequester(isolateBidi(PARENT_NAME_A)))).toBeDefined();
      expect(screen.queryByText(t.dashboardCardLatestRequester(isolateBidi(PARENT_NAME_B)))).toBeNull();
      expect(traffic.operationNames).toEqual([QUERY_OPERATION_NAME]);
    });

    test("query error → ONE localized Alert (masked code folds to generic copy) + retry refetches", async () => {
      const traffic = createNetworkTraffic();
      renderCard(traffic, [listFailureMock("RATE_LIMITED"), incomingListMock([incomingRow()])], locale);
      const user = userEvent.setup();

      await screen.findByTestId("pending-parent-link-requests-card-error");
      // Exactly ONE alert; the masked-class code maps to the localized generic
      // copy — the raw wire message NEVER reaches the DOM.
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByText(te.internalServerError)).toBeDefined();
      expect(screen.queryByText("RATE_LIMITED (masked transport surface)")).toBeNull();

      // Retry drives a REAL refetch; the queued success mock settles the card.
      await user.click(screen.getByRole("button", { name: tc.retry }));
      await screen.findByTestId("pending-parent-link-requests-card");
      expect(screen.getByText(t.dashboardCardCount(1))).toBeDefined();
      expect(traffic.operationNames).toEqual([QUERY_OPERATION_NAME, QUERY_OPERATION_NAME]);
    });

    test("post-decision disappearance → cache write-back flips the row to Confirmed → card unmounts", async () => {
      const traffic = createNetworkTraffic();
      renderCard(traffic, [incomingListMock([incomingRow()])], locale);

      await screen.findByTestId("pending-parent-link-requests-card");
      const client = capturedClientHolder.current;
      if (client === null) {
        throw new Error("ApolloClientProbe failed to capture the mocked client");
      }
      // The decision page's respond mutation normalizes the row to Confirmed
      // in the shared cache — the card re-derives to zero and unmounts.
      client.writeQuery<MyIncomingParentLinkRequestsQuery>({
        query: myIncomingParentLinkRequestsQueryDocument,
        data: {
          myIncomingParentLinkRequests: [incomingRow({ status: LinkStatus.Confirmed, respondedAt: LIVE_EXPIRES_ISO })],
        },
      });
      await waitFor(() => {
        expect(screen.queryByTestId("pending-parent-link-requests-card")).toBeNull();
      });
      expect(screen.queryByTestId("pending-parent-link-requests-card-loading")).toBeNull();
      expect(traffic.operationNames).toEqual([QUERY_OPERATION_NAME]);
    });
  });
}

// ----------------------------------------------------------------------------
// Pure-helper units — `deriveActionableIncoming` derivation edges
// (locale-independent; strict-`>` boundary per B.14 read purity)
// ----------------------------------------------------------------------------

describe("deriveActionableIncoming (pure helper)", () => {
  test("empty rows → null", () => {
    expect(deriveActionableIncoming([], HELPER_NOW_MS)).toBeNull();
  });

  test("all terminal (confirmed / rejected / stored-expired) → null", () => {
    expect(
      deriveActionableIncoming(
        [
          incomingRow({ id: "401", status: LinkStatus.Confirmed, respondedAt: LIVE_EXPIRES_ISO }),
          incomingRow({ id: "402", status: LinkStatus.Rejected, respondedAt: LIVE_EXPIRES_ISO }),
          incomingRow({ id: "403", status: LinkStatus.Expired }),
        ],
        HELPER_NOW_MS
      )
    ).toBeNull();
  });

  test("single live pending → count 1 + FULL name", () => {
    expect(deriveActionableIncoming([incomingRow()], HELPER_NOW_MS)).toEqual({
      count: 1,
      latestParentFullName: PARENT_NAME_A,
    });
  });

  test("latest = max createdAt (array order never trusted)", () => {
    const summary = deriveActionableIncoming(
      [
        incomingRow({ id: "404", parentFullName: PARENT_NAME_A, createdAt: CREATED_AT_OLDEST_ISO }),
        incomingRow({ id: "405", parentFullName: PARENT_NAME_C, createdAt: CREATED_AT_MIDDLE_ISO }),
        incomingRow({ id: "406", parentFullName: PARENT_NAME_B, createdAt: CREATED_AT_NEWEST_ISO }),
      ],
      HELPER_NOW_MS
    );
    expect(summary).toEqual({ count: 3, latestParentFullName: PARENT_NAME_B });
  });

  test("boundary instant expiresAt === now → NOT actionable → null (strict >)", () => {
    expect(
      deriveActionableIncoming([incomingRow({ expiresAt: HELPER_BOUNDARY_EXPIRES_ISO })], HELPER_NOW_MS)
    ).toBeNull();
  });

  test("expiresAt one millisecond after now → actionable", () => {
    const justLiveIso = new Date(HELPER_NOW_MS + 1).toISOString();
    expect(deriveActionableIncoming([incomingRow({ expiresAt: justLiveIso })], HELPER_NOW_MS)).toEqual({
      count: 1,
      latestParentFullName: PARENT_NAME_A,
    });
  });

  test("mixed rows → only live pendings counted; expired-but-newest excluded from latest", () => {
    const summary = deriveActionableIncoming(
      [
        incomingRow({ id: "407", parentFullName: PARENT_NAME_A, createdAt: CREATED_AT_MIDDLE_ISO }),
        incomingRow({
          id: "408",
          parentFullName: PARENT_NAME_C,
          createdAt: CREATED_AT_OLDEST_ISO,
          status: LinkStatus.Confirmed,
          respondedAt: LIVE_EXPIRES_ISO,
        }),
        incomingRow({
          id: "409",
          parentFullName: PARENT_NAME_B,
          createdAt: CREATED_AT_NEWEST_ISO,
          expiresAt: EXPIRED_EXPIRES_ISO,
        }),
      ],
      HELPER_NOW_MS
    );
    expect(summary).toEqual({ count: 1, latestParentFullName: PARENT_NAME_A });
  });
});
