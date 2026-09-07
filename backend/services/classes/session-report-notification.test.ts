/**
 * SessionReportNotificationService — 4-tier suite (branch / boundary /
 * chaos / security) for the session-report notification seam.
 *
 * Per `backend/db/test/AGENTS.md` + `backend/services/AGENTS.md` (mirrors the
 * `session-request-notification.service.test.ts` sibling):
 *  - Every case runs inside `runInRollback`; `tx` is handed to the seam (its
 *    REQUIRED transaction) and to every direct Drizzle query.
 *  - The Tier-3 replay/rollback proofs need REAL commit boundaries, so that
 *    tier provisions its cast in ONE committing `beforeAll` transaction and
 *    hard-deletes it in `afterAll` in FK-safe order (Rule 9).
 *  - Error assertions use the `expectRepoError` try/catch helper — NEVER
 *    `expect(...).rejects.toThrow()`.
 *  - Fan-out is spied (`SpiedFanoutTransport`); the idempotency claim cache
 *    is an in-memory map injected through the `options` seam — no Redis, no
 *    WebSocket. The engine's claim replay path is exercised through it.
 *  - Entity rows come from `entity-setup.ts` helpers (the linked-parent leg
 *    rides the `createTestStudent` `parentId` override).
 *
 * Coverage map:
 *  - Tier 1: linked session ⇒ exactly 2 receipts (recipients, emission type,
 *    related-entity pointer, per-recipient claim keys, tx visibility, zero
 *    publishes, zero logs); unlinked session ⇒ exactly 1 receipt (student
 *    only, parent inbox untouched); missing session ⇒ typed SESSION_NOT_FOUND
 *    with ZERO logs (the seam logs nothing); hostile id ⇒ pre-DB VALIDATION.
 *  - Tier 2: requester locale never leaks into recipient copy (per-recipient
 *    composition); null persisted locale ⇒ platform-default copy for both
 *    recipients; hostile-id matrix; int4-ceiling valid-shape miss; hostile
 *    unicode/RTL names composed verbatim.
 *  - Tier 3: deterministic-key replay across separate committed scopes ⇒
 *    engine claim replay (same row ids, zero new rows, zero publishes);
 *    forced mid-tx failure after both emissions ⇒ total rollback, zero
 *    publishes (ghost pushes impossible); forced engine failure on the
 *    parent emission ⇒ typed error propagates and the caller-tx unit rolls
 *    back BOTH emissions; engine contract breach (bare row) ⇒ typed
 *    internal error.
 *  - Tier 4: copy privacy pin (no digits, no grade/rating/note vocabulary,
 *    no session id — names only); derived-recipient invariance across two
 *    participant pairs; half-joined parent leg fails closed to "unlinked"
 *    (repo spy); source pins (no logger, no publish call, no governance
 *    import, single wave-context read, enum VALUE import, deterministic
 *    idempotency key, no raw notification-type literal).
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/backend/db";
import { SessionRepository } from "@/backend/db/repo";
import { session } from "@/backend/db/schema/classes/session";
import { notifications } from "@/backend/db/schema/notifications";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestParent,
  createTestSession,
  createTestStudent,
  createTestTeacherRow,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { type DomainErrorContext, logger } from "@/backend/lib/logger";
import { SessionReportNotificationService } from "@/backend/services/classes/session-report-notification.service";
import { NotificationEngine, type NotificationEngineCallOptions } from "@/backend/services/notifications";
import {
  buildEmitClaimKey,
  type NotificationIdempotencyClaimCache,
} from "@/backend/services/notifications/emit-idempotency";
import type {
  DBTransaction,
  NotificationDeliveryReceipt,
  NotificationEmitInput,
  NotificationReturnType,
  SessionReportWaveContextRow,
  SessionSelectType,
} from "@/backend/types";
import type { AppLocale } from "@/shared/locale";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { SpiedFanoutTransport } from "@/test/workflows/helpers";

/** English translated error copy — denial assertions pin translated strings. */
const ERRORS_EN = getServerTranslations("en").errorsTranslations;
/** English report-ready copy — en-locale recipient fixtures. */
const NOTIFS_EN = getServerTranslations("en").notificationsTranslations;
/** Arabic report-ready copy — ar-locale recipient fixtures. */
const NOTIFS_AR = getServerTranslations("ar").notificationsTranslations;
/** Highest storable value of the int4 session primary key (valid shape, guaranteed absent). */
const INT4_MAX_SESSION_ID = 2_147_483_647;

