/**
 * ParentMonitoringService tests — the five service operations over MOCKED
 * repository + actor seams.
 *
 * Per `backend/services/AGENTS.md` service-test rules: mock the persistence
 * seam and NEVER write real rows. The service is pure orchestration over
 * repos — the gate (`requireLinkedChild`) is imported from the same-domain
 * sibling helpers, and the actor re-check (`requireActor`) is imported
 * from `parent-link-request.helpers`. Both are exercised here through
 * repository spies (real resolution — never patched), with `runInRollback`
 * supplying a transactional `tx` that the service's `withTransaction` joins
 * as a SAVEPOINT (so denial throws inside the savepoint surface to the
 * test cleanly without aborting the outer tx).
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): each of the five methods on the happy path
 *    (linked parent → data); the list-empty case (`listLinkedChildren` with
 *    zero linked children); the four per-student methods with empty
 *    sessions/reports/homework sets (honest empty payloads, never
 *    fabricated).
 *  - Tier 2 (boundary): pagination clamp echo (page 0 → 1, pageSize 100 →
 *    25, pageSize exactly 50, out-of-range page → empty items next to true
 *    totalCount); null rating/notes/track blocks/missing latest position
 *    (mapper boundary arms); session with `startedAt: null`.
 *  - Tier 3 (chaos): concurrent mixed reads on one parent via
 *    `Promise.allSettled` (five methods issued concurrently against the
 *    SAME parentActorId — each call resolves independently against the
 *    shared mocked repos).
 *  - Tier 4 (security): the denial oracle — every per-student method
 *    denies with the SAME constant ForbiddenError + localized message +
 *    ONE bounded logDomainError whose context bag is exactly
 *    `{ code, entity, entityId, locale }` (zero child fields), across the
 *    five denial causes (malformed id, missing row, foreign id,
 *    never-linked id, severed child). The BOLA arm: a non-parent actor
 *    (admin/teacher/student) is rejected by `requireActor(...,
 *    UserRole.Parent, ...)` with `ForbiddenError` BEFORE any data read
 *    (gate-before-read proven by call ordering spies).
 *
 * All translated-message assertions compute the expected copy through
 * `getServerTranslations(locale).errorsTranslations.forbidden` — never raw
 * strings. Denial copy is asserted for BOTH `en` and `ar`.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  HomeWorkRepository,
  ProgressRepository,
  type ReportForStudentRow,
  ReportRepository,
  SessionRepository,
  StudentRepository,
  UserRepository,
} from "@/backend/db/repo";
import { runInRollback } from "@/backend/db/test/test-utils";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { ForbiddenError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { requireActor } from "@/backend/services/parents/parent-link-request.helpers";
import { ParentMonitoringService } from "@/backend/services/parents/parent-monitoring.service";
import type {
  DBTransaction,
  HomeWorkSelectType,
  SessionSelectType,
  StudentSelectType,
  UserSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE_EN = "en";
const LOCALE_AR = "ar";

const enErrors = getServerTranslations(LOCALE_EN).errorsTranslations;
const arErrors = getServerTranslations(LOCALE_AR).errorsTranslations;

const PARENT_ACTOR_ID = 10;
const CHILD_STUDENT_ID = 30;

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

/** Locale-stable comparator for sorted key-set assertions. */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const parentUser: UserSelectType = {
  id: PARENT_ACTOR_ID,
  fullName: "Linked Parent",
  email: "parent@test.local",
  phone: "+1234567890",
  passwordHash: "hash",
  role: "parent",
  isDeleted: false,
  isBlocked: false,
  suspended: false,
  suspendedAt: null,
  suspendedPeriodDays: null,
  lastActiveAt: null,
  country: null,
  dateOfBirth: null,
  gender: null,
  blockedAt: null,
  deletedAt: null,
  locale: "en",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const childUser: UserSelectType = {
  ...parentUser,
  id: CHILD_STUDENT_ID,
  fullName: "Linked Child",
  email: "child@test.local",
  role: "student",
};

const childStudent: StudentSelectType = {
  id: CHILD_STUDENT_ID,
  balanceHifz: 0,
  balanceReviews: 0,
  balanceTajweed: 0,
  balanceTrial: 0,
  trialGrantedAt: null,
  primaryLanguage: null,
  anotherLanguage: null,
  handshakeCode: "ABC12345",
  parentId: PARENT_ACTOR_ID,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const childSession: SessionSelectType = {
  id: 100,
  teacherId: 5,
  studentId: CHILD_STUDENT_ID,
  status: SessionStatus.Completed,
  sessionType: "student_session",
  intent: null,
  fee: null,
  feeHeld: false,
  heldBalanceLane: null,
  startedAt: new Date("2026-02-01T09:00:00.000Z"),
  endedAt: new Date("2026-02-01T09:45:00.000Z"),
  confirmedByStudentAt: null,
  confirmedByTeacherAt: null,
  confirmationDeadline: null,
  cancelReason: null,
  disputeReason: null,
  disputedAt: null,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: new Date("2026-01-31T10:00:00.000Z"),
  updatedAt: new Date("2026-01-31T10:00:00.000Z"),
};

const childReportRow: ReportForStudentRow = {
  id: 300,
  sessionId: 100,
  teacherNotes: "Great focus.",
  studentRatingByTeacher: 4,
  createdAt: new Date("2026-02-01T10:00:00.000Z"),
  updatedAt: new Date("2026-02-01T10:00:00.000Z"),
  sessionStatus: SessionStatus.Completed,
  sessionStartedAt: new Date("2026-02-01T09:00:00.000Z"),
};

const childHomeWork: HomeWorkSelectType = {
  id: 200,
  sessionId: 100,
  currentFromAyah: 1,
  currentToAyah: 7,
  currentGrade: 80,
  currentSurahJuz: SurahJuzRef.SurahAlFatihah,
  revisionFromAyah: null,
  revisionToAyah: null,
  revisionGrade: null,
  revisionSurahJuz: null,
  createdAt: new Date("2026-01-31T10:00:00.000Z"),
  updatedAt: new Date("2026-01-31T10:00:00.000Z"),
};

/**
 * Mocks the actor re-check + the link gate's two repository calls so the
 * service's downstream reads (sessions/reports/homework/progress) can be
 * spied independently per test.
 */
function mockActorAndGateSuccess() {
  trackSpy(
    spyOn(UserRepository, "findById").mockImplementation(async id => {
      if (id === PARENT_ACTOR_ID) {
        return parentUser;
      }
      if (id === CHILD_STUDENT_ID) {
        return childUser;
      }
      return null;
    })
  );
  trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue(childStudent));
}

// ─── Tier 1 — happy-path branches ───────────────────────────────────────────

describe("ParentMonitoringService — Tier 1 (happy paths)", () => {
  test("listLinkedChildren returns the linked-children rows from the repo", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(
        spyOn(StudentRepository, "listLinkedChildrenByParentId").mockResolvedValue([
          { id: CHILD_STUDENT_ID, fullName: "Linked Child", createdAt: childStudent.createdAt },
        ])
      );

      const result = await ParentMonitoringService.listLinkedChildren(PARENT_ACTOR_ID, LOCALE_EN, tx);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(CHILD_STUDENT_ID);
      expect(result[0]?.fullName).toBe("Linked Child");
    });
  });

  test("listLinkedChildren yields an empty array when the parent has zero linked children", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(StudentRepository, "listLinkedChildrenByParentId").mockResolvedValue([]));

      const result = await ParentMonitoringService.listLinkedChildren(PARENT_ACTOR_ID, LOCALE_EN, tx);
      expect(result).toEqual([]);
    });
  });

  test("getChildProgress composes child header + progress count + latest positions", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(ProgressRepository, "countForStudent").mockResolvedValue(7));
      trackSpy(spyOn(HomeWorkRepository, "findLatestByStudentId").mockResolvedValue(childHomeWork));

      const result = await ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx);
      expect(result.child.id).toBe(CHILD_STUDENT_ID);
      expect(result.child.fullName).toBe("Linked Child");
      expect(result.progressRowCount).toBe(7);
      expect(result.latestJadidPosition?.surahJuz).toBe(SurahJuzRef.SurahAlFatihah);
      expect(result.latestMadiPosition).toBeNull();
    });
  });

  test("getChildProgress emits zero progressRowCount when no progress rows exist", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(ProgressRepository, "countForStudent").mockResolvedValue(0));
      trackSpy(spyOn(HomeWorkRepository, "findLatestByStudentId").mockResolvedValue(null));

      const result = await ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx);
      expect(result.progressRowCount).toBe(0);
      expect(result.latestJadidPosition).toBeNull();
      expect(result.latestMadiPosition).toBeNull();
    });
  });

  test("listChildSessions returns the paginated attendance window", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([childSession]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(1));

      const result = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        { page: 1, pageSize: 25 },
        LOCALE_EN,
        tx
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(100);
      expect(result.items[0]?.status).toBe(SessionStatus.Completed);
      expect(result.totalCount).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
    });
  });

  test("listChildSessions yields an empty items array with honest totalCount when no sessions exist", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(0));

      const result = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  test("listChildReports returns the paginated report window", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(ReportRepository, "listForStudent").mockResolvedValue([childReportRow]));
      trackSpy(spyOn(ReportRepository, "countForStudent").mockResolvedValue(1));

      const result = await ParentMonitoringService.listChildReports(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(300);
      expect(result.items[0]?.teacherNotes).toBe("Great focus.");
      expect(result.items[0]?.studentRatingByTeacher).toBe(4);
    });
  });

  test("listChildReports yields empty items + honest total when no reports exist", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(ReportRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(ReportRepository, "countForStudent").mockResolvedValue(0));

      const result = await ParentMonitoringService.listChildReports(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  test("listChildHomework returns the paginated homework window", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(HomeWorkRepository, "listForStudent").mockResolvedValue([childHomeWork]));
      trackSpy(spyOn(HomeWorkRepository, "countForStudent").mockResolvedValue(1));

      const result = await ParentMonitoringService.listChildHomework(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(200);
      expect(result.items[0]?.jadid?.surahJuz).toBe(SurahJuzRef.SurahAlFatihah);
      expect(result.items[0]?.madi).toBeNull();
    });
  });

  test("listChildHomework yields empty items + honest total when no homework rows exist", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(HomeWorkRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(HomeWorkRepository, "countForStudent").mockResolvedValue(0));

      const result = await ParentMonitoringService.listChildHomework(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });
});

