/**
 * Unit tests for `parent-link-request.helpers.ts`.
 *
 * Tests all exported constants, type guards, mappers, and orchestration helpers:
 *  - Constants (`PARENT_LINK_REQUEST_ENTITY`, `PARENT_LINK_RELATED_ENTITY_TYPE`)
 *  - Type guards & Guards (`isDeliveryReceipt`, `toCanonicalLinkStatus`)
 *  - Mappers (`mapOutgoing`, `mapIncoming`)
 *  - `requireActor` gate
 *  - `insertPendingRequestTx` helper
 *  - `emitRequestNotificationTx` helper
 *  - `classifyUnclaimableRequest` helper
 *  - `raiseUnclaimableDenial` helper
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ParentLinkRequestRepository, StudentRepository, UserRepository } from "@/backend/db/repo";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { LinkStatus } from "@/backend/enum/shared/link-status.enum";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { NotificationEngine } from "@/backend/services/notifications/notification-engine.service";
import {
  classifyUnclaimableRequest,
  emitRequestNotificationTx,
  insertPendingRequestTx,
  isDeliveryReceipt,
  mapIncoming,
  mapOutgoing,
  PARENT_LINK_RELATED_ENTITY_TYPE,
  PARENT_LINK_REQUEST_ENTITY,
  raiseUnclaimableDenial,
  requireActor,
  toCanonicalLinkStatus,
} from "@/backend/services/parents/parent-link-request.helpers";
import type {
  DBTransaction,
  NotificationDeliveryReceipt,
  NotificationReturnType,
  ParentLinkRequestSelectType,
  UserSelectType,
} from "@/backend/types";
import { PARENT_LINK_REQUEST_MS } from "@/shared/constants/parent-link-request.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

type SpyInstance = ReturnType<typeof spyOn>;
const trackedSpies: SpyInstance[] = [];

function trackSpy<T extends SpyInstance>(spy: T): T {
  trackedSpies.push(spy);
  return spy;
}

afterEach(() => {
  while (trackedSpies.length > 0) {
    trackedSpies.pop()?.mockRestore();
  }
});

function silenceDomainLog() {
  return trackSpy(spyOn(logger, "logDomainError").mockImplementation(() => {}));
}

/** Stub DBTransaction for transaction-accepting helpers when using repository mocks. */
const mockTx = {
  transaction: async (fn: (tx: DBTransaction) => Promise<unknown>) => fn(mockTx as unknown as DBTransaction),
} as unknown as DBTransaction;

describe("parent-link-request.helpers — Constants", () => {
  test("PARENT_LINK_REQUEST_ENTITY and PARENT_LINK_RELATED_ENTITY_TYPE have expected values", () => {
    expect(PARENT_LINK_REQUEST_ENTITY).toBe("PARENT_LINK_REQUEST");
    expect(PARENT_LINK_RELATED_ENTITY_TYPE).toBe("parent_link_request");
  });
});

describe("parent-link-request.helpers — isDeliveryReceipt", () => {
  test("returns true when value is a NotificationDeliveryReceipt", () => {
    const receipt: NotificationDeliveryReceipt = {
      notificationId: 10,
      recipientUserIds: [1, 2],
    };
    expect(isDeliveryReceipt(receipt)).toBe(true);
  });

  test("returns false when value is a NotificationReturnType", () => {
    const notificationRow: NotificationReturnType = {
      id: 10,
      userId: 1,
      type: NotificationType.ParentLinkRequest,
      title: "Title",
      body: "Body",
      isRead: false,
      relatedEntityType: PARENT_LINK_RELATED_ENTITY_TYPE,
      relatedEntityId: 10,
      createdAt: new Date(),
    };
    expect(isDeliveryReceipt(notificationRow)).toBe(false);
  });
});

describe("parent-link-request.helpers — toCanonicalLinkStatus", () => {
  test("returns valid LinkStatus enum value unchanged", () => {
    expect(toCanonicalLinkStatus(LinkStatus.Pending, 1)).toBe(LinkStatus.Pending);
    expect(toCanonicalLinkStatus(LinkStatus.Confirmed, 2)).toBe(LinkStatus.Confirmed);
    expect(toCanonicalLinkStatus(LinkStatus.Rejected, 3)).toBe(LinkStatus.Rejected);
    expect(toCanonicalLinkStatus(LinkStatus.Expired, 4)).toBe(LinkStatus.Expired);
  });

  test("throws error and logs domain error when status is corrupt/invalid", () => {
    const logSpy = silenceDomainLog();
    const corruptStatus = "INVALID_STATUS" as unknown as ParentLinkRequestSelectType["status"];

    expect(() => toCanonicalLinkStatus(corruptStatus, 99)).toThrow(
      "ParentLinkRequestService: corrupt link_status value on request 99"
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]).toEqual([
      "Parent-link read rejected: stored link status failed the enum guard",
      expect.objectContaining({
        code: "PARENT_LINK_REQUEST_STATUS_CORRUPT",
        entity: "parent_link_requests",
        entityId: 99,
      }),
    ]);
  });
});

