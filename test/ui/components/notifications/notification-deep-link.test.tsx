/**
 * Notification drawer deep-link resolution.
 *
 * Happy DOM + Apollo `MockLink` tier (`test/ui/components`) asserting the
 * drawer's row-anchor route-resolution seam (`resolveNotificationRoute` in
 * the `frontend/lib/notification-route-resolution.ts` leaf):
 *
 *   a `parent_link_request` row anchors EXACTLY to the shared
 *   `STUDENT_LINK_REQUESTS_ROUTE` decision route (the anchor href IS the
 *   router target — rows are real `next/link` anchors, navigation is native,
 *   no router call) and row activation still closes the drawer;
 *   an UNKNOWN related entity type falls through UNCHANGED to the
 *   `/notifications` feed page (the pre-deep-link hard anchor, pinned by the
 *   notification-drawer suite) — render succeeds with no router errors and
 *   no mis-route.
 *
 * Both locales (en + ar) — the drawer rows render through the same
 * LocaleProvider/RTL-emotion-cache stack as production. The pure resolver
 * unit cells are locale-independent and live outside the locale loop.
 *
 * Fixture titles/ids/timestamps are technical test data, not UI copy.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ApolloClient } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { MockLink } from "@apollo/client/testing";
import { cleanup, fireEvent, type RenderResult, screen, waitFor } from "@testing-library/react";
// The backend enum IS the wire domain of `relatedEntityType`: the persisted
// `related_entity_type` varchar carries the enum's snake_case VALUE, aliased
// here to keep it visually distinct from the codegen `NotificationType`
// (whose GraphQL values are the PascalCase wire names of the `type` field).
import { NotificationType as BackendNotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { NotificationDrawer } from "@/frontend/components/ui/NotificationDrawer";
import {
  type MyNotificationsFilterInput,
  type MyNotificationsQuery,
  type MyNotificationsQuery_myNotifications,
  type MyNotificationsQuery_myNotifications_items,
  NotificationType,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  myNotificationsQueryDocument,
  myUnreadNotificationCountQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import {
  ADMIN_DISPUTES_ROUTE,
  resolveNotificationRoute,
  STUDENT_LINK_REQUESTS_ROUTE,
  STUDENT_SESSIONS_ROUTE,
  TEACHER_SESSIONS_ROUTE,
} from "@/frontend/lib/notification-route-resolution";
import { createApolloCache } from "@/frontend/providers/apollo/apolloCache";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ─── WebSocket ownership double (drawer-suite precedent) ────────────────────

const originalWebSocket = globalThis.WebSocket;

/** Constructions of `globalThis.WebSocket` while the double is installed. */
let webSocketConstructions = 0;

/** Minimal recording double — deep-link rows must construct ZERO sockets. */
class RecordingWebSocket {
  constructor() {
    webSocketConstructions += 1;
  }

  /** No-op surface member — nothing constructs this double in a passing suite. */
  close(): void {
    // Intentionally empty: the recorder exists only to count constructions.
  }
}

beforeEach(() => {
  webSocketConstructions = 0;
  Reflect.set(globalThis, "WebSocket", RecordingWebSocket);
});

afterEach(() => {
  cleanup();
  // Restore happy-dom's WebSocket so later files in this process are unaffected.
  Reflect.set(globalThis, "WebSocket", originalWebSocket);
});

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

/** Deterministic UTC instant (the drawer-suite anchor convention). */
const FIXED_ISO = "2026-08-29T12:00:00.000Z";

const LINK_REQUEST_ROW_TITLE = "drawer-deeplink-link-request";
const UNKNOWN_ENTITY_ROW_TITLE = "drawer-deeplink-unknown-entity";
const PARENT_DECISION_ROW_TITLE = "drawer-deeplink-parent-decision";

/**
 * Fixture row type — the codegen row PLUS `__typename` (MockLink passes
 * `result.data` through AS-IS; without the typename the cache cannot
 * normalize rows by id — the notification-drawer-suite convention).
 */
