/**
 * AdminStudentDirectoryService tests — the `adminStudents` directory listing
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
 *  - Happy-path list mapping (balances, trial marker, languages, parent
 *    identity via the parent join, `hasParent` derivation).
 *  - Filter normalization (search trim, literal `%` escape, `hasParent`
 *    partition, case-insensitive exact `language` match over primary OR
 *    secondary language, absent-filter fallback).
 *  - `pageCount` ceiling math (3 rows ÷ pageSize 2 → 2; empty → 0).
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
import { createTestParent, createTestStudent, createTestUser } from "@/backend/db/test/entity-setup";
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
import { AdminStudentDirectoryService } from "@/backend/services/admin/student-directory.service";
import type { DBTransaction, UserSelectType } from "@/backend/types";

/**
 * Creates a student user + `students` role-child row with a unique full
 * name carrying the supplied prefix (for search isolation).
 */
async function createDirectoryStudent(
  tx: DBTransaction,
  options: {
    namePrefix: string;
    parentId?: number | null;
    primaryLanguage?: string | null;
    anotherLanguage?: string | null;
    balanceHifz?: number;
    balanceReviews?: number;
    balanceTajweed?: number;
  }
): Promise<UserSelectType> {
  const user = await createTestUser(tx, {
    role: "student",
    fullName: `${options.namePrefix} ${randomUUID().slice(0, 8)}`,
  });
  await createTestStudent(tx, user.id, {
    parentId: options.parentId ?? null,
    primaryLanguage: options.primaryLanguage ?? null,
    anotherLanguage: options.anotherLanguage ?? null,
    balanceHifz: options.balanceHifz ?? 0,
    balanceReviews: options.balanceReviews ?? 0,
    balanceTajweed: options.balanceTajweed ?? 0,
  });
  return user;
}

describe("AdminStudentDirectoryService.list — happy path + mapping", () => {
  test("admin lists the directory; balances, languages, and linked-parent identity map correctly", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const parentUser = await createTestUser(tx, { role: "parent" });
      await createTestParent(tx, parentUser.id);
      const student = await createDirectoryStudent(tx, {
        namePrefix: "DirStudentHappy",
        parentId: parentUser.id,
        primaryLanguage: "Arabic",
        anotherLanguage: "English",
        balanceHifz: 3,
        balanceReviews: 2,
        balanceTajweed: 1,
      });

      const page = await AdminStudentDirectoryService.list({ search: "DirStudentHappy" }, 1, 25, LOCALE, admin.id, tx);

      expectPageEnvelopeEcho(page, { page: 1, pageSize: 25 });

      const found = page.items.find(item => item.id === student.id);
      expect(found).not.toBeUndefined();
      expect(found?.name).toContain("DirStudentHappy");
      expect(found?.email).toBe(student.email);
      expect(found?.phone).toBe(student.phone);
      expect(found?.balanceHifz).toBe(3);
      expect(found?.balanceReviews).toBe(2);
      expect(found?.balanceTajweed).toBe(1);
      expect(found?.balanceTrial).toBe(0);
      expect(found?.trialGrantedAt).toBeNull();
      expect(found?.primaryLanguage).toBe("Arabic");
      expect(found?.anotherLanguage).toBe("English");
      expect(found?.hasParent).toBe(true);
      expect(found?.parentName).toBe(parentUser.fullName);
      expect(found?.parentEmail).toBe(parentUser.email);
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  test("unlinked student → hasParent false with null parent identity", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createDirectoryStudent(tx, { namePrefix: "DirStudentOrphan" });

      const page = await AdminStudentDirectoryService.list({ search: "DirStudentOrphan" }, 1, 25, LOCALE, admin.id, tx);
      const found = page.items.find(item => item.id === student.id);
      expect(found?.hasParent).toBe(false);
      expect(found?.parentName).toBeNull();
      expect(found?.parentEmail).toBeNull();
    });
  });
});

