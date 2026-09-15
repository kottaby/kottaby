/**
 * Contract and routing tests for `notification-route-resolution.ts`.
 *
 * Verifies deep-link navigation target resolution from notification `related_entity_type`
 * values to their respective UI routes, enforcing the safe feed fallback strategy
 * for null, unmapped, refinement, or unknown entity types.
 */

import { describe, expect, test } from "bun:test";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { resolveNotificationRoute, STUDENT_LINK_REQUESTS_ROUTE } from "@/frontend/lib/notification-route-resolution";

describe("STUDENT_LINK_REQUESTS_ROUTE constant", () => {
  test("exports canonical route string for student link requests", () => {
    expect(STUDENT_LINK_REQUESTS_ROUTE).toBe("/student/link-requests");
  });
});

describe("resolveNotificationRoute — entity type resolution", () => {
  test("null input falls back to notifications feed route", () => {
    expect(resolveNotificationRoute(null)).toBe("/notifications");
  });

  test("student parent_link_request entity type resolves to student link requests route", () => {
    expect(resolveNotificationRoute(NotificationType.ParentLinkRequest)).toBe("/student/link-requests");
    expect(resolveNotificationRoute("parent_link_request")).toBe("/student/link-requests");
  });

  test("unmapped NotificationType enum values fall through to notifications feed route", () => {
    const unmappedTypes = [
      NotificationType.SessionRequest,
      NotificationType.SessionCompletion,
      NotificationType.SessionCancellation,
      NotificationType.SystemBroadcast,
      NotificationType.PaymentConfirmation,
      NotificationType.EvaluationResult,
    ];

    for (const notificationType of unmappedTypes) {
      expect(resolveNotificationRoute(notificationType)).toBe("/notifications");
    }
  });

  test("parent-targeted refinement entity types intentionally fall through to feed route", () => {
    // Parent-targeted rows carry audience-scoped refinement values (issue #99)
    // that deliberately miss the map to fall through safely to /notifications.
    const parentRefinementTypes = ["parent_link_request_decision", "parent_link_request_expiry"];

    for (const refinementType of parentRefinementTypes) {
      expect(resolveNotificationRoute(refinementType)).toBe("/notifications");
    }
  });

  test("unknown, empty, or hostile string entity types safely fall through to feed route", () => {
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
      expect(resolveNotificationRoute(input)).toBe("/notifications");
    }
  });
});
