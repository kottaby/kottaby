/**
 * planPresentation — display helpers for the student plan catalog.
 *
 * Money rendering follows the wire discipline: the price arrives as an
 * exact decimal STRING and the amount is assembled by string manipulation
 * alone (the analytics `formatMoneyAmount` precedent) — never parsed to a
 * float, never re-rounded. The currency label stays verbatim from the
 * server value.
 */

/**
 * Formats one exact-decimal amount with its currency label
 * (`"1200.00"`, `"EGP"` → `"1,200.00 EGP"` in en / `"١,٢٠٠٫٠٠ EGP"`-shaped
 * digit localization in ar). The fraction digits and any sign stay
 * verbatim from the wire value.
 */
export function formatPlanAmount(amount: string, currency: string): string {
  const sign = amount.startsWith("-") ? "-" : "";
  const unsigned = sign ? amount.slice(1) : amount;
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

  return `${sign}${grouped}${fractionPart} ${currency}`;
}
