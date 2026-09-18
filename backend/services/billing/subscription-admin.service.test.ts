/**
 * SubscriptionAdminService tests — the admin extend + renew flows
 * (validation, admin gate, guarded/claimed write transitions, the
 * exactly-one audit rows, and the replay/claim-conflict semantics)
 * against the live database on REAL repositories.
 *
 * Per `backend/db/test/AGENTS.md` (the DB-backed service-test rules the
 * sibling billing suites apply):
 *  - Every transactional case runs inside `runInRollback`; the `tx` is
 *    propagated to the service as its `outerTx` seam so the whole flow
 *    executes as a SAVEPOINT on the caller's transaction. The exception
 *    is the true-concurrency chaos case, which needs REAL independent
 *    transactions (committed fixtures + FK-ordered teardown below).
 *  - Entities are created ONLY via `entity-setup.ts` helpers — never seed
 *    data.
 *  - NO `expect(...).rejects.toThrow()` — every induced denial is
 *    asserted through a try/catch helper, never through a pinned
 *    rejection inside the rollback wrapper.
 *  - Log seams are SPIED (never real output assertions): every spy is
 *    tracked and restored per test (bun reuses ONE mock per object+method
 *    pair until restored).
 *
 * Coverage map:
 *  - Tier 1 (branch): an active subscription extends with exactly one
 *    `Update` audit row on the `subscription` entity whose details carry
 *    the ISO window bounds and the integer day count; every non-active
 *    lifecycle state (pending / expired / cancelled / suspended), a
 *    missing row, a fractional day count, a non-positive day count, a
 *    non-admin actor, and an anonymous actor each deny with ZERO writes
 *    and ZERO audit rows.
 *  - Tier 2 (boundary): the minimal one-day extension shifts the window
 *    by exactly one day; a windowless active row denies; an extension
 *    that would push the resulting window past the interval ceiling
 *    denies while an extension landing exactly ON the ceiling commits.
 *  - Tier 3 (chaos): the guarded-transition replay — a lost race between
 *    the read and the write surfaces the idempotent conflict with zero
 *    audit rows (stubbed seam probe inside the rollback), and two
 *    concurrent identical double-submits on independent transactions
 *    partition across the row lock: exactly one window shift, exactly one
 *    audit row, the loser receives the conflict.
 *  - Tier 4 (abuse): the non-admin denial is probed for the full
 *    zero-side-effect contract — row byte-identical, zero audit rows by
 *    actor AND by entity; the audit details vocabulary is pinned to
 *    ids/ints/ISO strings only (no free text ever enters the trail).
 *  - Renew: the expired source renews into a fresh active period (window
 *    = start + the plan's interval, no gateway payload), the lane is
 *    credited exactly plan.sessionCount, the junction row exists, the
 *    claim is backfilled, and ONE `Create` audit row carries the
 *    `{ renewedFromSubscriptionId, planId, creditedSessions,
 *    intervalDays }` ids/ints details; every non-expired status (active/
 *    pending/cancelled/suspended) and an unknown id deny with zero
 *    writes/claims/audits; a lane-less plan fails closed leaving no
 *    claim residue; a pre-existing claim replays its pointed row (no
 *    second insert, no double credit) while a pointer-less claim
 *    conflicts with the localized already-renewed copy; two concurrent
 *    renews partition across the claim's unique index — both fulfill
 *    with the SAME first result.
 *  - Cancel: the active row flips to `cancelled` with the lane balances
 *    BYTE-IDENTICAL before and after (balance-preserving — the sweep
 *    zeroes, cancel never does); exactly ONE `Suspend` audit row carries
 *    the `{ fromStatus, toStatus, reason? }` details with the trimmed
 *    reason as the trail's only free text (omitted entirely when not
 *    supplied, > 200 trimmed characters rejected pre-DB); every
 *    non-active status denies with zero writes and zero audit rows while
 *    an already-cancelled row replays as the idempotent conflict and a
 *    vanished row as the canonical not-found denial.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/backend/db";
import {
  StudentRepository,
  SubscriptionPurchaseIdempotencyRepository,
  SubscriptionRepository,
} from "@/backend/db/repo";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { plans } from "@/backend/db/schema/billing/plans";
import { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";
import { subscriptionPurchaseIdempotency } from "@/backend/db/schema/billing/subscription-purchase-idempotency";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { students } from "@/backend/db/schema/students/students";
import {
  createTestPlan,
  createTestStudent,
  createTestSubscription,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { runInRollback } from "@/backend/db/test/test-utils";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { SubscriptionAdminService } from "@/backend/services/billing/subscription-admin.service";
import type {
  CancelSubscriptionSubmitInput,
  DBTransaction,
  ExtendSubscriptionSubmitInput,
  PlanSelectType,
  RenewSubscriptionSubmitInput,
  SubscriptionSelectType,
  UserSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { deleteUsersByIds } from "@/test/helpers/db-cleanup";
import { isPgliteProvider } from "@/test/helpers/skip-when-pglite";

/** Concurrent-transaction cases run ONLY on a real multi-connection PostgreSQL. */
const testOnRealPostgres = isPgliteProvider() ? test.skip : test;

/** One day in milliseconds — the service's extension arithmetic unit. */
const MS_PER_DAY = 86_400_000;

/** The audit entity label minted by the subscription-admin audit contract. */
const SUBSCRIPTION_ENTITY_TYPE = "subscription";

/** Sentinel actorId expressing an anonymous caller (the admin gate ladder). */
const ANONYMOUS_ACTOR_ID = 0;

/** The errors-namespace translations for the default test locale. */
function t() {
  return getServerTranslations("en").errorsTranslations;
}

/**
 * Registry of every spy created during the currently running test. bun's
 * `spyOn` reuses ONE mock per object+method pair until it is restored, so
 * an unrestored mock keeps accumulating `mock.calls` across tests and
 * poisons later call-count assertions — every spy is registered here and
 * restored by the file-level `afterEach`.
 */
const trackedSpies: Array<{ restore(): void }> = [];

function trackSpy<T extends { mockRestore(): void }>(spy: T): T {
  trackedSpies.push({ restore: () => spy.mockRestore() });
  return spy;
}

afterEach(() => {
  for (const entry of trackedSpies) {
    entry.restore();
  }
  trackedSpies.length = 0;
});

/** Creates one admin actor (user row with the admin role). */
async function createAdmin(tx: DBTransaction): Promise<number> {
  const adminUser = await createTestUser(tx, { role: "admin" });
  return adminUser.id;
}

/** One student owner + one active subscription with a deterministic window. */
interface ActiveFixture {
  readonly owner: UserSelectType;
  readonly subscription: SubscriptionSelectType;
}

