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

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestTeacherRow, createTestUser } from "@/backend/db/test/entity-setup";
import { runInRollback } from "@/backend/db/test/test-utils";
import {
  expectExportEnvelope,
  expectExportRowIds,
  expectListedItem,
  expectPageEnvelopeEcho,
  DIRECTORY_TEST_LOCALE as LOCALE,
  provisionAdminActor,
  registerBflaDenials,
  registerPaginationCountingContract,
  registerPaginationValidationContract,
} from "@/backend/services/admin/shared/directory-test.helpers";
import { AdminTeacherDirectoryService } from "@/backend/services/admin/teacher-directory.service";
import type { DBTransaction, UserSelectType } from "@/backend/types";

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

      expectPageEnvelopeEcho(page, { page: 1, pageSize: 25 });

      const found = expectListedItem(page, teacher.id);
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
      const found = expectListedItem(page, teacher.id);
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
      const found = expectListedItem(page, teacher.id);
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
      expectListedItem(page, teacher.id);
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
      const found = expectListedItem(page, teacher.id);
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
  registerPaginationCountingContract({
    seedThree: async (tx, prefix) => {
      await Promise.all([
        createDirectoryTeacher(tx, { namePrefix: prefix }),
        createDirectoryTeacher(tx, { namePrefix: prefix }),
        createDirectoryTeacher(tx, { namePrefix: prefix }),
      ]);
    },
    list: (tx, actorId, filters, page, pageSize) =>
      AdminTeacherDirectoryService.list(filters, page, pageSize, LOCALE, actorId, tx),
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

  registerPaginationValidationContract({
    list: (tx, actorId, page, pageSize) => AdminTeacherDirectoryService.list({}, page, pageSize, LOCALE, actorId, tx),
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
      expectExportEnvelope(envelope, { total: 2, rows: 2 });
      expectExportRowIds(envelope, [approved.id, pending.id]);
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
      expectExportEnvelope(envelope, { total: 1, rows: 1 });
      expect(envelope.rows[0]?.id).toBe(approved.id);
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
      expectExportEnvelope(envelope, { total: 0, rows: 0 });
    });
  });
});

describe("AdminTeacherDirectoryService.exportAll — defense-in-depth (BFLA)", () => {
  registerBflaDenials({
    call: (tx, actorId) => AdminTeacherDirectoryService.exportAll({}, LOCALE, actorId, tx),
  });
});

describe("AdminTeacherDirectoryService.list — defense-in-depth (BFLA)", () => {
  registerBflaDenials({
    call: (tx, actorId) => AdminTeacherDirectoryService.list({}, 1, 25, LOCALE, actorId, tx),
  });
});
