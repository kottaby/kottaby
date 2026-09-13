/**
 * Purchase-guard helpers — the shared pre-transaction validation gates used
 * by every purchase flow that mints an idempotency-claimed pending pair.
 *
 * Both gates run at the service's pre-DB boundary, BEFORE any database work:
 * an invalid identifier or an uncarryable key is rejected as a localized
 * validation denial without touching a connection, so no claim row, no
 * subscription, and no payment can ever be written for a malformed call.
 *
 * Extracted here (from the subscription purchase service) so every consumer
 * imports the SAME predicate instead of growing private copies — the guards
 * are a single behavioral contract: one caller-id rule, one key rule.
 */

/** The idempotency claim column's maximum key length (varchar(128) backstop). */
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * Positive safe-integer guard for caller-supplied identifiers (no casts).
 *
 * Identity reaches purchase services as a number resolved server-side from
 * the authenticated context; this predicate proves it is a usable primary
 * key before it can bind to any query — `NaN`, non-integers, negatives,
 * zero, and values beyond `Number.MAX_SAFE_INTEGER` all fail closed (none
 * of them may round-trip into a parameterized id comparison).
 */
export function isPositiveSafeId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * The carryable-key check: a claimable idempotency key is present and
 * within the claim column's length. An absent key is a validation reject
 * BEFORE any database work (the claim insert would otherwise fail on a
 * NOT NULL or an over-length value deep inside the transaction). The key
 * is never trimmed — an opaque value is carried verbatim.
 */
export function isCarryableIdempotencyKey(key: string | null): key is string {
  return key !== null && key.length > 0 && key.length <= MAX_IDEMPOTENCY_KEY_LENGTH;
}
