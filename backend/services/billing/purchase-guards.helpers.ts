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

import { ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type { PlanSelectType } from "@/backend/types";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

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

/**
 * Re-compares the FRESH in-transaction plan row against the price/currency
 * the gateway checkout was created with (both carried verbatim from the
 * pre-checkout plan read). An admin price or currency change between the
 * checkout creation and this transaction would otherwise commit a pending
 * pair whose stored amount disagrees with the amount the provider actually
 * charged — a settlement guaranteed to quarantine. The mismatch is the
 * generic localized validation denial (machine code `PLAN_PRICE_CHANGED`,
 * field `planId`) thrown BEFORE any row write, so the transaction rolls
 * back with nothing to release.
 *
 * The abandoned checkout session needs no compensation inside this flow:
 * the built-in mock provider is stateless (a checkout is a pure descriptor
 * mint — no provider-side session exists to void). A stateful provider
 * integration owns its own abandoned-session compensation out-of-band.
 *
 * `logMessage` lets each purchase flow attribute the domain log to its own
 * surface while the denial contract stays byte-identical across flows.
 */
export function assertPlanUnchangedSinceCheckout(
  freshPlan: PlanSelectType,
  checkoutAmount: string,
  checkoutCurrency: string,
  t: ErrorsLabels,
  logMessage: string
): void {
  if (freshPlan.price === checkoutAmount && freshPlan.currency === checkoutCurrency) {
    return;
  }
  logger.logDomainError(logMessage, {
    code: "PLAN_PRICE_CHANGED",
    entity: "plans",
    entityId: freshPlan.id,
  });
  throw new ValidationError(t.validation, [{ field: "planId", code: "PLAN_PRICE_CHANGED", message: t.validation }]);
}