describe("parent-link-request.helpers — mapOutgoing and mapIncoming", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const futureExpires = new Date("2026-03-01T13:00:00.000Z");
  const pastExpires = new Date("2026-03-01T11:00:00.000Z");
  const createdAt = new Date("2026-03-01T10:00:00.000Z");

  test("mapOutgoing masks student full name and preserves unexpired pending status", () => {
    const mapped = mapOutgoing(
      {
        id: 1,
        status: LinkStatus.Pending,
        studentFullName: "Jane Doe",
        createdAt,
        expiresAt: futureExpires,
        respondedAt: null,
      },
      now
    );

    expect(mapped.id).toBe(1);
    expect(mapped.status).toBe(LinkStatus.Pending);
    expect(mapped.studentMaskedName).not.toBe("Jane Doe");
    expect(mapped.createdAt).toEqual(createdAt);
    expect(mapped.expiresAt).toEqual(futureExpires);
    expect(mapped.respondedAt).toBeNull();
  });

  test("mapOutgoing maps pending status to Expired if expiresAt <= now", () => {
    const mapped = mapOutgoing(
      {
        id: 2,
        status: LinkStatus.Pending,
        studentFullName: "Jane Doe",
        createdAt,
        expiresAt: pastExpires,
        respondedAt: null,
      },
      now
    );

    expect(mapped.status).toBe(LinkStatus.Expired);
  });

  test("mapIncoming preserves parent full name unmasked and maps expired when expired", () => {
    const unexpired = mapIncoming(
      {
        id: 3,
        status: LinkStatus.Pending,
        parentFullName: "John Doe",
        createdAt,
        expiresAt: futureExpires,
        respondedAt: null,
      },
      now
    );

    expect(unexpired.id).toBe(3);
    expect(unexpired.status).toBe(LinkStatus.Pending);
    expect(unexpired.parentFullName).toBe("John Doe");

    const expired = mapIncoming(
      {
        id: 4,
        status: LinkStatus.Pending,
        parentFullName: "John Doe",
        createdAt,
        expiresAt: pastExpires,
        respondedAt: null,
      },
      now
    );

    expect(expired.status).toBe(LinkStatus.Expired);
  });
});

