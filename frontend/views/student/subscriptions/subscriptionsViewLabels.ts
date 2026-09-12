/**
 * subscriptionsViewLabels — the localized date formatting for the
 * my-subscriptions rows (the `formatApplicantDate` precedent: fixed UTC
 * options, byte-deterministic across environments, only exact `"en"`
 * selects English — every other input falls back to `"ar"`).
 */
const SUBSCRIPTION_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

/**
 * Formats one ISO-8601 instant into a deterministic, locale-aware date
 * stamp (UTC components; Arabic-Indic digits under `ar`, Latin digits
 * under `en`).
 *
 * @param iso - ISO-8601 instant (GraphQL exposes subscription timestamps as
 *   nullable ISO-8601 UTC strings — pass only non-null values).
 * @param locale - app locale ("ar" | "en"; other inputs resolve to "ar").
 */
export function formatSubscriptionDate(iso: string, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en" : "ar", SUBSCRIPTION_DATE_OPTIONS);
  return formatter.format(new Date(iso));
}
