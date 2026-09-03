/**
 * Journey suite — `adminPlatformAnalytics` snapshot (DEV3-022c), Journeys A–D.
 *
 * One shared file for the four read-side journeys of the platform-analytics
 * ticket (per `test/workflows/AGENTS.md` rule 10 and plan tasks 2.1–2.4):
 *
 *  - Journey A — Cold platform honesty: an admin-only cast reads the
 *    snapshot with ZERO journey-owned fixtures in flight; every
 *    journey-owned metric equals the pre-suite baseline captured by DIRECT
 *    DB counts (never assumed zero — the shared test DB holds whatever it
 *    holds), the session trend is a fully populated 30-bucket UTC-midnight
 *    skeleton, and both rating families keep their honest null/avg duality.
 *  - Journey B — Full cast observation: a student + certified-teacher +
 *    parent cast observes committed fixtures (ACTIVE-window subscription,
 *    EGP + USD paid payments today, an offline-cash activation, five
 *    sessions in the four lifecycle statuses, a rated report, a scored
 *    evaluation, a pending withdrawal) and the read moves by EXACT deltas.
 *  - Journey C — Freshness evolution (anti-cache proof): two sequential
 *    reads with a committed mutation between them move the counters by
 *    exactly the mutation's deltas, `generatedAt` is strictly
 *    non-decreasing, and the trend re-reflects the state at each read's
 *    OWN captured `now` — no caching layer anywhere (REQ-062).
 *  - Journey D — Denial & purity matrix: the deterministic PRE-TX denial
 *    chain (anonymous/malformed → absent → non-admin → governed
 *    deleted → blocked → suspended) denies with the mapped error, exactly
 *    ONE bounded domain log per denial, zero aggregate reads; the happy
 *    path is a pure read (whole-suite `audit_logs` delta == 0, zero
 *    notification rows, consecutive reads structurally identical apart
 *    from `generatedAt`).
 *
 * Per `test/workflows/AGENTS.md`:
 *  - Committed fixtures in `beforeAll` (NO `runInRollback`); tracked
 *    hard-delete in `afterAll` via `journeyCleanup` plus the suite-owned
 *    ledger for the non-user fixture rows.
 *  - Permissions resolve via REAL role context — every actor holds a real
 *    `users.role` + role-child row (NEVER monkey-patched, NEVER
 *    scope-stubbed); denial probes hit the REAL service gate.
 *  - Log assertions use `Bun.spyOn(logger, "logDomainError")` (the
 *    logger-mock preload silences console output, the spy counts calls).
 *  - Denial assertions use a try/catch helper + translated substrings from
 *    `getServerTranslations("en").errorsTranslations` — NEVER
 *    `expect(...).rejects.toThrow()`, never raw key echoes.
 *
 * REBUILD NOTE: the catastrophe wipe destroyed the original test-first RED
 * phase; this rebuilt file was authored after the repository/service landed
 * (commit 68db51c) and is GREEN by construction. The inversion is recorded
 * in the task outcome file — no RED state is claimed here.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/backend/db";
import { AdminUserRepository } from "@/backend/db/repo";
import { utcDayStart } from "@/backend/db/repo/admin/platform-analytics-boundaries";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { plans } from "@/backend/db/schema/billing/plans";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { notifications } from "@/backend/db/schema/notifications/notifications";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestAdmin,
  createTestEvaluation,
  createTestPlan,
  createTestSession,
  createTestSessionReport,
  createTestStudentPayment,
  createTestSubscription,
  createTestTeacherRow,
  createTestTeacherTransaction,
  createTestUser,
  createTestWallet,
} from "@/backend/db/test/entity-setup";
import {
  PaymentGateway,
  PaymentStatus,
  SubscriptionStatus,
  TransactionStatus,
  TransactionType,
} from "@/backend/enum/billing";
import { SessionStatus } from "@/backend/enum/scheduling";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { PlatformAnalyticsService } from "@/backend/services/admin";
import type { DBTransaction, PlatformAnalyticsReturnType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import {
  ANONYMOUS_ACTOR_ID,
  createJourneyFixtures,
  type JourneyFixtureBundle,
  journeyCleanup,
} from "@/test/workflows/helpers";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** Per-run unique prefix (users.email unique index safety — AGENTS rule 3). */
const PREFIX = `jrn_analytics_${randomUUID().slice(0, 8)}`;

/** Milliseconds in one day — relative fixture arithmetic (REQ-026). */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The trailing offline-activation payment-gateway members (B.9/INV-PAY5) —
 * mirrored as VALUE imports for the direct-SQL oracle (never raw strings).
 */
const OFFLINE_GATEWAYS = [PaymentGateway.OfflineCash, PaymentGateway.BankTransfer, PaymentGateway.Scholarship] as const;

// ─── Suite-scope state ──────────────────────────────────────────────────────

let bundle: JourneyFixtureBundle;
/** Governed admins for the Journey D precedence probes (one state each). */
let adminDeletedId = 0;
let adminBlockedId = 0;
let adminSuspendedId = 0;
/** A second certified teacher (offline) — cast-level fixture for Journey B. */
let secondCertifiedTeacherId = 0;
/** Whole-suite read-purity baselines (captured after cast provisioning). */
let suiteAuditRows = 0;
let suiteNotificationRows = 0;
/**
 * Suite-owned NON-user fixture rows (sessions/reports/evaluations/payments/
 * subscriptions/wallets/transactions/plans) created by Journey B/C —
 * `journeyCleanup` only deletes user-rooted trees, so the suite deletes
 * these explicitly (children first) before `journeyCleanup` runs.
 */
