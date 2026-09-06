/**
 * Unit tests for `parent-link-request.helpers.ts`.
 *
 * Covers pure mapping and guard helpers (`toCanonicalLinkStatus`, `isDeliveryReceipt`,
 * `mapOutgoing`, `mapIncoming`) as well as database-backed actor and claim helpers
 * (`requireActor`, `classifyUnclaimableRequest`, `raiseUnclaimableDenial`).
 */

import { describe, expect, spyOn, test } from "bun:test";
import {
  type IncomingParentLinkRequestRow,
  type OutgoingParentLinkRequestRow,
  ParentLinkRequestRepository,
} from "@/backend/db/repo";
import { createTestParent, createTestStudent, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { LinkStatus } from "@/backend/enum/shared/link-status.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import {
  classifyUnclaimableRequest,
  isDeliveryReceipt,
  mapIncoming,
  mapOutgoing,
  raiseUnclaimableDenial,
  requireActor,
  toCanonicalLinkStatus,
} from "@/backend/services/parents/parent-link-request.helpers";
import type {
  NotificationDeliveryReceipt,
  NotificationReturnType,
} from "@/backend/types";
import { maskFullName } from "@/shared/lib/mask-full-name";

const LOCALE = "en";

function silenceDomainLog() {
  const spy = spyOn(logger, "logDomainError").mockImplementation(() => {});
  spy.mockClear();
  return spy;
}

