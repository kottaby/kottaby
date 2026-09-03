/**
 * Snapshot CSV serialization — PURE client-side builder for the admin
 * platform-analytics export (DEV3-022c, Fix-D).
 *
 * Read-only contract discipline (the server surface stays untouched):
 *  - The builder consumes the ALREADY-FETCHED snapshot only — zero extra
 *    reads, zero writes, zero audit rows.
 *  - Money crosses as EXACT DECIMAL STRINGS and is emitted VERBATIM —
 *    never parsed into a number, never summed, never reformatted
 *    (REQ-014/D3/REQ-023).
 *  - Nullable rating averages serialize as EMPTY cells (honest emptiness,
 *    REQ-018) — never a fabricated 0.
 *  - A `generated_at` provenance row pins the snapshot instant the export
 *    describes (REQ-011 traceability).
 *  - RFC 4180 mechanics: UTF-8 BOM prefix, CRLF line endings, minimal
 *    quoting (fields containing commas, quotes, CR, or LF are wrapped in
 *    quotes with interior quotes doubled).
 *
 * Labels come from the `analytics` namespace so the payload language
 * follows the locale the CALLER resolved (decoupled from the UI locale by
 * the header control in a later round). Day cells are the UTC `YYYY-MM-DD`
 * of each trend bucket (REQ-024 — UTC-only calendar math).
 */

import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

/** The structural snapshot shape the builder consumes (client-facing codegen shape). */
export interface SnapshotCsvSnapshot {
  readonly generatedAt: string | Date;
  readonly users: {
    readonly totalCount: number;
    readonly activeCount: number;
    readonly suspendedCount: number;
    readonly blockedCount: number;
    readonly deletedCount: number;
    readonly adminsCount: number;
    readonly teachersCount: number;
    readonly studentsCount: number;
    readonly parentsCount: number;
    readonly newThisWeekCount: number;
    readonly recentlyActive24h: number;
  };
  readonly sessions: {
    readonly total: number;
    readonly today: number;
    readonly thisWeek: number;
    readonly thisMonth: number;
    readonly scheduled: number;
    readonly started: number;
    readonly completed: number;
    readonly cancelled: number;
    readonly disputed: number;
    readonly awaitingConfirmation: number;
  };
  readonly revenue: {
    readonly gatewayRevenueByCurrency: ReadonlyArray<{
      readonly currency: string;
      readonly totalAmount: string;
      readonly last30DaysAmount: string;
      readonly paidPaymentsCount: number;
    }>;
    readonly offlineActivationsCount: number;
  };
  readonly subscriptions: {
    readonly total: number;
    readonly active: number;
    readonly pending: number;
    readonly expired: number;
    readonly cancelled: number;
    readonly suspended: number;
    readonly activeInWindowNow: number;
  };
  readonly teachers: {
    readonly certifiedCount: number;
    readonly evaluatorCount: number;
    readonly onlineNowCount: number;
  };
  readonly ratings: {
    readonly averageSessionRating: number | null;
    readonly sessionRatingsCount: number;
    readonly averageEvaluationScore: number | null;
    readonly evaluationScoresCount: number;
  };
  readonly health: {
    readonly pendingDisputes: number;
    readonly pendingWithdrawals: number;
  };
  readonly sessionTrendDaily: ReadonlyArray<{ readonly bucketStart: string | Date; readonly sessionCount: number }>;
  readonly revenueTrendDaily: ReadonlyArray<{
    readonly bucketStart: string | Date;
    readonly currency: string;
    readonly amount: string;
  }>;
}

/** UTF-8 BOM — Excel's hint that the payload is UTF-8 (Arabic labels survive). */
const BOM = "﻿";

/** RFC 4180 field escaping — quote only when the field demands it. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** One CSV record: three escaped fields joined by commas, CRLF-terminated. */
function record(section: string, metric: string, value: string): string {
  return `${csvField(section)},${csvField(metric)},${csvField(value)}\r\n`;
}

/** The UTC `YYYY-MM-DD` of a trend bucket (string ISO or Date). */
function utcDayKey(bucketStart: string | Date): string {
  const instant = bucketStart instanceof Date ? bucketStart : new Date(bucketStart);
  return instant.toISOString().slice(0, 10);
}

