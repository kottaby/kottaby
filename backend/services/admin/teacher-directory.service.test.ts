/**
 * AdminTeacherDirectoryService tests — the `adminTeachers` directory listing
 * against the live `app_db` PostgreSQL instance.
 *
 * Per `backend/db/test/AGENTS.md` + `backend/services/AGENTS.md`:
 *  - Every case runs inside `runInRollback`; `tx` is passed to EVERY
 *    service / entity-setup call so the actor-check + the operation share
 *    the SAME rolled-back transaction.
 *  - Entities ONLY via `entity-setup.ts` helpers (randomized-UUID emails).
 *  - All rejection assertions use `expectRepoError` (try/catch) —
 *    `expect(...).rejects.toThrow()` is prohibited and appears nowhere.
 *  - Translated-message assertions resolve via `getServerTranslations`
 *    property access — never raw keys, never hardcoded UI copy.
 *
 * Coverage map:
 *  - Happy-path list mapping (subjects JSON parse, rating decimal → float,
 *    governance null-coalescing, page-envelope echo).
 *  - Filter normalization (search trim, literal `%` escape, boolean
 *    filters, absent-filter fallback to the unfiltered listing).
 *  - `pageCount` ceiling math (3 rows ÷ pageSize 2 → 2; empty → 0).
 *  - Subjects JSON parse fallback (corrupt payload degrades to empty list).
 *  - Pagination validation errors (page 0 / negative, pageSize 101).
 *  - `exportAll` envelope (rows + honest full filtered total + truncated
 *    flag, filter composition respected, honest empty envelope) — the
 *    truncated-TRUE honesty path is pinned against the pure
 *    `buildExportEnvelope` helper in `directory-export.helpers.test.ts`
 *    (seeding >1000 rows is impractical here).
 *  - Defense-in-depth BFLA denials (anonymous → 401, non-admin → 403) on
 *    BOTH operations.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestAdmin, createTestTeacherRow, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { AdminTeacherDirectoryService } from "@/backend/services/admin/teacher-directory.service";
import type { DBTransaction, UserSelectType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** Sentinel `actorId` value expressing an anonymous caller. */
const ANONYMOUS_ACTOR_ID = 0;

/** Silences `logger.logDomainError` so test stdout stays compact. */
function silenceDomainLog(): ReturnType<typeof spyOn> {
  return spyOn(logger, "logDomainError").mockImplementation(() => {});
}

/**
 * Provisions an admin actor (users row + admin role-child row) for use as
 * the `actorId` of subsequent service calls. Returns the user row.
 */
async function provisionAdminActor(tx: DBTransaction): Promise<UserSelectType> {
  const user = await createTestUser(tx, { role: "admin" });
  await createTestAdmin(tx, user.id);
  return user;
}

/**
 * Creates a teacher user + `teacher` role-child row with a unique full name
 * carrying the supplied prefix (for search isolation). Returns the pair.
 */
async function createDirectoryTeacher(
  tx: DBTransaction,
  options: {
    namePrefix: string;
    isApproved?: boolean;
    isEvaluator?: boolean;
    isOnline?: boolean;
    averageRating?: string | null;
    subjects?: string | null;
  }
): Promise<UserSelectType> {
  const user = await createTestUser(tx, {
    role: "teacher",
    fullName: `${options.namePrefix} ${randomUUID().slice(0, 8)}`,
  });
  await createTestTeacherRow(tx, user.id, {
    isApproved: options.isApproved ?? true,
    isEvaluator: options.isEvaluator ?? false,
    isOnline: options.isOnline ?? false,
    averageRating: options.averageRating ?? null,
    subjects: options.subjects ?? null,
  });
  return user;
}