async function createActiveSubscription(
  tx: DBTransaction,
  overrides: Partial<SubscriptionSelectType> = {}
): Promise<ActiveFixture> {
  const owner = await createTestUser(tx, { role: "student" });
  const plan = await createTestPlan(tx);
  const now = new Date();
  const subscription = await createTestSubscription(tx, owner.id, plan.id, {
    status: SubscriptionStatus.Active,
    startDate: now,
    endDate: new Date(now.getTime() + 30 * MS_PER_DAY),
    ...overrides,
  });
  return { owner, subscription };
}

/** The extend payload for one subscription (day count is the caller's knob). */
function extendInput(subscriptionId: number, days: number): ExtendSubscriptionSubmitInput {
  return { subscriptionId, days };
}

/**
 * Try/catch rejection helper (never `.rejects.toThrow()` inside
 * `runInRollback` — deadlocks). Returns the caught `Error`; fails the
 * test when the call resolves successfully.
 */
async function expectServiceError(fn: () => Promise<unknown>): Promise<Error> {
  let errorCaught: unknown = null;
  try {
    await fn();
  } catch (error) {
    errorCaught = error;
  }
  if (errorCaught === null) {
    throw new Error("expectServiceError: expected the call to throw, but it resolved successfully");
  }
  if (!(errorCaught instanceof Error)) {
    throw new Error(`expectServiceError: caught non-Error throw: ${JSON.stringify(errorCaught)}`);
  }
  return errorCaught;
}

/** Type-guard read of a caught rejection's `extensions.code` (the typed DomainError contract). */
function rejectionCode(error: unknown): string {
  return error instanceof DomainError ? error.code : "";
}

/** Pins a caught denial to exactly the expected code + translated message. */
function expectDomainDenial(error: Error, code: string, message: string): void {
  expect(error).toBeInstanceOf(DomainError);
  expect(rejectionCode(error)).toBe(code);
  expect(error.message).toBe(message);
}

/** Read-back oracle: the subscription row for one id (on the tx). */
async function readSubscription(tx: DBTransaction, subscriptionId: number): Promise<SubscriptionSelectType> {
  const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
  if (!row) {
    throw new Error(`readSubscription: no row for subscription ${subscriptionId}`);
  }
  return row;
}

/** Audit rows ABOUT one subscription (the exactly-once oracle). */
async function readAuditsForSubscription(tx: DBTransaction, subscriptionId: number) {
  return tx
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, SUBSCRIPTION_ENTITY_TYPE), eq(auditLogs.entityId, subscriptionId)));
}

/** Audit rows WRITTEN BY one actor (the denial-zero-writes oracle). */
async function countAuditsForActor(tx: DBTransaction, actorId: number): Promise<number> {
  return tx.$count(auditLogs, eq(auditLogs.actorId, actorId));
}

/**
 * Non-active denial probe for ONE fixture: the localized active-only
 * conflict, the row untouched, and zero audit rows about the entity.
 */
async function expectExtendDenied(tx: DBTransaction, adminId: number, fixture: ActiveFixture): Promise<void> {
  const error = await expectServiceError(() =>
    SubscriptionAdminService.extendSubscription(extendInput(fixture.subscription.id, 7), adminId, "en", tx)
  );
  expect(error).toBeInstanceOf(ConflictError);
  expectDomainDenial(error, "CONFLICT", t().subscriptionAdmin.notActive);

  const reread = await readSubscription(tx, fixture.subscription.id);
  expect(reread.status).toBe(fixture.subscription.status);
  expect(reread.endDate).toEqual(fixture.subscription.endDate);
  expect(await readAuditsForSubscription(tx, fixture.subscription.id)).toHaveLength(0);
}

/**
 * Day-count rejection probe: the pre-DB VALIDATION denial with the row
 * and the audit trail untouched.
 */
async function expectDaysRejected(
  tx: DBTransaction,
  adminId: number,
  subscriptionId: number,
  days: number
): Promise<void> {
  const error = await expectServiceError(() =>
    SubscriptionAdminService.extendSubscription(extendInput(subscriptionId, days), adminId, "en", tx)
  );
  expect(error).toBeInstanceOf(ValidationError);
  expectDomainDenial(error, "VALIDATION", t().badRequest);
  expect(await readAuditsForSubscription(tx, subscriptionId)).toHaveLength(0);
}

// ─── Renew fixtures & probes ───────────────────────────────────────────────

/** One expired source row + its owner (students row included) + its plan. */
interface RenewFixture {
  readonly owner: UserSelectType;
  readonly plan: PlanSelectType;
  readonly source: SubscriptionSelectType;
}

/**
 * Creates the renew surface's fixture: the owner's `students` row must
 * exist (the junction insert and the lane credit both key on it), the
 * plan carries a configured Hifz lane, and the source row is a TRUE
 * expired-status row (the sweep owns the active → expired transition).
 */
async function createExpiredFixture(
  tx: DBTransaction,
  overrides: {
    planOverrides?: Partial<PlanSelectType>;
    subscriptionOverrides?: Partial<SubscriptionSelectType>;
  } = {}
): Promise<RenewFixture> {
  const owner = await createTestUser(tx, { role: "student" });
  await createTestStudent(tx, owner.id);
  const plan = await createTestPlan(tx, {
    balanceLane: SubscriptionCreditLane.Hifz,
    ...overrides.planOverrides,
  });
  const now = new Date();
  const source = await createTestSubscription(tx, owner.id, plan.id, {
    status: SubscriptionStatus.Expired,
    startDate: new Date(now.getTime() - 35 * MS_PER_DAY),
    endDate: new Date(now.getTime() - 5 * MS_PER_DAY),
    ...overrides.subscriptionOverrides,
  });
  return { owner, plan, source };
}

/** The renew payload for one source subscription. */
function renewInput(subscriptionId: number): RenewSubscriptionSubmitInput {
  return { subscriptionId };
}

/** The owner's Hifz lane balance (the fixture lane — the renewal credit target). */
async function readHifzBalance(tx: DBTransaction, studentId: number): Promise<number> {
  const [row] = await tx
    .select({ balance: students.balanceHifz })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (row?.balance == null) {
    throw new Error("readHifzBalance: no students row for the renewal fixture owner");
  }
  return row.balance;
}

/** Wholesale-count reads for the zero-writes proofs. */
async function countSubscriptionsForOwner(tx: DBTransaction, ownerId: number): Promise<number> {
  return tx.$count(subscriptions, eq(subscriptions.userId, ownerId));
}

/** The idempotency claim row for one key, or null when the key is unclaimed. */
async function readClaim(tx: DBTransaction, key: string) {
  const [row] = await tx
    .select()
    .from(subscriptionPurchaseIdempotency)
    .where(eq(subscriptionPurchaseIdempotency.idempotencyKey, key))
    .limit(1);
  return row ?? null;
}

