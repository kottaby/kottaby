/**
 * PlanCatalogService — domain service for plan catalog management.
 *
 * Implements business rules, validation, and concurrency-guarded transitions
 * for subscription plans. Field-level input validation lives in the sibling
 * `plan-catalog.helpers.ts` module.
 *
 * Forward-only lifecycle guarantee:
 * Deactivating or modifying a plan does NOT cascade to subscriptions, balances,
 * invoices, or payments. This file contains ZERO imports of student or subscription tables.
 */

import { PlanRepository } from "@/backend/db/repo/billing/plan.repository";
import { DomainError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import {
  toPlanWriteDomainError,
  validateAndExtractPlanPatch,
  validatePlanInput,
} from "@/backend/services/billing/plan-catalog.helpers";
import type {
  DBTransaction,
  PlanInsertType,
  PlanListForAdminOptions,
  PlanReturnType,
  PlanSubmitInput,
  PlanUpdateInput,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

export namespace PlanCatalogService {
  /**
   * Coerces a GraphQL `ID` argument into a plan id using STRICT numeric
   * parsing. Unlike `Number.parseInt`, `Number()` rejects trailing
   * garbage (`"12abc"` -> NaN) so a malformed id can never silently address an
   * unrelated plan row; any non-integer / non-positive result maps onto the
   * canonical `PLAN_NOT_FOUND` domain error.
   */
  export function coercePlanId(rawId: string | number, locale?: string): number {
    const tErrors = getServerTranslations(locale ?? "en").errorsTranslations;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) {
      logger.logDomainError("Plan id failed strict numeric coercion", {
        code: "PLAN_NOT_FOUND",
        entity: "plans",
      });
      throw new NotFoundError("PLAN", tErrors.planCatalog.planNotFound);
    }
    return id;
  }

  /**
   * Creates a new subscription plan in the catalog.
   */
  export async function createPlan(
    input: PlanSubmitInput,
    locale?: string,
    tx?: DBTransaction
  ): Promise<PlanReturnType> {
    const tErrors = getServerTranslations(locale ?? "en").errorsTranslations;
    validatePlanInput(input, tErrors);

    const insert: PlanInsertType = {
      title: input.title.trim(),
      sessionCount: input.sessionCount,
      price: input.price.trim(),
      currency: input.currency.trim().toUpperCase(),
      intervalDays: input.intervalDays,
      balanceLane: input.balanceLane ?? null,
    };

    try {
      const created = await PlanRepository.insertPlan(insert, tx);
      // DEV3-020 audit hook seam
      logger.info("Plan created successfully", { planId: created.id });
      return created;
    } catch (error: unknown) {
      throw toPlanWriteDomainError(error, tErrors);
    }
  }

  /**
   * Updates mutable fields on an existing plan record.
   */
  export async function updatePlan(
    id: number,
    patch: PlanUpdateInput,
    locale?: string,
    tx?: DBTransaction
  ): Promise<PlanReturnType> {
    const tErrors = getServerTranslations(locale ?? "en").errorsTranslations;

    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
      throw new ValidationError(tErrors.badRequest);
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError(tErrors.planCatalog.planPatchEmpty);
    }

    const { updatePatch, fields } = validateAndExtractPlanPatch(patch, tErrors);

    if (fields.length > 0) {
      throw new ValidationError(tErrors.validation, fields);
    }

    try {
      const updated = await PlanRepository.updatePlanFields(id, updatePatch, tx);
      if (!updated) {
        logger.logDomainError("Plan not found during update", {
          code: "PLAN_NOT_FOUND",
          entity: "plans",
          entityId: id,
        });
        throw new NotFoundError("PLAN", tErrors.planCatalog.planNotFound);
      }

      // DEV3-020 audit hook seam
      logger.info("Plan updated successfully", { planId: id });
      return updated;
    } catch (error: unknown) {
      throw toPlanWriteDomainError(error, tErrors);
    }
  }

  /**
   * Activates or deactivates a plan with atomic concurrency guards.
   */
  export async function setPlanActiveStatus(
    id: number,
    isActive: boolean,
    locale?: string,
    tx?: DBTransaction
  ): Promise<PlanReturnType> {
    const tErrors = getServerTranslations(locale ?? "en").errorsTranslations;

    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
      throw new ValidationError(tErrors.badRequest);
    }

    const updated = await PlanRepository.setActiveStatusOnce(id, isActive, tx);
    if (updated) {
      // DEV3-020 audit hook seam
      logger.info("Plan active status changed", { planId: id, isActive });
      return updated;
    }

    // Disambiguate why guarded update returned null
    const exists = await PlanRepository.existsById(id, tx);
    if (!exists) {
      logger.logDomainError("Plan not found during status change", {
        code: "PLAN_NOT_FOUND",
        entity: "plans",
        entityId: id,
      });
      throw new NotFoundError("PLAN", tErrors.planCatalog.planNotFound);
    }

    const code = isActive ? "PLAN_ALREADY_ACTIVE" : "PLAN_ALREADY_INACTIVE";
    const message = isActive ? tErrors.planCatalog.planAlreadyActive : tErrors.planCatalog.planAlreadyInactive;

    logger.logDomainError("Plan already in target active status", {
      code,
      entity: "plans",
      entityId: id,
    });
    throw new DomainError(code, message);
  }

  /**
   * Lists active plans for student catalog browsing.
   */
  export async function listActiveCatalog(_locale?: string, tx?: DBTransaction): Promise<PlanReturnType[]> {
    return PlanRepository.listActive(tx);
  }

  /**
   * Lists plans for admin management.
   */
  export async function listForAdmin(
    options: PlanListForAdminOptions = {},
    _locale?: string,
    tx?: DBTransaction
  ): Promise<PlanReturnType[]> {
    return options.includeInactive ? PlanRepository.listAll(tx) : PlanRepository.listActive(tx);
  }

  /**
   * Finds a plan by ID.
   */
  export async function findById(id: number, locale?: string, tx?: DBTransaction): Promise<PlanReturnType> {
    const tErrors = getServerTranslations(locale ?? "en").errorsTranslations;

    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
      throw new ValidationError(tErrors.badRequest);
    }

    const plan = await PlanRepository.findById(id, tx);
    if (!plan) {
      logger.logDomainError("Plan not found", {
        code: "PLAN_NOT_FOUND",
        entity: "plans",
        entityId: id,
      });
      throw new NotFoundError("PLAN", tErrors.planCatalog.planNotFound);
    }
    return plan;
  }
}