// ─── Tier 2 — boundary arms ─────────────────────────────────────────────────

describe("ParentMonitoringService — Tier 2 (boundary arms)", () => {
  test("listChildSessions clamps page 0 → 1 and echoes the effective page", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      const sessionSpy = trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(0));

      const result = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        { page: 0, pageSize: 10 },
        LOCALE_EN,
        tx
      );
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      // listForStudent receives the clamped limit/offset pair (offset = (page - 1) * pageSize = 0).
      expect(sessionSpy.mock.calls[0]?.[2]).toBe(10);
      expect(sessionSpy.mock.calls[0]?.[3]).toBe(0);
    });
  });

  test("listChildSessions clamps pageSize 100 → 25 (default) and echoes the effective pageSize", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      const sessionSpy = trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(0));

      const result = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        { page: 1, pageSize: 100 },
        LOCALE_EN,
        tx
      );
      expect(result.pageSize).toBe(25);
      expect(sessionSpy.mock.calls[0]?.[2]).toBe(25);
    });
  });

  test("listChildSessions accepts pageSize exactly at the upper bound of 50", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      const sessionSpy = trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(0));

      const result = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        { page: 2, pageSize: 50 },
        LOCALE_EN,
        tx
      );
      expect(result.pageSize).toBe(50);
      expect(result.page).toBe(2);
      expect(sessionSpy.mock.calls[0]?.[3]).toBe(50);
    });
  });

  test("listChildSessions defaults page and pageSize when input is undefined", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(0));

      const result = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
    });
  });

  test("listChildReports out-of-range page yields empty items next to the true totalCount", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(ReportRepository, "listForStudent").mockResolvedValue([]));
      trackSpy(spyOn(ReportRepository, "countForStudent").mockResolvedValue(7));

      const result = await ParentMonitoringService.listChildReports(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        { page: 99, pageSize: 10 },
        LOCALE_EN,
        tx
      );
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(7);
      expect(result.page).toBe(99);
      expect(result.pageSize).toBe(10);
    });
  });

  test("listChildReports preserves null teacherNotes and null studentRatingByTeacher in the projection", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(
        spyOn(ReportRepository, "listForStudent").mockResolvedValue([
          { ...childReportRow, teacherNotes: null, studentRatingByTeacher: null },
        ])
      );
      trackSpy(spyOn(ReportRepository, "countForStudent").mockResolvedValue(1));

      const result = await ParentMonitoringService.listChildReports(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items[0]?.teacherNotes).toBeNull();
      expect(result.items[0]?.studentRatingByTeacher).toBeNull();
    });
  });

  test("listChildHomework collapses fully-null track blocks and preserves partial nullability", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(
        spyOn(HomeWorkRepository, "listForStudent").mockResolvedValue([
          {
            ...childHomeWork,
            currentFromAyah: null,
            currentToAyah: null,
            currentGrade: null,
            currentSurahJuz: null,
            revisionFromAyah: 10,
            revisionToAyah: 20,
            revisionGrade: null,
            revisionSurahJuz: SurahJuzRef.Juz1,
          },
        ])
      );
      trackSpy(spyOn(HomeWorkRepository, "countForStudent").mockResolvedValue(1));

      const result = await ParentMonitoringService.listChildHomework(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items[0]?.jadid).toBeNull();
      expect(result.items[0]?.madi).not.toBeNull();
      expect(result.items[0]?.madi?.surahJuz).toBe(SurahJuzRef.Juz1);
      expect(result.items[0]?.madi?.grade).toBeNull();
    });
  });

  test("getChildProgress yields null latest positions when the newest homework has no surah/juz reference on either track", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(ProgressRepository, "countForStudent").mockResolvedValue(3));
      trackSpy(
        spyOn(HomeWorkRepository, "findLatestByStudentId").mockResolvedValue({
          ...childHomeWork,
          currentSurahJuz: null,
          revisionSurahJuz: null,
        })
      );

      const result = await ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx);
      expect(result.progressRowCount).toBe(3);
      expect(result.latestJadidPosition).toBeNull();
      expect(result.latestMadiPosition).toBeNull();
    });
  });

  test("listChildSessions maps a scheduled session with null startedAt and endedAt", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(
        spyOn(SessionRepository, "listForStudent").mockResolvedValue([
          { ...childSession, id: 101, status: SessionStatus.Scheduled, startedAt: null, endedAt: null },
        ])
      );
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(1));

      const result = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      expect(result.items[0]?.status).toBe(SessionStatus.Scheduled);
      expect(result.items[0]?.startedAt).toBeNull();
      expect(result.items[0]?.endedAt).toBeNull();
    });
  });

  test("all page payloads expose ONLY the closed {items,totalCount,page,pageSize} shape", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([childSession]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(1));
      trackSpy(spyOn(ReportRepository, "listForStudent").mockResolvedValue([childReportRow]));
      trackSpy(spyOn(ReportRepository, "countForStudent").mockResolvedValue(1));
      trackSpy(spyOn(HomeWorkRepository, "listForStudent").mockResolvedValue([childHomeWork]));
      trackSpy(spyOn(HomeWorkRepository, "countForStudent").mockResolvedValue(1));

      const sessions = await ParentMonitoringService.listChildSessions(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      const reports = await ParentMonitoringService.listChildReports(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );
      const homework = await ParentMonitoringService.listChildHomework(
        PARENT_ACTOR_ID,
        CHILD_STUDENT_ID,
        undefined,
        LOCALE_EN,
        tx
      );

      const expectedKeys = ["items", "page", "pageSize", "totalCount"];
      expect(Object.keys(sessions).toSorted(compareStrings)).toEqual(expectedKeys);
      expect(Object.keys(reports).toSorted(compareStrings)).toEqual(expectedKeys);
      expect(Object.keys(homework).toSorted(compareStrings)).toEqual(expectedKeys);
    });
  });
});

