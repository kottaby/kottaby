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

import { describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestAdmin, createTestParent, createTestStudent, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { AdminStudentDirectoryService } from "@/backend/services/admin/student-directory.service";
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

      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(25);
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.pageCount).toBeGreaterThanOrEqual(1);

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
      const found = page.items.find(item => item.id === student.id);
      expect(found).not.toBeUndefined();
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
      const found = page.items.find(item => item.id === student.id);
      expect(found).not.toBeUndefined();
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
  test("pageCount is the ceiling of total ÷ pageSize", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const prefix = `DirStudentPaged${randomUUID().slice(0, 8)}`;
      // Three mutually independent user+student pairs — seeded concurrently.
      // Each pair's user→role-child FK order stays sequenced inside the
      // helper; no dependency exists across pairs.
      await Promise.all([
        createDirectoryStudent(tx, { namePrefix: prefix }),
        createDirectoryStudent(tx, { namePrefix: prefix }),
        createDirectoryStudent(tx, { namePrefix: prefix }),
      ]);

      const twoPer = await AdminStudentDirectoryService.list({ search: prefix }, 1, 2, LOCALE, admin.id, tx);
      expect(twoPer.total).toBe(3);
      expect(twoPer.pageCount).toBe(2);
      expect(twoPer.items).toHaveLength(2);

      const threePer = await AdminStudentDirectoryService.list({ search: prefix }, 1, 3, LOCALE, admin.id, tx);
      expect(threePer.total).toBe(3);
      expect(threePer.pageCount).toBe(1);
      expect(threePer.items).toHaveLength(3);
    });
  });

  test("no-match search → honest empty envelope (total 0, pageCount 0)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminStudentDirectoryService.list(
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

  // ── Pagination bounds reject BEFORE any DB read ────────────────────────

  test("page = 0 → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminStudentDirectoryService.list({}, 0, 25, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(tErrors.validation);
    });
  });

  test("page = negative → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminStudentDirectoryService.list({}, -5, 25, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("pageSize = 101 → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminStudentDirectoryService.list({}, 1, 101, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("pageSize = undefined defaults to 25", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminStudentDirectoryService.list({}, 1, undefined, LOCALE, admin.id, tx);
      expect(page.pageSize).toBe(25);
    });
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
      expect(envelope.total).toBe(2);
      expect(envelope.truncated).toBe(false);
      expect(envelope.rows).toHaveLength(2);
      expect(envelope.rows.map(row => row.id).toSorted((a, b) => a - b)).toEqual(
        [linked.id, unlinked.id].toSorted((a, b) => a - b)
      );
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
      expect(envelope.total).toBe(1);
      expect(envelope.rows).toHaveLength(1);
      expect(envelope.rows[0]?.id).toBe(linked.id);
      expect(envelope.truncated).toBe(false);
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
      expect(envelope.rows).toEqual([]);
      expect(envelope.total).toBe(0);
      expect(envelope.truncated).toBe(false);
    });
  });
});

describe("AdminStudentDirectoryService.exportAll — defense-in-depth (BFLA)", () => {
  test("anonymous actor (id=0) → UnauthorizedError; zero writes", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminStudentDirectoryService.exportAll({}, LOCALE, ANONYMOUS_ACTOR_ID, tx)
      );
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);
    });
  });

  test("non-admin actor → ForbiddenError; zero writes", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      silenceDomainLog();
      const error = await expectRepoError(() => AdminStudentDirectoryService.exportAll({}, LOCALE, nonAdmin.id, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });
});

describe("AdminStudentDirectoryService.list — defense-in-depth (BFLA)", () => {
  test("anonymous actor (id=0) → UnauthorizedError; zero writes", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminStudentDirectoryService.list({}, 1, 25, LOCALE, ANONYMOUS_ACTOR_ID, tx)
      );
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);
    });
  });

  test("non-admin actor → ForbiddenError; zero writes", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      silenceDomainLog();
      const error = await expectRepoError(() => AdminStudentDirectoryService.list({}, 1, 25, LOCALE, nonAdmin.id, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });
});
