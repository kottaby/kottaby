/**
 * Shared purchase-boundary guards — the identifier and idempotency-key
 * preconditions every purchase flow asserts at its pre-DB boundary.
 *
 * Both checks are behavior-critical and shared verbatim by every purchase
 * surface (the student subscription purchase and the teacher verification
 * purchase): one canonical copy lives here so the boundary semantics can
 * never drift between flows.
 *
 *  - `isPositiveSafeId` — a caller-supplied identifier must be a positive
 *    safe integer (no casts, no coercion) before it may reach any query.
 *  - `isCarryableIdempotencyKey` — a claimable idempotency key is present
 *    and within the claim column's length. An absent key is a validation
 *    reject BEFORE any database work (the claim insert would otherwise fail
 *    on a NOT NULL or an over-length value deep inside the transaction).
 *    The key is never trimmed — an opaque value is carried verbatim.
 */

/** The idempotency claim column's maximum key length (varchar(128) backstop). */
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/** Positive safe-integer guard for caller-supplied identifiers (no casts). */
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