// ─── Tier 3 — concurrent mixed calls on one parent ─────────────────────────

describe("ParentMonitoringService — Tier 3 (concurrent mixed calls on one parent)", () => {
  test("Promise.allSettled over all five methods resolves independently against shared mocked repos", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      trackSpy(
        spyOn(StudentRepository, "listLinkedChildrenByParentId").mockResolvedValue([
          { id: CHILD_STUDENT_ID, fullName: "Linked Child", createdAt: childStudent.createdAt },
        ])
      );
      trackSpy(spyOn(ProgressRepository, "countForStudent").mockResolvedValue(4));
      trackSpy(spyOn(HomeWorkRepository, "findLatestByStudentId").mockResolvedValue(childHomeWork));
      trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([childSession]));
      trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(1));
      trackSpy(spyOn(ReportRepository, "listForStudent").mockResolvedValue([childReportRow]));
      trackSpy(spyOn(ReportRepository, "countForStudent").mockResolvedValue(1));
      trackSpy(spyOn(HomeWorkRepository, "listForStudent").mockResolvedValue([childHomeWork]));
      trackSpy(spyOn(HomeWorkRepository, "countForStudent").mockResolvedValue(1));

      const outcomes = await Promise.allSettled([
        ParentMonitoringService.listLinkedChildren(PARENT_ACTOR_ID, LOCALE_EN, tx),
        ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx),
        ParentMonitoringService.listChildSessions(PARENT_ACTOR_ID, CHILD_STUDENT_ID, undefined, LOCALE_EN, tx),
        ParentMonitoringService.listChildReports(PARENT_ACTOR_ID, CHILD_STUDENT_ID, undefined, LOCALE_EN, tx),
        ParentMonitoringService.listChildHomework(PARENT_ACTOR_ID, CHILD_STUDENT_ID, undefined, LOCALE_EN, tx),
      ]);

      expect(outcomes).toHaveLength(5);
      for (const outcome of outcomes) {
        expect(outcome.status).toBe("fulfilled");
      }
    });
  });

  test("Promise.allSettled over a denied child id alongside the linked-children list — denial does not poison the list", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      mockActorAndGateSuccess();
      trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue({ ...childStudent, parentId: 99 }));
      trackSpy(
        spyOn(StudentRepository, "listLinkedChildrenByParentId").mockResolvedValue([
          { id: CHILD_STUDENT_ID, fullName: "Linked Child", createdAt: childStudent.createdAt },
        ])
      );

      const outcomes = await Promise.allSettled([
        ParentMonitoringService.listLinkedChildren(PARENT_ACTOR_ID, LOCALE_EN, tx),
        ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx),
      ]);
      expect(outcomes[0]?.status).toBe("fulfilled");
      expect(outcomes[1]?.status).toBe("rejected");
      if (outcomes[1]?.status === "rejected") {
        expect(outcomes[1].reason).toBeInstanceOf(ForbiddenError);
      }
    });
  });
});