type NotificationItemFixture = MyNotificationsQuery_myNotifications_items & {
  readonly __typename: "Notification";
};

/**
 * Deterministic normalized `Notification` row. Read by default so row
 * activation is close-only (the mark-one cache contract is already pinned by
 * the notification-drawer suite) — deep-link cells assert ROUTING.
 */
function drawerRow(overrides?: Partial<NotificationItemFixture>): NotificationItemFixture {
  return {
    __typename: "Notification",
    id: "301",
    type: NotificationType.SessionRequest,
    title: "drawer-deeplink-row",
    body: null,
    isRead: true,
    relatedEntityType: null,
    relatedEntityId: null,
    createdAt: FIXED_ISO,
    ...overrides,
  };
}

const LINK_REQUEST_ROW = drawerRow({
  id: "301",
  title: LINK_REQUEST_ROW_TITLE,
  type: NotificationType.ParentLinkRequest,
  // Enum member, never a bare literal — the backend enum's VALUE is exactly
  // what the wire `relatedEntityType` carries ("parent_link_request").
  relatedEntityType: BackendNotificationType.ParentLinkRequest,
  relatedEntityId: 4102,
});

const UNKNOWN_ENTITY_ROW = drawerRow({
  id: "302",
  title: UNKNOWN_ENTITY_ROW_TITLE,
  // `type` stays a real enum member; ONLY the free-string entity pointer is
  // out of vocabulary — the resolver must fall through, never throw. The
  // bare literal is the fixture for that out-of-vocabulary varchar.
  type: NotificationType.SystemBroadcast,
  relatedEntityType: "unknown_entity_type",
});

const PARENT_DECISION_ROW = drawerRow({
  id: "303",
  title: PARENT_DECISION_ROW_TITLE,
  // The PARENT-audience outcome row (issue #99): same notification TYPE as
  // the student row, but the audience-scoped `related_entity_type`
  // refinement (`parent_link_request_decision`, backend
  // `parent-link-request.helpers.ts`) deliberately MISSES the route map —
  // the row must anchor to the notifications feed, never the student-only
  // decision route. The bare literal pins the backend wire value.
  type: NotificationType.ParentLinkRequest,
  relatedEntityType: "parent_link_request_decision",
});

const ADMIN_DISPUTE_OPENED_ROW_TITLE = "drawer-deeplink-dispute-opened";
const STUDENT_DISPUTE_RESOLVED_ROW_TITLE = "drawer-deeplink-dispute-resolved-student";
const TEACHER_COMPLETION_ROW_TITLE = "drawer-deeplink-completion-teacher";

/** The session-entity pointer every session-family emitter persists. */
const SESSION_ENTITY_POINTER = "session";

const ADMIN_DISPUTE_OPENED_ROW = drawerRow({
  id: "304",
  title: ADMIN_DISPUTE_OPENED_ROW_TITLE,
  type: NotificationType.SessionDisputeOpened,
  relatedEntityType: SESSION_ENTITY_POINTER,
  relatedEntityId: 4103,
});

const STUDENT_DISPUTE_RESOLVED_ROW = drawerRow({
  id: "305",
  title: STUDENT_DISPUTE_RESOLVED_ROW_TITLE,
  type: NotificationType.SessionDisputeResolved,
  relatedEntityType: SESSION_ENTITY_POINTER,
  relatedEntityId: 4103,
});

const TEACHER_COMPLETION_ROW = drawerRow({
  id: "306",
  title: TEACHER_COMPLETION_ROW_TITLE,
  type: NotificationType.SessionCompletion,
  relatedEntityType: SESSION_ENTITY_POINTER,
  relatedEntityId: 4103,
});

/** The drawer's single inbox window (mirrors `DRAWER_PAGE_SIZE`). */
const DRAWER_WINDOW: MyNotificationsFilterInput = { isRead: null, type: null, limit: 5, offset: 0 };