/** Junction rows tying one subscription to any student. */
async function countJunctionRows(tx: DBTransaction, subscriptionId: number): Promise<number> {
  return tx.$count(studentSubscriptions, eq(studentSubscriptions.subscriptionId, subscriptionId));
}

/**
 * Expired-only denial probe for ONE fixture: the localized not-expired
 * conflict with zero writes — the source row is the owner's ONLY
 * subscription row, no claim exists, the lane is untouched, and no audit
 * row exists about the source.
 */
async function expectRenewDeniedForStatus(tx: DBTransaction, adminId: number, fixture: RenewFixture): Promise<void> {
  const error = await expectServiceError(() =>
    SubscriptionAdminService.renewSubscription(renewInput(fixture.source.id), adminId, "en", tx)
  );
  expect(error).toBeInstanceOf(ConflictError);
  expectDomainDenial(error, "CONFLICT", t().subscriptionAdmin.notExpired);
  expect(await countSubscriptionsForOwner(tx, fixture.owner.id)).toBe(1);
  expect(await readClaim(tx, `renew:${fixture.source.id}`)).toBeNull();
  expect(await readHifzBalance(tx, fixture.owner.id)).toBe(0);
  expect(await readAuditsForSubscription(tx, fixture.source.id)).toHaveLength(0);
}

// ─── Cancel fixtures & probes ──────────────────────────────────────────────

/** The cancel payload for one subscription (the reason is the caller's knob). */
function cancelInput(subscriptionId: number, reason?: string): CancelSubscriptionSubmitInput {
  return reason === undefined ? { subscriptionId } : { subscriptionId, reason };
}

/**
 * The owner's full lane-balance quadruple — the byte-identical oracle for
 * the balance-preserving cancel proof (every column compared before and
 * after, not just the fixture lane).
 */
async function readLaneBalances(tx: DBTransaction, studentId: number) {
  const [row] = await tx
    .select({
      hifz: students.balanceHifz,
      tajweed: students.balanceTajweed,
      reviews: students.balanceReviews,
      trial: students.balanceTrial,
    })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!row) {
    throw new Error("readLaneBalances: no students row for the cancel fixture owner");
  }
  return row;
}

/**
 * One student owner + one ACTIVE subscription + a non-zero Hifz lane: the
 * balance-preserving proof needs a lane actually carrying value before the
 * cancel lands (a zero lane would make "preserved" trivially true).
 */
async function createCancellableFixture(
  tx: DBTransaction,
  overrides: Partial<SubscriptionSelectType> = {}
): Promise<ActiveFixture> {
  const owner = await createTestUser(tx, { role: "student" });
  await createTestStudent(tx, owner.id);
  const plan = await createTestPlan(tx, { balanceLane: SubscriptionCreditLane.Hifz });
  const now = new Date();
  const subscription = await createTestSubscription(tx, owner.id, plan.id, {
    status: SubscriptionStatus.Active,
    startDate: now,
    endDate: new Date(now.getTime() + 30 * MS_PER_DAY),
    ...overrides,
  });
  await StudentRepository.creditLaneBalance(owner.id, SubscriptionCreditLane.Hifz, plan.sessionCount, tx);
  return { owner, subscription };
}

/**
 * Cancel denial probe for ONE fixture: the expected localized conflict
 * (the active-only deny, or the idempotent already-cancelled replay), the
 * row untouched, the lane untouched, and zero audit rows about the entity.
 */
async function expectCancelDenied(
  tx: DBTransaction,
  adminId: number,
  fixture: ActiveFixture,
  expectedMessage: string
): Promise<void> {
  const error = await expectServiceError(() =>
    SubscriptionAdminService.cancelSubscription(cancelInput(fixture.subscription.id), adminId, "en", tx)
  );
  expect(error).toBeInstanceOf(ConflictError);
  expectDomainDenial(error, "CONFLICT", expectedMessage);

  const reread = await readSubscription(tx, fixture.subscription.id);
  expect(reread.status).toBe(fixture.subscription.status);
  expect(reread.endDate).toEqual(fixture.subscription.endDate);
  expect(await readAuditsForSubscription(tx, fixture.subscription.id)).toHaveLength(0);
}

/** Pins one cancel audit's details to EXACTLY the two status members — no reason key. */
async function expectAuditDetailsWithoutReason(tx: DBTransaction, subscriptionId: number): Promise<void> {
  const audit = (await readAuditsForSubscription(tx, subscriptionId))[0];
  if (!audit?.details) {
    throw new Error("audit row/details vanished");
  }
  expect(JSON.parse(audit.details)).toEqual({
    fromStatus: SubscriptionStatus.Active,
    toStatus: SubscriptionStatus.Cancelled,
  });
}

// ─── Tier 1: branches ─────────────────────────────────────────────────────