/** One recorded domain-log call (code/entity/entityId/locale — copy never asserted from logs). */
interface DomainLogRecord {
  readonly code: string;
  readonly entity: string;
  readonly entityId: string | number | undefined;
  readonly locale: string | undefined;
}

/**
 * Map-backed claim cache with SET-NX-EX semantics: the first `claim` for a
 * key wins, later claims report held, `store` attaches the receipt a replay
 * reads back. `claimedKeys` records every raw claim key the engine attempted
 * so tests can pin key determinism and per-recipient distinctness.
 */
class MapBackedClaimCache implements NotificationIdempotencyClaimCache {
  private readonly entries = new Map<string, string>();
  readonly claimedKeys: string[] = [];

  async claim(key: string, _ttlSeconds: number): Promise<boolean> {
    this.claimedKeys.push(key);
    if (this.entries.has(key)) {
      return false;
    }
    this.entries.set(key, "");
    return true;
  }

  async store(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.entries.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }
}

/**
 * Installs a recording stub over `logger.logDomainError` so domain logs stay
 * silent in test output AND become countable. Callers MUST `stop()`
 * (use try/finally).
 */
function recordDomainLogs(): { records: DomainLogRecord[]; stop: () => void } {
  const records: DomainLogRecord[] = [];
  const spy = spyOn(logger, "logDomainError").mockImplementation((_message: string, ctx?: DomainErrorContext) => {
    records.push({
      code: ctx?.code ?? "<missing>",
      entity: ctx?.entity ?? "<missing>",
      entityId: ctx?.entityId,
      locale: ctx?.locale,
    });
  });
  return { records, stop: () => spy.mockRestore() };
}

/** First row of a receipt — throws when the receipt is unexpectedly empty. */
function firstReceiptRow(receipt: NotificationDeliveryReceipt): NotificationReturnType {
  const row = receipt.notifications.at(0);
  if (!row) {
    throw new Error("expected the receipt to carry exactly one notification row");
  }
  return row;
}

/** Row of the receipt at `index` — throws when the receipt list is shorter. */
function receiptRowAt(receipts: readonly NotificationDeliveryReceipt[], index: number): NotificationReturnType {
  const receipt = receipts.at(index);
  if (!receipt) {
    throw new Error(`expected a receipt at index ${index}`);
  }
  return firstReceiptRow(receipt);
}

/** One report fixture: the parent, the student (optionally linked), the teacher, and their session. */
interface ReportFixture {
  readonly sessionRow: SessionSelectType;
  readonly studentUserId: number;
  readonly teacherUserId: number;
  readonly parentUserId: number;
  readonly studentName: string;
  readonly teacherName: string;
  readonly parentName: string;
}

interface ReportFixtureInput {
  readonly studentLocale?: AppLocale;
  readonly parentLocale?: AppLocale;
  /** When true, the student row carries the stored `parent_id` link (INV-P1 linked arm). */
  readonly linkedParent?: boolean;
  readonly studentName?: string;
  readonly teacherName?: string;
  readonly parentName?: string;
}

/**
 * Provisions the parent, the student (linked only when asked), the teacher,
 * and a session between them inside the caller's tx. Omitting a locale
 * leaves the `users.locale` column NULL (the default-locale-fallback fixture).
 */
async function provisionReportFixture(tx: DBTransaction, input: ReportFixtureInput = {}): Promise<ReportFixture> {
  const parentName = input.parentName ?? `svc-rpt-pa-${randomUUID().slice(0, 8)}`;
  const studentName = input.studentName ?? `svc-rpt-st-${randomUUID().slice(0, 8)}`;
  const teacherName = input.teacherName ?? `svc-rpt-te-${randomUUID().slice(0, 8)}`;

  const parentUser = await createTestUser(tx, {
    role: "parent",
    fullName: parentName,
    ...(input.parentLocale === undefined ? {} : { locale: input.parentLocale }),
  });
  await createTestParent(tx, parentUser.id);

  const studentUser = await createTestUser(tx, {
    fullName: studentName,
    ...(input.studentLocale === undefined ? {} : { locale: input.studentLocale }),
  });
  await createTestStudent(tx, studentUser.id, input.linkedParent === true ? { parentId: parentUser.id } : {});

  const teacherUser = await createTestUser(tx, { role: "teacher", fullName: teacherName });
  await createTestTeacherRow(tx, teacherUser.id);

  const sessionRow = await createTestSession(tx, teacherUser.id, studentUser.id);
  return {
    sessionRow,
    studentUserId: studentUser.id,
    teacherUserId: teacherUser.id,
    parentUserId: parentUser.id,
    studentName,
    teacherName,
    parentName,
  };
}

