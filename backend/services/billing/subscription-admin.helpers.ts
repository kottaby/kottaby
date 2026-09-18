/**
 * SubscriptionAdmin helpers — audit-contract composition, strict id
 * coercion, write-error translation, and the canonical row mapping for
 * the subscription-admin service (mirroring the plan-catalog helpers
 * split: the service namespace stays focused on orchestration).
 *
 * Runtime only — no types are declared here; every shape lives in
 * `backend/types/billing/subscription-admin.types.ts` and is imported
 * through `@/backend/types`.
 *
 * Disciplines enforced here:
 *  - Audit contract: `details` carries ids, integers, and ISO date
 *    strings only — never contact-PII, never credentials, never free
 *    text. The composed row is persisted by `AuditService.createAuditLog`
 *    inside the caller's transaction so it can never outlive a
 *    rolled-back mutation.
 *  - Id coercion: STRICT numeric parsing (never `Number.parseInt`), so a
 *    malformed id can never silently address an unrelated row.
 *  - Row mapping: the raw `$inferSelect` projection carries pg-enum
 *    string unions; the ReturnType's enum contract is applied through a
 *    total, fail-closed lookup over each closed vocabulary — never a
 *    cast, never a silent degrade.
 */

import type { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { ConflictError, isPgUniqueViolation, NotFoundError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type { AuditLogWriteContract, SubscriptionReturnType, SubscriptionSelectType } from "@/backend/types";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

/**
 * The `entity_type` label minted into every subscription-admin audit row.
 */
export const SUBSCRIPTION_AUDIT_ENTITY_TYPE = "subscription";

/**
 * Composes the audit-log write contract for a subscription lifecycle
 * mutation. The `details` payload carries ids, integers, and ISO date
 * strings only (window bounds, day counts) — never contact-PII or
 * credentials.
 */
export function buildSubscriptionAuditContract(
  actorId: number,
  actionType: AuditActionType,
  entityId: number,
  details: Record<string, unknown>
): AuditLogWriteContract {
  return {
    actorId,
    actionType,
    entityType: SUBSCRIPTION_AUDIT_ENTITY_TYPE,
    entityId,
    details: JSON.stringify(details),
  };
}

/**
 * Coerces a wire `ID` into a subscription id using STRICT numeric
 * parsing (mirrors the plan-catalog id coercion). Unlike
 * `Number.parseInt`, `Number()` rejects trailing garbage (`"12abc"` →
 * NaN) so a malformed id can never silently address an unrelated row;
 * any non-integer / non-positive result maps onto the canonical
 * `SUBSCRIPTION_NOT_FOUND` domain error.
 */
export function coerceSubscriptionId(rawId: string | number, tErrors: ErrorsLabels): number {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    logger.logDomainError("Subscription id failed strict numeric coercion", {
      code: "SUBSCRIPTION_NOT_FOUND",
      entity: "subscriptions",
    });
    throw new NotFoundError("SUBSCRIPTION", tErrors.notFound);
  }
  return id;
}

/**
 * Maps PostgreSQL violations from subscription-admin writes onto their
 * canonical domain errors: uniqueness conflicts (the shared, cycle-safe
 * `23505` walker) become the localized `ConflictError`. Any other
 * failure is returned untouched so the caller rethrows it verbatim.
 */
export function toSubscriptionAdminDomainError(error: unknown, tErrors: ErrorsLabels): unknown {
  if (isPgUniqueViolation(error)) {
    return new ConflictError(tErrors.conflict, { cause: error });
  }
  return error;
}

/**
 * The closed vocabularies as enum-member arrays: the stored row's
 * status/payment columns are raw pg-enum string unions, so the mappers
 * resolve the member by the enum objects' own values — the vocabulary
 * flows from the enums, never from bare literals (the documented
 * widening-cast lookup idiom).
 */
const SUBSCRIPTION_STATUS_MEMBERS = Object.values(SubscriptionStatus);
const PAYMENT_GATEWAY_MEMBERS = Object.values(PaymentGateway);

/**
 * Fail-closed abort for a stored value outside a closed vocabulary — an
 * internal invariant breach (the DB pgEnum constrains every writable
 * value), never a caller-input matter. ONE correlated diagnostic log,
 * then the localized conflict copy; the caller's transaction rolls back.
 */
function abortRowMapping(detail: string, context: Record<string, unknown>, tErrors: ErrorsLabels): never {
  logger.error(`Subscription admin row mapping aborted: ${detail}`, context);
  throw new ConflictError(tErrors.conflict);
}

function subscriptionStatusMemberOf(
  status: SubscriptionSelectType["status"],
  tErrors: ErrorsLabels
): SubscriptionStatus {
  const member = SUBSCRIPTION_STATUS_MEMBERS.find(value => (value as string) === status);
  if (member === undefined) {
    abortRowMapping(
      "stored subscription status is not a member of the closed status vocabulary",
      { storedStatus: status },
      tErrors
    );
  }
  return member;
}

function paymentGatewayMemberOf(
  gateway: SubscriptionSelectType["paymentMethod"] & string,
  tErrors: ErrorsLabels
): PaymentGateway {
  const member = PAYMENT_GATEWAY_MEMBERS.find(value => (value as string) === gateway);
  if (member === undefined) {
    abortRowMapping(
      "stored payment gateway is not a member of the closed gateway vocabulary",
      { storedGateway: gateway },
      tErrors
    );
  }
  return member;
}

/**
 * Projects one stored subscription row onto the strongly-typed
 * ReturnType (`SubscriptionReturnType` re-types the status/payment
 * columns to their canonical TS enums — the mapping makes that enum
 * contract explicit, never a cast).
 */
export function toSubscriptionAdminReturnType(
  row: SubscriptionSelectType,
  tErrors: ErrorsLabels
): SubscriptionReturnType {
  return {
    ...row,
    status: subscriptionStatusMemberOf(row.status, tErrors),
    paymentMethod: row.paymentMethod === null ? null : paymentGatewayMemberOf(row.paymentMethod, tErrors),
  };
}
