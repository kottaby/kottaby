/**
 * ApplicantRepository.transitionToInEvaluation tests — guarded lifecycle
 * transition `pending|failed` → `in_evaluation` against the live
 * `kottab_test` PostgreSQL instance.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every test runs inside `runInRollback`; `tx` is passed to EVERY repo
 *    call, entity-setup helper, and direct Drizzle query.
 *  - Entities are created ONLY via `entity-setup.ts` helpers (`createTestUser`
 *    + `createTestApplicant`) — never seed data.
 *  - The method under test never throws — a zero-row miss surfaces as `null`
 *    (the service tier disambiguates the reason), so there are no throwing
 *    paths to probe here.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): pending row → returns the updated row flipped to
 *    `in_evaluation`; failed row → flips; absent id → null with no row
 *    created.
 *  - Tier 2 (boundary/honest failure): `in_evaluation` and `passed` rows are
 *    zero-row misses (null) whose stored state stays byte-identical;
 *    `updated_at` advances DB-side from a historical seed while the audit
 *    columns (`verification_attempts`, `last_attempt_at`, `cooldown_until`)
 *    survive untouched.
 *  - Tier 3 (concurrency / tx composition): N parallel transitions on ONE
 *    pending row via Promise.allSettled — exactly one wins, the rest observe
 *    zero rows, no rejection ever surfaces; a sequential repeat after
 *    success is a null no-op; composing the transition with an attempt
 *    increment inside ONE transaction completes deadlock-free (tx-threading
 *    proof) and the forced rollback leaves zero durable trace.
 *  - Tier 4 (unicode/tenancy/static): unicode/RTL/emoji full names
 *    transition cleanly and survive the round-trip byte-identical;
 *    transitioning user A leaves user B's row byte-identical; static source
 *    pins keep the write guarded (state folded into the WHERE, RETURNING
 *    projection, no read-then-write, no logger/i18n/console contact).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { ApplicantRepository } from "@/backend/db/repo";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { users } from "@/backend/db/schema/users/users";
import { createTestApplicant, createTestUser } from "@/backend/db/test/entity-setup";
import { runInRollback } from "@/backend/db/test/test-utils";
import { ApplicantStatus } from "@/backend/enum";
import type { DBTransaction } from "@/backend/types";

/** Historical instants — deterministic anchors for timestamp assertions. */
const HISTORICAL_UPDATED_AT = new Date("2020-06-01T00:00:00.000Z");
const HISTORICAL_ATTEMPT_AT = new Date("2021-03-04T05:06:07.000Z");
/** Cooldown comfortably in the future — must survive the flip untouched. */
const FUTURE_COOLDOWN = new Date("2100-01-01T00:00:00.000Z");

/** Unicode/RTL/emoji full name — proves multi-script fixtures round-trip. */
const UNICODE_FULL_NAME = "أحمد عبد الرحمن ﷺ 汉字 🎓";

/**
 * Returns an integer id that cannot exist as an `applicants` row during this
 * transaction: applicants share their PK with `users.id`, so anything above
 * the current max (plus a large offset no sequence reaches mid-test) is
 * guaranteed absent.
 */
