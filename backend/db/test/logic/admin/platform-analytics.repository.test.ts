/**
 * PlatformAnalyticsRepository tests — 4-Tier coverage against the live
 * PostgreSQL instance inside rolled-back transactions.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every test runs inside `runInRollback`; the transaction is passed to
 *    EVERY entity-setup helper and direct Drizzle query. Fixture-delta
 *    assertions always ride the TRANSACTIONAL executor branch.
 *  - Entities are created ONLY via `entity-setup.ts` helpers — never seed
 *    data, never assumed-empty tables (pre-existing counts are baselined
 *    before every assertion).
 *  - Tests are organized per the 4-Tier framework: branch/stmt coverage
 *    (Tier 1), boundary (Tier 2), chaos/empty-state honesty (Tier 3),
 *    security/abuse + static source scans (Tier 4).
 *
 * Dual-branch executor test posture:
 *  - The repository's every method takes a trailing `tx?` and runs the
 *    Drizzle builder on a supplied transaction, or raw `$n`-parameterized
 *    SQL through `queryDb` when absent. Both branches are exercised for
 *    EVERY method (Tier 1).
 *  - The non-transactional branch executes over the pool — OUTSIDE the
 *    rollback transaction — so it can only ever observe COMMITTED state.
 *    Accordingly, non-tx assertions never depend on uncommitted fixtures:
 *    each Tier-1 test pins the committed-state parity of the two branches
 *    BEFORE seeding (with a stability recheck so a concurrent writer
 *    surfaces as an explicit stability failure, never a silent mismatch),
 *    then asserts fixture deltas on the tx branch, then re-reads the raw
 *    branch to prove it stayed untouched by the uncommitted fixture state.
 *  - The repository accepts no free-text predicate input (equality and
 *    aggregate predicates only; the sole string values it binds are enum
 *    members), so parameterization is proven by static source scans
 *    (Tier 4) plus every enum/date-bound fixture assertion in Tiers 1–2
 *    round-tripping exactly through BOTH branches.
 *
 * Fixture timestamps are all derived from ONE fixed snapshot instant
 * (`NOW` — a Wednesday) passed explicitly as each windowed method's `now`,
 * so the asserted windows land in the past and stay disjoint from live
 * committed data while every fixture stays relative to the captured `now`.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): all ten methods × both executor branches —
 *    committed-state parity, fixture deltas on tx, raw-branch isolation.
 *  - Tier 2 (boundary): ISO-Monday week start; first-of-month; a session
 *    1ms before today-start excluded from `today` (and one 1ms after the
 *    snapshot instant excluded by the closed upper bound);
 *    `awaitingConfirmation` flips on the student-confirmation instant;
 *    ACTIVE-window edges (end at `now` excluded, start at `now` included,
 *    NULL start included, future start excluded); multi-currency rows
 *    never merge (exact decimal-string math); the 24h activity boundary
 *    with NULL-safe governance exclusions; 30-day window edges on BOTH
 *    trends (in-edge inclusive, out-edge 1ms early excluded while sharing
 *    the same daily bucket).
 *  - Tier 3 (empty-state honesty): unpaid-only payments → no phantom
 *    currency row (strictly EMPTY array when no paid rows exist at all);
 *    rating averages stay `null` when a family has no rated rows even
 *    though unrated/soft-deleted rows exist; empty session table → all
 *    zero counters and a sparse-EMPTY trend (zero-fill is the composing
 *    service's duty, never the reader's).
 *  - Tier 4 (security): static source scans — zero `--` inside any SQL
 *    text; zero prepared statements / `sql.placeholder`; the global `db`
 *    handle never imported (the non-tx executor is `queryDb` only); zero
 *    value interpolation inside raw SQL text (bound `$n` params only);
 *    enum predicates via VALUE imports; exactly ten `if (tx)` dual
 *    branches with every non-tx branch routed through `queryDb`; every
 *    public method ends with the optional trailing `tx?: DBTransaction`.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { AdminUserRepository } from "@/backend/db/repo";
import {
  type PlatformAnalyticsCurrencyRevenueRow,
  PlatformAnalyticsRepository,
  type PlatformAnalyticsRevenueTrendRow,
  type PlatformAnalyticsSessionTrendRow,
} from "@/backend/db/repo/admin/platform-analytics.repository";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import {
  createTestEvaluation,
  createTestPlan,
  createTestSession,
  createTestSessionReport,
  createTestStudent,
  createTestStudentPayment,
  createTestSubscription,
  createTestTeacherRow,
  createTestTeacherTransaction,
  createTestUser,
  createTestWallet,
} from "@/backend/db/test/entity-setup";
import { runInRollback } from "@/backend/db/test/test-utils";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import type { AdminUserStatsReturnType, DBTransaction, StudentSelectType, TeacherSelectType } from "@/backend/types";

/** Absolute path to the repository source file (read for static-scan tests). */
const REPO_SOURCE_PATH = join(process.cwd(), "backend", "db", "repo", "admin", "platform-analytics.repository.ts");

/**
 * Absolute path to the repository's query-helpers module. The repo is split
 * for file-size budget (mirroring `admin-user.repository.ts` +
 * `admin-user-query-helpers.ts`): the row shapes, calendar helpers, shared
 * mappers/constants, and some executor implementations live there. The
 * security properties the Tier-4 scans pin are per-IMPLEMENTATION, not
 * per-file, so the scans read both files.
 */
