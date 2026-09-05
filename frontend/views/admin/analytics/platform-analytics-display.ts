/**
 * Pure display plumbing for the platform-analytics surfaces — the shared
 * metric-grid and trends-row layout tokens, exact-decimal money rendering,
 * locale-aware count/rating formatting, and the per-currency trend pivot.
 *
 * EVERYTHING here is display-only:
 *  - money leaves arrive as exact decimal STRINGS and are grouped by string
 *    manipulation alone — they are NEVER parsed to float for any math;
 *  - counts/averages go through `Intl.NumberFormat` for digit localization
 *    (presentation only; the wire values are never rewritten);
 *  - the revenue-trend pivot converts the decimal string into the numeric
 *    plot coordinate `recharts` requires (bar geometry) — no aggregation,
 *    comparison, or arithmetic happens anywhere, and the revenue table
 *    keeps the wire strings verbatim.
 */

import type { CSSObject, Theme } from "@mui/material/styles";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily } from "@/frontend/graphql/generated/gql/graphql";

/** Shared metric-card grid: 4 columns desktop → 2 tablet → 1 mobile. */
export const METRIC_GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
  gap: { xs: 2, md: 3 },
} as const;

/** Shared trends-row grid: the two trend charts side-by-side desktop → stacked below `lg`. */
export const TRENDS_GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
  gap: { xs: 2, md: 3 },
} as const;

/** Honest placeholder for a NULL metric — an em-dash, never a fabricated `0`. */
export const NULL_METRIC_PLACEHOLDER = "—";

/**
 * Shared card hover-lift feedback (metric cards + trend cards): a 2px
 * upward lift with a border/shadow upgrade over the theme's short easing —
 * the pointer gets a clear "this surface is alive" response while the
 * layout stays put (transform never triggers reflow). Tokens only; the
 * caller spreads this into its existing `sx` theme callback.
 */
export function cardHoverSx(theme: Theme): CSSObject {
  return {
    transition: theme.transitions.create(["transform", "box-shadow", "border-color"], {
      duration: theme.transitions.duration.short,
      easing: theme.transitions.easing.easeOut,
    }),
    "&:hover": {
      transform: "translateY(-2px)",
      borderColor: theme.palette.border.main,
      boxShadow: theme.palette.shadow.cardHover,
    },
  };
}

/** Tabular figures for metric values — digit columns stay aligned across rows/refreshes. */
export const TABULAR_NUMS_SX = { fontVariantNumeric: "tabular-nums" } as const;

/** Fixed body height of the trend plot areas (skeletons match it — no layout shift). */
export const TREND_CHART_BODY_HEIGHT = 300;

/** Minimum in-flow width of a trend plot before the region scrolls horizontally. */
export const TREND_CHART_MIN_WIDTH = 520;

/**
 * Groups the integer digits of an exact decimal string (`"1234567.89"` →
 * `"1,234,567.89"`) WITHOUT ever constructing a number — a character loop
 * keeps the value byte-exact and float-free. Sign and fraction digits are
 * preserved verbatim.
 */
export function formatMoneyAmount(value: string): string {
  const sign = value.startsWith("-") ? "-" : "";
  const unsigned = sign ? value.slice(1) : value;
  const dotIndex = unsigned.indexOf(".");
  const integerPart = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex);
  const fractionPart = dotIndex === -1 ? "" : unsigned.slice(dotIndex);

  let grouped = "";
  for (let index = 0; index < integerPart.length; index += 1) {
    const remaining = integerPart.length - index;
    if (index > 0 && remaining % 3 === 0) {
      grouped += ",";
    }
    grouped += integerPart[index];
  }
  return `${sign}${grouped}${fractionPart}`;
}

/** Locale-aware display of a plain count (digit localization only). */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en" : "ar").format(value);
}

/**
 * Locale-aware display of a rating average (up to two fraction digits,
 * no grouping — averages are small). Presentation only.
 */
export function formatRatingAverage(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en" : "ar", {
    maximumFractionDigits: 2,
  }).format(value);
}

/** One pivoted trend row: the UTC bucket plus one numeric series per currency. */
export interface RevenueTrendDatum {
  readonly bucketStart: string;
  // Mutable-by-design: the pivot writes one series column per currency.
  [currency: string]: string | number;
}

/**
 * Pivots the wire's per-currency daily rows (`{bucketStart, currency,
 * amount}`) into the row-per-bucket shape `recharts` consumes: one numeric
 * series column per currency (first-appearance wire order). See the module
 * doc for the display-only posture of the `Number(amount)` coordinate.
 */
export function pivotRevenueTrend(
  rows: ReadonlyArray<AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenueTrendDaily>
): { readonly currencies: readonly string[]; readonly data: readonly RevenueTrendDatum[] } {
  const currencies: string[] = [];
  const byBucket = new Map<string, RevenueTrendDatum>();

  for (const row of rows) {
    if (!byBucket.has(row.bucketStart)) {
      byBucket.set(row.bucketStart, { bucketStart: row.bucketStart });
    }
    if (!currencies.includes(row.currency)) {
      currencies.push(row.currency);
    }
    const datum = byBucket.get(row.bucketStart);
    if (datum) {
      datum[row.currency] = Number(row.amount);
    }
  }

  return { currencies, data: [...byBucket.values()] };
}
