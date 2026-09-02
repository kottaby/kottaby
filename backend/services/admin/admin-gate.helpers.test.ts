/**
 * Admin actor-gate helpers tests — `assertActorAdminActive` (role gate +
 * governance clause) against the live PostgreSQL instance.
 *
 * Per `backend/services/AGENTS.md` testing conventions:
 *  - Every case runs inside `runInRollback`; `tx` is passed to every
 *    entity-setup call so the fixture rows share the rolled-back
 *    transaction the gate reads through.
 *  - Entities ONLY via `entity-setup.ts` helpers; governance flags are
 *    pre-seeded via `createTestUser` overrides.
 *  - All rejection assertions use `expectRepoError` (try/catch) —
 *    `expect(...).rejects.toThrow()` is prohibited and appears nowhere.
 *  - Translated-message assertions resolve via `getServerTranslations`
 *    property access — never raw keys, never hardcoded UI copy.
 *
 * Coverage map:
 *  - Tier 1 (role branches): anonymous → UnauthorizedError; non-admin →
 *    ForbiddenError; missing actor → ForbiddenError; clean admin → silent
 *    pass (zero domain logs).
 *  - Tier 2 (governance ordering): multi-flagged admin fixtures prove the
 *    deterministic deleted → blocked → suspended precedence.
 *  - Tier 4 (BFLA / pre-DB): the anonymous denial fires with ZERO
 *    `UserRepository.findById` calls; every denial emits exactly ONE
 *    `logger.logDomainError` carrying the { code, entity, entityId, locale }
 *    context.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import { UserRepository } from "@/backend/db/repo";
import { users } from "@/backend/db/schema/users/users";
import { createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertActorAdminActive } from "@/backend/services/admin/admin-gate.helpers";
import type { DBTransaction, UserSelectType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** Sentinel `actorId` value expressing an anonymous caller. */
const ANONYMOUS_ACTOR_ID = 0;

/** Domain log spy family share this stubbed signature. */
type DomainLogSpy = ReturnType<typeof spyOn>;

/** Silences `logger.logDomainError` so test stdout stays compact. */
function silenceDomainLog(): DomainLogSpy {
  return spyOn(logger, "logDomainError").mockImplementation(() => {});
}

/** Returns an integer id guaranteed absent from `users` in this tx. */
async function absentUserId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${users.id}), 0)::int` }).from(users);
  return (row?.maxId ?? 0) + 1_000_000;
}

/**
 * Registers a governance-denial case: an admin-role actor pre-flagged with
 * the supplied governance overrides must be rejected with a localized
 * `ForbiddenError` and exactly one domain log entry.
 */
function testGovernanceDenial(title: string, overrides: Partial<UserSelectType>, expectedMessage: string): void {
  test(title, async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin", ...overrides });
      const spy = silenceDomainLog();
      const callsBefore = spy.mock.calls.length;

      const error = await expectRepoError(() => assertActorAdminActive(admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(expectedMessage);
      expect(spy.mock.calls).toHaveLength(callsBefore + 1);
      spy.mockRestore();
    });
  });
}

describe("assertActorAdminActive — Tier 1: role branches", () => {
  test("clean admin actor passes silently (no throw, zero domain logs)", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin" });
      const spy = silenceDomainLog();
      const callsBefore = spy.mock.calls.length;

      await assertActorAdminActive(admin.id, LOCALE, tx);
      expect(spy.mock.calls).toHaveLength(callsBefore);
      spy.mockRestore();
    });
  });

  test("non-admin actor → ForbiddenError with exactly one FORBIDDEN domain log", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      const spy = silenceDomainLog();
      const callsBefore = spy.mock.calls.length;

      const error = await expectRepoError(() => assertActorAdminActive(nonAdmin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
      expect(spy.mock.calls).toHaveLength(callsBefore + 1);
      const context = spy.mock.calls.at(-1)?.[1];
      expect(context?.code).toBe("FORBIDDEN");
      expect(context?.entity).toBe("user");
      expect(context?.entityId).toBe(nonAdmin.id);
      spy.mockRestore();
    });
  });

  test("missing actor row → ForbiddenError", async () => {
    await runInRollback(async tx => {
      const ghostId = await absentUserId(tx);
      silenceDomainLog();

      const error = await expectRepoError(() => assertActorAdminActive(ghostId, LOCALE, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });
});

describe("assertActorAdminActive — Tier 2: governance ordering", () => {
  testGovernanceDenial(
    "deleted + blocked + suspended → deleted denial wins (first in order)",
    { isDeleted: true, isBlocked: true, suspended: true },
    tErrors.accountDeleted
  );
  testGovernanceDenial(
    "blocked + suspended → blocked denial wins over suspended",
    { isBlocked: true, suspended: true },
    tErrors.accountBlocked
  );
  testGovernanceDenial("deleted only → accountDeleted", { isDeleted: true }, tErrors.accountDeleted);
  testGovernanceDenial("blocked only → accountBlocked", { isBlocked: true }, tErrors.accountBlocked);
  testGovernanceDenial("suspended only → accountSuspended", { suspended: true }, tErrors.accountSuspended);
});

describe("assertActorAdminActive — Tier 4: BFLA pre-DB denials", () => {
  test("anonymous actor (id=0) → UnauthorizedError with ZERO repository reads", async () => {
    await runInRollback(async tx => {
      const findSpy = spyOn(UserRepository, "findById");
      silenceDomainLog();

      const error = await expectRepoError(() => assertActorAdminActive(ANONYMOUS_ACTOR_ID, LOCALE, tx));
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);
      expect(findSpy).not.toHaveBeenCalled();
      findSpy.mockRestore();
    });
  });

  test("governed admin denial carries the locale in the domain-log context", async () => {
    await runInRollback(async tx => {
      const admin = await createTestUser(tx, { role: "admin", suspended: true });
      const spy = silenceDomainLog();
      const callsBefore = spy.mock.calls.length;

      const error = await expectRepoError(() => assertActorAdminActive(admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(spy.mock.calls).toHaveLength(callsBefore + 1);
      const context = spy.mock.calls.at(-1)?.[1];
      expect(context?.code).toBe("FORBIDDEN");
      expect(context?.entity).toBe("user");
      expect(context?.entityId).toBe(admin.id);
      expect(context?.locale).toBe(LOCALE);
      spy.mockRestore();
    });
  });
});
