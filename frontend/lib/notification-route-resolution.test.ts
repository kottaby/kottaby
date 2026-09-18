/**
 * Contract and routing tests for `notification-route-resolution.ts`.
 *
 * Verifies the staged deep-link resolution contract — the row's
 * `related_entity_type` pointer routes first (the parent-link entity map),
 * then the session matrix (entity "session" + the wire `type` + the wire
 * `role`), then the role-less notification-type stage — enforcing the safe
 * feed fallback strategy for null, unmapped, refinement, or unknown inputs.
 */

import { describe, expect, test } from "bun:test";
import { NotificationType as BackendNotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { NotificationType, UserRole } from "@/frontend/graphql/generated/gql/graphql";
import { resolveNotificationRoute, STUDENT_LINK_REQUESTS_ROUTE } from "@/frontend/lib/notification-route-resolution";

describe("STUDENT_LINK_REQUESTS_ROUTE constant", () => {
  test("exports canonical route string for student link requests", () => {
    expect(STUDENT_LINK_REQUESTS_ROUTE).toBe("/student/link-requests");
  });
});

describe("resolveNotificationRoute — staged resolution", () => {
  test("null related entity pointer falls back to notifications feed route", () => {
    expect(resolveNotificationRoute(null, NotificationType.SessionRequest)).toBe("/notifications");
  });

  test("parent-link entity map routes the parent_link_request pointer ahead of every type stage", () => {
    expect(resolveNotificationRoute(BackendNotificationType.ParentLinkRequest, null)).toBe("/student/link-requests");
    expect(resolveNotificationRoute(BackendNotificationType.ParentLinkRequest, NotificationType.SystemBroadcast)).toBe(
      "/student/link-requests"
    );
  });

  test("session matrix routes by notification type and viewer role", () => {
    expect(resolveNotificationRoute("session", NotificationType.SessionCompletion, UserRole.Student)).toBe(
      "/student/sessions"
    );
    expect(resolveNotificationRoute("session", NotificationType.SessionCompletion, UserRole.Teacher)).toBe(
      "/teacher/sessions"
    );
    expect(resolveNotificationRoute("session", NotificationType.SessionCompletion, UserRole.Admin)).toBe(
      "/notifications"
    );
    expect(resolveNotificationRoute("session", NotificationType.SessionDisputeOpened, UserRole.Student)).toBe(
      "/notifications"
    );
  });

  test("role-less type stage routes session completion to the student sessions list", () => {
    expect(resolveNotificationRoute("session", NotificationType.SessionCompletion)).toBe("/student/sessions");
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
      expect(resolveNotificationRoute("session", notificationType)).toBe("/notifications");
    }
  });

  test("parent-targeted refinement entity pointers intentionally fall through to feed route", () => {
    // Parent-targeted rows carry audience-scoped refinement values (issue #99)
    // that deliberately miss the entity map to fall through safely to /notifications.
    const parentRefinementTypes = ["parent_link_request_decision", "parent_link_request_expiry"];

    for (const refinementType of parentRefinementTypes) {
      expect(resolveNotificationRoute(refinementType, NotificationType.ParentLinkRequest)).toBe("/notifications");
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
      expect(resolveNotificationRoute(input, NotificationType.SystemBroadcast)).toBe("/notifications");
    }
  });
});