const ownedRows = {
  sessionIds: [] as number[],
  reportIds: [] as number[],
  evaluationIds: [] as number[],
  paymentIds: [] as number[],
  subscriptionIds: [] as number[],
  planIds: [] as number[],
  walletIds: [] as number[],
  transactionIds: [] as number[],
};

// ─── Direct-DB count oracles (never routed through the repo under test) ─────

/** Counts every row of a table (independent delta oracle). */
async function countRows(table: PgTable): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(table);
  return rows[0]?.count ?? 0;
}

/** Counts all `audit_logs` rows (read-purity delta oracle). */
async function countAuditRows(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
  return rows[0]?.count ?? 0;
}

/** Counts all `notifications` rows (read-purity delta oracle). */
async function countNotificationRows(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(notifications);
  return rows[0]?.count ?? 0;
}

/**
 * NULL-safe governance exclusion chain shared by the presence oracles —
 * mirrors `coalesce(col,false)=false` exactly (legacy NULL reads as
 * not-set).
 */
function governanceClean(): SQL[] {
  return [
    sql`coalesce(${users.isDeleted}, false) = false`,
    sql`coalesce(${users.suspended}, false) = false`,
    sql`coalesce(${users.isBlocked}, false) = false`,
  ];
}

/** Oracle: users eligible for the 24h presence counter (strict `>` cutoff). */
async function oracleRecentlyActive(cutoff: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(gt(users.lastActiveAt, cutoff), ...governanceClean()));
  return rows[0]?.count ?? 0;
}

/** Oracle: sessions in the UTC window starting at `from` (createdAt >=). */
async function oracleSessionsSince(from: Date): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(session).where(gt(session.createdAt, from));
  return rows[0]?.count ?? 0;
}

/** Oracle: paid payments per currency → exact cents (BigInt). */
async function oraclePaidTotalsByCurrency(): Promise<Map<string, bigint>> {
  const rows: Array<{ currency: string; total: string }> = await db
    .select({
      currency: studentPayments.currency,
      total: sql<string>`coalesce(sum(${studentPayments.amount}), 0)::text`,
    })
    .from(studentPayments)
    .where(eq(studentPayments.status, PaymentStatus.Paid))
    .groupBy(studentPayments.currency);
  return new Map(rows.map(row => [row.currency, centsOf(row.total)]));
}

/** Oracle: offline-activation SUBSCRIPTIONS (the three payment-method members — B.9/INV-PAY5; status-independent). */
async function oracleOfflineActivations(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(inArray(subscriptions.paymentMethod, [...OFFLINE_GATEWAYS]));
  return rows[0]?.count ?? 0;
}

/** Oracle: certified / online teacher counters (NULL-safe booleans). */
async function oracleTeacherPresence(): Promise<{ certified: number; online: number }> {
  const rows = await db
    .select({
      certified: sql<number>`count(*) filter (where coalesce(${teacher.isApproved}, false) = true)::int`,
      online: sql<number>`count(*) filter (where coalesce(${teacher.isApproved}, false) = true AND coalesce(${teacher.isOnline}, false) = true)::int`,
    })
    .from(teacher);
  return { certified: rows[0]?.certified ?? 0, online: rows[0]?.online ?? 0 };
}

/** Oracle: non-null rating family over reports (sum/count in BigInt). */
async function oracleReportRatings(): Promise<{ sum: bigint; count: bigint }> {
  const rows = await db
    .select({
      sum: sql<string>`coalesce(sum(${reports.studentRatingByTeacher}), 0)::text`,
      count: sql<number>`count(${reports.studentRatingByTeacher})::int`,
    })
    .from(reports);
  return { sum: BigInt(rows[0]?.sum ?? "0"), count: BigInt(rows[0]?.count ?? 0) };
}

/** Oracle: non-null score family over NON-deleted evaluations. */
async function oracleEvaluationScores(): Promise<{ sum: bigint; count: bigint }> {
  const rows = await db
    .select({
      sum: sql<string>`coalesce(sum(${evaluations.score}), 0)::text`,
      count: sql<number>`count(${evaluations.score})::int`,
    })
    .from(evaluations)
    .where(sql`coalesce(${evaluations.isDeleted}, false) = false`);
  return { sum: BigInt(rows[0]?.sum ?? "0"), count: BigInt(rows[0]?.count ?? 0) };
}

/** Oracle: disputed sessions / pending withdrawals (health family). */
async function oracleHealth(): Promise<{ disputes: number; withdrawals: number }> {
  const [disputeRows, withdrawalRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(session).where(eq(session.status, SessionStatus.Disputed)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(teacherTransaction)
      .where(
        and(
          eq(teacherTransaction.type, TransactionType.Withdrawal),
          eq(teacherTransaction.status, TransactionStatus.Pending)
        )
      ),
  ]);
  return { disputes: disputeRows[0]?.count ?? 0, withdrawals: withdrawalRows[0]?.count ?? 0 };
}