const HELPER_SOURCE_PATH = join(process.cwd(), "backend", "db", "repo", "admin", "platform-analytics-query-helpers.ts");

/** The fixed snapshot instant every windowed call is anchored to (a Wednesday). */
const NOW = new Date("2026-01-07T15:30:00.000Z");

const MS = 1;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Instant `ms` relative to the fixed snapshot instant. */
function at(msFromNow: number): Date {
  return new Date(NOW.getTime() + msFromNow);
}

/** Midnight-UTC `Date` of the UTC day named by the given ISO date string. */
function utcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Reads the repository source for the static-scan tests. */
function readRepoSource(): string {
  if (!existsSync(REPO_SOURCE_PATH)) {
    throw new Error(`Repository source not found at ${REPO_SOURCE_PATH}`);
  }
  return readFileSync(REPO_SOURCE_PATH, "utf8");
}

/** Reads the repository's query-helpers implementation source. */
function readHelperSource(): string {
  if (!existsSync(HELPER_SOURCE_PATH)) {
    throw new Error(`Query-helpers source not found at ${HELPER_SOURCE_PATH}`);
  }
  return readFileSync(HELPER_SOURCE_PATH, "utf8");
}

/** The full implementation surface the static scans must cover. */
function readImplementationSource(): string {
  return `${readRepoSource()}\n${readHelperSource()}`;
}

/** Strips block comments so scans never trip over documentation mentions. */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Probes one repository call on BOTH executor branches against the
 * committed state (before any fixture insert) and pins the committed
 * state as stable across the probe window. The raw (non-transactional)
 * call runs over the pool and must observe exactly what the open
 * rollback transaction observes — nothing has been written inside it yet.
 * The two branch results are additionally pinned value-identical
 * (cross-branch parity): any byte divergence between the transactional
 * and raw executor branches fails the probe outright.
 */
async function probeBothBranches<T>(
  tx: DBTransaction,
  call: (executor?: DBTransaction) => Promise<T>
): Promise<{ viaTx: T; raw: T }> {
  const viaTx = await call(tx);
  const raw = await call(undefined);
  const viaTxRecheck = await call(tx);
  expect(viaTxRecheck).toEqual(viaTx);
  expect(raw).toEqual(viaTx);
  return { viaTx, raw };
}

/** Seeds a student cast (users row + students role-child row). */
async function seedStudent(tx: DBTransaction): Promise<StudentSelectType> {
  const user = await createTestUser(tx, { role: "student" });
  return createTestStudent(tx, user.id);
}

/** Seeds a teacher cast (users row + teacher role-child row). */
async function seedTeacher(tx: DBTransaction, overrides: Partial<TeacherSelectType> = {}): Promise<TeacherSelectType> {
  const user = await createTestUser(tx, { role: "teacher" });
  return createTestTeacherRow(tx, user.id, overrides);
}

/**
 * Exact decimal-string arithmetic (scaled BigInt, 2 decimal places) —
 * money never crosses a JS number in these assertions either.
 */
function toScaledInt(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(amount);
  if (match === null) {
    throw new Error(`toScaledInt: not a 2-decimal non-negative amount: ${amount}`);
  }
  const units = match[1] ?? "0";
  const frac = (match[2] ?? "").padEnd(2, "0");
  return BigInt(`${units}${frac}`);
}

