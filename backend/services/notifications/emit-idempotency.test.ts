/**
 * Emit idempotency machinery — unit suite.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): key generation, receipt serialization, receipt parsing, and cache outcome mapping.
 *  - Tier 2 (boundary): cohort ordering, hex digest checks, and null values.
 *  - Tier 3 (chaos): unparseable receipts, invalid fields, claim outages.
 *  - Tier 4 (security/hostile): hostile data input parsing.
 *
 * Runs via the mandated runner: `bun run test/scripts/run-test.ts <path>`.
 */
import { describe, expect, spyOn, test, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attemptEmitClaim,
  buildEmitClaimKey,
  NOTIFICATION_EMIT_CLAIM_TTL_SECONDS,
  parseStoredEmitReceipt,
  serializeEmitReceipt,
  storeEmitReceiptQuietly,
  warnEmitIdempotencyUnavailable,
} from "@/backend/services/notifications/emit-idempotency";
import { logger } from "@/backend/lib/logger";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import type { NotificationDeliveryReceipt } from "@/backend/types";

describe("buildEmitClaimKey", () => {
  test("is deterministic and order-insensitive across the recipient set", () => {
    const key1 = buildEmitClaimKey([3, 1, 2], NotificationType.SystemBroadcast, "foo");
    const key2 = buildEmitClaimKey([1, 2, 3], NotificationType.SystemBroadcast, "foo");
    expect(key1).toBe(key2);
  });

  test("is cohort-sensitive", () => {
    const key1 = buildEmitClaimKey([1, 2], NotificationType.SystemBroadcast, "foo");
    const key2 = buildEmitClaimKey([1, 2, 3], NotificationType.SystemBroadcast, "foo");
    expect(key1).not.toBe(key2);
  });

  test("digest is hex-only and correctly prefixed", () => {
    const key = buildEmitClaimKey([1], NotificationType.SystemBroadcast, "foo");
    expect(key).toStartWith("notif:emit:");
    const digest = key.slice(11);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("emit-idempotency log hygiene", () => {
  test("the module source contains no console.* (static scan)", () => {
    const source = readFileSync(join(import.meta.dir, "emit-idempotency.ts"), "utf8");
    expect(source.includes("console.")).toBe(false);
  });
});

describe("warnEmitIdempotencyUnavailable", () => {
  test("logs a domain error indicating idempotency is degraded", () => {
    const spy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    warnEmitIdempotencyUnavailable();
    expect(spy).toHaveBeenCalledWith(
      "Notification emit idempotency unavailable (no claim cache injected); proceeding fail-open",
      {
        code: "NOTIFICATION_IDEMPOTENCY_DEGRADED",
        entity: "notifications",
      }
    );
    spy.mockRestore();
  });
});

describe("serializeEmitReceipt", () => {
  test("serializes the receipt to a JSON string", () => {
    const date = new Date("2026-09-04T00:00:00.000Z");
    const receipt: NotificationDeliveryReceipt = {
      notifications: [
        {
          id: 1,
          userId: 1,
          type: NotificationType.SystemBroadcast,
          title: "title",
          body: "body",
          isRead: false,
          relatedEntityType: null,
          relatedEntityId: null,
          createdAt: date,
        },
      ],
      recipientUserIds: [1],
    };
    const serialized = serializeEmitReceipt(receipt);
    expect(JSON.parse(serialized)).toEqual({
      notifications: [
        {
          id: 1,
          userId: 1,
          type: NotificationType.SystemBroadcast,
          title: "title",
          body: "body",
          isRead: false,
          relatedEntityType: null,
          relatedEntityId: null,
          createdAt: "2026-09-04T00:00:00.000Z",
        },
      ],
      recipientUserIds: [1],
    });
  });
});

describe("parseStoredEmitReceipt", () => {
  const validSerialized = JSON.stringify({
    notifications: [
      {
        id: 1,
        userId: 1,
        type: NotificationType.SystemBroadcast,
        title: "title",
        body: "body",
        isRead: false,
        relatedEntityType: null,
        relatedEntityId: null,
        createdAt: "2026-09-04T00:00:00.000Z",
      },
    ],
    recipientUserIds: [1],
  });

  test("revives a valid receipt successfully", () => {
    const receipt = parseStoredEmitReceipt(validSerialized);
    expect(receipt).not.toBeNull();
    expect(receipt?.notifications[0].createdAt).toBeInstanceOf(Date);
    expect(receipt?.notifications[0].createdAt.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  test("returns null for unparseable JSON", () => {
    expect(parseStoredEmitReceipt("{ bad json")).toBeNull();
  });

  test("returns null for missing required top-level fields", () => {
    expect(parseStoredEmitReceipt(JSON.stringify({ recipientUserIds: [1] }))).toBeNull();
    expect(parseStoredEmitReceipt(JSON.stringify({ notifications: [] }))).toBeNull();
  });

  test("returns null if top-level fields are not arrays", () => {
    expect(parseStoredEmitReceipt(JSON.stringify({ notifications: "not an array", recipientUserIds: [1] }))).toBeNull();
    expect(parseStoredEmitReceipt(JSON.stringify({ notifications: [], recipientUserIds: "not an array" }))).toBeNull();
  });

  test("returns null if arrays are empty", () => {
    expect(parseStoredEmitReceipt(JSON.stringify({ notifications: [], recipientUserIds: [1] }))).toBeNull();
    expect(parseStoredEmitReceipt(JSON.stringify({ notifications: [{ /* dummy row */ }], recipientUserIds: [] }))).toBeNull();
  });

  test("returns null for non-positive safe integer recipient ids", () => {
    // This will hit the parseStoredNotificationRow failing or the recipient validation.
    // For specificity, let's construct a fully valid body except the recipient id.
    const validButBadRecipient = validSerialized.replace("[1]", "[-1]");
    expect(parseStoredEmitReceipt(validButBadRecipient)).toBeNull();
    const validButStringRecipient = validSerialized.replace("[1]", '["1"]');
    expect(parseStoredEmitReceipt(validButStringRecipient)).toBeNull();
  });

  describe("parseStoredNotificationRow validations", () => {
    const validRow = {
      id: 1,
      userId: 1,
      type: NotificationType.SystemBroadcast,
      title: "title",
      body: "body",
      isRead: false,
      relatedEntityType: null,
      relatedEntityId: null,
      createdAt: "2026-09-04T00:00:00.000Z",
    };

    const runParseWithRow = (rowModifier: (row: Record<string, unknown>) => void) => {
      const row: Record<string, unknown> = { ...validRow };
      rowModifier(row);
      return parseStoredEmitReceipt(JSON.stringify({ notifications: [row], recipientUserIds: [1] }));
    };

    test("returns null if missing required fields in row", () => {
      expect(runParseWithRow((r) => { delete r.id; })).toBeNull();
      expect(runParseWithRow((r) => { delete r.title; })).toBeNull();
      expect(runParseWithRow((r) => { delete r.createdAt; })).toBeNull();
    });

    test("returns null if id or userId are not positive safe integers", () => {
      expect(runParseWithRow((r) => Object.assign(r, { id: -1 }))).toBeNull();
      expect(runParseWithRow((r) => Object.assign(r, { userId: 1.5 }))).toBeNull();
    });

    test("returns null if type is not a valid NotificationType", () => {
      expect(runParseWithRow((r) => Object.assign(r, { type: "INVALID_TYPE" }))).toBeNull();
    });

    test("returns null if string fields are not strings", () => {
      expect(runParseWithRow((r) => Object.assign(r, { title: 123 }))).toBeNull();
      expect(runParseWithRow((r) => Object.assign(r, { body: 123 }))).toBeNull();
      expect(runParseWithRow((r) => Object.assign(r, { relatedEntityType: 123 }))).toBeNull();
    });

    test("allows body and relatedEntityType to be null", () => {
      expect(runParseWithRow((r) => Object.assign(r, { body: null, relatedEntityType: null }))).not.toBeNull();
    });

    test("returns null if isRead is not boolean", () => {
      expect(runParseWithRow((r) => Object.assign(r, { isRead: 1 }))).toBeNull();
    });

    test("returns null if relatedEntityId is not a positive safe int", () => {
      expect(runParseWithRow((r) => Object.assign(r, { relatedEntityId: -1 }))).toBeNull();
      expect(runParseWithRow((r) => Object.assign(r, { relatedEntityId: "1" }))).toBeNull();
    });

    test("returns null if createdAt is not a valid date string", () => {
      expect(runParseWithRow((r) => Object.assign(r, { createdAt: 123 }))).toBeNull();
      expect(runParseWithRow((r) => Object.assign(r, { createdAt: "not a date" }))).toBeNull();
    });
  });
});

describe("attemptEmitClaim", () => {
  const key = "test-key";

  test("returns claimed when claim is successful", async () => {
    const cache = {
      claim: mock().mockResolvedValue(true),
      get: mock(),
      store: mock(),
    };
    const outcome = await attemptEmitClaim(cache, key);
    expect(outcome).toEqual({ status: "claimed" });
    expect(cache.claim).toHaveBeenCalledWith(key, NOTIFICATION_EMIT_CLAIM_TTL_SECONDS);
  });

  test("returns duplicate when claim fails but valid receipt is found", async () => {
    const validSerialized = JSON.stringify({
      notifications: [
        {
          id: 1,
          userId: 1,
          type: NotificationType.SystemBroadcast,
          title: "title",
          body: "body",
          isRead: false,
          relatedEntityType: null,
          relatedEntityId: null,
          createdAt: "2026-09-04T00:00:00.000Z",
        },
      ],
      recipientUserIds: [1],
    });
    const cache = {
      claim: mock().mockResolvedValue(false),
      get: mock().mockResolvedValue(validSerialized),
      store: mock(),
    };
    const outcome = await attemptEmitClaim(cache, key);
    expect(outcome.status).toBe("duplicate");
    if (outcome.status === "duplicate") {
      expect(outcome.receipt.recipientUserIds).toEqual([1]);
    }
  });

  test("returns unavailable when claim fails and no receipt is found", async () => {
    const cache = {
      claim: mock().mockResolvedValue(false),
      get: mock().mockResolvedValue(null),
      store: mock(),
    };
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    const outcome = await attemptEmitClaim(cache, key);
    expect(outcome).toEqual({ status: "unavailable" });
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("returns unavailable when claim fails and unparseable receipt is found", async () => {
    const cache = {
      claim: mock().mockResolvedValue(false),
      get: mock().mockResolvedValue("{ bad json"),
      store: mock(),
    };
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    const outcome = await attemptEmitClaim(cache, key);
    expect(outcome).toEqual({ status: "unavailable" });
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("returns unavailable when cache throws an error", async () => {
    const cache = {
      claim: mock().mockRejectedValue(new Error("cache error")),
      get: mock(),
      store: mock(),
    };
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    const outcome = await attemptEmitClaim(cache, key);
    expect(outcome).toEqual({ status: "unavailable" });
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe("storeEmitReceiptQuietly", () => {
  const key = "test-key";
  const receipt: NotificationDeliveryReceipt = {
    notifications: [
      {
        id: 1,
        userId: 1,
        type: NotificationType.SystemBroadcast,
        title: "title",
        body: "body",
        isRead: false,
        relatedEntityType: null,
        relatedEntityId: null,
        createdAt: new Date(),
      },
    ],
    recipientUserIds: [1],
  };

  test("stores the receipt quietly", async () => {
    const cache = {
      claim: mock(),
      get: mock(),
      store: mock().mockResolvedValue(undefined),
    };
    await storeEmitReceiptQuietly(cache, key, receipt);
    expect(cache.store).toHaveBeenCalledWith(key, serializeEmitReceipt(receipt), NOTIFICATION_EMIT_CLAIM_TTL_SECONDS);
  });

  test("catches and logs errors without crashing", async () => {
    const cache = {
      claim: mock(),
      get: mock(),
      store: mock().mockRejectedValue(new Error("store error")),
    };
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
    await storeEmitReceiptQuietly(cache, key, receipt);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