/** Session id guaranteed absent inside the caller's transactional view. */
async function absentSessionId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: count() }).from(session);
  return (row?.maxId ?? 0) + 1_000_000;
}

/** Scoped notification row-count oracle (tx or global db), never a whole-table count. */
async function countNotificationsFor(executor: DBTransaction | typeof db, userIds: readonly number[]): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(notifications)
    .where(inArray(notifications.userId, [...userIds]));
  return row?.value ?? 0;
}

/** The per-recipient raw idempotency key every emission of one session shares. */
function reportReadyKey(sessionId: number): string {
  return `session:${sessionId}:report`;
}

// ─── Tier 1: caller-tx emissions — recipients, types, claim keys, silence ───

describe("Tier 1 — caller-tx emissions: derived recipients + per-recipient receipts", () => {
  test("linked session ⇒ exactly 2 receipts (student + parent) with the engine-pinned emission contract", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, {
        studentLocale: "en",
        parentLocale: "ar",
        linkedParent: true,
      });
      const transportSpy = new SpiedFanoutTransport();
      const cache = new MapBackedClaimCache();
      const logs = recordDomainLogs();
      try {
        const receipts = await SessionReportNotificationService.notifySessionReportReady(
          fixture.sessionRow.id,
          "en",
          tx,
          { transport: transportSpy, cache }
        );

        expect(receipts).toHaveLength(2);

        const studentRow = receiptRowAt(receipts, 0);
        expect(studentRow.userId).toBe(fixture.studentUserId);
        expect(studentRow.type).toBe(NotificationType.SessionCompletion);
        expect(studentRow.relatedEntityType).toBe("session");
        expect(studentRow.relatedEntityId).toBe(fixture.sessionRow.id);
        expect(studentRow.isRead).toBe(false);
        expect(studentRow.title).toBe(NOTIFS_EN.eventSessionReportReadyTitle);
        expect(studentRow.body).toBe(NOTIFS_EN.eventSessionReportReadyBody(fixture.teacherName));
        const studentReceipt = receipts.at(0);
        expect(studentReceipt?.recipientUserIds).toEqual([fixture.studentUserId]);

        const parentRow = receiptRowAt(receipts, 1);
        expect(parentRow.userId).toBe(fixture.parentUserId);
        expect(parentRow.type).toBe(NotificationType.SessionCompletion);
        expect(parentRow.relatedEntityType).toBe("session");
        expect(parentRow.relatedEntityId).toBe(fixture.sessionRow.id);
        expect(parentRow.isRead).toBe(false);
        expect(parentRow.title).toBe(NOTIFS_AR.eventSessionReportReadyTitle);
        expect(parentRow.body).toBe(
          NOTIFS_AR.eventSessionReportReadyParentBody(fixture.studentName, fixture.teacherName)
        );
        const parentReceipt = receipts.at(1);
        expect(parentReceipt?.recipientUserIds).toEqual([fixture.parentUserId]);

        // Both rows ride the caller's transaction; the module NEVER publishes.
        expect(await countNotificationsFor(tx, [fixture.studentUserId, fixture.parentUserId])).toBe(2);
        expect(transportSpy.publishCount).toBe(0);

        // Happy-path silence (the seam logs NOTHING) + ONE deterministic claim
        // attempt per recipient under the SAME raw key.
        expect(logs.records).toEqual([]);
        expect(cache.claimedKeys).toEqual([
          buildEmitClaimKey(
            [fixture.studentUserId],
            NotificationType.SessionCompletion,
            reportReadyKey(fixture.sessionRow.id)
          ),
          buildEmitClaimKey(
            [fixture.parentUserId],
            NotificationType.SessionCompletion,
            reportReadyKey(fixture.sessionRow.id)
          ),
        ]);
      } finally {
        logs.stop();
      }
    });
  });

  test("unlinked session ⇒ exactly 1 receipt (student only); the parent inbox stays untouched", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, { studentLocale: "en", parentLocale: "ar" });
      const transportSpy = new SpiedFanoutTransport();
      const cache = new MapBackedClaimCache();
      const logs = recordDomainLogs();
      try {
        const receipts = await SessionReportNotificationService.notifySessionReportReady(
          fixture.sessionRow.id,
          "en",
          tx,
          { transport: transportSpy, cache }
        );

        expect(receipts).toHaveLength(1);
        const studentRow = receiptRowAt(receipts, 0);
        expect(studentRow.userId).toBe(fixture.studentUserId);
        expect(studentRow.type).toBe(NotificationType.SessionCompletion);
        expect(studentRow.relatedEntityId).toBe(fixture.sessionRow.id);

        expect(await countNotificationsFor(tx, [fixture.studentUserId])).toBe(1);
        expect(await countNotificationsFor(tx, [fixture.parentUserId])).toBe(0);
        expect(transportSpy.publishCount).toBe(0);
        expect(logs.records).toEqual([]);
        expect(cache.claimedKeys).toHaveLength(1);
      } finally {
        logs.stop();
      }
    });
  });

  test("missing session ⇒ NotFoundError SESSION_NOT_FOUND with ZERO domain logs and zero rows", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, { studentLocale: "en", parentLocale: "ar" });
      const missingId = await absentSessionId(tx);
      const transportSpy = new SpiedFanoutTransport();
      const logs = recordDomainLogs();
      try {
        const error = await expectRepoError(() =>
          SessionReportNotificationService.notifySessionReportReady(missingId, "en", tx, {
            transport: transportSpy,
            cache: new MapBackedClaimCache(),
          })
        );
        if (!(error instanceof NotFoundError)) {
          throw new Error(`expected NotFoundError (got ${error.name}: ${error.message})`);
        }
        expect(error.code).toBe("SESSION_NOT_FOUND");
        expect(error.message).toContain(ERRORS_EN.sessionNotFound);
        // The seam logs NOTHING — even on its own fail-closed rejection.
        expect(logs.records).toEqual([]);
        expect(await countNotificationsFor(tx, [fixture.studentUserId, fixture.parentUserId])).toBe(0);
        expect(transportSpy.publishCount).toBe(0);
      } finally {
        logs.stop();
      }
    });
  });

  test("hostile session id (0) ⇒ pre-DB VALIDATION rejection with zero rows/publishes", async () => {
    await runInRollback(async tx => {
      const transportSpy = new SpiedFanoutTransport();
      const logs = recordDomainLogs();
      try {
        const error = await expectRepoError(() =>
          SessionReportNotificationService.notifySessionReportReady(0, "en", tx, {
            transport: transportSpy,
            cache: new MapBackedClaimCache(),
          })
        );
        if (!(error instanceof ValidationError)) {
          throw new Error(`expected ValidationError (got ${error.name}: ${error.message})`);
        }
        expect(error.code).toBe("VALIDATION");
        expect(error.message).toContain(ERRORS_EN.validation);
        expect(logs.records).toEqual([]);
        expect(transportSpy.publishCount).toBe(0);
      } finally {
        logs.stop();
      }
    });
  });
});

