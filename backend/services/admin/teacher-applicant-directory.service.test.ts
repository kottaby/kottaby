/**
 * AdminApplicantDirectoryService tests — the `adminTeacherApplicants`
 * applicant-queue listing against the live `app_db` PostgreSQL instance.
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
 *  - Happy-path list mapping (pipeline headline + attempts/cooldown
 *    timestamps, NULL-row default coalescing, governance null-coalescing,
 *    page-envelope echo).
 *  - Filter normalization (search trim, literal `%` escape, 100-char
 *    clamp, status filter, absent-filter fallback to the unfiltered
 *    listing, INVALID status rejection).
 *  - `pageCount` ceiling math (3 rows ÷ pageSize 2 → 2; empty → 0).
 *  - Pagination validation errors (page 0 / negative, pageSize 101).
 *  - Defense-in-depth BFLA denials (anonymous → 401, non-admin → 403).
 */

import { describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestAdmin, createTestApplicant, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { AdminApplicantDirectoryService } from "@/backend/services/admin/teacher-applicant-directory.service";
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
 * Creates a teacher-applicant user + `applicants` pipeline row with a
 * unique full name carrying the supplied prefix (for search isolation).
 * Returns the user row.
 */
async function createDirectoryApplicant(
  tx: DBTransaction,
  options: {
    namePrefix: string;
    status?: string;
    verificationAttempts?: number;
    lastAttemptAt?: Date | null;
    cooldownUntil?: Date | null;
  }
): Promise<UserSelectType> {
  const user = await createTestUser(tx, {
    role: "teacher",
    fullName: `${options.namePrefix} ${randomUUID().slice(0, 8)}`,
  });
  await createTestApplicant(tx, user.id, {
    status: options.status ?? "pending",
    verificationAttempts: options.verificationAttempts ?? 0,
    lastAttemptAt: options.lastAttemptAt ?? null,
    cooldownUntil: options.cooldownUntil ?? null,
  });
  return user;
}

describe("AdminApplicantDirectoryService.list — happy path + mapping", () => {
  test("admin lists the queue; pipeline headline + timestamps + governance flags map correctly", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const lastAttemptAt = new Date("2026-01-15T10:00:00.000Z");
      const cooldownUntil = new Date("2026-01-16T10:00:00.000Z");
      const applicant = await createDirectoryApplicant(tx, {
        namePrefix: "DirApplicantHappy",
        status: "in_evaluation",
        verificationAttempts: 3,
        lastAttemptAt,
        cooldownUntil,
      });

      const page = await AdminApplicantDirectoryService.list(
        { search: "DirApplicantHappy" },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );

      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(25);
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.pageCount).toBeGreaterThanOrEqual(1);

      const found = page.items.find(item => item.id === applicant.id);
      expect(found).not.toBeUndefined();
      expect(found?.name).toContain("DirApplicantHappy");
      expect(found?.email).toBe(applicant.email);
      expect(found?.phone).toBe(applicant.phone);
      expect(found?.status).toBe("in_evaluation");
      expect(found?.verificationAttempts).toBe(3);
      expect(found?.lastAttemptAt?.getTime()).toBe(lastAttemptAt.getTime());
      expect(found?.cooldownUntil?.getTime()).toBe(cooldownUntil.getTime());
      expect(found?.isDeleted).toBe(false);
      expect(found?.suspended).toBe(false);
      expect(found?.isBlocked).toBe(false);
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  test("NULL status/attempts coalesce to column defaults; NULL timestamps pass through", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const user = await createTestUser(tx, {
        role: "teacher",
        fullName: `DirApplicantBare ${randomUUID().slice(0, 8)}`,
      });
      // Explicit NULLs on every default-bearing column — the DB stores no
      // defaults for an explicit-NULL insert, so this exercises the
      // mapper's coalescing rather than the column defaults.
      await createTestApplicant(tx, user.id, {
        status: null,
        verificationAttempts: null,
        lastAttemptAt: null,
        cooldownUntil: null,
      });

      const page = await AdminApplicantDirectoryService.list(
        { search: "DirApplicantBare" },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );
      const found = page.items.find(item => item.id === user.id);
      expect(found?.status).toBe("pending");
      expect(found?.verificationAttempts).toBe(0);
      expect(found?.lastAttemptAt).toBeNull();
      expect(found?.cooldownUntil).toBeNull();
    });
  });
});