describe("SubscriptionAdminService.extendSubscription — branches (Tier 1)", () => {
  test("extends an active subscription: exact window shift + exactly one Update audit row", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { subscription } = await createActiveSubscription(tx);
      const previousEndDate = subscription.endDate;
      if (!previousEndDate) {
        throw new Error("fixture failure: active row has no window end");
      }
      const newEndDate = new Date(previousEndDate.getTime() + 14 * MS_PER_DAY);

      const result = await SubscriptionAdminService.extendSubscription(
        extendInput(subscription.id, 14),
        adminId,
        "en",
        tx
      );

      expect(result.id).toBe(subscription.id);
      expect(result.status).toBe(SubscriptionStatus.Active);
      expect(result.endDate).toEqual(newEndDate);

      const audits = await readAuditsForSubscription(tx, subscription.id);
      expect(audits).toHaveLength(1);
      const audit = audits[0];
      if (!audit) {
        throw new Error("audit row vanished");
      }
      expect(audit.actorId).toBe(adminId);
      expect(audit.actionType).toBe(AuditActionType.Update);
      expect(audit.entityType).toBe(SUBSCRIPTION_ENTITY_TYPE);
      if (audit.details === null) {
        throw new Error("audit details vanished");
      }
      // The details vocabulary is ids/ints/ISO strings only — parsed back
      // to the exact triple, no free text ever entered the trail.
      expect(JSON.parse(audit.details)).toEqual({
        previousEndDate: previousEndDate.toISOString(),
        newEndDate: newEndDate.toISOString(),
        addedDays: 14,
      });
    });
  });

  test("denies a pending subscription with the active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const pending = await createActiveSubscription(tx, { status: SubscriptionStatus.Pending, endDate: null });
      await expectExtendDenied(tx, adminId, pending);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies an expired subscription with the active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      // A TRUE expired-status row: the sweep owns the active → expired
      // transition, so an active row whose window has merely closed is still
      // legitimately extendable — the fixture must flip the status itself.
      const now = new Date();
      const expired = await createActiveSubscription(tx, {
        status: SubscriptionStatus.Expired,
        endDate: new Date(now.getTime() - 5 * MS_PER_DAY),
      });
      await expectExtendDenied(tx, adminId, expired);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a cancelled subscription with the active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const cancelled = await createActiveSubscription(tx, { status: SubscriptionStatus.Cancelled });
      await expectExtendDenied(tx, adminId, cancelled);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a suspended subscription with the active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const suspended = await createActiveSubscription(tx, { status: SubscriptionStatus.Suspended });
      await expectExtendDenied(tx, adminId, suspended);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies an unknown subscription id with the same active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.extendSubscription(extendInput(99999999, 7), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(ConflictError);
      expectDomainDenial(error, "CONFLICT", t().subscriptionAdmin.notActive);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("rejects a fractional day count pre-DB with zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { subscription } = await createActiveSubscription(tx);

      await expectDaysRejected(tx, adminId, subscription.id, 2.5);

      expect((await readSubscription(tx, subscription.id)).endDate).toEqual(subscription.endDate);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("rejects non-positive day counts pre-DB with zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { subscription } = await createActiveSubscription(tx);

      await expectDaysRejected(tx, adminId, subscription.id, 0);
      await expectDaysRejected(tx, adminId, subscription.id, -5);

      expect((await readSubscription(tx, subscription.id)).endDate).toEqual(subscription.endDate);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a non-admin actor before any write: row byte-identical, zero audit rows", async () => {
    await runInRollback(async tx => {
      const student = await createTestUser(tx, { role: "student" });
      const { subscription } = await createActiveSubscription(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.extendSubscription(extendInput(subscription.id, 7), student.id, "en", tx)
      );

      expect(error).toBeInstanceOf(ForbiddenError);
      expectDomainDenial(error, "FORBIDDEN", t().forbidden);
      const reread = await readSubscription(tx, subscription.id);
      expect(reread.status).toBe(subscription.status);
      expect(reread.endDate).toEqual(subscription.endDate);
      expect(reread.updatedAt).toEqual(subscription.updatedAt);
      expect(await countAuditsForActor(tx, student.id)).toBe(0);
      expect(await readAuditsForSubscription(tx, subscription.id)).toHaveLength(0);
    });
  });

  test("denies an anonymous actor with UNAUTHORIZED and zero audit rows", async () => {
    await runInRollback(async tx => {
      const { subscription } = await createActiveSubscription(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.extendSubscription(extendInput(subscription.id, 7), ANONYMOUS_ACTOR_ID, "en", tx)
      );

      expect(error).toBeInstanceOf(UnauthorizedError);
      expectDomainDenial(error, "UNAUTHORIZED", t().unauthorized);
      expect(await readAuditsForSubscription(tx, subscription.id)).toHaveLength(0);
    });
  });
});

// ─── Tier 2: boundaries ───────────────────────────────────────────────────

describe("SubscriptionAdminService.extendSubscription — boundaries (Tier 2)", () => {
  test("days = 1: the minimal extension shifts the window by exactly one day", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { subscription } = await createActiveSubscription(tx);
      const previousEndDate = subscription.endDate;
      if (!previousEndDate) {
        throw new Error("fixture failure: active row has no window end");
      }

      const result = await SubscriptionAdminService.extendSubscription(
        extendInput(subscription.id, 1),
        adminId,
        "en",
        tx
      );

      expect(result.endDate).toEqual(new Date(previousEndDate.getTime() + MS_PER_DAY));
      expect((await readAuditsForSubscription(tx, subscription.id))[0]?.actionType).toBe(AuditActionType.Update);
    });
  });

  test("a windowless active row denies with the active-only conflict", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const windowless = await createActiveSubscription(tx, { endDate: null });

      const error = await expectServiceError(() =>
        SubscriptionAdminService.extendSubscription(extendInput(windowless.subscription.id, 7), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(ConflictError);
      expectDomainDenial(error, "CONFLICT", t().subscriptionAdmin.notActive);
      expect((await readSubscription(tx, windowless.subscription.id)).endDate).toBeNull();
      expect(await readAuditsForSubscription(tx, windowless.subscription.id)).toHaveLength(0);
    });
  });

  test("an extension past the interval ceiling denies; exactly ON the ceiling commits", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);

      // One day past the ceiling: the resulting window spans start + 3651
      // days → the localized ceiling reject, row and trail untouched.
      const overTheLine = await createActiveSubscription(tx);
      const pastCeilingError = await expectServiceError(() =>
        SubscriptionAdminService.extendSubscription(
          extendInput(overTheLine.subscription.id, 3651 - 30),
          adminId,
          "en",
          tx
        )
      );
      expect(pastCeilingError).toBeInstanceOf(ValidationError);
      expectDomainDenial(pastCeilingError, "VALIDATION", t().subscriptionAdmin.prorationOverflow);
      expect((await readSubscription(tx, overTheLine.subscription.id)).endDate).toEqual(
        overTheLine.subscription.endDate
      );
      expect(await readAuditsForSubscription(tx, overTheLine.subscription.id)).toHaveLength(0);

      // Exactly on the ceiling: start + 3650 days → commits (inclusive
      // bound). The expected end derives from the FIXTURE's own window end
      // (never a separately captured clock — the two can drift by ms).
      const onTheLine = await createActiveSubscription(tx);
      const onTheLinePrevEnd = onTheLine.subscription.endDate;
      if (!onTheLinePrevEnd) {
        throw new Error("fixture failure: active row has no window end");
      }
      const result = await SubscriptionAdminService.extendSubscription(
        extendInput(onTheLine.subscription.id, 3650 - 30),
        adminId,
        "en",
        tx
      );
      expect(result.endDate).toEqual(new Date(onTheLinePrevEnd.getTime() + (3650 - 30) * MS_PER_DAY));
      expect(await readAuditsForSubscription(tx, onTheLine.subscription.id)).toHaveLength(1);
    });
  });
});

// ─── Tier 3: chaos (replay + true concurrency) ────────────────────────────