// ─── Tier 2: locale composition boundaries ──────────────────────────────────

describe("Tier 2 — per-recipient locale composition boundaries", () => {
  test("requester locale never leaks: student copy stays en and parent copy stays ar under an ar requester", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, {
        studentLocale: "en",
        parentLocale: "ar",
        linkedParent: true,
      });
      const receipts = await SessionReportNotificationService.notifySessionReportReady(
        fixture.sessionRow.id,
        "ar",
        tx,
        { transport: new SpiedFanoutTransport(), cache: new MapBackedClaimCache() }
      );

      const studentRow = receiptRowAt(receipts, 0);
      expect(studentRow.title).toBe(NOTIFS_EN.eventSessionReportReadyTitle);
      expect(studentRow.body).toBe(NOTIFS_EN.eventSessionReportReadyBody(fixture.teacherName));

      const parentRow = receiptRowAt(receipts, 1);
      expect(parentRow.title).toBe(NOTIFS_AR.eventSessionReportReadyTitle);
      expect(parentRow.body).toBe(
        NOTIFS_AR.eventSessionReportReadyParentBody(fixture.studentName, fixture.teacherName)
      );
    });
  });

  test("null persisted locales fall back to the platform default for BOTH recipients", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, { linkedParent: true });
      const receipts = await SessionReportNotificationService.notifySessionReportReady(
        fixture.sessionRow.id,
        "en",
        tx,
        { transport: new SpiedFanoutTransport(), cache: new MapBackedClaimCache() }
      );

      const studentRow = receiptRowAt(receipts, 0);
      expect(studentRow.title).toBe(NOTIFS_AR.eventSessionReportReadyTitle);
      expect(studentRow.body).toBe(NOTIFS_AR.eventSessionReportReadyBody(fixture.teacherName));

      const parentRow = receiptRowAt(receipts, 1);
      expect(parentRow.title).toBe(NOTIFS_AR.eventSessionReportReadyTitle);
      expect(parentRow.body).toBe(
        NOTIFS_AR.eventSessionReportReadyParentBody(fixture.studentName, fixture.teacherName)
      );
    });
  });

  test("hostile session-id matrix (0 / -1 / 1.5 / NaN / 2**53 / MIN_SAFE) rejects pre-DB with VALIDATION", async () => {
    await runInRollback(async tx => {
      const logs = recordDomainLogs();
      try {
        const hostileIds = [0, -1, 1.5, Number.NaN, 2 ** 53, Number.MIN_SAFE_INTEGER] as const;
        const errors = await Promise.all(
          hostileIds.map(hostileId =>
            expectRepoError(() =>
              SessionReportNotificationService.notifySessionReportReady(hostileId, "en", tx, {
                transport: new SpiedFanoutTransport(),
                cache: new MapBackedClaimCache(),
              })
            )
          )
        );
        for (const [index, error] of errors.entries()) {
          if (!(error instanceof ValidationError)) {
            throw new Error(`expected ValidationError for id ${String(hostileIds[index])} (got ${error.name})`);
          }
          expect(error.code).toBe("VALIDATION");
          expect(error.message).toContain(ERRORS_EN.validation);
        }
        expect(logs.records).toEqual([]);
      } finally {
        logs.stop();
      }
    });
  });

  test("int4-ceiling session id is a valid shape but missing ⇒ SESSION_NOT_FOUND with ZERO logs", async () => {
    await runInRollback(async tx => {
      const logs = recordDomainLogs();
      try {
        const error = await expectRepoError(() =>
          SessionReportNotificationService.notifySessionReportReady(INT4_MAX_SESSION_ID, "en", tx, {
            transport: new SpiedFanoutTransport(),
            cache: new MapBackedClaimCache(),
          })
        );
        if (!(error instanceof NotFoundError)) {
          throw new Error(`expected NotFoundError (got ${error.name}: ${error.message})`);
        }
        expect(error.code).toBe("SESSION_NOT_FOUND");
        expect(error.message).toContain(ERRORS_EN.sessionNotFound);
        expect(logs.records).toEqual([]);
      } finally {
        logs.stop();
      }
    });
  });

  test("hostile unicode/RTL/emoji participant names are composed VERBATIM into the copy", async () => {
    await runInRollback(async tx => {
      const hostileStudentName = `طالبة 🎓 ‎<script>alert(1)</script> s-${randomUUID().slice(0, 8)}`;
      const hostileTeacherName = `أستاذ \\o/ "quoted" t-${randomUUID().slice(0, 8)}`;
      const fixture = await provisionReportFixture(tx, {
        studentLocale: "en",
        parentLocale: "ar",
        linkedParent: true,
        studentName: hostileStudentName,
        teacherName: hostileTeacherName,
      });
      const receipts = await SessionReportNotificationService.notifySessionReportReady(
        fixture.sessionRow.id,
        "en",
        tx,
        { transport: new SpiedFanoutTransport(), cache: new MapBackedClaimCache() }
      );

      const studentRow = receiptRowAt(receipts, 0);
      expect(studentRow.body).toBe(NOTIFS_EN.eventSessionReportReadyBody(hostileTeacherName));
      expect(studentRow.body).toContain(hostileTeacherName);

      const parentRow = receiptRowAt(receipts, 1);
      expect(parentRow.body).toBe(NOTIFS_AR.eventSessionReportReadyParentBody(hostileStudentName, hostileTeacherName));
      expect(parentRow.body).toContain(hostileStudentName);
    });
  });
});

