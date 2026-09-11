/**
 * Session Lifecycle Booking Internals Unit Test Suite (`session-lifecycle.booking.ts`).
 *
 * Tier 1: 100% statement & branch coverage for boundary assertions, debit ladder,
 *         teacher certification lock, idempotency claim insertion, duplicate replay,
 *         session defaults insertion, and claim backfill.
 * Tier 2: Boundary conditions (idempotency key length boundaries, confirmation deadline offset, fee calculations).
 * Tier 3: Chaos, statelessness & concurrency.
 * Tier 4: Security, error contracts, domain logging assertions, and payload safety.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { db } from "@/backend/db";
import {
  SessionRepository,
  SessionRequestIdempotencyRepository,
  StudentRepository,
  TeacherRepository,
} from "@/backend/db/repo";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { ConflictError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertBookingBoundary, bookSessionInTx } from "@/backend/services/classes/session-lifecycle.booking";
import { MAX_IDEMPOTENCY_KEY_LENGTH } from "@/backend/services/classes/session-lifecycle.guards";
import type {
  DBTransaction,
  SessionRequestIdempotencySelectType,
  SessionReturnType,
  SessionSubmitInput,
} from "@/backend/types";
import {
  SESSION_CONFIRMATION_WINDOW_MS,
  SESSION_FEE_HIFZ,
  SESSION_FEE_TAJWEED,
} from "@/shared/constants/session-fees.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

function t() {
  return getServerTranslations("en").errorsTranslations;
}

function createFakeTx(): DBTransaction {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const fakeTx = db as unknown as DBTransaction;
  Object.assign(fakeTx, {
    transaction: async <T>(cb: (tx: DBTransaction) => Promise<T>): Promise<T> => cb(fakeTx),
  });
  return fakeTx;
}

function createMockSession(overrides: Partial<SessionReturnType> = {}): SessionReturnType {
  const now = new Date();
  return {
    id: 100,
    teacherId: 2,
    studentId: 1,
    status: SessionStatus.Scheduled,
    sessionType: SessionType.StudentSession,
    intent: SessionIntent.Hifz,
    fee: SESSION_FEE_HIFZ,
    feeHeld: true,
    heldBalanceLane: HeldBalanceLane.Trial,
    confirmationDeadline: new Date(now.getTime() + SESSION_CONFIRMATION_WINDOW_MS),
    startedAt: null,
    endedAt: null,
    confirmedByTeacherAt: null,
    confirmedByStudentAt: null,
    cancelReason: null,
    disputeReason: null,
    disputedAt: null,
    resolutionNote: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockClaim(overrides: Partial<SessionRequestIdempotencySelectType> = {}): SessionRequestIdempotencySelectType {
  return {
    id: 50,
    idempotencyKey: "test-idempotency-key",
    userId: 1,
    sessionId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("session-lifecycle.booking — assertBookingBoundary", () => {
  describe("Tier 1 — branch coverage", () => {
    test("passes silently for valid boundary inputs", () => {
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };
      expect(() => assertBookingBoundary(1, input, "valid-key-123", t())).not.toThrow();

      const tajweedInput: SessionSubmitInput = { teacherId: 10, intent: SessionIntent.Tajweed };
      expect(() => assertBookingBoundary(5, tajweedInput, "another-key", t())).not.toThrow();
    });

    test("throws ValidationError for non-positive or non-safe-integer studentId", () => {
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };
      const invalidStudentIds = [0, -1, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];

      for (const badStudentId of invalidStudentIds) {
        expect(() => assertBookingBoundary(badStudentId, input, "valid-key", t())).toThrow(ValidationError);
        try {
          assertBookingBoundary(badStudentId, input, "valid-key", t());
        } catch (err) {
          expect(err).toBeInstanceOf(ValidationError);
          if (err instanceof ValidationError) {
            expect(err.message).toBe(t().validation);
          }
        }
      }
    });

    test("throws ValidationError for non-positive or non-safe-integer teacherId", () => {
      const invalidTeacherIds = [0, -1, -50, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];

      for (const badTeacherId of invalidTeacherIds) {
        const input: SessionSubmitInput = { teacherId: badTeacherId, intent: SessionIntent.Hifz };
        expect(() => assertBookingBoundary(1, input, "valid-key", t())).toThrow(ValidationError);
        try {
          assertBookingBoundary(1, input, "valid-key", t());
        } catch (err) {
          expect(err).toBeInstanceOf(ValidationError);
          if (err instanceof ValidationError) {
            expect(err.message).toBe(t().validation);
          }
        }
      }
    });

    test("throws ValidationError for empty or oversized idempotency keys", () => {
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      expect(() => assertBookingBoundary(1, input, "", t())).toThrow(ValidationError);
      try {
        assertBookingBoundary(1, input, "", t());
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        if (err instanceof ValidationError) {
          expect(err.message).toBe(t().idempotencyKeyRequired);
        }
      }

      const oversizedKey = "a".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1);
      expect(() => assertBookingBoundary(1, input, oversizedKey, t())).toThrow(ValidationError);
      try {
        assertBookingBoundary(1, input, oversizedKey, t());
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        if (err instanceof ValidationError) {
          expect(err.message).toBe(t().idempotencyKeyRequired);
        }
      }
    });

    test("throws ValidationError for invalid or out-of-vocabulary session intents", () => {
      const invalidIntents: unknown[] = [
        SessionIntent.Evaluation,
        "invalid_intent",
        "HIFZ",
        "TAJWEED",
      ];

      for (const badIntent of invalidIntents) {
        const baseInput: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };
        const input: SessionSubmitInput = Object.assign({}, baseInput);
        Object.assign(input, { intent: badIntent });

        expect(() => assertBookingBoundary(1, input, "valid-key", t())).toThrow(ValidationError);
        try {
          assertBookingBoundary(1, input, "valid-key", t());
        } catch (err) {
          expect(err).toBeInstanceOf(ValidationError);
          if (err instanceof ValidationError) {
            expect(err.message).toBe(t().invalidSessionIntent);
          }
        }
      }
    });
  });

  describe("Tier 2 — boundary & edge cases", () => {
    test("idempotency key length boundary: length 1 passes, MAX_IDEMPOTENCY_KEY_LENGTH (128) passes", () => {
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      expect(() => assertBookingBoundary(1, input, "k", t())).not.toThrow();
      expect(() => assertBookingBoundary(1, input, "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH), t())).not.toThrow();
      expect(() => assertBookingBoundary(1, input, "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1), t())).toThrow(ValidationError);
    });
  });

  describe("Tier 4 — security & abuse resistance", () => {
    test("idempotency key containing unicode, spaces, or control characters within length limit is accepted verbatim", () => {
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };
      const rawKey = "  key-with-spaces-\u0000-and-arabic-مرحبا  ";

      expect(() => assertBookingBoundary(1, input, rawKey, t())).not.toThrow();
    });
  });
});

describe("session-lifecycle.booking — bookSessionInTx", () => {
  let logSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    logSpy?.mockRestore();
  });

  describe("Tier 1 — branch coverage", () => {
    test("teacher target missing (null) throws NotFoundError with TEACHER_NOT_FOUND code and logs domain error", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue(null);

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 99, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-1", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        if (err instanceof NotFoundError) {
          expect(err.code).toBe("TEACHER_NOT_FOUND");
          expect(err.message).toBe(t().teacherNotFound);
        }
      }

      expect(lockSpy).toHaveBeenCalledWith(99, fakeTx);
      expect(logSpy).toHaveBeenCalledWith("Session booking rejected: teacher target not found", {
        code: "TEACHER_NOT_FOUND",
        entity: "session",
        entityId: 99,
      });

      lockSpy.mockRestore();
    });

    test("teacher not certified (isApproved false) throws ConflictError with TEACHER_NOT_CERTIFIED code and logs domain error", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 10, isApproved: false });
      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 10, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-unapproved", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        if (err instanceof ConflictError) {
          expect(err.code).toBe("TEACHER_NOT_CERTIFIED");
          expect(err.message).toBe(t().teacherNotCertified);
        }
      }

      expect(logSpy).toHaveBeenCalledWith("Session booking rejected: teacher not certified", {
        code: "TEACHER_NOT_CERTIFIED",
        entity: "session",
        entityId: 10,
      });

      lockSpy.mockRestore();
    });

    test("teacher not certified (isApproved null) throws ConflictError with TEACHER_NOT_CERTIFIED code and logs domain error", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 10, isApproved: null });
      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 10, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-null-cert", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        if (err instanceof ConflictError) {
          expect(err.code).toBe("TEACHER_NOT_CERTIFIED");
          expect(err.message).toBe(t().teacherNotCertified);
        }
      }

      expect(logSpy).toHaveBeenCalledWith("Session booking rejected: teacher not certified", {
        code: "TEACHER_NOT_CERTIFIED",
        entity: "session",
        entityId: 10,
      });

      lockSpy.mockRestore();
    });

    test("trial lane debit hit: debits trial lane first, creates session with Trial lane provenance, backfills claim session ID", async () => {
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockImplementation(async (_id, lane) => {
        return lane === HeldBalanceLane.Trial;
      });
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockResolvedValue(createMockClaim({ id: 50 }));
      const expectedSession = createMockSession({ heldBalanceLane: HeldBalanceLane.Trial });
      const insertSessionSpy = spyOn(SessionRepository, "insertSession").mockResolvedValue(expectedSession);
      const backfillSpy = spyOn(SessionRequestIdempotencyRepository, "updateClaimSessionId").mockResolvedValue(undefined);

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };
      const now = new Date();

      const created = await bookSessionInTx(1, input, "key-trial-hit", now, fakeTx, t());

      expect(created).toEqual(expectedSession);
      expect(lockSpy).toHaveBeenCalledWith(2, fakeTx);
      expect(decSpy).toHaveBeenCalledWith(1, HeldBalanceLane.Trial, fakeTx);
      expect(decSpy).not.toHaveBeenCalledWith(1, HeldBalanceLane.Hifz, fakeTx);
      expect(claimSpy).toHaveBeenCalledWith({ idempotencyKey: "key-trial-hit", userId: 1 }, fakeTx);
      expect(insertSessionSpy).toHaveBeenCalledWith(
        {
          teacherId: 2,
          studentId: 1,
          status: SessionStatus.Scheduled,
          sessionType: SessionType.StudentSession,
          intent: SessionIntent.Hifz,
          fee: SESSION_FEE_HIFZ,
          feeHeld: true,
          heldBalanceLane: HeldBalanceLane.Trial,
          confirmationDeadline: new Date(now.getTime() + SESSION_CONFIRMATION_WINDOW_MS),
        },
        fakeTx
      );
      expect(backfillSpy).toHaveBeenCalledWith(50, 100, fakeTx);

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      insertSessionSpy.mockRestore();
      backfillSpy.mockRestore();
    });

    test("intent lane debit hit: trial lane fails, intent lane (Tajweed) succeeds, creates session with Tajweed lane provenance", async () => {
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockImplementation(async (_id, lane) => {
        return lane === HeldBalanceLane.Tajweed;
      });
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockResolvedValue(createMockClaim({ id: 51 }));
      const expectedSession = createMockSession({ intent: SessionIntent.Tajweed, fee: SESSION_FEE_TAJWEED, heldBalanceLane: HeldBalanceLane.Tajweed });
      const insertSessionSpy = spyOn(SessionRepository, "insertSession").mockResolvedValue(expectedSession);
      const backfillSpy = spyOn(SessionRequestIdempotencyRepository, "updateClaimSessionId").mockResolvedValue(undefined);

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Tajweed };
      const now = new Date();

      const created = await bookSessionInTx(1, input, "key-tajweed-hit", now, fakeTx, t());

      expect(created).toEqual(expectedSession);
      expect(decSpy).toHaveBeenCalledWith(1, HeldBalanceLane.Trial, fakeTx);
      expect(decSpy).toHaveBeenCalledWith(1, HeldBalanceLane.Tajweed, fakeTx);
      expect(insertSessionSpy).toHaveBeenCalledWith(
        {
          teacherId: 2,
          studentId: 1,
          status: SessionStatus.Scheduled,
          sessionType: SessionType.StudentSession,
          intent: SessionIntent.Tajweed,
          fee: SESSION_FEE_TAJWEED,
          feeHeld: true,
          heldBalanceLane: HeldBalanceLane.Tajweed,
          confirmationDeadline: new Date(now.getTime() + SESSION_CONFIRMATION_WINDOW_MS),
        },
        fakeTx
      );

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      insertSessionSpy.mockRestore();
      backfillSpy.mockRestore();
    });

    test("all-miss debit ladder: trial lane and intent lane both miss throws ValidationError INSUFFICIENT_BALANCE and logs domain error", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(false);

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-insufficient", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        if (err instanceof ValidationError) {
          expect(err.code).toBe("INSUFFICIENT_BALANCE");
          expect(err.message).toBe(t().insufficientBalance);
        }
      }

      expect(decSpy).toHaveBeenCalledWith(1, HeldBalanceLane.Trial, fakeTx);
      expect(decSpy).toHaveBeenCalledWith(1, HeldBalanceLane.Hifz, fakeTx);
      expect(logSpy).toHaveBeenCalledWith("Session booking rejected: insufficient balance", {
        code: "INSUFFICIENT_BALANCE",
        entity: "session",
        entityId: 1,
      });

      lockSpy.mockRestore();
      decSpy.mockRestore();
    });

    test("duplicate claim key by same caller: replays with ConflictError DUPLICATE_REQUEST and logs domain error", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(true);

      const uniqueViolationError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockRejectedValue(uniqueViolationError);
      const findKeySpy = spyOn(SessionRequestIdempotencyRepository, "findByKey").mockResolvedValue(createMockClaim({ userId: 1, sessionId: 100 }));

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-duplicate-same-caller", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        if (err instanceof ConflictError) {
          expect(err.code).toBe("DUPLICATE_REQUEST");
          expect(err.message).toBe(t().duplicateRequest);
        }
      }

      expect(findKeySpy).toHaveBeenCalledWith("key-duplicate-same-caller", fakeTx);
      expect(logSpy).toHaveBeenCalledWith("Session booking replay blocked: key already claimed", {
        code: "DUPLICATE_REQUEST",
        entity: "session",
      });

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      findKeySpy.mockRestore();
    });

    test("duplicate claim key by DIFFERENT caller: replays with NotFoundError SESSION_NOT_FOUND and logs domain error", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(true);

      const uniqueViolationError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockRejectedValue(uniqueViolationError);
      const findKeySpy = spyOn(SessionRequestIdempotencyRepository, "findByKey").mockResolvedValue(createMockClaim({ userId: 999, sessionId: 100 }));

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-duplicate-diff-caller", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        if (err instanceof NotFoundError) {
          expect(err.code).toBe("SESSION_NOT_FOUND");
          expect(err.message).toBe(t().sessionNotFound);
        }
      }

      expect(findKeySpy).toHaveBeenCalledWith("key-duplicate-diff-caller", fakeTx);
      expect(logSpy).toHaveBeenCalledWith("Session booking replay denied: key claimed by another caller", {
        code: "SESSION_NOT_FOUND",
        entity: "session",
        entityId: 1,
      });

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      findKeySpy.mockRestore();
    });

    test("vanished claim on duplicate unique violation (claim is null) replays with ConflictError DUPLICATE_REQUEST", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(true);

      const uniqueViolationError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockRejectedValue(uniqueViolationError);
      const findKeySpy = spyOn(SessionRequestIdempotencyRepository, "findByKey").mockResolvedValue(null);

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-vanished-claim", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        if (err instanceof ConflictError) {
          expect(err.code).toBe("DUPLICATE_REQUEST");
          expect(err.message).toBe(t().duplicateRequest);
        }
      }

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      findKeySpy.mockRestore();
    });

    test("non-unique-violation error during claim insert rethrows untouched without calling replayBooking", async () => {
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(true);

      const genericDbError = new Error("database connection timeout");
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockRejectedValue(genericDbError);
      const findKeySpy = spyOn(SessionRequestIdempotencyRepository, "findByKey");

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, "key-db-error", new Date(), fakeTx, t());
        expect.unreachable("expected bookSessionInTx to throw");
      } catch (err) {
        expect(err).toBe(genericDbError);
      }

      expect(findKeySpy).not.toHaveBeenCalled();

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      findKeySpy.mockRestore();
    });
  });

  describe("Tier 2 — boundary cases & date offset calculation", () => {
    test("confirmation deadline is calculated as exactly now + 86400000 ms", async () => {
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(true);
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockResolvedValue(createMockClaim({ id: 80 }));
      const expectedSession = createMockSession();
      const insertSessionSpy = spyOn(SessionRepository, "insertSession").mockResolvedValue(expectedSession);
      const backfillSpy = spyOn(SessionRequestIdempotencyRepository, "updateClaimSessionId").mockResolvedValue(undefined);

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };
      const now = new Date(1700000000000);

      await bookSessionInTx(1, input, "key-deadline-check", now, fakeTx, t());

      const passedSessionArg = insertSessionSpy.mock.calls[0]?.[0];
      expect(passedSessionArg?.confirmationDeadline?.getTime()).toBe(now.getTime() + SESSION_CONFIRMATION_WINDOW_MS);

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      insertSessionSpy.mockRestore();
      backfillSpy.mockRestore();
    });
  });

  describe("Tier 3 — chaos & statelessness", () => {
    test("concurrent bookSessionInTx invocations execute cleanly and independently", async () => {
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(true);
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockImplementation(async (arg) =>
        createMockClaim({ idempotencyKey: arg.idempotencyKey })
      );
      const insertSessionSpy = spyOn(SessionRepository, "insertSession").mockImplementation(async (arg) =>
        createMockSession({ intent: arg.intent })
      );
      const backfillSpy = spyOn(SessionRequestIdempotencyRepository, "updateClaimSessionId").mockResolvedValue(undefined);

      const fakeTx = createFakeTx();
      const now = new Date();

      const results = await Promise.allSettled(
        Array.from({ length: 100 }, (_, i) => {
          const input: SessionSubmitInput = {
            teacherId: 2,
            intent: i % 2 === 0 ? SessionIntent.Hifz : SessionIntent.Tajweed,
          };
          return bookSessionInTx(i + 1, input, `key-concurrent-${i}`, now, fakeTx, t());
        })
      );

      expect(results.every(r => r.status === "fulfilled")).toBe(true);

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      insertSessionSpy.mockRestore();
      backfillSpy.mockRestore();
    });
  });

  describe("Tier 4 — security & domain logging payload safety", () => {
    test("domain error log payloads never contain sensitive idempotency keys", async () => {
      logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});
      const lockSpy = spyOn(TeacherRepository, "lockForCertificationCheck").mockResolvedValue({ id: 2, isApproved: true });
      const decSpy = spyOn(StudentRepository, "decrementLaneIfAvailable").mockResolvedValue(true);

      const uniqueViolationError = Object.assign(new Error("duplicate key"), { code: "23505" });
      const claimSpy = spyOn(SessionRequestIdempotencyRepository, "insertClaim").mockRejectedValue(uniqueViolationError);
      const sensitiveKey = "SUPER_SECRET_IDEMPOTENCY_KEY_12345";
      const findKeySpy = spyOn(SessionRequestIdempotencyRepository, "findByKey").mockResolvedValue(createMockClaim({ userId: 1 }));

      const fakeTx = createFakeTx();
      const input: SessionSubmitInput = { teacherId: 2, intent: SessionIntent.Hifz };

      try {
        await bookSessionInTx(1, input, sensitiveKey, new Date(), fakeTx, t());
      } catch {
        // Expected replay conflict
      }

      for (const call of logSpy.mock.calls) {
        const payloadStr = JSON.stringify(call);
        expect(payloadStr).not.toContain(sensitiveKey);
      }

      lockSpy.mockRestore();
      decSpy.mockRestore();
      claimSpy.mockRestore();
      findKeySpy.mockRestore();
    });
  });
});