// ─── Exact-money + rounding oracles (BigInt, never float) ───────────────────

/** Parses an exact decimal string into integer cents (BigInt arithmetic). */
function centsOf(amount: string): bigint {
  const negative = amount.startsWith("-");
  const body = negative ? amount.slice(1) : amount;
  const [whole = "0", frac = ""] = body.split(".");
  const frac2 = `${frac}00`.slice(0, 2);
  const value = BigInt(whole) * 100n + BigInt(frac2 || "0");
  return negative ? -value : value;
}

/**
 * Replicates PG `round(avg(col)::numeric, 2)::float8` with exact integer
 * math (half-away-from-zero at the 2nd decimal) — identical bits for the
 * non-negative integer rating/score domain. `null` for an empty family.
 */
function numericRound2(sum: bigint, count: bigint): number | null {
  if (count === 0n) {
    return null;
  }
  const scaled = sum * 100n;
  const rounded = (scaled * 2n + count) / (count * 2n);
  return Number(rounded) / 100;
}

// ─── Denial + snapshot comparison helpers ───────────────────────────────────

/**
 * Runs `fn` under a `logDomainError` spy, captures BOTH the thrown error
 * (denial probes throw by design) and the logged contexts, and restores
 * the spy. The calls snapshot is taken BEFORE `mockRestore` — restoring
 * clears the recorded history. One service call per probe: the captured
 * log count and the error always belong to the SAME invocation.
 */
async function probeDenial(
  fn: () => Promise<unknown>
): Promise<{ error: Error | null; logs: Array<{ code: string; entity: string; entityId: number; locale: string }> }> {
  const spy = spyOn(logger, "logDomainError");
  let error: Error | null = null;
  try {
    try {
      await fn();
    } catch (caught) {
      if (caught instanceof Error) {
        error = caught;
      } else {
        error = new Error(`non-Error rejection: ${JSON.stringify(caught)}`);
      }
    }
    const logs = spy.mock.calls.map(
      call => call[1] as { code: string; entity: string; entityId: number; locale: string }
    );
    return { error, logs };
  } finally {
    spy.mockRestore();
  }
}

/** Strips `generatedAt` for the structural byte-identity comparison. */
function stableSnapshotJson(snapshot: PlatformAnalyticsReturnType): string {
  const { generatedAt: _generatedAt, ...rest } = snapshot;
  return JSON.stringify(rest);
}

/**
 * Indexes a revenue trend grid by `bucketMs|currency` → cents, for the
 * before/after delta comparisons (currencies never merge — REQ-023).
 */
function revenueGridIndex(snapshot: PlatformAnalyticsReturnType): Map<string, bigint> {
  const index = new Map<string, bigint>();
  for (const point of snapshot.revenueTrendDaily) {
    const key = `${point.bucketStart.getTime()}|${point.currency}`;
    index.set(key, (index.get(key) ?? 0n) + centsOf(point.amount));
  }
  return index;
}

/** Indexes a session trend by bucket → count. */
function sessionTrendIndex(snapshot: PlatformAnalyticsReturnType): Map<number, number> {
  const index = new Map<number, number>();
  for (const point of snapshot.sessionTrendDaily) {
    index.set(point.bucketStart.getTime(), (index.get(point.bucketStart.getTime()) ?? 0) + point.sessionCount);
  }
  return index;
}

// ─── Lifecycle: cast + governed admins + purity baselines ───────────────────

beforeAll(async () => {
  bundle = await createJourneyFixtures(PREFIX);

  // Journey D's governed admins — created INSIDE one committing transaction
  // with their governance state set at creation (real rows, real states).
  await db.transaction(async (tx: DBTransaction) => {
    // Journey D's governed admins — created with their governance state set
    // at creation (real rows, real states).
    const deletedUser = await createTestUser(tx, { role: "admin", isDeleted: true });
    await createTestAdmin(tx, deletedUser.id);
    adminDeletedId = deletedUser.id;

    const blockedUser = await createTestUser(tx, { role: "admin", isBlocked: true });
    await createTestAdmin(tx, blockedUser.id);
    adminBlockedId = blockedUser.id;

    const suspendedUser = await createTestUser(tx, { role: "admin", suspended: true });
    await createTestAdmin(tx, suspendedUser.id);
    adminSuspendedId = suspendedUser.id;

    // Journey B's second certified teacher (offline) — provisioned at cast
    // level so the journey's fixture transaction creates NO user rows and
    // the users-section counters hold their baselines exactly.
    const secondTeacherUser = await createTestUser(tx, { role: "teacher" });
    await createTestTeacherRow(tx, secondTeacherUser.id, { isApproved: true, isOnline: false });
    secondCertifiedTeacherId = secondTeacherUser.id;
  });
  bundle.registry.trackUserId(adminDeletedId);
  bundle.registry.trackUserId(adminBlockedId);
  bundle.registry.trackUserId(adminSuspendedId);
  bundle.registry.trackUserId(secondCertifiedTeacherId);

  // Whole-suite read-purity baselines (Journey D final step compares).
  suiteAuditRows = await countAuditRows();
  suiteNotificationRows = await countNotificationRows();
});

