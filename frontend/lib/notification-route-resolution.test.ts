/**
 * Contract and routing tests for `notification-route-resolution.ts`.
 *
 * Verifies the two-stage deep-link resolution contract — the drawer row's
 * notification `type` (the GraphQL wire enum) routes first, then the
 * `related_entity_type` pointer is consulted only on a type-stage miss —
 * enforcing the safe feed fallback strategy for null, unmapped, refinement,
 * or unknown inputs.
 */

import { describe, expect, test } from "bun:test";
import { NotificationType as BackendNotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { NotificationType } from "@/frontend/graphql/generated/gql/graphql";
import { resolveNotificationRoute, STUDENT_LINK_REQUESTS_ROUTE } from "@/frontend/lib/notification-route-resolution";

describe("STUDENT_LINK_REQUESTS_ROUTE constant", () => {
  test("exports canonical route string for student link requests", () => {
    expect(STUDENT_LINK_REQUESTS_ROUTE).toBe("/student/link-requests");
  });
});

describe("resolveNotificationRoute — two-stage resolution", () => {
  test("null related entity pointer falls back to notifications feed route", () => {
    expect(resolveNotificationRoute(NotificationType.SessionRequest, null)).toBe("/notifications");
  });

  test("type-stage hit routes by notification type alone, entity pointer irrelevant", () => {
    expect(resolveNotificationRoute(NotificationType.SessionCompletion, null)).toBe("/student/sessions");
    expect(resolveNotificationRoute(NotificationType.SessionCompletion, "session")).toBe("/student/sessions");
  });

  test("student parent_link_request entity pointer resolves to student link requests route", () => {
    expect(
      resolveNotificationRoute(NotificationType.ParentLinkRequest, BackendNotificationType.ParentLinkRequest)
    ).toBe("/student/link-requests");
    expect(resolveNotificationRoute(NotificationType.SystemBroadcast, "parent_link_request")).toBe(
      "/student/link-requests"
    );
  });

  test("unmapped NotificationType enum values fall through to notifications feed route", () => {
    const unmappedTypes = [
      NotificationType.SessionRequest,
      NotificationType.SessionCancellation,
      NotificationType.SystemBroadcast,
      NotificationType.PaymentConfirmation,
      NotificationType.EvaluationResult,
    ];

    for (const notificationType of unmappedTypes) {
      expect(resolveNotificationRoute(notificationType, null)).toBe("/notifications");
    }
  });

  test("parent-targeted refinement entity pointers intentionally fall through to feed route", () => {
    // Parent-targeted rows carry audience-scoped refinement values (issue #99)
    // that deliberately miss the entity map to fall through safely to /notifications.
    const parentRefinementTypes = ["parent_link_request_decision", "parent_link_request_expiry"];

    for (const refinementType of parentRefinementTypes) {
      expect(resolveNotificationRoute(NotificationType.ParentLinkRequest, refinementType)).toBe("/notifications");
    }
  });

  test("unknown, empty, or hostile string entity pointers safely fall through to feed route", () => {
    const edgeCaseInputs = [
      "",
      "   ",
      "unknown_entity_type",
      "PARENT_LINK_REQUEST",
      "null",
      "undefined",
      "/student/link-requests",
      "../admin",
      "<script>alert(1)</script>",
    ];

    for (const input of edgeCaseInputs) {
      expect(resolveNotificationRoute(NotificationType.SystemBroadcast, input)).toBe("/notifications");
    }
  });
});
