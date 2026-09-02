/**
 * PlatformAnalyticsRepository tests — 4-layer coverage against the live
 * PostgreSQL instance (`kottaby_test`) inside rolled-back transactions.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every DB test runs inside `runInRollback`; `tx` is passed to EVERY repo
 *    call, entity-setup helper, and direct Drizzle query — except the
 *    dedicated non-`tx` executor-branch coverage (Tier 1 requires BOTH
 *    branches of `tx ?? db`), which runs fixture-free on committed state
 *    only so it can never observe or pollute uncommitted rows.
 *  - Entities are created ONLY via `backend/db/test/entity-setup.ts`
 *    factories — never seed data.
 *  - No `expect(...).rejects.toThrow()`; CHECK-constraint probes use the
 *    `expectRepoError` try/catch helper inside a SAVEPOINT so the outer
 *    transaction stays usable after the rejected INSERT.
 *
 * NOTE (honest sequencing): the repository implementation already existed
 * when this suite was authored (tests were written AFTER impl, not
 * test-first) — there is no recorded RED state. The suite pins the shipped
 * behavior against independent oracles (raw SQL baselines + BigInt decimal
 * math), so a regression flips it RED.
 *
 * Layer map (per task 2.5.TE):
 *  1. Pure helper math — `utcDayStart` / `isoWeekStart` / `utcMonthStart`
 *     UTC-midnight edges: month/week boundaries, Sunday rollback to Monday,
 *     leap day, 1ms-before-boundary, year boundaries. (The suite assumes a
 *     UTC test runner — `date_trunc` buckets are compared against
 *     `utcDayStart`, which only coincides with a naive-timestamp parse under
 *     TZ=UTC, the standard sandbox/CI configuration.)
 *  2. Aggregate fixtures — every one of the ten methods seeded via factories
 *     with EXACT counters (delta-oracle pattern: baseline read → insert →
 *     after read, so committed rows in the shared DB never break the math);
 *     money as exact decimal STRINGS; averages float8 NULLABLE with the
 *     `null ⟺ count 0` honesty relation; enum predicates exercised through
 *     VALUE imports; CHECK bands (rating 0–5, score 0–100) proven at the DB
 *     layer incl. the allowed 0 / 100 boundaries.
 *  3. Window & exclusion semantics — the explicit `now` parameter drives
 *     every window from RELATIVE offsets (the same fixture set flips under a
 *     shifted `now`, proving no SQL `now()` leaks in); ACTIVE-window expiry
 *     with `status='active'`; governance/soft-delete exclusion-chain flips;
 *     legacy NULL-state rows read as counted/not-deleted; 30-day window
 *     edges on both trends (`>= cutoff` in, `cutoff − 1ms` out);
 *     per-(day,currency) GROUP BY with currencies never merged.
 *  4. Contract & purity — no cross-currency sums; the canonical
 *     `AdminUserStatsReturnType` ten-key runtime key set as the superset
 *     base of the analytics users section; explicit-tx passthrough (the tx
 *     sees its own uncommitted rows, the global executor does not); factory
 *     row round-trip (money strings survive verbatim); read purity (zero row
 *     deltas across all ten methods).
 */

import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  PaymentGateway,
  PaymentStatus,
  SubscriptionStatus,
  TransactionStatus,
  TransactionType,
} from "@/backend/enum/billing";
import { SessionStatus } from "@/backend/enum/scheduling";
import {
  isoWeekStart,
  PlatformAnalyticsRepository,
  type RevenueStatsRow,
  type RevenueTrendRow,
  type SessionTrendRow,
  utcDayStart,
  utcMonthStart,
} from "@/backend/db/repo/admin/platform-analytics.repository";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
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
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import type {
  AdminUserStatsReturnType,
  DBTransaction,
  PlatformAnalyticsUsersReturnType,
} from "@/backend/types";

/** Milliseconds in one day — mirrors the repo's window arithmetic unit. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** PostgreSQL SQLSTATE for `check_violation`. */
const PG_CHECK_VIOLATION = "23514";

/** Canonical runtime key set of `AdminUserStatsReturnType` (ten counters). */
const ADMIN_USER_STATS_KEYS = [
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
] as const;

// ─── Independent oracles (never routed through the repo under test) ─────────

/**
 * Parses an exact decimal string ("123.45", "0", "-1.50") into integer
 * cents — the arithmetic stays in BigInt so no value ever crosses a JS
 * float (mirrors the repo's `::text` money discipline).
 */
function centsOf(amount: string): bigint {
  const negative = amount.startsWith("-");
  const body = negative ? amount.slice(1) : amount;
  const [whole = "0", frac = ""] = body.split(".");
  const frac2 = `${frac}00`.slice(0, 2);
  const value = BigInt(whole) * 100n + BigInt(frac2 || "0");
  return negative ? -value : value;
}

/** Formats integer cents back to the exact 2-decimal string shape. */
function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Replicates the repo's `round(avg(col)::numeric, 2)::float8` with EXACT
 * integer math: half-away-from-zero rounding of `sum/count` to 2 decimals,
 * then the nearest-double conversion — identical bits to the SQL result for
 * non-negative integer sums (the rating/score domain), with no float drift.
 * Returns `null` for an empty family (honest emptiness, REQ-018).
 */
function numericRound2(sum: bigint, count: bigint): number | null {
  if (count === 0n) {
    return null;
  }
  const scaled = sum * 100n;
  const rounded = (scaled * 2n + count) / (count * 2n);
  return Number(rounded) / 100;
}

/**
 * Walks the Drizzle `DrizzleQueryError.cause` chain to find the first
 * string-valued PostgreSQL error field (`code` / `constraint`) — driver
 * errors are wrapped behind a generic "failed query" message, so SQLSTATE
 * and constraint names only surface on the underlying `pg` error.
 */
function pgErrorField(error: unknown, field: "code" | "constraint"): string | null {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const value = (current as { code?: unknown; constraint?: unknown })[field];
    if (typeof value === "string") {
      return value;
    }
    current = current.cause;
  }
  return null;
}

/** Counts every row of `table` on the supplied executor (delta oracle). */
async function countRows(tx: DBTransaction, table: PgTable): Promise<number> {
  const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(table);
  return row?.count ?? 0;
}

/** Raw non-null rating sum/count over `reports` — the family oracle. */
async function rawReportRating(tx: DBTransaction): Promise<{ sum: bigint; count: bigint }> {
  const [row] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${reports.studentRatingByTeacher}), 0)::text`,
      count: sql<number>`count(${reports.studentRatingByTeacher})::int`,
    })
    .from(reports);
  return { sum: BigInt(row?.sum ?? "0"), count: BigInt(row?.count ?? 0) };
}

/**
 * Raw score sum/count over NON-deleted `evaluations` (the same NULL-safe
 * soft-delete predicate the repo applies) — the second family oracle.
 */
async function rawEvaluationScore(tx: DBTransaction): Promise<{ sum: bigint; count: bigint }> {
  const [row] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${evaluations.score}), 0)::text`,
      count: sql<number>`count(${evaluations.score})::int`,
    })
    .from(evaluations)
    .where(sql`coalesce(${evaluations.isDeleted}, false) = false`);
  return { sum: BigInt(row?.sum ?? "0"), count: BigInt(row?.count ?? 0) };
}

/**
 * Indexes sparse session-trend rows by midnight-UTC bucket (ms). Bucket
 * keys come from the row's own `bucketStart`, so a wrongly-windowed or
 * mis-truncated query can never alias into an expected bucket.
 */