afterAll(async () => {
  // 1) Immutable-table deletes (student_payments / teacher_transaction carry
  // BEFORE DELETE immutability triggers — migration 3) run OUTSIDE the
  // transaction under the same trigger-suspension discipline
  // `journeyCleanup` applies to audit_logs: discovered triggers are
  // disabled, the delete runs, every trigger returns to its EXACT prior
  // firing state. Test-harness cleanup only — production never deletes here.
  const suspendDeletes = async <T>(table: string, fn: () => Promise<T>): Promise<T> => {
    const discovered = await db.execute<{ tgname: string; tgenabled: string }>(
      sql`SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = ${table}::regclass AND NOT tgisinternal`
    );
    await Promise.all(
      discovered.rows.map(trigger =>
        db.execute(sql`ALTER TABLE ${sql.identifier(table)} DISABLE TRIGGER ${sql.identifier(trigger.tgname)}`)
      )
    );
    try {
      return await fn();
    } finally {
      // Restore the EXACT prior firing state — a trigger that was already
      // disabled ('D') stays disabled (the DISABLE above was a no-op).
      await Promise.all(
        discovered.rows.map(trigger =>
          trigger.tgenabled === "D"
            ? db.execute(sql`ALTER TABLE ${sql.identifier(table)} DISABLE TRIGGER ${sql.identifier(trigger.tgname)}`)
            : db.execute(sql`ALTER TABLE ${sql.identifier(table)} ENABLE TRIGGER ${sql.identifier(trigger.tgname)}`)
        )
      );
    }
  };
  if (ownedRows.paymentIds.length > 0) {
    await suspendDeletes("student_payments", () =>
      db.delete(studentPayments).where(inArray(studentPayments.id, ownedRows.paymentIds))
    );
  }
  if (ownedRows.transactionIds.length > 0) {
    await suspendDeletes("teacher_transaction", () =>
      db.delete(teacherTransaction).where(inArray(teacherTransaction.id, ownedRows.transactionIds))
    );
  }

  // 2) Trigger-free fixture rows (children → parents), then the tracked
  // user tree via journeyCleanup. Wallets cascade from the teachers/users
  // delete; the ledger rows above are gone by then, so the RESTRICT FK on
  // teacher_transaction.wallet_id is satisfied.
  await db.transaction(async (tx: DBTransaction) => {
    if (ownedRows.reportIds.length > 0) {
      await tx.delete(reports).where(inArray(reports.id, ownedRows.reportIds));
    }
    if (ownedRows.sessionIds.length > 0) {
      await tx.delete(session).where(inArray(session.id, ownedRows.sessionIds));
    }
    if (ownedRows.evaluationIds.length > 0) {
      await tx.delete(evaluations).where(inArray(evaluations.id, ownedRows.evaluationIds));
    }
    if (ownedRows.subscriptionIds.length > 0) {
      await tx.delete(subscriptions).where(inArray(subscriptions.id, ownedRows.subscriptionIds));
    }
    if (ownedRows.planIds.length > 0) {
      await tx.delete(plans).where(inArray(plans.id, ownedRows.planIds));
    }
  });
  await journeyCleanup(bundle.registry);
});

// ─── Journey A — Cold platform honesty ──────────────────────────────────────