function drawerPageData(rows: readonly NotificationItemFixture[]): MyNotificationsQuery {
  // The wrapper carries its own `__typename` so the `keyFields:false` value
  // object stores identically to real transport results (drawer-suite comment).
  const page: MyNotificationsQuery_myNotifications & { __typename: "NotificationListPage" } = {
    __typename: "NotificationListPage",
    items: [...rows],
    totalCount: rows.length,
    hasMore: false,
  };
  return { myNotifications: page };
}

function listMock(rows: readonly NotificationItemFixture[]): MockLink.MockedResponse {
  return {
    request: { query: myNotificationsQueryDocument, variables: { filter: DRAWER_WINDOW } },
    result: { data: drawerPageData(rows) },
  };
}

function countMock(count: number): MockLink.MockedResponse {
  return {
    request: { query: myUnreadNotificationCountQueryDocument },
    result: { data: { myUnreadNotificationCount: count } },
  };
}

/**
 * Renders the OPEN drawer on a synthetic anchor under a real Apollo client.
 * The popover portals to `document.body`, so assertions use `screen`/
 * document-level queries rather than the render container.
 */
function renderDrawer(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale,
  onClose: () => void = () => undefined,
  userRole: string | null = null
): RenderResult & { client: ApolloClient } {
  const anchor = document.createElement("button");
  const client = new ApolloClient({
    link: new MockLink([...mocks]),
    cache: createApolloCache(),
    defaultOptions: { query: { errorPolicy: "none" } },
  });
  const result = renderWithWrapper(
    <ApolloProvider client={client}>
      <NotificationDrawer anchorEl={anchor} open onClose={onClose} userRole={userRole} />
    </ApolloProvider>,
    { locale }
  );
  return { ...result, client };
}

// ─── Deep-link resolution (both locales) ────────────────────────────────────

