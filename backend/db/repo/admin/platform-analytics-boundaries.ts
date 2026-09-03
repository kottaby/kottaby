/**
 * Platform-analytics UTC boundary oracles — the pure calendar math shared
 * by the platform-analytics repositories (DEV3-022c, extracted per the
 * Fix-C review pass so the repo file clears its lint line budget).
 *
 * REQ-024 discipline: ALL calendar math is UTC-only. `Date.UTC` +
 * `getUTC*` everywhere — the server's local timezone NEVER influences a
 * window boundary. These helpers are the single source of the three
 * boundary instants the snapshot windows derive from (`utcDayStart` /
 * `isoWeekStart` / `utcMonthStart`); the service layer imports them via the
 * repo barrel and binds the derived boundaries into its predicates (D2 —
 * the repos stay clock-free).
 */

/** Milliseconds in one day — window arithmetic building block. */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Midnight-UTC start of `now`'s day (REQ-024 — UTC-only calendar math).
 */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Midnight-UTC start of `now`'s ISO week (Monday — REQ-071 week oracle).
 */
export function isoWeekStart(now: Date): Date {
  const dayStart = utcDayStart(now);
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * ONE_DAY_MS);
}

/**
 * Midnight-UTC start of `now`'s month (REQ-071 month oracle).
 */
export function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Midnight-UTC of `now`'s day minus 29 days — the OLDEST bucket of the
 * 30-bucket daily trend skeleton (`buildDailySkeleton`'s first entry).
 * Both trend queries align their selection cutoff to this instant so every
 * selected row maps 1:1 into an output bucket and the service merge can
 * never silently drop a partial-oldest-bucket row (Fix-C finding 6).
 */
export function trendSkeletonCutoff(now: Date): Date {
  return new Date(utcDayStart(now).getTime() - 29 * ONE_DAY_MS);
}