describe("AdminApplicantDirectoryService.list — filter normalization", () => {
  test("search is trimmed before matching (leading/trailing whitespace ignored)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const applicant = await createDirectoryApplicant(tx, { namePrefix: "DirApplicantTrim" });

      const page = await AdminApplicantDirectoryService.list(
        { search: "  DirApplicantTrim  " },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );
      const found = page.items.find(item => item.id === applicant.id);
      expect(found).not.toBeUndefined();
    });
  });

  test("search `%` is escaped and matched literally (no wildcard widening)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const user = await createTestUser(tx, {
        role: "teacher",
        fullName: `DirApplicant%${randomUUID().slice(0, 8)}`,
      });
      await createTestApplicant(tx, user.id, { status: "pending" });

      const page = await AdminApplicantDirectoryService.list({ search: "%" }, 1, 100, LOCALE, admin.id, tx);
      const found = page.items.find(item => item.id === user.id);
      expect(found).not.toBeUndefined();
      expect(found?.name).toContain("%");
    });
  });

  test("search longer than 100 chars clamps to the first 100 (tail never widens the match)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      // Name carries a 100-char lowercase-`a` run; the search term is that
      // run PLUS a tail that appears nowhere. Only the 100-char clamp
      // makes this match.
      const user = await createTestUser(tx, {
        role: "teacher",
        fullName: `DirApplicantClamp${"a".repeat(100)}`,
      });
      await createTestApplicant(tx, user.id, { status: "pending" });

      const page = await AdminApplicantDirectoryService.list(
        { search: `${"a".repeat(100)}ZZZNOMATCH` },
        1,
        100,
        LOCALE,
        admin.id,
        tx
      );
      const found = page.items.find(item => item.id === user.id);
      expect(found).not.toBeUndefined();
    });
  });

  test("absent filters fall back to the unfiltered listing (null filters dropped)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const applicant = await createDirectoryApplicant(tx, { namePrefix: "DirApplicantAny" });

      const page = await AdminApplicantDirectoryService.list({}, 1, 100, LOCALE, admin.id, tx);
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.items.find(item => item.id === applicant.id)).not.toBeUndefined();
    });
  });

  test("status filter partitions the queue (pending vs failed)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const pending = await createDirectoryApplicant(tx, { namePrefix: "DirApplicantPending", status: "pending" });
      const failed = await createDirectoryApplicant(tx, { namePrefix: "DirApplicantFailed", status: "failed" });

      const pendingPage = await AdminApplicantDirectoryService.list(
        { status: "pending" },
        1,
        100,
        LOCALE,
        admin.id,
        tx
      );
      expect(pendingPage.items.find(item => item.id === pending.id)).not.toBeUndefined();
      expect(pendingPage.items.find(item => item.id === failed.id)).toBeUndefined();

      const failedPage = await AdminApplicantDirectoryService.list({ status: "failed" }, 1, 100, LOCALE, admin.id, tx);
      expect(failedPage.items.find(item => item.id === failed.id)).not.toBeUndefined();
      expect(failedPage.items.find(item => item.id === pending.id)).toBeUndefined();
    });
  });

  test("status outside the canonical vocabulary → ValidationError(VALIDATION) before any DB read", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminApplicantDirectoryService.list({ status: "retired" }, 1, 25, LOCALE, admin.id, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(tErrors.validation);
    });
  });
});

describe("AdminApplicantDirectoryService.list — pagination", () => {
  test("pageCount is the ceiling of total ÷ pageSize", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const prefix = `DirApplicantPaged${randomUUID().slice(0, 8)}`;
      for (let i = 0; i < 3; i++) {
        await createDirectoryApplicant(tx, { namePrefix: prefix });
      }

      const twoPer = await AdminApplicantDirectoryService.list({ search: prefix }, 1, 2, LOCALE, admin.id, tx);
      expect(twoPer.total).toBe(3);
      expect(twoPer.pageCount).toBe(2);
      expect(twoPer.items).toHaveLength(2);

      const threePer = await AdminApplicantDirectoryService.list({ search: prefix }, 1, 3, LOCALE, admin.id, tx);
      expect(threePer.total).toBe(3);
      expect(threePer.pageCount).toBe(1);
      expect(threePer.items).toHaveLength(3);
    });
  });

  test("no-match search → honest empty envelope (total 0, pageCount 0)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminApplicantDirectoryService.list(
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
      const prefix = `DirApplicantRange${randomUUID().slice(0, 8)}`;
      await createDirectoryApplicant(tx, { namePrefix: prefix });

      const page = await AdminApplicantDirectoryService.list({ search: prefix }, 999, 25, LOCALE, admin.id, tx);
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
      const error = await expectRepoError(() => AdminApplicantDirectoryService.list({}, 0, 25, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(tErrors.validation);
    });
  });

  test("page = negative → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminApplicantDirectoryService.list({}, -5, 25, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("pageSize = 101 → ValidationError(VALIDATION)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() => AdminApplicantDirectoryService.list({}, 1, 101, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("pageSize = undefined defaults to 25", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminApplicantDirectoryService.list({}, 1, undefined, LOCALE, admin.id, tx);
      expect(page.pageSize).toBe(25);
    });
  });
});

describe("AdminApplicantDirectoryService.list — defense-in-depth (BFLA)", () => {
  test("anonymous actor (id=0) → UnauthorizedError; zero writes", async () => {
    await runInRollback(async tx => {
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminApplicantDirectoryService.list({}, 1, 25, LOCALE, ANONYMOUS_ACTOR_ID, tx)
      );
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);
    });
  });

  test("non-admin actor → ForbiddenError; zero writes", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminApplicantDirectoryService.list({}, 1, 25, LOCALE, nonAdmin.id, tx)
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });
});