// ─── Tier 4 — security: denial oracle + BOLA + gate-before-read ─────────────

describe("ParentMonitoringService — Tier 4 (denial oracle across all per-student methods)", () => {
  /** The five per-student methods that funnel through `requireLinkedChild`. */
  const PER_STUDENT_METHODS: ReadonlyArray<{
    readonly name: string;
    readonly call: (parentActorId: number, studentId: number, locale: string, tx: DBTransaction) => Promise<unknown>;
  }> = [
    {
      name: "getChildProgress",
      call: (parentActorId, studentId, locale, tx) =>
        ParentMonitoringService.getChildProgress(parentActorId, studentId, locale, tx),
    },
    {
      name: "listChildSessions",
      call: (parentActorId, studentId, locale, tx) =>
        ParentMonitoringService.listChildSessions(parentActorId, studentId, undefined, locale, tx),
    },
    {
      name: "listChildReports",
      call: (parentActorId, studentId, locale, tx) =>
        ParentMonitoringService.listChildReports(parentActorId, studentId, undefined, locale, tx),
    },
    {
      name: "listChildHomework",
      call: (parentActorId, studentId, locale, tx) =>
        ParentMonitoringService.listChildHomework(parentActorId, studentId, undefined, locale, tx),
    },
  ];

  /** The five denial causes — each is set up via repo spies. */
  type CauseId = "malformed" | "missing" | "foreign" | "never-linked" | "severed";

  const CAUSES: CauseId[] = ["malformed", "missing", "foreign", "never-linked", "severed"];

  function causeStudentId(causeId: CauseId): number {
    switch (causeId) {
      case "malformed":
        return -1;
      case "missing":
        return 9999;
      case "foreign":
      case "severed":
        return CHILD_STUDENT_ID;
      case "never-linked":
        return 31;
      default: {
        throw new Error(`Unhandled cause: ${String(causeId)}`);
      }
    }
  }

  function setupCause(causeId: CauseId) {
    if (causeId === "malformed") {
      return;
    }
    if (causeId === "missing") {
      trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue(null));
      return;
    }
    if (causeId === "foreign") {
      trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue({ ...childStudent, parentId: 99 }));
      return;
    }
    if (causeId === "never-linked") {
      trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue({ ...childStudent, id: 31, parentId: null }));
      return;
    }
    // severed: link valid, child user soft-deleted
    trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue(childStudent));
    trackSpy(
      spyOn(UserRepository, "findById").mockImplementation(async id =>
        id === PARENT_ACTOR_ID ? parentUser : { ...childUser, isDeleted: true }
      )
    );
  }

  for (const method of PER_STUDENT_METHODS) {
    for (const causeId of CAUSES) {
      test(`${method.name} denies cause '${causeId}' with the constant ForbiddenError + en copy`, async () => {
        await runInRollback(async tx => {
          silenceDomainLog();
          mockActorAndGateSuccess();
          setupCause(causeId);

          let caught: unknown = null;
          try {
            await method.call(PARENT_ACTOR_ID, causeStudentId(causeId), LOCALE_EN, tx);
          } catch (err) {
            caught = err;
          }
          expect(caught).toBeInstanceOf(ForbiddenError);
          if (caught instanceof ForbiddenError) {
            expect(caught.code).toBe("FORBIDDEN");
            expect(caught.message).toBe(enErrors.forbidden);
          }
        });
      });

      test(`${method.name} denies cause '${causeId}' with the constant ForbiddenError + ar copy under ar locale`, async () => {
        await runInRollback(async tx => {
          silenceDomainLog();
          mockActorAndGateSuccess();
          setupCause(causeId);

          let caught: unknown = null;
          try {
            await method.call(PARENT_ACTOR_ID, causeStudentId(causeId), LOCALE_AR, tx);
          } catch (err) {
            caught = err;
          }
          expect(caught).toBeInstanceOf(ForbiddenError);
          if (caught instanceof ForbiddenError) {
            expect(caught.code).toBe("FORBIDDEN");
            expect(caught.message).toBe(arErrors.forbidden);
          }
        });
      });
    }
  }

  test("oracle uniformity: every (method × cause) cell produces the same denial fingerprint under en", async () => {
    const fingerprints: string[] = [];
    await Promise.all(
      PER_STUDENT_METHODS.flatMap(method =>
        CAUSES.map(async causeId => {
          await runInRollback(async tx => {
            silenceDomainLog();
            mockActorAndGateSuccess();
            setupCause(causeId);
            try {
              await method.call(PARENT_ACTOR_ID, causeStudentId(causeId), LOCALE_EN, tx);
            } catch (err) {
              if (err instanceof ForbiddenError) {
                fingerprints.push(JSON.stringify({ code: err.code, message: err.message }));
              }
            }
          });
        })
      )
    );
    expect(fingerprints).toHaveLength(PER_STUDENT_METHODS.length * CAUSES.length);
    expect(new Set(fingerprints).size).toBe(1);
    expect(fingerprints[0]).toBe(JSON.stringify({ code: "FORBIDDEN", message: enErrors.forbidden }));
  });

  test("every per-student method emits exactly ONE bounded logDomainError per denial (no child fields in the context bag)", async () => {
    await runInRollback(async tx => {
      const logSpy = silenceDomainLog();
      mockActorAndGateSuccess();
      trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue({ ...childStudent, parentId: 99 }));

      let caught: unknown = null;
      try {
        await ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      expect(logSpy).toHaveBeenCalledTimes(1);

      const context = logSpy.mock.calls[0]?.[1];
      expect(context).toBeDefined();
      if (context !== undefined) {
        const contextKeys = Object.keys(context).toSorted(compareStrings);
        expect(contextKeys).toEqual(["code", "entity", "entityId", "locale"]);
        expect(context.entityId).toBe(CHILD_STUDENT_ID);
      }
    });
  });
});