describe("Journey A — cold platform honesty (baseline + 0)", () => {
  test("admin read equals the direct-DB baseline with zero journey-owned deltas", async () => {
    const adminId = bundle.cast.admin.user.id;

    // Direct-DB baselines — whatever the shared DB holds is the truth.
    const [usersTotal, recent24h, paidTotals, offline, presence, reportRatings, evaluationScores, health] =
      await Promise.all([
        countRows(users),
        oracleRecentlyActive(new Date(Date.now() - ONE_DAY_MS)),
        oraclePaidTotalsByCurrency(),
        oracleOfflineActivations(),
        oracleTeacherPresence(),
        oracleReportRatings(),
        oracleEvaluationScores(),
        oracleHealth(),
      ]);

    const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);

    // Users section: the reused DEV3-016 stats EXACTLY, plus the 24h
    // presence counter (composition identity, REQ-002 + B.15). getStats is
    // transaction-bound, so the oracle runs it inside a read-only tx.
    const stats = await db.transaction(async tx => AdminUserRepository.getStats(tx));
    expect(snapshot.users).toEqual({ ...stats, recentlyActive24h: recent24h });
    expect(snapshot.users.totalCount).toBe(usersTotal);

    // Sessions: cold platform = no journey-owned sessions → the read's
    // window counters equal the direct DB baselines.
    const dayStart = utcDayStart(snapshot.generatedAt);
    expect(snapshot.sessions.today).toBe(await oracleSessionsSince(dayStart));
    expect(snapshot.sessions.total).toBe(await countRows(session));

    // Revenue: per-currency paid totals equal the oracle map exactly
    // (currencies never merge — one row per currency).
    const readTotals = new Map(
      snapshot.revenue.gatewayRevenueByCurrency.map(row => [row.currency, centsOf(row.totalAmount)])
    );
    expect(readTotals).toEqual(paidTotals);
    expect(snapshot.revenue.offlineActivationsCount).toBe(offline);

    // Teachers: NULL-safe certified/online counters.
    expect(snapshot.teachers.certifiedCount).toBe(presence.certified);
    expect(snapshot.teachers.onlineNowCount).toBe(presence.online);

    // Ratings: honest duality — null ⟺ empty family (never fabricated 0),
    // otherwise the EXACT rounded average.
    expect(snapshot.ratings.sessionRatingsCount).toBe(Number(reportRatings.count));
    expect(snapshot.ratings.averageSessionRating === null).toBe(reportRatings.count === 0n);
    if (reportRatings.count > 0n) {
      expect(snapshot.ratings.averageSessionRating).toBe(numericRound2(reportRatings.sum, reportRatings.count));
    }
    expect(snapshot.ratings.evaluationScoresCount).toBe(Number(evaluationScores.count));
    expect(snapshot.ratings.averageEvaluationScore === null).toBe(evaluationScores.count === 0n);
    if (evaluationScores.count > 0n) {
      expect(snapshot.ratings.averageEvaluationScore).toBe(numericRound2(evaluationScores.sum, evaluationScores.count));
    }

    // Health: disputed sessions + pending withdrawals.
    expect(snapshot.health.pendingDisputes).toBe(health.disputes);
    expect(snapshot.health.pendingWithdrawals).toBe(health.withdrawals);
  });

  test("sessionTrendDaily is a fully populated 30-bucket UTC-midnight skeleton; revenueTrendDaily is skeleton-consistent", async () => {
    const adminId = bundle.cast.admin.user.id;
    const snapshot = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);

    // 30 consecutive UTC-midnight buckets ending at the read's own day.
    expect(snapshot.sessionTrendDaily).toHaveLength(30);
    const lastBucket = utcDayStart(snapshot.generatedAt).getTime();
    for (const [index, point] of snapshot.sessionTrendDaily.entries()) {
      expect(point.bucketStart.getTime()).toBe(lastBucket - (29 - index) * ONE_DAY_MS);
      expect(Number.isInteger(point.sessionCount)).toBe(true);
      expect(point.sessionCount).toBeGreaterThanOrEqual(0);
    }
    // The last bucket equals the direct window oracle (today's sessions).
    const lastIndex = sessionTrendIndex(snapshot);
    expect(lastIndex.get(lastBucket)).toBe(await oracleSessionsSince(new Date(lastBucket)));

    // Revenue trend: either EMPTY (window honesty — no currency with paid
    // volume inside 30 days) or a full 30-bucket grid per discovered
    // currency; every amount is a non-negative decimal string and every
    // bucket lands on a UTC midnight within the 30-day skeleton.
    const currencies = new Set(snapshot.revenueTrendDaily.map(point => point.currency));
    if (currencies.size === 0) {
      expect(snapshot.revenueTrendDaily).toHaveLength(0);
    } else {
      expect(snapshot.revenueTrendDaily).toHaveLength(30 * currencies.size);
    }
    for (const point of snapshot.revenueTrendDaily) {
      expect(point.amount).toMatch(/^\d+(\.\d+)?$/);
      const offsetDays = (lastBucket - point.bucketStart.getTime()) / ONE_DAY_MS;
      expect(Number.isInteger(offsetDays)).toBe(true);
      expect(offsetDays).toBeGreaterThanOrEqual(0);
      expect(offsetDays).toBeLessThanOrEqual(29);
    }
  });

  test("cold read is silent: zero domain logs on the happy path", async () => {
    const adminId = bundle.cast.admin.user.id;
    const cold = await probeDenial(() => PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE));
    expect(cold.error).toBeNull();
    expect(cold.logs).toHaveLength(0);
  });
});

// ─── Journey B — Full cast observation ──────────────────────────────────────