function sessionTrendIndex(rows: SessionTrendRow[]): Map<number, number> {
  const index = new Map<number, number>();
  for (const row of rows) {
    const key = row.bucketStart.getTime();
    index.set(key, (index.get(key) ?? 0) + row.sessionCount);
  }
  return index;
}

/** Indexes sparse (day, currency) revenue rows by `ms|currency` → cents. */
function revenueTrendIndex(rows: RevenueTrendRow[]): Map<string, bigint> {
  const index = new Map<string, bigint>();
  for (const row of rows) {
    const key = `${row.bucketStart.getTime()}|${row.currency}`;
    index.set(key, (index.get(key) ?? 0n) + centsOf(row.amount));
  }
  return index;
}

/**
 * Creates the minimal cast for session rows: one teacher user + `teacher`
 * row and one student user + `students` row (both FK targets `session`
 * requires).
 */
async function createSessionCast(tx: DBTransaction): Promise<{ teacherId: number; studentId: number }> {
  const teacherUser = await createTestUser(tx, { role: "teacher" });
  const teacherRow = await createTestTeacherRow(tx, teacherUser.id);
  const studentUser = await createTestUser(tx);
  const studentRow = await createTestStudent(tx, studentUser.id);
  return { teacherId: teacherRow.id, studentId: studentRow.id };
}

/** Creates a purchaser + plan cast for subscription fixtures. */
async function createSubscriberCast(tx: DBTransaction): Promise<{ userId: number; planId: number }> {
  const purchaser = await createTestUser(tx);
  const plan = await createTestPlan(tx);
  return { userId: purchaser.id, planId: plan.id };
}

// ─── Layer 1: pure helper math ──────────────────────────────────────────────

describe("PlatformAnalyticsRepository pure helpers (UTC calendar math)", () => {
  test("utcDayStart snaps to midnight-UTC of the same day (mid-day, exact-midnight identity, 1ms-before edge, leap day)", () => {
    const midDay = new Date(Date.UTC(2024, 2, 15, 13, 45, 30, 123));
    expect(utcDayStart(midDay).getTime()).toBe(Date.UTC(2024, 2, 15));

    const exactMidnight = new Date(Date.UTC(2024, 2, 15));
    expect(utcDayStart(exactMidnight).getTime()).toBe(Date.UTC(2024, 2, 15));

    const oneMsBefore = new Date(Date.UTC(2024, 2, 15) - 1);
    expect(utcDayStart(oneMsBefore).getTime()).toBe(Date.UTC(2024, 2, 14));

    const leapDay = new Date(Date.UTC(2024, 1, 29, 10, 0, 0));
    expect(utcDayStart(leapDay).getTime()).toBe(Date.UTC(2024, 1, 29));

    // Every result is an exact multiple of one UTC day (pure midnight).
    expect(utcDayStart(midDay).getTime() % ONE_DAY_MS).toBe(0);
  });

  test("isoWeekStart rolls back to ISO Monday (Friday input, Sunday edge, Monday identity, month/year boundaries, leap week)", () => {
    // 2024-03-15 is a Friday → Monday 2024-03-11.
    expect(isoWeekStart(new Date(Date.UTC(2024, 2, 15, 9, 30))).getTime()).toBe(Date.UTC(2024, 2, 11));
    // Sunday 2024-03-17 closes the week that started Monday 2024-03-11.
    expect(isoWeekStart(new Date(Date.UTC(2024, 2, 17, 23, 59, 59))).getTime()).toBe(Date.UTC(2024, 2, 11));
    // Monday is its own week start (identity).
    expect(isoWeekStart(new Date(Date.UTC(2024, 2, 11, 0, 0, 0, 1))).getTime()).toBe(Date.UTC(2024, 2, 11));
    // Leap day inside an ISO week: Thu 2024-02-29 → Mon 2024-02-26.
    expect(isoWeekStart(new Date(Date.UTC(2024, 1, 29))).getTime()).toBe(Date.UTC(2024, 1, 26));
    // Year boundary: Wed 2025-01-01 → Mon 2024-12-30 (ISO week 1 of 2025 spans the year edge).
    expect(isoWeekStart(new Date(Date.UTC(2025, 0, 1, 12))).getTime()).toBe(Date.UTC(2024, 11, 30));
    // Sunday month-end 2024-03-31 → Monday 2024-03-25 (previous week, same month).
    expect(isoWeekStart(new Date(Date.UTC(2024, 2, 31))).getTime()).toBe(Date.UTC(2024, 2, 25));
  });

  test("utcMonthStart snaps to the 1st at midnight-UTC (identity, last-day edge, leap + non-leap February, year boundary)", () => {
    const midMonth = new Date(Date.UTC(2024, 2, 15, 18, 0, 0));
    expect(utcMonthStart(midMonth).getTime()).toBe(Date.UTC(2024, 2, 1));

    const firstIdentity = new Date(Date.UTC(2024, 2, 1, 0, 0, 0, 1));
    expect(utcMonthStart(firstIdentity).getTime()).toBe(Date.UTC(2024, 2, 1));

    // Last day of a 31-day month still snaps back to the same month's 1st.
    expect(utcMonthStart(new Date(Date.UTC(2024, 0, 31, 23, 59, 59))).getTime()).toBe(Date.UTC(2024, 0, 1));
    // Leap February: Feb 29 2024 → Feb 1 2024.
    expect(utcMonthStart(new Date(Date.UTC(2024, 1, 29))).getTime()).toBe(Date.UTC(2024, 1, 1));
    // Non-leap February: Feb 28 2023 → Feb 1 2023.
    expect(utcMonthStart(new Date(Date.UTC(2023, 1, 28))).getTime()).toBe(Date.UTC(2023, 1, 1));
    // Year boundary: Dec 31 2023 → Dec 1 2023 (never spills into January).
    expect(utcMonthStart(new Date(Date.UTC(2023, 11, 31, 12))).getTime()).toBe(Date.UTC(2023, 11, 1));
  });
});

// ─── Layer 2: aggregate fixtures per method ─────────────────────────────────

