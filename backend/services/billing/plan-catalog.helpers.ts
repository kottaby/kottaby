/**
 * Plan catalog validation helpers — pure field validators shared by the
 * `PlanCatalogService` write paths.
 *
 * Every validator follows the same contract: an absent field (`undefined`)
 * skips validation, a valid value is returned in `value`, and an invalid
 * value is returned as an `ApiFieldErrorType` the caller aggregates into a
 * single localized `ValidationError`. No I/O happens here — the service owns
 * orchestration, persistence, and logging.
 */

import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { ConflictError, ValidationError } from "@/backend/lib/errors";
import type { ApiFieldErrorType, PlanSubmitInput, PlanUpdateInput } from "@/backend/types";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

const PRICE_REGEX = /^\d{1,8}(\.\d{1,2})?$/;
const CURRENCY_REGEX = /^[A-Z]{3}$/;

/** Runtime membership probe over the lane vocabulary (mirrors the `subscription_credit_lane` pgEnum). */
const SUBSCRIPTION_CREDIT_LANE_VALUES: readonly string[] = Object.values(SubscriptionCreditLane);

/**
 * Type guard for checking PostgreSQL error codes across the cause chain.
 */
function isPgErrorWithCode(error: unknown, code: string): boolean {
  if (typeof error === "object" && error !== null) {
    if ("code" in error && error.code === code) {
      return true;
    }
    if ("cause" in error) {
      return isPgErrorWithCode(error.cause, code);
    }
  }
  return false;
}

/**
 * Maps PostgreSQL violations from plan writes onto their canonical domain
 * errors: uniqueness conflicts become `ConflictError`, check-constraint
 * failures become `ValidationError`. Any other failure is returned untouched
 * so the caller rethrows it verbatim.
 */
export function toPlanWriteDomainError(error: unknown, tErrors: ErrorsLabels): unknown {
  if (isPgErrorWithCode(error, "23505")) {
    return new ConflictError(tErrors.conflict, { cause: error });
  }
  if (isPgErrorWithCode(error, "23514")) {
    return new ValidationError("VALIDATION", tErrors.validation, { cause: error });
  }
  return error;
}

function validateTitleField(
  title: string | undefined,
  tErrors: ErrorsLabels
): { value?: string; error?: ApiFieldErrorType } {
  if (title === undefined) return {};
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return {
      error: {
        field: "title",
        code: "PLAN_TITLE_EMPTY",
        message: tErrors.planCatalog.planTitleRequired,
      },
    };
  }
  if (trimmed.length > 255) {
    return {
      error: {
        field: "title",
        code: "PLAN_TITLE_TOO_LONG",
        message: tErrors.planCatalog.planTitleTooLong,
      },
    };
  }
  return { value: trimmed };
}

function validateSessionCountField(
  count: number | undefined,
  tErrors: ErrorsLabels
): { value?: number; error?: ApiFieldErrorType } {
  if (count === undefined) return {};
  if (!Number.isInteger(count) || count < 1) {
    return {
      error: {
        field: "sessionCount",
        code: "PLAN_SESSION_COUNT_INVALID",
        message: tErrors.planCatalog.planSessionCountInvalid,
      },
    };
  }
  return { value: count };
}

function validatePriceField(
  price: string | undefined,
  tErrors: ErrorsLabels
): { value?: string; error?: ApiFieldErrorType } {
  if (price === undefined) return {};
  const trimmed = price.trim();
  if (!PRICE_REGEX.test(trimmed) || Number.parseFloat(trimmed) < 0) {
    return {
      error: {
        field: "price",
        code: "PLAN_PRICE_INVALID",
        message: tErrors.planCatalog.planPriceInvalid,
      },
    };
  }
  return { value: trimmed };
}

function validateCurrencyField(
  currency: string | undefined,
  tErrors: ErrorsLabels
): { value?: string; error?: ApiFieldErrorType } {
  if (currency === undefined) return {};
  const trimmed = currency.trim();
  if (!CURRENCY_REGEX.test(trimmed)) {
    return {
      error: {
        field: "currency",
        code: "PLAN_CURRENCY_INVALID",
        message: tErrors.planCatalog.planCurrencyInvalid,
      },
    };
  }
  return { value: trimmed.toUpperCase() };
}