async function absentApplicantId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${applicants.id}), 0)::int` }).from(applicants);
  return (row?.maxId ?? 0) + 1_000_000;
}

/**
 * Independent read-back oracle — direct Drizzle select on the same tx, NOT
 * routed through the repository method under test.
 */
async function readApplicantRow(tx: DBTransaction, userId: number) {
  const rows = await tx.select().from(applicants).where(eq(applicants.id, userId));
  return rows[0] ?? null;
}

/** Asserts a returned transition row is the flipped applicant row. */
function expectFlippedRow(row: { id: number; status: string | null } | null, userId: number): void {
  expect(row).not.toBeNull();
  expect(row?.id).toBe(userId);
  expect(row?.status).toBe(ApplicantStatus.InEvaluation);
}

describe("ApplicantRepository.transitionToInEvaluation", () => {
  // ─── Tier 1: branch/statement ───────────────────────────────────────

  test("pending applicant → returns the updated row flipped to in_evaluation", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: ApplicantStatus.Pending });

      const row = await ApplicantRepository.transitionToInEvaluation(user.id, tx);

      expectFlippedRow(row, user.id);
      // Independent persisted-state oracle — the flip really landed.
      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.status).toBe(ApplicantStatus.InEvaluation);
    });
  });

  test("failed applicant → returns the updated row flipped to in_evaluation", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, {
        status: ApplicantStatus.Failed,
        verificationAttempts: 2,
        lastAttemptAt: HISTORICAL_ATTEMPT_AT,
        cooldownUntil: FUTURE_COOLDOWN,
      });

      const row = await ApplicantRepository.transitionToInEvaluation(user.id, tx);

      expectFlippedRow(row, user.id);
      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.status).toBe(ApplicantStatus.InEvaluation);
    });
  });

  test("absent applicant id → returns null and creates no row", async () => {
    await runInRollback(async tx => {
      const missingId = await absentApplicantId(tx);

      const row = await ApplicantRepository.transitionToInEvaluation(missingId, tx);

      // The guarded UPDATE matched zero rows because no `applicants` row
      // carries that id — a pure UPDATE cannot create one.
      expect(row).toBeNull();
      expect(await readApplicantRow(tx, missingId)).toBeNull();
    });
  });

  // ─── Tier 2: boundary / honest failure ──────────────────────────────

  test("in_evaluation applicant is a zero-row no-op (null; stored state byte-identical)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const before = await createTestApplicant(tx, user.id, { status: ApplicantStatus.InEvaluation });

      const row = await ApplicantRepository.transitionToInEvaluation(user.id, tx);

      expect(row).toBeNull();
      const after = await readApplicantRow(tx, user.id);
      expect(after?.status).toBe(ApplicantStatus.InEvaluation);
      // A no-op must not even touch the row — no bell rung.
      expect(after?.updatedAt?.getTime()).toBe(before.updatedAt?.getTime());
    });
  });

  test("passed applicant is a zero-row no-op (null; stored state byte-identical)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const before = await createTestApplicant(tx, user.id, { status: ApplicantStatus.Passed });

      const row = await ApplicantRepository.transitionToInEvaluation(user.id, tx);

      expect(row).toBeNull();
      const after = await readApplicantRow(tx, user.id);
      expect(after?.status).toBe(ApplicantStatus.Passed);
      expect(after?.updatedAt?.getTime()).toBe(before.updatedAt?.getTime());
    });
  });

  test("updated_at advances DB-side from a historical seed; audit columns survive untouched", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, {
        status: ApplicantStatus.Failed,
        verificationAttempts: 3,
        lastAttemptAt: HISTORICAL_ATTEMPT_AT,
        cooldownUntil: FUTURE_COOLDOWN,
        updatedAt: HISTORICAL_UPDATED_AT,
      });

      const row = await ApplicantRepository.transitionToInEvaluation(user.id, tx);

      expectFlippedRow(row, user.id);
      expect(row?.updatedAt?.getTime()).toBeGreaterThan(HISTORICAL_UPDATED_AT.getTime());
      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.updatedAt?.getTime()).toBeGreaterThan(HISTORICAL_UPDATED_AT.getTime());
      // The transition re-opens evaluation; it never rewrites the attempt
      // ledger or the cooldown lifecycle.
      expect(persisted?.verificationAttempts).toBe(3);
      expect(persisted?.lastAttemptAt?.getTime()).toBe(HISTORICAL_ATTEMPT_AT.getTime());
      expect(persisted?.cooldownUntil?.getTime()).toBe(FUTURE_COOLDOWN.getTime());
    });
  });

  // ─── Tier 3: concurrency / tx composition ───────────────────────────

  test("parallel transitions on ONE pending row: exactly one wins, the rest see zero rows", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: ApplicantStatus.Pending });

      const settled = await Promise.allSettled(
        Array.from({ length: 5 }, () => ApplicantRepository.transitionToInEvaluation(user.id, tx))
      );

      expect(settled).toHaveLength(5);
      for (const outcome of settled) {
        expect(outcome.status).toBe("fulfilled");
      }
      // The guarded WHERE serializes the race: only the first statement
      // matches `status IN ('pending','failed')`; every loser returns null.
      const winners = settled.flatMap(outcome =>
        outcome.status === "fulfilled" && outcome.value !== null ? [outcome.value] : []
      );
      expect(winners).toHaveLength(1);
      expectFlippedRow(winners[0] ?? null, user.id);

      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.status).toBe(ApplicantStatus.InEvaluation);
      expect(persisted?.verificationAttempts).toBe(0);
    });
  });

  test("sequential repeat after a successful flip is a null no-op", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: ApplicantStatus.Pending });

      const first = await ApplicantRepository.transitionToInEvaluation(user.id, tx);
      const second = await ApplicantRepository.transitionToInEvaluation(user.id, tx);

      expectFlippedRow(first, user.id);
      expect(second).toBeNull();
    });
  });

  test("composes with the attempt increment inside ONE transaction (deadlock-free) and rollback erases it", async () => {
    let probedUserId = 0;
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      probedUserId = user.id;
      await createTestApplicant(tx, user.id, { status: ApplicantStatus.Failed });

      // Two writes on the same row inside the caller's transaction — a call
      // that mixed the ambient db into this tx would hang the single
      // connection; completion IS the tx-threading assertion.
      const attempt = await ApplicantRepository.recordVerificationAttempt(user.id, tx);
      expect(attempt?.verificationAttempts).toBe(1);
      const flipped = await ApplicantRepository.transitionToInEvaluation(user.id, tx);
      expectFlippedRow(flipped, user.id);
    });
    // The forced rollback un-applied everything: the fixture user (cascade
    // owner of the applicants row) is durably gone.
    const leftover = await db.select({ id: applicants.id }).from(applicants).where(eq(applicants.id, probedUserId));
    expect(leftover).toHaveLength(0);
  });

  // ─── Tier 4: unicode / tenancy ──────────────────────────────────────

  test("unicode/RTL/emoji full name transitions cleanly and round-trips byte-identical", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx, { fullName: UNICODE_FULL_NAME });
      await createTestApplicant(tx, user.id, { status: ApplicantStatus.Pending });

      const row = await ApplicantRepository.transitionToInEvaluation(user.id, tx);

      expectFlippedRow(row, user.id);
      // The multi-script name survived the fixture round-trip (write + read
      // through two independent Drizzle statements).
      const [reread] = await tx
        .select({ fullName: users.fullName })
        .from(applicants)
        .innerJoin(users, eq(users.id, applicants.id))
        .where(eq(applicants.id, user.id));
      expect(reread?.fullName).toBe(UNICODE_FULL_NAME);
    });
  });

  test("transitioning user A leaves user B's row byte-identical", async () => {
    await runInRollback(async tx => {
      const userA = await createTestUser(tx);
      const userB = await createTestUser(tx);
      await createTestApplicant(tx, userA.id, { status: ApplicantStatus.Pending });
      const applicantB = await createTestApplicant(tx, userB.id, {
        status: ApplicantStatus.Failed,
        verificationAttempts: 2,
        lastAttemptAt: HISTORICAL_ATTEMPT_AT,
        cooldownUntil: FUTURE_COOLDOWN,
      });
      const beforeB = await readApplicantRow(tx, userB.id);

      const flipped = await ApplicantRepository.transitionToInEvaluation(userA.id, tx);
      expectFlippedRow(flipped, userA.id);

      const afterB = await readApplicantRow(tx, userB.id);
      // WHERE id = $1 binds exactly one row — user B is untouched in every
      // column (updated_at included), proving the id is scoped by parameter.
      expect(afterB?.status).toBe(applicantB.status);
      expect(afterB?.updatedAt?.getTime()).toBe(beforeB?.updatedAt?.getTime());
      expect(afterB?.verificationAttempts).toBe(2);
      expect(afterB?.lastAttemptAt?.getTime()).toBe(HISTORICAL_ATTEMPT_AT.getTime());
      expect(afterB?.cooldownUntil?.getTime()).toBe(FUTURE_COOLDOWN.getTime());
    });
  });

  // ─── Tier 4 (static): the write stays guarded ───────────────────────

  const REPO_FILE = join(import.meta.dir, "../../../repo/teachers/applicant.repository.ts");
  const repoSource = readFileSync(REPO_FILE, "utf8");

  function transitionSource(): string {
    const start = repoSource.indexOf("export async function transitionToInEvaluation(");
    return repoSource.slice(start, repoSource.indexOf("\n  }", start));
  }

  test("source: prior state is folded into the WHERE guard with RETURNING (no read-then-write)", () => {
    const source = transitionSource();
    expect(source.includes("inArray(applicants.status")).toBe(true);
    expect(source.includes("ApplicantStatus.Pending")).toBe(true);
    expect(source.includes("ApplicantStatus.Failed")).toBe(true);
    expect(source.includes("ApplicantStatus.InEvaluation")).toBe(true);
    expect(source.includes(".returning()")).toBe(true);
    expect(source.includes(".select(")).toBe(false);
    expect(source.includes("tx?: DBTransaction")).toBe(true);
  });

  test("source: no prepared statements, no logger, no i18n, no console in the repository", () => {
    expect(repoSource.includes(".prepare(")).toBe(false);
    expect(repoSource.includes("sql.placeholder")).toBe(false);
    expect(repoSource.includes("getServerTranslations")).toBe(false);
    expect(repoSource.includes("logger")).toBe(false);
    expect(repoSource.includes("console.")).toBe(false);
  });
});