describe("parent-link-request.helpers — pure functions", () => {
  describe("toCanonicalLinkStatus", () => {
    test("returns valid LinkStatus enum values verbatim", () => {
      const statuses = [
        LinkStatus.Pending,
        LinkStatus.Confirmed,
        LinkStatus.Rejected,
        LinkStatus.Expired,
      ];

      for (const status of statuses) {
        expect(toCanonicalLinkStatus(status, 101)).toBe(status);
      }
    });

    test("logs domain error and throws Error when status is corrupt/invalid", () => {
      const logSpy = silenceDomainLog();
      const corruptRawStatus = "invalid_corrupt_status";
      const requestId = 404;

      expect(() => toCanonicalLinkStatus(corruptRawStatus, requestId)).toThrow(
        "ParentLinkRequestService: corrupt link_status value on request 404"
      );

      expect(logSpy.mock.calls).toHaveLength(1);
      expect(logSpy.mock.calls[0]).toEqual([
        "Parent-link read rejected: stored link status failed the enum guard",
        {
          code: "PARENT_LINK_REQUEST_STATUS_CORRUPT",
          entity: "parent_link_requests",
          entityId: requestId,
          locale: "en",
        },
      ]);
    });
  });

  describe("isDeliveryReceipt", () => {
    test("returns true for a NotificationDeliveryReceipt object", () => {
      const receipt: NotificationDeliveryReceipt = {
        notifications: [],
        recipientUserIds: [10, 20],
      };
      expect(isDeliveryReceipt(receipt)).toBe(true);
    });

    test("returns false for a NotificationReturnType object", () => {
      const notificationRow: NotificationReturnType = {
        id: 1,
        userId: 10,
        type: NotificationType.ParentLinkRequest,
        title: "Test Title",
        body: "Test Body",
        relatedEntityType: "parent_link_request",
        relatedEntityId: 101,
        isRead: false,
        createdAt: new Date(),
      };
      expect(isDeliveryReceipt(notificationRow)).toBe(false);
    });
  });

  describe("mapOutgoing", () => {
    test("maps pending request with future expiresAt: keeps status Pending and masks student name", () => {
      const now = new Date("2026-03-15T12:00:00Z");
      const row: OutgoingParentLinkRequestRow = {
        id: 1,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Pending,
        studentFullName: "Aisha Mohamed",
        createdAt: new Date("2026-03-10T12:00:00Z"),
        expiresAt: new Date("2026-03-17T12:00:00Z"),
        respondedAt: null,
      };

      const result = mapOutgoing(row, now);

      expect(result).toEqual({
        id: 1,
        status: LinkStatus.Pending,
        studentMaskedName: maskFullName("Aisha Mohamed"),
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        respondedAt: null,
      });
    });

    test("maps pending request with past expiresAt: dynamically converts status to Expired", () => {
      const now = new Date("2026-03-18T12:00:00Z");
      const row: OutgoingParentLinkRequestRow = {
        id: 2,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Pending,
        studentFullName: "Tariq Ali",
        createdAt: new Date("2026-03-10T12:00:00Z"),
        expiresAt: new Date("2026-03-17T12:00:00Z"),
        respondedAt: null,
      };

      const result = mapOutgoing(row, now);

      expect(result.status).toBe(LinkStatus.Expired);
      expect(result.studentMaskedName).toBe(maskFullName("Tariq Ali"));
    });

    test("maps non-pending status (Confirmed) with past expiresAt: preserves Confirmed status", () => {
      const now = new Date("2026-03-20T12:00:00Z");
      const row: OutgoingParentLinkRequestRow = {
        id: 3,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Confirmed,
        studentFullName: "Omar Hassan",
        createdAt: new Date("2026-03-10T12:00:00Z"),
        expiresAt: new Date("2026-03-17T12:00:00Z"),
        respondedAt: new Date("2026-03-12T12:00:00Z"),
      };

      const result = mapOutgoing(row, now);

      expect(result.status).toBe(LinkStatus.Confirmed);
      expect(result.respondedAt).toEqual(row.respondedAt);
    });

    test("throws Error when row status is corrupt", () => {
      silenceDomainLog();
      const now = new Date();
      const corruptRow: OutgoingParentLinkRequestRow = {
        id: 4,
        parentId: 10,
        studentId: 20,
        status: "corrupt_val",
        studentFullName: "Test Student",
        createdAt: now,
        expiresAt: now,
        respondedAt: null,
      };

      expect(() => mapOutgoing(corruptRow, now)).toThrow("ParentLinkRequestService: corrupt link_status");
    });
  });

  describe("mapIncoming", () => {
    test("maps pending request with future expiresAt: preserves full parent name and Pending status", () => {
      const now = new Date("2026-03-15T12:00:00Z");
      const row: IncomingParentLinkRequestRow = {
        id: 10,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Pending,
        parentFullName: "Ibrahim Khalil",
        createdAt: new Date("2026-03-10T12:00:00Z"),
        expiresAt: new Date("2026-03-17T12:00:00Z"),
        respondedAt: null,
      };

      const result = mapIncoming(row, now);

      expect(result).toEqual({
        id: 10,
        status: LinkStatus.Pending,
        parentFullName: "Ibrahim Khalil",
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        respondedAt: null,
      });
    });

    test("maps pending request with past expiresAt: dynamically converts status to Expired", () => {
      const now = new Date("2026-03-18T12:00:00Z");
      const row: IncomingParentLinkRequestRow = {
        id: 11,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Pending,
        parentFullName: "Fatima Zahra",
        createdAt: new Date("2026-03-10T12:00:00Z"),
        expiresAt: new Date("2026-03-17T12:00:00Z"),
        respondedAt: null,
      };

      const result = mapIncoming(row, now);

      expect(result.status).toBe(LinkStatus.Expired);
      expect(result.parentFullName).toBe("Fatima Zahra");
    });

    test("maps non-pending status (Rejected) with past expiresAt: preserves Rejected status", () => {
      const now = new Date("2026-03-20T12:00:00Z");
      const row: IncomingParentLinkRequestRow = {
        id: 12,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Rejected,
        parentFullName: "Sami Yusuf",
        createdAt: new Date("2026-03-10T12:00:00Z"),
        expiresAt: new Date("2026-03-17T12:00:00Z"),
        respondedAt: new Date("2026-03-11T12:00:00Z"),
      };

      const result = mapIncoming(row, now);

      expect(result.status).toBe(LinkStatus.Rejected);
    });

    test("throws Error when row status is corrupt", () => {
      silenceDomainLog();
      const now = new Date();
      const corruptRow: IncomingParentLinkRequestRow = {
        id: 13,
        parentId: 10,
        studentId: 20,
        status: "corrupt_val",
        parentFullName: "Test Parent",
        createdAt: now,
        expiresAt: now,
        respondedAt: null,
      };

      expect(() => mapIncoming(corruptRow, now)).toThrow("ParentLinkRequestService: corrupt link_status");
    });
  });
});