describe("AdminStudentDirectoryService.list — filter normalization", () => {
  test("search is trimmed before matching (leading/trailing whitespace ignored)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createDirectoryStudent(tx, { namePrefix: "DirStudentTrim" });

      const page = await AdminStudentDirectoryService.list(
        { search: "  DirStudentTrim  " },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );
      expectListedItem(page, student.id);
    });
  });

  test("search `%` is escaped and matched literally (no wildcard widening)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, {
        role: "student",
        fullName: `DirStudent%${randomUUID().slice(0, 8)}`,
      });
      await createTestStudent(tx, student.id);

      const page = await AdminStudentDirectoryService.list({ search: "%" }, 1, 100, LOCALE, admin.id, tx);
      const found = expectListedItem(page, student.id);
      expect(found?.name).toContain("%");
    });
  });

  test("absent filters fall back to the unfiltered listing (null filters dropped)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createDirectoryStudent(tx, { namePrefix: "DirStudentAny" });

      const page = await AdminStudentDirectoryService.list({}, 1, 100, LOCALE, admin.id, tx);
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.items.find(item => item.id === student.id)).not.toBeUndefined();
    });
  });

  test("hasParent filter partitions the directory (linked vs unlinked)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const parentUser = await createTestUser(tx, { role: "parent" });
      await createTestParent(tx, parentUser.id);
      const linked = await createDirectoryStudent(tx, {
        namePrefix: "DirStudentLinked",
        parentId: parentUser.id,
      });
      const unlinked = await createDirectoryStudent(tx, { namePrefix: "DirStudentFree" });

      const linkedPage = await AdminStudentDirectoryService.list({ hasParent: true }, 1, 100, LOCALE, admin.id, tx);
      expect(linkedPage.items.find(item => item.id === linked.id)).not.toBeUndefined();
      expect(linkedPage.items.find(item => item.id === unlinked.id)).toBeUndefined();

      const unlinkedPage = await AdminStudentDirectoryService.list({ hasParent: false }, 1, 100, LOCALE, admin.id, tx);
      expect(unlinkedPage.items.find(item => item.id === unlinked.id)).not.toBeUndefined();
      expect(unlinkedPage.items.find(item => item.id === linked.id)).toBeUndefined();
    });
  });

  test("language filter matches primary OR secondary language case-insensitively (exact, not substring)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const primary = await createDirectoryStudent(tx, {
        namePrefix: "DirStudentLangPrimary",
        primaryLanguage: "Arabic",
      });
      const secondary = await createDirectoryStudent(tx, {
        namePrefix: "DirStudentLangSecondary",
        anotherLanguage: "English",
      });
      await createDirectoryStudent(tx, { namePrefix: "DirStudentLangNone" });

      const arabicPage = await AdminStudentDirectoryService.list({ language: "aRabic" }, 1, 100, LOCALE, admin.id, tx);
      expect(arabicPage.items.find(item => item.id === primary.id)).not.toBeUndefined();
      expect(arabicPage.items.find(item => item.id === secondary.id)).toBeUndefined();

      const englishPage = await AdminStudentDirectoryService.list(
        { language: "ENGLISH" },
        1,
        100,
        LOCALE,
        admin.id,
        tx
      );
      expect(englishPage.items.find(item => item.id === secondary.id)).not.toBeUndefined();
      expect(englishPage.items.find(item => item.id === primary.id)).toBeUndefined();

      // Exact match — a substring of a stored language must NOT match.
      const substringPage = await AdminStudentDirectoryService.list({ language: "Arab" }, 1, 100, LOCALE, admin.id, tx);
      expect(substringPage.items.find(item => item.id === primary.id)).toBeUndefined();
    });
  });
});

describe("AdminStudentDirectoryService.list — pagination", () => {
  registerPaginationCountingContract({
    seedThree: async (tx, prefix) => {
      await Promise.all([
        createDirectoryStudent(tx, { namePrefix: prefix }),
        createDirectoryStudent(tx, { namePrefix: prefix }),
        createDirectoryStudent(tx, { namePrefix: prefix }),
      ]);
    },
    list: (tx, actorId, filters, page, pageSize) =>
      AdminStudentDirectoryService.list(filters, page, pageSize, LOCALE, actorId, tx),
  });

  // ── Pagination bounds reject BEFORE any DB read ────────────────────────

  registerPaginationValidationContract({
    list: (tx, actorId, page, pageSize) => AdminStudentDirectoryService.list({}, page, pageSize, LOCALE, actorId, tx),
  });
});

describe("AdminStudentDirectoryService.exportAll — export-all envelope", () => {
  test("admin exports the filtered directory; rows + honest full total + truncated=false", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const parentUser = await createTestUser(tx, { role: "parent" });
      await createTestParent(tx, parentUser.id);
      const linked = await createDirectoryStudent(tx, {
        namePrefix: "DirStudentExport",
        parentId: parentUser.id,
        primaryLanguage: "Arabic",
      });
      const unlinked = await createDirectoryStudent(tx, { namePrefix: "DirStudentExport" });

      const envelope = await AdminStudentDirectoryService.exportAll(
        { search: "DirStudentExport" },
        LOCALE,
        admin.id,
        tx
      );

      // The export envelope reports the FULL filtered count — exactly the
      // count the listing query would report across all pages.
      expectExportEnvelope(envelope, { total: 2, rows: 2 });
      expectExportRowIds(envelope, [linked.id, unlinked.id]);
      const found = envelope.rows.find(row => row.id === linked.id);
      expect(found?.name).toContain("DirStudentExport");
      expect(found?.email).toBe(linked.email);
      expect(found?.primaryLanguage).toBe("Arabic");
      expect(found?.hasParent).toBe(true);
      expect(found?.parentEmail).toBe(parentUser.email);
    });
  });

  test("filter composition is respected (hasParent filter partitions the export)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const parentUser = await createTestUser(tx, { role: "parent" });
      await createTestParent(tx, parentUser.id);
      const linked = await createDirectoryStudent(tx, {
        namePrefix: "DirStudentExportFilter",
        parentId: parentUser.id,
      });
      await createDirectoryStudent(tx, { namePrefix: "DirStudentExportFilter" });

      const envelope = await AdminStudentDirectoryService.exportAll(
        { search: "DirStudentExportFilter", hasParent: true },
        LOCALE,
        admin.id,
        tx
      );
      expectExportEnvelope(envelope, { total: 1, rows: 1 });
      expect(envelope.rows[0]?.id).toBe(linked.id);
    });
  });

  test("no-match search → honest empty envelope (rows [], total 0, truncated false)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const envelope = await AdminStudentDirectoryService.exportAll(
        { search: `no-match-${randomUUID()}` },
        LOCALE,
        admin.id,
        tx
      );
      expectExportEnvelope(envelope, { total: 0, rows: 0 });
    });
  });
});

describe("AdminStudentDirectoryService.exportAll — defense-in-depth (BFLA)", () => {
  registerBflaDenials({
    call: (tx, actorId) => AdminStudentDirectoryService.exportAll({}, LOCALE, actorId, tx),
  });
});

describe("AdminStudentDirectoryService.list — defense-in-depth (BFLA)", () => {
  registerBflaDenials({
    call: (tx, actorId) => AdminStudentDirectoryService.list({}, 1, 25, LOCALE, actorId, tx),
  });
});