// ─── Tier 3: commit-boundary chaos (committed fixtures) ─────────────────────
// runInRollback can never prove committed-scope semantics (durable rows, the
// engine's stored claim receipts, replay across scopes), so this tier
// provisions its cast in ONE committing `beforeAll` transaction and
// hard-deletes it in FK-safe order in `afterAll` (Rule 9).

interface CommittedCast {
  readonly studentUserId: number;
  readonly parentUserId: number;
  readonly teacherUserId: number;
  /** Two sessions for the same linked pair: [0] replay probe, [1] rollback probes. */
  readonly replaySessionId: number;
  readonly rollbackSessionId: number;
}

let committedCast: CommittedCast | null = null;

/** Unwraps the committed cast, failing loudly if beforeAll did not run. */
function requireCast(cast: CommittedCast | null): CommittedCast {
  if (!cast) {
    throw new Error("expected the committed beforeAll cast to exist");
  }
  return cast;
}

beforeAll(async () => {
  committedCast = await db.transaction(async tx => {
    const fixture = await provisionReportFixture(tx, {
      studentLocale: "en",
      parentLocale: "ar",
      linkedParent: true,
    });
    const rollbackSession = await createTestSession(tx, fixture.teacherUserId, fixture.studentUserId);
    return {
      studentUserId: fixture.studentUserId,
      parentUserId: fixture.parentUserId,
      teacherUserId: fixture.teacherUserId,
      replaySessionId: fixture.sessionRow.id,
      rollbackSessionId: rollbackSession.id,
    };
  });
});