/** Renders a scaled BigInt back into the canonical 2-decimal string. */
function fromScaledInt(scaled: bigint): string {
  const digits = scaled.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Sums exact decimal strings without float drift. */
function sumAmounts(...amounts: string[]): string {
  return fromScaledInt(amounts.reduce((acc, amount) => acc + toScaledInt(amount), 0n));
}

/** Finds the per-currency row of a revenue projection (absent → undefined). */
function byCurrency(
  rows: PlatformAnalyticsCurrencyRevenueRow[],
  currency: string
): PlatformAnalyticsCurrencyRevenueRow | undefined {
  return rows.find(row => row.currency === currency);
}

/**
 * Asserts the per-currency revenue delta introduced by `created`
 * (currency → amount strings created inside the test): the all-time
 * total, the 30-day sum, and the settled count ascend by exactly the
 * created amounts — per currency, never merged across codes.
 */
function expectRevenueDelta(
  before: PlatformAnalyticsCurrencyRevenueRow[],
  after: PlatformAnalyticsCurrencyRevenueRow[],
  created: ReadonlyArray<{ currency: string; amount: string }>
): void {
  for (const currency of [...new Set(created.map(entry => entry.currency))].toSorted((a, b) => a.localeCompare(b))) {
    const mine = created.filter(entry => entry.currency === currency);
    const mineSum = sumAmounts(...mine.map(entry => entry.amount));
    const beforeRow = byCurrency(before, currency);
    const afterRow = byCurrency(after, currency);

    expect(afterRow).toBeDefined();
    expect(afterRow?.totalAmount).toBe(sumAmounts(beforeRow?.totalAmount ?? "0.00", mineSum));
    expect(afterRow?.last30DaysAmount).toBe(sumAmounts(beforeRow?.last30DaysAmount ?? "0.00", mineSum));
    expect(afterRow?.paidPaymentsCount).toBe((beforeRow?.paidPaymentsCount ?? 0) + mine.length);
  }

  // No currency row may appear that was neither in the baseline nor created here.
  const knownCurrencies = new Set([...before.map(row => row.currency), ...created.map(entry => entry.currency)]);
  for (const row of after) {
    expect(knownCurrencies.has(row.currency)).toBe(true);
  }
}

/** Daily-bucket count delta of the sparse session trend for one UTC day. */
function bucketCount(rows: PlatformAnalyticsSessionTrendRow[], isoDate: string): number {
  const bucket = utcMidnight(isoDate).getTime();
  return rows.find(row => row.bucketStart.getTime() === bucket)?.sessionCount ?? 0;
}

/**
 * Daily-bucket amount delta of the sparse revenue trend for one
 * (UTC day, currency) pair — exact decimal strings, never floats.
 */
function bucketAmount(rows: PlatformAnalyticsRevenueTrendRow[], isoDate: string, currency: string): string {
  const bucket = utcMidnight(isoDate).getTime();
  return rows.find(row => row.bucketStart.getTime() === bucket && row.currency === currency)?.amount ?? "0.00";
}

/** Direct committed-state oracle — number of PAID payment rows right now. */
async function committedPaidPaymentCount(tx: DBTransaction): Promise<number> {
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(studentPayments)
    .where(eq(studentPayments.status, PaymentStatus.Paid));
  return rows[0]?.n ?? 0;
}

describe("PlatformAnalyticsRepository — Tier 1: every method × both executor branches", () => {
  test("countRecentlyActiveUsers: branch parity on committed state, tx-branch fixture delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.countRecentlyActiveUsers(NOW, executor)
      );

      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE) });
      // Governed accounts stay excluded even while freshly active.
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), isDeleted: true });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), suspended: true });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), isBlocked: true });

      const afterViaTx = await PlatformAnalyticsRepository.countRecentlyActiveUsers(NOW, tx);
      expect(afterViaTx).toBe(before.viaTx + 1);

      const afterRaw = await PlatformAnalyticsRepository.countRecentlyActiveUsers(NOW);
      expect(afterRaw).toBe(before.raw);
    });
  });

  test("getSessionStats: branch parity on committed state, tx-branch fixture delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const teacherRow = await seedTeacher(tx);
      const student = await seedStudent(tx);

      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.getSessionStats(NOW, executor)
      );

      await createTestSession(tx, teacherRow.id, student.id, { createdAt: at(-2 * MINUTE) });
      await createTestSession(tx, teacherRow.id, student.id, {
        status: SessionStatus.Completed,
        startedAt: at(-MINUTE),
        endedAt: at(-30_000),
        confirmedByTeacherAt: at(-30_000),
        createdAt: at(-MINUTE),
      });

      const afterViaTx = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);
      expect(afterViaTx.total).toBe(before.viaTx.total + 2);
      expect(afterViaTx.scheduled).toBe(before.viaTx.scheduled + 1);
      expect(afterViaTx.completed).toBe(before.viaTx.completed + 1);
      expect(afterViaTx.awaitingConfirmation).toBe(before.viaTx.awaitingConfirmation + 1);

      const afterRaw = await PlatformAnalyticsRepository.getSessionStats(NOW);
      expect(afterRaw).toEqual(before.raw);
    });
  });

  test("getSessionDailyTrend: branch parity on committed state, tx-branch bucket delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const teacherRow = await seedTeacher(tx);
      const student = await seedStudent(tx);

      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.getSessionDailyTrend(NOW, executor)
      );

      await createTestSession(tx, teacherRow.id, student.id, { createdAt: at(-2 * MINUTE) });
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: at(-MINUTE) });

      const afterViaTx = await PlatformAnalyticsRepository.getSessionDailyTrend(NOW, tx);
      expect(bucketCount(afterViaTx, "2026-01-07")).toBe(bucketCount(before.viaTx, "2026-01-07") + 2);

      const afterRaw = await PlatformAnalyticsRepository.getSessionDailyTrend(NOW);
      expect(afterRaw).toEqual(before.raw);
    });
  });

  test("getRevenueStats: branch parity on committed state, tx-branch per-currency delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const student = await seedStudent(tx);

      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.getRevenueStats(NOW, executor)
      );

      await createTestStudentPayment(tx, student.id, null, {
        amount: "100.00",
        currency: "EGP",
        createdAt: at(-MINUTE),
      });
      await createTestStudentPayment(tx, student.id, null, {
        amount: "50.00",
        currency: "USD",
        createdAt: at(-MINUTE),
      });

      const afterViaTx = await PlatformAnalyticsRepository.getRevenueStats(NOW, tx);
      expectRevenueDelta(before.viaTx, afterViaTx, [
        { currency: "EGP", amount: "100.00" },
        { currency: "USD", amount: "50.00" },
      ]);

      const afterRaw = await PlatformAnalyticsRepository.getRevenueStats(NOW);
      expect(afterRaw).toEqual(before.raw);
    });
  });

  test("getRevenueDailyTrend: branch parity on committed state, tx-branch bucket delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const student = await seedStudent(tx);

      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.getRevenueDailyTrend(NOW, executor)
      );

      await createTestStudentPayment(tx, student.id, null, {
        amount: "100.00",
        currency: "EGP",
        createdAt: at(-MINUTE),
      });

      const afterViaTx = await PlatformAnalyticsRepository.getRevenueDailyTrend(NOW, tx);
      expect(bucketAmount(afterViaTx, "2026-01-07", "EGP")).toBe(
        sumAmounts(bucketAmount(before.viaTx, "2026-01-07", "EGP"), "100.00")
      );

      const afterRaw = await PlatformAnalyticsRepository.getRevenueDailyTrend(NOW);
      expect(afterRaw).toEqual(before.raw);
    });
  });

  test("getSubscriptionStats: branch parity on committed state, tx-branch fixture delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx, { role: "student" });
      const plan = await createTestPlan(tx);

      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.getSubscriptionStats(NOW, executor)
      );

      await createTestSubscription(tx, user.id, plan.id, { status: SubscriptionStatus.Active, startDate: at(-DAY) });
      await createTestSubscription(tx, user.id, plan.id, { status: SubscriptionStatus.Pending, startDate: at(-DAY) });

      const afterViaTx = await PlatformAnalyticsRepository.getSubscriptionStats(NOW, tx);
      expect(afterViaTx.total).toBe(before.viaTx.total + 2);
      expect(afterViaTx.active).toBe(before.viaTx.active + 1);
      expect(afterViaTx.pending).toBe(before.viaTx.pending + 1);
      expect(afterViaTx.activeInWindowNow).toBe(before.viaTx.activeInWindowNow + 1);

      const afterRaw = await PlatformAnalyticsRepository.getSubscriptionStats(NOW);
      expect(afterRaw).toEqual(before.raw);
    });
  });

  test("countOfflineActivations: branch parity on committed state, tx-branch fixture delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx, { role: "student" });
      const plan = await createTestPlan(tx);

      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.countOfflineActivations(executor)
      );

      await createTestSubscription(tx, user.id, plan.id, { paymentMethod: PaymentGateway.OfflineCash });

      const afterViaTx = await PlatformAnalyticsRepository.countOfflineActivations(tx);
      expect(afterViaTx).toBe(before.viaTx + 1);

      const afterRaw = await PlatformAnalyticsRepository.countOfflineActivations();
      expect(afterRaw).toBe(before.raw);
    });
  });

  test("getTeacherPresenceStats: branch parity on committed state, tx-branch fixture delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const before = await probeBothBranches(tx, executor =>
        PlatformAnalyticsRepository.getTeacherPresenceStats(executor)
      );

      await seedTeacher(tx, { isOnline: true });
      await seedTeacher(tx, { isEvaluator: true });
      // An uncertified row never counts as certified — and never as "online now".
      await seedTeacher(tx, { isApproved: false, isOnline: true });

      const afterViaTx = await PlatformAnalyticsRepository.getTeacherPresenceStats(tx);
      expect(afterViaTx.certifiedCount).toBe(before.viaTx.certifiedCount + 2);
      expect(afterViaTx.evaluatorCount).toBe(before.viaTx.evaluatorCount + 1);
      expect(afterViaTx.onlineNowCount).toBe(before.viaTx.onlineNowCount + 1);

      const afterRaw = await PlatformAnalyticsRepository.getTeacherPresenceStats();
      expect(afterRaw).toEqual(before.raw);
    });
  });

  test("getRatingStats: branch parity on committed state, non-null count semantics, soft-delete exclusion, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const teacherUser = await createTestUser(tx, { role: "teacher" });
      const teacherRow = await createTestTeacherRow(tx, teacherUser.id);
      const student = await seedStudent(tx);
      const sessionRow = await createTestSession(tx, teacherRow.id, student.id);

      const before = await probeBothBranches(tx, executor => PlatformAnalyticsRepository.getRatingStats(executor));

      await createTestSessionReport(tx, sessionRow.id, { studentRatingByTeacher: 4 });
      // An unrated report exists as a row but never joins the average or the count.
      await createTestSessionReport(tx, sessionRow.id, { studentRatingByTeacher: null });
      await createTestEvaluation(tx, student.id, teacherUser.id, sessionRow.id, { score: 85 });
      await createTestEvaluation(tx, student.id, teacherUser.id, sessionRow.id, {
        score: 90,
        isDeleted: true,
        deletedAt: NOW,
      });
      // A legacy NULL soft-delete flag reads as live (NULL-safe inclusion).
      await createTestEvaluation(tx, student.id, teacherUser.id, sessionRow.id, { score: 70, isDeleted: null });

      const afterViaTx = await PlatformAnalyticsRepository.getRatingStats(tx);
      expect(afterViaTx.sessionRatingsCount).toBe(before.viaTx.sessionRatingsCount + 1);
      expect(afterViaTx.averageSessionRating).not.toBeNull();
      expect(afterViaTx.evaluationScoresCount).toBe(before.viaTx.evaluationScoresCount + 2);
      expect(afterViaTx.averageEvaluationScore).not.toBeNull();

      const afterRaw = await PlatformAnalyticsRepository.getRatingStats();
      expect(afterRaw).toEqual(before.raw);
    });
  });

  test("getHealthIndicators: branch parity on committed state, tx-branch fixture delta, raw-branch isolation", async () => {
    await runInRollback(async tx => {
      const teacherUser = await createTestUser(tx, { role: "teacher" });
      const teacherRow = await createTestTeacherRow(tx, teacherUser.id);
      const walletRow = await createTestWallet(tx, teacherRow.id);
      const student = await seedStudent(tx);

      const before = await probeBothBranches(tx, executor => PlatformAnalyticsRepository.getHealthIndicators(executor));

      await createTestSession(tx, teacherRow.id, student.id, {
        status: SessionStatus.Disputed,
        disputeReason: "probe dispute",
        disputedAt: at(-MINUTE),
      });
      await createTestTeacherTransaction(tx, walletRow.id, null, {
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Pending,
      });
      // A settled earning moves neither health counter.
      await createTestTeacherTransaction(tx, walletRow.id, null, {});

      const afterViaTx = await PlatformAnalyticsRepository.getHealthIndicators(tx);
      expect(afterViaTx.pendingDisputes).toBe(before.viaTx.pendingDisputes + 1);
      expect(afterViaTx.pendingWithdrawals).toBe(before.viaTx.pendingWithdrawals + 1);

      const afterRaw = await PlatformAnalyticsRepository.getHealthIndicators();
      expect(afterRaw).toEqual(before.raw);
    });
  });
});