describe("SubscriptionAdminService.extendSubscription — chaos (Tier 3)", () => {
  test("a replay that lost the guarded race surfaces the idempotent conflict with zero audit rows", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { subscription } = await createActiveSubscription(tx);

      // Simulates the lost race: between this transaction's read and its
      // write, a concurrent writer moved the window, so the guarded UPDATE
      // matches zero rows. The REAL guarded statement stays fully
      // exercised by the true-concurrency case below; this probe pins the
      // service contract for the zero-row branch (localized conflict, one
      // bounded log, no audit row).
      const replayStub = trackSpy(spyOn(SubscriptionRepository, "extendActiveOnce"));
      replayStub.mockImplementation(async () => null);
      const domainErrorSpy = trackSpy(spyOn(logger, "logDomainError"));

      const error = await expectServiceError(() =>
        SubscriptionAdminService.extendSubscription(extendInput(subscription.id, 7), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(ConflictError);
      expectDomainDenial(error, "CONFLICT", t().conflict);
      expect(domainErrorSpy).toHaveBeenCalledTimes(1);
      expect(await readAuditsForSubscription(tx, subscription.id)).toHaveLength(0);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  testOnRealPostgres(
    "concurrent identical double-submits: exactly one window shift and one audit row, the loser conflicts",
    async () => {
      // Committed fixtures — the production path opens its OWN transaction
      // per call, so the race needs real committed entities.
      const fixture = await db.transaction(async fixtureTx => {
        const admin = await createTestUser(fixtureTx, { role: "admin" });
        const owner = await createTestUser(fixtureTx, { role: "student" });
        const plan = await createTestPlan(fixtureTx);
        const subscription = await createTestSubscription(fixtureTx, owner.id, plan.id, {
          status: SubscriptionStatus.Active,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * MS_PER_DAY),
        });
        return {
          adminId: admin.id,
          ownerId: owner.id,
          planId: plan.id,
          subscriptionId: subscription.id,
          previousEndDate: subscription.endDate,
        };
      });
      if (!fixture.previousEndDate) {
        throw new Error("fixture failure: active row has no window end");
      }

      // Deterministic lost-race interleaving: hold BOTH calls right after
      // their row read (each inside its own top-level transaction) and
      // release them together, so both guarded UPDATEs contend on the SAME
      // previous end date. Without the barrier the second call's read can
      // land after the first commit — a legitimately STACKED extension by
      // design (the service re-reads the current window), not the lost
      // race this probe pins. The real guarded statement, row lock, and
      // audit write below stay fully exercised.
      const realFindById = SubscriptionRepository.findById;
      let readersArrived = 0;
      let releaseReaders!: () => void;
      const readersBarrier = new Promise<void>(resolve => {
        releaseReaders = resolve;
      });
      const findByIdStub = trackSpy(spyOn(SubscriptionRepository, "findById"));
      findByIdStub.mockImplementation(async (id, executor) => {
        const row = await realFindById(id, executor);
        readersArrived += 1;
        if (readersArrived === 2) {
          releaseReaders();
        }
        await readersBarrier;
        return row;
      });

      try {
        const [first, second] = await Promise.allSettled([
          SubscriptionAdminService.extendSubscription(extendInput(fixture.subscriptionId, 10), fixture.adminId, "en"),
          SubscriptionAdminService.extendSubscription(extendInput(fixture.subscriptionId, 10), fixture.adminId, "en"),
        ]);

        // Exactly one call commits; the loser receives the idempotent
        // conflict instead of a second window shift.
        const outcomes = [first, second];
        const fulfilled = outcomes.filter(entry => entry.status === "fulfilled");
        const rejected = outcomes.filter(entry => entry.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        const loserReason = rejected[0]?.status === "rejected" ? rejected[0].reason : null;
        expect(loserReason).toBeInstanceOf(ConflictError);
        expect(rejectionCode(loserReason)).toBe("CONFLICT");

        // The window shifted by exactly ONE extension — never two.
        const reread = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, fixture.subscriptionId))
          .limit(1);
        expect(reread[0]?.endDate).toEqual(new Date(fixture.previousEndDate.getTime() + 10 * MS_PER_DAY));
        expect(reread[0]?.status).toBe(SubscriptionStatus.Active);

        const audits = await db
          .select()
          .from(auditLogs)
          .where(
            and(eq(auditLogs.entityType, SUBSCRIPTION_ENTITY_TYPE), eq(auditLogs.entityId, fixture.subscriptionId))
          );
        expect(audits).toHaveLength(1);
      } finally {
        // FK-ordered teardown of the committed fixtures; the committed
        // audit row (append-only table) is removed first under suspended
        // delete triggers, keyed by the acting admin.
        await deleteUsersByIds([fixture.adminId, fixture.ownerId]);
        await db.delete(plans).where(eq(plans.id, fixture.planId));
      }
    }
  );
});
// ─── Renew: branches (Tier 1) ──────────────────────────────────────────────

describe("SubscriptionAdminService.renewSubscription — branches (Tier 1)", () => {
  test("renews an expired subscription: fresh active period + full lane credit + junction + backfilled claim + one Create audit row", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { owner, plan, source } = await createExpiredFixture(tx);
      const callStart = new Date();

      const result = await SubscriptionAdminService.renewSubscription(renewInput(source.id), adminId, "en", tx);

      const callEnd = new Date();
      // The returned row IS the fresh period: same owner + plan, active,
      // opening at the renewal instant with EXACTLY the fixture plan's
      // interval length (window arithmetic bound to fixture data — never
      // a separately captured clock).
      expect(result.id).not.toBe(source.id);
      expect(result.userId).toBe(owner.id);
      expect(result.planId).toBe(plan.id);
      expect(result.status).toBe(SubscriptionStatus.Active);
      if (result.startDate === null || result.endDate === null) {
        throw new Error("renewal returned a windowless row");
      }
      expect(result.startDate.getTime()).toBeGreaterThanOrEqual(callStart.getTime());
      expect(result.startDate.getTime()).toBeLessThanOrEqual(callEnd.getTime());
      expect(result.endDate.getTime() - result.startDate.getTime()).toBe(plan.intervalDays * MS_PER_DAY);
      // An admin renewal carries no gateway payload.
      expect(result.paymentMethod).toBeNull();
      expect(result.paymentReference).toBeNull();
      expect(result.paymentVerifiedAt).toBeNull();

      // Persisted: exactly one NEW row beside the untouched expired source.
      expect(await countSubscriptionsForOwner(tx, owner.id)).toBe(2);
      const sourceReread = await readSubscription(tx, source.id);
      expect(sourceReread.status).toBe(SubscriptionStatus.Expired);
      expect(sourceReread.endDate).toEqual(source.endDate);

      // The lane was credited exactly the plan's full session count.
      expect(await readHifzBalance(tx, owner.id)).toBe(plan.sessionCount);

      // The junction row ties the fresh period to the student.
      expect(await countJunctionRows(tx, result.id)).toBe(1);

      // The claim was created and backfilled to the fresh row.
      const claim = await readClaim(tx, `renew:${source.id}`);
      expect(claim?.userId).toBe(owner.id);
      expect(claim?.subscriptionId).toBe(result.id);

      // Exactly ONE audit row about the FRESH row — Create with the
      // ids/ints details vocabulary parsed back verbatim; the source row
      // minted nothing.
      const audits = await readAuditsForSubscription(tx, result.id);
      expect(audits).toHaveLength(1);
      const audit = audits[0];
      if (!audit) {
        throw new Error("audit row vanished");
      }
      expect(audit.actorId).toBe(adminId);
      expect(audit.actionType).toBe(AuditActionType.Create);
      expect(audit.entityType).toBe(SUBSCRIPTION_ENTITY_TYPE);
      if (audit.details === null) {
        throw new Error("audit details vanished");
      }
      expect(JSON.parse(audit.details)).toEqual({
        renewedFromSubscriptionId: source.id,
        planId: plan.id,
        creditedSessions: plan.sessionCount,
        intervalDays: plan.intervalDays,
      });
      expect(await readAuditsForSubscription(tx, source.id)).toHaveLength(0);
    });
  });

  test("denies an active subscription with the expired-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const active = await createExpiredFixture(tx, { subscriptionOverrides: { status: SubscriptionStatus.Active } });
      await expectRenewDeniedForStatus(tx, adminId, active);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a pending subscription with the expired-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const pending = await createExpiredFixture(tx, {
        subscriptionOverrides: { status: SubscriptionStatus.Pending, endDate: null },
      });
      await expectRenewDeniedForStatus(tx, adminId, pending);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a cancelled subscription with the expired-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const cancelled = await createExpiredFixture(tx, {
        subscriptionOverrides: { status: SubscriptionStatus.Cancelled },
      });
      await expectRenewDeniedForStatus(tx, adminId, cancelled);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a suspended subscription with the expired-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const suspended = await createExpiredFixture(tx, {
        subscriptionOverrides: { status: SubscriptionStatus.Suspended },
      });
      await expectRenewDeniedForStatus(tx, adminId, suspended);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies an unknown subscription id with the same expired-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.renewSubscription(renewInput(99999999), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(ConflictError);
      expectDomainDenial(error, "CONFLICT", t().subscriptionAdmin.notExpired);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("fail-closed: a source plan without a configured lane denies with zero writes — the claim does not survive", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { owner, source } = await createExpiredFixture(tx, {
        planOverrides: { balanceLane: null },
      });

      const error = await expectServiceError(() =>
        SubscriptionAdminService.renewSubscription(renewInput(source.id), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(ConflictError);
      expectDomainDenial(error, "CONFLICT", t().conflict);
      // Zero writes — and the claim that was inserted BEFORE the plan
      // read rolled back with the transaction: the deny leaves no
      // idempotency residue.
      expect(await countSubscriptionsForOwner(tx, owner.id)).toBe(1);
      expect(await readClaim(tx, `renew:${source.id}`)).toBeNull();
      expect(await readHifzBalance(tx, owner.id)).toBe(0);
      expect(await readAuditsForSubscription(tx, source.id)).toHaveLength(0);
    });
  });

  test("denies a non-admin actor before any write: row byte-identical, zero claims, zero audit rows", async () => {
    await runInRollback(async tx => {
      const student = await createTestUser(tx, { role: "student" });
      const { owner, source } = await createExpiredFixture(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.renewSubscription(renewInput(source.id), student.id, "en", tx)
      );

      expect(error).toBeInstanceOf(ForbiddenError);
      expectDomainDenial(error, "FORBIDDEN", t().forbidden);
      const reread = await readSubscription(tx, source.id);
      expect(reread.status).toBe(source.status);
      expect(reread.endDate).toEqual(source.endDate);
      expect(reread.updatedAt).toEqual(source.updatedAt);
      expect(await countSubscriptionsForOwner(tx, owner.id)).toBe(1);
      expect(await readClaim(tx, `renew:${source.id}`)).toBeNull();
      expect(await countAuditsForActor(tx, student.id)).toBe(0);
    });
  });

  test("denies an anonymous actor with UNAUTHORIZED and zero audit rows", async () => {
    await runInRollback(async tx => {
      const { source } = await createExpiredFixture(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.renewSubscription(renewInput(source.id), ANONYMOUS_ACTOR_ID, "en", tx)
      );

      expect(error).toBeInstanceOf(UnauthorizedError);
      expectDomainDenial(error, "UNAUTHORIZED", t().unauthorized);
      expect(await readAuditsForSubscription(tx, source.id)).toHaveLength(0);
    });
  });
});