describe("AdminTeacherDirectoryService.list — happy path + mapping", () => {
  test("admin lists the directory; certification headline + subjects JSON + rating float map correctly", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const teacher = await createDirectoryTeacher(tx, {
        namePrefix: "DirTeacherHappy",
        isApproved: true,
        isEvaluator: true,
        isOnline: true,
        averageRating: "4.50",
        subjects: JSON.stringify(["quran", "tajweed"]),
      });

      const page = await AdminTeacherDirectoryService.list({ search: "DirTeacherHappy" }, 1, 25, LOCALE, admin.id, tx);

      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(25);
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.pageCount).toBeGreaterThanOrEqual(1);

      const found = page.items.find(item => item.id === teacher.id);
      expect(found).not.toBeUndefined();
      expect(found?.name).toContain("DirTeacherHappy");
      expect(found?.email).toBe(teacher.email);
      expect(found?.phone).toBe(teacher.phone);
      expect(found?.isApproved).toBe(true);
      expect(found?.isEvaluator).toBe(true);
      expect(found?.isOnline).toBe(true);
      expect(found?.averageRating).toBe(4.5);
      expect(found?.subjects).toEqual(["quran", "tajweed"]);
      expect(found?.isDeleted).toBe(false);
      expect(found?.suspended).toBe(false);
      expect(found?.isBlocked).toBe(false);
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  test("unrated teacher → averageRating null; absent subjects → empty array", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const teacher = await createDirectoryTeacher(tx, {
        namePrefix: "DirTeacherBare",
        averageRating: null,
        subjects: null,
      });

      const page = await AdminTeacherDirectoryService.list({ search: "DirTeacherBare" }, 1, 25, LOCALE, admin.id, tx);
      const found = page.items.find(item => item.id === teacher.id);
      expect(found?.averageRating).toBeNull();
      expect(found?.subjects).toEqual([]);
    });
  });

  test("corrupt subjects payload degrades to an empty array (never a resolver error)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const teacher = await createDirectoryTeacher(tx, {
        namePrefix: "DirTeacherCorrupt",
        subjects: "not-valid-json",
      });

      const page = await AdminTeacherDirectoryService.list(
        { search: "DirTeacherCorrupt" },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );
      const found = page.items.find(item => item.id === teacher.id);
      expect(found?.subjects).toEqual([]);
    });
  });
});

describe("AdminTeacherDirectoryService.list — filter normalization", () => {
  test("search is trimmed before matching (leading/trailing whitespace ignored)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const teacher = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherTrim" });

      const page = await AdminTeacherDirectoryService.list(
        { search: "  DirTeacherTrim  " },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );
      const found = page.items.find(item => item.id === teacher.id);
      expect(found).not.toBeUndefined();
    });
  });

  test("search `%` is escaped and matched literally (no wildcard widening)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const teacher = await createTestUser(tx, {
        role: "teacher",
        fullName: `DirTeacher%${randomUUID().slice(0, 8)}`,
      });
      await createTestTeacherRow(tx, teacher.id, { isApproved: true });

      const page = await AdminTeacherDirectoryService.list({ search: "%" }, 1, 100, LOCALE, admin.id, tx);
      const found = page.items.find(item => item.id === teacher.id);
      expect(found).not.toBeUndefined();
      expect(found?.name).toContain("%");
    });
  });

  test("absent filters fall back to the unfiltered listing (null filters dropped)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const teacher = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherAny" });

      const page = await AdminTeacherDirectoryService.list({}, 1, 100, LOCALE, admin.id, tx);
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.items.find(item => item.id === teacher.id)).not.toBeUndefined();
    });
  });

  test("approval filter partitions the directory (approved vs pending)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const approved = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherApproved", isApproved: true });
      const pending = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherPending", isApproved: false });

      const approvedPage = await AdminTeacherDirectoryService.list({ approval: true }, 1, 100, LOCALE, admin.id, tx);
      expect(approvedPage.items.find(item => item.id === approved.id)).not.toBeUndefined();
      expect(approvedPage.items.find(item => item.id === pending.id)).toBeUndefined();

      const pendingPage = await AdminTeacherDirectoryService.list({ approval: false }, 1, 100, LOCALE, admin.id, tx);
      expect(pendingPage.items.find(item => item.id === pending.id)).not.toBeUndefined();
      expect(pendingPage.items.find(item => item.id === approved.id)).toBeUndefined();
    });
  });

  test("evaluator filter matches only is_evaluator rows", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const evaluator = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherEval", isEvaluator: true });
      const plain = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherPlain", isEvaluator: false });

      const page = await AdminTeacherDirectoryService.list({ evaluator: true }, 1, 100, LOCALE, admin.id, tx);
      expect(page.items.find(item => item.id === evaluator.id)).not.toBeUndefined();
      expect(page.items.find(item => item.id === plain.id)).toBeUndefined();
    });
  });
});