describe("PlatformAnalyticsRepository aggregate fixtures (ten methods)", () => {
  test("countRecentlyActiveUsers: 24h boundary is strict `>`, NULL lastActiveAt and governed rows are excluded", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - ONE_DAY_MS);

      const before = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx);

      await createTestUser(tx, { lastActiveAt: new Date(now.getTime() - 3_600_000) }); // in window
      await createTestUser(tx, { lastActiveAt: new Date(cutoff.getTime() + 1) }); // 1ms inside the strict edge
      await createTestUser(tx, { lastActiveAt: cutoff }); // exactly AT the cutoff → excluded (strict >)
      await createTestUser(tx, { lastActiveAt: new Date(cutoff.getTime() - 1) }); // 1ms outside → excluded
      await createTestUser(tx, { lastActiveAt: null }); // NULL never matches → excluded
      await createTestUser(tx, { suspended: true, suspendedAt: now }); // governance exclusions…
      await createTestUser(tx, { isBlocked: true, blockedAt: now });
      await createTestUser(tx, { isDeleted: true, deletedAt: now });

      const after = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx);

      // Exactly the two in-window non-governed rows (the strict-`>` edge and
      // the NULL/governed exclusions contribute zero).
      expect(after).toBe(before + 2);
    });
  });

  test("getSessionStats: windows, five status counters, awaitingConfirmation, and the confirmedByStudentAt flip", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const todayStart = utcDayStart(now);
      const weekStart = isoWeekStart(now);
      const monthStart = utcMonthStart(now);
      const trendCutoff = new Date(now.getTime() - 30 * ONE_DAY_MS);

      const before = await PlatformAnalyticsRepository.getSessionStats(now, tx);
      const cast = await createSessionCast(tx);

      // Fixture matrix with createdAt ONLY at boundary-relevant offsets —
      // expected window membership is derived per fixture from the (layer-1
      // verified) boundary helpers, so the assertion is deterministic for
      // every runtime `now` (month edges, Mondays, month-start Mondays).
      const specs: Array<{
        status: SessionStatus;
        confirmedByStudentAt: Date | null;
        createdAt: Date;
      }> = [
        { status: SessionStatus.Completed, confirmedByStudentAt: now, createdAt: now },
        { status: SessionStatus.Completed, confirmedByStudentAt: null, createdAt: now },
        { status: SessionStatus.Scheduled, confirmedByStudentAt: null, createdAt: now },
        { status: SessionStatus.Started, confirmedByStudentAt: null, createdAt: now },
        { status: SessionStatus.Cancelled, confirmedByStudentAt: null, createdAt: now },
        { status: SessionStatus.Disputed, confirmedByStudentAt: null, createdAt: now },
        { status: SessionStatus.Scheduled, confirmedByStudentAt: null, createdAt: weekStart },
        { status: SessionStatus.Scheduled, confirmedByStudentAt: null, createdAt: monthStart },
        { status: SessionStatus.Started, confirmedByStudentAt: null, createdAt: new Date(todayStart.getTime() - 1) },
        { status: SessionStatus.Cancelled, confirmedByStudentAt: null, createdAt: new Date(monthStart.getTime() - 1) },
        { status: SessionStatus.Scheduled, confirmedByStudentAt: null, createdAt: new Date(trendCutoff.getTime() - 1) },
      ];
      for (const spec of specs) {
        await createTestSession(tx, cast.teacherId, cast.studentId, spec);
      }

      const inToday = specs.filter(spec => spec.createdAt.getTime() >= todayStart.getTime()).length;
      const inWeek = specs.filter(spec => spec.createdAt.getTime() >= weekStart.getTime()).length;
      const inMonth = specs.filter(spec => spec.createdAt.getTime() >= monthStart.getTime()).length;
      const statusDelta = (status: SessionStatus) => specs.filter(spec => spec.status === status).length;

      const after = await PlatformAnalyticsRepository.getSessionStats(now, tx);
      expect(after.total).toBe(before.total + specs.length);
      expect(after.today).toBe(before.today + inToday);
      expect(after.thisWeek).toBe(before.thisWeek + inWeek);
      expect(after.thisMonth).toBe(before.thisMonth + inMonth);
      expect(after.scheduled).toBe(before.scheduled + statusDelta(SessionStatus.Scheduled));
      expect(after.started).toBe(before.started + statusDelta(SessionStatus.Started));
      expect(after.completed).toBe(before.completed + statusDelta(SessionStatus.Completed));
      expect(after.cancelled).toBe(before.cancelled + statusDelta(SessionStatus.Cancelled));
      expect(after.disputed).toBe(before.disputed + statusDelta(SessionStatus.Disputed));
      // Only the completed-and-unconfirmed rows await confirmation; the
      // completed+confirmed row never counts (REQ-071 flip oracle base).
      const awaitingDelta = specs.filter(
        spec => spec.status === SessionStatus.Completed && spec.confirmedByStudentAt === null
      ).length;
      expect(after.awaitingConfirmation).toBe(before.awaitingConfirmation + awaitingDelta);
      expect(after.awaitingConfirmation).toBeLessThanOrEqual(after.completed);

      // Flip: confirming the student decrements ONLY awaitingConfirmation.
      const flip = await createTestSession(tx, cast.teacherId, cast.studentId, {
        status: SessionStatus.Completed,
        createdAt: new Date(now.getTime() - 1000),
      });
      const withPending = await PlatformAnalyticsRepository.getSessionStats(now, tx);
      expect(withPending.awaitingConfirmation).toBe(after.awaitingConfirmation + 1);
      expect(withPending.completed).toBe(after.completed + 1);
      expect(withPending.total).toBe(after.total + 1);

      await tx.update(session).set({ confirmedByStudentAt: now }).where(eq(session.id, flip.id));
      const afterFlip = await PlatformAnalyticsRepository.getSessionStats(now, tx);
      expect(afterFlip.awaitingConfirmation).toBe(withPending.awaitingConfirmation - 1);
      expect(afterFlip.completed).toBe(withPending.completed);
      expect(afterFlip.total).toBe(withPending.total);
    });
  });

  test("getSessionDailyTrend: sparse per-day buckets at midnight-UTC with 30-day edges (>= cutoff in, cutoff-1ms out)", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * ONE_DAY_MS);

      const beforeRows = await PlatformAnalyticsRepository.getSessionDailyTrend(now, tx);
      const cast = await createSessionCast(tx);

      const fixtureDeltas = new Map<number, number>();
      const bump = (createdAt: Date, delta: number) => {
        const key = utcDayStart(createdAt).getTime();
        fixtureDeltas.set(key, (fixtureDeltas.get(key) ?? 0) + delta);
      };
      const sessions: Array<{ createdAt: Date; inWindow: boolean }> = [
        { createdAt: now, inWindow: true },
        { createdAt: new Date(now.getTime() - 5 * 60_000), inWindow: true }, // same bucket as `now`
        { createdAt: new Date(utcDayStart(now).getTime() - 3_600_000), inWindow: true }, // previous bucket
        { createdAt: cutoff, inWindow: true }, // exactly AT the 30-day edge → included (>=)
        { createdAt: new Date(cutoff.getTime() - 1), inWindow: false }, // 1ms before the edge → excluded
      ];
      for (const item of sessions) {
        await createTestSession(tx, cast.teacherId, cast.studentId, { createdAt: item.createdAt });
        if (item.inWindow) {
          bump(item.createdAt, 1);
        }
      }

      const afterRows = await PlatformAnalyticsRepository.getSessionDailyTrend(now, tx);

      // Full-map equality: every committed bucket keeps its baseline count,
      // only my in-window buckets gain their deltas, and the excluded 1ms-
      // before-edge bucket gains nothing anywhere.
      const expected = sessionTrendIndex(beforeRows);
      for (const [key, delta] of fixtureDeltas) {
        expected.set(key, (expected.get(key) ?? 0) + delta);
      }
      expect(sessionTrendIndex(afterRows)).toEqual(expected);

      // Buckets are midnight-aligned and non-decreasing (ORDER BY day ASC).
      const bucketTimes = afterRows.map(row => row.bucketStart.getTime());
      expect(bucketTimes).toEqual([...bucketTimes].sort((a, b) => a - b));
      for (const time of bucketTimes) {
        expect(time).toBe(utcDayStart(new Date(time)).getTime());
      }
      for (const row of afterRows) {
        expect(Number.isInteger(row.sessionCount)).toBe(true);
        expect(row.sessionCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  test("getRevenueStats: paid-only per-currency rows with exact decimal-string sums, 30-day FILTER edge, and no phantom row", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * ONE_DAY_MS);

      const beforeRows = await PlatformAnalyticsRepository.getRevenueStats(now, tx);
      const studentUser = await createTestUser(tx);
      const student = await createTestStudent(tx, studentUser.id);

      // JPY: two in-window paid rows + one out-of-window paid row + one row
      // exactly AT the cutoff edge (included, >=) + pending/refunded rows
      // that must never be counted (status filter, PaymentStatus VALUEs).
      const jpySeed: Array<{ amount: string; createdAt?: Date; status?: PaymentStatus }> = [
        { amount: "1500.50" },
        { amount: "250.25", createdAt: new Date(cutoff.getTime() - ONE_DAY_MS) },
        { amount: "10.00", createdAt: cutoff },
        { amount: "999.99", status: PaymentStatus.Pending },
        { amount: "888.88", status: PaymentStatus.Refunded },
      ];
      for (const seed of jpySeed) {
        await createTestStudentPayment(tx, student.id, {
          amount: seed.amount,
          currency: "JPY",
          status: seed.status ?? PaymentStatus.Paid,
          createdAt: seed.createdAt ?? now,
        });
      }
      // AED: one in-window paid row — a SECOND currency that must stay a
      // separate bucket forever.
      await createTestStudentPayment(tx, student.id, {
        amount: "99.99",
        currency: "AED",
        status: PaymentStatus.Paid,
      });
      // CHF: paid ONLY outside the window → row exists with a coalesced zero
      // trailing-30-days sum.
      await createTestStudentPayment(tx, student.id, {
        amount: "49.00",
        currency: "CHF",
        status: PaymentStatus.Paid,
        createdAt: new Date(cutoff.getTime() - ONE_DAY_MS),
      });
      // XDR: pending ONLY → NO revenue row at all (no phantom bucket).
      await createTestStudentPayment(tx, student.id, {
        amount: "777.00",
        currency: "XDR",
        status: PaymentStatus.Pending,
      });

      const afterRows = await PlatformAnalyticsRepository.getRevenueStats(now, tx);

      const baselineOf = (rows: RevenueStatsRow[], currency: string): { total: bigint; last30: bigint; count: number } => {
        const row = rows.find(candidate => candidate.currency === currency);
        return {
          total: centsOf(row?.totalAmount ?? "0"),
          last30: centsOf(row?.last30DaysAmount ?? "0"),
          count: row?.paidPaymentsCount ?? 0,
        };
      };
      const assertCurrency = (
        currency: string,
        total: bigint,
        last30: bigint,
        count: number
      ): void => {
        const row = afterRows.find(candidate => candidate.currency === currency);
        if (!row) {
          throw new Error(`expected a revenue row for ${currency}`);
        }
        // Exact VALUE pin (BigInt cents) + string-shape pin — the bare
        // zero renders as PG's canonical "0" from coalesce(sum,0)::text
        // (plan §4.1 verbatim), so the 2-decimal rendering is NOT pinned.
        expect(row.totalAmount).toMatch(/^\d+(\.\d+)?$/);
        expect(centsOf(row.totalAmount)).toBe(total);
        expect(row.last30DaysAmount).toMatch(/^\d+(\.\d+)?$/);
        expect(centsOf(row.last30DaysAmount)).toBe(last30);
        expect(row.paidPaymentsCount).toBe(count);
      };

      const jpy = baselineOf(beforeRows, "JPY");
      assertCurrency(
        "JPY",
        jpy.total + centsOf("1500.50") + centsOf("250.25") + centsOf("10.00"),
        jpy.last30 + centsOf("1500.50") + centsOf("10.00"),
        jpy.count + 3
      );
      const aed = baselineOf(beforeRows, "AED");
      assertCurrency("AED", aed.total + centsOf("99.99"), aed.last30 + centsOf("99.99"), aed.count + 1);
      const chf = baselineOf(beforeRows, "CHF");
      assertCurrency("CHF", chf.total + centsOf("49.00"), chf.last30, chf.count + 1);

      // No phantom currency: the pending-only XDR never materializes a row.
      expect(afterRows.some(row => row.currency === "XDR")).toBe(false);

      // Money never crosses JS number: exact strings, and the whole result
      // stays ordered by currency ascending (GROUP BY order contract).
      for (const row of afterRows) {
        expect(typeof row.totalAmount).toBe("string");
        expect(typeof row.last30DaysAmount).toBe("string");
        expect(row.totalAmount).toMatch(/^\d+(\.\d+)?$/);
        expect(row.last30DaysAmount).toMatch(/^\d+(\.\d+)?$/);
      }
      const currencies = afterRows.map(row => row.currency);
      expect(currencies).toEqual([...currencies].sort());
    });
  });

  test("getRevenueDailyTrend: sparse (day, currency) buckets — currencies never merge and the 30-day edge is exact", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * ONE_DAY_MS);
      const todayBucket = utcDayStart(now).getTime();
      const yesterdayBucket = utcDayStart(new Date(todayBucket - 3_600_000)).getTime();
      const cutoffBucket = utcDayStart(cutoff).getTime();

      const beforeRows = await PlatformAnalyticsRepository.getRevenueDailyTrend(now, tx);
      const studentUser = await createTestUser(tx);
      const student = await createTestStudent(tx, studentUser.id);

      const seeds: Array<{ amount: string; currency: string; createdAt: Date; status?: PaymentStatus }> = [
        { amount: "100.00", currency: "JPY", createdAt: now },
        { amount: "23.45", currency: "JPY", createdAt: new Date(now.getTime() - 5 * 60_000) },
        { amount: "55.55", currency: "AED", createdAt: now },
        { amount: "77.00", currency: "JPY", createdAt: new Date(todayBucket - 3_600_000) },
        { amount: "5.00", currency: "JPY", createdAt: cutoff }, // AT the edge → included
        { amount: "6.00", currency: "JPY", createdAt: new Date(cutoff.getTime() - 1) }, // 1ms out → excluded
        { amount: "1.00", currency: "JPY", createdAt: now, status: PaymentStatus.Pending }, // never counted
      ];
      for (const seed of seeds) {
        await createTestStudentPayment(tx, student.id, {
          amount: seed.amount,
          currency: seed.currency,
          status: seed.status ?? PaymentStatus.Paid,
          createdAt: seed.createdAt,
        });
      }

      const afterRows = await PlatformAnalyticsRepository.getRevenueDailyTrend(now, tx);

      // Full-map equality over (bucket, currency) → exact cents.
      const expected = revenueTrendIndex(beforeRows);
      const bump = (bucketMs: number, currency: string, amount: string) => {
        const key = `${bucketMs}|${currency}`;
        expected.set(key, (expected.get(key) ?? 0n) + centsOf(amount));
      };
      bump(todayBucket, "JPY", "123.45"); // two same-currency rows sum INSIDE one bucket
      bump(todayBucket, "AED", "55.55"); // second currency = separate bucket, never merged
      bump(yesterdayBucket, "JPY", "77.00");
      bump(cutoffBucket, "JPY", "5.00");
      const actual = revenueTrendIndex(afterRows);
      expect(actual).toEqual(expected);

      // Currencies never merge: today holds TWO distinct buckets for my two
      // currencies, each EXACTLY its own sum (a merged implementation would
      // put 123.45 + 55.55 into either single bucket).
      expect(actual.has(`${todayBucket}|JPY`)).toBe(true);
      expect(actual.has(`${todayBucket}|AED`)).toBe(true);
      expect(actual.get(`${todayBucket}|JPY`)).toBe(expected.get(`${todayBucket}|JPY`));
      expect(actual.get(`${todayBucket}|AED`)).toBe(expected.get(`${todayBucket}|AED`));

      // Money is an exact string per bucket, ordering is day ASC then
      // currency ASC, and the JPY-today bucket sits at midnight-UTC of `now`.
      for (const row of afterRows) {
        expect(typeof row.amount).toBe("string");
        expect(row.amount).toMatch(/^\d+(\.\d+)?$/);
      }
      const orderKeys = afterRows.map(row => `${String(row.bucketStart.getTime()).padStart(15, "0")}|${row.currency}`);
      expect(orderKeys).toEqual([...orderKeys].sort());
      const jpyToday = afterRows.find(row => row.bucketStart.getTime() === todayBucket && row.currency === "JPY");
      if (!jpyToday) {
        throw new Error("expected the (today, JPY) revenue-trend bucket");
      }
      expect(jpyToday.bucketStart.getTime()).toBe(utcDayStart(now).getTime());
    });
  });

  test("getSubscriptionStats: five status counters plus the ACTIVE-window counter (NULL start in, expired end_date out)", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const before = await PlatformAnalyticsRepository.getSubscriptionStats(now, tx);
      const { userId, planId } = await createSubscriberCast(tx);

      // ACTIVE-window semantics with the captured `now` bound as parameter:
      //  - NULL startDate → coalesce(start, now) = now ≤ now → IN window
      //  - endDate = now + 1ms → now < end → IN window (1ms boundary)
      //  - endDate = now → now < end is false → EXCLUDED though still
      //    `status='active'` (the expired-but-active row, REQ-071)
      //  - startDate in the future → EXCLUDED from the window
      const specs: Array<{
        status: SubscriptionStatus;
        startDate: Date | null;
        endDate: Date | null;
        inWindow: boolean;
      }> = [
        {
          status: SubscriptionStatus.Active,
          startDate: new Date(now.getTime() - ONE_DAY_MS),
          endDate: null,
          inWindow: true,
        },
        { status: SubscriptionStatus.Active, startDate: null, endDate: null, inWindow: true },
        {
          status: SubscriptionStatus.Active,
          startDate: new Date(now.getTime() - 2 * ONE_DAY_MS),
          endDate: new Date(now.getTime() + 1),
          inWindow: true,
        },
        {
          status: SubscriptionStatus.Active,
          startDate: new Date(now.getTime() - 2 * ONE_DAY_MS),
          endDate: now,
          inWindow: false,
        },
        {
          status: SubscriptionStatus.Active,
          startDate: new Date(now.getTime() + 3_600_000),
          endDate: null,
          inWindow: false,
        },
        { status: SubscriptionStatus.Pending, startDate: null, endDate: null, inWindow: false },
        { status: SubscriptionStatus.Expired, startDate: null, endDate: null, inWindow: false },
        { status: SubscriptionStatus.Cancelled, startDate: null, endDate: null, inWindow: false },
        { status: SubscriptionStatus.Suspended, startDate: null, endDate: null, inWindow: false },
      ];
      for (const spec of specs) {
        await createTestSubscription(tx, userId, planId, {
          status: spec.status,
          startDate: spec.startDate,
          endDate: spec.endDate,
        });
      }

      const countBy = (status: SubscriptionStatus) => specs.filter(spec => spec.status === status).length;
      const after = await PlatformAnalyticsRepository.getSubscriptionStats(now, tx);
      expect(after.total).toBe(before.total + specs.length);
      expect(after.active).toBe(before.active + countBy(SubscriptionStatus.Active));
      expect(after.pending).toBe(before.pending + countBy(SubscriptionStatus.Pending));
      expect(after.expired).toBe(before.expired + countBy(SubscriptionStatus.Expired));
      expect(after.cancelled).toBe(before.cancelled + countBy(SubscriptionStatus.Cancelled));
      expect(after.suspended).toBe(before.suspended + countBy(SubscriptionStatus.Suspended));
      expect(after.activeInWindowNow).toBe(before.activeInWindowNow + specs.filter(spec => spec.inWindow).length);
      expect(after.activeInWindowNow).toBeLessThanOrEqual(after.active);
    });
  });

  test("countOfflineActivations: exactly the three offline payment-method members, status-independent", async () => {
    await runInRollback(async tx => {
      const before = await PlatformAnalyticsRepository.countOfflineActivations(tx);
      const { userId, planId } = await createSubscriberCast(tx);

      await createTestSubscription(tx, userId, planId, { paymentMethod: PaymentGateway.OfflineCash });
      await createTestSubscription(tx, userId, planId, {
        paymentMethod: PaymentGateway.BankTransfer,
        status: SubscriptionStatus.Expired, // the predicate filters ONLY on payment_method
      });
      await createTestSubscription(tx, userId, planId, { paymentMethod: PaymentGateway.Scholarship });
      await createTestSubscription(tx, userId, planId, { paymentMethod: PaymentGateway.Stripe }); // online → excluded
      await createTestSubscription(tx, userId, planId, { paymentMethod: null }); // pending, no method → excluded

      const after = await PlatformAnalyticsRepository.countOfflineActivations(tx);
      expect(after).toBe(before + 3);
    });
  });

  test("getTeacherPresenceStats: certified / evaluator / online counters with NULL-safe boolean filters", async () => {
    await runInRollback(async tx => {
      const before = await PlatformAnalyticsRepository.getTeacherPresenceStats(tx);

      const mkTeacher = async (overrides: {
        isApproved?: boolean | null;
        isEvaluator?: boolean | null;
        isOnline?: boolean | null;
      }) => {
        const teacherUser = await createTestUser(tx, { role: "teacher" });
        await createTestTeacherRow(tx, teacherUser.id, overrides);
      };
      await mkTeacher({ isApproved: true, isOnline: true }); // certified + online
      await mkTeacher({ isApproved: true, isOnline: false }); // certified, offline
      await mkTeacher({ isApproved: false, isOnline: true }); // online but uncertified → nowhere
      await mkTeacher({ isApproved: true, isEvaluator: true }); // evaluator (also certified)
      await mkTeacher({ isEvaluator: true }); // evaluator without certification → evaluator only
      await mkTeacher({ isApproved: null, isOnline: true }); // legacy NULL state → matches nothing (= true never matches NULL)

      const after = await PlatformAnalyticsRepository.getTeacherPresenceStats(tx);
      expect(after.certifiedCount).toBe(before.certifiedCount + 3);
      expect(after.evaluatorCount).toBe(before.evaluatorCount + 2);
      expect(after.onlineNowCount).toBe(before.onlineNowCount + 1);
      expect(after.onlineNowCount).toBeLessThanOrEqual(after.certifiedCount);
    });
  });

  test("getRatingStats: honest nullable averages with exact round-2 math, non-null-only counts, soft-delete + NULL-state exclusion", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const before = await PlatformAnalyticsRepository.getRatingStats(tx);
      const reportsBaseline = await rawReportRating(tx);
      const evaluationsBaseline = await rawEvaluationScore(tx);
      // Honest-emptiness relation holds on the untouched baseline too.
      expect(before.averageSessionRating === null).toBe(reportsBaseline.count === 0n);
      expect(before.averageEvaluationScore === null).toBe(evaluationsBaseline.count === 0n);

      const cast = await createSessionCast(tx);

      // Reports: ratings 4 + 5 + 0 (0 is the allowed CHECK floor and still
      // counts — non-null) + one NULL rating that never enters avg/count.
      const ratedSession = await createTestSession(tx, cast.teacherId, cast.studentId, {
        status: SessionStatus.Completed,
      });
      await createTestSessionReport(tx, ratedSession.id, { studentRatingByTeacher: 4 });
      await createTestSessionReport(tx, ratedSession.id, { studentRatingByTeacher: 5 });
      await createTestSessionReport(tx, ratedSession.id, { studentRatingByTeacher: 0 });
      await createTestSessionReport(tx, ratedSession.id, { studentRatingByTeacher: null });

      // Evaluations: 80 + 90 + 100 (allowed CHECK ceiling) + a soft-deleted
      // row (excluded) + a legacy NULL is_deleted row (INCLUDED — reads as
      // not-deleted) + a NULL score (not counted).
      const evaluated = await createTestUser(tx);
      const evaluator = await createTestUser(tx, { role: "teacher" });
      await createTestEvaluation(tx, evaluated.id, evaluator.id, { score: 80 });
      await createTestEvaluation(tx, evaluated.id, evaluator.id, { score: 90 });
      await createTestEvaluation(tx, evaluated.id, evaluator.id, { score: 100 });
      await createTestEvaluation(tx, evaluated.id, evaluator.id, { score: 70, isDeleted: true, deletedAt: now });
      await createTestEvaluation(tx, evaluated.id, evaluator.id, { score: 60, isDeleted: null });
      await createTestEvaluation(tx, evaluated.id, evaluator.id, { score: null });

      const after = await PlatformAnalyticsRepository.getRatingStats(tx);
      const sessionSum = reportsBaseline.sum + 9n;
      const sessionCount = reportsBaseline.count + 3n;
      const evaluationSum = evaluationsBaseline.sum + 330n;
      const evaluationCount = evaluationsBaseline.count + 4n;

      expect(after.sessionRatingsCount).toBe(Number(sessionCount));
      expect(after.evaluationScoresCount).toBe(Number(evaluationCount));
      // The null ⟺ empty-family relation + the EXACT rounded average.
      expect(after.averageSessionRating === null).toBe(sessionCount === 0n);
      expect(after.averageEvaluationScore === null).toBe(evaluationCount === 0n);
      expect(after.averageSessionRating).toBe(numericRound2(sessionSum, sessionCount));
      expect(after.averageEvaluationScore).toBe(numericRound2(evaluationSum, evaluationCount));
    });
  });

  test("getRatingStats: CHECK bands are enforced at the DB layer (rating 0–5, score 0–100)", async () => {
    await runInRollback(async tx => {
      const cast = await createSessionCast(tx);
      const ratedSession = await createTestSession(tx, cast.teacherId, cast.studentId, {
        status: SessionStatus.Completed,
      });
      const evaluated = await createTestUser(tx);
      const evaluator = await createTestUser(tx, { role: "teacher" });

      // Rating above the 0–5 band → reports_student_rating_by_teacher_check.
      await tx.execute(sql`savepoint pal_rating_band_probe`);
      const ratingError = await expectRepoError(() =>
        createTestSessionReport(tx, ratedSession.id, { studentRatingByTeacher: 6 })
      );
      await tx.execute(sql`rollback to savepoint pal_rating_band_probe`);
      expect(pgErrorField(ratingError, "code")).toBe(PG_CHECK_VIOLATION);
      expect(pgErrorField(ratingError, "constraint")).toBe("reports_student_rating_by_teacher_check");

      // Score above the 0–100 band → evaluations_score_check.
      await tx.execute(sql`savepoint pal_score_band_probe`);
      const scoreError = await expectRepoError(() =>
        createTestEvaluation(tx, evaluated.id, evaluator.id, { score: 101 })
      );
      await tx.execute(sql`rollback to savepoint pal_score_band_probe`);
      expect(pgErrorField(scoreError, "code")).toBe(PG_CHECK_VIOLATION);
      expect(pgErrorField(scoreError, "constraint")).toBe("evaluations_score_check");

      // The outer transaction survived both probes (savepoint isolation).
      const ratings = await PlatformAnalyticsRepository.getRatingStats(tx);
      expect(Number.isInteger(ratings.sessionRatingsCount)).toBe(true);
    });
  });

  test("getHealthIndicators: disputed sessions and pending withdrawals only (enum-member predicates)", async () => {
    await runInRollback(async tx => {
      const before = await PlatformAnalyticsRepository.getHealthIndicators(tx);
      const cast = await createSessionCast(tx);

      await createTestSession(tx, cast.teacherId, cast.studentId, { status: SessionStatus.Disputed });
      await createTestSession(tx, cast.teacherId, cast.studentId, { status: SessionStatus.Scheduled });

      const teacherWallet = await createTestWallet(tx, cast.teacherId);
      await createTestTeacherTransaction(tx, teacherWallet.id, {
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Pending,
      }); // the pending withdrawal → +1
      await createTestTeacherTransaction(tx, teacherWallet.id, {
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Completed,
      }); // settled → excluded
      await createTestTeacherTransaction(tx, teacherWallet.id, {
        type: TransactionType.Earning,
        status: TransactionStatus.Pending,
      }); // not a withdrawal → excluded

      const after = await PlatformAnalyticsRepository.getHealthIndicators(tx);
      expect(after.pendingDisputes).toBe(before.pendingDisputes + 1);
      expect(after.pendingWithdrawals).toBe(before.pendingWithdrawals + 1);
    });
  });

  test("non-tx executor branch: every method resolves against committed state with honest shapes (tx ?? db else-branch)", async () => {
    await runInRollback(async () => {
      // No fixtures are created in this test on purpose: every call below
      // runs on the global `db` executor, so it must only observe COMMITTED
      // rows and can never see (or pollute) uncommitted transaction state.
      const now = new Date();

      const activeCount = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now);
      expect(Number.isInteger(activeCount)).toBe(true);
      expect(activeCount).toBeGreaterThanOrEqual(0);

      const sessions = await PlatformAnalyticsRepository.getSessionStats(now);
      expect(Object.keys(sessions).sort()).toEqual(
        [
          "total",
          "today",
          "thisWeek",
          "thisMonth",
          "scheduled",
          "started",
          "completed",
          "cancelled",
          "disputed",
          "awaitingConfirmation",
        ].sort()
      );
      for (const value of Object.values(sessions)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(sessions.awaitingConfirmation).toBeLessThanOrEqual(sessions.completed);

      const sessionTrend = await PlatformAnalyticsRepository.getSessionDailyTrend(now);
      const bucketTimes = sessionTrend.map(row => row.bucketStart.getTime());
      expect(bucketTimes).toEqual([...bucketTimes].sort((a, b) => a - b));
      for (const time of bucketTimes) {
        expect(time).toBe(utcDayStart(new Date(time)).getTime());
      }

      const revenue = await PlatformAnalyticsRepository.getRevenueStats(now);
      const revenueCurrencies = revenue.map(row => row.currency);
      expect(revenueCurrencies).toEqual([...revenueCurrencies].sort());
      for (const row of revenue) {
        expect(row.paidPaymentsCount).toBeGreaterThanOrEqual(1);
        expect(row.totalAmount).toMatch(/^\d+(\.\d+)?$/);
        expect(row.last30DaysAmount).toMatch(/^\d+(\.\d+)?$/);
      }

      const revenueTrend = await PlatformAnalyticsRepository.getRevenueDailyTrend(now);
      for (const row of revenueTrend) {
        expect(row.amount).toMatch(/^\d+(\.\d+)?$/);
      }

      const subs = await PlatformAnalyticsRepository.getSubscriptionStats(now);
      for (const value of Object.values(subs)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(subs.activeInWindowNow).toBeLessThanOrEqual(subs.active);

      const offline = await PlatformAnalyticsRepository.countOfflineActivations();
      expect(Number.isInteger(offline)).toBe(true);
      expect(offline).toBeGreaterThanOrEqual(0);

      const presence = await PlatformAnalyticsRepository.getTeacherPresenceStats();
      expect(presence.onlineNowCount).toBeLessThanOrEqual(presence.certifiedCount);

      const ratings = await PlatformAnalyticsRepository.getRatingStats();
      expect(ratings.averageSessionRating === null).toBe(ratings.sessionRatingsCount === 0);
      expect(ratings.averageEvaluationScore === null).toBe(ratings.evaluationScoresCount === 0);

      const health = await PlatformAnalyticsRepository.getHealthIndicators();
      expect(health.pendingDisputes).toBeGreaterThanOrEqual(0);
      expect(health.pendingWithdrawals).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── Layer 3: window & exclusion semantics ──────────────────────────────────

describe("PlatformAnalyticsRepository window & exclusion semantics", () => {
  test("the explicit `now` drives every window from relative offsets (a shifted `now` re-classifies the SAME rows)", async () => {
    await runInRollback(async tx => {
      const now1 = new Date();
      const now2 = new Date(now1.getTime() + 45 * ONE_DAY_MS); // relative future probe — never an absolute date

      // Baselines under BOTH probe instants BEFORE any fixture exists.
      const beforeStats1 = await PlatformAnalyticsRepository.getSessionStats(now1, tx);
      const beforeStats2 = await PlatformAnalyticsRepository.getSessionStats(now2, tx);
      const beforeTrend1 = sessionTrendIndex(await PlatformAnalyticsRepository.getSessionDailyTrend(now1, tx));
      const beforeTrend2 = sessionTrendIndex(await PlatformAnalyticsRepository.getSessionDailyTrend(now2, tx));
      const beforeActive1 = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now1, tx);
      const beforeActive2 = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now2, tx);

      const cast = await createSessionCast(tx);
      const recent = await createTestSession(tx, cast.teacherId, cast.studentId, { createdAt: now1 });
      const stale = await createTestSession(tx, cast.teacherId, cast.studentId, {
        createdAt: new Date(now1.getTime() - 40 * ONE_DAY_MS),
      });
      expect(recent.id).not.toBe(stale.id);

      // Under now1: the recent session lands in today/trend; the 40-day-old
      // one is beyond the 30-day window and off today.
      const afterStats1 = await PlatformAnalyticsRepository.getSessionStats(now1, tx);
      expect(afterStats1.total).toBe(beforeStats1.total + 2);
      expect(afterStats1.today).toBe(beforeStats1.today + 1);
      const afterTrend1 = sessionTrendIndex(await PlatformAnalyticsRepository.getSessionDailyTrend(now1, tx));
      const recentBucket = utcDayStart(now1).getTime();
      expect((afterTrend1.get(recentBucket) ?? 0) - (beforeTrend1.get(recentBucket) ?? 0)).toBe(1);
      const staleBucket = utcDayStart(new Date(now1.getTime() - 40 * ONE_DAY_MS)).getTime();
      expect(afterTrend1.get(staleBucket) ?? 0).toBe(beforeTrend1.get(staleBucket) ?? 0);

      // Under now2: BOTH fixtures are 45+ days stale — the same rows fall
      // out of today/thisWeek/thisMonth AND the shifted 30-day trend window.
      const afterStats2 = await PlatformAnalyticsRepository.getSessionStats(now2, tx);
      expect(afterStats2.total).toBe(beforeStats2.total + 2);
      expect(afterStats2.today).toBe(beforeStats2.today);
      expect(afterStats2.thisWeek).toBe(beforeStats2.thisWeek);
      expect(afterStats2.thisMonth).toBe(beforeStats2.thisMonth);
      const afterTrend2 = sessionTrendIndex(await PlatformAnalyticsRepository.getSessionDailyTrend(now2, tx));
      expect((afterTrend2.get(recentBucket) ?? 0) - (beforeTrend2.get(recentBucket) ?? 0)).toBe(0);

      // The presence window moves with `now` too: the cast users (created
      // with a fresh lastActiveAt ≈ now1) count under now1, not under now2.
      expect(await PlatformAnalyticsRepository.countRecentlyActiveUsers(now1, tx)).toBe(beforeActive1 + 2);
      expect(await PlatformAnalyticsRepository.countRecentlyActiveUsers(now2, tx)).toBe(beforeActive2);
    });
  });

  test("ACTIVE-window counter: a still-active subscription exits the window when the caller's `now` passes endDate", async () => {
    await runInRollback(async tx => {
      const now1 = new Date();
      const now2 = new Date(now1.getTime() + 10 * ONE_DAY_MS); // relative offset past the end date

      const before1 = await PlatformAnalyticsRepository.getSubscriptionStats(now1, tx);
      const before2 = await PlatformAnalyticsRepository.getSubscriptionStats(now2, tx);

      const { userId, planId } = await createSubscriberCast(tx);
      await createTestSubscription(tx, userId, planId, {
        status: SubscriptionStatus.Active,
        startDate: new Date(now1.getTime() - ONE_DAY_MS),
        endDate: new Date(now1.getTime() + 5 * ONE_DAY_MS),
      });

      const after1 = await PlatformAnalyticsRepository.getSubscriptionStats(now1, tx);
      expect(after1.total).toBe(before1.total + 1);
      expect(after1.active).toBe(before1.active + 1);
      expect(after1.activeInWindowNow).toBe(before1.activeInWindowNow + 1); // now1 < endDate

      const after2 = await PlatformAnalyticsRepository.getSubscriptionStats(now2, tx);
      expect(after2.total).toBe(before2.total + 1);
      expect(after2.active).toBe(before2.active + 1); // status never changed
      expect(after2.activeInWindowNow).toBe(before2.activeInWindowNow); // now2 ≥ endDate → out of window
    });
  });

  test("governance & soft-delete exclusion chains flip dynamically; legacy NULL states read as counted/not-deleted", async () => {
    await runInRollback(async tx => {
      const now = new Date();

      // ── Governance chain on the presence counter (the NULL-safe
      //    isDeleted/suspended/isBlocked coalesce chain) ──
      const baseline = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx);
      const user = await createTestUser(tx, { lastActiveAt: new Date(now.getTime() - 60_000) });
      expect(await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx)).toBe(baseline + 1);

      await tx.update(users).set({ suspended: true, suspendedAt: now }).where(eq(users.id, user.id));
      expect(await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx)).toBe(baseline);

      await tx
        .update(users)
        .set({ suspended: false, suspendedAt: null, isBlocked: true, blockedAt: now })
        .where(eq(users.id, user.id));
      expect(await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx)).toBe(baseline);

      await tx
        .update(users)
        .set({ isBlocked: false, blockedAt: null, isDeleted: true, deletedAt: now })
        .where(eq(users.id, user.id));
      expect(await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx)).toBe(baseline);

      // Legacy NULL-state row (all three governance columns NULL) reads as
      // "not set" → the user IS counted (three-valued-logic safety).
      await createTestUser(tx, {
        lastActiveAt: new Date(now.getTime() - 60_000),
        isDeleted: null,
        suspended: null,
        isBlocked: null,
      });
      expect(await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx)).toBe(baseline + 1);

      // ── Evaluations soft-delete exclusion (coalesce(is_deleted,false)) ──
      const evaluated = await createTestUser(tx);
      const evaluator = await createTestUser(tx, { role: "teacher" });
      const beforeRatings = await PlatformAnalyticsRepository.getRatingStats(tx);
      const evalBaseline = await rawEvaluationScore(tx);

      const evaluation = await createTestEvaluation(tx, evaluated.id, evaluator.id, { score: 85 });
      const withLive = await PlatformAnalyticsRepository.getRatingStats(tx);
      expect(withLive.evaluationScoresCount).toBe(beforeRatings.evaluationScoresCount + 1);
      expect(withLive.averageEvaluationScore).toBe(numericRound2(evalBaseline.sum + 85n, evalBaseline.count + 1n));

      await tx
        .update(evaluations)
        .set({ isDeleted: true, deletedAt: now })
        .where(eq(evaluations.id, evaluation.id));
      const withDeleted = await PlatformAnalyticsRepository.getRatingStats(tx);
      expect(withDeleted.evaluationScoresCount).toBe(beforeRatings.evaluationScoresCount);
      expect(withDeleted.averageEvaluationScore === null).toBe(evalBaseline.count === 0n);
    });
  });
});