// ─── Tier 4 — BOLA: non-parent actor id rejection ───────────────────────────

describe("ParentMonitoringService — Tier 4 (BOLA: non-parent actor rejection)", () => {
  /**
   * Verifies that the actor re-check (`requireActor(..., UserRole.Parent,
   * ..., false)`) rejects a non-parent actor with `ForbiddenError` BEFORE
   * any per-student transaction opens. The actor re-check runs first in
   * every method — `withTransaction` is never reached.
   */

  function mockNonParentActor() {
    trackSpy(
      spyOn(UserRepository, "findById").mockResolvedValue({
        ...parentUser,
        role: "admin" as UserSelectType["role"],
      })
    );
  }

  test("listLinkedChildren rejects a non-parent actor with ForbiddenError (en copy)", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      mockNonParentActor();
      const listSpy = trackSpy(spyOn(StudentRepository, "listLinkedChildrenByParentId"));

      let caught: unknown = null;
      try {
        await ParentMonitoringService.listLinkedChildren(PARENT_ACTOR_ID, LOCALE_EN, tx);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      if (caught instanceof ForbiddenError) {
        expect(caught.code).toBe("FORBIDDEN");
        expect(caught.message).toBe(enErrors.forbidden);
      }
      // Gate-before-read: the list repo call never fires.
      expect(listSpy).not.toHaveBeenCalled();
    });
  });

  test("getChildProgress rejects a non-parent actor with ForbiddenError (ar copy)", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      mockNonParentActor();
      const progressSpy = trackSpy(spyOn(ProgressRepository, "countForStudent"));

      let caught: unknown = null;
      try {
        await ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_AR, tx);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      if (caught instanceof ForbiddenError) {
        expect(caught.message).toBe(arErrors.forbidden);
      }
      expect(progressSpy).not.toHaveBeenCalled();
    });
  });

  test("listChildSessions rejects a non-parent actor before any session repo call", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      mockNonParentActor();
      const listSpy = trackSpy(spyOn(SessionRepository, "listForStudent"));
      const countSpy = trackSpy(spyOn(SessionRepository, "countForStudent"));

      let caught: unknown = null;
      try {
        await ParentMonitoringService.listChildSessions(PARENT_ACTOR_ID, CHILD_STUDENT_ID, undefined, LOCALE_EN, tx);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      expect(listSpy).not.toHaveBeenCalled();
      expect(countSpy).not.toHaveBeenCalled();
    });
  });

  test("listChildReports rejects a non-parent actor before any report repo call", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      mockNonParentActor();
      const listSpy = trackSpy(spyOn(ReportRepository, "listForStudent"));
      const countSpy = trackSpy(spyOn(ReportRepository, "countForStudent"));

      let caught: unknown = null;
      try {
        await ParentMonitoringService.listChildReports(PARENT_ACTOR_ID, CHILD_STUDENT_ID, undefined, LOCALE_EN, tx);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      expect(listSpy).not.toHaveBeenCalled();
      expect(countSpy).not.toHaveBeenCalled();
    });
  });

  test("listChildHomework rejects a non-parent actor before any homework repo call", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      mockNonParentActor();
      const listSpy = trackSpy(spyOn(HomeWorkRepository, "listForStudent"));
      const countSpy = trackSpy(spyOn(HomeWorkRepository, "countForStudent"));

      let caught: unknown = null;
      try {
        await ParentMonitoringService.listChildHomework(PARENT_ACTOR_ID, CHILD_STUDENT_ID, undefined, LOCALE_EN, tx);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      expect(listSpy).not.toHaveBeenCalled();
      expect(countSpy).not.toHaveBeenCalled();
    });
  });
});

