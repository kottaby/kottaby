/**
 * Unit tests for `notification-engine.projections.ts`.
 *
 * Verifies field projections, BOPLA column whitelisting, default states, and
 * handling of nullable fields for `toNotificationInsert` and `toRealtimePayload`.
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
  test("projects standard copy fields accurately into NotificationInsertType", () => {
    const userId = 42;
    const now = new Date("2026-06-25T12:00:00.000Z");
    const copy: NotificationEmitCopy = {
      type: NotificationType.SessionRequest,
      title: "New Session Request",
      body: "You have a new request for session #101.",
      relatedEntityType: "session",
      relatedEntityId: 101,
    };

    const insert = toNotificationInsert(userId, copy, now);

    expect(insert).toEqual({
      userId: 42,
      type: NotificationType.SessionRequest,
      title: "New Session Request",
      body: "You have a new request for session #101.",
      isRead: false,
      relatedEntityType: "session",
      relatedEntityId: 101,
      createdAt: now,
    });
  });

  test("handles null and omitted optional copy fields correctly", () => {
    const userId = 7;
    const now = new Date();
    const copy: NotificationEmitCopy = {
      type: NotificationType.SystemBroadcast,
      title: "System Maintenance",
      body: null,
      relatedEntityType: null,
      relatedEntityId: null,
    };

    const insert = toNotificationInsert(userId, copy, now);

    expect(insert.userId).toBe(7);
    expect(insert.type).toBe(NotificationType.SystemBroadcast);
    expect(insert.title).toBe("System Maintenance");
    expect(insert.body).toBeNull();
    expect(insert.isRead).toBe(false);
    expect(insert.relatedEntityType).toBeNull();
    expect(insert.relatedEntityId).toBeNull();
    expect(insert.createdAt).toBe(now);
  });

  test("enforces BOPLA safety by ignoring unwhitelisted properties on input objects", () => {
    const userId = 99;
    const now = new Date();
    const hostilePayload = {
      type: NotificationType.PaymentConfirmation,
      title: "Payment Received",
      body: "Thank you for your payment.",
      relatedEntityType: "invoice",
      relatedEntityId: 555,
      // Unwhitelisted properties that must be ignored / excluded
      isRead: true, // Should remain false
      id: 9999,
      adminNotes: "Internal note",
      __proto__: { injected: true },
      extraColumn: "Malicious input",
    };

    const insert = toNotificationInsert(userId, hostilePayload as unknown as NotificationEmitCopy, now);

    expect(insert.isRead).toBe(false);
    expect(Object.keys(insert)).toEqual([
      "userId",
      "type",
      "title",
      "body",
      "isRead",
      "relatedEntityType",
      "relatedEntityId",
      "createdAt",
    ]);
    expect((insert as Record<string, unknown>).isRead).toBe(false);
    expect((insert as Record<string, unknown>).id).toBeUndefined();
    expect((insert as Record<string, unknown>).adminNotes).toBeUndefined();
    expect((insert as Record<string, unknown>).extraColumn).toBeUndefined();
  });
});

describe("toRealtimePayload", () => {
  test("projects a NotificationReturnType row into a RealtimeNotificationPayload", () => {
    const createdAt = new Date("2026-06-25T12:30:00.000Z");
    const row: NotificationReturnType = {
      id: 123,
      userId: 42,
      type: NotificationType.SessionRequest,
      title: "New Session Request",
      body: "Details of session request",
      isRead: false,
      relatedEntityType: "session",
      relatedEntityId: 101,
      createdAt,
    };

    const payload = toRealtimePayload(row);

    expect(payload).toEqual({
      v: 1,
      kind: "notification",
      data: {
        id: 123,
        type: NotificationType.SessionRequest,
        title: "New Session Request",
        body: "Details of session request",
        relatedEntityType: "session",
        relatedEntityId: 101,
        createdAt,
      },
    });
  });

  test("handles null values in notification row fields", () => {
    const createdAt = new Date();
    const row: NotificationReturnType = {
      id: 456,
      userId: 10,
      type: NotificationType.SystemBroadcast,
      title: "General Notice",
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

  test("enforces BOPLA safety by excluding database-internal columns from the realtime payload", () => {
    const createdAt = new Date();
    const rowWithExtraDbFields = {
      id: 789,
      userId: 55, // Should not leak to realtime payload data
      type: NotificationType.PaymentConfirmation,
      title: "Receipt",
      body: "Payment receipt attached.",
      isRead: true, // Should not leak to realtime payload data
      relatedEntityType: "payment",
      relatedEntityId: 999,
      createdAt,
      // Extra DB fields or metadata
      updatedAt: new Date(),
      deletedAt: null,
      tenantId: "tenant_abc",
    };

    const payload = toRealtimePayload(rowWithExtraDbFields as unknown as NotificationReturnType);

    expect(payload.v).toBe(1);
    expect(payload.kind).toBe("notification");
    expect(Object.keys(payload.data)).toEqual([
      "id",
      "type",
      "title",
      "body",
      "relatedEntityType",
      "relatedEntityId",
      "createdAt",
    ]);
    expect((payload.data as Record<string, unknown>).userId).toBeUndefined();
    expect((payload.data as Record<string, unknown>).isRead).toBeUndefined();
    expect((payload.data as Record<string, unknown>).updatedAt).toBeUndefined();
    expect((payload.data as Record<string, unknown>).tenantId).toBeUndefined();
  });
});