describe("parent-link-request.helpers — requireActor", () => {
  const baseUser: UserSelectType = {
    id: 10,
    fullName: "Parent User",
    email: "parent@test.local",
    phone: "+1234567890",
    passwordHash: "hash",
    role: "parent",
    isDeleted: false,
    isBlocked: false,
    suspended: false,
    suspendedAt: null,
    suspendedPeriodDays: null,
    lastActiveAt: new Date(),
    preferredRecitation: null,
    locale: "en",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  test("succeeds when actor exists, matches role, and passes governance checks", async () => {
    trackSpy(spyOn(UserRepository, "findById").mockResolvedValue(baseUser));

    const actor = await requireActor(10, "parent", LOCALE, mockTx, true);
    expect(actor.id).toBe(10);
  });

  test("rejects non-positive / non-safe-integer actorId with UnauthorizedError", async () => {
    silenceDomainLog();

    try {
      await requireActor(0, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
    }

    try {
      await requireActor(-5, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
    }

    try {
      await requireActor(Number.NaN, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
    }
  });

  test("rejects missing actor with UnauthorizedError", async () => {
    silenceDomainLog();
    trackSpy(spyOn(UserRepository, "findById").mockResolvedValue(null));

    try {
      await requireActor(999, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
    }
  });

  test("rejects role mismatch with ForbiddenError", async () => {
    silenceDomainLog();
    trackSpy(spyOn(UserRepository, "findById").mockResolvedValue({ ...baseUser, role: "student" }));

    try {
      await requireActor(10, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  test("rejects governed actor when enforceGovernance is true", async () => {
    silenceDomainLog();

    // Deleted
    trackSpy(spyOn(UserRepository, "findById").mockResolvedValue({ ...baseUser, isDeleted: true }));
    try {
      await requireActor(10, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }

    // Blocked
    trackSpy(spyOn(UserRepository, "findById").mockResolvedValue({ ...baseUser, isBlocked: true }));
    try {
      await requireActor(10, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }

    // Suspended
    trackSpy(spyOn(UserRepository, "findById").mockResolvedValue({ ...baseUser, suspended: true }));
    try {
      await requireActor(10, "parent", LOCALE, mockTx, true);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  test("allows governed actor when enforceGovernance is false", async () => {
    trackSpy(spyOn(UserRepository, "findById").mockResolvedValue({ ...baseUser, isDeleted: true }));

    const actor = await requireActor(10, "parent", LOCALE, mockTx, false);
    expect(actor.id).toBe(10);
  });
});

describe("parent-link-request.helpers — insertPendingRequestTx", () => {
  const targetStudent = {
    studentId: 20,
    fullName: "Student Name",
    parentId: null as number | null,
    isDeleted: false,
    isBlocked: false,
    suspended: false,
    suspendedAt: null,
    suspendedPeriodDays: null,
  };

  test("returns null when handshake code target is null", async () => {
    trackSpy(spyOn(StudentRepository, "findLinkTargetByHandshakeCode").mockResolvedValue(null));

    const result = await insertPendingRequestTx("INVALID_CODE", 10, LOCALE, mockTx);
    expect(result).toBeNull();
  });

  test("throws PARENT_LINK_TARGET_ALREADY_LINKED if target student already has a parentId", async () => {
    silenceDomainLog();
    trackSpy(
      spyOn(StudentRepository, "findLinkTargetByHandshakeCode").mockResolvedValue({
        ...targetStudent,
        parentId: 99,
      })
    );

    try {
      await insertPendingRequestTx("VALID_CODE", 10, LOCALE, mockTx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe("PARENT_LINK_TARGET_ALREADY_LINKED");
      expect((err as ConflictError).message).toContain(tErrors.parentLinkTargetAlreadyLinked);
    }
  });

  test("throws PARENT_LINK_ALREADY_PENDING if a live pending request exists", async () => {
    silenceDomainLog();
    trackSpy(spyOn(StudentRepository, "findLinkTargetByHandshakeCode").mockResolvedValue(targetStudent));
    trackSpy(
      spyOn(ParentLinkRequestRepository, "findPendingByPair").mockResolvedValue({
        id: 50,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Pending,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + PARENT_LINK_REQUEST_MS),
        respondedAt: null,
      })
    );

    try {
      await insertPendingRequestTx("VALID_CODE", 10, LOCALE, mockTx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe("PARENT_LINK_ALREADY_PENDING");
      expect((err as ConflictError).message).toContain(tErrors.parentLinkAlreadyPending);
    }
  });

  test("creates pending request when target is unlinked and no pending request exists", async () => {
    trackSpy(spyOn(StudentRepository, "findLinkTargetByHandshakeCode").mockResolvedValue(targetStudent));
    trackSpy(spyOn(ParentLinkRequestRepository, "findPendingByPair").mockResolvedValue(null));

    const createdRecord: ParentLinkRequestSelectType = {
      id: 100,
      parentId: 10,
      studentId: 20,
      status: LinkStatus.Pending,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + PARENT_LINK_REQUEST_MS),
      respondedAt: null,
    };
    trackSpy(spyOn(ParentLinkRequestRepository, "create").mockResolvedValue(createdRecord));

    const outcome = await insertPendingRequestTx("VALID_CODE", 10, LOCALE, mockTx);
    expect(outcome).not.toBeNull();
    expect(outcome?.created.id).toBe(100);
    expect(outcome?.studentId).toBe(20);
    expect(outcome?.targetFullName).toBe("Student Name");
  });

  test("handles 23505 unique violation on insert race and throws PARENT_LINK_ALREADY_PENDING", async () => {
    silenceDomainLog();
    trackSpy(spyOn(StudentRepository, "findLinkTargetByHandshakeCode").mockResolvedValue(targetStudent));
    trackSpy(spyOn(ParentLinkRequestRepository, "findPendingByPair").mockResolvedValue(null));

    const uniqueViolationError = new Error("duplicate key value violates unique constraint") as Error & {
      code?: string;
    };
    uniqueViolationError.code = "23505";
    trackSpy(spyOn(ParentLinkRequestRepository, "create").mockRejectedValue(uniqueViolationError));

    try {
      await insertPendingRequestTx("VALID_CODE", 10, LOCALE, mockTx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe("PARENT_LINK_ALREADY_PENDING");
    }
  });
});

describe("parent-link-request.helpers — emitRequestNotificationTx", () => {
  test("emits notification for target student and returns receipt and resolved locale", async () => {
    const localeMap = new Map<number, string>([[20, "en"]]);
    trackSpy(spyOn(UserRepository, "findLocalesByIds").mockResolvedValue(localeMap));

    const receipt: NotificationDeliveryReceipt = {
      notificationId: 55,
      recipientUserIds: [20],
    };
    trackSpy(spyOn(NotificationEngine, "emitForUser").mockResolvedValue(receipt));

    const outcome = await emitRequestNotificationTx(20, 100, "Parent Name", mockTx);
    expect(outcome.recipientLocale).toBe("en");
    expect(outcome.receipt).toEqual(receipt);
  });

  test("throws Error if emitForUser returns row instead of receipt", async () => {
    const localeMap = new Map<number, string>();
    trackSpy(spyOn(UserRepository, "findLocalesByIds").mockResolvedValue(localeMap));

    const notificationRow: NotificationReturnType = {
      id: 55,
      userId: 20,
      type: NotificationType.ParentLinkRequest,
      title: "Title",
      body: "Body",
      isRead: false,
      relatedEntityType: PARENT_LINK_RELATED_ENTITY_TYPE,
      relatedEntityId: 100,
      createdAt: new Date(),
    };
    trackSpy(spyOn(NotificationEngine, "emitForUser").mockResolvedValue(notificationRow));

    try {
      await emitRequestNotificationTx(20, 100, "Parent Name", mockTx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("in-tx emit returned a row instead of the receipt");
    }
  });
});

describe("parent-link-request.helpers — classifyUnclaimableRequest and raiseUnclaimableDenial", () => {
  test("classifyUnclaimableRequest classifies nonexistent or unowned request as not-found", async () => {
    trackSpy(spyOn(ParentLinkRequestRepository, "findById").mockResolvedValue(null));

    const verdict = await classifyUnclaimableRequest(100, 10, "parent", mockTx);
    expect(verdict).toBe("not-found");
  });

  test("classifyUnclaimableRequest classifies non-pending status as already-resolved", async () => {
    trackSpy(
      spyOn(ParentLinkRequestRepository, "findById").mockResolvedValue({
        id: 100,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Confirmed,
        createdAt: new Date(),
        expiresAt: new Date(),
        respondedAt: new Date(),
      })
    );

    const verdict = await classifyUnclaimableRequest(100, 10, "parent", mockTx);
    expect(verdict).toBe("already-resolved");
  });

  test("classifyUnclaimableRequest classifies pending request as expired when unclaimable", async () => {
    trackSpy(
      spyOn(ParentLinkRequestRepository, "findById").mockResolvedValue({
        id: 100,
        parentId: 10,
        studentId: 20,
        status: LinkStatus.Pending,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
        respondedAt: null,
      })
    );

    const verdict = await classifyUnclaimableRequest(100, 10, "parent", mockTx);
    expect(verdict).toBe("expired");
  });

  test("raiseUnclaimableDenial throws NotFoundError on not-found verdict", async () => {
    silenceDomainLog();

    try {
      await raiseUnclaimableDenial(100, "not-found", LOCALE, mockTx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as NotFoundError).message).toContain(tErrors.parentLinkRequestNotFound);
    }
  });

  test("raiseUnclaimableDenial throws ConflictError on already-resolved verdict", async () => {
    silenceDomainLog();

    try {
      await raiseUnclaimableDenial(100, "already-resolved", LOCALE, mockTx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe("PARENT_LINK_REQUEST_ALREADY_RESOLVED");
      expect((err as ConflictError).message).toContain(tErrors.parentLinkRequestAlreadyResolved);
    }
  });

  test("raiseUnclaimableDenial marks expired and throws ConflictError on expired verdict", async () => {
    silenceDomainLog();
    const markSpy = trackSpy(spyOn(ParentLinkRequestRepository, "markExpiredIfPending").mockResolvedValue());

    try {
      await raiseUnclaimableDenial(100, "expired", LOCALE, mockTx);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe("PARENT_LINK_REQUEST_EXPIRED");
      expect((err as ConflictError).message).toContain(tErrors.parentLinkRequestExpired);
      expect(markSpy).toHaveBeenCalledTimes(1);
      expect(markSpy.mock.calls[0][0]).toBe(100);
    }
  });
});