// ─── Renew: boundaries + replay + chaos (Tier 2/3) ─────────────────────────

describe("SubscriptionAdminService.renewSubscription — boundaries, replay, chaos (Tier 2/3)", () => {
  test("an inactive plan still renews: the fresh read supplies the snapshot — activity is a purchase-time property", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { owner, plan, source } = await createExpiredFixture(tx, {
        planOverrides: { isActive: false, deactivatedAt: new Date() },
      });

      const result = await SubscriptionAdminService.renewSubscription(renewInput(source.id), adminId, "en", tx);

      expect(result.status).toBe(SubscriptionStatus.Active);
      expect(result.planId).toBe(plan.id);
      expect(await readHifzBalance(tx, owner.id)).toBe(plan.sessionCount);
    });
  });

  test("a replayed renew returns the FIRST result: no second insert, no double credit, no audit", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { owner, plan, source } = await createExpiredFixture(tx);
      // The first renewal already committed: its active result row plus
      // its claim, backfilled and pointing at that row.
      const priorResult = await createTestSubscription(tx, owner.id, plan.id, {
        status: SubscriptionStatus.Active,
        startDate: new Date(Date.now() - 2 * MS_PER_DAY),
        endDate: new Date(Date.now() + 28 * MS_PER_DAY),
      });
      const claim = await SubscriptionPurchaseIdempotencyRepository.insertClaim(
        { idempotencyKey: `renew:${source.id}`, userId: owner.id },
        tx
      );
      await SubscriptionPurchaseIdempotencyRepository.updateClaimSubscriptionId(claim.id, priorResult.id, tx);
      // The first renewal's lane credit already landed.
      await StudentRepository.creditLaneBalance(owner.id, SubscriptionCreditLane.Hifz, plan.sessionCount, tx);

      const result = await SubscriptionAdminService.renewSubscription(renewInput(source.id), adminId, "en", tx);

      // The FIRST result is returned — not a fresh period.
      expect(result.id).toBe(priorResult.id);
      expect(await countSubscriptionsForOwner(tx, owner.id)).toBe(2);
      // No second credit: the balance STILL holds exactly one grant (a
      // double credit would read twice the plan's session count).
      expect(await readHifzBalance(tx, owner.id)).toBe(plan.sessionCount);
      // No audit row was minted for the replay, and the claim pointer is
      // untouched.
      expect(await readAuditsForSubscription(tx, priorResult.id)).toHaveLength(0);
      expect((await readClaim(tx, `renew:${source.id}`))?.subscriptionId).toBe(priorResult.id);
    });
  });

  test("a committed claim without a resolvable result conflicts with the localized already-renewed copy", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { owner, source } = await createExpiredFixture(tx);
      // The claim row committed but its subscription pointer is null —
      // the set-null FK after the result row's deletion (the aborted-
      // original shape): the replay cannot resolve to any row.
      await SubscriptionPurchaseIdempotencyRepository.insertClaim(
        { idempotencyKey: `renew:${source.id}`, userId: owner.id },
        tx
      );

      const error = await expectServiceError(() =>
        SubscriptionAdminService.renewSubscription(renewInput(source.id), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(ConflictError);
      expectDomainDenial(error, "CONFLICT", t().subscriptionAdmin.alreadyRenewed);
      // Zero writes: the expired source is the owner's only row, the
      // lane untouched, no audit row about the source.
      expect(await countSubscriptionsForOwner(tx, owner.id)).toBe(1);
      expect(await readHifzBalance(tx, owner.id)).toBe(0);
      expect(await readAuditsForSubscription(tx, source.id)).toHaveLength(0);
    });
  });

  testOnRealPostgres(
    "concurrent identical renews: both calls fulfill with the FIRST result — one new period, one credit, one audit",
    async () => {
      // Committed fixtures — the production path opens its OWN transaction
      // per call, so the race needs real committed entities.
      const fixture = await db.transaction(async fixtureTx => {
        const admin = await createTestUser(fixtureTx, { role: "admin" });
        const owner = await createTestUser(fixtureTx, { role: "student" });
        await createTestStudent(fixtureTx, owner.id);
        const plan = await createTestPlan(fixtureTx, { balanceLane: SubscriptionCreditLane.Hifz });
        const now = new Date();
        const source = await createTestSubscription(fixtureTx, owner.id, plan.id, {
          status: SubscriptionStatus.Expired,
          startDate: new Date(now.getTime() - 35 * MS_PER_DAY),
          endDate: new Date(now.getTime() - 5 * MS_PER_DAY),
        });
        return {
          adminId: admin.id,
          ownerId: owner.id,
          planId: plan.id,
          sourceId: source.id,
          sessionCount: plan.sessionCount,
        };
      });

      try {
        // No read barrier is needed: the claim's unique index IS the
        // serialization point — the loser's claim insert blocks until the
        // winner's transaction commits, then replays the winner's row.
        const [first, second] = await Promise.allSettled([
          SubscriptionAdminService.renewSubscription(renewInput(fixture.sourceId), fixture.adminId, "en"),
          SubscriptionAdminService.renewSubscription(renewInput(fixture.sourceId), fixture.adminId, "en"),
        ]);
        if (first.status === "rejected" || second.status === "rejected") {
          throw new Error(
            `both renews must fulfill: ${JSON.stringify([
              first.status === "rejected" ? String(first.reason) : "",
              second.status === "rejected" ? String(second.reason) : "",
            ])}`
          );
        }

        // Both calls return the SAME first result.
        expect(first.value.id).toBe(second.value.id);

        // Exactly one fresh period beside the untouched expired source.
        const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, fixture.ownerId));
        expect(rows).toHaveLength(2);
        const fresh = rows.find(row => row.id === first.value.id);
        expect(fresh?.status).toBe(SubscriptionStatus.Active);
        const rereadSource = rows.find(row => row.id === fixture.sourceId);
        expect(rereadSource?.status).toBe(SubscriptionStatus.Expired);

        // One full lane credit — never two.
        const [studentRow] = await db.select().from(students).where(eq(students.id, fixture.ownerId)).limit(1);
        expect(studentRow?.balanceHifz).toBe(fixture.sessionCount);

        // One claim with the backfilled pointer, and exactly one audit
        // row about the fresh result.
        const [claimRow] = await db
          .select()
          .from(subscriptionPurchaseIdempotency)
          .where(eq(subscriptionPurchaseIdempotency.idempotencyKey, `renew:${fixture.sourceId}`))
          .limit(1);
        expect(claimRow?.subscriptionId).toBe(first.value.id);
        const audits = await db
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.entityType, SUBSCRIPTION_ENTITY_TYPE), eq(auditLogs.entityId, first.value.id)));
        expect(audits).toHaveLength(1);
        expect(audits[0]?.actionType).toBe(AuditActionType.Create);
      } finally {
        // FK-ordered teardown of the committed fixtures; the committed
        // audit row (append-only table) is removed first under suspended
        // delete triggers, keyed by the acting admin.
        await deleteUsersByIds([fixture.adminId, fixture.ownerId]);
        await db.delete(plans).where(eq(plans.id, fixture.planId));
      }
    }
  );
});

