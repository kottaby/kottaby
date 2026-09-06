/**
 * NotificationEngine projections unit test suite.
 *
 * Tests for `toNotificationInsert` and `toRealtimePayload` in
 * `backend/services/notifications/notification-engine.projections.ts`.
 *
 * Pure unit tests — no DB connection or mock server required.
 */
import { describe, expect, test } from "bun:test";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import {
  type NotificationEmitCopy,
  toNotificationInsert,
  toRealtimePayload,
} from "@/backend/services/notifications/notification-engine.projections";
import type { NotificationReturnType } from "@/backend/types";

describe("toNotificationInsert", () => {
  // ---- Tier 1: Branch / Statement Coverage ----
  describe("Tier 1 — statement & field mapping", () => {
    test("maps copy fields, userId, fixed isRead=false, and now date into NotificationInsertType", () => {
      const userId = 42;
      const now = new Date("2026-03-30T10:00:00.000Z");
      const copy: NotificationEmitCopy = {
        type: NotificationType.SessionRequest,
        title: "Session Requested",
        body: "A student requested a session for tomorrow",
        relatedEntityType: "session",
        relatedEntityId: 101,
      };

      const result = toNotificationInsert(userId, copy, now);

      expect(result).toEqual({
        userId: 42,
        type: NotificationType.SessionRequest,
        title: "Session Requested",
        body: "A student requested a session for tomorrow",
        isRead: false,
        relatedEntityType: "session",
        relatedEntityId: 101,
        createdAt: now,
      });
      expect(result.createdAt).toBe(now); // exact reference equality
    });

    test("isRead is always hardcoded to false on insert projection", () => {
      const now = new Date();
      const copy: NotificationEmitCopy = {
        type: NotificationType.SystemBroadcast,
        title: "Broadcast",
        body: "Important maintenance",
        relatedEntityType: null,
        relatedEntityId: null,
      };

      const result = toNotificationInsert(1, copy, now);

      expect(result.isRead).toBe(false);
    });
  });

  // ---- Tier 2: Boundary & Edge Cases ----
  describe("Tier 2 — boundary & nullability", () => {
    test("handles nullable fields (body, relatedEntityType, relatedEntityId) when null", () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const copy: NotificationEmitCopy = {
        type: NotificationType.PaymentConfirmation,
        title: "Payment Received",
        body: null,
        relatedEntityType: null,
        relatedEntityId: null,
      };

      const result = toNotificationInsert(99, copy, now);

      expect(result.body).toBeNull();
      expect(result.relatedEntityType).toBeNull();
      expect(result.relatedEntityId).toBeNull();
    });

    test("handles unicode, emoji, and RTL strings in title and body", () => {
      const now = new Date();
      const unicodeTitle = "طلب جلسة جديدة 🎉";
      const unicodeBody = "تفاصيل الجلسة: \u202E%s_' OR 1=1;--\u202C";
      const copy: NotificationEmitCopy = {
        type: NotificationType.EvaluationResult,
        title: unicodeTitle,
        body: unicodeBody,
        relatedEntityType: "evaluation",
        relatedEntityId: 555,
      };

      const result = toNotificationInsert(7, copy, now);

      expect(result.title).toBe(unicodeTitle);
      expect(result.body).toBe(unicodeBody);
    });
  });

  // ---- Tier 3: Security & BOPLA Isolation ----
  describe("Tier 3 — BOPLA & field isolation", () => {
    test("ignores smuggled / extra properties on the copy object (strict whitelist mapping)", () => {
      const now = new Date();
      const smuggledCopy: NotificationEmitCopy & {
        id: number;
        isRead: boolean;
        createdAt: Date;
        smuggledColumn: string;
      } = {
        type: NotificationType.ParentLinkRequest,
        title: "Parent Link Request",
        body: "A parent wants to link",
        relatedEntityType: "parent_link",
        relatedEntityId: 12,
        // Smuggled fields that must NOT be present on the return object
        id: 9999,
        isRead: true,
        createdAt: new Date("2000-01-01"),
        smuggledColumn: "HACKED",
      };

      const result = toNotificationInsert(10, smuggledCopy, now);

      expect(result).toEqual({
        userId: 10,
        type: NotificationType.ParentLinkRequest,
        title: "Parent Link Request",
        body: "A parent wants to link",
        isRead: false, // forces false despite smuggled isRead: true
        relatedEntityType: "parent_link",
        relatedEntityId: 12,
        createdAt: now, // uses argument date despite smuggled createdAt
      });

      expect(Object.hasOwn(result, "id")).toBe(false);
      expect(Object.hasOwn(result, "smuggledColumn")).toBe(false);
    });
  });
});