// ─── Tier 4 — gate-before-read call ordering ────────────────────────────────

describe("ParentMonitoringService — Tier 4 (gate-before-read call ordering)", () => {
  test("getChildProgress runs requireLinkedChild BEFORE any downstream data read", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      const studentFindSpy = trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue(childStudent));
      const progressSpy = trackSpy(spyOn(ProgressRepository, "countForStudent").mockResolvedValue(2));
      const homeworkSpy = trackSpy(spyOn(HomeWorkRepository, "findLatestByStudentId").mockResolvedValue(null));

      await ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx);

      // Student lookup (the gate's first call) fires BEFORE progress / homework.
      expect(studentFindSpy).toHaveBeenCalled();
      const studentCallOrder = studentFindSpy.mock.invocationCallOrder[0];
      const progressCallOrder = progressSpy.mock.invocationCallOrder[0];
      const homeworkCallOrder = homeworkSpy.mock.invocationCallOrder[0];
      expect(studentCallOrder).toBeLessThan(progressCallOrder);
      expect(studentCallOrder).toBeLessThan(homeworkCallOrder);
    });
  });

  test("listChildSessions runs the gate BEFORE listForStudent / countForStudent", async () => {
    await runInRollback(async tx => {
      mockActorAndGateSuccess();
      const studentFindSpy = trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue(childStudent));
      const listSpy = trackSpy(spyOn(SessionRepository, "listForStudent").mockResolvedValue([]));
      const countSpy = trackSpy(spyOn(SessionRepository, "countForStudent").mockResolvedValue(0));

      await ParentMonitoringService.listChildSessions(PARENT_ACTOR_ID, CHILD_STUDENT_ID, undefined, LOCALE_EN, tx);

      const studentCallOrder = studentFindSpy.mock.invocationCallOrder[0];
      expect(studentCallOrder).toBeLessThan(listSpy.mock.invocationCallOrder[0]);
      expect(studentCallOrder).toBeLessThan(countSpy.mock.invocationCallOrder[0]);
    });
  });

  test("denial arm: requireLinkedChild throws BEFORE any per-student data read fires", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      mockActorAndGateSuccess();
      // Foreign parent — gate denies on the student row mismatch.
      trackSpy(spyOn(StudentRepository, "findById").mockResolvedValue({ ...childStudent, parentId: 999 }));
      const progressSpy = trackSpy(spyOn(ProgressRepository, "countForStudent"));
      const homeworkSpy = trackSpy(spyOn(HomeWorkRepository, "findLatestByStudentId"));

      let caught: unknown = null;
      try {
        await ParentMonitoringService.getChildProgress(PARENT_ACTOR_ID, CHILD_STUDENT_ID, LOCALE_EN, tx);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      expect(progressSpy).not.toHaveBeenCalled();
      expect(homeworkSpy).not.toHaveBeenCalled();
    });
  });
});