describe("PlatformAnalyticsRepository — Tier 2: window + lifecycle boundary matrix", () => {
  test("thisWeek starts at ISO Monday 00:00 UTC — a session 1ms before Monday stays out while still counting in the month", async () => {
    await runInRollback(async tx => {
      const teacherRow = await seedTeacher(tx);
      const student = await seedStudent(tx);
      const before = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);

      // Monday 2026-01-05 00:00:00.000 — the ISO week's first instant (counts).
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: utcMidnight("2026-01-05") });
      // Sunday 2026-01-04 23:59:59.999 — 1ms before the ISO Monday (excluded from the week).
      await createTestSession(tx, teacherRow.id, student.id, {
        createdAt: new Date(utcMidnight("2026-01-05").getTime() - MS),
      });
      // Wednesday mid-morning — inside the week, the month, and today.
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: at(-(5 * HOUR + 30 * MINUTE)) });

      const after = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);
      expect(after.total).toBe(before.total + 3);
      expect(after.thisWeek).toBe(before.thisWeek + 2);
      expect(after.thisMonth).toBe(before.thisMonth + 3);
      expect(after.today).toBe(before.today + 1);
    });
  });

  test("thisMonth starts at the first of the month 00:00 UTC — a session 1ms before month start stays out", async () => {
    await runInRollback(async tx => {
      const teacherRow = await seedTeacher(tx);
      const student = await seedStudent(tx);
      const before = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);

      await createTestSession(tx, teacherRow.id, student.id, { createdAt: utcMidnight("2026-01-01") });
      await createTestSession(tx, teacherRow.id, student.id, {
        createdAt: new Date(utcMidnight("2026-01-01").getTime() - MS),
      });

      const after = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);
      expect(after.total).toBe(before.total + 2);
      expect(after.thisMonth).toBe(before.thisMonth + 1);
    });
  });

  test("today excludes a session created 1ms before today-start and one stamped 1ms after the snapshot instant", async () => {
    await runInRollback(async tx => {
      const teacherRow = await seedTeacher(tx);
      const student = await seedStudent(tx);
      const before = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);

      // Exactly at today-start — the boundary is inclusive (counts).
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: utcMidnight("2026-01-07") });
      // 1ms before today-start — excluded from `today`, still in the week/month/total.
      await createTestSession(tx, teacherRow.id, student.id, {
        createdAt: new Date(utcMidnight("2026-01-07").getTime() - MS),
      });
      // 1ms after the snapshot instant — outside every closed window, inside `total`.
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: at(MS) });

      const after = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);
      expect(after.total).toBe(before.total + 3);
      expect(after.today).toBe(before.today + 1);
      expect(after.thisWeek).toBe(before.thisWeek + 2);
      expect(after.thisMonth).toBe(before.thisMonth + 2);
    });
  });

  test("awaitingConfirmation flips on the student-confirmation instant without a status change", async () => {
    await runInRollback(async tx => {
      const teacherRow = await seedTeacher(tx);
      const student = await seedStudent(tx);
      const before = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);

      // Completed but student-confirmed: leaves the awaiting counter immediately.
      await createTestSession(tx, teacherRow.id, student.id, {
        status: SessionStatus.Completed,
        startedAt: at(-2 * HOUR),
        endedAt: at(-HOUR),
        confirmedByTeacherAt: at(-HOUR),
        confirmedByStudentAt: at(-30 * MINUTE),
        createdAt: at(-2 * HOUR),
      });
      const mid = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);
      expect(mid.completed).toBe(before.completed + 1);
      expect(mid.awaitingConfirmation).toBe(before.awaitingConfirmation);

      // Same completed shape with the confirmation instant still NULL: the flip.
      await createTestSession(tx, teacherRow.id, student.id, {
        status: SessionStatus.Completed,
        startedAt: at(-2 * HOUR),
        endedAt: at(-HOUR),
        confirmedByTeacherAt: at(-HOUR),
        createdAt: at(-2 * HOUR),
      });
      const after = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);
      expect(after.completed).toBe(before.completed + 2);
      expect(after.awaitingConfirmation).toBe(before.awaitingConfirmation + 1);
    });
  });

  test("activeInWindowNow: end at the snapshot instant is out, start at the instant is in, NULL start is in, future start is out", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx, { role: "student" });
      const plan = await createTestPlan(tx);
      const before = await PlatformAnalyticsRepository.getSubscriptionStats(NOW, tx);

      // Open-ended, started yesterday: in window.
      await createTestSubscription(tx, user.id, plan.id, { status: SubscriptionStatus.Active, startDate: at(-DAY) });
      // Status still active but the end date passed 1ms ago: OUT of the window.
      await createTestSubscription(tx, user.id, plan.id, {
        status: SubscriptionStatus.Active,
        startDate: at(-2 * DAY),
        endDate: at(-MS),
      });
      // End date exactly AT the snapshot instant: strict `<` puts it OUT.
      await createTestSubscription(tx, user.id, plan.id, {
        status: SubscriptionStatus.Active,
        startDate: at(-DAY),
        endDate: NOW,
      });
      // Start dated in the future: OUT.
      await createTestSubscription(tx, user.id, plan.id, { status: SubscriptionStatus.Active, startDate: at(DAY) });
      // Start exactly at the snapshot instant: inclusive `<=` puts it IN.
      await createTestSubscription(tx, user.id, plan.id, { status: SubscriptionStatus.Active, startDate: NOW });
      // NULL start reads as starting now: IN.
      await createTestSubscription(tx, user.id, plan.id, { status: SubscriptionStatus.Active, startDate: null });

      const after = await PlatformAnalyticsRepository.getSubscriptionStats(NOW, tx);
      expect(after.total).toBe(before.total + 6);
      expect(after.active).toBe(before.active + 6);
      expect(after.activeInWindowNow).toBe(before.activeInWindowNow + 3);
    });
  });

  test("multi-currency paid payments never merge: per-currency rows ascend by exact decimal strings", async () => {
    await runInRollback(async tx => {
      const student = await seedStudent(tx);
      const before = await PlatformAnalyticsRepository.getRevenueStats(NOW, tx);

      await createTestStudentPayment(tx, student.id, null, {
        amount: "100.00",
        currency: "EGP",
        createdAt: at(-3 * MINUTE),
      });
      await createTestStudentPayment(tx, student.id, null, {
        amount: "25.50",
        currency: "EGP",
        createdAt: at(-2 * MINUTE),
      });
      await createTestStudentPayment(tx, student.id, null, {
        amount: "50.00",
        currency: "USD",
        createdAt: at(-MINUTE),
      });

      const after = await PlatformAnalyticsRepository.getRevenueStats(NOW, tx);
      expectRevenueDelta(before, after, [
        { currency: "EGP", amount: "100.00" },
        { currency: "EGP", amount: "25.50" },
        { currency: "USD", amount: "50.00" },
      ]);

      // Currency rows stay separated and ordered by code — EGP strictly before USD.
      const egpIndex = after.findIndex(row => row.currency === "EGP");
      const usdIndex = after.findIndex(row => row.currency === "USD");
      expect(egpIndex).toBeGreaterThanOrEqual(0);
      expect(usdIndex).toBeGreaterThan(egpIndex);
    });
  });

  test("24h activity boundary: exactly-24h-old is out, inside is in, and only an explicit governance flag excludes", async () => {
    await runInRollback(async tx => {
      const before = await PlatformAnalyticsRepository.countRecentlyActiveUsers(NOW, tx);

      // Boundary edges of the trailing 24h window (strictly after now − 24h).
      await createTestUser(tx, { role: "student", lastActiveAt: at(-24 * HOUR) });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-24 * HOUR + MS) });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-24 * HOUR - MS) });
      // Never-active accounts never count.
      await createTestUser(tx, { role: "student", lastActiveAt: null });
      // Governance exclusions are NULL-safe: only an explicit `true` excludes.
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), isDeleted: true });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), suspended: true });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), isBlocked: true });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), isDeleted: null });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), suspended: null });
      await createTestUser(tx, { role: "student", lastActiveAt: at(-MINUTE), isBlocked: null });

      const after = await PlatformAnalyticsRepository.countRecentlyActiveUsers(NOW, tx);
      expect(after).toBe(before + 4);
    });
  });

  test("session trend 30-day window edges: in-edge inclusive, out-edge 1ms early excluded even in the same daily bucket", async () => {
    await runInRollback(async tx => {
      const teacherRow = await seedTeacher(tx);
      const student = await seedStudent(tx);
      const before = await PlatformAnalyticsRepository.getSessionDailyTrend(NOW, tx);

      // Exactly now − 30d: the window's first instant (counts).
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: at(-30 * DAY) });
      // 1ms earlier: outside the window — and it shares the out-edge day's
      // bucket, so the bucket delta below would read +2 if the edge leaked.
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: at(-30 * DAY - MS) });
      // Exactly at the snapshot instant: the window's last instant (counts).
      await createTestSession(tx, teacherRow.id, student.id, { createdAt: NOW });

      const after = await PlatformAnalyticsRepository.getSessionDailyTrend(NOW, tx);
      expect(bucketCount(after, "2025-12-08")).toBe(bucketCount(before, "2025-12-08") + 1);
      expect(bucketCount(after, "2026-01-07")).toBe(bucketCount(before, "2026-01-07") + 1);
    });
  });

  test("revenue trend 30-day window edges: out-edge payment is absent from the bucket AND the 30-day sum, present in the all-time total", async () => {
    await runInRollback(async tx => {
      const student = await seedStudent(tx);
      const beforeStats = await PlatformAnalyticsRepository.getRevenueStats(NOW, tx);
      const beforeTrend = await PlatformAnalyticsRepository.getRevenueDailyTrend(NOW, tx);

      await createTestStudentPayment(tx, student.id, null, {
        amount: "10.00",
        currency: "EGP",
        createdAt: at(-30 * DAY),
      });
      await createTestStudentPayment(tx, student.id, null, {
        amount: "99.00",
        currency: "EGP",
        createdAt: at(-30 * DAY - MS),
      });
      await createTestStudentPayment(tx, student.id, null, { amount: "5.00", currency: "EGP", createdAt: NOW });

      const afterStats = await PlatformAnalyticsRepository.getRevenueStats(NOW, tx);
      // All-time total and settled count ascend by ALL three created
      // payments (the out-edge row included); the 30-day sum ascends by the
      // in-window amounts only — the out-edge payment is absent there.
      const egpBefore = beforeStats.find(row => row.currency === "EGP");
      const egpAfter = afterStats.find(row => row.currency === "EGP");
      expect(egpAfter).toBeDefined();
      expect(egpAfter?.totalAmount).toBe(sumAmounts(egpBefore?.totalAmount ?? "0.00", "114.00"));
      expect(egpAfter?.paidPaymentsCount).toBe((egpBefore?.paidPaymentsCount ?? 0) + 3);
      expect(egpAfter?.last30DaysAmount).toBe(sumAmounts(egpBefore?.last30DaysAmount ?? "0.00", "15.00"));

      const afterTrend = await PlatformAnalyticsRepository.getRevenueDailyTrend(NOW, tx);
      // The out-edge payment shares the in-edge payment's bucket yet must not
      // contribute to it — the bucket ascends by the in-edge amount only.
      expect(bucketAmount(afterTrend, "2025-12-08", "EGP")).toBe(
        sumAmounts(bucketAmount(beforeTrend, "2025-12-08", "EGP"), "10.00")
      );
      expect(bucketAmount(afterTrend, "2026-01-07", "EGP")).toBe(
        sumAmounts(bucketAmount(beforeTrend, "2026-01-07", "EGP"), "5.00")
      );
    });
  });
});