/** Renders a nullable rating average — `null` becomes the EMPTY cell. */
function ratingCell(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * Builds the full snapshot CSV text (BOM included) from the fetched
 * snapshot + resolved labels. Pure: no DOM, no fetch, no clock reads —
 * every byte is derived from the arguments (deterministic, testable).
 */
export function buildSnapshotCsv(snapshot: SnapshotCsvSnapshot, labels: AnalyticsLabels): string {
  const rows: string[] = [];

  rows.push(record("section", "metric", "value"));
  rows.push(record("snapshot", "generated_at", new Date(snapshot.generatedAt).toISOString()));

  rows.push(record("users", labels.totalUsersLabel, String(snapshot.users.totalCount)));
  rows.push(record("users", labels.activeUsersLabel, String(snapshot.users.activeCount)));
  rows.push(record("users", labels.suspendedUsersLabel, String(snapshot.users.suspendedCount)));
  rows.push(record("users", labels.blockedUsersLabel, String(snapshot.users.blockedCount)));
  rows.push(record("users", labels.deletedUsersLabel, String(snapshot.users.deletedCount)));
  rows.push(record("users", labels.adminsCountLabel, String(snapshot.users.adminsCount)));
  rows.push(record("users", labels.teachersCountLabel, String(snapshot.users.teachersCount)));
  rows.push(record("users", labels.studentsCountLabel, String(snapshot.users.studentsCount)));
  rows.push(record("users", labels.parentsCountLabel, String(snapshot.users.parentsCount)));
  rows.push(record("users", labels.newThisWeekUsersLabel, String(snapshot.users.newThisWeekCount)));
  rows.push(record("users", labels.recentlyActive24hLabel, String(snapshot.users.recentlyActive24h)));

  rows.push(record("sessions", labels.totalSessionsLabel, String(snapshot.sessions.total)));
  rows.push(record("sessions", labels.sessionsTodayLabel, String(snapshot.sessions.today)));
  rows.push(record("sessions", labels.sessionsThisWeekLabel, String(snapshot.sessions.thisWeek)));
  rows.push(record("sessions", labels.sessionsThisMonthLabel, String(snapshot.sessions.thisMonth)));
  rows.push(record("sessions", labels.scheduledSessionsLabel, String(snapshot.sessions.scheduled)));
  rows.push(record("sessions", labels.startedSessionsLabel, String(snapshot.sessions.started)));
  rows.push(record("sessions", labels.completedSessionsLabel, String(snapshot.sessions.completed)));
  rows.push(record("sessions", labels.cancelledSessionsLabel, String(snapshot.sessions.cancelled)));
  rows.push(record("sessions", labels.disputedSessionsLabel, String(snapshot.sessions.disputed)));
  rows.push(record("sessions", labels.awaitingConfirmationLabel, String(snapshot.sessions.awaitingConfirmation)));

  rows.push(record("revenue", labels.offlineActivationsLabel, String(snapshot.revenue.offlineActivationsCount)));
  for (const bucket of snapshot.revenue.gatewayRevenueByCurrency) {
    rows.push(record("revenue", `${bucket.currency} — ${labels.totalAmountHeader}`, bucket.totalAmount));
    rows.push(record("revenue", `${bucket.currency} — ${labels.last30DaysAmountHeader}`, bucket.last30DaysAmount));
    rows.push(
      record("revenue", `${bucket.currency} — ${labels.paidPaymentsCountHeader}`, String(bucket.paidPaymentsCount))
    );
  }

  rows.push(record("subscriptions", labels.totalSubscriptionsLabel, String(snapshot.subscriptions.total)));
  rows.push(record("subscriptions", labels.activeSubscriptionsLabel, String(snapshot.subscriptions.active)));
  rows.push(record("subscriptions", labels.pendingSubscriptionsLabel, String(snapshot.subscriptions.pending)));
  rows.push(record("subscriptions", labels.expiredSubscriptionsLabel, String(snapshot.subscriptions.expired)));
  rows.push(record("subscriptions", labels.cancelledSubscriptionsLabel, String(snapshot.subscriptions.cancelled)));
  rows.push(record("subscriptions", labels.suspendedSubscriptionsLabel, String(snapshot.subscriptions.suspended)));
  rows.push(record("subscriptions", labels.activeInWindowNowLabel, String(snapshot.subscriptions.activeInWindowNow)));

  rows.push(record("teachers", labels.certifiedTeachersLabel, String(snapshot.teachers.certifiedCount)));
  rows.push(record("teachers", labels.evaluatorTeachersLabel, String(snapshot.teachers.evaluatorCount)));
  rows.push(record("teachers", labels.teachersOnlineNowLabel, String(snapshot.teachers.onlineNowCount)));

  rows.push(record("ratings", labels.averageSessionRatingLabel, ratingCell(snapshot.ratings.averageSessionRating)));
  rows.push(record("ratings", labels.sessionRatingsCountLabel, String(snapshot.ratings.sessionRatingsCount)));
  rows.push(record("ratings", labels.averageEvaluationScoreLabel, ratingCell(snapshot.ratings.averageEvaluationScore)));
  rows.push(record("ratings", labels.evaluationScoresCountLabel, String(snapshot.ratings.evaluationScoresCount)));

  rows.push(record("health", labels.pendingDisputesLabel, String(snapshot.health.pendingDisputes)));
  rows.push(record("health", labels.pendingWithdrawalsLabel, String(snapshot.health.pendingWithdrawals)));

  // Trend blocks — fixed data-schema headers (no locale copy): the raw
  // buckets are the data contract, not UI copy.
  rows.push("trend_sessions,\r\n");
  rows.push("day,sessions\r\n");
  for (const point of snapshot.sessionTrendDaily) {
    rows.push(`${utcDayKey(point.bucketStart)},${point.sessionCount}\r\n`);
  }

  rows.push("trend_revenue,\r\n");
  rows.push("day,currency,amount\r\n");
  for (const point of snapshot.revenueTrendDaily) {
    rows.push(`${utcDayKey(point.bucketStart)},${csvField(point.currency)},${point.amount}\r\n`);
  }

  return `${BOM}${rows.join("")}`;
}