// ─── Cancel: branches (Tier 1) ─────────────────────────────────────────────

describe("SubscriptionAdminService.cancelSubscription — branches (Tier 1)", () => {
  test("cancels an active subscription: status flip + lane balances byte-identical + one Suspend audit row with the trimmed reason", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { owner, subscription } = await createCancellableFixture(tx);
      const lanesBefore = await readLaneBalances(tx, owner.id);
      expect(lanesBefore.hifz).toBeGreaterThan(0);

      const result = await SubscriptionAdminService.cancelSubscription(
        cancelInput(subscription.id, "  duplicate account  "),
        adminId,
        "en",
        tx
      );

      // The returned row IS the cancelled row: same owner + plan, every
      // other column riding through untouched.
      expect(result.id).toBe(subscription.id);
      expect(result.status).toBe(SubscriptionStatus.Cancelled);
      expect(result.userId).toBe(subscription.userId);
      expect(result.planId).toBe(subscription.planId);
      expect(result.endDate).toEqual(subscription.endDate);

      // Balance-preserving: EVERY lane column is byte-identical before and
      // after — cancel never destroys paid value (the sweep zeroes, the
      // cancel does not).
      const lanesAfter = await readLaneBalances(tx, owner.id);
      expect(lanesAfter).toEqual(lanesBefore);

      // Exactly ONE audit row about the cancelled row — Suspend with the
      // exact details shape, the TRIMMED reason the trail's only free text.
      const audits = await readAuditsForSubscription(tx, subscription.id);
      expect(audits).toHaveLength(1);
      const audit = audits[0];
      if (!audit) {
        throw new Error("audit row vanished");
      }
      expect(audit.actorId).toBe(adminId);
      expect(audit.actionType).toBe(AuditActionType.Suspend);
      expect(audit.entityType).toBe(SUBSCRIPTION_ENTITY_TYPE);
      expect(audit.entityId).toBe(subscription.id);
      if (audit.details === null) {
        throw new Error("audit details vanished");
      }
      expect(JSON.parse(audit.details)).toEqual({
        fromStatus: SubscriptionStatus.Active,
        toStatus: SubscriptionStatus.Cancelled,
        reason: "duplicate account",
      });
    });
  });

  test("stores no reason in the audit details when omitted or blank after trimming", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const omitted = await createCancellableFixture(tx);
      const blank = await createCancellableFixture(tx);

      const first = await SubscriptionAdminService.cancelSubscription(
        cancelInput(omitted.subscription.id),
        adminId,
        "en",
        tx
      );
      expect(first.status).toBe(SubscriptionStatus.Cancelled);

      const second = await SubscriptionAdminService.cancelSubscription(
        cancelInput(blank.subscription.id, "   "),
        adminId,
        "en",
        tx
      );
      expect(second.status).toBe(SubscriptionStatus.Cancelled);

      // Both trails carry EXACTLY the two status members — no reason key,
      // no empty-string noise.
      await expectAuditDetailsWithoutReason(tx, omitted.subscription.id);
      await expectAuditDetailsWithoutReason(tx, blank.subscription.id);
    });
  });

  test("denies a pending subscription with the active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const pending = await createCancellableFixture(tx, {
        status: SubscriptionStatus.Pending,
        endDate: null,
      });
      await expectCancelDenied(tx, adminId, pending, t().subscriptionAdmin.notActive);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies an expired subscription with the active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      // A TRUE expired-status row: the sweep owns the active → expired
      // transition, so the fixture must flip the status itself.
      const now = new Date();
      const expired = await createCancellableFixture(tx, {
        status: SubscriptionStatus.Expired,
        endDate: new Date(now.getTime() - 5 * MS_PER_DAY),
      });
      await expectCancelDenied(tx, adminId, expired, t().subscriptionAdmin.notActive);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a suspended subscription with the active-only conflict and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const suspended = await createCancellableFixture(tx, { status: SubscriptionStatus.Suspended });
      await expectCancelDenied(tx, adminId, suspended, t().subscriptionAdmin.notActive);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies an unknown subscription id with the canonical not-found denial and zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.cancelSubscription(cancelInput(99999999), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(NotFoundError);
      expectDomainDenial(error, "SUBSCRIPTION_NOT_FOUND", t().notFound);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("denies a non-admin actor before any write: row byte-identical, lane untouched, zero audit rows", async () => {
    await runInRollback(async tx => {
      const student = await createTestUser(tx, { role: "student" });
      const { owner, subscription } = await createCancellableFixture(tx);
      const lanesBefore = await readLaneBalances(tx, owner.id);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.cancelSubscription(cancelInput(subscription.id), student.id, "en", tx)
      );

      expect(error).toBeInstanceOf(ForbiddenError);
      expectDomainDenial(error, "FORBIDDEN", t().forbidden);
      const reread = await readSubscription(tx, subscription.id);
      expect(reread.status).toBe(subscription.status);
      expect(reread.endDate).toEqual(subscription.endDate);
      expect(reread.updatedAt).toEqual(subscription.updatedAt);
      expect(await readLaneBalances(tx, owner.id)).toEqual(lanesBefore);
      expect(await countAuditsForActor(tx, student.id)).toBe(0);
      expect(await readAuditsForSubscription(tx, subscription.id)).toHaveLength(0);
    });
  });

  test("denies an anonymous actor with UNAUTHORIZED and zero audit rows", async () => {
    await runInRollback(async tx => {
      const { subscription } = await createCancellableFixture(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.cancelSubscription(cancelInput(subscription.id), ANONYMOUS_ACTOR_ID, "en", tx)
      );

      expect(error).toBeInstanceOf(UnauthorizedError);
      expectDomainDenial(error, "UNAUTHORIZED", t().unauthorized);
      expect(await readAuditsForSubscription(tx, subscription.id)).toHaveLength(0);
    });
  });
});