describe("Journey B — full cast observation (exact deltas)", () => {
  test("committed fixtures move every journey-owned metric by exactly the fixture deltas", async () => {
    const adminId = bundle.cast.admin.user.id;
    const now = new Date();

    // Baseline read BEFORE the cast's fixtures are committed.
    const before = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);
    const beforeGrid = revenueGridIndex(before);
    const beforeTrend = sessionTrendIndex(before);
    const [beforeReportRatings, beforeEvaluationScores] = await Promise.all([
      oracleReportRatings(),
      oracleEvaluationScores(),
    ]);

    // The cast: student + certified teachers + parent (parent linked to the
    // student's family only via presence here — the snapshot is anonymous).
    const studentActor = bundle.cast.student;
    const teacherOnlineActor = bundle.cast.certifiedTeacher;

    // Journey B commits ALL fixtures inside ONE transaction (AGENTS rule 2).
    await db.transaction(async (tx: DBTransaction) => {
      // Subscriptions: one ACTIVE-window subscription for the student, paid
      // through an OFFLINE gateway — this single fixture moves BOTH the
      // ACTIVE-window counters (+1 active / +1 active-in-window) and the
      // offline-activation counter (+1; B.9/INV-PAY5 counts
      // subscriptions.paymentMethod, status-independent).
      const plan = await createTestPlan(tx, { price: "300.00", currency: "EGP" });
      ownedRows.planIds.push(plan.id);
      const subscription = await createTestStudentSubscription(
        tx,
        studentActor.user.id,
        plan.id,
        now,
        PaymentGateway.OfflineCash
      );
      ownedRows.subscriptionIds.push(subscription.id);

      // Payments: paid EGP today + paid USD today (relative to `now`).
      const egpPayment = await createTestStudentPayment(tx, studentActor.user.id, {
        amount: "100.00",
        currency: "EGP",
        status: PaymentStatus.Paid,
        createdAt: new Date(now.getTime() - 5 * 60_000),
      });
      const usdPayment = await createTestStudentPayment(tx, studentActor.user.id, {
        amount: "50.00",
        currency: "USD",
        status: PaymentStatus.Paid,
        createdAt: new Date(now.getTime() - 4 * 60_000),
      });
      ownedRows.paymentIds.push(egpPayment.id, usdPayment.id);

      // Teachers: the certified cast teacher goes ONLINE (the second
      // certified teacher provisioned at cast level stays offline).
      await tx.update(teacher).set({ isOnline: true }).where(eq(teacher.id, teacherOnlineActor.user.id));

      // Sessions: five fixtures — four `today`, the cancelled one backdated
      // outside the 30-day trend window (mapping recorded in the outcome:
      // today/week/month each +4; total +5; trend +4 in the last bucket).
      const completedConfirmed = await createTestSession(tx, teacherOnlineActor.user.id, studentActor.user.id, {
        status: SessionStatus.Completed,
        createdAt: new Date(now.getTime() - 6 * 60_000),
        confirmedByStudentAt: new Date(now.getTime() - 60_000),
      });
      const completedUnconfirmed = await createTestSession(tx, teacherOnlineActor.user.id, studentActor.user.id, {
        status: SessionStatus.Completed,
        createdAt: new Date(now.getTime() - 7 * 60_000),
      });
      const disputed = await createTestSession(tx, teacherOnlineActor.user.id, studentActor.user.id, {
        status: SessionStatus.Disputed,
        createdAt: new Date(now.getTime() - 8 * 60_000),
      });
      const scheduled = await createTestSession(tx, teacherOnlineActor.user.id, studentActor.user.id, {
        status: SessionStatus.Scheduled,
        createdAt: new Date(now.getTime() - 9 * 60_000),
      });
      const cancelledBackdated = await createTestSession(tx, teacherOnlineActor.user.id, studentActor.user.id, {
        status: SessionStatus.Cancelled,
        createdAt: new Date(now.getTime() - 40 * ONE_DAY_MS),
      });
      ownedRows.sessionIds.push(
        completedConfirmed.id,
        completedUnconfirmed.id,
        disputed.id,
        scheduled.id,
        cancelledBackdated.id
      );

      // Ratings: one report rating on the completed session.
      const report = await createTestSessionReport(tx, completedConfirmed.id, { studentRatingByTeacher: 4 });
      ownedRows.reportIds.push(report.id);

      // Evaluations: one score on the student.
      const evaluation = await createTestEvaluation(tx, studentActor.user.id, teacherOnlineActor.user.id, {
        score: 90,
      });
      ownedRows.evaluationIds.push(evaluation.id);

      // Health: a pending withdrawal against the online teacher's wallet.
      const wallet = await createTestWallet(tx, teacherOnlineActor.user.id);
      ownedRows.walletIds.push(wallet.id);
      const withdrawal = await createTestTeacherTransaction(tx, wallet.id, {
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Pending,
        amount: "50.00",
      });
      ownedRows.transactionIds.push(withdrawal.id);
    });

    const after = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);

    // Sessions: +5 total, +4 today/week/month, +1 per seeded status,
    // awaitingConfirmation +1 (only the completed-unconfirmed fixture).
    expect(after.sessions.total).toBe(before.sessions.total + 5);
    expect(after.sessions.today).toBe(before.sessions.today + 4);
    expect(after.sessions.thisWeek).toBe(before.sessions.thisWeek + 4);
    expect(after.sessions.thisMonth).toBe(before.sessions.thisMonth + 4);
    expect(after.sessions.scheduled).toBe(before.sessions.scheduled + 1);
    expect(after.sessions.completed).toBe(before.sessions.completed + 2);
    expect(after.sessions.cancelled).toBe(before.sessions.cancelled + 1);
    expect(after.sessions.disputed).toBe(before.sessions.disputed + 1);
    expect(after.sessions.awaitingConfirmation).toBe(before.sessions.awaitingConfirmation + 1);

    // Independent oracle cross-check of the today window (direct SQL).
    expect(after.sessions.today).toBe(await oracleSessionsSince(utcDayStart(after.generatedAt)));

    // Users section: the cast creates NO new users → all ten counters and
    // the 24h presence counter hold their baseline values.
    expect(after.users).toEqual(before.users);

    // Revenue: EGP +100.00, USD +50.00; offline activations +1 (the
    // offline-cash subscription); per-currency rows never merge.
    const beforeTotals = new Map(
      before.revenue.gatewayRevenueByCurrency.map(row => [row.currency, centsOf(row.totalAmount)])
    );
    const afterTotals = new Map(
      after.revenue.gatewayRevenueByCurrency.map(row => [row.currency, centsOf(row.totalAmount)])
    );
    expect((afterTotals.get("EGP") ?? 0n) - (beforeTotals.get("EGP") ?? 0n)).toBe(centsOf("100.00"));
    expect((afterTotals.get("USD") ?? 0n) - (beforeTotals.get("USD") ?? 0n)).toBe(centsOf("50.00"));
    expect(after.revenue.offlineActivationsCount).toBe(before.revenue.offlineActivationsCount + 1);
    expect(afterTotals).toEqual(await oraclePaidTotalsByCurrency());

    // Subscriptions: +1 total, +1 active, +1 active-in-window.
    expect(after.subscriptions.total).toBe(before.subscriptions.total + 1);
    expect(after.subscriptions.active).toBe(before.subscriptions.active + 1);
    expect(after.subscriptions.activeInWindowNow).toBe(before.subscriptions.activeInWindowNow + 1);

    // Teachers: BOTH certified teachers were provisioned at cast level
    // (inside the baseline read) — certifiedCount holds; the tx only flips
    // the cast teacher ONLINE (+1 online, still certified).
    const presence = await oracleTeacherPresence();
    expect(after.teachers.certifiedCount).toBe(presence.certified);
    expect(after.teachers.onlineNowCount).toBe(presence.online);
    expect(after.teachers.certifiedCount).toBe(before.teachers.certifiedCount);
    expect(after.teachers.onlineNowCount).toBe(before.teachers.onlineNowCount + 1);

    // Ratings: counts +1 each; averages move to the exact rounded value.
    const reportRatings = await oracleReportRatings();
    expect(after.ratings.sessionRatingsCount).toBe(before.ratings.sessionRatingsCount + 1);
    expect(after.ratings.sessionRatingsCount).toBe(Number(reportRatings.count));
    expect(after.ratings.averageSessionRating).toBe(
      numericRound2(beforeReportRatings.sum + 4n, beforeReportRatings.count + 1n)
    );
    expect(after.ratings.evaluationScoresCount).toBe(before.ratings.evaluationScoresCount + 1);
    expect(after.ratings.averageEvaluationScore).toBe(
      numericRound2(beforeEvaluationScores.sum + 90n, beforeEvaluationScores.count + 1n)
    );

    // Health: +1 disputed, +1 pending withdrawal.
    expect(after.health.pendingDisputes).toBe(before.health.pendingDisputes + 1);
    expect(after.health.pendingWithdrawals).toBe(before.health.pendingWithdrawals + 1);

    // Session trend: identical outside the last bucket; last bucket +4.
    const afterTrend = sessionTrendIndex(after);
    const lastBucket = utcDayStart(after.generatedAt).getTime();
    for (const [bucket, count] of afterTrend) {
      if (bucket === lastBucket) {
        continue;
      }
      expect(count).toBe(beforeTrend.get(bucket) ?? 0);
    }
    expect(afterTrend.get(lastBucket)).toBe((beforeTrend.get(lastBucket) ?? 0) + 4);

    // Revenue trend: full-grid expansion — every (bucket, currency) pair of
    // the after-currency set present; deltas only in the last bucket
    // (EGP +125.00, USD +50.00); new-currency off-window buckets "0".
    const afterGrid = revenueGridIndex(after);
    expect(afterGrid.size).toBe(30 * new Set(after.revenueTrendDaily.map(p => p.currency)).size);
    for (const [key, cents] of afterGrid) {
      const [bucketPart, currency] = key.split("|");
      const bucketMs = Number(bucketPart);
      const beforeCents = beforeGrid.get(key) ?? 0n;
      if (bucketMs === lastBucket && currency === "EGP") {
        expect(cents - beforeCents).toBe(centsOf("100.00"));
      } else if (bucketMs === lastBucket && currency === "USD") {
        expect(cents - beforeCents).toBe(centsOf("50.00"));
      } else {
        expect(cents).toBe(beforeCents);
      }
    }
  });
});