// ─── Layer 4: contract & purity ─────────────────────────────────────────────

describe("PlatformAnalyticsRepository contract & purity", () => {
  test("no cross-currency sums: per-currency rows stay separate and no row carries a combined total", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const beforeRows = await PlatformAnalyticsRepository.getRevenueStats(now, tx);
      const baselineTotalOf = (currency: string): bigint =>
        centsOf(beforeRows.find(row => row.currency === currency)?.totalAmount ?? "0");

      const studentUser = await createTestUser(tx);
      const student = await createTestStudent(tx, studentUser.id);
      await createTestStudentPayment(tx, student.id, {
        amount: "10.00",
        currency: "JPY",
        status: PaymentStatus.Paid,
      });
      await createTestStudentPayment(tx, student.id, {
        amount: "20.00",
        currency: "AED",
        status: PaymentStatus.Paid,
      });

      const afterRows = await PlatformAnalyticsRepository.getRevenueStats(now, tx);
      const jpy = afterRows.find(row => row.currency === "JPY");
      const aed = afterRows.find(row => row.currency === "AED");
      if (!jpy || !aed) {
        throw new Error("expected separate JPY and AED revenue rows");
      }
      expect(jpy.totalAmount).toBe(formatCents(baselineTotalOf("JPY") + centsOf("10.00")));
      expect(aed.totalAmount).toBe(formatCents(baselineTotalOf("AED") + centsOf("20.00")));

      // The combined JPY+AED figure appears NOWHERE in the result set — the
      // per-currency GROUP BY makes cross-currency sums structurally
      // impossible (neither individual row can ever equal the merged total).
      const combined = formatCents(baselineTotalOf("JPY") + baselineTotalOf("AED") + centsOf("30.00"));
      expect(afterRows.some(row => row.totalAmount === combined)).toBe(false);
    });
  });

  test("canonical AdminUserStatsReturnType key set is pinned and the analytics users section is a runtime superset", () => {
    // Compile-time pin: this literal only type-checks while the canonical
    // type holds exactly these ten readonly counters.
    const statsSample: AdminUserStatsReturnType = {
      totalCount: 0,
      activeCount: 0,
      suspendedCount: 0,
      blockedCount: 0,
      deletedCount: 0,
      adminsCount: 0,
      teachersCount: 0,
      studentsCount: 0,
      parentsCount: 0,
      newThisWeekCount: 0,
    };
    expect(Object.keys(statsSample).length).toBe(ADMIN_USER_STATS_KEYS.length);
    const statsKeyList: string[] = [...ADMIN_USER_STATS_KEYS];
    expect(statsKeyList.sort()).toEqual(Object.keys(statsSample).sort());

    // Runtime superset smoke: the analytics users section composes the ten
    // counters VERBATIM plus exactly one new presence counter.
    const usersSection: PlatformAnalyticsUsersReturnType = { ...statsSample, recentlyActive24h: 7 };
    expect(Object.keys(usersSection)).toEqual(expect.arrayContaining(statsKeyList));
    expect(Object.keys(usersSection).length).toBe(ADMIN_USER_STATS_KEYS.length + 1);
    expect(usersSection.recentlyActive24h).toBe(7);
  });

  test("tx passthrough: an explicit tx observes its own uncommitted rows while the global executor cannot see them", async () => {
    await runInRollback(async tx => {
      const now = new Date();

      // Committed-state read on the global executor (no tx argument).
      const committedBefore = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now);

      const user = await createTestUser(tx, { lastActiveAt: new Date(now.getTime() - 60_000) });

      // The uncommitted INSERT is invisible on the global executor…
      const committedAfter = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now);
      expect(committedAfter).toBe(committedBefore);
      // …and visible through the explicit tx passthrough.
      const insideTx = await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx);
      expect(insideTx).toBe(committedBefore + 1);
      expect(user.id).toBeGreaterThan(0);
    });
  });

  test("factory row round-trip: money strings and instants survive the write path byte-exact", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const paymentCreatedAt = new Date(now.getTime() - 3_600_000);
      const studentUser = await createTestUser(tx);
      const student = await createTestStudent(tx, studentUser.id);

      const payment = await createTestStudentPayment(tx, student.id, {
        amount: "123.45",
        currency: "JPY",
        status: PaymentStatus.Paid,
        paymentGateway: PaymentGateway.OfflineCash,
        createdAt: paymentCreatedAt,
      });
      const [persistedPayment] = await tx.select().from(studentPayments).where(eq(studentPayments.id, payment.id));
      if (!persistedPayment) {
        throw new Error("expected the payment row to round-trip");
      }
      expect(persistedPayment.amount).toBe("123.45"); // exact decimal STRING — never a float
      expect(persistedPayment.currency).toBe("JPY");
      expect(persistedPayment.status).toBe(PaymentStatus.Paid);
      expect(persistedPayment.paymentGateway).toBe(PaymentGateway.OfflineCash);
      expect(persistedPayment.createdAt.getTime()).toBe(paymentCreatedAt.getTime());

      const cast = await createSessionCast(tx);
      const sessionCreatedAt = new Date(now.getTime() - 60_000);
      const created = await createTestSession(tx, cast.teacherId, cast.studentId, {
        status: SessionStatus.Completed,
        createdAt: sessionCreatedAt,
      });
      const [persistedSession] = await tx.select().from(session).where(eq(session.id, created.id));
      if (!persistedSession) {
        throw new Error("expected the session row to round-trip");
      }
      expect(persistedSession.status).toBe(SessionStatus.Completed);
      expect(persistedSession.createdAt.getTime()).toBe(sessionCreatedAt.getTime());
      expect(persistedSession.confirmedByStudentAt).toBeNull();
    });
  });

  test("read purity: invoking all ten methods leaves every touched table's row count unchanged", async () => {
    await runInRollback(async tx => {
      const now = new Date();
      const tables: PgTable[] = [
        users,
        session,
        subscriptions,
        studentPayments,
        teacherTransaction,
        reports,
        evaluations,
        teacher,
      ];
      const beforeCounts = new Map<PgTable, number>();
      for (const table of tables) {
        beforeCounts.set(table, await countRows(tx, table));
      }

      await PlatformAnalyticsRepository.countRecentlyActiveUsers(now, tx);
      await PlatformAnalyticsRepository.getSessionStats(now, tx);
      await PlatformAnalyticsRepository.getSessionDailyTrend(now, tx);
      await PlatformAnalyticsRepository.getRevenueStats(now, tx);
      await PlatformAnalyticsRepository.getRevenueDailyTrend(now, tx);
      await PlatformAnalyticsRepository.getSubscriptionStats(now, tx);
      await PlatformAnalyticsRepository.countOfflineActivations(tx);
      await PlatformAnalyticsRepository.getTeacherPresenceStats(tx);
      await PlatformAnalyticsRepository.getRatingStats(tx);
      await PlatformAnalyticsRepository.getHealthIndicators(tx);

      for (const table of tables) {
        const baseline = beforeCounts.get(table) ?? -1; // set above — never -1
        expect(await countRows(tx, table)).toBe(baseline);
      }
    });
  });
});