function validateIntervalDaysField(
  days: number | undefined,
  tErrors: ErrorsLabels
): { value?: number; error?: ApiFieldErrorType } {
  if (days === undefined) return {};
  if (!Number.isInteger(days) || days < 1) {
    return {
      error: {
        field: "intervalDays",
        code: "PLAN_INTERVAL_DAYS_INVALID",
        message: tErrors.planCatalog.planIntervalDaysInvalid,
      },
    };
  }
  return { value: days };
}

/**
 * Validates the plan's balance lane: only a `SubscriptionCreditLane` member or
 * an explicit `null` (clearing the lane) is accepted. An absent field
 * (`undefined`) skips validation entirely. Any other value — e.g. an unknown
 * string smuggled in by a non-GraphQL caller, which the GraphQL enum coercion
 * would otherwise block — is rejected so an unroutable lane can never be
 * persisted: activation crediting resolves a balance column from this value,
 * and an unknown lane would credit nothing.
 */
function validateBalanceLaneField(
  lane: SubscriptionCreditLane | null | undefined,
  tErrors: ErrorsLabels
): { value?: SubscriptionCreditLane | null; error?: ApiFieldErrorType } {
  if (lane === undefined) return {};
  if (lane === null) return { value: null };
  if (!SUBSCRIPTION_CREDIT_LANE_VALUES.includes(lane)) {
    return {
      error: {
        field: "balanceLane",
        code: "PLAN_BALANCE_LANE_INVALID",
        message: tErrors.validation,
      },
    };
  }
  return { value: lane };
}

/**
 * Validates plan submit/create input fields.
 */
export function validatePlanInput(input: PlanSubmitInput, tErrors: ErrorsLabels): void {
  const fields: ApiFieldErrorType[] = [];

  const titleResult = validateTitleField(input.title, tErrors);
  if (titleResult.error) fields.push(titleResult.error);

  const sessionResult = validateSessionCountField(input.sessionCount, tErrors);
  if (sessionResult.error) fields.push(sessionResult.error);

  const priceResult = validatePriceField(input.price, tErrors);
  if (priceResult.error) fields.push(priceResult.error);

  const currencyResult = validateCurrencyField(input.currency, tErrors);
  if (currencyResult.error) fields.push(currencyResult.error);

  const intervalResult = validateIntervalDaysField(input.intervalDays, tErrors);
  if (intervalResult.error) fields.push(intervalResult.error);

  const laneResult = validateBalanceLaneField(input.balanceLane, tErrors);
  if (laneResult.error) fields.push(laneResult.error);

  if (fields.length > 0) {
    throw new ValidationError(tErrors.validation, fields);
  }
}

interface ValidatedPatchResult {
  updatePatch: PlanUpdateInput;
  fields: ApiFieldErrorType[];
}

/**
 * Validates and projects supplied patch fields for updating a plan.
 */
export function validateAndExtractPlanPatch(patch: PlanUpdateInput, tErrors: ErrorsLabels): ValidatedPatchResult {
  const fields: ApiFieldErrorType[] = [];

  const titleResult = validateTitleField(patch.title, tErrors);
  if (titleResult.error) fields.push(titleResult.error);

  const sessionResult = validateSessionCountField(patch.sessionCount, tErrors);
  if (sessionResult.error) fields.push(sessionResult.error);

  const priceResult = validatePriceField(patch.price, tErrors);
  if (priceResult.error) fields.push(priceResult.error);

  const currencyResult = validateCurrencyField(patch.currency, tErrors);
  if (currencyResult.error) fields.push(currencyResult.error);

  const intervalResult = validateIntervalDaysField(patch.intervalDays, tErrors);
  if (intervalResult.error) fields.push(intervalResult.error);

  const laneResult = validateBalanceLaneField(patch.balanceLane, tErrors);
  if (laneResult.error) fields.push(laneResult.error);

  const updatePatch: PlanUpdateInput = {
    ...(titleResult.value !== undefined && { title: titleResult.value }),
    ...(sessionResult.value !== undefined && { sessionCount: sessionResult.value }),
    ...(priceResult.value !== undefined && { price: priceResult.value }),
    ...(currencyResult.value !== undefined && { currency: currencyResult.value }),
    ...(intervalResult.value !== undefined && { intervalDays: intervalResult.value }),
    // An explicit null projects into the patch so the stored lane is cleared;
    // an absent field stays out of the patch and leaves the lane untouched.
    ...(laneResult.value !== undefined && { balanceLane: laneResult.value }),
  };

  return { updatePatch, fields };
}