// ─── Direct requireActor coverage (token-role denial) ──────────────────────

describe("ParentMonitoringService — requireActor token-role denial (BFLA defense-in-depth)", () => {
  test("requireActor rejects a teacher-role actor with ForbiddenError + en copy", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      trackSpy(
        spyOn(UserRepository, "findById").mockResolvedValue({
          ...parentUser,
          role: "teacher" as UserSelectType["role"],
        })
      );

      let caught: unknown = null;
      try {
        await requireActor(PARENT_ACTOR_ID, UserRole.Parent, LOCALE_EN, tx, false);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      if (caught instanceof ForbiddenError) {
        expect(caught.code).toBe("FORBIDDEN");
        expect(caught.message).toBe(enErrors.forbidden);
      }
    });
  });

  test("requireActor rejects a student-role actor with ForbiddenError + ar copy", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      trackSpy(
        spyOn(UserRepository, "findById").mockResolvedValue({
          ...parentUser,
          role: "student" as UserSelectType["role"],
        })
      );

      let caught: unknown = null;
      try {
        await requireActor(PARENT_ACTOR_ID, UserRole.Parent, LOCALE_AR, tx, false);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenError);
      if (caught instanceof ForbiddenError) {
        expect(caught.message).toBe(arErrors.forbidden);
      }
    });
  });

  test("requireActor allows a parent-role actor (relaxed read path: governance arm disabled)", async () => {
    await runInRollback(async tx => {
      trackSpy(
        spyOn(UserRepository, "findById").mockResolvedValue({
          ...parentUser,
          // Governed flags would block on the mutation path; the read path
          // passes `enforceGovernance: false` so a governed-but-not-deleted
          // parent's self-scoped reads stay visible.
          isDeleted: true,
        })
      );

      const actor = await requireActor(PARENT_ACTOR_ID, UserRole.Parent, LOCALE_EN, tx, false);
      expect(actor.id).toBe(PARENT_ACTOR_ID);
    });
  });
});