// ─── Cancel: boundaries + replay (Tier 2/3) ────────────────────────────────

describe("SubscriptionAdminService.cancelSubscription — boundaries + replay (Tier 2/3)", () => {
  test("double-cancel replays as the idempotent conflict: no second write, no second audit row", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { owner, subscription } = await createCancellableFixture(tx);
      const lanesBefore = await readLaneBalances(tx, owner.id);

      const first = await SubscriptionAdminService.cancelSubscription(cancelInput(subscription.id), adminId, "en", tx);
      expect(first.status).toBe(SubscriptionStatus.Cancelled);

      // The replayed cancel: the guarded UPDATE matches zero rows (the row
      // is no longer active) and the fresh read resolves the row to the
      // already-cancelled replay — the localized idempotent conflict on
      // the DEFAULT code, never a custom machine key.
      const error = await expectServiceError(() =>
        SubscriptionAdminService.cancelSubscription(cancelInput(subscription.id), adminId, "en", tx)
      );
      expect(error).toBeInstanceOf(ConflictError);
      expectDomainDenial(error, "CONFLICT", t().conflict);

      // Nothing happened twice: the row is cancelled once, exactly one
      // audit row exists, and the lanes are still byte-identical.
      expect((await readSubscription(tx, subscription.id)).status).toBe(SubscriptionStatus.Cancelled);
      expect(await readAuditsForSubscription(tx, subscription.id)).toHaveLength(1);
      expect(await readLaneBalances(tx, owner.id)).toEqual(lanesBefore);
      expect(await countAuditsForActor(tx, adminId)).toBe(1);
    });
  });

  test("rejects a reason longer than 200 trimmed characters pre-DB with zero writes", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { subscription } = await createCancellableFixture(tx);

      const error = await expectServiceError(() =>
        SubscriptionAdminService.cancelSubscription(cancelInput(subscription.id, "x".repeat(201)), adminId, "en", tx)
      );

      expect(error).toBeInstanceOf(ValidationError);
      expectDomainDenial(error, "VALIDATION", t().badRequest);
      // Zero writes: the row is still active and the trail is untouched.
      expect((await readSubscription(tx, subscription.id)).status).toBe(SubscriptionStatus.Active);
      expect(await readAuditsForSubscription(tx, subscription.id)).toHaveLength(0);
      expect(await countAuditsForActor(tx, adminId)).toBe(0);
    });
  });

  test("accepts a reason that is exactly 200 characters after trimming (inclusive bound)", async () => {
    await runInRollback(async tx => {
      const adminId = await createAdmin(tx);
      const { subscription } = await createCancellableFixture(tx);
      const paddedReason = `  ${"y".repeat(200)}  `;

      const result = await SubscriptionAdminService.cancelSubscription(
        cancelInput(subscription.id, paddedReason),
        adminId,
        "en",
        tx
      );

      expect(result.status).toBe(SubscriptionStatus.Cancelled);
      const audit = (await readAuditsForSubscription(tx, subscription.id))[0];
      if (!audit?.details) {
        throw new Error("audit row/details vanished");
      }
      // The stored reason is the TRIMMED body at the exact bound.
      expect(JSON.parse(audit.details).reason).toBe("y".repeat(200));
    });
  });
});