// ─── Journey C — Freshness evolution (anti-cache proof) ─────────────────────

describe("Journey C — freshness evolution (anti-cache proof)", () => {
  test("two reads with a committed mutation between them move by exactly the mutation deltas — no caching", async () => {
    const adminId = bundle.cast.admin.user.id;

    const read1 = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);

    // ONE committed mutation between the reads: a completed+confirmed
    // session created "today" (+1 total/today/week/month/completed).
    await db.transaction(async (tx: DBTransaction) => {
      const created = await createTestSession(tx, bundle.cast.certifiedTeacher.user.id, bundle.cast.student.user.id, {
        status: SessionStatus.Completed,
        createdAt: new Date(read1.generatedAt.getTime() - 30_000),
        confirmedByStudentAt: new Date(read1.generatedAt.getTime() - 20_000),
      });
      ownedRows.sessionIds.push(created.id);
    });

    const read2 = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);

    // generatedAt strictly non-decreasing, and the SECOND read reflects the
    // mutation only in the expected members.
    expect(read2.generatedAt.getTime()).toBeGreaterThanOrEqual(read1.generatedAt.getTime());
    expect(read2.sessions.total).toBe(read1.sessions.total + 1);
    expect(read2.sessions.today).toBe(read1.sessions.today + 1);
    expect(read2.sessions.completed).toBe(read1.sessions.completed + 1);
    expect(read2.sessions.scheduled).toBe(read1.sessions.scheduled);
    expect(read2.revenue.gatewayRevenueByCurrency).toEqual(read1.revenue.gatewayRevenueByCurrency);
    expect(read2.users).toEqual(read1.users);

    // The trend re-reflects the state at EACH read's own captured now: the
    // last bucket gains exactly +1 between the reads.
    const lastBucket1 = utcDayStart(read1.generatedAt).getTime();
    const lastBucket2 = utcDayStart(read2.generatedAt).getTime();
    expect(lastBucket2).toBe(lastBucket1);
    const index1 = sessionTrendIndex(read1);
    const index2 = sessionTrendIndex(read2);
    expect(index2.get(lastBucket2)).toBe((index1.get(lastBucket1) ?? 0) + 1);
    for (const [bucket, count] of index2) {
      if (bucket !== lastBucket2) {
        expect(count).toBe(index1.get(bucket) ?? 0);
      }
    }
  });
});

