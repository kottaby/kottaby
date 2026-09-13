/**
 * paymentFilterDates — the date-draft parsing of the payments audit filter
 * bar (`/admin/finances`, payments tab): native `date` input values
 * committed as inclusive from-midnight / exclusive to-midnight UTC
 * instants. Malformed or impossible calendar values normalize to `null`
 * (the `Date.UTC` rollover guard — an unparseable draft never constrains
 * the query).
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * Parses a `YYYY-MM-DD` date-input value into UTC midnight. Malformed or
 * impossible calendar values normalize to `null` (the `Date.UTC` rollover
 * guard — an unparseable draft never constrains the query).
 */
export function parseUtcDayStart(value: string): Date | null {
  const match = DAY_PATTERN.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** The exclusive wire boundary for the `to` calendar day (UTC has no DST). */
export function parseUtcDayEndExclusive(value: string): Date | null {
  const start = parseUtcDayStart(value);
  return start === null ? null : new Date(start.getTime() + DAY_MS);
}