describe("toRealtimePayload", () => {
  // ---- Tier 1: Statement & Field Mapping ----
  describe("Tier 1 — statement & payload projection", () => {
    test("projects a NotificationReturnType row into a v=1 realtime payload", () => {
      const createdAt = new Date("2026-03-30T12:00:00.000Z");
      const row: NotificationReturnType = {
        id: 888,
        userId: 42,
        type: NotificationType.SessionCompletion,
        title: "Session Completed",
        body: "Great job completing the session!",
        isRead: false,
        relatedEntityType: "session",
        relatedEntityId: 202,
        createdAt,
      };

      const payload = toRealtimePayload(row);

      expect(payload).toEqual({
        v: 1,
        kind: "notification",
        data: {
          id: 888,
          type: NotificationType.SessionCompletion,
          title: "Session Completed",
          body: "Great job completing the session!",
          relatedEntityType: "session",
          relatedEntityId: 202,
          createdAt,
        },
      });
    });
  });

  // ---- Tier 2: Boundary & Edge Cases ----
  describe("Tier 2 — boundary & nullability", () => {
    test("preserves null values for optional related entity fields and body", () => {
      const createdAt = new Date();
      const row: NotificationReturnType = {
        id: 1,
        userId: 100,
        type: NotificationType.SystemBroadcast,
        title: "Global Announcement",
        body: null,
        isRead: true,
        relatedEntityType: null,
        relatedEntityId: null,
        createdAt,
      };

      const payload = toRealtimePayload(row);

      expect(payload.data.body).toBeNull();
      expect(payload.data.relatedEntityType).toBeNull();
      expect(payload.data.relatedEntityId).toBeNull();
    });
  });

  // ---- Tier 3: Security & Information Disclosure Prevention ----
  describe("Tier 3 — information disclosure prevention & field isolation", () => {
    test("MUST NOT include userId in payload data (prevents cross-user account disclosure, REQ-021)", () => {
      const row: NotificationReturnType = {
        id: 500,
        userId: 12345, // sensitive user ID
        type: NotificationType.SessionCancellation,
        title: "Session Cancelled",
        body: "Session was cancelled by teacher",
        isRead: false,
        relatedEntityType: "session",
        relatedEntityId: 303,
        createdAt: new Date(),
      };

      const payload = toRealtimePayload(row);

      expect(Object.hasOwn(payload.data, "userId")).toBe(false);
      expect("userId" in payload.data).toBe(false);
    });

    test("MUST NOT include isRead in realtime payload (isRead is managed via inbox sync)", () => {
      const row: NotificationReturnType = {
        id: 501,
        userId: 12345,
        type: NotificationType.SessionCancellation,
        title: "Session Cancelled",
        body: "Session was cancelled",
        isRead: true,
        relatedEntityType: null,
        relatedEntityId: null,
        createdAt: new Date(),
      };

      const payload = toRealtimePayload(row);

      expect(Object.hasOwn(payload.data, "isRead")).toBe(false);
      expect("isRead" in payload.data).toBe(false);
    });

    test("ignores extra smuggled properties on row object when constructing payload", () => {
      const rowWithSmuggled: NotificationReturnType & { secretToken: string; internalNotes: string } = {
        id: 700,
        userId: 99,
        type: NotificationType.PaymentConfirmation,
        title: "Payment Confirmed",
        body: "Thank you",
        isRead: false,
        relatedEntityType: "invoice",
        relatedEntityId: 88,
        createdAt: new Date(),
        secretToken: "SUPER_SECRET_TOKEN",
        internalNotes: "Do not expose",
      };

      const payload = toRealtimePayload(rowWithSmuggled);

      expect(Object.hasOwn(payload.data, "secretToken")).toBe(false);
      expect(Object.hasOwn(payload.data, "internalNotes")).toBe(false);
      expect("secretToken" in payload.data).toBe(false);
    });
  });
});