afterAll(async () => {
  const cast = committedCast;
  if (!cast) {
    return;
  }
  // FK-safe order: notifications → session → role children → users.
  await db.delete(notifications).where(inArray(notifications.userId, [cast.studentUserId, cast.parentUserId]));
  await db.delete(session).where(inArray(session.id, [cast.replaySessionId, cast.rollbackSessionId]));
  await db.delete(students).where(eq(students.id, cast.studentUserId));
  await db.delete(teacher).where(eq(teacher.id, cast.teacherUserId));
  await db.delete(parents).where(eq(parents.id, cast.parentUserId));
  await db.delete(users).where(inArray(users.id, [cast.studentUserId, cast.parentUserId]));
});

describe("Tier 3 — commit-boundary chaos: claim replay, rollback purity, engine failure", () => {
  test("duplicate invocation in separate committed scopes ⇒ engine claim replay: same rows, ZERO new rows, ZERO new publishes", async () => {
    const cast = requireCast(committedCast);
    const transportSpy = new SpiedFanoutTransport();
    const cache = new MapBackedClaimCache();
    const options: NotificationEngineCallOptions = { transport: transportSpy, cache };

    // Scope 1: emit inside its own committed transaction, then publish
    // post-commit (the caller's act) so the claim receipts become replayable.
    let firstReceipts: NotificationDeliveryReceipt[] = [];
    await db.transaction(async tx => {
      firstReceipts = await SessionReportNotificationService.notifySessionReportReady(
        cast.replaySessionId,
        "en",
        tx,
        options
      );
    });
    await NotificationEngine.publishReceipts(firstReceipts, "en", options);
    expect(firstReceipts).toHaveLength(2);
    expect(await countNotificationsFor(db, [cast.studentUserId, cast.parentUserId])).toBe(2);
    expect(transportSpy.publishCount).toBe(2);
    expect(transportSpy.calls.at(0)?.userIds).toEqual([cast.studentUserId]);
    expect(transportSpy.calls.at(1)?.userIds).toEqual([cast.parentUserId]);

    // Scope 2: a SEPARATE committed scope replaying the same key + cohort.
    const replaySpy = new SpiedFanoutTransport();
    let replayedReceipts: NotificationDeliveryReceipt[] = [];
    await db.transaction(async tx => {
      replayedReceipts = await SessionReportNotificationService.notifySessionReportReady(
        cast.replaySessionId,
        "en",
        tx,
        { transport: replaySpy, cache }
      );
    });

    expect(replayedReceipts).toHaveLength(2);
    expect(receiptRowAt(replayedReceipts, 0).id).toBe(receiptRowAt(firstReceipts, 0).id);
    expect(receiptRowAt(replayedReceipts, 1).id).toBe(receiptRowAt(firstReceipts, 1).id);
    expect(replayedReceipts.at(0)?.recipientUserIds).toEqual([cast.studentUserId]);
    expect(replayedReceipts.at(1)?.recipientUserIds).toEqual([cast.parentUserId]);

    // The replay produced nothing new: no row per recipient, no publish.
    expect(await countNotificationsFor(db, [cast.studentUserId, cast.parentUserId])).toBe(2);
    expect(replaySpy.publishCount).toBe(0);
    // Two claim attempts per recipient across the two scopes, two distinct digests.
    expect(cache.claimedKeys).toHaveLength(4);
    expect(new Set(cache.claimedKeys).size).toBe(2);
  });

  test("forced mid-tx failure after BOTH emissions ⇒ total rollback, zero publishes (ghost pushes impossible)", async () => {
    const cast = requireCast(committedCast);
    const transportSpy = new SpiedFanoutTransport();
    const before = await countNotificationsFor(db, [cast.studentUserId, cast.parentUserId]);

    const error = await expectRepoError(() =>
      db.transaction(async tx => {
        const receipts = await SessionReportNotificationService.notifySessionReportReady(
          cast.rollbackSessionId,
          "en",
          tx,
          { transport: transportSpy, cache: new MapBackedClaimCache() }
        );
        expect(receipts).toHaveLength(2);
        expect(await countNotificationsFor(tx, [cast.studentUserId, cast.parentUserId])).toBe(before + 2);
        expect(transportSpy.publishCount).toBe(0);
        throw new Error("forced mid-tx failure after both emissions rode the caller transaction");
      })
    );

    expect(error.message).toContain("forced mid-tx failure");
    expect(await countNotificationsFor(db, [cast.studentUserId, cast.parentUserId])).toBe(before);
    expect(transportSpy.publishCount).toBe(0);
  });

  test("forced engine failure on the parent emission ⇒ typed error propagates and the unit rolls back BOTH emissions", async () => {
    const cast = requireCast(committedCast);
    const transportSpy = new SpiedFanoutTransport();
    const before = await countNotificationsFor(db, [cast.studentUserId, cast.parentUserId]);

    const originalEmit = NotificationEngine.emitForUser;
    let emitCalls = 0;
    const engineSpy = spyOn(NotificationEngine, "emitForUser").mockImplementation(
      async (
        input: NotificationEmitInput,
        emitLocale: string,
        emitTx: DBTransaction | undefined,
        emitOptions: NotificationEngineCallOptions | undefined
      ) => {
        emitCalls += 1;
        if (emitCalls === 1) {
          return originalEmit(input, emitLocale, emitTx, emitOptions);
        }
        throw new ConflictError("SESSION_REPORT_ALREADY_EXISTS", "forced engine failure probe");
      }
    );
    try {
      const error = await expectRepoError(() =>
        db.transaction(async tx =>
          SessionReportNotificationService.notifySessionReportReady(cast.rollbackSessionId, "en", tx, {
            transport: transportSpy,
            cache: new MapBackedClaimCache(),
          })
        )
      );
      if (!(error instanceof ConflictError)) {
        throw new Error(`expected ConflictError (got ${error.name}: ${error.message})`);
      }
      expect(error.code).toBe("SESSION_REPORT_ALREADY_EXISTS");
      expect(emitCalls).toBe(2);
      // The student's emission rode the same caller tx — it is rolled back
      // with the failed parent emission (upstream transaction safety).
      expect(await countNotificationsFor(db, [cast.studentUserId, cast.parentUserId])).toBe(before);
      expect(transportSpy.publishCount).toBe(0);
    } finally {
      engineSpy.mockRestore();
    }
  });

  test("engine contract breach (bare row instead of a caller-tx receipt) ⇒ typed internal error", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, { studentLocale: "en", parentLocale: "ar" });
      const bareRow: NotificationReturnType = {
        id: 1,
        userId: fixture.studentUserId,
        type: NotificationType.SessionCompletion,
        title: "engine-breach probe",
        body: null,
        isRead: false,
        relatedEntityType: null,
        relatedEntityId: null,
        createdAt: new Date(0),
      };
      const engineSpy = spyOn(NotificationEngine, "emitForUser").mockResolvedValue(bareRow);
      try {
        const error = await expectRepoError(() =>
          SessionReportNotificationService.notifySessionReportReady(fixture.sessionRow.id, "en", tx, {
            transport: new SpiedFanoutTransport(),
            cache: new MapBackedClaimCache(),
          })
        );
        if (!(error instanceof DomainError)) {
          throw new Error(`expected DomainError (got ${error.name}: ${error.message})`);
        }
        expect(error.code).toBe("INTERNAL_SERVER_ERROR");
        expect(engineSpy).toHaveBeenCalledTimes(1);
      } finally {
        engineSpy.mockRestore();
      }
    });
  });
});