// ─── Journey D — Denial & purity matrix ─────────────────────────────────────

describe("Journey D — denial & purity matrix", () => {
  test("anonymous/malformed actor ids are rejected pre-DB with UnauthorizedError and exactly one domain log", async () => {
    for (const actorId of [ANONYMOUS_ACTOR_ID, -1, Number.NaN, 2.5]) {
      const { error, logs } = await probeDenial(() => PlatformAnalyticsService.getPlatformAnalytics(actorId, LOCALE));
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error?.message).toContain(tErrors.unauthorized);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.entity).toBe("users");
      expect(logs[0]?.locale).toBe(LOCALE);
    }
  });

  test("an absent actor id is rejected with UnauthorizedError and exactly one domain log", async () => {
    const maxRow = await db.select({ max: sql<number | null>`max(${users.id})` }).from(users);
    const absentId = (maxRow[0]?.max ?? 0) + 10_000;
    const { error, logs } = await probeDenial(() => PlatformAnalyticsService.getPlatformAnalytics(absentId, LOCALE));
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error?.message).toContain(tErrors.unauthorized);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entity).toBe("users");
    expect(logs[0]?.entityId).toBe(absentId);
  });

  test("non-admin actors (student / certified teacher / parent) are FORBIDDEN before any aggregate read", async () => {
    for (const actor of [bundle.cast.student, bundle.cast.certifiedTeacher, bundle.cast.parent]) {
      const { error, logs } = await probeDenial(() =>
        PlatformAnalyticsService.getPlatformAnalytics(actor.user.id, LOCALE)
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error?.message).toContain(tErrors.forbidden);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.entity).toBe("users");
      expect(logs[0]?.entityId).toBe(actor.user.id);
    }
  });

  test("governed admins are denied in the deterministic precedence deleted → blocked → suspended", async () => {
    // Deleted (and NOT blocked, NOT suspended) → accountDeleted branch.
    const deleted = await probeDenial(() => PlatformAnalyticsService.getPlatformAnalytics(adminDeletedId, LOCALE));
    expect(deleted.error).toBeInstanceOf(ForbiddenError);
    expect(deleted.error?.message).toContain(tErrors.accountDeleted);
    expect(deleted.logs).toHaveLength(1);

    // Blocked (NOT deleted, NOT suspended) → accountBlocked branch.
    const blocked = await probeDenial(() => PlatformAnalyticsService.getPlatformAnalytics(adminBlockedId, LOCALE));
    expect(blocked.error).toBeInstanceOf(ForbiddenError);
    expect(blocked.error?.message).toContain(tErrors.accountBlocked);
    expect(blocked.logs).toHaveLength(1);

    // Suspended (NOT deleted, NOT blocked — precedence honesty) →
    // accountSuspended branch.
    const suspended = await probeDenial(() => PlatformAnalyticsService.getPlatformAnalytics(adminSuspendedId, LOCALE));
    expect(suspended.error).toBeInstanceOf(ForbiddenError);
    expect(suspended.error?.message).toContain(tErrors.accountSuspended);
    expect(suspended.logs).toHaveLength(1);
  });

  test("the happy path is a pure read: whole-suite audit/notifications deltas are zero and consecutive reads are structurally identical", async () => {
    const adminId = bundle.cast.admin.user.id;

    // Two consecutive reads with nothing in between — structurally identical
    // apart from `generatedAt` (no hidden writes, no drift).
    const read1 = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);
    const read2 = await PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE);
    expect(stableSnapshotJson(read2)).toBe(stableSnapshotJson(read1));

    // Whole-suite purity: ZERO audit rows and ZERO notification rows were
    // produced by every read and every denial across Journeys A–D.
    expect(await countAuditRows()).toBe(suiteAuditRows);
    expect(await countNotificationRows()).toBe(suiteNotificationRows);

    // The happy path itself stays silent (no domain logs).
    const happy = await probeDenial(() => PlatformAnalyticsService.getPlatformAnalytics(adminId, LOCALE));
    expect(happy.error).toBeNull();
    expect(happy.logs).toHaveLength(0);
  });
});

// ─── Journey B local helper (kept below the suite for readability) ──────────

/**
 * Journey B's ACTIVE-window subscription: `status='active'` with
 * `startDate = now − 1d` and `endDate = now + 30d` (inside the window at
 * the read's captured now — REQ-071 ACTIVE-window semantics).
 */
function createTestStudentSubscription(
  tx: DBTransaction,
  userId: number,
  planId: number,
  now: Date,
  paymentMethod: PaymentGateway
): ReturnType<typeof createTestSubscription> {
  return createTestSubscription(tx, userId, planId, {
    status: SubscriptionStatus.Active,
    startDate: new Date(now.getTime() - ONE_DAY_MS),
    endDate: new Date(now.getTime() + 30 * ONE_DAY_MS),
    paymentMethod,
  });
}
