/**
 * PlanCatalog helpers — pure validation + audit-contract composition for the
 * plan-catalog service (field-by-field input validation, patch projection,
 * and the plan audit-log write contract).
 *
 * Extracted from `plan-catalog.service.ts` to keep the service namespace
 * focused on orchestration; consumed directly by the service via the
 * sibling path (mirroring `user-management.helpers.ts` — helpers stay out
 * of the domain barrel because they are service-internal).
 *
 * Disciplines enforced here:
 *  - BOPLA: patch projection is field-by-field (never a spread of transport
 *    input) so server-controlled fields are structurally absent from the
 *    write payload.
 *  - Audit contract: `details` carries plan field names + primitive values
 *    only — never contact-PII, never credentials.
 */

import type { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { ValidationError } from "@/backend/lib/errors";
import type { ApiFieldErrorType, AuditLogWriteContract, PlanSubmitInput, PlanUpdateInput } from "@/backend/types";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

const PRICE_REGEX = /^\d{1,8}(\.\d{1,2})?$/;
const CURRENCY_REGEX = /^[A-Z]{3}$/;

/**
 * The `entity_type` label minted into every plan-catalog audit row.
 */
export const PLAN_AUDIT_ENTITY_TYPE = "plan";

/**
 * Composes the audit-log write contract for a plan create / update /
 * status transition. The `details` payload carries plan field names and
 * primitive values only (title, counts, price, currency, flags) — never
 * contact-PII or credentials. The composed row is persisted by
 * `AuditService.createAuditLog` inside the caller's transaction so it can
 * never outlive a rolled-back mutation.
 */
export function buildPlanAuditContract(
  actorId: number,
  actionType: AuditActionType,
  entityId: number,
  details: Record<string, unknown>
): AuditLogWriteContract {
  return {
    actorId,
    actionType,
    entityType: PLAN_AUDIT_ENTITY_TYPE,
    entityId,
    details: JSON.stringify(details),
  };
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

  const updatePatch: PlanUpdateInput = {
    ...(titleResult.value !== undefined && { title: titleResult.value }),
    ...(sessionResult.value !== undefined && { sessionCount: sessionResult.value }),
    ...(priceResult.value !== undefined && { price: priceResult.value }),
    ...(currencyResult.value !== undefined && { currency: currencyResult.value }),
    ...(intervalResult.value !== undefined && { intervalDays: intervalResult.value }),
  };

  return { updatePatch, fields };
}