describe("PlatformAnalyticsRepository — Tier 3: empty-state honesty", () => {
  test("payments with no settled rows contribute nothing: no phantom currency row; strictly EMPTY array when no paid rows exist", async () => {
    await runInRollback(async tx => {
      const student = await seedStudent(tx);
      const paidCount = await committedPaidPaymentCount(tx);
      const before = await PlatformAnalyticsRepository.getRevenueStats(NOW, tx);

      if (paidCount === 0) {
        expect(before).toEqual([]);
      } else {
        expect(before.length).toBeGreaterThan(0);
      }

      // Unsettled payments never mint a currency row — the currency of a
      // pending/failed payment must stay absent from the projection.
      await createTestStudentPayment(tx, student.id, null, {
        amount: "77.00",
        currency: "JPY",
        status: PaymentStatus.Pending,
      });
      await createTestStudentPayment(tx, student.id, null, {
        amount: "88.00",
        currency: "JPY",
        status: PaymentStatus.Failed,
      });

      const after = await PlatformAnalyticsRepository.getRevenueStats(NOW, tx);
      expect(after.find(row => row.currency === "JPY")).toBeUndefined();
      expect(after).toEqual(before);
    });
  });

  test("rating averages stay null-honest while unrated/soft-deleted rows exist; counts expose the rated sample only", async () => {
    await runInRollback(async tx => {
      const teacherUser = await createTestUser(tx, { role: "teacher" });
      const teacherRow = await createTestTeacherRow(tx, teacherUser.id);
      const student = await seedStudent(tx);
      const sessionRow = await createTestSession(tx, teacherRow.id, student.id);

      const committedRatedReports = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(reports)
        .where(isNotNull(reports.studentRatingByTeacher));
      const committedRatedEvaluations = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(evaluations)
        .where(and(isNotNull(evaluations.score), or(eq(evaluations.isDeleted, false), isNull(evaluations.isDeleted))));

      const before = await PlatformAnalyticsRepository.getRatingStats(tx);

      // Rows exist — but neither family gains a RATED sample from them.
      await createTestSessionReport(tx, sessionRow.id, { studentRatingByTeacher: null });
      await createTestEvaluation(tx, student.id, teacherUser.id, sessionRow.id, {
        score: 85,
        isDeleted: true,
        deletedAt: NOW,
      });

      const after = await PlatformAnalyticsRepository.getRatingStats(tx);

      expect(after.sessionRatingsCount).toBe(before.sessionRatingsCount);
      expect(after.evaluationScoresCount).toBe(before.evaluationScoresCount);

      if ((committedRatedReports[0]?.n ?? 0) === 0) {
        expect(after.averageSessionRating).toBeNull();
      }
      if ((committedRatedEvaluations[0]?.n ?? 0) === 0) {
        expect(after.averageEvaluationScore).toBeNull();
      }
    });
  });

  test("an empty session table yields all-zero counters and a sparse-EMPTY trend (zero-fill is the composing service's duty)", async () => {
    await runInRollback(async tx => {
      const committedSessions = await tx.select({ n: sql<number>`count(*)::int` }).from(session);
      const stats = await PlatformAnalyticsRepository.getSessionStats(NOW, tx);
      const trend = await PlatformAnalyticsRepository.getSessionDailyTrend(NOW, tx);

      if ((committedSessions[0]?.n ?? 0) === 0) {
        expect(stats.total).toBe(0);
        expect(stats.today).toBe(0);
        expect(stats.thisWeek).toBe(0);
        expect(stats.thisMonth).toBe(0);
        expect(stats.scheduled).toBe(0);
        expect(stats.started).toBe(0);
        expect(stats.completed).toBe(0);
        expect(stats.cancelled).toBe(0);
        expect(stats.disputed).toBe(0);
        expect(stats.awaitingConfirmation).toBe(0);
        expect(trend).toEqual([]);
      } else {
        expect(stats.total).toBe(committedSessions[0]?.n ?? 0);
        expect(trend.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("PlatformAnalyticsRepository — Tier 4: security / parameterization static scans", () => {
  test("static source scan: zero `--` inside any SQL text (template literals only, comments stripped)", () => {
    const source = stripBlockComments(readImplementationSource());
    const templateBodies = [...source.matchAll(/`([^`]*)`/g)].map(match => match[1] ?? "");
    expect(templateBodies.length).toBeGreaterThan(0);
    for (const body of templateBodies) {
      expect(body.includes("--")).toBe(false);
    }
  });

  test("static source scan: zero prepared statements — no `.prepare(` and no `sql.placeholder` (dynamic aggregate reads)", () => {
    const source = stripBlockComments(readImplementationSource());
    expect(source.includes(".prepare(")).toBe(false);
    expect(source.includes("sql.placeholder")).toBe(false);
  });

  test("static source scan: the global db handle is never imported — the non-tx executor is `queryDb` only", () => {
    // The implementation surface spans the repository file plus its
    // query-helpers module (size-budget split); BOTH must import only
    // `queryDb` from the db barrel — never the global `db` handle.
    const source = readImplementationSource();
    const dbImports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/backend\/db"/g)].map(
      match => match[1] ?? ""
    );
    expect(dbImports.length).toBeGreaterThan(0);
    for (const dbImport of dbImports) {
      const importedNames = dbImport.split(",").map(name => name.trim());
      expect(importedNames).toEqual(["queryDb"]);
    }
  });

  test("static source scan: every raw SQL text is parameterized-only — zero value interpolation, SELECT-only statements", () => {
    const source = stripBlockComments(readImplementationSource());
    const rawSqlTexts = [...source.matchAll(/queryDb[^`]*?\(\s*`([^`]*)`/g)].map(match => match[1] ?? "");
    // Every method's non-tx branch is covered: ten methods, twelve queryDb
    // calls across the repository file and its query-helpers module (the
    // ratings and health readers each run two single-row reads).
    expect(rawSqlTexts).toHaveLength(12);
    for (const text of rawSqlTexts) {
      // Values bind as `$n` parameters — never interpolated into the text.
      // A text with zero `$n` binds must be a predicate-free constant
      // aggregate (nothing dynamic to bind); any WHERE clause binds.
      expect(/[$]\{/.test(text)).toBe(false);
      expect(text.trimStart().startsWith("SELECT")).toBe(true);
      expect(/[$]\d+/.test(text) || !/\bWHERE\b/.test(text)).toBe(true);
    }
  });

  test("static source scan: enum predicates ride VALUE imports — never `import type` on enum modules", () => {
    const source = readImplementationSource();
    const enumModules = [
      "payment-gateway.enum",
      "payment-status.enum",
      "subscription-status.enum",
      "transaction-status.enum",
      "transaction-type.enum",
      "session-status.enum",
    ];
    for (const enumModule of enumModules) {
      const imported =
        source.includes(`@/backend/enum/billing/${enumModule}`) ||
        source.includes(`@/backend/enum/scheduling/${enumModule}`);
      expect(imported).toBe(true);
    }
    expect(/import\s+type\s*\{[^}]*\}\s*from\s*"@\/backend\/enum\//.test(source)).toBe(false);
  });

  test("static source scan: exactly ten dual branches — every method branches on `tx`, every non-tx branch routes through queryDb", () => {
    const source = stripBlockComments(readImplementationSource());
    expect([...source.matchAll(/if \(tx\) \{/g)]).toHaveLength(10);
    expect([...source.matchAll(/await queryDb/g)]).toHaveLength(12);
  });

  test("static source scan: every public method ends with the optional trailing `tx?: DBTransaction` parameter", () => {
    const source = readRepoSource();
    const methodSignatures = [
      /countRecentlyActiveUsers\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getSessionStats\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getSessionDailyTrend\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getRevenueStats\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getRevenueDailyTrend\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getSubscriptionStats\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /countOfflineActivations\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getTeacherPresenceStats\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getRatingStats\([\s\S]*?tx\?:\s*DBTransaction\)/,
      /getHealthIndicators\([\s\S]*?tx\?:\s*DBTransaction\)/,
    ];
    for (const signaturePattern of methodSignatures) {
      expect(signaturePattern.test(source)).toBe(true);
    }
  });
});

describe("PlatformAnalyticsRepository — users-section substrate type conformance", () => {
  test("the ten user counters arrive verbatim from the existing stats read, with `recentlyActive24h` as the additive eleventh", async () => {
    await runInRollback(async tx => {
      const stats = await AdminUserRepository.getStats(tx);
      const expectedKeys: readonly (keyof AdminUserStatsReturnType)[] = [
        "totalCount",
        "activeCount",
        "suspendedCount",
        "blockedCount",
        "deletedCount",
        "adminsCount",
        "teachersCount",
        "studentsCount",
        "parentsCount",
        "newThisWeekCount",
      ];
      expect(Object.keys(stats).toSorted((a, b) => a.localeCompare(b))).toEqual(
        [...expectedKeys].toSorted((a, b) => a.localeCompare(b))
      );

      const recentlyActive = await PlatformAnalyticsRepository.countRecentlyActiveUsers(NOW, tx);
      expect(typeof recentlyActive).toBe("number");
      expect(Number.isInteger(recentlyActive)).toBe(true);
    });
  });
});