for (const locale of ["ar", "en"] as AppLocale[]) {
  describe(`NotificationDrawer deep-link resolution (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("a parent_link_request row anchors EXACTLY to the shared student link-requests route and activation still closes the drawer", async () => {
      let closeCalls = 0;
      renderDrawer([countMock(0), listMock([LINK_REQUEST_ROW])], locale, () => {
        closeCalls += 1;
      });

      const row = await waitFor(() => screen.getByText(LINK_REQUEST_ROW_TITLE).closest("a"));
      if (row === null) {
        throw new Error("row anchor must render (the row IS a Link anchor)");
      }
      // The anchor href IS the router target — rows are real next/link
      // anchors (native navigation, no router.push inside the drawer).
      expect(row.getAttribute("href")).toBe(STUDENT_LINK_REQUESTS_ROUTE);
      // Frozen-value pin: the constant must KEEP the exact route string the
      // decision page's `withPageAuth` redirect and the nav entry target.
      expect(row.getAttribute("href")).toBe("/student/link-requests");

      fireEvent.click(row);
      await waitFor(() => {
        expect(closeCalls).toBe(1);
      });
    });

    test("an UNKNOWN related entity type falls through UNCHANGED to the notifications feed page", async () => {
      renderDrawer([countMock(0), listMock([UNKNOWN_ENTITY_ROW])], locale);

      const row = await waitFor(() => screen.getByText(UNKNOWN_ENTITY_ROW_TITLE).closest("a"));
      if (row === null) {
        throw new Error("row anchor must render (the row IS a Link anchor)");
      }
      // Pre-deep-link behavior pinned: unknown pointers anchor to the feed page
      // exactly as the hard-coded href did — unchanged fall-through, and a
      // clean render here proves no router error for the unknown type.
      expect(row.getAttribute("href")).toBe("/notifications");
      expect(webSocketConstructions).toBe(0);
    });

    test("a PARENT-audience decision row falls through to the notifications feed (issue #99)", async () => {
      renderDrawer([countMock(0), listMock([PARENT_DECISION_ROW])], locale);

      const row = await waitFor(() => screen.getByText(PARENT_DECISION_ROW_TITLE).closest("a"));
      if (row === null) {
        throw new Error("row anchor must render (the row IS a Link anchor)");
      }
      // The decision refinement (`parent_link_request_decision`) is IN the
      // parent-link family but OUT of the route map's student key — the row
      // anchors to the feed page, never the student-only decision route.
      expect(row.getAttribute("href")).toBe("/notifications");
      expect(webSocketConstructions).toBe(0);
    });
  });
}

// ─── Session deep-link resolution (role-scoped; locale-independent) ────────

describe("NotificationDrawer session deep-links (role-scoped routing)", () => {
  test("an admin's dispute-opened row anchors to the arbitration console", async () => {
    renderDrawer([countMock(0), listMock([ADMIN_DISPUTE_OPENED_ROW])], "ar", () => undefined, "Admin");

    const row = await waitFor(() => screen.getByText(ADMIN_DISPUTE_OPENED_ROW_TITLE).closest("a"));
    if (row === null) {
      throw new Error("row anchor must render (the row IS a Link anchor)");
    }
    expect(row.getAttribute("href")).toBe(ADMIN_DISPUTES_ROUTE);
    expect(row.getAttribute("href")).toBe("/disputes");
  });

  test("a student's dispute-resolved row anchors to the student session list", async () => {
    renderDrawer([countMock(0), listMock([STUDENT_DISPUTE_RESOLVED_ROW])], "en", () => undefined, "Student");

    const row = await waitFor(() => screen.getByText(STUDENT_DISPUTE_RESOLVED_ROW_TITLE).closest("a"));
    if (row === null) {
      throw new Error("row anchor must render (the row IS a Link anchor)");
    }
    expect(row.getAttribute("href")).toBe(STUDENT_SESSIONS_ROUTE);
    expect(row.getAttribute("href")).toBe("/student/sessions");
  });

  test("a teacher's completion row anchors to the teacher session list", async () => {
    renderDrawer([countMock(0), listMock([TEACHER_COMPLETION_ROW])], "en", () => undefined, "Teacher");

    const row = await waitFor(() => screen.getByText(TEACHER_COMPLETION_ROW_TITLE).closest("a"));
    if (row === null) {
      throw new Error("row anchor must render (the row IS a Link anchor)");
    }
    expect(row.getAttribute("href")).toBe(TEACHER_SESSIONS_ROUTE);
    expect(row.getAttribute("href")).toBe("/teacher/sessions");
  });

  test("a session row WITHOUT a resolvable role falls through to the feed page", async () => {
    renderDrawer([countMock(0), listMock([STUDENT_DISPUTE_RESOLVED_ROW])], "en");

    const row = await waitFor(() => screen.getByText(STUDENT_DISPUTE_RESOLVED_ROW_TITLE).closest("a"));
    if (row === null) {
      throw new Error("row anchor must render (the row IS a Link anchor)");
    }
    expect(row.getAttribute("href")).toBe("/notifications");
  });
});

// ─── Pure resolver unit cells (locale-independent) ──────────────────────────

describe("resolveNotificationRoute (drawer route-resolution seam)", () => {
  test("maps the backend parent_link_request entity type to the shared route constant", () => {
    expect(resolveNotificationRoute(BackendNotificationType.ParentLinkRequest)).toBe(STUDENT_LINK_REQUESTS_ROUTE);
    expect(STUDENT_LINK_REQUESTS_ROUTE).toBe("/student/link-requests");
  });

  test("the PARENT-audience refinements fall through to the feed (issue #99 routing cells)", () => {
    // The three parent-link routing cells: the student incoming row
    // (pinned above) deep-links; the parent decision + expiry refinement
    // values MISS the map and land on the feed. The values are the backend
    // wire contract (`parent-link-request.helpers.ts`) pinned here verbatim.
    expect(resolveNotificationRoute("parent_link_request_decision")).toBe("/notifications");
    expect(resolveNotificationRoute("parent_link_request_expiry")).toBe("/notifications");
  });

  test("unknown and absent pointers fall through to the feed page (unchanged default)", () => {
    expect(resolveNotificationRoute("unknown_entity_type")).toBe("/notifications");
    expect(resolveNotificationRoute(null)).toBe("/notifications");
  });

  test("the session matrix routes dispute rows by role (single-argument calls stay parent-link-only)", () => {
    // Dispute-opened is an ADMIN-audience wave: only the admin cell exists.
    expect(resolveNotificationRoute("session", "SessionDisputeOpened", "Admin")).toBe("/disputes");
    expect(resolveNotificationRoute("session", "SessionDisputeOpened", "Student")).toBe("/notifications");
    expect(resolveNotificationRoute("session", "SessionDisputeOpened", "Teacher")).toBe("/notifications");
    // Dispute-resolved reaches the participants (defensive admin cell too).
    expect(resolveNotificationRoute("session", "SessionDisputeResolved", "Student")).toBe("/student/sessions");
    expect(resolveNotificationRoute("session", "SessionDisputeResolved", "Teacher")).toBe("/teacher/sessions");
    expect(resolveNotificationRoute("session", "SessionDisputeResolved", "Admin")).toBe("/disputes");
    expect(resolveNotificationRoute("session", "SessionDisputeResolved", "Parent")).toBe("/notifications");
  });

  test("the session matrix routes participant lifecycle rows to each role's own session list", () => {
    for (const wireType of ["SessionCompletion", "SessionCancellation", "SessionRequest"] as const) {
      expect(resolveNotificationRoute("session", wireType, "Student")).toBe("/student/sessions");
      expect(resolveNotificationRoute("session", wireType, "Teacher")).toBe("/teacher/sessions");
      // Admins/parents are not lifecycle audiences — honest fall-through.
      expect(resolveNotificationRoute("session", wireType, "Admin")).toBe("/notifications");
      expect(resolveNotificationRoute("session", wireType, "Parent")).toBe("/notifications");
    }
  });

  test("unknown types, unknown roles, and missing context fall through (no fabricated routes)", () => {
    expect(resolveNotificationRoute("session", "SystemBroadcast", "Student")).toBe("/notifications");
    expect(resolveNotificationRoute("session", "SessionDisputeResolved", "SuperAdmin")).toBe("/notifications");
    expect(resolveNotificationRoute("session", "SessionDisputeResolved", null)).toBe("/notifications");
    expect(resolveNotificationRoute("session", null, "Student")).toBe("/notifications");
    expect(resolveNotificationRoute("subscription", "PaymentConfirmation", "Student")).toBe("/notifications");
  });

  test("the wire vocabularies stay EXACTLY the resolver's union members (codegen conformance pins)", () => {
    // Type-only conformance: if the codegen enum ever grows or renames a
    // member, this exhaustive switch stops compiling (no `any` escape).
    type ExhaustiveWireTypeCheck = (type: NotificationType) => string;
    const exhaustive: ExhaustiveWireTypeCheck = wireType => {
      switch (wireType) {
        case NotificationType.EvaluationResult:
        case NotificationType.ParentLinkRequest:
        case NotificationType.PaymentConfirmation:
        case NotificationType.SessionCancellation:
        case NotificationType.SessionCompletion:
        case NotificationType.SessionDisputeOpened:
        case NotificationType.SessionDisputeResolved:
        case NotificationType.SessionRequest:
        case NotificationType.SystemBroadcast:
          return wireType;
      }
    };
    expect(exhaustive(NotificationType.SessionDisputeOpened)).toBe("SessionDisputeOpened");

    type ExhaustiveRoleCheck = (role: "Admin" | "Parent" | "Student" | "Teacher") => string;
    const exhaustiveRole: ExhaustiveRoleCheck = role => {
      switch (role) {
        case "Admin":
        case "Parent":
        case "Student":
        case "Teacher":
          return role;
      }
    };
    expect(exhaustiveRole("Teacher")).toBe("Teacher");
  });
});