describe("parent-link-request.helpers — database-backed helpers", () => {
  describe("requireActor", () => {
    test("rejects non-positive / non-safe-integer actorId with UnauthorizedError", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const invalidIds = [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY];

        await Promise.all(
          invalidIds.map(async invalidId => {
            const err = await expectRepoError(() => requireActor(invalidId, UserRole.Parent, LOCALE, tx, false));
            expect(err).toBeInstanceOf(UnauthorizedError);
          })
        );
      });
    });

    test("rejects non-existent actorId with UnauthorizedError", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const err = await expectRepoError(() => requireActor(999999999, UserRole.Parent, LOCALE, tx, false));
        expect(err).toBeInstanceOf(UnauthorizedError);
      });
    });

    test("rejects actor with role mismatch with ForbiddenError", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const studentUser = await createTestUser(tx, { role: "student" });
        await createTestStudent(tx, studentUser.id);

        const err = await expectRepoError(() => requireActor(studentUser.id, UserRole.Parent, LOCALE, tx, false));
        expect(err).toBeInstanceOf(ForbiddenError);
      });
    });

    test("returns user row when actor ID, role match and governance checks pass", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const parentUser = await createTestUser(tx, { role: "parent" });
        await createTestParent(tx, parentUser.id);

        const fetched = await requireActor(parentUser.id, UserRole.Parent, LOCALE, tx, true);
        expect(fetched.id).toBe(parentUser.id);
        expect(fetched.role).toBe("parent");
      });
    });

    test("enforces governance: rejects deleted / blocked / suspended user when enforceGovernance = true", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const deletedUser = await createTestUser(tx, { role: "parent", isDeleted: true });
        await createTestParent(tx, deletedUser.id);

        const blockedUser = await createTestUser(tx, { role: "parent", isBlocked: true });
        await createTestParent(tx, blockedUser.id);

        const suspendedUser = await createTestUser(tx, {
          role: "parent",
          suspended: true,
          suspendedAt: new Date(),
          suspendedPeriodDays: 7,
        });
        await createTestParent(tx, suspendedUser.id);

        const governedUsers = [deletedUser, blockedUser, suspendedUser];

        // When enforceGovernance = true: all three are rejected with ForbiddenError
        await Promise.all(
          governedUsers.map(async user => {
            const err = await expectRepoError(() => requireActor(user.id, UserRole.Parent, LOCALE, tx, true));
            expect(err).toBeInstanceOf(ForbiddenError);
          })
        );

        // When enforceGovernance = false: read paths allow access for governed users
        await Promise.all(
          governedUsers.map(async user => {
            const fetched = await requireActor(user.id, UserRole.Parent, LOCALE, tx, false);
            expect(fetched.id).toBe(user.id);
          })
        );
      });
    });
  });

  describe("classifyUnclaimableRequest", () => {
    test("returns 'not-found' when request does not exist or is owned by another user", async () => {
      await runInRollback(async tx => {
        const parent1 = await createTestUser(tx, { role: "parent" });
        const parent2 = await createTestUser(tx, { role: "parent" });
        const student = await createTestUser(tx, { role: "student" });
        await createTestParent(tx, parent1.id);
        await createTestParent(tx, parent2.id);
        await createTestStudent(tx, student.id);

        const request = await ParentLinkRequestRepository.create(
          {
            parentId: parent1.id,
            studentId: student.id,
            expiresAt: new Date(Date.now() + 86400000),
          },
          tx
        );

        // Request missing
        expect(await classifyUnclaimableRequest(999999999, parent1.id, "parent", tx)).toBe("not-found");

        // Request owned by parent1, queried by parent2 (direction: parent)
        expect(await classifyUnclaimableRequest(request.id, parent2.id, "parent", tx)).toBe("not-found");

        // Request owned by parent1, queried by student (direction: parent)
        expect(await classifyUnclaimableRequest(request.id, student.id, "parent", tx)).toBe("not-found");
      });
    });

    test("returns 'already-resolved' when request is non-pending (e.g. accepted)", async () => {
      await runInRollback(async tx => {
        const parent = await createTestUser(tx, { role: "parent" });
        const student = await createTestUser(tx, { role: "student" });
        await createTestParent(tx, parent.id);
        await createTestStudent(tx, student.id);

        const request = await ParentLinkRequestRepository.create(
          {
            parentId: parent.id,
            studentId: student.id,
            expiresAt: new Date(Date.now() + 86400000),
          },
          tx
        );

        // Mark request confirmed (accepted)
        await ParentLinkRequestRepository.respondToPendingForStudent(
          request.id,
          student.id,
          LinkStatus.Confirmed,
          new Date(),
          tx
        );

        expect(await classifyUnclaimableRequest(request.id, student.id, "student", tx)).toBe("already-resolved");
        expect(await classifyUnclaimableRequest(request.id, parent.id, "parent", tx)).toBe("already-resolved");
      });
    });

    test("returns 'expired' when pending request is unclaimable", async () => {
      await runInRollback(async tx => {
        const parent = await createTestUser(tx, { role: "parent" });
        const student = await createTestUser(tx, { role: "student" });
        await createTestParent(tx, parent.id);
        await createTestStudent(tx, student.id);

        // Create expired pending request
        const request = await ParentLinkRequestRepository.create(
          {
            parentId: parent.id,
            studentId: student.id,
            expiresAt: new Date(Date.now() - 1000),
          },
          tx
        );

        expect(await classifyUnclaimableRequest(request.id, student.id, "student", tx)).toBe("expired");
        expect(await classifyUnclaimableRequest(request.id, parent.id, "parent", tx)).toBe("expired");
      });
    });
  });

  describe("raiseUnclaimableDenial", () => {
    test("raises NotFoundError for 'not-found' denial", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const err = await expectRepoError(() => raiseUnclaimableDenial(100, "not-found", LOCALE, tx));
        expect(err).toBeInstanceOf(NotFoundError);
      });
    });

    test("raises ConflictError for 'already-resolved' denial", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const err = await expectRepoError(() => raiseUnclaimableDenial(101, "already-resolved", LOCALE, tx));
        expect(err).toBeInstanceOf(ConflictError);
        if (err instanceof ConflictError) {
          expect(err.code).toBe("PARENT_LINK_REQUEST_ALREADY_RESOLVED");
        }
      });
    });

    test("marks request expired and raises ConflictError for 'expired' denial", async () => {
      silenceDomainLog();
      await runInRollback(async tx => {
        const parent = await createTestUser(tx, { role: "parent" });
        const student = await createTestUser(tx, { role: "student" });
        await createTestParent(tx, parent.id);
        await createTestStudent(tx, student.id);

        const request = await ParentLinkRequestRepository.create(
          {
            parentId: parent.id,
            studentId: student.id,
            expiresAt: new Date(Date.now() - 1000),
          },
          tx
        );

        const err = await expectRepoError(() => raiseUnclaimableDenial(request.id, "expired", LOCALE, tx));
        expect(err).toBeInstanceOf(ConflictError);
        if (err instanceof ConflictError) {
          expect(err.code).toBe("PARENT_LINK_REQUEST_EXPIRED");
        }

        // Verify request was marked expired in DB
        const updated = await ParentLinkRequestRepository.findById(request.id, tx);
        expect(updated?.status).toBe(LinkStatus.Expired);
      });
    });
  });
});