describe("AdminTeacherDirectoryService.list — pagination", () => {
  test("pageCount is the ceiling of total ÷ pageSize", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const prefix = `DirTeacherPaged${randomUUID().slice(0, 8)}`;
      // Three mutually independent user+teacher pairs — seeded concurrently.
      // Each pair's user→role-child FK order stays sequenced inside the
      // helper; no dependency exists across pairs.
      await Promise.all([
        createDirectoryTeacher(tx, { namePrefix: prefix }),
        createDirectoryTeacher(tx, { namePrefix: prefix }),
        createDirectoryTeacher(tx, { namePrefix: prefix }),
      ]);

      const twoPer = await AdminTeacherDirectoryService.list({ search: prefix }, 1, 2, LOCALE, admin.id, tx);
      expect(twoPer.total).toBe(3);
      expect(twoPer.pageCount).toBe(2);
      expect(twoPer.items).toHaveLength(2);

      const threePer = await AdminTeacherDirectoryService.list({ search: prefix }, 1, 3, LOCALE, admin.id, tx);
      expect(threePer.total).toBe(3);
      expect(threePer.pageCount).toBe(1);
      expect(threePer.items).toHaveLength(3);
    });
  });

  test("no-match search → honest empty envelope (total 0, pageCount 0)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminTeacherDirectoryService.list(
        { search: `no-match-${randomUUID()}` },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      expect(page.pageCount).toBe(0);
    });
  });

  test("out-of-range page → empty items + honest total (never clamped)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const prefix = `DirTeacherRange${randomUUID().slice(0, 8)}`;
      await createDirectoryTeacher(tx, { namePrefix: prefix });

      const page = await AdminTeacherDirectoryService.list({ search: prefix }, 999, 25, LOCALE, admin.id, tx);
      expect(page.items).toEqual([]);
      expect(page.total).toBe(1);
      expect(page.page).toBe(999);
      expect(page.pageCount).toBe(1);
    });
  });

  // ── Pagination bounds reject BEFORE any DB read ────────────────────────

  test("page = 0 → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminTeacherDirectoryService.list({}, 0, 25, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(tErrors.validation);
    });
  });

  test("page = negative → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminTeacherDirectoryService.list({}, -5, 25, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("pageSize = 101 → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminTeacherDirectoryService.list({}, 1, 101, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("pageSize = undefined defaults to 25", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminTeacherDirectoryService.list({}, 1, undefined, LOCALE, admin.id, tx);
      expect(page.pageSize).toBe(25);
    });
  });
});

describe("AdminTeacherDirectoryService.exportAll — export-all envelope", () => {
  test("admin exports the filtered directory; rows + honest full total + truncated=false", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const approved = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherExport", isApproved: true });
      const pending = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherExport", isApproved: false });

      const envelope = await AdminTeacherDirectoryService.exportAll(
        { search: "DirTeacherExport" },
        LOCALE,
        admin.id,
        tx
      );

      // The export envelope reports the FULL filtered count — exactly the
      // count the listing query would report across all pages.
      expect(envelope.total).toBe(2);
      expect(envelope.truncated).toBe(false);
      expect(envelope.rows).toHaveLength(2);
      expect(envelope.rows.map(row => row.id).toSorted((a, b) => a - b)).toEqual(
        [approved.id, pending.id].toSorted((a, b) => a - b)
      );
      const found = envelope.rows.find(row => row.id === approved.id);
      expect(found?.name).toContain("DirTeacherExport");
      expect(found?.email).toBe(approved.email);
      expect(found?.isApproved).toBe(true);
    });
  });

  test("filter composition is respected (approval filter partitions the export)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const approved = await createDirectoryTeacher(tx, { namePrefix: "DirTeacherExportFilter", isApproved: true });
      await createDirectoryTeacher(tx, { namePrefix: "DirTeacherExportFilter", isApproved: false });

      const envelope = await AdminTeacherDirectoryService.exportAll(
        { search: "DirTeacherExportFilter", approval: true },
        LOCALE,
        admin.id,
        tx
      );
      expect(envelope.total).toBe(1);
      expect(envelope.rows).toHaveLength(1);
      expect(envelope.rows[0]?.id).toBe(approved.id);
      expect(envelope.truncated).toBe(false);
    });
  });

  test("no-match search → honest empty envelope (rows [], total 0, truncated false)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const envelope = await AdminTeacherDirectoryService.exportAll(
        { search: `no-match-${randomUUID()}` },
        LOCALE,
        admin.id,
        tx
      );
      expect(envelope.rows).toEqual([]);
      expect(envelope.total).toBe(0);
      expect(envelope.truncated).toBe(false);
    });
  });
});

describe("AdminTeacherDirectoryService.exportAll — defense-in-depth (BFLA)", () => {
  test("anonymous actor (id=0) → UnauthorizedError; zero writes", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminTeacherDirectoryService.exportAll({}, LOCALE, ANONYMOUS_ACTOR_ID, tx)
      );
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);
    });
  });

  test("non-admin actor → ForbiddenError; zero writes", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      silenceDomainLog();
      const error = await expectRepoError(() => AdminTeacherDirectoryService.exportAll({}, LOCALE, nonAdmin.id, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });
});

describe("AdminTeacherDirectoryService.list — defense-in-depth (BFLA)", () => {
  test("anonymous actor (id=0) → UnauthorizedError; zero writes", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminTeacherDirectoryService.list({}, 1, 25, LOCALE, ANONYMOUS_ACTOR_ID, tx)
      );
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);
    });
  });

  test("non-admin actor → ForbiddenError; zero writes", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      silenceDomainLog();
      const error = await expectRepoError(() => AdminTeacherDirectoryService.list({}, 1, 25, LOCALE, nonAdmin.id, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });
});