// ─── Tier 4: privacy + derivation security ──────────────────────────────────

describe("Tier 4 — copy privacy + derived-recipient security", () => {
  test("stored copy carries NO grade/note/session-id content — names only (regex absence pin)", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, {
        studentLocale: "en",
        parentLocale: "ar",
        linkedParent: true,
        studentName: "amina student",
        teacherName: "yusuf teacher",
        parentName: "karim parent",
      });
      const receipts = await SessionReportNotificationService.notifySessionReportReady(
        fixture.sessionRow.id,
        "en",
        tx,
        { transport: new SpiedFanoutTransport(), cache: new MapBackedClaimCache() }
      );

      for (const receipt of receipts) {
        const row = firstReceiptRow(receipt);
        const copy = `${row.title} ${row.body ?? ""}`;
        expect(copy).not.toMatch(/\d/);
        expect(copy).not.toMatch(/grade|rating|note|score/i);
        expect(copy).not.toContain(String(fixture.sessionRow.id));
      }
      expect(receiptRowAt(receipts, 0).body).toContain(fixture.teacherName);
      expect(receiptRowAt(receipts, 1).body).toContain(fixture.studentName);
      expect(receiptRowAt(receipts, 1).body).toContain(fixture.teacherName);
    });
  });

  test("derived-recipient invariance: receipts target ONLY each session's own linked pair", async () => {
    await runInRollback(async tx => {
      const first = await provisionReportFixture(tx, {
        studentLocale: "en",
        parentLocale: "ar",
        linkedParent: true,
      });
      const second = await provisionReportFixture(tx, {
        studentLocale: "en",
        parentLocale: "ar",
        linkedParent: true,
      });

      const firstReceipts = await SessionReportNotificationService.notifySessionReportReady(
        first.sessionRow.id,
        "en",
        tx,
        { transport: new SpiedFanoutTransport(), cache: new MapBackedClaimCache() }
      );
      const secondReceipts = await SessionReportNotificationService.notifySessionReportReady(
        second.sessionRow.id,
        "en",
        tx,
        { transport: new SpiedFanoutTransport(), cache: new MapBackedClaimCache() }
      );

      expect(receiptRowAt(firstReceipts, 0).userId).toBe(first.studentUserId);
      expect(receiptRowAt(firstReceipts, 1).userId).toBe(first.parentUserId);
      expect(receiptRowAt(secondReceipts, 0).userId).toBe(second.studentUserId);
      expect(receiptRowAt(secondReceipts, 1).userId).toBe(second.parentUserId);
      expect(first.studentUserId).not.toBe(second.studentUserId);
      expect(first.parentUserId).not.toBe(second.parentUserId);

      expect(await countNotificationsFor(tx, [first.studentUserId, first.parentUserId])).toBe(2);
      expect(await countNotificationsFor(tx, [second.studentUserId, second.parentUserId])).toBe(2);
    });
  });

  test("half-joined parent leg (id without name) fails closed to unlinked — no parent emission, no fabricated name", async () => {
    await runInRollback(async tx => {
      const fixture = await provisionReportFixture(tx, {
        studentLocale: "en",
        parentLocale: "ar",
        linkedParent: true,
      });
      const corruptedRow: SessionReportWaveContextRow = {
        sessionId: fixture.sessionRow.id,
        studentUserId: fixture.studentUserId,
        studentFullName: fixture.studentName,
        studentLocale: "en",
        teacherUserId: fixture.teacherUserId,
        teacherFullName: fixture.teacherName,
        teacherLocale: null,
        parentUserId: fixture.parentUserId,
        parentFullName: null,
        parentLocale: "ar",
      };
      const repoSpy = spyOn(SessionRepository, "findReportWaveContextById").mockResolvedValue(corruptedRow);
      const cache = new MapBackedClaimCache();
      try {
        const receipts = await SessionReportNotificationService.notifySessionReportReady(
          fixture.sessionRow.id,
          "en",
          tx,
          { transport: new SpiedFanoutTransport(), cache }
        );
        expect(receipts).toHaveLength(1);
        expect(receiptRowAt(receipts, 0).userId).toBe(fixture.studentUserId);
        expect(await countNotificationsFor(tx, [fixture.parentUserId])).toBe(0);
        expect(cache.claimedKeys).toHaveLength(1);
      } finally {
        repoSpy.mockRestore();
      }
    });
  });

  test("source pin — no logging, no publish call, no governance import, single wave-context read, enum VALUE import", async () => {
    const source = await Bun.file(new URL("./session-report-notification.service.ts", import.meta.url)).text();
    // PII minimization: the module logs nothing at all.
    expect(source).not.toContain("@/backend/lib/logger");
    expect(source).not.toContain("console.");
    expect(source).not.toContain("logDomainError");
    // Receipt-producer contract: the module NEVER publishes.
    expect(source).not.toContain("await NotificationEngine.publishReceipts");
    // Governance-free emit primitive (header-documented rationale).
    expect(source).not.toContain("session-lifecycle.governance");
    // Single-read discipline: exactly ONE wave-context read per call.
    expect(source.match(/findReportWaveContextById/g) ?? []).toHaveLength(1);
    // The emission type is the enum member, imported as a VALUE — never a
    // stringly-typed notification type, never a raw member literal.
    expect(source).toContain("import { NotificationType } from");
    expect(source).toContain("NotificationType.SessionCompletion");
    expect(source).not.toContain('"session_completion"');
    // The deterministic idempotency key exists at exactly one composition site.
    expect(source.match(/session:\$\{sessionId\}:report/g) ?? []).toHaveLength(1);
  });
});
